import { NextResponse } from "next/server";
import { PoeLeague } from "@/models";
import { selectCurrentLeague } from "@/services/league/league-service";

const fallback: PoeLeague[] = [{ id: "Standard", name: "Standard", realm: "pc", startAt: "2013-01-23T21:00:00Z", endAt: null }];

function isLeague(value: unknown): value is PoeLeague {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" && typeof candidate.name === "string" && candidate.realm === "pc";
}

export async function GET() {
  try {
    const response = await fetch("https://api.pathofexile.com/leagues?type=main&realm=pc&compact=1&limit=50", {
      headers: { "User-Agent": "PoEUpgradeOptimizer/0.1" },
    });
    if (!response.ok) throw new Error(`League service returned ${response.status}`);
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) throw new Error("League service returned invalid data");
    const leagues = payload.filter(isLeague);
    if (!leagues.length) throw new Error("No leagues returned");
    return NextResponse.json(
      { leagues, currentLeague: selectCurrentLeague(leagues), updatedAt: new Date().toISOString(), source: "official" },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch {
    return NextResponse.json({ leagues: fallback, currentLeague: "Standard", updatedAt: new Date().toISOString(), source: "fallback" });
  }
}
