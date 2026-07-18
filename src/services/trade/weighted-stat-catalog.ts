import { Build, EquipmentSlot, Item, OptimizationGoal } from "@/models";
import { getTradeCategory } from "@/services/trade/trade-categories";

export type WeightPreset = "auto" | "strength-stacker" | "dexterity-stacker" | "intelligence-stacker" | "physical-attack" | "elemental-attack" | "critical-spell" | "damage-over-time" | "minion" | "mana-stacker";
export type ResolvedWeightPreset = Exclude<WeightPreset, "auto">;

export const WEIGHT_PRESETS: { id: WeightPreset; label: string; description: string }[] = [
  { id: "auto", label: "Auto-detect", description: "Inspect the skill and equipped items, then choose a starting archetype." },
  { id: "strength-stacker", label: "Strength stacker", description: "Prioritize flat and increased Strength alongside the build's measured damage stats." },
  { id: "dexterity-stacker", label: "Dexterity stacker", description: "Prioritize flat and increased Dexterity alongside the build's measured damage stats." },
  { id: "intelligence-stacker", label: "Intelligence stacker", description: "Prioritize flat and increased Intelligence alongside the build's measured damage stats." },
  { id: "physical-attack", label: "Physical attack", description: "Test local physical damage, attack speed, and critical scaling." },
  { id: "elemental-attack", label: "Elemental attack", description: "Test elemental attack scaling, attack speed, and critical scaling." },
  { id: "critical-spell", label: "Critical spell", description: "Test spell levels, spell damage, cast speed, and critical scaling." },
  { id: "damage-over-time", label: "Damage over time", description: "Test generic and damage-type-specific damage-over-time multipliers." },
  { id: "minion", label: "Minion", description: "Test minion gem levels, damage, and action speed." },
  { id: "mana-stacker", label: "Mana stacker", description: "Prioritize maximum Mana plus measured spell scaling." },
];

type StatKind = "offense" | "defense" | "utility";
type StatValueKey = "strength" | "increasedStrength" | "dexterity" | "increasedDexterity" | "intelligence" | "increasedIntelligence" | "life" | "mana" | "energyShield" | "fireResistance" | "coldResistance" | "lightningResistance" | "chaosResistance" | "attackSpeed" | "castSpeed" | "movementSpeed" | "physicalDamage" | "addedPhysicalDamage" | "elementalAttackDamage" | "spellDamage" | "criticalMultiplier" | "spellCriticalChance" | "spellGemLevel" | "minionGemLevel" | "minionDamage" | "minionSpeed" | "dotMultiplier" | "fireDotMultiplier" | "coldDotMultiplier" | "chaosDotMultiplier" | "physicalDotMultiplier" | "spellSuppression";

export interface WeightedStatDefinition {
  id: string;
  label: string;
  reason: string;
  probeText: string;
  probeAmount: number;
  defaultWeight: number;
  kind: StatKind;
  valueKey: StatValueKey;
  presets?: ResolvedWeightPreset[];
  categories: string[];
}

const ATTACK_PRESETS: ResolvedWeightPreset[] = ["strength-stacker", "dexterity-stacker", "intelligence-stacker", "physical-attack", "elemental-attack"];
const SPELL_PRESETS: ResolvedWeightPreset[] = ["critical-spell", "mana-stacker"];
const NON_WEAPON = ["armour.", "accessory."];

