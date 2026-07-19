import { describe, expect, it } from "vitest";
import { Item } from "@/models";
import { getItemArtworkCandidates } from "@/lib/item-art";

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
});
