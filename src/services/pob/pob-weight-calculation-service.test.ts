import { describe, expect, it } from "vitest";
import { subtractMetrics, zeroMetrics } from "@/lib/metrics";
import { mockBuild } from "@/mocks/build";
import { PobCalculationService } from "@/services/pob/pob-calculation-service";
import { calculatePobWeights } from "./pob-weight-calculation-service";

describe("PoB-calculated trade weights", () => {
  it("measures stat probes and normalizes useful results into trade weights", async () => {
    const build = structuredClone(mockBuild);
    build.equipment.ring1.itemClass = "Rings";
    build.equipment.ring1.rawText = "Rarity: RARE\nCurrent Ring\nAmethyst Ring\nImplicits: 0\n+50 to Strength";
    const pob: PobCalculationService = {
      importBuild: async () => build,
      calculateBuild: async () => build.metrics,
      simulateItemReplacement: async () => { throw new Error("not used"); },
      simulateItemReplacements: async (_build, items) => {
        const baseline = structuredClone(build.metrics);
        return {
          baseline,
          verification: "pob" as const,
          engineVersion: "test-pob",
          simulations: items.map((item) => {
            const metrics = { ...baseline };
            if (item.rawText?.includes("+10 to Strength")) metrics.totalDps += 124_000;
            if (item.rawText?.includes("+20 to maximum Life")) metrics.effectiveHitPool += 1_000;
            return { slot: item.slot, item, metrics, changes: subtractMetrics(metrics, baseline), verification: "pob" as const };
          }),
        };
      },
    };

    const result = await calculatePobWeights(build, "ring1", "balanced", "strength-stacker", pob);
    const strength = result.options.find((option) => option.id === "pseudo.pseudo_total_strength");
    expect(result.resolvedPreset).toBe("strength-stacker");
    expect(result.engineVersion).toBe("test-pob");
    expect(strength?.weight).toBeGreaterThan(0);
    expect(strength?.currentValue).toBe(50);
    expect(strength?.reason).toContain("PoB measured");
    expect(result.options.every((option) => option.weight !== 0)).toBe(true);
  });

  it("reports when every supported probe has no measurable effect", async () => {
    const build = structuredClone(mockBuild);
    build.equipment.weapon.itemClass = "Wands";
    build.equipment.weapon.rawText = "Rarity: RARE\nCurrent Wand\nImbued Wand\nImplicits: 0";
    const pob: PobCalculationService = {
      importBuild: async () => build,
      calculateBuild: async () => build.metrics,
      simulateItemReplacement: async () => { throw new Error("not used"); },
      simulateItemReplacements: async (_build, items) => ({
        baseline: structuredClone(build.metrics),
        verification: "pob" as const,
        simulations: items.map((item) => ({ slot: item.slot, item, metrics: structuredClone(build.metrics), changes: zeroMetrics(), verification: "pob" as const })),
      }),
    };
    await expect(calculatePobWeights(build, "weapon", "dps", "critical-spell", pob)).rejects.toThrow(/no measurable effect/i);
  });
});
