import assert from "node:assert/strict";
import test from "node:test";
import { createPobEngineServer, replaceItemsInBuildXml } from "./server.mjs";

const buildXml = `<PathOfBuilding><Items activeItemSet="2"><Item id="4">Rarity: RARE\nOld Ring\nRuby Ring</Item><ItemSet id="1"><Slot name="Ring 1" itemId="0"/></ItemSet><ItemSet id="2"><Slot itemId="4" name="Ring 1"/></ItemSet></Items></PathOfBuilding>`;

test("adds the listing text and assigns it in the active item set", () => {
  const replaced = replaceItemsInBuildXml(buildXml, [{ slot: "ring1", rawText: "Item Class: Rings\nRarity: RARE\nNew & Better\nOpal Ring" }]);
  assert.match(replaced, /<Item id="5">/);
  assert.match(replaced, /New &amp; Better/);
  assert.match(replaced, /<ItemSet id="2"><Slot itemId="5" name="Ring 1"\/><\/ItemSet>/);
  assert.match(replaced, /<ItemSet id="1"><Slot name="Ring 1" itemId="0"\/><\/ItemSet>/);
});

test("supports multiple replacements in one scenario", () => {
  const replaced = replaceItemsInBuildXml(buildXml, [
    { slot: "ring1", rawText: "Rarity: RARE\nFirst\nOpal Ring" },
    { slot: "belt", rawText: "Rarity: RARE\nSecond\nHeavy Belt" },
  ]);
  assert.match(replaced, /<Slot itemId="5" name="Ring 1"\/>/);
  assert.match(replaced, /<Slot name="Belt" itemId="6"\/>/);
});

async function withServer(options, callback) {
  const server = createPobEngineServer(options);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("reports whether the hosted engine is configured", async () => {
  await withServer({ engineToken: "space-secret" }, async (baseUrl) => {
    const root = await fetch(baseUrl);
    assert.equal(root.status, 200);
    assert.deepEqual(await root.json(), {
      name: "PoE Upgrade Optimizer Engine",
      ok: true,
      engineVersion: "v2.65.0",
      status: "ready",
      endpoints: { health: "GET /health", evaluate: "POST /evaluate", tradeListings: "POST /trade/listings" },
    });

    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);
  });
});

test("does not expose evaluation when ENGINE_TOKEN is missing", async () => {
  await withServer({ engineToken: "" }, async (baseUrl) => {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 503);

    const evaluation = await fetch(`${baseUrl}/evaluate`, { method: "POST", body: "{}" });
    assert.equal(evaluation.status, 503);
    assert.match((await evaluation.json()).error, /ENGINE_TOKEN/);
  });
});

test("rejects evaluation requests with the wrong bearer token", async () => {
  await withServer({ engineToken: "space-secret" }, async (baseUrl) => {
    const evaluation = await fetch(`${baseUrl}/evaluate`, {
      method: "POST",
      headers: { Authorization: "Bearer wrong-secret" },
      body: "{}",
    });
    assert.equal(evaluation.status, 401);
  });
});

test("proxies authenticated trade requests with pacing-safe shared caching", async () => {
  const upstreamCalls = [];
  const rawText = "Item Class: Rings\nRarity: RARE\nTest Ring\nAmethyst Ring";
  const fetchImpl = async (url, init = {}) => {
    upstreamCalls.push({ url: String(url), init });
    assert.equal(new Headers(init.headers).get("user-agent"), "OAuth TestAgent/1.0 (contact: owner@example.com)");
    if (init.method === "POST") return Response.json({ id: "query-123", result: ["listing-123"] });
    return Response.json({
      result: [{
        id: "listing-123",
        listing: { price: { amount: 1, currency: "divine" } },
        item: { name: "Test Ring", typeLine: "Amethyst Ring", icon: "https://web.poecdn.com/item.png", extended: { text: Buffer.from(rawText).toString("base64") } },
      }],
    });
  };

  await withServer({ engineToken: "space-secret", fetchImpl, tradeSearchIntervalMs: 0, tradeFetchIntervalMs: 0 }, async (baseUrl) => {
    const payload = {
      league: "Mirage",
      limit: 10,
      userAgent: "OAuth TestAgent/1.0 (contact: owner@example.com)",
      query: { query: { status: { option: "online" } }, sort: { price: "desc" } },
    };
    const request = () => fetch(`${baseUrl}/trade/listings`, {
      method: "POST",
      headers: { Authorization: "Bearer space-secret", "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const first = await request();
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), {
      engineVersion: "v2.65.0",
      queryId: "query-123",
      result: [{
        id: "listing-123",
        listing: { price: { amount: 1, currency: "divine" } },
        item: { name: "Test Ring", typeLine: "Amethyst Ring", icon: "https://web.poecdn.com/item.png", extended: { text: Buffer.from(rawText).toString("base64") } },
      }],
    });
    const cached = await request();
    assert.equal(cached.status, 200);
    assert.equal(upstreamCalls.length, 2);
  });
});

test("does not expose the trade gateway without the engine bearer token", async () => {
  await withServer({ engineToken: "space-secret", tradeSearchIntervalMs: 0, tradeFetchIntervalMs: 0 }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/trade/listings`, { method: "POST", body: "{}" });
    assert.equal(response.status, 401);
  });
});
