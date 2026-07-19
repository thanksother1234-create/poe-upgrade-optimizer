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
      return Response.json({ engineVersion: "v2.65.0", dpsMetric: "FullDPS", baseline, results: [{ id: request.scenarios[0].id, metrics: improved }] });
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
    expect(result.dpsMetric).toBe("FullDPS");
    expect(result.simulations[0].changes).toMatchObject({ totalDps: 100_000, effectiveHitPool: 2_000 });
    expect(result.simulations[0].item.rawText).toBeUndefined();
  });

  it("names the candidate when PoB rejects or fails to equip it", async () => {
    const baseline = structuredClone(mockBuild.metrics);
    vi.stubGlobal("fetch", vi.fn(async (_url: URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { scenarios: { id: string }[] };
      return Response.json({
        engineVersion: "v2.65.0",
        dpsMetric: "CombinedDPS",
        baseline,
        results: [{ id: request.scenarios[0].id, error: "Path of Building assigned item 33 to Ring 1 but rejected the candidate item text." }],
      });
    }));
    const item: TradeItem = {
      id: "bad-listing", slot: "ring1", name: "Unreadable Ring", baseType: "Opal Ring", rarity: "rare",
      modifiers: [], price: { amount: 1, currency: "divine" }, rawText: "Rarity: RARE\nUnreadable Ring\nOpal Ring",
    };
    const build = { ...structuredClone(mockBuild), sourceXml: "<PathOfBuilding></PathOfBuilding>" };
    await expect(new ExactPobCalculationService("https://engine.example", "secret").simulateItemReplacements(build, [item]))
      .rejects.toThrow(/could not evaluate Unreadable Ring.*rejected the candidate item text/i);
  });

  it("duplicates a ring candidate into both slots for a Kalandra's Touch build", async () => {
    const baseline = structuredClone(mockBuild.metrics);
    const improved = { ...baseline, totalDps: baseline.totalDps + 250_000 };
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        scenarios: { id: string; replacements: { slot: string; rawText: string }[] }[];
      };
      expect(request.scenarios[0].replacements).toEqual([
        { slot: "ring1", rawText: expect.stringContaining("Reflected Upgrade") },
        { slot: "ring2", rawText: expect.stringContaining("Reflected Upgrade") },
      ]);
      return Response.json({
        engineVersion: "v2.65.0",
        dpsMetric: "CombinedDPS",
        baseline,
        results: [{ id: request.scenarios[0].id, metrics: improved }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const item: TradeItem = {
      id: "reflected-ring", slot: "ring2", name: "Reflected Upgrade", baseType: "Amethyst Ring", rarity: "rare",
      modifiers: [], price: { amount: 5, currency: "divine" },
      rawText: "Item Class: Rings\nRarity: RARE\nReflected Upgrade\nAmethyst Ring",
    };
    const build = {
      ...structuredClone(mockBuild),
      sourceXml: "<PathOfBuilding></PathOfBuilding>",
      kalandrasTouch: { touchSlot: "ring2" as const, sourceSlot: "ring1" as const },
    };
    const result = await new ExactPobCalculationService("https://engine.example", "secret")
      .simulateItemReplacements(build, [item]);

    expect(result.simulations[0].slot).toBe("ring2");
    expect(result.simulations[0].changes.totalDps).toBe(250_000);
  });
});
