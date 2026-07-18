import { TradeItem } from "@/models";

export interface PoeTradeSearchRequest {
  query: {
    status: { option: "online" };
    type: string;
    stats: [{ type: "and"; filters: [] }];
  };
  sort: { price: "asc" };
}

export interface PoeTradeQueryPayload {
  engine?: "new";
  query: unknown;
  sort: unknown;
}

export function createBaseItemTradeSearch(item: TradeItem): PoeTradeSearchRequest {
  return {
    query: {
      status: { option: "online" },
      type: item.baseType,
      stats: [{ type: "and", filters: [] }],
    },
    sort: { price: "asc" },
  };
}

export function createTradeSiteUrl(league: string, searchId?: string) {
  const leaguePath = encodeURIComponent(league);
  const searchPath = searchId ? `/${encodeURIComponent(searchId)}` : "";
  return `https://www.pathofexile.com/trade/search/${leaguePath}${searchPath}`;
}

export function createEncodedTradeSearchUrl(league: string, request: PoeTradeQueryPayload) {
  const payload = { engine: "new" as const, ...request };
  return `${createTradeSiteUrl(league)}?q=${encodeURIComponent(JSON.stringify(payload))}`;
}