export const WEIGHTED_STAT_LIBRARY: WeightedStatDefinition[] = [
  { id: "pseudo.pseudo_total_strength", label: "+# total to Strength", reason: "Measures the build's benefit from additional Strength.", probeText: "+10 to Strength", probeAmount: 10, defaultWeight: 1.5, kind: "offense", valueKey: "strength", presets: ["strength-stacker"], categories: NON_WEAPON },
  { id: "explicit.stat_734614379", label: "#% increased Strength", reason: "Measures percentage Strength scaling for a Strength stacker.", probeText: "5% increased Strength", probeAmount: 5, defaultWeight: 3, kind: "offense", valueKey: "increasedStrength", presets: ["strength-stacker"], categories: NON_WEAPON },
  { id: "pseudo.pseudo_total_dexterity", label: "+# total to Dexterity", reason: "Measures the build's benefit from additional Dexterity.", probeText: "+10 to Dexterity", probeAmount: 10, defaultWeight: 1.5, kind: "offense", valueKey: "dexterity", presets: ["dexterity-stacker"], categories: NON_WEAPON },
  { id: "explicit.stat_4139681126", label: "#% increased Dexterity", reason: "Measures percentage Dexterity scaling for a Dexterity stacker.", probeText: "5% increased Dexterity", probeAmount: 5, defaultWeight: 3, kind: "offense", valueKey: "increasedDexterity", presets: ["dexterity-stacker"], categories: NON_WEAPON },
  { id: "pseudo.pseudo_total_intelligence", label: "+# total to Intelligence", reason: "Measures the build's benefit from additional Intelligence.", probeText: "+10 to Intelligence", probeAmount: 10, defaultWeight: 1.5, kind: "offense", valueKey: "intelligence", presets: ["intelligence-stacker"], categories: NON_WEAPON },
  { id: "explicit.stat_656461285", label: "#% increased Intelligence", reason: "Measures percentage Intelligence scaling for an Intelligence stacker.", probeText: "5% increased Intelligence", probeAmount: 5, defaultWeight: 3, kind: "offense", valueKey: "increasedIntelligence", presets: ["intelligence-stacker"], categories: NON_WEAPON },
  { id: "pseudo.pseudo_total_mana", label: "+# total maximum Mana", reason: "Measures maximum Mana scaling for Archmage and mana-stacking builds.", probeText: "+20 to maximum Mana", probeAmount: 20, defaultWeight: 0.8, kind: "offense", valueKey: "mana", presets: ["mana-stacker"], categories: NON_WEAPON },

  { id: "pseudo.pseudo_increased_physical_damage", label: "#% total increased Physical Damage", reason: "Measures local physical weapon scaling.", probeText: "20% increased Physical Damage", probeAmount: 20, defaultWeight: 0.3, kind: "offense", valueKey: "physicalDamage", presets: ["physical-attack"], categories: ["weapon."] },
  { id: "pseudo.pseudo_adds_physical_damage", label: "Adds # to # Physical Damage", reason: "Measures added local physical weapon damage.", probeText: "Adds 5 to 10 Physical Damage", probeAmount: 7.5, defaultWeight: 0.45, kind: "offense", valueKey: "addedPhysicalDamage", presets: ["physical-attack"], categories: ["weapon."] },
  { id: "pseudo.pseudo_adds_physical_damage_to_attacks", label: "Adds # to # Physical Damage to Attacks", reason: "Measures added physical attack damage on non-weapons.", probeText: "Adds 5 to 10 Physical Damage to Attacks", probeAmount: 7.5, defaultWeight: 0.45, kind: "offense", valueKey: "addedPhysicalDamage", presets: ["physical-attack"], categories: ["armour.gloves", "accessory."] },
  { id: "pseudo.pseudo_increased_elemental_damage_with_attack_skills", label: "#% increased Elemental Damage with Attack Skills", reason: "Measures elemental attack scaling.", probeText: "20% increased Elemental Damage with Attack Skills", probeAmount: 20, defaultWeight: 0.25, kind: "offense", valueKey: "elementalAttackDamage", presets: ["elemental-attack"], categories: ["weapon.", "accessory."] },
  { id: "pseudo.pseudo_total_attack_speed", label: "+#% total Attack Speed", reason: "Measures the active attack's benefit from additional attack speed.", probeText: "5% increased Attack Speed", probeAmount: 5, defaultWeight: 0.85, kind: "offense", valueKey: "attackSpeed", presets: ATTACK_PRESETS, categories: ["weapon.", "armour.gloves", "accessory.quiver"] },
  { id: "pseudo.pseudo_global_critical_strike_multiplier", label: "+#% Global Critical Strike Multiplier", reason: "Measures critical damage scaling.", probeText: "+10% to Global Critical Strike Multiplier", probeAmount: 10, defaultWeight: 0.5, kind: "offense", valueKey: "criticalMultiplier", presets: [...ATTACK_PRESETS, ...SPELL_PRESETS], categories: ["weapon.", "accessory."] },

  { id: "explicit.stat_124131830", label: "+# to Level of all Spell Skill Gems", reason: "Measures the active spell's benefit from gem levels.", probeText: "+1 to Level of all Spell Skill Gems", probeAmount: 1, defaultWeight: 14, kind: "offense", valueKey: "spellGemLevel", presets: SPELL_PRESETS, categories: ["weapon.", "accessory.amulet"] },
  { id: "pseudo.pseudo_increased_spell_damage", label: "#% increased Spell Damage", reason: "Measures spell damage scaling in the imported build.", probeText: "10% increased Spell Damage", probeAmount: 10, defaultWeight: 0.28, kind: "offense", valueKey: "spellDamage", presets: [...SPELL_PRESETS, "damage-over-time"], categories: ["weapon.", "armour.shield", "accessory.amulet", "accessory.ring"] },
  { id: "pseudo.pseudo_total_cast_speed", label: "+#% total Cast Speed", reason: "Measures the active spell's benefit from cast speed.", probeText: "5% increased Cast Speed", probeAmount: 5, defaultWeight: 0.8, kind: "offense", valueKey: "castSpeed", presets: SPELL_PRESETS, categories: ["weapon.", "armour.shield", "accessory.amulet", "accessory.ring"] },
  { id: "pseudo.pseudo_critical_strike_chance_for_spells", label: "+#% total Critical Strike Chance for Spells", reason: "Measures spell critical-strike consistency.", probeText: "20% increased Critical Strike Chance for Spells", probeAmount: 20, defaultWeight: 0.12, kind: "offense", valueKey: "spellCriticalChance", presets: ["critical-spell"], categories: ["weapon.", "armour.shield", "accessory.amulet"] },

  { id: "explicit.stat_2162097452", label: "+# to Level of all Minion Skill Gems", reason: "Measures minion gem-level scaling.", probeText: "+1 to Level of all Minion Skill Gems", probeAmount: 1, defaultWeight: 14, kind: "offense", valueKey: "minionGemLevel", presets: ["minion"], categories: ["weapon.", "armour.shield", "accessory.amulet"] },
  { id: "explicit.stat_1589917703", label: "Minions deal #% increased Damage", reason: "Measures minion damage scaling.", probeText: "Minions deal 10% increased Damage", probeAmount: 10, defaultWeight: 0.35, kind: "offense", valueKey: "minionDamage", presets: ["minion"], categories: ["weapon.", "armour.shield", "accessory.ring"] },
  { id: "explicit.stat_3091578504", label: "Minions have #% increased Attack and Cast Speed", reason: "Measures minion action-speed scaling.", probeText: "Minions have 5% increased Attack and Cast Speed", probeAmount: 5, defaultWeight: 0.8, kind: "offense", valueKey: "minionSpeed", presets: ["minion"], categories: ["weapon.", "armour.shield", "accessory.ring"] },

  { id: "explicit.stat_3988349707", label: "+#% to Damage over Time Multiplier", reason: "Measures generic damage-over-time multiplier scaling.", probeText: "+5% to Damage over Time Multiplier", probeAmount: 5, defaultWeight: 1.2, kind: "offense", valueKey: "dotMultiplier", presets: ["damage-over-time"], categories: ["weapon.", "armour.gloves", "accessory.amulet", "accessory.quiver"] },
  { id: "explicit.stat_3382807662", label: "+#% to Fire Damage over Time Multiplier", reason: "Measures Fire damage-over-time scaling.", probeText: "+5% to Fire Damage over Time Multiplier", probeAmount: 5, defaultWeight: 1.5, kind: "offense", valueKey: "fireDotMultiplier", presets: ["damage-over-time"], categories: ["weapon.", "armour.gloves", "accessory.amulet"] },
  { id: "explicit.stat_1950806024", label: "+#% to Cold Damage over Time Multiplier", reason: "Measures Cold damage-over-time scaling.", probeText: "+5% to Cold Damage over Time Multiplier", probeAmount: 5, defaultWeight: 1.5, kind: "offense", valueKey: "coldDotMultiplier", presets: ["damage-over-time"], categories: ["weapon.", "armour.gloves", "accessory.amulet"] },
  { id: "explicit.stat_4055307827", label: "+#% to Chaos Damage over Time Multiplier", reason: "Measures Chaos damage-over-time scaling.", probeText: "+5% to Chaos Damage over Time Multiplier", probeAmount: 5, defaultWeight: 1.5, kind: "offense", valueKey: "chaosDotMultiplier", presets: ["damage-over-time"], categories: ["weapon.", "armour.gloves", "accessory.amulet", "accessory.quiver"] },
  { id: "explicit.stat_1314617696", label: "+#% to Physical Damage over Time Multiplier", reason: "Measures Physical damage-over-time scaling.", probeText: "+5% to Physical Damage over Time Multiplier", probeAmount: 5, defaultWeight: 1.5, kind: "offense", valueKey: "physicalDotMultiplier", presets: ["damage-over-time"], categories: ["weapon.", "armour.gloves", "accessory.amulet", "accessory.quiver"] },

  { id: "pseudo.pseudo_total_life", label: "+# total maximum Life", reason: "Measures the defensive value of maximum Life.", probeText: "+20 to maximum Life", probeAmount: 20, defaultWeight: 0.9, kind: "defense", valueKey: "life", categories: NON_WEAPON },
  { id: "pseudo.pseudo_total_energy_shield", label: "+# total maximum Energy Shield", reason: "Measures the defensive value of maximum Energy Shield.", probeText: "+20 to maximum Energy Shield", probeAmount: 20, defaultWeight: 0.75, kind: "defense", valueKey: "energyShield", categories: NON_WEAPON },
  { id: "pseudo.pseudo_total_fire_resistance", label: "+#% total to Fire Resistance", reason: "Measures Fire Resistance value for the imported build.", probeText: "+10% to Fire Resistance", probeAmount: 10, defaultWeight: 0.18, kind: "defense", valueKey: "fireResistance", categories: NON_WEAPON },
  { id: "pseudo.pseudo_total_cold_resistance", label: "+#% total to Cold Resistance", reason: "Measures Cold Resistance value for the imported build.", probeText: "+10% to Cold Resistance", probeAmount: 10, defaultWeight: 0.18, kind: "defense", valueKey: "coldResistance", categories: NON_WEAPON },
  { id: "pseudo.pseudo_total_lightning_resistance", label: "+#% total to Lightning Resistance", reason: "Measures Lightning Resistance value for the imported build.", probeText: "+10% to Lightning Resistance", probeAmount: 10, defaultWeight: 0.18, kind: "defense", valueKey: "lightningResistance", categories: NON_WEAPON },
  { id: "pseudo.pseudo_total_chaos_resistance", label: "+#% total to Chaos Resistance", reason: "Measures Chaos Resistance value for the imported build.", probeText: "+10% to Chaos Resistance", probeAmount: 10, defaultWeight: 0.8, kind: "defense", valueKey: "chaosResistance", categories: NON_WEAPON },
  { id: "explicit.stat_3680664274", label: "+#% chance to Suppress Spell Damage", reason: "Measures the build's remaining Spell Suppression value.", probeText: "+5% chance to Suppress Spell Damage", probeAmount: 5, defaultWeight: 1.35, kind: "defense", valueKey: "spellSuppression", categories: ["armour.helmet", "armour.chest", "armour.gloves", "armour.boots"] },
  { id: "pseudo.pseudo_increased_movement_speed", label: "#% increased Movement Speed", reason: "Measures boot mobility without treating it as damage.", probeText: "5% increased Movement Speed", probeAmount: 5, defaultWeight: 0.35, kind: "utility", valueKey: "movementSpeed", categories: ["armour.boots"] },
];

