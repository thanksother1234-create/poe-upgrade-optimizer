import { describe, expect, it } from "vitest";
import { mockBuild } from "@/mocks/build";
import { OptimizationGoal } from "@/models";
import { MockPobCalculationService } from "@/services/pob/pob-calculation-service";
import { MockTradeMarketService } from "@/services/trade/trade-market-service";
import { UpgradeOptimizer } from "./upgrade-optimizer";

const optimizer = new UpgradeOptimizer(new MockPobCalculationService(), new MockTradeMarketService());
const run = (goal: OptimizationGoal, amount = 5) => optimizer.optimize({ build: mockBuild, budget: { amount, currency: "divine" }, goal, allowedSlots: ["weapon", "ring1", "ring2", "boots", "amulet"], league: "Standard" });

describe("UpgradeOptimizer", () => {
  it("never exceeds the total budget", async () => { const result = await run("balanced", 3); expect(result.combinations.every((combo) => combo.priceInChaos <= result.budgetInChaos)).toBe(true); });
  it("never combines multiple items for the same slot", async () => { const result = await run("balanced"); expect(result.combinations.every((combo) => new Set(combo.recommendations.map((r) => r.slot)).size === combo.recommendations.length)).toBe(true); });
  it("DPS mode favors the highest damage improvement", async () => { const result = await run("dps"); expect(result.recommendations[0].item.id).toBe("w1"); });
  it("survivability mode favors defensive improvements", async () => { const result = await run("survivability"); expect(result.recommendations[0].changes.effectiveHitPool).toBeGreaterThan(0); });
  it("balanced mode returns only positive weighted improvements", async () => { const result = await run("balanced"); expect(result.recommendations.length).toBeGreaterThan(0); expect(result.recommendations.every((recommendation) => recommendation.score > 0)).toBe(true); });
  it("retains exact reasons and metrics for candidates that do not qualify", async () => {
    const result = await run("balanced");
    expect(result.candidateEvaluations).toHaveLength(result.evaluatedCandidates);
    const rejected = result.candidateEvaluations.filter((evaluation) => !evaluation.qualified);
    expect(rejected.length).toBeGreaterThan(0);
    expect(rejected.every((evaluation) => evaluation.rejectionReasons.length > 0)).toBe(true);
  });
  it("ranks an expensive poor-value item below a cheaper strong-value item", async () => { const result = await run("dps"); const cheap = result.recommendations.findIndex((r) => r.item.id === "w2"); const expensive = result.recommendations.findIndex((r) => r.item.id === "w3"); expect(cheap).toBeGreaterThanOrEqual(0); expect(expensive).toBeGreaterThan(cheap); });
  it("recommends two-handed swords instead of wands for an imported greatsword build", async () => {
    const build = structuredClone(mockBuild);
    build.character.mainSkill = "Flicker Strike";
    build.equipment.weapon = { ...build.equipment.weapon, name: "Current Greatsword", baseType: "Engraved Greatsword", rarity: "rare", modifiers: [{ label: "60% increased Global Accuracy Rating", value: 60 }] };
    const result = await optimizer.optimize({ build, budget: { amount: 5, currency: "divine" }, goal: "dps", allowedSlots: ["weapon"], league: "Standard" });
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations.every((recommendation) => !recommendation.item.baseType.includes("Wand"))).toBe(true);
  });
  it("does not recommend Gloom Circle over Circle of Anguish for Flicker Strike", async () => {
    const build = structuredClone(mockBuild);
    build.character.mainSkill = "Flicker Strike";
    build.metrics = { ...build.metrics, totalDps: 1_509_421, effectiveHitPool: 19_124, life: 2_936, energyShield: 0, armour: 3_733, evasion: 6_932, fireResistance: 75, coldResistance: 79, lightningResistance: 75, chaosResistance: 33 };
    build.equipment.ring1 = {
      id: "circle-of-anguish", name: "Circle of Anguish", baseType: "Ruby Ring", rarity: "unique",
      modifiers: ["14% increased Cold Damage", "+1 to Maximum Frenzy Charges", "+24 to Strength", "Adds 25 to 28 Fire Damage", "+22% to Fire Resistance", "+51% to Fire Resistance while affected by Herald of Ash", "Herald of Ash has 50% increased Buff Effect"].map((label) => ({ label, value: Number(label.match(/[+-]?\d+/)?.[0] ?? 0) })),
    };
    const result = await optimizer.optimize({ build, budget: { amount: 5, currency: "divine" }, goal: "balanced", allowedSlots: ["ring1"], league: "Standard" });
    expect(result.recommendations.some((recommendation) => recommendation.item.id === "r2")).toBe(false);
  });
});
