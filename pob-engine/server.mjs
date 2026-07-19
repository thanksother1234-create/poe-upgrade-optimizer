import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_SCENARIOS = 20;
const DEFAULT_WORKER_CONCURRENCY = 2;
const MAX_WORKER_CONCURRENCY = 4;
const DEFAULT_JOB_CONCURRENCY = 1;
const MAX_JOB_CONCURRENCY = 2;
const DEFAULT_MAX_QUEUED_JOBS = 12;
const MAX_QUEUED_JOBS = 50;
const SLOT_NAMES = {
  weapon: "Weapon 1",
  offhand: "Weapon 2",
  helmet: "Helmet",
  bodyArmour: "Body Armour",
  gloves: "Gloves",
  boots: "Boots",
  amulet: "Amulet",
  ring1: "Ring 1",
  ring2: "Ring 2",
  belt: "Belt",
};
const METRIC_NAMES = [
  "totalDps", "effectiveHitPool", "physicalMaxHit", "elementalMaxHit", "chaosMaxHit",
  "life", "energyShield", "armour", "evasion", "spellSuppression", "fireResistance",
  "coldResistance", "lightningResistance", "chaosResistance",
];
const BASELINE_VALIDATION_METRICS = [
  "totalDps", "effectiveHitPool", "physicalMaxHit", "elementalMaxHit", "chaosMaxHit",
  "life", "energyShield", "armour", "evasion",
];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapeXmlText = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

