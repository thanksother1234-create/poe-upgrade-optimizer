import { NextResponse } from "next/server";
import { CurrencyAmount, EQUIPMENT_SLOTS, EquipmentSlot, OptimizationGoal } from "@/models";
import { UpgradeOptimizer } from "@/services/optimizer/upgrade-optimizer";
import { ExactPobCalculationService, PobEngineError } from "@/services/pob/exact-pob-calculation-service";
import { parsePobXml } from "@/services/pob/pob-build-parser";
import { createDurableOptimizationPayload, OptimizationJobService, validOptimizationClientId } from "@/services/queue/optimization-job-service";
import { isManualCandidateCompatible, ManualTradeMarketService, parseCopiedTradeItem } from "@/services/trade/manual-trade-market-service";

export const maxDuration = 300;

const leagueNamePattern = /^[A-Za-z0-9][A-Za-z0-9 '()-]{0,79}$/;
const goals = new Set<OptimizationGoal>(["dps", "survivability", "balanced"]);
const slots = new Set<EquipmentSlot>(EQUIPMENT_SLOTS);

function optimizationInput(value: unknown) {
  if (!value || typeof value !== "object") throw new PobEngineError("Optimization request is required.", 400);
  const body = value as Record<string, unknown>;
  const buildXml = typeof body.buildXml === "string" ? body.buildXml : "";
  const league = typeof body.league === "string" ? body.league.trim() : "";
  const goal = body.goal as OptimizationGoal;
  const budget = body.budget as Partial<CurrencyAmount> | undefined;
  const allowedSlots = Array.isArray(body.allowedSlots) ? [...new Set(body.allowedSlots)] : [];
  const candidateInputs = Array.isArray(body.candidates) ? body.candidates : [];

  if (!buildXml.includes("<PathOfBuilding") || buildXml.length > 3 * 1024 * 1024) throw new PobEngineError("Re-import a valid Path of Building export before optimizing.", 400);
  if (!leagueNamePattern.test(league)) throw new PobEngineError("Select a valid Path of Exile league.", 400);
  if (!goals.has(goal)) throw new PobEngineError("Select a valid optimization goal.", 400);
  if (!budget || !Number.isFinite(budget.amount) || Number(budget.amount) <= 0 || Number(budget.amount) > 1_000_000 || !["chaos", "divine"].includes(String(budget.currency))) {
    throw new PobEngineError("Enter a valid chaos or divine budget.", 400);
  }
  if (!allowedSlots.length || allowedSlots.some((slot) => typeof slot !== "string" || !slots.has(slot as EquipmentSlot))) {
    throw new PobEngineError("Select at least one valid equipment slot.", 400);
  }
  if (!candidateInputs.length || candidateInputs.length > 20) throw new PobEngineError("Paste between 1 and 20 trade candidates before running the optimizer.", 400);

  let build: ReturnType<typeof parsePobXml>;
  try {
    build = parsePobXml(buildXml);
  } catch {
    throw new PobEngineError("The supplied Path of Building XML could not be parsed. Re-import the build and try again.", 400);
  }

  const candidates = candidateInputs.map((value, index) => {
    if (!value || typeof value !== "object") throw new PobEngineError(`Candidate ${index + 1} is invalid.`, 400);
    const candidate = value as Record<string, unknown>;
    const slot = candidate.slot as EquipmentSlot;
    const price = candidate.price as Partial<CurrencyAmount> | undefined;
    if (!slots.has(slot) || !allowedSlots.includes(slot)) throw new PobEngineError(`Candidate ${index + 1} uses a slot that is not selected.`, 400);
    if (!price || !Number.isFinite(price.amount) || Number(price.amount) <= 0 || !["chaos", "divine"].includes(String(price.currency))) {
      throw new PobEngineError(`Candidate ${index + 1} needs a valid chaos or divine price.`, 400);
    }
    try {
      const item = parseCopiedTradeItem({
        id: `manual-${index + 1}`,
        slot,
        rawText: typeof candidate.rawText === "string" ? candidate.rawText : "",
        price: { amount: Number(price.amount), currency: price.currency as CurrencyAmount["currency"] },
        league,
      });
      if (!isManualCandidateCompatible(build, item)) throw new Error(`${item.name} is not compatible with ${slot}.`);
      return item;
    } catch (error) {
      throw new PobEngineError(error instanceof Error ? `Candidate ${index + 1}: ${error.message}` : `Candidate ${index + 1} could not be parsed.`, 400);
    }
  });

  return {
    build,
    budget: { amount: Number(budget.amount), currency: budget.currency as CurrencyAmount["currency"] },
    goal,
    allowedSlots: allowedSlots as EquipmentSlot[],
    league,
    candidates,
  };
}

export async function POST(request: Request) {
  let input: ReturnType<typeof optimizationInput>;
  try {
    input = optimizationInput(await request.json());
  } catch (error) {
    if (error instanceof PobEngineError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "The optimizer could not complete the live Path of Building evaluation." }, { status: 500 });
  }

  const jobService = new OptimizationJobService();
  if (jobService.configured) {
    const clientId = request.headers.get("x-poe-client-id");
    if (!validOptimizationClientId(clientId)) {
      return NextResponse.json({ error: "A valid browser queue identity is required. Refresh the page and try again." }, { status: 400 });
    }
    try {
      const payload = createDurableOptimizationPayload(input);
      const { job, reused } = await jobService.enqueue(payload, clientId);
      return NextResponse.json({
        mode: "async",
        reused,
        ...await jobService.publicStatus(job),
      }, {
        status: 202,
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      const status = Number.isInteger((error as { status?: unknown })?.status) ? Number((error as { status: number }).status) : 503;
      return NextResponse.json({
        error: error instanceof Error ? error.message : "The durable optimization queue is unavailable.",
      }, { status });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: object) => controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      try {
        const optimizer = new UpgradeOptimizer(
          new ExactPobCalculationService(undefined, undefined, (queue) => send({ type: "queue", ...queue })),
          new ManualTradeMarketService(input.candidates),
        );
        const result = await optimizer.optimize({ ...input, requireVerified: true });
        send({ type: "result", result });
      } catch (error) {
        send({
          type: "error",
          error: error instanceof Error ? error.message : "The optimizer could not complete the live Path of Building evaluation.",
        });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
