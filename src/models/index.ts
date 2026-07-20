export const EQUIPMENT_SLOTS = [
  "weapon", "offhand", "helmet", "bodyArmour", "gloves", "boots",
  "amulet", "ring1", "ring2", "belt",
] as const;

export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];
export type RingSlot = Extract<EquipmentSlot, "ring1" | "ring2">;
export type OptimizationGoal = "dps" | "survivability" | "balanced";
export type CurrencyUnit = "chaos" | "divine" | "mirror";
export type DpsMetric = "FullDPS" | "CombinedDPS" | "MinionCombinedDPS" | "TotalDPS";

export interface CurrencyAmount { amount: number; currency: CurrencyUnit }
export interface ItemModifier { label: string; value: number; metric?: keyof BuildMetrics }
export type ItemRarity = "normal" | "magic" | "rare" | "unique";
export interface Item { id: string; name: string; baseType: string; itemClass?: string; rarity: ItemRarity; modifiers: ItemModifier[]; rawText?: string; imageUrl?: string }
export interface TradeItem extends Item {
  slot: EquipmentSlot;
  price: CurrencyAmount;
  tradeUrl?: string;
}
export type Equipment = Record<EquipmentSlot, Item>;
export interface Character { name: string; className: string; ascendancy: string; level: number; mainSkill: string; league: string }
export interface BuildMetrics {
  totalDps: number; effectiveHitPool: number; physicalMaxHit: number; elementalMaxHit: number;
  chaosMaxHit: number; life: number; energyShield: number; armour: number; evasion: number;
  spellSuppression: number; fireResistance: number; coldResistance: number;
  lightningResistance: number; chaosResistance: number;
}
export interface KalandrasTouchSetup { touchSlot: RingSlot; sourceSlot: RingSlot }
export interface SkillGem { name: string; level: number; quality: number; isSupport: boolean; enabled: boolean }
export interface SkillGroup { id: string; label: string; slot?: string; isMain: boolean; gems: SkillGem[] }
export interface Build {
  id: string;
  character: Character;
  equipment: Equipment;
  flasks?: Item[];
  metrics: BuildMetrics;
  sourceXml?: string;
  dpsMetric?: DpsMetric;
  kalandrasTouch?: KalandrasTouchSetup;
  skillGroups?: SkillGroup[];
}
export type CalculationVerification = "estimated" | "pob";
export type CandidateVerdict = "upgrade" | "downgrade" | "mixed" | "unchanged";
export interface SimulationResult {
  slot: EquipmentSlot;
  item: TradeItem;
  metrics: BuildMetrics;
  changes: BuildMetrics;
  verification: CalculationVerification;
}
export interface UpgradeRecommendation extends SimulationResult { currentItem: Item; priceInChaos: number; score: number; explanation: string }
export interface CandidateEvaluation extends SimulationResult {
  currentItem: Item;
  priceInChaos: number;
  score: number;
  verdict: CandidateVerdict;
  qualified: boolean;
  rejectionReasons: string[];
}
export interface UpgradeCombination { recommendations: UpgradeRecommendation[]; priceInChaos: number; score: number; changes: BuildMetrics; explanation: string }
export interface OptimizationRequest {
  build: Build;
  budget: CurrencyAmount;
  goal: OptimizationGoal;
  allowedSlots: EquipmentSlot[];
  league: string;
  requireVerified?: boolean;
}
export interface OptimizationResult {
  recommendations: UpgradeRecommendation[];
  candidateEvaluations: CandidateEvaluation[];
  combinations: UpgradeCombination[];
  budgetInChaos: number;
  baselineMetrics: BuildMetrics;
  verification: CalculationVerification;
  engineVersion?: string;
  dpsMetric?: DpsMetric;
  evaluatedCandidates: number;
}
export interface PoeLeague { id: string; name: string; realm: "pc"; startAt: string | null; endAt: string | null }
export interface LeagueResponse { leagues: PoeLeague[]; currentLeague: string; updatedAt: string; source: "official" | "fallback" }
