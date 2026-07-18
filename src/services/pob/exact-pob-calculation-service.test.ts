import { afterEach, describe, expect, it, vi } from "vitest";
import { mockBuild } from "@/mocks/build";
import { TradeItem } from "@/models";
import { ExactPobCalculationService } from "./exact-pob-calculation-service";

afterEach(() => vi.unstubAllGlobals());

describe("ExactPobCalculationService", () => {
  it("batches raw listing text and returns only PoB-verified metric differences", async () => {
    const baseline = structuredClone(mockBuild.metrics);
    const improved = { ...baseline, totalDps: baseline.totalDps + 100_000, effectiveHitPool: baseline.effectiveHitPool + 2_000 };
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { scenarios: { id: string; replacements: { rawText: string }[] }[] };
      expect(init?.headers).toMatchObject({ Authorization: "Bearer secret" });
      expect(request.scenarios[0].replacements[0].rawText).toContain("Verified Ring");
      return Response.json({ engineVersion: "v2.65.0", baseline, results: [{ id: request.scenarios[0].id, metrics: improved }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const item: TradeItem = {
      id: "listing", slot: "ring1", name: "Verified Ring", baseType: "Opal Ring", rarity: "rare",
      modifiers: [], imageUrl: "https://web.poecdn.com/item.png", price: { amount: 2, currency: "divine" },
      rawText: "Item Class: Rings\nRarity: RARE\nVerified Ring\nOpal Ring",
    };
    const build = { ...structuredClone(mockBuild), sourceXml: "<PathOfBuilding></PathOfBuilding>" };
    const result = await new ExactPobCalculationService("https://engine.example", "secret").simulateItemReplacements(build, [item]);

    expect(result.verification).toBe("pob");
    expect(result.engineVersion).toBe("v2.65.0");
    expect(result.simulations[0].changes).toMatchObject({ totalDps: 100_000, effectiveHitPool: 2_000 });
    expect(result.simulations[0].item.rawText).toBeUndefined();
  });
});
