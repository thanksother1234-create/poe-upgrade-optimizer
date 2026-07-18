import { describe, expect, it } from "vitest";
import { Item } from "@/models";
import { getTradeCategory } from "./trade-categories";

const item = (itemClass: string, baseType = "Test Base"): Item => ({
  id: "item",
  name: "Test Item",
  baseType,
  itemClass,
  rarity: "rare",
  modifiers: [],
});

describe("trade categories", () => {
  it("uses the imported PoB item class for every supported weapon family", () => {
    expect(getTradeCategory("weapon", item("Two Hand Swords"))).toBe("weapon.twosword");
    expect(getTradeCategory("weapon", item("Bows"))).toBe("weapon.bow");
    expect(getTradeCategory("weapon", item("Rune Daggers"))).toBe("weapon.runedagger");
    expect(getTradeCategory("weapon", item("Staves"))).toBe("weapon.staff");
  });

  it("uses slot categories for jewellery and armour", () => {
    expect(getTradeCategory("ring1", item("Rings"))).toBe("accessory.ring");
    expect(getTradeCategory("boots", item("Boots"))).toBe("armour.boots");
  });

  it("keeps legacy greatsword builds compatible when item class is absent", () => {
    expect(getTradeCategory("weapon", item("", "Engraved Greatsword"))).toBe("weapon.twosword");
  });
});
