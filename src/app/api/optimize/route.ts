import { NextResponse } from "next/server";
import { CurrencyAmount, EQUIPMENT_SLOTS, EquipmentSlot, OptimizationGoal } from "@/models";
import { UpgradeOptimizer } from "@/services/optimizer/upgrade-optimizer";
import { ExactPobCalculationService, PobEngineError } from "@/services/pob/exact-pob-calculation-service";
import { parsePobXml } from "@/services/pob/pob-build-parser";
import { LiveTradeError, LiveTradeMarketService } from "@/services/trade/live-trade-market-service";

export const maxDuration = 120;

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

  if (!buildXml.includes("<PathOfBuilding") || buildXml.length > 3 * 1024 * 1024) throw new PobEngineError("Re-import a valid Path of Building export before optimizing.", 400);
  if (!leagueNamePattern.test(league)) throw new PobEngineError("Select a valid Path of Exile league.", 400);
  if (!goals.has(goal)) throw new PobEngineError("Select a valid optimization goal.", 400);
  if (!budget || !Number.isFinite(budget.amount) || Number(budget.amount) <= 0 || Number(budget.amount) > 1_000_000 || !["chaos", "divine"].includes(String(budget.currency))) {
    throw new PobEngineError("Enter a valid chaos or divine budget.", 400);
  }
  if (!allowedSlots.length || allowedSlots.some((slot) => typeof slot !== "string" || !slots.has(slot as EquipmentSlot))) {
    throw new PobEngineError("Select at least one valid equipment slot.", 400);
  }

  let build: ReturnType<typeof parsePobXml>;
  try {
    build = parsePobXml(buildXml);
  } catch {
    throw new PobEngineError("The supplied Path of Building XML could not be parsed. Re-import the build and try again.", 400);
  }

  return {
    build,
    budget: { amount: Number(budget.amount), currency: budget.currency as CurrencyAmount["currency"] },
    goal,
    allowedSlots: allowedSlots as EquipmentSlot[],
    league,
  };
}

export async function POST(request: Request) {
  try {
    const input = optimizationInput(await request.json());
    const itemsPerSlot = Math.max(1, Math.min(5, Math.floor(20 / input.allowedSlots.length)));
    const optimizer = new UpgradeOptimizer(
      new ExactPobCalculationService(),
      new LiveTradeMarketService(process.env.POE_USER_AGENT, itemsPerSlot),
    );
    const result = await optimizer.optimize({ ...input, requireVerified: true });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PobEngineError || error instanceof LiveTradeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "The optimizer could not complete the live Path of Building evaluation." }, { status: 500 });
  }
}
