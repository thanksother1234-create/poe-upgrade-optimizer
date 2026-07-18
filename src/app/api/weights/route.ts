import { NextResponse } from "next/server";
import { EQUIPMENT_SLOTS, EquipmentSlot, OptimizationGoal } from "@/models";
import { ExactPobCalculationService, PobEngineError } from "@/services/pob/exact-pob-calculation-service";
import { parsePobXml } from "@/services/pob/pob-build-parser";
import { calculatePobWeights } from "@/services/pob/pob-weight-calculation-service";
import { WEIGHT_PRESETS, type WeightPreset } from "@/services/trade/weighted-stat-catalog";

export const maxDuration = 120;

const slots = new Set<EquipmentSlot>(EQUIPMENT_SLOTS);
const goals = new Set<OptimizationGoal>(["dps", "balanced", "survivability"]);
const presets = new Set<WeightPreset>(WEIGHT_PRESETS.map((preset) => preset.id));

function weightInput(value: unknown) {
  if (!value || typeof value !== "object") throw new PobEngineError("A weight calculation request is required.", 400);
  const body = value as Record<string, unknown>;
  const buildXml = typeof body.buildXml === "string" ? body.buildXml : "";
  const slot = body.slot as EquipmentSlot;
  const goal = body.goal as OptimizationGoal;
  const preset = body.preset as WeightPreset;
  if (!buildXml.includes("<PathOfBuilding") || buildXml.length > 3 * 1024 * 1024) throw new PobEngineError("Re-import a valid Path of Building export before calculating weights.", 400);
  if (!slots.has(slot)) throw new PobEngineError("Select a valid equipment slot.", 400);
  if (!goals.has(goal)) throw new PobEngineError("Select a valid optimization goal.", 400);
  if (!presets.has(preset)) throw new PobEngineError("Select a valid build archetype.", 400);
  try {
    return { build: parsePobXml(buildXml), slot, goal, preset };
  } catch {
    throw new PobEngineError("The supplied Path of Building XML could not be parsed. Re-import the build and try again.", 400);
  }
}

export async function POST(request: Request) {
  try {
    const input = weightInput(await request.json());
    const result = await calculatePobWeights(input.build, input.slot, input.goal, input.preset, new ExactPobCalculationService());
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PobEngineError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Path of Building could not calculate these weights." }, { status: 500 });
  }
}
