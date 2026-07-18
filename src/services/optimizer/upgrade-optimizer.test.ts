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
  it("survivability mode favors defensive improvements", async () => { const result = await run("survivability"); expect(result.recommendations[0].item.id).toBe("b1"); });
  it("balanced mode weighs offense and defense", async () => { const result = await run("balanced"); const top = result.recommendations[0]; expect(top.changes.totalDps).toBeGreaterThan(0); expect(top.changes.effectiveHitPool).toBeGreaterThan(0); });
  it("ranks an expensive poor-value item below a cheaper strong-value item", async () => { const result = await run("dps"); const cheap = result.recommendations.findIndex((r) => r.item.id === "w2"); const expensive = result.recommendations.findIndex((r) => r.item.id === "w3"); expect(cheap).toBeGreaterThanOrEqual(0); expect(expensive).toBeGreaterThan(cheap); });
});
