/**
 * Roster research pool for the Battle of the No Names.
 * A missing recruiting rating is unknown. It does not establish an unrated
 * recruit, acquisition history, contribution, breakout status or qualification.
 * Published two-star roster values also require individual recruiting review.
 */
import { getRoster, teams } from "./cfb-dataset.ts";

export interface NoNamePlayer {
  id: string;
  player: string;
  team: string;
  position: string | null;
  class: string | null;
  stars: number | null;
  howAcquired: "two_star" | "unknown";
  jersey: number | null;
  height: string | null;
  weight: string | null;
  hometown: string | null;
  roleNote: string | null;
  snapShare: number | null;
  stats2025: string | null;
  stats2026: string | null;
  breakoutNote: string | null;
  sources: string[];
  confidence: "high" | "medium" | "low" | null;
}

/* Derived from rosters at module load — no separate build step needed. */
export const noNames: NoNamePlayer[] = [];
for (const team of teams) {
  const roster = getRoster(team.slug);
  if (!roster?.position_groups) continue;
  for (const group of roster.position_groups) {
    for (const p of group.players) {
      if (!p.name) continue;
      const stars = p.stars ?? null;
      if (stars !== null && stars > 2) continue; // research pool only; null is not proof of an unrated recruit
      noNames.push({
        id: `${team.slug}-${p.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
        player: p.name,
        team: team.slug,
        position: p.position ?? null,
        class: p.class ?? null,
        stars,
        howAcquired: stars === 2 ? "two_star" : "unknown",
        jersey: p.jersey ?? null,
        height: p.height ?? null,
        weight: p.weight ?? null,
        hometown: p.hometown ?? null,
        roleNote: null,
        snapShare: null,
        stats2025: null,
        stats2026: null,
        breakoutNote: null,
        sources: [],
        confidence: null,
      });
    }
  }
}

export function noNamesForTeam(slug: string): NoNamePlayer[] {
  return noNames.filter((p) => p.team === slug);
}

export function noNamesByPosition(): Array<{ position: string; count: number }> {
  const counts = new Map<string, number>();
  for (const p of noNames) {
    const pos = p.position ?? "Unknown";
    counts.set(pos, (counts.get(pos) ?? 0) + 1);
  }
  return [...counts.entries()].map(([position, count]) => ({ position, count })).sort((a, b) => b.count - a.count);
}

export function noNamesTeamCounts(): Array<{ team: string; count: number }> {
  const counts = new Map<string, number>();
  for (const p of noNames) counts.set(p.team, (counts.get(p.team) ?? 0) + 1);
  return [...counts.entries()].map(([team, count]) => ({ team, count })).sort((a, b) => b.count - a.count);
}

export const breakoutCandidates: NoNamePlayer[] = []; // populated when research lands
export const noNamesAsOf: string | null = null;
