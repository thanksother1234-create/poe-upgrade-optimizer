import { Build, BuildMetrics, CalculationVerification, DpsMetric, EquipmentSlot, SimulationResult, TradeItem } from "@/models";
import { decodePobCode, parsePobXml } from "@/services/pob/pob-build-parser";
import { applyMetricChanges, estimateItemReplacement } from "@/services/pob/item-effect-estimator";

export interface PobCalculationService {
  importBuild(pobCode: string): Promise<Build>;
  calculateBuild(build: Build): Promise<BuildMetrics>;
  simulateItemReplacement(build: Build, slot: EquipmentSlot, item: TradeItem): Promise<SimulationResult>;
  simulateItemReplacements(build: Build, items: TradeItem[]): Promise<PobBatchSimulationResult>;
}
export interface PobBatchSimulationResult {
  baseline: BuildMetrics;
  simulations: SimulationResult[];
  verification: CalculationVerification;
  engineVersion?: string;
  dpsMetric?: DpsMetric;
}
async function resolvePobInput(input: string): Promise<string> {
  const trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  const response = await fetch("/api/pob", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: trimmed }) });
  const payload = await response.json() as { code?: string; error?: string };
  if (!response.ok || !payload.code) throw new Error(payload.error ?? "Unable to retrieve that PoB link.");
  return payload.code;
}

export class MvpPobCalculationService implements PobCalculationService {
  async importBuild(pobCode: string): Promise<Build> {
    if (!pobCode.trim()) throw new Error("Enter a PoB code or link to import your build.");
    const code = await resolvePobInput(pobCode);
    return parsePobXml(await decodePobCode(code));
  }
  async calculateBuild(build: Build) { return structuredClone(build.metrics); }
  async simulateItemReplacement(build: Build, slot: EquipmentSlot, item: TradeItem): Promise<SimulationResult> {
    const changes = estimateItemReplacement(build, slot, item);
    const metrics = applyMetricChanges(build.metrics, changes);
    return { slot, item, metrics, changes, verification: "estimated" };
  }
  async simulateItemReplacements(build: Build, items: TradeItem[]): Promise<PobBatchSimulationResult> {
    return {
      baseline: structuredClone(build.metrics),
      simulations: await Promise.all(items.map((item) => this.simulateItemReplacement(build, item.slot, item))),
      verification: "estimated",
    };
  }
}

/** @deprecated Use MvpPobCalculationService. Kept as a compatibility alias. */
export class MockPobCalculationService extends MvpPobCalculationService {}
