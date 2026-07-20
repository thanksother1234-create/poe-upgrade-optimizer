import { describe, expect, it } from "vitest";
import { mockBuild } from "@/mocks/build";
import { isManualCandidateCompatible, ManualTradeMarketService, parseCopiedItemPrice, parseCopiedTradeItem } from "./manual-trade-market-service";

const copiedRing = `Item Class: Rings
Rarity: Rare
Gloom Circle
Opal Ring
--------
Item Level: 84
--------
25% increased Elemental Damage (implicit)
+70 to maximum Life
+35% to Chaos Resistance
--------
Note: ~price 2 divine`;

const copiedPandemoniumSpell = `Item Class: Wands
Rarity: Rare
Pandemonium Spell
Synthesised Kinetic Wand
--------
Wand
Quality: +30% (augmented)
Physical Damage: 29-54
Elemental Damage: 21-344 (augmented)
Critical Strike Chance: 11.22% (augmented)
Attacks per Second: 1.90 (augmented)
--------
Requirements:
Level: 67
Int: 188
--------
Sockets: W-W-W
--------
Item Level: 84
--------
Quality does not increase Physical Damage (enchant)
1% increased Critical Strike Chance per 4% Quality (enchant)
--------
+30% to Global Critical Strike Multiplier (implicit)
Adds 2 to 4 Fire Damage to Attacks with this Weapon per 10 Strength (implicit)
1% increased Spell Damage per 16 Strength (implicit)
--------
109% increased Spell Damage
Adds 21 to 344 Lightning Damage
19% increased Attack Speed
+38% to Global Critical Strike Multiplier
Attacks with this Weapon Penetrate 16% Chaos Resistance
+24 to Strength and Intelligence (crafted)
25% increased Critical Strike Chance (crafted)
--------
Split
--------
Synthesised Item
--------
Note: ~b/o 10000 divine`;

describe("manual trade candidates", () => {
  it("parses copied item text without using the PoE trade API", () => {
    const item = parseCopiedTradeItem({ id: "manual-1", slot: "ring1", rawText: copiedRing, league: "Mirage" });
    expect(item).toMatchObject({
      id: "manual-1", slot: "ring1", name: "Gloom Circle", baseType: "Opal Ring", itemClass: "Rings",
      price: { amount: 2, currency: "divine" }, tradeUrl: "https://www.pathofexile.com/trade/search/Mirage",
    });
    expect(item.modifiers.map((modifier) => modifier.label)).toContain("+70 to maximum Life");
    expect(item.rawText).toBe(copiedRing);
  });

  it("reads both fixed-price and buyout notes from copied trade items", () => {
    expect(parseCopiedItemPrice(copiedRing)).toEqual({ amount: 2, currency: "divine" });
    expect(parseCopiedItemPrice("Item Class: Rings\nNote: ~b/o 75 chaos")).toEqual({ amount: 75, currency: "chaos" });
    expect(parseCopiedItemPrice("Item Class: Rings\nNote: ~b/o 15 mirror")).toEqual({ amount: 15, currency: "mirror" });
    expect(() => parseCopiedItemPrice("Item Class: Rings\nRarity: Rare")).toThrow(/needs its trade note/i);
  });

  it("validates the selected equipment slot", () => {
    const ring = parseCopiedTradeItem({ id: "manual-1", slot: "ring1", rawText: copiedRing, price: { amount: 2, currency: "divine" }, league: "Mirage" });
    const wrongSlot = { ...ring, slot: "boots" as const };
    expect(isManualCandidateCompatible(mockBuild, ring)).toBe(true);
    expect(isManualCandidateCompatible(mockBuild, wrongSlot)).toBe(false);
  });

  it("returns every compatible candidate so PoB can compare over-budget items", async () => {
    const affordable = parseCopiedTradeItem({ id: "manual-1", slot: "ring1", rawText: copiedRing, price: { amount: 2, currency: "divine" }, league: "Mirage" });
    const expensive = { ...affordable, id: "manual-2", price: { amount: 20, currency: "divine" as const } };
    const service = new ManualTradeMarketService([affordable, expensive]);
    await expect(service.searchUpgrades(mockBuild, "ring1", { amount: 5, currency: "divine" }, "Mirage")).resolves.toEqual([affordable, expensive]);
  });

  it("keeps the supplied 10,000-divine wand available under a 5-divine budget", async () => {
    const wand = parseCopiedTradeItem({
      id: "pandemonium-spell",
      slot: "weapon",
      rawText: copiedPandemoniumSpell,
      league: "Mirage",
    });
    const service = new ManualTradeMarketService([wand]);
    expect(isManualCandidateCompatible(mockBuild, wand)).toBe(true);
    await expect(service.searchUpgrades(mockBuild, "weapon", { amount: 5, currency: "divine" }, "Mirage")).resolves.toEqual([wand]);
  });
});
