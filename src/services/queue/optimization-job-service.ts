import { Build, BuildMetrics, CurrencyAmount, EquipmentSlot, OptimizationGoal, OptimizationResult, SimulationResult, TradeItem } from "@/models";
import { UpgradeOptimizer } from "@/services/optimizer/upgrade-optimizer";
import { createPobBatchSimulationResult, createPobEngineEvaluationRequest, PobEngineEvaluationRequest, PobEngineResponse } from "@/services/pob/exact-pob-calculation-service";
import { PobBatchSimulationResult, PobCalculationService } from "@/services/pob/pob-calculation-service";
import { ManualTradeMarketService } from "@/services/trade/manual-trade-market-service";
import { RedisRestClient } from "@/services/queue/redis-rest";

export type OptimizationJobState = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface QueuedOptimizationContext {
  build: Build;
  budget: CurrencyAmount;
  goal: OptimizationGoal;
  allowedSlots: EquipmentSlot[];
  league: string;
  candidates: TradeItem[];
}

export interface DurableOptimizationJob {
  version: 1;
  id: string;
  clientId: string;
  state: OptimizationJobState;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  workerId?: string;
  leaseUntil?: number;
  payload: {
    engineRequest?: PobEngineEvaluationRequest;
    context: QueuedOptimizationContext;
  };
  engineResult?: PobEngineResponse;
  result?: OptimizationResult;
  error?: string;
}

export interface PublicOptimizationJob {
  jobId: string;
  state: OptimizationJobState;
  position: number;
  queued: number;
  active: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  league: string;
  pollAfterMs: number;
  result?: OptimizationResult;
  error?: string;
}

