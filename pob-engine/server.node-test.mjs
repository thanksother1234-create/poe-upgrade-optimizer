import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { prepareTimelessData } from "./prepare-timeless-data.mjs";
import { createConcurrencyLimiter, createEvaluationQueue, createPobEngineServer, parseEngineOutput, prepareBuildWithReplacements, replaceItemsInBuildXml, validateBaseline } from "./server.mjs";

const buildXml = `<PathOfBuilding><Items activeItemSet="2"><Item id="4">Rarity: RARE\nOld Ring\nRuby Ring</Item><ItemSet id="1"><Slot name="Ring 1" itemId="0"/></ItemSet><ItemSet id="2"><Slot itemId="4" name="Ring 1"/></ItemSet></Items></PathOfBuilding>`;

test("adds the listing text and assigns it in the active item set", () => {
  const replacement = { slot: "ring1", rawText: "Item Class: Rings\nRarity: RARE\nNew & Better\nOpal Ring" };
  const replaced = replaceItemsInBuildXml(buildXml, [replacement]);
  assert.match(replaced, /<Item id="5">/);
  assert.match(replaced, /New &amp; Better/);
  assert.match(replaced, /<ItemSet id="2"><Slot itemId="5" name="Ring 1"\/><\/ItemSet>/);
  assert.match(replaced, /<ItemSet id="1"><Slot name="Ring 1" itemId="0"\/><\/ItemSet>/);
  assert.deepEqual(prepareBuildWithReplacements(buildXml, [replacement]).expectedAssignments, [
    { slotName: "Ring 1", itemId: 5, itemName: "New & Better" },
  ]);
});

test("supports multiple replacements in one scenario", () => {
  const replaced = replaceItemsInBuildXml(buildXml, [
    { slot: "ring1", rawText: "Rarity: RARE\nFirst\nOpal Ring" },
    { slot: "belt", rawText: "Rarity: RARE\nSecond\nHeavy Belt" },
  ]);
  assert.match(replaced, /<Slot itemId="5" name="Ring 1"\/>/);
  assert.match(replaced, /<Slot name="Belt" itemId="6"\/>/);
});

test("replaces the active swap weapon when the item set uses its second weapon set", () => {
  const swapBuild = `<PathOfBuilding><Items activeItemSet="1"><Item id="1">Old Sword</Item><ItemSet id="1" useSecondWeaponSet="true"><Slot name="Weapon 1" itemId="0"/><Slot name="Weapon 1 Swap" itemId="1"/></ItemSet></Items></PathOfBuilding>`;
  const replaced = replaceItemsInBuildXml(swapBuild, [{ slot: "weapon", rawText: "Rarity: RARE\nNew Sword\nCorsair Sword" }]);
  assert.match(replaced, /<Slot name="Weapon 1" itemId="0"\/>/);
  assert.match(replaced, /<Slot name="Weapon 1 Swap" itemId="2"\/>/);
});

test("parses metrics after Path of Building log prefixes and reports a missing candidate", () => {
  const metricValues = Array.from({ length: 14 }, (_, index) => String(index + 1)).join("\t");
  const output = `PoB startup log\nworker: POE_DPS_METRIC\t0\tFullDPS\n\u001b[32mworker: POE_METRICS\t0\t${metricValues}\u001b[0m\n`;
  const parsed = parseEngineOutput(output, ["candidate-1"]);
  assert.equal(parsed.baseline.totalDps, 1);
  assert.equal(parsed.baseline.chaosResistance, 14);
  assert.equal(parsed.dpsMetric, "FullDPS");
  assert.deepEqual(parsed.results, [{ id: "candidate-1", error: "Path of Building did not return metrics for this candidate." }]);
});

test("limits fresh worker processes across concurrent jobs", async () => {
  const runLimited = createConcurrencyLimiter(2);
  let active = 0;
  let maximum = 0;
  await Promise.all(Array.from({ length: 6 }, (_, index) => runLimited(async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 5 + (index % 2)));
    active -= 1;
  })));
  assert.equal(maximum, 2);
  assert.equal(active, 0);
});

test("accepts a recalculated baseline that matches the imported PoB snapshot", () => {
  const expected = { totalDps: 1_000_000, effectiveHitPool: 50_000, life: 5_000 };
  const actual = { totalDps: 1_005_000, effectiveHitPool: 49_900, life: 5_000 };
  assert.deepEqual(validateBaseline(expected, actual, "CombinedDPS", "CombinedDPS"), []);
});

test("reports material baseline and DPS-mode mismatches", () => {
  const mismatches = validateBaseline(
    { totalDps: 6_700_000, effectiveHitPool: 46_579 },
    { totalDps: 58_405, effectiveHitPool: 8_011 },
    "FullDPS",
    "CombinedDPS",
  );
  assert.match(mismatches.join(" "), /saved as FullDPS.*CombinedDPS/i);
  assert.match(mismatches.join(" "), /totalDps was 6700000.*58405/i);
  assert.match(mismatches.join(" "), /effectiveHitPool was 46579.*8011/i);
});

