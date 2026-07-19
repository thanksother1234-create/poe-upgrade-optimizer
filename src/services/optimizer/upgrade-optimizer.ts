import { BuildMetrics, CandidateEvaluation, CandidateVerdict, OptimizationGoal, OptimizationRequest, OptimizationResult, UpgradeCombination, UpgradeRecommendation } from "@/models";
import { metricKeys, percentChange, subtractMetrics, toChaos, zeroMetrics } from "@/lib/metrics";
import { PobCalculationService } from "@/services/pob/pob-calculation-service";
import { TradeMarketService } from "@/services/trade/trade-market-service";

export const SCORE_WEIGHTS: Record<OptimizationGoal, { offense: number; defense: number }> = {
  dps: { offense: 1, defense: 0.08 }, survivability: { offense: 0.08, defense: 1 }, balanced: { offense: 0.55, defense: 0.45 },
};

const MEANINGFUL_PERCENT = 0.005;

export function classifyCandidateVerdict(base: BuildMetrics, change: BuildMetrics): CandidateVerdict {
  const offense = percentChange(base.totalDps, change.totalDps);
  const defense = percentChange(base.effectiveHitPool, change.effectiveHitPool) * 0.55
    + percentChange(base.physicalMaxHit, change.physicalMaxHit) * 0.15
    + percentChange(base.elementalMaxHit, change.elementalMaxHit) * 0.15
    + percentChange(base.chaosMaxHit, change.chaosMaxHit) * 0.15;
  const signals = [offense, defense].filter((value) => Math.abs(value) >= MEANINGFUL_PERCENT);
  if (!signals.length) return "unchanged";
  if (signals.every((value) => value > 0)) return "upgrade";
  if (signals.every((value) => value < 0)) return "downgrade";
  return "mixed";
}

export class UpgradeOptimizer {
  constructor(private pob: PobCalculationService, private trade: TradeMarketService) {}
  private defensiveChange(base: BuildMetrics, change: BuildMetrics) {
    return percentChange(base.effectiveHitPool, change.effectiveHitPool) * 0.55
      + percentChange(base.physicalMaxHit, change.physicalMaxHit) * 0.15
      + percentChange(base.elementalMaxHit, change.elementalMaxHit) * 0.15
      + percentChange(base.chaosMaxHit, change.chaosMaxHit) * 0.15;
  }
  private score(base: BuildMetrics, change: BuildMetrics, goal: OptimizationGoal, price: number) {
    const offense = percentChange(base.totalDps, change.totalDps);
    const defense = this.defensiveChange(base, change);
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
    const finding = notes.length ? notes.join(", and ") : "the applicable stats provide the strongest improvement per unit of budget";
    return r.verification === "pob"
      ? `Path of Building replaced ${r.currentItem.name} and recalculated the build: ${finding}.`
      : `Estimated against ${r.currentItem.name}: ${finding}. Verify the final result in Path of Building.`;
  }
  private rejectionReasons(base: BuildMetrics, change: BuildMetrics, goal: OptimizationGoal, score: number) {
    const dpsPercent = percentChange(base.totalDps, change.totalDps);
    const defense = this.defensiveChange(base, change);
    const reasons: string[] = [];
    const unchanged = metricKeys.every((key) => Math.abs(change[key]) < 1e-9);
    if (unchanged) {
      reasons.push("Path of Building returned identical tracked metrics before and after the replacement. The item may not affect the active skill and configuration, or PoB may not have equipped it in the active item set.");
    }
    if (goal === "dps" && change.totalDps <= 0) {
      reasons.push(`DPS mode requires a gain, but PoB calculated ${dpsPercent.toFixed(2)}% DPS.`);
    }
    if (goal === "survivability" && defense <= 0) {
      reasons.push(`Survivability mode requires a defensive gain, but the weighted defensive change was ${defense.toFixed(2)}%.`);
    }
    if (goal === "balanced") {
      if (change.totalDps < 0) reasons.push(`Balanced mode does not allow a DPS loss; PoB calculated ${dpsPercent.toFixed(2)}% DPS.`);
      if (change.totalDps === 0 && defense <= 0) reasons.push("Neither DPS nor the weighted defensive metrics improved.");
    }
    if (score <= 0 && !unchanged) reasons.push(`The selected goal produced a non-positive score of ${score.toFixed(2)}.`);
    return reasons;
  }
  async optimize(request: OptimizationRequest): Promise<OptimizationResult> {
    const budgetInChaos = toChaos(request.budget);
    const candidates = [];
    for (const slot of request.allowedSlots) {
      candidates.push(...await this.trade.searchUpgrades(request.build, slot, request.budget, request.league));
    }
    const batch = await this.pob.simulateItemReplacements(request.build, candidates);
    const recommendations: UpgradeRecommendation[] = [];
    const candidateEvaluations: CandidateEvaluation[] = [];
    for (const simulation of batch.simulations) {
      const item = simulation.item;
      if (request.requireVerified && simulation.verification !== "pob") continue;
      const changes = subtractMetrics(simulation.metrics, batch.baseline);
      const normalizedSimulation = { ...simulation, changes };
      const priceInChaos = toChaos(await this.trade.estimatePrice(item));
      const score = this.score(batch.baseline, changes, request.goal, priceInChaos);
      const rejectionReasons = this.rejectionReasons(batch.baseline, changes, request.goal, score);
      const partial = { ...normalizedSimulation, currentItem: request.build.equipment[item.slot], priceInChaos, score };
      candidateEvaluations.push({ ...partial, verdict: classifyCandidateVerdict(batch.baseline, changes), qualified: rejectionReasons.length === 0, rejectionReasons });
      if (rejectionReasons.length) continue;
      recommendations.push({ ...partial, explanation: this.explain(batch.baseline, partial) });
    }
    recommendations.sort((a, b) => b.score - a.score);
    const pool = recommendations.slice(0, 8);
    const combinations: UpgradeCombination[] = [];
    for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
      if (pool[i].slot === pool[j].slot) continue;
      const picks = [pool[i], pool[j]]; const priceInChaos = picks.reduce((sum, r) => sum + r.priceInChaos, 0);
      if (priceInChaos > budgetInChaos) continue;
      const changes = zeroMetrics(); metricKeys.forEach((key) => changes[key] = picks.reduce((sum, r) => sum + r.changes[key], 0));
      const score = this.score(batch.baseline, changes, request.goal, priceInChaos);
      combinations.push({ recommendations: picks, priceInChaos, changes, score, explanation: `Together, these upgrades cover ${picks.map((p) => p.slot).join(" + ")} while preserving ${(budgetInChaos - priceInChaos).toFixed(0)} chaos of the budget.` });
    }
    return {
      recommendations,
      candidateEvaluations,
      combinations: batch.verification === "pob" ? [] : combinations.sort((a, b) => b.score - a.score).slice(0, 3),
      budgetInChaos,
      baselineMetrics: batch.baseline,
      verification: batch.verification,
      engineVersion: batch.engineVersion,
      dpsMetric: batch.dpsMetric,
      evaluatedCandidates: batch.simulations.length,
    };
  }
}
