import { BuildMetrics, OptimizationGoal, OptimizationRequest, OptimizationResult, UpgradeCombination, UpgradeRecommendation } from "@/models";
import { metricKeys, percentChange, toChaos, zeroMetrics } from "@/lib/metrics";
import { PobCalculationService } from "@/services/pob/pob-calculation-service";
import { TradeMarketService } from "@/services/trade/trade-market-service";

export const SCORE_WEIGHTS: Record<OptimizationGoal, { offense: number; defense: number }> = {
  dps: { offense: 1, defense: 0.08 }, survivability: { offense: 0.08, defense: 1 }, balanced: { offense: 0.55, defense: 0.45 },
};
export class UpgradeOptimizer {
  constructor(private pob: PobCalculationService, private trade: TradeMarketService) {}
  private score(base: BuildMetrics, change: BuildMetrics, goal: OptimizationGoal, price: number) {
    const offense = percentChange(base.totalDps, change.totalDps);
    const defense = percentChange(base.effectiveHitPool, change.effectiveHitPool) * 0.55 + percentChange(base.physicalMaxHit, change.physicalMaxHit) * 0.15 + percentChange(base.elementalMaxHit, change.elementalMaxHit) * 0.15 + percentChange(base.chaosMaxHit, change.chaosMaxHit) * 0.15;
    const weighted = offense * SCORE_WEIGHTS[goal].offense + defense * SCORE_WEIGHTS[goal].defense;
    return weighted + (weighted / Math.max(price, 40)) * 35;
  }
  private explain(base: BuildMetrics, r: Omit<UpgradeRecommendation, "explanation">) {
    const dps = percentChange(base.totalDps, r.changes.totalDps);
    const ehp = percentChange(base.effectiveHitPool, r.changes.effectiveHitPool);
    const notes = [];
    if (dps > 2) notes.push(`${dps.toFixed(1)}% more damage`);
    if (ehp > 3) notes.push(`${ehp.toFixed(1)}% more effective health`);
    if (r.changes.lightningResistance > 0 && base.lightningResistance < 75) notes.push("helps cap Lightning Resistance");
    if (r.changes.chaosResistance >= 10) notes.push(`adds ${r.changes.chaosResistance}% Chaos Resistance`);
    return `This upgrade ${notes.length ? notes.join(", and ") : "provides the strongest improvement per unit of budget"}.`;
  }
  async optimize(request: OptimizationRequest): Promise<OptimizationResult> {
    const budgetInChaos = toChaos(request.budget);
    const candidates = (await Promise.all(request.allowedSlots.map((slot) => this.trade.searchUpgrades(request.build, slot, request.budget, request.league)))).flat();
    const recommendations: UpgradeRecommendation[] = [];
    for (const item of candidates) {
      const simulation = await this.pob.simulateItemReplacement(request.build, item.slot, item);
      if (simulation.changes.totalDps < 0 || (simulation.changes.totalDps <= 0 && simulation.changes.effectiveHitPool <= 0)) continue;
      const priceInChaos = toChaos(await this.trade.estimatePrice(item));
      const partial = { ...simulation, currentItem: request.build.equipment[item.slot], priceInChaos, score: this.score(request.build.metrics, simulation.changes, request.goal, priceInChaos) };
      recommendations.push({ ...partial, explanation: this.explain(request.build.metrics, partial) });
    }
    recommendations.sort((a, b) => b.score - a.score);
    const pool = recommendations.slice(0, 8);
    const combinations: UpgradeCombination[] = [];
    for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
      if (pool[i].slot === pool[j].slot) continue;
      const picks = [pool[i], pool[j]]; const priceInChaos = picks.reduce((sum, r) => sum + r.priceInChaos, 0);
      if (priceInChaos > budgetInChaos) continue;
      const changes = zeroMetrics(); metricKeys.forEach((key) => changes[key] = picks.reduce((sum, r) => sum + r.changes[key], 0));
      const score = this.score(request.build.metrics, changes, request.goal, priceInChaos);
      combinations.push({ recommendations: picks, priceInChaos, changes, score, explanation: `Together, these upgrades cover ${picks.map((p) => p.slot).join(" + ")} while preserving ${(budgetInChaos - priceInChaos).toFixed(0)} chaos of the budget.` });
    }
    return { recommendations, combinations: combinations.sort((a, b) => b.score - a.score).slice(0, 3), budgetInChaos };
  }
}
