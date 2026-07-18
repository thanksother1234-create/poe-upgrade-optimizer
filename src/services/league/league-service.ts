import { PoeLeague } from "@/models";

const PERMANENT_LEAGUES = new Set([
  "Standard", "Hardcore", "Solo Self-Found", "Hardcore SSF", "Ruthless",
  "Hardcore Ruthless", "SSF Ruthless", "Hardcore SSF Ruthless",
]);

export const isPermanentLeague = (league: PoeLeague) => PERMANENT_LEAGUES.has(league.id);

export function selectCurrentLeague(leagues: PoeLeague[], now = new Date()): string {
  const currentTime = now.getTime();
  const candidates = leagues
    .filter((league) => !isPermanentLeague(league))
    .filter((league) => !/(hardcore|\bhc\b|ssf|ruthless)/i.test(league.id))
    .filter((league) => {
      const start = league.startAt ? Date.parse(league.startAt) : Number.NaN;
      const end = league.endAt ? Date.parse(league.endAt) : Number.POSITIVE_INFINITY;
      return Number.isFinite(start) && start <= currentTime && end > currentTime;
    })
    .sort((a, b) => Date.parse(b.startAt ?? "") - Date.parse(a.startAt ?? ""));
  return candidates[0]?.id ?? "Standard";
}
