import { Build, BuildMetrics, EquipmentSlot, OptimizationGoal, TradeItem } from "@/models";
import { percentChange } from "@/lib/metrics";
import { SCORE_WEIGHTS } from "@/services/optimizer/upgrade-optimizer";
import { PobCalculationService } from "@/services/pob/pob-calculation-service";
import { WeightedTradeOption } from "@/services/trade/weighted-search-service";
import { currentItemStatValue, getEligibleWeightedStats, resolveWeightPreset, type WeightPreset } from "@/services/trade/weighted-stat-catalog";

export interface PobCalculatedWeightResult {
  slot: EquipmentSlot;
  preset: WeightPreset;
  resolvedPreset: Exclude<WeightPreset, "auto">;
  options: WeightedTradeOption[];
  engineVersion?: string;
}

function defensiveChange(base: BuildMetrics, change: BuildMetrics) {
  return percentChange(base.effectiveHitPool, change.effectiveHitPool) * 0.55
    + percentChange(base.physicalMaxHit, change.physicalMaxHit) * 0.15
    + percentChange(base.elementalMaxHit, change.elementalMaxHit) * 0.15
    + percentChange(base.chaosMaxHit, change.chaosMaxHit) * 0.15;
}

function appendProbe(rawText: string, probeText: string) {
  const lines = rawText.trim().split(/\r?\n/);
  const selectedVariant = lines.findIndex((line) => line.startsWith("Selected Variant:") || line.startsWith("Selected Alt Variant:"));
  lines.splice(selectedVariant >= 0 ? selectedVariant : lines.length, 0, probeText);
  return lines.join("\n");
}

export async function calculatePobWeights(
  build: Build,
  slot: EquipmentSlot,
  goal: OptimizationGoal,
  preset: WeightPreset,
  pob: PobCalculationService,
): Promise<PobCalculatedWeightResult> {
  const currentItem = build.equipment[slot];
  if (!currentItem.rawText) throw new Error(`The equipped ${slot} did not include raw Path of Building item data.`);
  const definitions = getEligibleWeightedStats(build, slot, preset).slice(0, 14);
  if (!definitions.length) throw new Error("No item-class-valid stats are available for this slot and build preset.");

  const probes: TradeItem[] = definitions.map((definition, index) => ({
    ...currentItem,
    id: `weight-probe-${index}-${definition.id}`,
    slot,
    modifiers: [...currentItem.modifiers, { label: definition.probeText, value: definition.probeAmount }],
    price: { amount: 1, currency: "chaos" },
    rawText: appendProbe(currentItem.rawText!, definition.probeText),
  }));
  const batch = await pob.simulateItemReplacements(build, probes);
  const measured = definitions.map((definition, index) => {
    const simulation = batch.simulations[index];
    if (!simulation) throw new Error(`Path of Building skipped the ${definition.label} stat probe.`);
    const dpsChange = percentChange(batch.baseline.totalDps, simulation.changes.totalDps);
    const defenseChange = defensiveChange(batch.baseline, simulation.changes);
    const goalImpact = dpsChange * SCORE_WEIGHTS[goal].offense + defenseChange * SCORE_WEIGHTS[goal].defense;
    return { definition, dpsChange, defenseChange, sensitivity: goalImpact / definition.probeAmount };
  });
  const meaningful = measured.filter((measurement) => Math.abs(measurement.sensitivity) > 1e-8);
  if (!meaningful.length) throw new Error("Path of Building reported no measurable effect from the supported stat probes. Try another preset or verify the active skill and configuration in PoB.");
  const largestSensitivity = Math.max(...meaningful.map((measurement) => Math.abs(measurement.sensitivity)));
  const scale = 10 / largestSensitivity;
  const options = meaningful.map(({ definition, dpsChange, defenseChange, sensitivity }) => ({
    id: definition.id,
    label: definition.label,
    weight: Number((sensitivity * scale).toFixed(5)),
    reason: `PoB measured ${dpsChange >= 0 ? "+" : ""}${dpsChange.toFixed(2)}% DPS and ${defenseChange >= 0 ? "+" : ""}${defenseChange.toFixed(2)}% weighted defense from a ${definition.probeAmount}-point test.`,
    source: "pob" as const,
    currentValue: currentItemStatValue(currentItem, definition),
    dpsChange,
    defensiveChange: defenseChange,
  })).sort((left, right) => right.weight - left.weight).slice(0, 10);

  return {
    slot,
    preset,
    resolvedPreset: resolveWeightPreset(build, preset),
    options,
    engineVersion: batch.engineVersion,
  };
}