function matchesCategory(definition: WeightedStatDefinition, category: string | null) {
  if (!category) return false;
  return definition.categories.some((allowed) => allowed.endsWith(".") ? category.startsWith(allowed) : category === allowed);
}

function buildText(build: Build) {
  return [build.character.mainSkill, ...Object.values(build.equipment).flatMap((item) => [item.name, item.baseType, item.itemClass, ...item.modifiers.map((modifier) => modifier.label)])].filter(Boolean).join(" ").toLowerCase();
}

export function resolveWeightPreset(build: Build, requested: WeightPreset): ResolvedWeightPreset {
  if (requested !== "auto") return requested;
  const text = buildText(build);
  if (/replica alberon|brutus' lead sprinkler|iron fortress|per \d+ strength|increased strength/.test(text)) return "strength-stacker";
  if (/hollow palm|iron commander|per \d+ dexterity|increased dexterity/.test(text)) return "dexterity-stacker";
  if (/hand of wisdom and action|whispering ice|per \d+ intelligence|increased intelligence/.test(text)) return "intelligence-stacker";
  if (/minion|spectre|zombie|skeleton|golem|animate guardian|raging spirit/.test(text)) return "minion";
  if (/archmage|indigon|mana stack|mana cost/.test(text)) return "mana-stacker";
  if (/damage over time|dot multiplier|poison|ignite|bleed|corrupting|caustic|toxic rain|righteous fire/.test(text)) return "damage-over-time";
  if (/spell|cast speed|wand|sceptre|staff|hexblast/.test(text) && !/attack speed|bow|two hand|one hand|sword|axe|claw/.test(text)) return "critical-spell";
  if (/elemental damage with attack|adds \d+ to \d+ (?:fire|cold|lightning) damage/.test(text)) return "elemental-attack";
  return "physical-attack";
}

export function getEligibleWeightedStats(build: Build, slot: EquipmentSlot, preset: WeightPreset) {
  const category = getTradeCategory(slot, build.equipment[slot]);
  const resolvedPreset = resolveWeightPreset(build, preset);
  return WEIGHTED_STAT_LIBRARY.filter((definition) => matchesCategory(definition, category) && (!definition.presets || definition.presets.includes(resolvedPreset)));
}

export function getManualWeightedStats(build: Build, slot: EquipmentSlot) {
  const category = getTradeCategory(slot, build.equipment[slot]);
  return WEIGHTED_STAT_LIBRARY.filter((definition) => matchesCategory(definition, category));
}

export function defaultWeightForStat(definition: WeightedStatDefinition, build: Build, goal: OptimizationGoal) {
  const offenseScale = goal === "dps" ? 1 : goal === "balanced" ? 0.68 : 0.16;
  const defenseScale = goal === "survivability" ? 1 : goal === "balanced" ? 0.72 : 0.14;
  if (definition.kind === "offense") return definition.defaultWeight * offenseScale;
  if (definition.kind === "utility") return definition.defaultWeight;
  const metricByKey: Partial<Record<StatValueKey, number>> = {
    fireResistance: build.metrics.fireResistance,
    coldResistance: build.metrics.coldResistance,
    lightningResistance: build.metrics.lightningResistance,
    chaosResistance: build.metrics.chaosResistance,
  };
  const resistance = metricByKey[definition.valueKey];
  if (resistance !== undefined) {
    const resistanceWeight = resistance < 75 ? 1.4 + Math.min(1.6, (75 - resistance) / 25) : definition.defaultWeight;
    return resistanceWeight * defenseScale;
  }
  return definition.defaultWeight * defenseScale;
}

function itemText(item: Item) {
  return item.rawText ?? item.modifiers.map((modifier) => modifier.label).join("\n");
}

function sumMatches(text: string, pattern: RegExp, range = false) {
  let sum = 0;
  for (const match of text.matchAll(pattern)) {
    const first = Number(match[1] ?? 0);
    const second = Number(match[2] ?? first);
    sum += range ? (first + second) / 2 : first;
  }
  return sum;
}

export function currentItemStatValue(item: Item, definition: WeightedStatDefinition) {
  const text = itemText(item);
  const patterns: Record<StatValueKey, [RegExp, boolean?]> = {
    strength: [/\+(\d+) to Strength(?! and)/gi], increasedStrength: [/(\d+)% increased Strength/gi],
    dexterity: [/\+(\d+) to Dexterity(?! and)/gi], increasedDexterity: [/(\d+)% increased Dexterity/gi],
    intelligence: [/\+(\d+) to Intelligence(?! and)/gi], increasedIntelligence: [/(\d+)% increased Intelligence/gi],
    life: [/\+(\d+) to maximum Life/gi], mana: [/\+(\d+) to maximum Mana/gi], energyShield: [/\+(\d+) to maximum Energy Shield/gi],
    fireResistance: [/\+(\d+)% to Fire Resistance/gi], coldResistance: [/\+(\d+)% to Cold Resistance/gi],
    lightningResistance: [/\+(\d+)% to Lightning Resistance/gi], chaosResistance: [/\+(\d+)% to Chaos Resistance/gi],
    attackSpeed: [/(\d+)% increased Attack Speed/gi], castSpeed: [/(\d+)% increased Cast Speed/gi], movementSpeed: [/(\d+)% increased Movement Speed/gi],
    physicalDamage: [/(\d+)% increased Physical Damage/gi], addedPhysicalDamage: [/Adds (\d+) to (\d+) Physical Damage/gi, true],
    elementalAttackDamage: [/(\d+)% increased Elemental Damage with Attack Skills/gi], spellDamage: [/(\d+)% increased Spell Damage/gi],
    criticalMultiplier: [/\+(\d+)% to (?:Global )?Critical Strike Multiplier/gi], spellCriticalChance: [/(\d+)% increased Critical Strike Chance for Spells/gi],
    spellGemLevel: [/\+(\d+) to Level of all Spell Skill Gems/gi], minionGemLevel: [/\+(\d+) to Level of all Minion Skill Gems/gi],
    minionDamage: [/Minions deal (\d+)% increased Damage/gi], minionSpeed: [/Minions have (\d+)% increased Attack and Cast Speed/gi],
    dotMultiplier: [/\+(\d+)% to Damage over Time Multiplier/gi], fireDotMultiplier: [/\+(\d+)% to Fire Damage over Time Multiplier/gi],
    coldDotMultiplier: [/\+(\d+)% to Cold Damage over Time Multiplier/gi], chaosDotMultiplier: [/\+(\d+)% to Chaos Damage over Time Multiplier/gi],
    physicalDotMultiplier: [/\+(\d+)% to Physical Damage over Time Multiplier/gi], spellSuppression: [/\+(\d+)% chance to Suppress Spell Damage/gi],
  };
  const [pattern, range] = patterns[definition.valueKey];
  return sumMatches(text, pattern, range);
}

export function deriveMinimumWeightedScore(item: Item, options: { id: string; weight: number }[]) {
  const definitions = new Map(WEIGHTED_STAT_LIBRARY.map((definition) => [definition.id, definition]));
  const score = options.reduce((sum, option) => {
    const definition = definitions.get(option.id);
    return definition && option.weight !== 0 ? sum + currentItemStatValue(item, definition) * option.weight : sum;
  }, 0);
  return Math.max(1, Number(score.toFixed(5)));
}
