import { NextResponse } from "next/server";
import { createTradeSiteUrl } from "@/services/trade/trade-search-service";

const leagueNamePattern = /^[A-Za-z0-9][A-Za-z0-9 '()-]{0,79}$/;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const league = params.get("league")?.trim() ?? "";

  if (!leagueNamePattern.test(league)) {
    return NextResponse.json({ error: "Invalid trade search request." }, { status: 400 });
  }
  return NextResponse.redirect(createTradeSiteUrl(league), 302);
}