const DEFAULT_PREFIX = "poe-upgrade-optimizer:v1";
const DEFAULT_MAX_QUEUED = 100;
const DEFAULT_JOB_TTL_SECONDS = 24 * 60 * 60;
const ENQUEUE_SCRIPT = `
local existing = redis.call('GET', KEYS[2])
if existing then return {2, existing, redis.call('LLEN', KEYS[3])} end
local queued = redis.call('LLEN', KEYS[3])
if queued >= tonumber(ARGV[3]) then return {0, '', queued} end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
redis.call('SET', KEYS[2], ARGV[4], 'EX', ARGV[2])
redis.call('LPUSH', KEYS[3], ARGV[4])
return {1, ARGV[4], queued + 1}
`;
const DELETE_CLIENT_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
`;

export interface OptimizationQueueRedis {
  configured: boolean;
  command<T>(...command: (string | number)[]): Promise<T>;
  pipeline<T extends unknown[]>(commands: (string | number)[][]): Promise<T>;
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function publicItem(item: TradeItem): TradeItem {
  const copy = { ...item };
  delete copy.rawText;
  return copy;
}

function compactBuild(build: Build): Build {
  return {
    ...build,
    sourceXml: undefined,
    equipment: Object.fromEntries(Object.entries(build.equipment).map(([slot, item]) => {
      const copy = { ...item };
      delete copy.rawText;
      return [slot, copy];
    })) as Build["equipment"],
    flasks: build.flasks?.map((item) => {
      const copy = { ...item };
      delete copy.rawText;
      return copy;
    }),
  };
}

class CompletedPobCalculationService implements PobCalculationService {
  constructor(private readonly engineResult: PobEngineResponse) {}
  async importBuild(): Promise<Build> { throw new Error("A completed queue result cannot import builds."); }
  async calculateBuild(): Promise<BuildMetrics> { return createPobBatchSimulationResult([], this.engineResult).baseline; }
  async simulateItemReplacement(build: Build, slot: EquipmentSlot, item: TradeItem): Promise<SimulationResult> {
    const result = await this.simulateItemReplacements(build, [{ ...item, slot }]);
    if (!result.simulations[0]) throw new Error("The completed queue result did not include that item.");
    return result.simulations[0];
  }
  async simulateItemReplacements(_build: Build, items: TradeItem[]): Promise<PobBatchSimulationResult> {
    return createPobBatchSimulationResult(items, this.engineResult);
  }
}

export function createDurableOptimizationPayload(context: QueuedOptimizationContext): DurableOptimizationJob["payload"] {
  return {
    engineRequest: createPobEngineEvaluationRequest(context.build, context.candidates),
    context: {
      ...context,
      build: compactBuild(context.build),
      candidates: context.candidates.map(publicItem),
    },
  };
}

export async function finalizeOptimizationJob(job: DurableOptimizationJob): Promise<OptimizationResult> {
  if (job.result) return job.result;
  if (!job.engineResult) throw new Error("The Path of Building worker completed without storing metrics.");
  const { context } = job.payload;
  return new UpgradeOptimizer(
    new CompletedPobCalculationService(job.engineResult),
    new ManualTradeMarketService(context.candidates),
  ).optimize({
    build: context.build,
    budget: context.budget,
    goal: context.goal,
    allowedSlots: context.allowedSlots,
    league: context.league,
    requireVerified: true,
  });
}

export function validOptimizationClientId(value: string | null): value is string {
  return Boolean(value && /^[A-Za-z0-9_-]{16,80}$/.test(value));
}

export function validOptimizationJobId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export class OptimizationJobService {
  readonly configured: boolean;
  private readonly prefix: string;
  private readonly ttlSeconds: number;
  private readonly maxQueued: number;

  constructor(private readonly redis: OptimizationQueueRedis = new RedisRestClient()) {
    this.configured = redis.configured;
    this.prefix = process.env.POB_ASYNC_QUEUE_PREFIX?.trim() || DEFAULT_PREFIX;
    this.ttlSeconds = boundedInteger(process.env.POB_ASYNC_JOB_TTL_SECONDS, DEFAULT_JOB_TTL_SECONDS, 300, 7 * 24 * 60 * 60);
    this.maxQueued = boundedInteger(process.env.POB_ASYNC_MAX_QUEUED_JOBS, DEFAULT_MAX_QUEUED, 1, 500);
  }

  private jobKey(id: string) { return `${this.prefix}:job:${id}`; }
  private clientKey(id: string) { return `${this.prefix}:client:${id}`; }
  private queueKey() { return `${this.prefix}:waiting`; }
  private processingKey() { return `${this.prefix}:processing`; }

  async enqueue(
    payload: DurableOptimizationJob["payload"],
    clientId: string,
    retryStale = true,
  ): Promise<{ job: DurableOptimizationJob; reused: boolean }> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const job: DurableOptimizationJob = {
      version: 1,
      id,
      clientId,
      state: "queued",
      createdAt: now,
      updatedAt: now,
      payload,
    };
    const response = await this.redis.command<(number | string)[]>(
      "EVAL", ENQUEUE_SCRIPT, 3,
      this.jobKey(id), this.clientKey(clientId), this.queueKey(),
      JSON.stringify(job), this.ttlSeconds, this.maxQueued, id,
    );
    const outcome = Number(response[0]);
    if (outcome === 0) throw Object.assign(new Error(`The durable Path of Building queue already has ${response[2]} waiting comparisons. Please try again later.`), { status: 429 });
    if (outcome === 2) {
      const existingId = String(response[1]);
      const existing = await this.get(existingId);
      if (existing && (existing.state === "queued" || existing.state === "running")) return { job: existing, reused: true };
      if (retryStale) {
        await this.redis.command("DEL", this.clientKey(clientId));
        return this.enqueue(payload, clientId, false);
      }
      throw Object.assign(new Error("The previous comparison is still being released. Please try again."), { status: 409 });
    }
    return { job, reused: false };
  }

  async get(id: string): Promise<DurableOptimizationJob | null> {
    const value = await this.redis.command<string | null>("GET", this.jobKey(id));
    if (!value) return null;
    try {
      return JSON.parse(value) as DurableOptimizationJob;
    } catch {
      throw new Error("The stored optimization job is invalid.");
    }
  }

  async save(job: DurableOptimizationJob): Promise<void> {
    job.updatedAt = new Date().toISOString();
    await this.redis.command("SET", this.jobKey(job.id), JSON.stringify(job), "EX", this.ttlSeconds);
  }

  async publicStatus(job: DurableOptimizationJob): Promise<PublicOptimizationJob> {
    const [waiting, active] = await this.redis.pipeline<[string[], number]>([
      ["LRANGE", this.queueKey(), 0, -1],
      ["LLEN", this.processingKey()],
    ]);
    const queueIndex = waiting.lastIndexOf(job.id);
    const position = job.state === "queued" && queueIndex >= 0 ? waiting.length - queueIndex : 0;
    const pollAfterMs = job.state === "running"
      ? 2_000
      : job.state === "queued"
        ? Math.min(15_000, Math.max(3_000, position * 150))
        : 0;
    return {
      jobId: job.id,
      state: job.state,
      position,
      queued: waiting.length,
      active,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      league: job.payload.context.league,
      pollAfterMs,
      result: job.result,
      error: job.error,
    };
  }

  async releaseClient(job: DurableOptimizationJob): Promise<void> {
    await this.redis.command("EVAL", DELETE_CLIENT_LOCK_SCRIPT, 1, this.clientKey(job.clientId), job.id);
  }

  async cancel(job: DurableOptimizationJob): Promise<DurableOptimizationJob> {
    if (job.state === "completed" || job.state === "failed" || job.state === "cancelled") return job;
    job.state = "cancelled";
    job.completedAt = new Date().toISOString();
    job.error = "This comparison was cancelled.";
    delete job.payload.engineRequest;
    await Promise.all([
      this.save(job),
      this.redis.command("LREM", this.queueKey(), 0, job.id),
      this.releaseClient(job),
    ]);
    return job;
  }
}