export function createConcurrencyLimiter(limit) {
  const concurrency = boundedInteger(limit, DEFAULT_WORKER_CONCURRENCY, 1, MAX_WORKER_CONCURRENCY);
  const waiting = [];
  let active = 0;

  return async function runWithLimit(task) {
    if (active >= concurrency) await new Promise((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}

export function createEvaluationQueue({ concurrency, maxQueued } = {}) {
  const activeLimit = boundedInteger(concurrency, DEFAULT_JOB_CONCURRENCY, 1, MAX_JOB_CONCURRENCY);
  const queueLimit = boundedInteger(maxQueued, DEFAULT_MAX_QUEUED_JOBS, 1, MAX_QUEUED_JOBS);
  const waiting = [];
  let active = 0;

  const updatePositions = () => waiting.forEach((job, index) => job.onPosition?.({
    position: index + 1,
    queued: waiting.length,
    active,
  }));

  const pump = () => {
    while (active < activeLimit && waiting.length) {
      const job = waiting.shift();
      active += 1;
      job.onPosition?.({ position: 0, queued: waiting.length, active });
      updatePositions();
      Promise.resolve()
        .then(job.task)
        .then(job.resolve, job.reject)
        .finally(() => {
          active -= 1;
          pump();
          updatePositions();
        });
    }
  };

  return {
    enqueue(task, onPosition, signal) {
      if (waiting.length >= queueLimit) {
        throw Object.assign(new Error("The Path of Building queue is full. Please try again shortly."), { status: 429 });
      }
      return new Promise((resolve, reject) => {
        const job = { task, onPosition, resolve, reject };
        const abort = () => {
          const index = waiting.indexOf(job);
          if (index < 0) return;
          waiting.splice(index, 1);
          reject(Object.assign(new Error("The queued comparison was cancelled."), { status: 499 }));
          updatePositions();
        };
        if (signal?.aborted) {
          reject(Object.assign(new Error("The queued comparison was cancelled."), { status: 499 }));
          return;
        }
        signal?.addEventListener("abort", abort, { once: true });
        waiting.push(job);
        updatePositions();
        pump();
      });
    },
    status: () => ({ active, queued: waiting.length, concurrency: activeLimit, maxQueued: queueLimit }),
  };
}

const runWithWorkerLimit = createConcurrencyLimiter(process.env.POB_WORKER_CONCURRENCY);

function activeItemSetId(xml) {
  const itemsTag = xml.match(/<Items\b([^>]*)>/)?.[1] ?? "";
  return itemsTag.match(/\bactiveItemSet="([^"]+)"/)?.[1] ?? "1";
}

function usesSecondWeaponSet(xml, itemSetId) {
  const itemSetPattern = new RegExp(`<ItemSet\\b([^>]*\\bid="${escapeRegex(itemSetId)}"[^>]*)>`);
  const attributes = xml.match(itemSetPattern)?.[1] ?? "";
  return /\buseSecondWeaponSet="(?:true|1)"/i.test(attributes);
}

function nextItemId(xml) {
  const ids = [...xml.matchAll(/<Item\b[^>]*\bid="(\d+)"/g)].map((match) => Number(match[1]));
  return Math.max(0, ...ids) + 1;
}

function copiedItemName(rawText) {
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rarityIndex = lines.findIndex((line) => /^Rarity:\s*\w+/i.test(line));
  return rarityIndex >= 0 ? lines[rarityIndex + 1] ?? "" : "";
}

function addItem(xml, id, rawText) {
  const itemsStart = xml.search(/<Items\b[^>]*>/);
  if (itemsStart < 0) throw new Error("The build has no Items section.");
  const firstSet = xml.indexOf("<ItemSet", itemsStart);
  const itemsEnd = xml.indexOf("</Items>", itemsStart);
  const insertAt = firstSet >= 0 && firstSet < itemsEnd ? firstSet : itemsEnd;
  if (insertAt < 0) throw new Error("The build Items section is incomplete.");
  const itemXml = `<Item id="${id}">\n${escapeXmlText(rawText.replaceAll("\0", "").trim())}\n</Item>\n`;
  return `${xml.slice(0, insertAt)}${itemXml}${xml.slice(insertAt)}`;
}

function assignSlot(xml, itemSetId, slotName, itemId) {
  const itemSetPattern = new RegExp(`(<ItemSet\\b[^>]*\\bid="${escapeRegex(itemSetId)}"[^>]*>)([\\s\\S]*?)(</ItemSet>)`);
  const itemSetMatch = xml.match(itemSetPattern);
  if (!itemSetMatch) throw new Error(`The active item set ${itemSetId} could not be found.`);

  let content = itemSetMatch[2];
  const slotPattern = new RegExp(`<Slot\\b([^>]*\\bname="${escapeRegex(slotName)}"[^>]*)\\s*/>`);
  if (slotPattern.test(content)) {
    content = content.replace(slotPattern, (slot, attributes) => {
      const updated = /\bitemId="[^"]*"/.test(attributes)
        ? attributes.replace(/\bitemId="[^"]*"/, `itemId="${itemId}"`)
        : `${attributes} itemId="${itemId}"`;
      return `<Slot${updated}/>`;
    });
  } else {
    content = `${content}\n<Slot name="${slotName}" itemId="${itemId}"/>`;
  }
  return xml.replace(itemSetPattern, `$1${content}$3`);
}

export function prepareBuildWithReplacements(buildXml, replacements) {
  if (typeof buildXml !== "string" || !buildXml.includes("<PathOfBuilding")) throw new Error("A valid Path of Building XML export is required.");
  if (!Array.isArray(replacements) || !replacements.length) return { xml: buildXml, expectedAssignments: [] };

  const itemSetId = activeItemSetId(buildXml);
  const secondWeaponSet = usesSecondWeaponSet(buildXml, itemSetId);
  const expectedAssignments = [];
  let xml = buildXml;
  let itemId = nextItemId(xml);
  for (const replacement of replacements) {
    const regularSlotName = SLOT_NAMES[replacement?.slot];
    if (!regularSlotName || typeof replacement.rawText !== "string" || !replacement.rawText.trim()) throw new Error("Each replacement needs a supported slot and raw item text.");
    const slotName = secondWeaponSet && (replacement?.slot === "weapon" || replacement?.slot === "offhand")
      ? `${regularSlotName} Swap`
      : regularSlotName;
    xml = addItem(xml, itemId, replacement.rawText);
    xml = assignSlot(xml, itemSetId, slotName, itemId);
    expectedAssignments.push({ slotName, itemId, itemName: copiedItemName(replacement.rawText) });
    itemId += 1;
  }
  return { xml, expectedAssignments };
}

export function replaceItemsInBuildXml(buildXml, replacements) {
  return prepareBuildWithReplacements(buildXml, replacements).xml;
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Request body is too large."), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 });
  }
}

