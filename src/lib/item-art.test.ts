import { describe, expect, it } from "vitest";
import { Item } from "@/models";
import { getItemArtworkCandidates, getMagicFlaskBaseType } from "@/lib/item-art";

const item = (overrides: Partial<Item> = {}): Item => ({
  id: "pob-item-1",
  name: "Corruption Twirl",
  baseType: "Helical Ring",
  rarity: "rare",
  modifiers: [],
  ...overrides,
});

describe("getItemArtworkCandidates", () => {
  it("uses the official CDN artwork for a Helical Ring", () => {
    expect(getItemArtworkCandidates(item())).toEqual([
      "https://web.poecdn.com/image/Art/2DItems/Rings/HeistRing1Dark.png?scale=1&w=1&h=1",
    ]);
  });

  it("tries exact unique artwork before the base artwork", () => {
    expect(getItemArtworkCandidates(item({ name: "Mageblood", baseType: "Heavy Belt", rarity: "unique" }))).toEqual([
      "https://web.poecdn.com/image/Art/2DItems/Belts/InjectorBelt.png?scale=1&w=2&h=1",
      "https://web.poecdn.com/image/Art/2DItems/Belts/Belt5.png?scale=1&w=2&h=1",
    ]);
  });

  it("does not request artwork for an empty equipment slot", () => {
    expect(getItemArtworkCandidates(item({ id: "empty-offhand", baseType: "No item equipped" }))).toEqual([]);
  });

  it.each([
    ["Dabbler's Amethyst Flask of Piercing", "Amethyst Flask", "Amethyst.png"],
    ["Alchemist's Diamond Flask of the Mockingbird", "Diamond Flask", "diamond.png"],
    ["Alchemist's Quicksilver Flask of the Abalone", "Quicksilver Flask", "sprint.png"],
    ["Abecedarian's Bismuth Flask of the Rainbow", "Bismuth Flask", "bismuth.png"],
  ])("extracts %s from PoB's affixed magic-flask name", (name, baseType, artwork) => {
    const flask = item({ name, baseType: "Unique ID: imported-without-a-base-line", rarity: "magic" });
    expect(getMagicFlaskBaseType(flask)).toBe(baseType);
    expect(getItemArtworkCandidates(flask, { magicFlaskBase: true })).toEqual([
      `https://web.poecdn.com/image/Art/2DItems/Flasks/${artwork}?scale=1&w=1&h=2`,
    ]);
  });

  it("keeps unique flask artwork instead of applying the magic-flask rule", () => {
    const flask = item({ name: "Dying Sun", baseType: "Ruby Flask", rarity: "unique" });
    expect(getMagicFlaskBaseType(flask)).toBeUndefined();
    expect(getItemArtworkCandidates(flask, { magicFlaskBase: true })).toEqual([
      "https://web.poecdn.com/image/Art/2DItems/Flasks/ShapersFlask.png?scale=1&w=1&h=2",
      "https://web.poecdn.com/image/Art/2DItems/Flasks/ruby.png?scale=1&w=1&h=2",
    ]);
  });
});
