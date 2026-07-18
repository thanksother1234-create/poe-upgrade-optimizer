import { Build, CurrencyAmount, EquipmentSlot, OptimizationGoal } from "@/models";
import { getTradeCategory } from "@/services/trade/trade-categories";

export interface WeightedTradeOption {
  id: string;
  label: string;
  weight: number;
  reason: string;
}

export interface WeightedTradeSearchDraft {
  slot: EquipmentSlot;
  category: string | null;
  profile: "attack" | "spell" | "damage-over-time" | "minion";
  options: WeightedTradeOption[];
  request: {
    query: {
      status: { option: "online" };
      stats: [{
        type: "weight";
        filters: { id: string; value: { weight: number } }[];
        value: { min: number };
      }];
      filters: {
        trade_filters: { filters: { price: { max: number; option: CurrencyAmount["currency"] } } };
        type_filters?: { filters: { category: { option: string } } };
      };
    };
    sort: { "statgroup.0": "desc" };
  };
}

export interface WeightedTradeSearchCustomization {
  weights?: Record<string, number>;
  minimumScore?: number;
}

const rounded = (value: number) => Math.max(0.01, Number(value.toFixed(2)));

function buildProfile(build: Build): WeightedTradeSearchDraft["profile"] {
  const weaponText = [build.character.mainSkill, build.equipment.weapon.itemClass, build.equipment.weapon.baseType,
    ...build.equipment.weapon.modifiers.map((modifier) => modifier.label),
    ...build.equipment.offhand.modifiers.map((modifier) => modifier.label)].join(" ").toLowerCase();
  if (/minion|spectre|zombie|skeleton|golem|animate guardian|raging spirit/.test(weaponText)) return "minion";
  if (/damage over time|dot multiplier|poison|ignite|bleed|corrupting|caustic|toxic rain|righteous fire/.test(weaponText)) return "damage-over-time";
  if (/spell|cast speed|wand|sceptre|staff/.test(weaponText) && !/attack speed|bow|two hand|one hand|sword|axe|claw/.test(weaponText)) return "spell";
  return "attack";
}

function offenseOptions(profile: WeightedTradeSearchDraft["profile"], build: Build, scale: number): WeightedTradeOption[] {
  if (scale <= 0) return [];
  const text = `${build.character.mainSkill} ${build.equipment.weapon.modifiers.map((modifier) => modifier.label).join(" ")}`.toLowerCase();
  const option = (id: string, label: string, weight: number, reason: string): WeightedTradeOption => ({ id, label, weight: rounded(weight * scale), reason });

  if (profile === "minion") return [
    option("explicit.stat_2162097452", "+# to Level of all Minion Skill Gems", 14, "Gem levels usually provide a large minion damage gain."),
    option("explicit.stat_1589917703", "Minions deal #% increased Damage", 0.35, "Scales the imported build's minion damage."),
    option("explicit.stat_3091578504", "Minions have #% increased Attack and Cast Speed", 0.8, "Improves minion action rate."),
  ];

  if (profile === "damage-over-time") {
    const elementalDot = text.includes("chaos")
      ? ["explicit.stat_4055307827", "+#% to Chaos Damage over Time Multiplier", "explicit.stat_4226189338", "+# to Level of all Chaos Spell Skill Gems"]
      : text.includes("fire") || text.includes("ignite") || text.includes("righteous fire")
        ? ["explicit.stat_3382807662", "+#% to Fire Damage over Time Multiplier", "explicit.stat_591105508", "+# to Level of all Fire Spell Skill Gems"]
        : text.includes("cold")
          ? ["explicit.stat_1950806024", "+#% to Cold Damage over Time Multiplier", "explicit.stat_2254480358", "+# to Level of all Cold Spell Skill Gems"]
          : ["explicit.stat_1314617696", "+#% to Physical Damage over Time Multiplier", "explicit.stat_1600707273", "+# to Level of all Physical Spell Skill Gems"];
    return [
      option(elementalDot[0], elementalDot[1], 1.5, "Matches the damage type detected in the imported build."),
      option("explicit.stat_3988349707", "+#% to Damage over Time Multiplier", 1.2, "Directly scales damage over time."),
      option(elementalDot[2], elementalDot[3], 14, "Relevant gem levels are high-impact when available."),
      option("pseudo.pseudo_increased_spell_damage", "#% increased Spell Damage", 0.18, "Included for spell-based damage-over-time skills."),
    ];
  }

  if (profile === "spell") return [
    option("explicit.stat_124131830", "+# to Level of all Spell Skill Gems", 14, "Spell gem levels are typically high-impact."),
    option("pseudo.pseudo_increased_spell_damage", "#% increased Spell Damage", 0.28, "Scales spell damage."),
    option("pseudo.pseudo_total_cast_speed", "+#% total Cast Speed", 0.8, "Improves spell action rate."),
    option("pseudo.pseudo_global_critical_strike_multiplier", "+#% Global Critical Strike Multiplier", 0.55, "Scales critical spell hits."),
    option("pseudo.pseudo_critical_strike_chance_for_spells", "+#% total Critical Strike Chance for Spells", 0.12, "Improves critical spell consistency."),
  ];

  return [
    option("pseudo.pseudo_increased_physical_damage", "#% total increased Physical Damage", 0.3, "Scales the weapon's physical damage."),
    option("pseudo.pseudo_adds_physical_damage", "Adds # to # Physical Damage", 0.45, "Adds local physical weapon damage."),
    option("pseudo.pseudo_total_attack_speed", "+#% total Attack Speed", 0.85, "Improves attack rate."),
    option("pseudo.pseudo_global_critical_strike_multiplier", "+#% Global Critical Strike Multiplier", 0.5, "Scales critical attack hits."),
    option("pseudo.pseudo_increased_elemental_damage_with_attack_skills", "#% increased Elemental Damage with Attack Skills", 0.2, "Supports elemental attack scaling when present."),
  ];
}

