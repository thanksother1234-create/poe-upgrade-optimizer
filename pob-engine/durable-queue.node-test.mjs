import assert from "node:assert/strict";
import test from "node:test";
import { createDurableQueueWorker } from "./durable-queue.mjs";

class MemoryRedis {
  configured = true;
  values = new Map();
  lists = new Map();

  list(key) {
    if (!this.lists.has(key)) this.lists.set(key, []);
    return this.lists.get(key);
  }

  async command(name, ...args) {
    if (name === "GET") return this.values.get(args[0]) ?? null;
    if (name === "SET") { this.values.set(args[0], args[1]); return "OK"; }
    if (name === "DEL") return this.values.delete(args[0]) ? 1 : 0;
    if (name === "LPUSH") { this.list(args[0]).unshift(args[1]); return this.list(args[0]).length; }
    if (name === "RPUSH") { this.list(args[0]).push(args[1]); return this.list(args[0]).length; }
    if (name === "LRANGE") return [...this.list(args[0])];
    if (name === "RPOPLPUSH") {
      const value = this.list(args[0]).pop();
      if (value === undefined) return null;
      this.list(args[1]).unshift(value);
      return value;
    }
    if (name === "LREM") {
      const list = this.list(args[0]);
      const before = list.length;
      this.lists.set(args[0], list.filter((value) => value !== args[2]));
      return before - this.list(args[0]).length;
    }
    if (name === "EVAL") {
      const script = args[0];
      const keyCount = Number(args[1]);
      const keys = args.slice(2, 2 + keyCount);
      const values = args.slice(2 + keyCount);
      if (script.includes("RPUSH")) {
        const removed = await this.command("LREM", keys[0], 0, values[0]);
        if (removed) await this.command("RPUSH", keys[1], values[0]);
        return removed ? 1 : 0;
      }
      if (script.includes("cjson.decode")) {
        const current = JSON.parse(this.values.get(keys[0]));
        if (current.state !== "running" || current.workerId !== values[0]) return 0;
        this.values.set(keys[0], values[1]);
        return 1;
      }
      if (this.values.get(keys[0]) === values[0]) return this.command("DEL", keys[0]);
      return 0;
    }
    throw new Error(`Unsupported in-memory Redis command: ${name}`);
  }
}

function queuedJob(id, clientId = `client-${id}`) {
  const now = new Date().toISOString();
  return {
    version: 1,
    id,
    clientId,
    state: "queued",
    createdAt: now,
    updatedAt: now,
    payload: {
      engineRequest: { buildXml: `<PathOfBuilding id="${id}"/>`, scenarios: [], expectedBaseline: {} },
      context: { league: "Mirage" },
    },
  };
}

test("durable worker claims queued jobs in FIFO order and persists completed metrics", async () => {
  const redis = new MemoryRedis();
  const order = [];
  for (const id of ["first", "second"]) {
    const job = queuedJob(id);
    redis.values.set(`test:job:${id}`, JSON.stringify(job));
    redis.values.set(`test:client:${job.clientId}`, id);
    await redis.command("LPUSH", "test:waiting", id);
  }
  const worker = createDurableQueueWorker({
    redis,
    prefix: "test",
    workerId: "worker-1",
    evaluate: async ({ buildXml }) => {
      const id = buildXml.match(/id="([^"]+)/)?.[1];
      order.push(id);
      return { baseline: { totalDps: 1 }, dpsMetric: "CombinedDPS", results: [] };
    },
  });

  assert.equal(await worker.runOnce(), true);
  assert.equal(await worker.runOnce(), true);
  assert.deepEqual(order, ["first", "second"]);
  const completed = JSON.parse(redis.values.get("test:job:second"));
  assert.equal(completed.state, "completed");
  assert.equal(completed.engineResult.engineVersion, "v2.65.0");
  assert.equal(completed.payload.engineRequest, undefined);
  assert.deepEqual(redis.list("test:processing"), []);
  assert.equal(redis.values.has("test:client:client-second"), false);
});

test("durable worker returns an expired in-flight job to the front of the queue", async () => {
  const redis = new MemoryRedis();
  const job = {
    ...queuedJob("expired"),
    state: "running",
    workerId: "dead-worker",
    leaseUntil: Date.now() - 1,
  };
  redis.values.set("test:job:expired", JSON.stringify(job));
  redis.list("test:processing").push("expired");
  const worker = createDurableQueueWorker({
    redis,
    prefix: "test",
    workerId: "replacement-worker",
    evaluate: async () => ({ baseline: { totalDps: 1 }, dpsMetric: "CombinedDPS", results: [] }),
  });

  await worker.recoverExpired();
  assert.deepEqual(redis.list("test:waiting"), ["expired"]);
  assert.deepEqual(redis.list("test:processing"), []);
  assert.equal(await worker.runOnce(), true);
  assert.equal(JSON.parse(redis.values.get("test:job:expired")).state, "completed");
});
