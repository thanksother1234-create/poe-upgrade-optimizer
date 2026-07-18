import { Build, BuildMetrics, EquipmentSlot, Item, TradeItem } from "@/models";
import { metricKeys, zeroMetrics } from "@/lib/metrics";

type SkillKind = "attack" | "spell" | "unknown";

interface ItemEffects {
  offense: number;
  life: number;
  energyShield: number;
  armour: number;
  evasion: number;
  spellSuppression: number;
  fireResistance: number;
  coldResistance: number;
  lightningResistance: number;
  chaosResistance: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const firstNumber = (label: string) => Math.abs(Number(label.match(/[+-]?\d+(?:\.\d+)?/)?.[0] ?? 0));

function skillKind(mainSkill: string): SkillKind {
  const skill = mainSkill.toLowerCase();
  if (/hexblast|fireball|spark|arc|brand|spell|nova|cremation|detonate|essence drain|contagion|vortex|freezing pulse/.test(skill)) return "spell";
  if (/flicker strike|kinetic blast|strike|slam|cyclone|cleave|shot|arrow|lacerate|spectral throw|venom gyre|frenzy/.test(skill)) return "attack";
  return "unknown";
}

function addedDamageScore(label: string, kind: SkillKind) {
  const match = label.match(/adds\s+(\d+(?:\.\d+)?)\s+to\s+(\d+(?:\.\d+)?)/i);
  if (!match) return 0;
  const lower = label.toLowerCase();
  const spellOnly = lower.includes("to spells") && !lower.includes("attacks");
  const attackOnly = lower.includes("to attacks") && !lower.includes("spells");
  if ((spellOnly && kind === "attack") || (attackOnly && kind === "spell")) return 0;
  if (!spellOnly && !attackOnly && kind === "spell") return 0;
  return ((Number(match[1]) + Number(match[2])) / 2) * 0.12;
}

function offensiveEffect(item: Item, build: Build, slot: EquipmentSlot) {
  const kind = skillKind(build.character.mainSkill);
  let score = 0;

  for (const modifier of item.modifiers) {
    const label = modifier.label;
    const lower = label.toLowerCase();
    const value = firstNumber(label);

    if (lower.includes("treats enemy monster elemental resistance values as inverted")) score += 110;
    else if (lower.includes("hits can't be evaded")) score += kind === "spell" ? 0 : 15;
    else if (lower.includes("tailwind")) score += 10;
    else if (lower.includes("maximum frenzy charge")) score += kind === "attack" ? (build.character.mainSkill.toLowerCase().includes("flicker") ? 28 : 12) * value : 4 * value;
    else if (lower.includes("maximum power charge")) score += kind === "spell" ? 12 * value : 6 * value;
    else if (lower.includes("herald of ash has") && lower.includes("increased buff effect")) score += value * 0.2;
    else if (lower.includes("global critical strike multiplier")) score += value * 0.45;
    else if (lower.includes("level of all") && lower.includes("spell skill gems")) score += kind === "spell" ? value * 18 : 0;
    else if (lower.includes("increased attack speed")) score += kind === "spell" ? 0 : value * 1.1;
    else if (lower.includes("increased cast speed")) score += kind === "spell" ? value * 1.1 : 0;
    else if (lower.includes("increased spell damage")) score += kind === "spell" ? value : 0;
    else if (lower.includes("damage with attack skills") || lower.includes("increased attack damage")) score += kind === "spell" ? 0 : value;
    else if (lower.includes("chaos damage over time multiplier")) score += /damage over time|essence drain|contagion/.test(build.character.mainSkill.toLowerCase()) ? value : 0;
    else if (/increased (?:elemental|fire|cold|lightning|chaos) damage/.test(lower)) score += value;
    else if (lower.includes("increased physical damage")) score += kind === "spell" ? 0 : value;
    else if (/\bincreased damage\b/.test(lower)) score += value;
    else if (lower.includes("increased global accuracy rating")) score += kind === "attack" ? value * 0.05 : 0;

    score += addedDamageScore(label, kind);
  }

  // Local weapon modifiers have a larger impact than the same wording on jewellery.
  return slot === "weapon" && kind === "attack" ? score * 1.05 : score;
}

function defensiveEffects(item: Item): Omit<ItemEffects, "offense"> {
  const effects: Omit<ItemEffects, "offense"> = {
    life: 0, energyShield: 0, armour: 0, evasion: 0, spellSuppression: 0,
    fireResistance: 0, coldResistance: 0, lightningResistance: 0, chaosResistance: 0,
  };
  for (const modifier of item.modifiers) {
    const lower = modifier.label.toLowerCase();
    const value = firstNumber(modifier.label);

    if (lower.includes("to maximum life")) effects.life += value;
    if (lower.includes("to maximum energy shield")) effects.energyShield += value;
    if (/to (?:armour|evasion rating)/.test(lower)) {
      if (lower.includes("armour")) effects.armour += value;
      if (lower.includes("evasion")) effects.evasion += value;
    }
    if (lower.includes("chance to suppress spell damage")) effects.spellSuppression += value;
    if (lower.includes("to strength") || lower.includes("to all attributes")) effects.life += value * 0.5;

    if (lower.includes("fire and lightning resistances")) {
      effects.fireResistance += value;
      effects.lightningResistance += value;
    } else if (lower.includes("fire and cold resistances")) {
      effects.fireResistance += value;
      effects.coldResistance += value;
    } else if (lower.includes("cold and lightning resistances")) {
      effects.coldResistance += value;
      effects.lightningResistance += value;
    } else if (lower.includes("all elemental resistances")) {
      effects.fireResistance += value;
      effects.coldResistance += value;
      effects.lightningResistance += value;
    } else {
      if (lower.includes("to fire resistance")) effects.fireResistance += value;
      if (lower.includes("to cold resistance")) effects.coldResistance += value;
      if (lower.includes("to lightning resistance")) effects.lightningResistance += value;
    }
    if (lower.includes("to chaos resistance")) effects.chaosResistance += value;
  }
  return effects;
}

function itemEffects(item: Item, build: Build, slot: EquipmentSlot): ItemEffects {
  return { offense: offensiveEffect(item, build, slot), ...defensiveEffects(item) };
}

function effectiveResistanceChange(before: number, delta: number, cap: number) {
  if (delta >= 0) return Math.max(0, Math.min(cap, before + delta) - Math.min(cap, before));
  if (before < cap) return delta;
  const knownAfter = before + delta;
  return knownAfter < cap ? Math.max(knownAfter - cap, -10) : 0;
}

export function estimateItemReplacement(build: Build, slot: EquipmentSlot, candidate: TradeItem): BuildMetrics {
  const current = itemEffects(build.equipment[slot], build, slot);
  const next = itemEffects(candidate, build, slot);
  const changes = zeroMetrics();

  const offenseRatio = clamp((100 + next.offense) / Math.max(100 + current.offense, 1) - 1, -0.65, 1.5);
  changes.totalDps = build.metrics.totalDps * offenseRatio;

  changes.life = next.life - current.life;
  changes.energyShield = next.energyShield - current.energyShield;
  changes.armour = next.armour - current.armour;
  changes.evasion = next.evasion - current.evasion;
  changes.spellSuppression = next.spellSuppression - current.spellSuppression;
  changes.fireResistance = next.fireResistance - current.fireResistance;
  changes.coldResistance = next.coldResistance - current.coldResistance;
  changes.lightningResistance = next.lightningResistance - current.lightningResistance;
  changes.chaosResistance = next.chaosResistance - current.chaosResistance;

  const lifeRatio = build.metrics.life > 0 ? changes.life / build.metrics.life : 0;
  const energyShieldRatio = build.metrics.life + build.metrics.energyShield > 0 ? changes.energyShield / (build.metrics.life + build.metrics.energyShield) : 0;
  const armourRatio = build.metrics.armour > 0 ? changes.armour / build.metrics.armour : 0;
  const evasionRatio = build.metrics.evasion > 0 ? changes.evasion / build.metrics.evasion : 0;
  const fireEffect = effectiveResistanceChange(build.metrics.fireResistance, changes.fireResistance, 75);
  const coldEffect = effectiveResistanceChange(build.metrics.coldResistance, changes.coldResistance, 75);
  const lightningEffect = effectiveResistanceChange(build.metrics.lightningResistance, changes.lightningResistance, 75);
  const chaosEffect = effectiveResistanceChange(build.metrics.chaosResistance, changes.chaosResistance, 75);
  const averageElementalEffect = (fireEffect + coldEffect + lightningEffect) / 3;

  const ehpRatio = clamp(lifeRatio * 0.72 + energyShieldRatio * 0.55 + armourRatio * 0.08 + evasionRatio * 0.05 + changes.spellSuppression * 0.004 + averageElementalEffect * 0.012 + chaosEffect * 0.003, -0.65, 1.5);
  const physicalRatio = clamp(lifeRatio * 0.8 + energyShieldRatio * 0.35 + armourRatio * 0.12 + evasionRatio * 0.05, -0.65, 1.5);
  const elementalRatio = clamp(lifeRatio * 0.8 + energyShieldRatio * 0.4 + averageElementalEffect * 0.02 + changes.spellSuppression * 0.004, -0.65, 1.5);
  const chaosRatio = clamp(lifeRatio * 0.8 + energyShieldRatio * 0.4 + chaosEffect * 0.012, -0.65, 1.5);

  changes.effectiveHitPool = build.metrics.effectiveHitPool * ehpRatio;
  changes.physicalMaxHit = build.metrics.physicalMaxHit * physicalRatio;
  changes.elementalMaxHit = build.metrics.elementalMaxHit * elementalRatio;
  changes.chaosMaxHit = build.metrics.chaosMaxHit * chaosRatio;
  return changes;
}

export function applyMetricChanges(base: BuildMetrics, changes: BuildMetrics): BuildMetrics {
  return Object.fromEntries(metricKeys.map((key) => [key, base[key] + changes[key]])) as unknown as BuildMetrics;
}
