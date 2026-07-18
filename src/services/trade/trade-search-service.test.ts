import { describe, expect, it } from "vitest";
import { mockTradeItems } from "@/mocks/trade-items";
import { createBaseItemTradeSearch, createEncodedTradeSearchUrl, createTradeSiteUrl } from "./trade-search-service";

describe("trade search links", () => {
  it("creates an online base-item search sorted by price", () => {
    const search = createBaseItemTradeSearch(mockTradeItems[0]);
    expect(search.query.status.option).toBe("online");
    expect(search.query.type).toBe("Prophecy Wand");
    expect(search.sort.price).toBe("asc");
  });

  it("encodes league names and optional search ids", () => {
    expect(createTradeSiteUrl("Hardcore Mirage", "abc/123")).toBe(
      "https://www.pathofexile.com/trade/search/Hardcore%20Mirage/abc%2F123",
    );
  });

  it("creates a directly loadable trade URL containing the full query", () => {
    const request = createBaseItemTradeSearch(mockTradeItems[0]);
    const url = new URL(createEncodedTradeSearchUrl("Hardcore Mirage", request));
    expect(url.pathname).toBe("/trade/search/Hardcore%20Mirage");
    expect(JSON.parse(url.searchParams.get("q") ?? "")).toEqual({ engine: "new", ...request });
  });
});