const stripAnsi = (value) => value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
const compactDiagnostic = (stdout, stderr) => stripAnsi(`${stderr ?? ""}\n${stdout ?? ""}`)
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .slice(-8)
  .join(" | ")
  .slice(0, 1_000);

export function parseEngineOutput(stdout, scenarioIds, stderr = "") {
  const metricsByIndex = new Map();
  const dpsMetricByIndex = new Map();
  const errorsByIndex = new Map();
  for (const rawLine of stdout.split(/\r?\n/)) {
    const cleanLine = stripAnsi(rawLine);
    const markerIndex = Math.max(
      cleanLine.indexOf("POE_METRICS\t"),
      cleanLine.indexOf("POE_DPS_METRIC\t"),
      cleanLine.indexOf("POE_ERROR\t"),
    );
    if (markerIndex < 0) continue;
    const fields = cleanLine.slice(markerIndex).split("\t");
    if (fields[0] === "POE_ERROR") errorsByIndex.set(Number(fields[1]), fields.slice(2).join("\t"));
    if (fields[0] === "POE_DPS_METRIC") dpsMetricByIndex.set(Number(fields[1]), fields[2]);
    if (fields[0] !== "POE_METRICS") continue;
    const index = Number(fields[1]);
    const values = fields.slice(2).map(Number);
    if (values.length !== METRIC_NAMES.length || values.some((value) => !Number.isFinite(value))) continue;
    metricsByIndex.set(index, Object.fromEntries(METRIC_NAMES.map((name, metricIndex) => [name, values[metricIndex]])));
  }
  if (errorsByIndex.has(0)) throw new Error(`Baseline build failed: ${errorsByIndex.get(0)}`);
  const baseline = metricsByIndex.get(0);
  if (!baseline) {
    const diagnostic = compactDiagnostic(stdout, stderr);
    throw new Error(`Path of Building did not return baseline metrics.${diagnostic ? ` Worker output: ${diagnostic}` : " The worker produced no output."}`);
  }
  const results = scenarioIds.map((id, index) => errorsByIndex.has(index + 1)
    ? { id, error: errorsByIndex.get(index + 1) }
    : metricsByIndex.has(index + 1)
      ? { id, metrics: metricsByIndex.get(index + 1), dpsMetric: dpsMetricByIndex.get(index + 1) ?? "CombinedDPS" }
      : { id, error: "Path of Building did not return metrics for this candidate." });
  return { baseline, dpsMetric: dpsMetricByIndex.get(0) ?? "CombinedDPS", results };
}

export function validateBaseline(expected, actual, expectedDpsMetric, actualDpsMetric, tolerance = 0.02) {
  if (!expected || typeof expected !== "object") return [];
  const mismatches = [];
  if (expectedDpsMetric && actualDpsMetric && expectedDpsMetric !== actualDpsMetric) {
    mismatches.push(`DPS mode was saved as ${expectedDpsMetric} but recalculated as ${actualDpsMetric}`);
  }
  for (const name of BASELINE_VALIDATION_METRICS) {
    const saved = Number(expected[name]);
    const recalculated = Number(actual?.[name]);
    if (!Number.isFinite(saved) || !Number.isFinite(recalculated) || saved === 0) continue;
    const relativeDifference = Math.abs(recalculated - saved) / Math.max(Math.abs(saved), 1);
    if (relativeDifference > tolerance) {
      mismatches.push(`${name} was ${saved} in the saved PoB snapshot but recalculated as ${recalculated}`);
    }
  }
  return mismatches;
}

