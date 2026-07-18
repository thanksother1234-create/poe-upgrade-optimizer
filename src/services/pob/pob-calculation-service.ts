import { Build, BuildMetrics, EquipmentSlot, SimulationResult, TradeItem } from "@/models";
import { metricKeys } from "@/lib/metrics";
import { decodePobCode, parsePobXml } from "@/services/pob/pob-build-parser";

export interface PobCalculationService {
  importBuild(pobCode: string): Promise<Build>;
  calculateBuild(build: Build): Promise<BuildMetrics>;
  simulateItemReplacement(build: Build, slot: EquipmentSlot, item: TradeItem): Promise<SimulationResult>;
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
    const changes = Object.fromEntries(metricKeys.map((key) => [key, item.metricChanges[key] ?? 0])) as unknown as BuildMetrics;
    const metrics = Object.fromEntries(metricKeys.map((key) => [key, build.metrics[key] + changes[key]])) as unknown as BuildMetrics;
    return { slot, item, metrics, changes };
  }
}

/** @deprecated Use MvpPobCalculationService. Kept as a compatibility alias. */
export class MockPobCalculationService extends MvpPobCalculationService {}
