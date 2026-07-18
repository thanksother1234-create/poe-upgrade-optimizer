export const EQUIPMENT_SLOTS = [
  "weapon", "offhand", "helmet", "bodyArmour", "gloves", "boots",
  "amulet", "ring1", "ring2", "belt",
] as const;

export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];
export type OptimizationGoal = "dps" | "survivability" | "balanced";
export type CurrencyUnit = "chaos" | "divine";

export interface CurrencyAmount { amount: number; currency: CurrencyUnit }
export interface ItemModifier { label: string; value: number; metric?: keyof BuildMetrics }
export type ItemRarity = "normal" | "magic" | "rare" | "unique";
export interface Item { id: string; name: string; baseType: string; rarity: ItemRarity; modifiers: ItemModifier[] }
export interface TradeItem extends Item { slot: EquipmentSlot; imageUrl: string; price: CurrencyAmount; metricChanges: Partial<BuildMetrics> }
export type Equipment = Record<EquipmentSlot, Item>;
export interface Character { name: string; className: string; ascendancy: string; level: number; mainSkill: string; league: string }
export interface BuildMetrics {
  totalDps: number; effectiveHitPool: number; physicalMaxHit: number; elementalMaxHit: number;
  chaosMaxHit: number; life: number; energyShield: number; armour: number; evasion: number;
  spellSuppression: number; fireResistance: number; coldResistance: number;
  lightningResistance: number; chaosResistance: number;
}
export interface Build { id: string; character: Character; equipment: Equipment; metrics: BuildMetrics }
export interface SimulationResult { slot: EquipmentSlot; item: TradeItem; metrics: BuildMetrics; changes: BuildMetrics }
export interface UpgradeRecommendation extends SimulationResult { currentItem: Item; priceInChaos: number; score: number; explanation: string }
export interface UpgradeCombination { recommendations: UpgradeRecommendation[]; priceInChaos: number; score: number; changes: BuildMetrics; explanation: string }
export interface OptimizationRequest { build: Build; budget: CurrencyAmount; goal: OptimizationGoal; allowedSlots: EquipmentSlot[]; league: string }
export interface OptimizationResult { recommendations: UpgradeRecommendation[]; combinations: UpgradeCombination[]; budgetInChaos: number }
export interface PoeLeague { id: string; name: string; realm: "pc"; startAt: string | null; endAt: string | null }
export interface LeagueResponse { leagues: PoeLeague[]; currentLeague: string; updatedAt: string; source: "official" | "fallback" }
