import { Build, CurrencyAmount, CurrencyUnit, EquipmentSlot, ItemModifier, ItemRarity, TradeItem } from "@/models";
import { toChaos } from "@/lib/metrics";
import { TradeMarketService } from "@/services/trade/trade-market-service";
import { getTradeCategory } from "@/services/trade/trade-categories";
import { createTradeSiteUrl } from "@/services/trade/trade-search-service";

const FETCH_BATCH_SIZE = 10;
const DEFAULT_ITEMS_PER_SLOT = 3;
const DEFAULT_USER_AGENT = "OAuth PoEUpgradeOptimizer/0.2 (contact: local-development)";

type TradeModifier = string | { description?: unknown };

interface TradeSearchResponse {
  id?: unknown;
  result?: unknown;
}

interface TradeFetchEntry {
  id?: unknown;
  listing?: { price?: { amount?: unknown; currency?: unknown } };
  item?: {
    name?: unknown;
    typeLine?: unknown;
    baseType?: unknown;
    rarity?: unknown;
    icon?: unknown;
    implicitMods?: TradeModifier[];
    explicitMods?: TradeModifier[];
    craftedMods?: TradeModifier[];
    fracturedMods?: TradeModifier[];
    enchantMods?: TradeModifier[];
    runeMods?: TradeModifier[];
    extended?: { text?: unknown };
  };
}

interface TradeFetchResponse {
  result?: unknown;
}

export class LiveTradeError extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message);
    this.name = "LiveTradeError";
  }
}

const text = (value: unknown) => typeof value === "string" ? value : "";

export function normalizePoeUserAgent(value?: string) {
  const userAgent = value?.trim() || DEFAULT_USER_AGENT;
  return /^OAuth\s+/i.test(userAgent) ? userAgent : `OAuth ${userAgent}`;
}

function hasContactEmail(userAgent: string) {
  return /^OAuth\s+\S+\/\S+\s+\(contact:\s*[^\s@()]+@[^\s@()]+\.[^\s@()]+\)$/i.test(userAgent);
}

