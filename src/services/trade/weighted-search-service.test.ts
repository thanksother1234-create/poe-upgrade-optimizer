import { describe, expect, it } from "vitest";
import { mockBuild } from "@/mocks/build";
import { createWeightedTradeSearch, customizeWeightedTradeSearch, formatWeightedSearchRecipe } from "./weighted-search-service";

describe("weighted trade search", () => {
  it("creates an official weighted-sum request with category and budget filters", () => {
    const draft = createWeightedTradeSearch(structuredClone(mockBuild), "boots", "balanced", { amount: 5, currency: "divine" });
    expect(draft.category).toBe("armour.boots");
    expect(draft.request.query.stats[0].type).toBe("weight");
    expect(draft.request.query.filters.trade_filters.filters.price).toEqual({ max: 5, option: "divine" });
    expect(draft.request.query.filters.type_filters?.filters.category.option).toBe("armour.boots");
    expect(draft.request.sort).toEqual({ "statgroup.0": "desc" });
  });

  it("applies the equipped item class as the PoE trade category", () => {
    const shield = createWeightedTradeSearch(structuredClone(mockBuild), "offhand", "balanced", { amount: 5, currency: "divine" });
    expect(shield.request.query.filters.type_filters?.filters.category.option).toBe("armour.shield");

    const swordBuild = structuredClone(mockBuild);
    swordBuild.equipment.weapon.itemClass = "One Hand Swords";
    const sword = createWeightedTradeSearch(swordBuild, "weapon", "dps", { amount: 5, currency: "divine" });
    expect(sword.request.query.filters.type_filters?.filters.category.option).toBe("weapon.onesword");
  });

  it("adapts resistance weights to the imported build", () => {
    const build = structuredClone(mockBuild);
    build.metrics.fireResistance = 75;
    build.metrics.lightningResistance = 25;
    const draft = createWeightedTradeSearch(build, "ring1", "survivability", { amount: 100, currency: "chaos" });
    const fire = draft.options.find((option) => option.id === "pseudo.pseudo_total_fire_resistance");
    const lightning = draft.options.find((option) => option.id === "pseudo.pseudo_total_lightning_resistance");
    expect(lightning?.weight).toBeGreaterThan(fire?.weight ?? 0);
  });

  it("formats both readable weights and query JSON for copying", () => {
    const draft = createWeightedTradeSearch(structuredClone(mockBuild), "weapon", "dps", { amount: 5, currency: "divine" });
    const text = formatWeightedSearchRecipe(draft, "Mirage");
    expect(text).toContain("Stat group: Weighted Sum");
    expect(text).toContain("Generated query JSON:");
    expect(text).toContain('"type": "weight"');
  });

  it("applies user weights and minimum score without mutating the generated draft", () => {
    const draft = createWeightedTradeSearch(structuredClone(mockBuild), "boots", "balanced", { amount: 5, currency: "divine" });
    const first = draft.options[0];
    const second = draft.options[1];
    const customized = customizeWeightedTradeSearch(draft, {
      weights: { [first.id]: -2.5, [second.id]: 0 },
      minimumScore: 12.75,
    });

    expect(customized.options[0].weight).toBe(-2.5);
    expect(customized.request.query.stats[0].filters).toContainEqual({ id: first.id, value: { weight: -2.5 } });
    expect(customized.request.query.stats[0].filters.some((filter) => filter.id === second.id)).toBe(false);
    expect(customized.request.query.stats[0].value.min).toBe(12.75);
    expect(draft.options[0].weight).toBe(first.weight);
  });
});
