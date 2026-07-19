import { Build, BuildMetrics, DpsMetric, EquipmentSlot, SimulationResult, TradeItem } from "@/models";
import { subtractMetrics } from "@/lib/metrics";
import { MvpPobCalculationService, PobBatchSimulationResult, PobCalculationService } from "@/services/pob/pob-calculation-service";

interface EngineScenarioResult {
  id?: unknown;
  metrics?: unknown;
  error?: unknown;
}

interface EngineResponse {
  engineVersion?: unknown;
  dpsMetric?: unknown;
  baseline?: unknown;
  results?: unknown;
  error?: unknown;
}

const dpsMetrics = new Set<DpsMetric>(["FullDPS", "CombinedDPS", "MinionCombinedDPS", "TotalDPS"]);

export class PobEngineError extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message);
    this.name = "PobEngineError";
  }
}

const metricNames: (keyof BuildMetrics)[] = [
  "totalDps", "effectiveHitPool", "physicalMaxHit", "elementalMaxHit", "chaosMaxHit",
  "life", "energyShield", "armour", "evasion", "spellSuppression", "fireResistance",
  "coldResistance", "lightningResistance", "chaosResistance",
];

function parseMetrics(value: unknown): BuildMetrics {
  if (!value || typeof value !== "object") throw new PobEngineError("The Path of Building engine returned invalid metrics.");
  const source = value as Record<string, unknown>;
  const metrics = Object.fromEntries(metricNames.map((name) => {
    const metric = Number(source[name]);
    if (!Number.isFinite(metric)) throw new PobEngineError(`The Path of Building engine returned an invalid ${name} value.`);
    return [name, metric];
  }));
  return metrics as unknown as BuildMetrics;
}

function publicTradeItem(item: TradeItem): TradeItem {
  const copy = { ...item };
  delete copy.rawText;
  return copy;
}

export class ExactPobCalculationService implements PobCalculationService {
  private readonly importer = new MvpPobCalculationService();

  constructor(
    private readonly engineUrl = process.env.POB_ENGINE_URL,
    private readonly engineToken = process.env.POB_ENGINE_TOKEN,
  ) {}

  async importBuild(pobCode: string) {
    return this.importer.importBuild(pobCode);
  }

  async calculateBuild(build: Build): Promise<BuildMetrics> {
    return (await this.evaluate(build, [])).baseline;
  }

  async simulateItemReplacement(build: Build, slot: EquipmentSlot, item: TradeItem): Promise<SimulationResult> {
    const batch = await this.simulateItemReplacements(build, [{ ...item, slot }]);
    const simulation = batch.simulations[0];
    if (!simulation) throw new PobEngineError("The Path of Building engine did not return a result for that item.");
    return simulation;
  }

  async simulateItemReplacements(build: Build, items: TradeItem[]): Promise<PobBatchSimulationResult> {
    const scenarios = items.map((item, index) => {
      if (!item.rawText) throw new PobEngineError(`The candidate ${item.name} did not include copied Path of Building item text.`);
      return { id: `${index}:${item.slot}:${item.id}`, replacements: [{ slot: item.slot, rawText: item.rawText }] };
    });
    const response = await this.evaluate(build, scenarios);
    const byId = new Map(response.results.map((result) => [result.id, result]));
    const simulations = items.map((item, index) => {
      const id = `${index}:${item.slot}:${item.id}`;
      const result = byId.get(id);
      if (!result) throw new PobEngineError(`The Path of Building engine skipped ${item.name}.`);
      if (typeof result.error === "string") throw new PobEngineError(`Path of Building could not evaluate ${item.name}: ${result.error}`);
      const metrics = parseMetrics(result.metrics);
      return {
        slot: item.slot,
        item: publicTradeItem(item),
        metrics,
        changes: subtractMetrics(metrics, response.baseline),
        verification: "pob" as const,
      };
    });
    return {
      baseline: response.baseline,
      simulations,
      verification: "pob",
      engineVersion: response.engineVersion,
      dpsMetric: response.dpsMetric,
    };
  }

  private async evaluate(build: Build, scenarios: { id: string; replacements: { slot: EquipmentSlot; rawText: string }[] }[]) {
    if (!this.engineUrl) {
      throw new PobEngineError("Exact Path of Building calculations are not configured. Deploy the included pob-engine service and set POB_ENGINE_URL in Vercel.", 503);
    }
    if (!build.sourceXml) throw new PobEngineError("Re-import this build before optimizing so its full Path of Building data is available.", 400);

    const baseUrl = this.engineUrl.endsWith("/") ? this.engineUrl : `${this.engineUrl}/`;
    const headers: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
    if (this.engineToken) headers.Authorization = `Bearer ${this.engineToken}`;

    let response: Response;
    try {
      response = await fetch(new URL("evaluate", baseUrl), {
        method: "POST",
        headers,
        body: JSON.stringify({ buildXml: build.sourceXml, scenarios }),
        cache: "no-store",
        signal: AbortSignal.timeout(110_000),
      });
    } catch (error) {
      const message = error instanceof Error && error.name === "TimeoutError"
        ? "The Path of Building engine timed out while evaluating the listings."
        : "The Path of Building engine is unavailable.";
      throw new PobEngineError(message, 503);
    }

    const payload = await response.json().catch(() => ({})) as EngineResponse;
    if (!response.ok) throw new PobEngineError(typeof payload.error === "string" ? payload.error : `Path of Building engine returned ${response.status}.`, response.status);
    const baseline = parseMetrics(payload.baseline);
    const results = Array.isArray(payload.results) ? payload.results as EngineScenarioResult[] : [];
    const parsedResults = results.map((result) => {
      if (typeof result.id !== "string") throw new PobEngineError("The Path of Building engine returned an unidentified scenario.");
      return { id: result.id, metrics: result.metrics, error: typeof result.error === "string" ? result.error : undefined };
    });
    const dpsMetric = typeof payload.dpsMetric === "string" && dpsMetrics.has(payload.dpsMetric as DpsMetric)
      ? payload.dpsMetric as DpsMetric
      : "CombinedDPS";
    return {
      baseline,
      results: parsedResults,
      engineVersion: typeof payload.engineVersion === "string" ? payload.engineVersion : "Path of Building",
      dpsMetric,
    };
  }
}