async function forbiddenTradeError(response: Response, userAgent: string, operation: "search" | "listing fetch") {
  let body = "";
  try {
    body = await response.clone().text();
  } catch {
    // The status and headers still provide useful diagnostics when the body cannot be read.
  }

  const server = response.headers.get("server") ?? "";
  const contentType = response.headers.get("content-type") ?? "";
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
  const apiDenial = contentType.toLowerCase().includes("application/json")
    || /^\s*[{[]/.test(body);
  const validIdentityShape = hasContactEmail(userAgent);

  console.warn("[poe-trade] upstream request rejected", {
    operation,
    status: response.status,
    rejection: edgeBlock ? "edge-block" : hasRateHeaders ? "rate-policy" : apiDenial ? "api-forbidden" : "unknown-forbidden",
    server: server || undefined,
    contentType: contentType || undefined,
    cfRay: cfRay || undefined,
    hasRateHeaders,
    userAgent: {
      oauthPrefix: /^OAuth\s+/i.test(userAgent),
      contactEmail: validIdentityShape,
      length: userAgent.length,
    },
  });

  if (!validIdentityShape) {
    return new LiveTradeError("POE_USER_AGENT is not in the required format. Set it to OAuth AppName/Version (contact: real-email@example.com), then redeploy.", 502);
  }
  if (edgeBlock) {
    return new LiveTradeError("Path of Exile blocked the request from Vercel's hosting network (diagnostic: edge-block). Your POE_USER_AGENT format is valid; changing the email again will not fix this.", 502);
  }
  if (hasRateHeaders) {
    return new LiveTradeError("Path of Exile rejected the request under its rate or abuse policy (diagnostic: rate-policy). Stop retries for at least 10 minutes before trying again.", 502);
  }
  if (apiDenial) {
    return new LiveTradeError("Path of Exile returned an API authorization denial to the hosted trade client (diagnostic: api-forbidden). Your POE_USER_AGENT format is valid.", 502);
  }
  return new LiveTradeError("Path of Exile rejected the hosted trade request (diagnostic: unknown-forbidden). Check the Vercel function log for '[poe-trade] upstream request rejected'.", 502);
}

function parseModifier(modifier: TradeModifier): string | null {
  if (typeof modifier === "string") return modifier;
  return typeof modifier.description === "string" ? modifier.description : null;
}

function parseRarity(value: unknown): ItemRarity {
  const rarity = text(value).toLowerCase();
  return rarity === "magic" || rarity === "rare" || rarity === "unique" ? rarity : "normal";
}

function decodeItemText(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function itemClassFromRawText(rawText: string) {
  return rawText.match(/^Item Class:\s*(.+)$/m)?.[1]?.trim();
}

function mapListing(entry: TradeFetchEntry, slot: EquipmentSlot, league: string, queryId: string): TradeItem | null {
  const listingId = text(entry.id);
  const item = entry.item;
  const amount = Number(entry.listing?.price?.amount);
  const currency = text(entry.listing?.price?.currency) as CurrencyUnit;
  const rawText = decodeItemText(item?.extended?.text);
  const imageUrl = text(item?.icon);
  if (!listingId || !item || !rawText || !imageUrl || !Number.isFinite(amount) || amount <= 0 || !["chaos", "divine"].includes(currency)) return null;

  const modifierGroups = [item.enchantMods, item.implicitMods, item.explicitMods, item.fracturedMods, item.craftedMods, item.runeMods];
  const labels = modifierGroups.flatMap((group) => group ?? []).map(parseModifier).filter((label): label is string => Boolean(label));
  const modifiers: ItemModifier[] = labels.map((label) => ({
    label,
    value: Number(label.match(/[+-]?\d+(?:\.\d+)?/)?.[0] ?? 0),
  }));
  const baseType = text(item.baseType) || text(item.typeLine) || "Unknown Base";
  const name = text(item.name) || text(item.typeLine) || baseType;

  return {
    id: listingId,
    slot,
    name,
    baseType,
    itemClass: itemClassFromRawText(rawText),
    rarity: parseRarity(item.rarity),
    modifiers,
    imageUrl,
    price: { amount, currency },
    rawText,
    tradeUrl: createTradeSiteUrl(league, queryId),
  };
}

export class LiveTradeMarketService implements TradeMarketService {
  private readonly cache = new Map<string, Promise<TradeItem[]>>();
  private readonly userAgent: string;

  constructor(
    userAgent = process.env.POE_USER_AGENT,
    private readonly itemsPerSlot = DEFAULT_ITEMS_PER_SLOT,
  ) {
    this.userAgent = normalizePoeUserAgent(userAgent);
  }

  async searchUpgrades(build: Build, slot: EquipmentSlot, budget: CurrencyAmount, league: string): Promise<TradeItem[]> {
    const currentItem = build.equipment[slot];
    if (!currentItem || currentItem.id.startsWith("empty-")) return [];
    const category = getTradeCategory(slot, currentItem);
    const key = `${league}|${category ?? currentItem.baseType}|${toChaos(budget)}`;
    const existing = this.cache.get(key);
    const baseItems = existing ?? this.search(category, currentItem.baseType, budget, league, slot);
    if (!existing) this.cache.set(key, baseItems);
    return (await baseItems).map((item) => ({ ...item, slot }));
  }

  async estimatePrice(item: TradeItem) {
    return item.price;
  }

  private async search(category: string | null, baseType: string, budget: CurrencyAmount, league: string, slot: EquipmentSlot): Promise<TradeItem[]> {
    const filters: Record<string, unknown> = {
      trade_filters: { filters: { sale_type: { option: "priced" }, price: { max: toChaos(budget) } } },
    };
    if (category) filters.type_filters = { filters: { category: { option: category } } };

    const query = {
      query: {
        status: { option: "online" },
        ...(category ? {} : { type: baseType }),
        stats: [{ type: "and", filters: [] }],
        filters,
      },
      sort: { price: "desc" },
    };
    const searchResponse = await fetch(`https://www.pathofexile.com/api/trade/search/${encodeURIComponent(league)}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": this.userAgent },
      body: JSON.stringify(query),
      cache: "no-store",
    });
    if (searchResponse.status === 429) throw new LiveTradeError("The Path of Exile trade API rate limit was reached. Wait a moment and try again.", 429);
    if (searchResponse.status === 403) throw await forbiddenTradeError(searchResponse, this.userAgent, "search");
    if (!searchResponse.ok) throw new LiveTradeError(`Path of Exile trade search returned ${searchResponse.status}.`);

    const searchPayload = await searchResponse.json() as TradeSearchResponse;
    const queryId = text(searchPayload.id);
    const ids = Array.isArray(searchPayload.result) ? searchPayload.result.filter((id): id is string => typeof id === "string").slice(0, FETCH_BATCH_SIZE) : [];
    if (!queryId || !ids.length) return [];

    const fetchResponse = await fetch(`https://www.pathofexile.com/api/trade/fetch/${ids.join(",")}?query=${encodeURIComponent(queryId)}`, {
      headers: { Accept: "application/json", "User-Agent": this.userAgent },
      cache: "no-store",
    });
    if (fetchResponse.status === 429) throw new LiveTradeError("The Path of Exile trade API rate limit was reached. Wait a moment and try again.", 429);
    if (fetchResponse.status === 403) throw await forbiddenTradeError(fetchResponse, this.userAgent, "listing fetch");
    if (!fetchResponse.ok) throw new LiveTradeError(`Path of Exile trade listing fetch returned ${fetchResponse.status}.`);

    const fetchPayload = await fetchResponse.json() as TradeFetchResponse;
    const entries = Array.isArray(fetchPayload.result) ? fetchPayload.result as TradeFetchEntry[] : [];
    return entries.map((entry) => mapListing(entry, slot, league, queryId)).filter((item): item is TradeItem => Boolean(item)).slice(0, this.itemsPerSlot);
  }
}
