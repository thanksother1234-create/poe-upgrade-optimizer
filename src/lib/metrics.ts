import { BuildMetrics, CurrencyAmount } from "@/models";

export const DIVINE_TO_CHAOS = 180;
export const toChaos = (value: CurrencyAmount) => value.currency === "divine" ? value.amount * DIVINE_TO_CHAOS : value.amount;
export const formatNumber = (value: number) => Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
export const formatPrice = (chaos: number) => chaos >= DIVINE_TO_CHAOS ? `${(chaos / DIVINE_TO_CHAOS).toFixed(1)} div` : `${chaos}c`;
export const percentChange = (before: number, delta: number) => before === 0 ? 0 : (delta / before) * 100;
export const metricKeys = Object.keys({
  totalDps: 0, effectiveHitPool: 0, physicalMaxHit: 0, elementalMaxHit: 0, chaosMaxHit: 0,
  life: 0, energyShield: 0, armour: 0, evasion: 0, spellSuppression: 0, fireResistance: 0,
  coldResistance: 0, lightningResistance: 0, chaosResistance: 0,
}) as (keyof BuildMetrics)[];
export const zeroMetrics = (): BuildMetrics => Object.fromEntries(metricKeys.map((key) => [key, 0])) as unknown as BuildMetrics;
