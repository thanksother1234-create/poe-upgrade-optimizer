import { describe, expect, it } from "vitest";
import { PoeLeague } from "@/models";
import { selectCurrentLeague } from "./league-service";

const league = (id: string, startAt: string | null, endAt: string | null = null): PoeLeague => ({ id, name: id, realm: "pc", startAt, endAt });

describe("selectCurrentLeague", () => {
  it("selects the active softcore challenge league", () => {
    const leagues = [league("Standard", "2013-01-23T21:00:00Z"), league("Hardcore Mirage", "2026-03-06T19:00:00Z"), league("Mirage", "2026-03-06T19:00:00Z")];
    expect(selectCurrentLeague(leagues, new Date("2026-07-18T12:00:00Z"))).toBe("Mirage");
  });

  it("ignores future and expired leagues", () => {
    const leagues = [league("Old League", "2025-01-01T00:00:00Z", "2025-04-01T00:00:00Z"), league("Future League", "2027-01-01T00:00:00Z")];
    expect(selectCurrentLeague(leagues, new Date("2026-07-18T12:00:00Z"))).toBe("Standard");
  });
});