const assignmentArgument = ({ slotName, itemId, itemName }) => [slotName, itemId, itemName]
  .map((value) => String(value).replace(/[\t\r\n]/g, " "))
  .join("\t");

function workerDiagnostic(error) {
  const stdout = typeof error?.stdout === "string" ? error.stdout : "";
  const stderr = typeof error?.stderr === "string" ? error.stderr : "";
  const diagnostic = compactDiagnostic(stdout, stderr)
    || (error instanceof Error ? error.message : "Path of Building worker failed.");
  return diagnostic.replace(/^Baseline build failed:\s*/i, "");
}

async function evaluateBuildFile({ file, expectedAssignments, worker, pobSource, engineEnvironment, pobRoot }) {
  return runWithWorkerLimit(async () => {
    try {
      const { stdout, stderr } = await execFileAsync(process.env.LUAJIT_PATH ?? "luajit", [
        worker,
        file,
        ...expectedAssignments.map(assignmentArgument),
      ], {
        cwd: pobSource,
        env: { ...engineEnvironment, LUA_PATH: `${join(pobRoot, "runtime/lua/?.lua")};${join(pobRoot, "runtime/lua/?/init.lua")};;` },
        maxBuffer: 4 * 1024 * 1024,
        timeout: 100_000,
      });
      const parsed = parseEngineOutput(stdout, [], stderr);
      return { metrics: parsed.baseline, dpsMetric: parsed.dpsMetric };
    } catch (error) {
      return { error: workerDiagnostic(error) };
    }
  });
}

