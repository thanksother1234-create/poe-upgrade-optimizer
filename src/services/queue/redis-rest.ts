export type RedisArgument = string | number;

interface RedisResponse<T> {
  result?: T;
  error?: string;
}

export class RedisRestError extends Error {
  constructor(message: string, public readonly status = 503) {
    super(message);
    this.name = "RedisRestError";
  }
}

export class RedisRestClient {
  readonly configured: boolean;
  private readonly baseUrl: string;

  constructor(
    url = process.env.UPSTASH_REDIS_REST_URL,
    private readonly token = process.env.UPSTASH_REDIS_REST_TOKEN,
  ) {
    this.baseUrl = url?.trim().replace(/\/$/, "") ?? "";
    this.configured = Boolean(this.baseUrl && this.token);
  }

  async command<T>(...command: RedisArgument[]): Promise<T> {
    return this.request<T>("", command);
  }

  async pipeline<T extends unknown[]>(commands: RedisArgument[][]): Promise<T> {
    const responses = await this.request<RedisResponse<unknown>[]>("/pipeline", commands, false);
    return responses.map((response) => {
      if (response.error) throw new RedisRestError(`The durable queue returned an error: ${response.error}`);
      return response.result;
    }) as T;
  }

  private async request<T>(path: string, body: unknown, unwrap = true): Promise<T> {
    if (!this.configured) throw new RedisRestError("The durable optimization queue is not configured.");
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new RedisRestError("The durable optimization queue is temporarily unavailable.");
    }
    const payload = await response.json().catch(() => undefined) as RedisResponse<T> | T | undefined;
    if (!response.ok) {
      const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `Redis returned ${response.status}.`;
      throw new RedisRestError(`The durable optimization queue is unavailable: ${message}`, response.status);
    }
    if (!unwrap) return payload as T;
    const envelope = payload as RedisResponse<T> | undefined;
    if (!envelope || envelope.error) throw new RedisRestError(`The durable queue returned an error: ${envelope?.error ?? "empty response"}.`);
    return envelope.result as T;
  }
}
