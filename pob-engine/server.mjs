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
const MAX_TRADE_QUERY_BYTES = 256 * 1024;
const TRADE_CACHE_TTL_MS = 30_000;
const TRADE_CACHE_MAX_ENTRIES = 100;
const TRADE_SEARCH_INTERVAL_MS = 2_100;
const TRADE_FETCH_INTERVAL_MS = 400;
const TRADE_FETCH_LIMIT = 10;
const LEAGUE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 '()-]{0,79}$/;
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
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function hasContactEmail(userAgent) {
  return /^OAuth\s+\S+\/\S+\s+\(contact:\s*[^\s@()]+@[^\s@()]+\.[^\s@()]+\)$/i.test(userAgent);
}

function intervalScheduler(intervalMs) {
  let tail = Promise.resolve();
  let nextAvailableAt = 0;
  return (operation) => {
    const result = tail.then(async () => {
      const delay = Math.max(0, nextAvailableAt - Date.now());
      if (delay) await wait(delay);
      nextAvailableAt = Date.now() + intervalMs;
      return operation();
    });
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}

async function upstreamJson(response, operation) {
  const body = await response.text();
  let payload = {};
  try {
    payload = JSON.parse(body);
  } catch {
    // HTML edge errors are classified from the response headers and body below.
  }

  if (response.status === 403) {
    const server = response.headers.get("server") ?? "";
    const cfRay = response.headers.get("cf-ray");
    const hasRateHeaders = Boolean(
      response.headers.get("retry-after")
      || response.headers.get("x-rate-limit-policy")
      || response.headers.get("x-rate-limit-rules")
      || response.headers.get("x-rate-limit-ip-state"),
    );
    const edgeBlock = Boolean(cfRay)
      || /cloudflare/i.test(server)
      || /cloudflare|attention required|error\s*1020|access denied/i.test(body);
    const rejection = edgeBlock ? "edge-block" : hasRateHeaders ? "rate-policy" : "api-forbidden";
    console.warn("[poe-trade-engine] upstream request rejected", {
      operation,
      status: response.status,
      rejection,
      server: server || undefined,
      cfRay: cfRay || undefined,
      hasRateHeaders,
    });
    const message = edgeBlock
      ? "Path of Exile also blocked the Hugging Face outbound network (diagnostic: edge-block)."
      : hasRateHeaders
        ? "Path of Exile rejected the hosted engine under its rate or abuse policy (diagnostic: rate-policy)."
        : "Path of Exile returned an API authorization denial to the hosted engine (diagnostic: api-forbidden).";
    throw Object.assign(new Error(message), { status: 502 });
  }
  if (response.status === 429) {
    throw Object.assign(new Error("The Path of Exile trade API rate limit was reached. Wait before trying again."), { status: 429 });
  }
  if (!response.ok) {
    throw Object.assign(new Error(`Path of Exile trade ${operation} returned ${response.status}.`), { status: 502 });
  }
  return payload;
}

async function fetchTradeListings(input, { fetchImpl, scheduleSearch, scheduleFetch }) {
  const league = typeof input?.league === "string" ? input.league.trim() : "";
  const query = input?.query;
  const limit = Number(input?.limit);
  const userAgent = typeof input?.userAgent === "string" ? input.userAgent.trim() : "";
  if (!LEAGUE_NAME_PATTERN.test(league)) throw Object.assign(new Error("A valid Path of Exile league is required."), { status: 400 });
  if (!query || typeof query !== "object" || JSON.stringify(query).length > MAX_TRADE_QUERY_BYTES) {
    throw Object.assign(new Error("A valid Path of Exile trade query is required."), { status: 400 });
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > TRADE_FETCH_LIMIT) {
    throw Object.assign(new Error(`Trade listing limit must be between 1 and ${TRADE_FETCH_LIMIT}.`), { status: 400 });
  }
  if (!hasContactEmail(userAgent)) {
    throw Object.assign(new Error("POE_USER_AGENT is not in the required OAuth AppName/Version contact-email format."), { status: 400 });
  }

  const headers = { Accept: "application/json", "Content-Type": "application/json", "User-Agent": userAgent };
  let searchResponse;
  try {
    searchResponse = await scheduleSearch(() => fetchImpl(`https://www.pathofexile.com/api/trade/search/${encodeURIComponent(league)}`, {
      method: "POST",
      headers,
      body: JSON.stringify(query),
      signal: AbortSignal.timeout(20_000),
    }));
  } catch (error) {
    if (Number.isInteger(error?.status)) throw error;
    throw Object.assign(new Error("The Path of Exile trade search is unavailable from the hosted engine."), { status: 503 });
  }
  const searchPayload = await upstreamJson(searchResponse, "search");
  const queryId = typeof searchPayload?.id === "string" ? searchPayload.id : "";
  const ids = Array.isArray(searchPayload?.result)
    ? searchPayload.result.filter((id) => typeof id === "string").slice(0, limit)
    : [];
  if (!queryId || !ids.length) return { queryId, result: [] };

  let fetchResponse;
  try {
    fetchResponse = await scheduleFetch(() => fetchImpl(`https://www.pathofexile.com/api/trade/fetch/${ids.join(",")}?query=${encodeURIComponent(queryId)}`, {
      headers: { Accept: "application/json", "User-Agent": userAgent },
      signal: AbortSignal.timeout(20_000),
    }));
  } catch (error) {
    if (Number.isInteger(error?.status)) throw error;
    throw Object.assign(new Error("The Path of Exile trade listing fetch is unavailable from the hosted engine."), { status: 503 });
  }
  const fetchPayload = await upstreamJson(fetchResponse, "listing fetch");
  return { queryId, result: Array.isArray(fetchPayload?.result) ? fetchPayload.result : [] };
}

function createTradeGateway({ fetchImpl, searchIntervalMs, fetchIntervalMs }) {
  const cache = new Map();
  const scheduleSearch = intervalScheduler(searchIntervalMs);
  const scheduleFetch = intervalScheduler(fetchIntervalMs);
  return async (input) => {
    const key = `${input?.league}|${input?.limit}|${JSON.stringify(input?.query)}`;
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.promise;
    if (cached) cache.delete(key);

    const promise = fetchTradeListings(input, { fetchImpl, scheduleSearch, scheduleFetch });
    cache.set(key, { expiresAt: Date.now() + TRADE_CACHE_TTL_MS, promise });
    promise.catch(() => {
      if (cache.get(key)?.promise === promise) cache.delete(key);
    });
    while (cache.size > TRADE_CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value);
    return promise;
  };
}

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

function parseEngineOutput(stdout, scenarioIds) {
  const metricsByIndex = new Map();
  const errorsByIndex = new Map();
  for (const line of stdout.split(/\r?\n/)) {
    const fields = line.split("\t");
    if (fields[0] === "POE_ERROR") errorsByIndex.set(Number(fields[1]), fields.slice(2).join("\t"));
    if (fields[0] !== "POE_METRICS") continue;
    const index = Number(fields[1]);
    const values = fields.slice(2).map(Number);
    if (values.length !== METRIC_NAMES.length || values.some((value) => !Number.isFinite(value))) continue;
    metricsByIndex.set(index, Object.fromEntries(METRIC_NAMES.map((name, metricIndex) => [name, values[metricIndex]])));
  }
  if (errorsByIndex.has(0)) throw new Error(`Baseline build failed: ${errorsByIndex.get(0)}`);
  const baseline = metricsByIndex.get(0);
  if (!baseline) throw new Error("Path of Building did not return baseline metrics.");
  const results = scenarioIds.map((id, index) => errorsByIndex.has(index + 1)
    ? { id, error: errorsByIndex.get(index + 1) }
    : { id, metrics: metricsByIndex.get(index + 1) });
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
    const { stdout } = await execFileAsync(process.env.LUAJIT_PATH ?? "luajit", [worker, ...files], {
      cwd: pobSource,
      env: { ...engineEnvironment, LUA_PATH: `${join(pobRoot, "runtime/lua/?.lua")};${join(pobRoot, "runtime/lua/?/init.lua")};;` },
      maxBuffer: 4 * 1024 * 1024,
      timeout: 100_000,
    });
    return parseEngineOutput(stdout, scenarios.map((scenario) => scenario.id));
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
  fetchImpl = globalThis.fetch,
  tradeSearchIntervalMs = TRADE_SEARCH_INTERVAL_MS,
  tradeFetchIntervalMs = TRADE_FETCH_INTERVAL_MS,
} = {}) {
  const tradeGateway = createTradeGateway({ fetchImpl, searchIntervalMs: tradeSearchIntervalMs, fetchIntervalMs: tradeFetchIntervalMs });
  return createServer(async (request, response) => {
    const engineVersion = process.env.POB_VERSION ?? "v2.65.0";
    if (request.method === "GET" && request.url === "/") {
      return json(response, 200, {
        name: "PoE Upgrade Optimizer Engine",
        ok: Boolean(engineToken),
        engineVersion,
        status: engineToken ? "ready" : "ENGINE_TOKEN secret is not configured",
        endpoints: { health: "GET /health", evaluate: "POST /evaluate", tradeListings: "POST /trade/listings" },
      });
    }
    if (request.method === "GET" && request.url === "/health") {
      return json(response, engineToken ? 200 : 503, {
        ok: Boolean(engineToken),
        engineVersion,
        ...(engineToken ? {} : { error: "ENGINE_TOKEN secret is not configured." }),
      });
    }
    const isEvaluate = request.method === "POST" && request.url === "/evaluate";
    const isTradeListings = request.method === "POST" && request.url === "/trade/listings";
    if (!isEvaluate && !isTradeListings) return json(response, 404, { error: "Not found." });
    if (!engineToken) return json(response, 503, { error: "ENGINE_TOKEN secret is not configured." });
    if (request.headers.authorization !== `Bearer ${engineToken}`) return json(response, 401, { error: "Unauthorized." });

    try {
      const payload = await readJsonBody(request);
      const result = isTradeListings ? await tradeGateway(payload) : await evaluateScenarios(payload);
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