function defenseOptions(build: Build, slot: EquipmentSlot, scale: number): WeightedTradeOption[] {
  if (scale <= 0) return [];
  const category = getTradeCategory(slot, build.equipment[slot]);
  if (slot === "weapon" || category?.startsWith("weapon.")) return [];
  const metrics = build.metrics;
  const option = (id: string, label: string, weight: number, reason: string): WeightedTradeOption => ({ id, label, weight: rounded(weight * scale), reason });
  const resistanceWeight = (value: number) => value < 75 ? 1.4 + Math.min(1.6, (75 - value) / 25) : 0.18;
  const options = [
    option("pseudo.pseudo_total_life", "+# total maximum Life", metrics.life > 0 && metrics.life < 4_000 ? 1.25 : 0.9, "Life is weighted more heavily when the imported total is low."),
    option("pseudo.pseudo_total_fire_resistance", "+#% total to Fire Resistance", resistanceWeight(metrics.fireResistance), metrics.fireResistance < 75 ? "Fire resistance is below the normal cap." : "Provides resistance headroom."),
    option("pseudo.pseudo_total_cold_resistance", "+#% total to Cold Resistance", resistanceWeight(metrics.coldResistance), metrics.coldResistance < 75 ? "Cold resistance is below the normal cap." : "Provides resistance headroom."),
    option("pseudo.pseudo_total_lightning_resistance", "+#% total to Lightning Resistance", resistanceWeight(metrics.lightningResistance), metrics.lightningResistance < 75 ? "Lightning resistance is below the normal cap." : "Provides resistance headroom."),
    option("pseudo.pseudo_total_chaos_resistance", "+#% total to Chaos Resistance", metrics.chaosResistance < 75 ? 0.8 + Math.min(1.2, (75 - metrics.chaosResistance) / 50) : 0.16, "Chaos resistance is weighted by the imported deficit."),
  ];
  if (metrics.energyShield > Math.max(500, metrics.life * 0.25)) {
    options.push(option("pseudo.pseudo_total_energy_shield", "+# total maximum Energy Shield", 0.75, "The build has meaningful Energy Shield."));
  }
  if (metrics.spellSuppression > 0 && metrics.spellSuppression < 100) {
    options.push(option("explicit.stat_3680664274", "+#% chance to Suppress Spell Damage", 1.35, "Helps close the build's suppression gap."));
  }
  if (slot === "boots") options.push(option("pseudo.pseudo_increased_movement_speed", "#% increased Movement Speed", 0.35, "Preserves boot mobility."));
  return options;
}

export function createWeightedTradeSearch(build: Build, slot: EquipmentSlot, goal: OptimizationGoal, budget: CurrencyAmount): WeightedTradeSearchDraft {
  const profile = buildProfile(build);
  const offenseScale = goal === "dps" ? 1 : goal === "balanced" ? 0.68 : 0.16;
  const defenseScale = goal === "survivability" ? 1 : goal === "balanced" ? 0.72 : 0.14;
  const category = getTradeCategory(slot, build.equipment[slot]);
  const options = [...offenseOptions(profile, build, offenseScale), ...defenseOptions(build, slot, defenseScale)]
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 10);
  const categoryFilter = category ? { type_filters: { filters: { category: { option: category } } } } : {};
  return {
    slot,
    category,
    profile,
    options,
    request: {
      query: {
        status: { option: "online" },
        stats: [{
          type: "weight",
          filters: options.map(({ id, weight }) => ({ id, value: { weight } })),
          value: { min: 1 },
        }],
        filters: {
          trade_filters: { filters: { price: { max: budget.amount, option: budget.currency } } },
          ...categoryFilter,
        },
      },
      sort: { "statgroup.0": "desc" },
    },
  };
}

export function customizeWeightedTradeSearch(
  draft: WeightedTradeSearchDraft,
  customization?: WeightedTradeSearchCustomization,
): WeightedTradeSearchDraft {
  if (!customization) return draft;

  const options = draft.options.map((option) => {
    const customWeight = customization.weights?.[option.id];
    if (customWeight === undefined || !Number.isFinite(customWeight)) return option;
    return { ...option, weight: Number(customWeight.toFixed(5)) };
  });
  const currentStatGroup = draft.request.query.stats[0];
  const customMinimum = customization.minimumScore;
  const minimumScore = customMinimum !== undefined && Number.isFinite(customMinimum)
    ? Number(customMinimum.toFixed(5))
    : currentStatGroup.value.min;

  return {
    ...draft,
    options,
    request: {
      ...draft.request,
      query: {
        ...draft.request.query,
        stats: [{
          ...currentStatGroup,
          filters: options
            .filter((option) => option.weight !== 0)
            .map(({ id, weight }) => ({ id, value: { weight } })),
          value: { min: minimumScore },
        }],
      },
    },
  };
}

export function formatWeightedSearchRecipe(draft: WeightedTradeSearchDraft, league: string) {
  const lines = draft.options.map((option) => `- ${option.label} | weight ${option.weight}`);
  return [
    `PoE Upgrade Optimizer weighted search (${league})`,
    `Category: ${draft.category ?? "match the currently equipped item"}`,
    `Profile: ${draft.profile}`,
    "Stat group: Weighted Sum",
    ...lines,
    "Sort: Weighted Sum descending",
    "",
    "Generated query JSON:",
    JSON.stringify(draft.request, null, 2),
  ].join("\n");
}
