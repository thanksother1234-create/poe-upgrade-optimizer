import { describe, expect, it } from "vitest";
import { mockBuild } from "@/mocks/build";
import { createWeightedTradeSearch, formatWeightedSearchRecipe } from "./weighted-search-service";

describe("weighted trade search", () => {
  it("creates an official weighted-sum request with category and budget filters", () => {
    const draft = createWeightedTradeSearch(structuredClone(mockBuild), "boots", "balanced", { amount: 5, currency: "divine" });
    expect(draft.category).toBe("armour.boots");
    expect(draft.request.query.stats[0].type).toBe("weight");
    expect(draft.request.query.filters.trade_filters.filters.price).toEqual({ max: 5, option: "divine" });
    expect(draft.request.query.filters.type_filters?.filters.category.option).toBe("armour.boots");
    expect(draft.request.sort).toEqual({ "statgroup.0": "desc" });
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
});
