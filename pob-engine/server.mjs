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

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapeXmlText = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function activeItemSetId(xml) {
  const itemsTag = xml.match(/<Items\b([^>]*)>/)?.[1] ?? "";
  return itemsTag.match(/\bactiveItemSet="([^"]+)"/)?.[1] ?? "1";
}

function nextItemId(xml) {
  const ids = [...xml.matchAll(/<Item\b[^>]*\bid="(\d+)"/g)].map((match) => Number(match[1]));
  return Math.max(0, ...ids) + 1;
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

export function replaceItemsInBuildXml(buildXml, replacements) {
  if (typeof buildXml !== "string" || !buildXml.includes("<PathOfBuilding")) throw new Error("A valid Path of Building XML export is required.");
  if (!Array.isArray(replacements) || !replacements.length) return buildXml;

  const itemSetId = activeItemSetId(buildXml);
  let xml = buildXml;
  let itemId = nextItemId(xml);
  for (const replacement of replacements) {
    const slotName = SLOT_NAMES[replacement?.slot];
    if (!slotName || typeof replacement.rawText !== "string" || !replacement.rawText.trim()) throw new Error("Each replacement needs a supported slot and raw item text.");
    xml = addItem(xml, itemId, replacement.rawText);
    xml = assignSlot(xml, itemSetId, slotName, itemId);
    itemId += 1;
  }
  return xml;
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
  const errorsByIndex = new Map();
  for (const rawLine of stdout.split(/\r?\n/)) {
    const cleanLine = stripAnsi(rawLine);
    const markerIndex = Math.max(cleanLine.indexOf("POE_METRICS\t"), cleanLine.indexOf("POE_ERROR\t"));
    if (markerIndex < 0) continue;
    const fields = cleanLine.slice(markerIndex).split("\t");
    if (fields[0] === "POE_ERROR") errorsByIndex.set(Number(fields[1]), fields.slice(2).join("\t"));
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
      ? { id, metrics: metricsByIndex.get(index + 1) }
      : { id, error: "Path of Building did not return metrics for this candidate." });
  return { baseline, results };
}

export async function evaluateScenarios({ buildXml, scenarios }) {
  if (typeof buildXml !== "string" || buildXml.length > 3 * 1024 * 1024) throw Object.assign(new Error("A valid Path of Building XML export is required."), { status: 400 });
  if (!Array.isArray(scenarios) || scenarios.length > MAX_SCENARIOS) throw Object.assign(new Error(`No more than ${MAX_SCENARIOS} scenarios can be evaluated at once.`), { status: 400 });
  for (const scenario of scenarios) {
    if (typeof scenario?.id !== "string" || !scenario.id || !Array.isArray(scenario.replacements) || !scenario.replacements.length) {
      throw Object.assign(new Error("Each scenario needs an id and at least one replacement."), { status: 400 });
    }
  }

  const directory = await mkdtemp(join(tmpdir(), "poe-pob-"));
  try {
    const builds = [buildXml, ...scenarios.map((scenario) => replaceItemsInBuildXml(buildXml, scenario.replacements))];
    const files = await Promise.all(builds.map(async (xml, index) => {
      const file = join(directory, `${index}.xml`);
      await writeFile(file, xml, "utf8");
      return file;
    }));
    const pobSource = process.env.POB_SOURCE_PATH ?? "/opt/pathofbuilding/src";
    const worker = process.env.POB_WORKER_PATH ?? join(pobSource, "OptimizerWorker.lua");
    const pobRoot = dirname(pobSource);
    const engineEnvironment = { ...process.env };
    delete engineEnvironment.CI;
    const { stdout, stderr } = await execFileAsync(process.env.LUAJIT_PATH ?? "luajit", [worker, ...files], {
      cwd: pobSource,
      env: { ...engineEnvironment, LUA_PATH: `${join(pobRoot, "runtime/lua/?.lua")};${join(pobRoot, "runtime/lua/?/init.lua")};;` },
      maxBuffer: 4 * 1024 * 1024,
      timeout: 100_000,
    });
    return parseEngineOutput(stdout, scenarios.map((scenario) => scenario.id), stderr);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function json(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

export function createPobEngineServer({ engineToken = process.env.ENGINE_TOKEN } = {}) {
  return createServer(async (request, response) => {
    const engineVersion = process.env.POB_VERSION ?? "v2.65.0";
    if (request.method === "GET" && request.url === "/") {
      return json(response, 200, {
        name: "PoE Upgrade Optimizer Engine",
        ok: Boolean(engineToken),
        engineVersion,
        status: engineToken ? "ready" : "ENGINE_TOKEN secret is not configured",
        endpoints: { health: "GET /health", evaluate: "POST /evaluate" },
      });
    }
    if (request.method === "GET" && request.url === "/health") {
      return json(response, engineToken ? 200 : 503, {
        ok: Boolean(engineToken),
        engineVersion,
        ...(engineToken ? {} : { error: "ENGINE_TOKEN secret is not configured." }),
      });
    }
    if (request.method !== "POST" || request.url !== "/evaluate") return json(response, 404, { error: "Not found." });
    if (!engineToken) return json(response, 503, { error: "ENGINE_TOKEN secret is not configured." });
    if (request.headers.authorization !== `Bearer ${engineToken}`) return json(response, 401, { error: "Unauthorized." });

    try {
      const payload = await readJsonBody(request);
      const result = await evaluateScenarios(payload);
      return json(response, 200, { engineVersion, ...result });
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 500;
      return json(response, status, { error: error instanceof Error ? error.message : "Path of Building evaluation failed." });
    }
  });
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  const port = Number(process.env.PORT ?? 7860);
  createPobEngineServer().listen(port, "0.0.0.0", () => console.log(`PoB engine listening on ${port}`));
}