test("cached PoB snapshot mismatches prevent ranking against the wrong baseline", async () => {
  const source = await readFile(new URL("./server.mjs", import.meta.url), "utf8");
  assert.match(source, /baselineMismatches\.length\)\s*\{\s*throw/);
  assert.match(source, /no candidates were ranked/);
});

test("Docker image includes every local module imported by the engine entry point", async () => {
  const dockerfile = await readFile(new URL("./Dockerfile", import.meta.url), "utf8");
  assert.match(dockerfile, /COPY\s+package\.json\s+server\.mjs\s+durable-queue\.mjs\s+\.\//);
});

test("worker safely rebinds loaded build sets before calculating", async () => {
  const source = await readFile(new URL("./OptimizerWorker.lua", import.meta.url), "utf8");
  assert.match(source, /POB_SOURCE_PATH[\s\S]*GetScriptPath\(\)/);
  assert.match(source, /function NewFileSearch\(fileName\)[\s\S]*%.bin\$/);
  assert.match(source, /build\.spec = treeTab\.specList\[activeSpec\]/);
  assert.match(source, /itemsTab\.activeItemSet = itemsTab\.itemSets\[activeItemSetId\]/);
  assert.match(source, /slot\.selItemId = savedSlot\.selItemId/);
  assert.match(source, /skillsTab\.socketGroupList = skillsTab\.skillSets\[activeSkillSetId\]\.socketGroupList/);
  assert.match(source, /configTab\.input = configTab\.configSets\[activeConfigSetId\]\.input[\s\S]*BuildModList\(\)/);
  assert.match(source, /loadBuildFromXML\(xml, "optimizer"\)[\s\S]*restoreActiveBuildState\(\)[\s\S]*settleCalculations\(\)/);
});

test("prepares single and split timeless-jewel tables for headless PoB", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pob-timeless-test-"));
  try {
    const lethalPride = Buffer.from("lethal-pride-data");
    const gloriousVanity = deflateSync(Buffer.from("glorious-vanity-data"));
    await writeFile(join(directory, "LethalPride.zip"), deflateSync(lethalPride));
    await writeFile(join(directory, "GloriousVanity.zip.part0"), gloriousVanity.subarray(0, 5));
    await writeFile(join(directory, "GloriousVanity.zip.part1"), gloriousVanity.subarray(5));
    await prepareTimelessData(directory);
    assert.deepEqual(await readFile(join(directory, "LethalPride.bin")), lethalPride);
    assert.equal((await readFile(join(directory, "GloriousVanity.bin"))).toString(), "glorious-vanity-data");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("queues whole evaluations in FIFO order and reports changing positions", async () => {
  const queue = createEvaluationQueue({ concurrency: 1, maxQueued: 2 });
  const releases = [];
  const positions = [[], [], []];
  const tasks = [0, 1, 2].map((index) => queue.enqueue(
    () => new Promise((resolve) => releases[index] = resolve),
    ({ position }) => positions[index].push(position),
  ));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(queue.status().active, 1);
  assert.equal(queue.status().queued, 2);
  assert.equal(positions[1].at(-1), 1);
  assert.equal(positions[2].at(-1), 2);
  releases[0]("first");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(positions[1].at(-1), 0);
  assert.equal(positions[2].at(-1), 1);
  releases[1]("second");
  await new Promise((resolve) => setImmediate(resolve));
  releases[2]("third");
  assert.deepEqual(await Promise.all(tasks), ["first", "second", "third"]);
});

test("rejects new evaluations when the bounded queue is full", async () => {
  const queue = createEvaluationQueue({ concurrency: 1, maxQueued: 1 });
  let release;
  const running = queue.enqueue(() => new Promise((resolve) => release = resolve));
  const waiting = queue.enqueue(async () => "waiting");
  assert.throws(() => queue.enqueue(async () => "overflow"), /queue is full/i);
  await new Promise((resolve) => setImmediate(resolve));
  release("running");
  assert.deepEqual(await Promise.all([running, waiting]), ["running", "waiting"]);
});

test("removes a disconnected request while it is still queued", async () => {
  const queue = createEvaluationQueue({ concurrency: 1, maxQueued: 2 });
  let release;
  const running = queue.enqueue(() => new Promise((resolve) => release = resolve));
  const cancellation = new AbortController();
  const cancelled = queue.enqueue(async () => "should not run", undefined, cancellation.signal);
  cancellation.abort();
  await assert.rejects(cancelled, /cancelled/i);
  assert.equal(queue.status().queued, 0);
  await new Promise((resolve) => setImmediate(resolve));
  release("done");
  await running;
});

test("includes worker diagnostics when no baseline marker is returned", () => {
  assert.throws(
    () => parseEngineOutput("initialising", [], "Lua worker failed"),
    /Worker output: Lua worker failed \| initialising/,
  );
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
    const details = await root.json();
    assert.equal(details.name, "PoE Upgrade Optimizer Engine");
    assert.equal(details.ok, true);
    assert.equal(details.engineVersion, "v2.65.0");
    assert.deepEqual(details.endpoints, { health: "GET /health", evaluate: "POST /evaluate" });
    assert.deepEqual(details.queue, { active: 0, queued: 0, concurrency: 1, maxQueued: 12 });

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
