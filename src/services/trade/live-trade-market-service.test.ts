import { afterEach, describe, expect, it, vi } from "vitest";
import { mockBuild } from "@/mocks/build";
import { LiveTradeMarketService, normalizePoeUserAgent } from "./live-trade-market-service";

afterEach(() => vi.unstubAllGlobals());

describe("LiveTradeMarketService", () => {
  it("fetches, decodes, and maps a real trade listing shape", async () => {
    const rawText = "Item Class: Rings\r\nRarity: RARE\r\nDoom Loop\r\nOpal Ring\r\n--------\r\n+70 to maximum Life";
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("user-agent")).toBe("OAuth TestAgent/1.0");
      if (init?.method === "POST") {
        const request = JSON.parse(String(init.body)) as { query: { filters: { type_filters: { filters: { category: { option: string } } } } } };
        expect(request.query.filters.type_filters.filters.category.option).toBe("accessory.ring");
        return Response.json({ id: "search123", result: ["listing123"] });
      }
      return Response.json({
        result: [{
          id: "listing123",
          listing: { price: { amount: 2, currency: "divine" } },
          item: {
            name: "Doom Loop", typeLine: "Opal Ring", baseType: "Opal Ring", rarity: "Rare",
            icon: "https://web.poecdn.com/item.png",
            explicitMods: [{ description: "+70 to maximum Life" }],
            extended: { text: Buffer.from(rawText).toString("base64") },
          },
        }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const items = await new LiveTradeMarketService("TestAgent/1.0", 3).searchUpgrades(
      structuredClone(mockBuild), "ring1", { amount: 5, currency: "divine" }, "Standard",
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "listing123", slot: "ring1", name: "Doom Loop", baseType: "Opal Ring", itemClass: "Rings",
      price: { amount: 2, currency: "divine" }, rawText,
    });
    expect(items[0].modifiers[0].label).toBe("+70 to maximum Life");
    expect(items[0].tradeUrl).toContain("/trade/search/Standard/search123");
  });

  it("normalizes the required OAuth User-Agent prefix", () => {
    expect(normalizePoeUserAgent("PoEUpgradeOptimizer/0.2 (contact: owner@example.com)"))
      .toBe("OAuth PoEUpgradeOptimizer/0.2 (contact: owner@example.com)");
    expect(normalizePoeUserAgent("OAuth ExistingClient/1.0 (contact: owner@example.com)"))
      .toBe("OAuth ExistingClient/1.0 (contact: owner@example.com)");
  });
});
