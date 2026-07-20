import { afterEach, describe, expect, it, vi } from "vitest";
import { mockBuild } from "@/mocks/build";
import { TradeItem } from "@/models";
import {
  createDurableOptimizationPayload,
  DurableOptimizationJob,
  finalizeOptimizationJob,
  OptimizationJobService,
  OptimizationQueueRedis,
} from "./optimization-job-service";

class MemoryQueueRedis implements OptimizationQueueRedis {
  configured = true;
  values = new Map<string, string>();
  lists = new Map<string, string[]>();

  private list(key: string) {
    if (!this.lists.has(key)) this.lists.set(key, []);
    return this.lists.get(key)!;
  }

  async command<T>(...command: (string | number)[]): Promise<T> {
    const [name, ...args] = command;
    let result: unknown;
    if (name === "GET") result = this.values.get(String(args[0])) ?? null;
    else if (name === "SET") { this.values.set(String(args[0]), String(args[1])); result = "OK"; }
    else if (name === "DEL") result = this.values.delete(String(args[0])) ? 1 : 0;
    else if (name === "LREM") {
      const key = String(args[0]);
      const before = this.list(key).length;
      this.lists.set(key, this.list(key).filter((value) => value !== String(args[2])));
      result = before - this.list(key).length;
    } else if (name === "EVAL") {
      const script = String(args[0]);
      const keyCount = Number(args[1]);
      const keys = args.slice(2, 2 + keyCount).map(String);
      const values = args.slice(2 + keyCount).map(String);
      if (script.includes("LLEN")) {
        const existing = this.values.get(keys[1]);
        if (existing) result = [2, existing, this.list(keys[2]).length];
        else {
          this.values.set(keys[0], values[0]);
          this.values.set(keys[1], values[3]);
          this.list(keys[2]).unshift(values[3]);
          result = [1, values[3], this.list(keys[2]).length];
        }
      } else {
        result = this.values.get(keys[0]) === values[0] && this.values.delete(keys[0]) ? 1 : 0;
      }
    } else throw new Error(`Unsupported command ${name}`);
    return result as T;
  }

  async pipeline<T extends unknown[]>(commands: (string | number)[][]): Promise<T> {
    return commands.map(([name, key]) => name === "LRANGE" ? [...this.list(String(key))] : this.list(String(key)).length) as T;
  }
}

afterEach(() => vi.unstubAllEnvs());

function candidate(): TradeItem {
  return {
    id: "candidate",
    slot: "ring1",
    name: "Queued Upgrade",
    baseType: "Opal Ring",
    itemClass: "Rings",
    rarity: "rare",
    modifiers: [],
    price: { amount: 1, currency: "divine" },
    rawText: "Item Class: Rings\nRarity: RARE\nQueued Upgrade\nOpal Ring",
  };
}

it("stores the full PoB request only for the worker and finalizes its metrics into the normal result", async () => {
  const build = { ...structuredClone(mockBuild), sourceXml: "<PathOfBuilding></PathOfBuilding>" };
  const item = candidate();
  const payload = createDurableOptimizationPayload({
    build,
    budget: { amount: 5, currency: "divine" },
    goal: "dps",
    allowedSlots: ["ring1"],
    league: "Mirage",
    candidates: [item],
  });
  expect(payload.engineRequest?.buildXml).toBe(build.sourceXml);
  expect(payload.context.build.sourceXml).toBeUndefined();
  expect(payload.context.candidates[0].rawText).toBeUndefined();

  const improved = { ...build.metrics, totalDps: build.metrics.totalDps + 100_000 };
  const job: DurableOptimizationJob = {
    version: 1,
    id: "00000000-0000-4000-8000-000000000000",
    clientId: "browser-client-0001",
    state: "completed",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    payload,
    engineResult: {
      engineVersion: "v2.65.0",
      dpsMetric: "CombinedDPS",
      baseline: build.metrics,
      results: [{ id: "0:ring1:candidate", metrics: improved }],
    },
  };
  const result = await finalizeOptimizationJob(job);
  expect(result.evaluatedCandidates).toBe(1);
  expect(result.candidateEvaluations[0]).toMatchObject({ verdict: "upgrade", qualified: true });
  expect(result.candidateEvaluations[0].changes.totalDps).toBe(100_000);
});

describe("OptimizationJobService", () => {
  it("returns the same unfinished job for a second submission from one browser", async () => {
    vi.stubEnv("POB_ASYNC_QUEUE_PREFIX", "test");
    const redis = new MemoryQueueRedis();
    const service = new OptimizationJobService(redis);
    const build = { ...structuredClone(mockBuild), sourceXml: "<PathOfBuilding></PathOfBuilding>" };
    const payload = createDurableOptimizationPayload({
      build,
      budget: { amount: 5, currency: "divine" },
      goal: "balanced",
      allowedSlots: ["ring1"],
      league: "Mirage",
      candidates: [candidate()],
    });
    const first = await service.enqueue(payload, "browser-client-0001");
    const second = await service.enqueue(payload, "browser-client-0001");
    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.job.id).toBe(first.job.id);
    await expect(service.publicStatus(first.job)).resolves.toMatchObject({ state: "queued", position: 1, queued: 1 });
  });
});
