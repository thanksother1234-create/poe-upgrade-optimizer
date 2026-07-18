import { NextResponse } from "next/server";
import { mockTradeItems } from "@/mocks/trade-items";
import { createBaseItemTradeSearch, createTradeSiteUrl } from "@/services/trade/trade-search-service";

const leagueNamePattern = /^[A-Za-z0-9][A-Za-z0-9 '()-]{0,79}$/;
const searchIdPattern = /^[A-Za-z0-9]+$/;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const league = params.get("league")?.trim() ?? "";
  const itemId = params.get("item")?.trim() ?? "";
  const item = mockTradeItems.find((candidate) => candidate.id === itemId);

  if (!item || !leagueNamePattern.test(league)) {
    return NextResponse.json({ error: "Invalid trade search request." }, { status: 400 });
  }

  const fallbackUrl = createTradeSiteUrl(league);

  try {
    const response = await fetch(`https://www.pathofexile.com/api/trade/search/${encodeURIComponent(league)}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "PoEUpgradeOptimizer/0.1",
      },
      body: JSON.stringify(createBaseItemTradeSearch(item)),
      cache: "no-store",
    });

    if (!response.ok) throw new Error(`Trade search returned ${response.status}`);
    const payload = await response.json() as { id?: unknown };
    if (typeof payload.id !== "string" || !searchIdPattern.test(payload.id)) {
      throw new Error("Trade search returned an invalid id");
    }

    return NextResponse.redirect(createTradeSiteUrl(league, payload.id), 302);
  } catch {
    return NextResponse.redirect(fallbackUrl, 302);
  }
}
