import { randomUUID } from "node:crypto";

const DEFAULT_PREFIX = "poe-upgrade-optimizer:v1";
const DEFAULT_TTL_SECONDS = 24 * 60 * 60;
const DEFAULT_POLL_MS = 1_500;
const DEFAULT_LEASE_MS = 180_000;
const DELETE_CLIENT_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
`;
const REQUEUE_SCRIPT = `
if redis.call('LREM', KEYS[1], 0, ARGV[1]) > 0 then
  redis.call('RPUSH', KEYS[2], ARGV[1])
  return 1
end
return 0
`;
const SAVE_IF_OWNED_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
local decoded = cjson.decode(current)
if decoded.state ~= 'running' or decoded.workerId ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 1
`;

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

export class RedisRestClient {
  constructor({
    url = process.env.UPSTASH_REDIS_REST_URL,
    token = process.env.UPSTASH_REDIS_REST_TOKEN,
    fetchImplementation = fetch,
  } = {}) {
    this.baseUrl = url?.trim().replace(/\/$/, "") ?? "";
    this.token = token;
    this.fetchImplementation = fetchImplementation;
    this.configured = Boolean(this.baseUrl && this.token);
  }

  async command(...command) {
    if (!this.configured) throw new Error("The durable queue Redis connection is not configured.");
    const response = await this.fetchImplementation(this.baseUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await response.json().catch(() => undefined);
    if (!response.ok || payload?.error) throw new Error(payload?.error ?? `Redis returned ${response.status}.`);
    return payload?.result;
  }
}

export function createDurableQueueWorker({
  redis = new RedisRestClient(),
  evaluate,
  engineVersion = process.env.POB_VERSION ?? "v2.65.0",
  prefix = process.env.POB_ASYNC_QUEUE_PREFIX?.trim() || DEFAULT_PREFIX,
  concurrency = process.env.POB_ASYNC_WORKER_CONCURRENCY,
  ttlSeconds = process.env.POB_ASYNC_JOB_TTL_SECONDS,
  pollMs = process.env.POB_ASYNC_WORKER_POLL_MS,
  leaseMs = process.env.POB_ASYNC_WORKER_LEASE_MS,
  workerId = `${process.env.HOSTNAME ?? "pob-worker"}:${randomUUID()}`,
} = {}) {
  if (typeof evaluate !== "function") throw new Error("A Path of Building evaluator is required.");
  const workerConcurrency = boundedInteger(concurrency, 1, 1, 2);
  const jobTtlSeconds = boundedInteger(ttlSeconds, DEFAULT_TTL_SECONDS, 300, 7 * 24 * 60 * 60);
  const idlePollMs = boundedInteger(pollMs, DEFAULT_POLL_MS, 250, 30_000);
  const jobLeaseMs = boundedInteger(leaseMs, DEFAULT_LEASE_MS, 30_000, 10 * 60_000);
  const waitingKey = `${prefix}:waiting`;
  const processingKey = `${prefix}:processing`;
  const jobKey = (id) => `${prefix}:job:${id}`;
  const clientKey = (id) => `${prefix}:client:${id}`;
  const leaseKey = (id) => `${prefix}:lease:${id}`;
  let active = 0;
  let timer;
  let stopped = true;
  let ticking = false;
  let lastError;

  const save = async (job) => {
    job.updatedAt = new Date().toISOString();
    await redis.command("SET", jobKey(job.id), JSON.stringify(job), "EX", jobTtlSeconds);
  };

  const saveIfOwned = async (job) => {
    job.updatedAt = new Date().toISOString();
    return await redis.command(
      "EVAL", SAVE_IF_OWNED_SCRIPT, 1, jobKey(job.id),
      workerId, JSON.stringify(job), jobTtlSeconds,
    ) === 1;
  };

  const release = async (job) => {
    await Promise.all([
      redis.command("LREM", processingKey, 0, job.id),
      redis.command("EVAL", DELETE_CLIENT_LOCK_SCRIPT, 1, clientKey(job.clientId), job.id),
      redis.command("DEL", leaseKey(job.id)),
    ]);
  };

  const clearProcessing = async (id) => {
    await Promise.all([
      redis.command("LREM", processingKey, 0, id),
      redis.command("DEL", leaseKey(id)),
    ]);
  };

  const load = async (id) => {
    const value = await redis.command("GET", jobKey(id));
    if (!value) return null;
    return JSON.parse(value);
  };

  const claim = async () => {
    while (true) {
      const id = await redis.command("RPOPLPUSH", waitingKey, processingKey);
      if (!id) return null;
      const job = await load(id);
      if (!job || job.state !== "queued" || !job.payload?.engineRequest) {
        await redis.command("LREM", processingKey, 0, id);
        continue;
      }
      job.state = "running";
      job.startedAt ??= new Date().toISOString();
      job.workerId = workerId;
      job.leaseUntil = Date.now() + jobLeaseMs;
      await redis.command("SET", leaseKey(job.id), workerId, "PX", jobLeaseMs);
      await save(job);
      return job;
    }
  };

  const heartbeat = async (id) => {
    await redis.command("SET", leaseKey(id), workerId, "PX", jobLeaseMs);
  };

  const processJob = async (claimed) => {
    const heartbeatTimer = setInterval(() => {
      heartbeat(claimed.id).catch((error) => { lastError = error instanceof Error ? error.message : String(error); });
    }, Math.max(10_000, Math.floor(jobLeaseMs / 3)));
    try {
      const result = await evaluate(claimed.payload.engineRequest);
      const current = await load(claimed.id);
      if (!current) return;
      if (current.state === "cancelled") {
        await clearProcessing(claimed.id);
        return;
      }
      if (current.workerId !== workerId) return;
      current.state = "completed";
      current.completedAt = new Date().toISOString();
      current.engineResult = { engineVersion, ...result };
      delete current.payload.engineRequest;
      delete current.workerId;
      delete current.leaseUntil;
      if (await saveIfOwned(current)) await release(current);
      else await clearProcessing(claimed.id);
    } catch (error) {
      const current = await load(claimed.id).catch(() => claimed);
      if (!current) return;
      if (current.state === "cancelled") {
        await clearProcessing(claimed.id);
        return;
      }
      if (current.workerId !== workerId) return;
      current.state = "failed";
      current.completedAt = new Date().toISOString();
      current.error = error instanceof Error ? error.message : "Path of Building evaluation failed.";
      delete current.payload.engineRequest;
      delete current.workerId;
      delete current.leaseUntil;
      if (await saveIfOwned(current)) await release(current);
      else await clearProcessing(claimed.id);
    } finally {
      clearInterval(heartbeatTimer);
    }
  };

  const recoverExpired = async () => {
    const ids = await redis.command("LRANGE", processingKey, 0, -1) ?? [];
    for (const id of ids) {
      const job = await load(id);
      if (!job || ["completed", "failed", "cancelled"].includes(job.state)) {
        await redis.command("LREM", processingKey, 0, id);
        continue;
      }
      if (await redis.command("GET", leaseKey(id))) continue;
      job.state = "queued";
      delete job.workerId;
      delete job.leaseUntil;
      await save(job);
      await redis.command("EVAL", REQUEUE_SCRIPT, 2, processingKey, waitingKey, id);
    }
  };

  const runClaimed = (job) => {
    active += 1;
    return processJob(job).catch((error) => {
      lastError = error instanceof Error ? error.message : String(error);
    }).finally(() => { active -= 1; });
  };

  const runOnce = async () => {
    if (!redis.configured) return false;
    const job = await claim();
    if (!job) return false;
    await runClaimed(job);
    return true;
  };

  const schedule = (delay = idlePollMs) => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(tick, delay);
  };

  const tick = async () => {
    if (stopped || ticking) return;
    ticking = true;
    try {
      while (active < workerConcurrency) {
        const job = await claim();
        if (!job) break;
        void runClaimed(job).finally(() => schedule(0));
      }
      lastError = undefined;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    } finally {
      ticking = false;
      schedule();
    }
  };

  return {
    configured: redis.configured,
    async start() {
      if (!redis.configured || !stopped) return;
      stopped = false;
      try { await recoverExpired(); } catch (error) { lastError = error instanceof Error ? error.message : String(error); }
      schedule(0);
    },
    stop() { stopped = true; clearTimeout(timer); },
    runOnce,
    recoverExpired,
    status: () => ({
      configured: redis.configured,
      running: redis.configured && !stopped,
      active,
      concurrency: workerConcurrency,
      lastError,
    }),
  };
}
