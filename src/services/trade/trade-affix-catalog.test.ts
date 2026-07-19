import { describe, expect, it } from "vitest";
import { mockBuild } from "@/mocks/build";
import { getManualTradeAffixes } from "@/services/trade/weighted-stat-catalog";

describe("generated trade affix catalog", () => {
  it("includes weapon penetration affixes with official trade IDs", () => {
    const affixes = getManualTradeAffixes(mockBuild, "weapon");
    expect(affixes.length).toBeGreaterThan(100);
    expect(affixes).toContainEqual(expect.objectContaining({
      id: "explicit.stat_2101383955",
      label: "Damage Penetrates #% Elemental Resistances",
    }));
  });

  it("does not offer a weapon-only penetration affix on boots", () => {
    const affixes = getManualTradeAffixes(mockBuild, "boots");
    expect(affixes).not.toContainEqual(expect.objectContaining({ id: "explicit.stat_2101383955" }));
  });
});