export async function evaluateScenarios({ buildXml, scenarios, expectedBaseline, expectedDpsMetric }) {
  if (typeof buildXml !== "string" || buildXml.length > 3 * 1024 * 1024) throw Object.assign(new Error("A valid Path of Building XML export is required."), { status: 400 });
  if (!Array.isArray(scenarios) || scenarios.length > MAX_SCENARIOS) throw Object.assign(new Error(`No more than ${MAX_SCENARIOS} scenarios can be evaluated at once.`), { status: 400 });
  for (const scenario of scenarios) {
    if (typeof scenario?.id !== "string" || !scenario.id || !Array.isArray(scenario.replacements) || !scenario.replacements.length) {
      throw Object.assign(new Error("Each scenario needs an id and at least one replacement."), { status: 400 });
    }
  }

  const directory = await mkdtemp(join(tmpdir(), "poe-pob-"));
  try {
    const builds = [
      { xml: buildXml, expectedAssignments: [] },
      ...scenarios.map((scenario) => prepareBuildWithReplacements(buildXml, scenario.replacements)),
    ];
    const files = await Promise.all(builds.map(async (build, index) => {
      const file = join(directory, `${index}.xml`);
      await writeFile(file, build.xml, "utf8");
      return { file, expectedAssignments: build.expectedAssignments };
    }));
    const pobSource = process.env.POB_SOURCE_PATH ?? "/opt/pathofbuilding/src";
    const worker = process.env.POB_WORKER_PATH ?? join(pobSource, "OptimizerWorker.lua");
    const pobRoot = dirname(pobSource);
    const engineEnvironment = { ...process.env };
    delete engineEnvironment.CI;
    const outcomes = await Promise.all(files.map((file) => evaluateBuildFile({
      ...file, worker, pobSource, engineEnvironment, pobRoot,
    })));
    const baseline = outcomes[0];
    if (!baseline || baseline.error || !baseline.metrics) throw new Error(`Baseline build failed: ${baseline?.error ?? "Path of Building returned no metrics."}`);
    const baselineMismatches = validateBaseline(expectedBaseline, baseline.metrics, expectedDpsMetric, baseline.dpsMetric);
    if (baselineMismatches.length) {
      throw Object.assign(new Error(`Path of Building did not reproduce the imported baseline, so no candidates were ranked: ${baselineMismatches.slice(0, 4).join("; ")}.`), { status: 409 });
    }
    const results = scenarios.map((scenario, index) => {
      const outcome = outcomes[index + 1];
      if (!outcome || outcome.error || !outcome.metrics) return { id: scenario.id, error: outcome?.error ?? "Path of Building returned no metrics for this candidate." };
      if (outcome.dpsMetric !== baseline.dpsMetric) {
        return { id: scenario.id, error: `Path of Building changed the DPS metric from ${baseline.dpsMetric} to ${outcome.dpsMetric}; the candidate was not ranked against an inconsistent baseline.` };
      }
      return { id: scenario.id, metrics: outcome.metrics };
    });
    return {
      baseline: baseline.metrics,
      dpsMetric: baseline.dpsMetric,
      results,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function json(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

export function createPobEngineServer({
  engineToken = process.env.ENGINE_TOKEN,
  evaluate = evaluateScenarios,
  evaluationQueue = createEvaluationQueue({
    concurrency: process.env.POB_JOB_CONCURRENCY,
    maxQueued: process.env.POB_MAX_QUEUED_JOBS,
  }),
} = {}) {
  return createServer(async (request, response) => {
    const engineVersion = process.env.POB_VERSION ?? "v2.65.0";
    if (request.method === "GET" && request.url === "/") {
      return json(response, 200, {
        name: "PoE Upgrade Optimizer Engine",
        ok: Boolean(engineToken),
        engineVersion,
        status: engineToken ? "ready" : "ENGINE_TOKEN secret is not configured",
        endpoints: { health: "GET /health", evaluate: "POST /evaluate" },
        queue: evaluationQueue.status(),
      });
    }
    if (request.method === "GET" && request.url === "/health") {
      return json(response, engineToken ? 200 : 503, {
        ok: Boolean(engineToken),
        engineVersion,
        ...(engineToken ? {} : { error: "ENGINE_TOKEN secret is not configured." }),
        queue: evaluationQueue.status(),
      });
    }
    if (request.method !== "POST" || request.url !== "/evaluate") return json(response, 404, { error: "Not found." });
    if (!engineToken) return json(response, 503, { error: "ENGINE_TOKEN secret is not configured." });
    if (request.headers.authorization !== `Bearer ${engineToken}`) return json(response, 401, { error: "Unauthorized." });

    try {
      const payload = await readJsonBody(request);
      const streaming = request.headers.accept?.includes("application/x-ndjson");
      const cancellation = new AbortController();
      response.on("close", () => { if (!response.writableEnded) cancellation.abort(); });
      if (streaming) response.writeHead(200, { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
      const sendProgress = (queue) => {
        if (!streaming || response.destroyed) return;
        response.write(`${JSON.stringify({ type: queue.position === 0 ? "running" : "queued", ...queue })}\n`);
      };
      const result = await evaluationQueue.enqueue(() => evaluate(payload), sendProgress, cancellation.signal);
      if (streaming) {
        response.end(`${JSON.stringify({ type: "result", engineVersion, ...result })}\n`);
        return;
      }
      return json(response, 200, { engineVersion, ...result });
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 500;
      if (response.headersSent) {
        response.end(`${JSON.stringify({ type: "error", error: error instanceof Error ? error.message : "Path of Building evaluation failed.", status })}\n`);
        return;
      }
      if (status === 429) response.setHeader("Retry-After", "15");
      return json(response, status, { error: error instanceof Error ? error.message : "Path of Building evaluation failed." });
    }
  });
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  const port = Number(process.env.PORT ?? 7860);
  createPobEngineServer().listen(port, "0.0.0.0", () => console.log(`PoB engine listening on ${port}`));
}
