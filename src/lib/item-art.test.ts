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
  it("uses the shared Geodesic Ring artwork for a Helical Ring", () => {
    expect(getItemArtworkCandidates(item())).toEqual([
      "https://www.poewiki.net/wiki/Special:Redirect/file/Geodesic_Ring_inventory_icon.png",
    ]);
  });

  it("tries exact unique artwork before the base artwork", () => {
    expect(getItemArtworkCandidates(item({ name: "Mageblood", baseType: "Heavy Belt", rarity: "unique" }))).toEqual([
      "https://www.poewiki.net/wiki/Special:Redirect/file/Mageblood_inventory_icon.png",
      "https://www.poewiki.net/wiki/Special:Redirect/file/Heavy_Belt_inventory_icon.png",
    ]);
  });

  it("does not request artwork for an empty equipment slot", () => {
    expect(getItemArtworkCandidates(item({ id: "empty-offhand", baseType: "No item equipped" }))).toEqual([]);
  });
});
