import { describe, expect, it } from "vitest";
import { mockBuild } from "@/mocks/build";
import { isManualCandidateCompatible, ManualTradeMarketService, parseCopiedTradeItem } from "./manual-trade-market-service";

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

describe("manual trade candidates", () => {
  it("parses copied item text without using the PoE trade API", () => {
    const item = parseCopiedTradeItem({ id: "manual-1", slot: "ring1", rawText: copiedRing, price: { amount: 2, currency: "divine" }, league: "Mirage" });
    expect(item).toMatchObject({
      id: "manual-1", slot: "ring1", name: "Gloom Circle", baseType: "Opal Ring", itemClass: "Rings",
      price: { amount: 2, currency: "divine" }, tradeUrl: "https://www.pathofexile.com/trade/search/Mirage",
    });
    expect(item.modifiers.map((modifier) => modifier.label)).toContain("+70 to maximum Life");
    expect(item.rawText).toBe(copiedRing);
  });

  it("validates the selected equipment slot", () => {
    const ring = parseCopiedTradeItem({ id: "manual-1", slot: "ring1", rawText: copiedRing, price: { amount: 2, currency: "divine" }, league: "Mirage" });
    const wrongSlot = { ...ring, slot: "boots" as const };
    expect(isManualCandidateCompatible(mockBuild, ring)).toBe(true);
    expect(isManualCandidateCompatible(mockBuild, wrongSlot)).toBe(false);
  });

  it("returns only compatible candidates within budget", async () => {
    const affordable = parseCopiedTradeItem({ id: "manual-1", slot: "ring1", rawText: copiedRing, price: { amount: 2, currency: "divine" }, league: "Mirage" });
    const expensive = { ...affordable, id: "manual-2", price: { amount: 20, currency: "divine" as const } };
    const service = new ManualTradeMarketService([affordable, expensive]);
    await expect(service.searchUpgrades(mockBuild, "ring1", { amount: 5, currency: "divine" }, "Mirage")).resolves.toEqual([affordable]);
  });
});
