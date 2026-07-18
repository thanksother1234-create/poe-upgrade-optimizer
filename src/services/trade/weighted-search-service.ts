import { Build, CurrencyAmount, EquipmentSlot, OptimizationGoal } from "@/models";
import { getTradeCategory } from "@/services/trade/trade-categories";
import { currentItemStatValue, defaultWeightForStat, deriveMinimumWeightedScore, getEligibleWeightedStats, resolveWeightPreset, type WeightPreset } from "@/services/trade/weighted-stat-catalog";

export interface WeightedTradeOption {
  id: string;
  label: string;
  weight: number;
  reason: string;
  source?: "preset" | "pob" | "manual";
  currentValue?: number;
  dpsChange?: number;
  defensiveChange?: number;
}

export interface WeightedTradeSearchDraft {
  slot: EquipmentSlot;
  category: string | null;
  profile: "attack" | "spell" | "damage-over-time" | "minion";
  preset: WeightPreset;
  resolvedPreset: Exclude<WeightPreset, "auto">;
  calculation: "preset" | "pob";
  engineVersion?: string;
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
  addedOptions?: WeightedTradeOption[];
}

const rounded = (value: number) => Math.max(0.01, Number(value.toFixed(2)));

function profileForPreset(preset: Exclude<WeightPreset, "auto">): WeightedTradeSearchDraft["profile"] {
  if (preset === "minion") return "minion";
  if (preset === "damage-over-time") return "damage-over-time";
  if (preset === "critical-spell" || preset === "mana-stacker") return "spell";
  return "attack";
}

export function createWeightedTradeSearch(build: Build, slot: EquipmentSlot, goal: OptimizationGoal, budget: CurrencyAmount, preset: WeightPreset = "auto"): WeightedTradeSearchDraft {
  const resolvedPreset = resolveWeightPreset(build, preset);
  const profile = profileForPreset(resolvedPreset);
  const category = getTradeCategory(slot, build.equipment[slot]);
  const options = getEligibleWeightedStats(build, slot, preset).map((definition) => ({
    id: definition.id,
    label: definition.label,
    weight: rounded(defaultWeightForStat(definition, build, goal)),
    reason: definition.reason,
    source: "preset" as const,
    currentValue: currentItemStatValue(build.equipment[slot], definition),
  }))
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 10);
  const minimumScore = deriveMinimumWeightedScore(build.equipment[slot], options);
  const categoryFilter = category ? { type_filters: { filters: { category: { option: category } } } } : {};
  return {
    slot,
    category,
    profile,
    preset,
    resolvedPreset,
    calculation: "preset",
    options,
    request: {
      query: {
        status: { option: "online" },
        stats: [{
          type: "weight",
          filters: options.map(({ id, weight }) => ({ id, value: { weight } })),
          value: { min: minimumScore },
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

  const added = (customization.addedOptions ?? []).filter((option) => !draft.options.some((existing) => existing.id === option.id));
  const options = [...draft.options, ...added].map((option) => {
    const customWeight = customization.weights?.[option.id];
    if (customWeight === undefined || !Number.isFinite(customWeight)) return option;
    return { ...option, weight: Number(customWeight.toFixed(5)) };
  });
  const currentStatGroup = draft.request.query.stats[0];
  const minimumScore = minimumScoreForOptions(options);

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

export function minimumScoreForOptions(options: WeightedTradeOption[]) {
  const score = options.reduce((sum, option) => option.weight !== 0 ? sum + option.weight * (option.currentValue ?? 0) : sum, 0);
  return Math.max(1, Number(score.toFixed(5)));
}

export function applyPobCalculatedWeights(
  draft: WeightedTradeSearchDraft,
  options: WeightedTradeOption[],
  resolvedPreset: WeightedTradeSearchDraft["resolvedPreset"],
  engineVersion?: string,
): WeightedTradeSearchDraft {
  const statGroup = draft.request.query.stats[0];
  return {
    ...draft,
    resolvedPreset,
    calculation: "pob",
    engineVersion,
    options,
    request: {
      ...draft.request,
      query: {
        ...draft.request.query,
        stats: [{
          ...statGroup,
          filters: options.filter((option) => option.weight !== 0).map(({ id, weight }) => ({ id, value: { weight } })),
          value: { min: minimumScoreForOptions(options) },
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
    `Preset: ${draft.resolvedPreset}`,
    `Weights: ${draft.calculation === "pob" ? `measured by ${draft.engineVersion ?? "Path of Building"}` : "preset starting values"}`,
    "Stat group: Weighted Sum",
    ...lines,
    "Sort: Weighted Sum descending",
    "",
    "Generated query JSON:",
    JSON.stringify(draft.request, null, 2),
  ].join("\n");
}
