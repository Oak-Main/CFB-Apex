import type { Game, Team } from "@/lib/types";
import { easternDate } from "./game-calendar.ts";

export type ScoreboardFilter =
  | "all"
  | "fbs"
  | "top-25"
  | "conference"
  | "my-teams";

export const scoreboardFilters: ReadonlyArray<{
  value: ScoreboardFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "fbs", label: "FBS vs FBS" },
  { value: "top-25", label: "Top 25" },
  { value: "conference", label: "Conference" },
  { value: "my-teams", label: "My Teams" },
];

export function continuousWeeks(publishedWeeks: readonly number[]) {
  if (publishedWeeks.length === 0) return [];
  const first = Math.min(...publishedWeeks);
  const last = Math.max(...publishedWeeks);
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

export function defaultScoreboardWeek(
  source: readonly Game[],
  asOf: string | null,
) {
  const sortedWeeks = [...new Set(source.map((game) => game.week))].sort(
    (a, b) => a - b,
  );
  if (sortedWeeks.length === 0) return 0;
  const reference =
    asOf && !Number.isNaN(Date.parse(asOf)) ? asOf : "0000-00-00";
  const nextSaturday = source
    .filter((game) => {
      const date = easternDate(game.date);
      return (
        date >= reference && new Date(`${date}T12:00:00Z`).getUTCDay() === 6
      );
    })
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  return nextSaturday?.week ?? sortedWeeks.at(-1) ?? 0;
}

export function gamesForWeek(source: readonly Game[], week: number) {
  return source
    .filter((game) => game.week === week)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function filterScoreboardGames({
  source,
  teams,
  filter,
  conference,
  favorites,
}: {
  source: readonly Game[];
  teams: readonly Team[];
  filter: ScoreboardFilter;
  conference: string;
  favorites: ReadonlySet<string>;
}) {
  const byId = new Map(teams.map((team) => [team.id, team]));
  return source.filter((game) => {
    const away = byId.get(game.awayTeamId);
    const home = byId.get(game.homeTeamId);
    if (!away || !home) return false;
    if (filter === "all") return true;
    if (filter === "fbs") {
      return away.subdivision !== "FCS" && home.subdivision !== "FCS";
    }
    if (filter === "top-25") return away.rank != null || home.rank != null;
    if (filter === "conference") {
      return away.conference === conference || home.conference === conference;
    }
    return favorites.has(away.id) || favorites.has(home.id);
  });
}

export function groupGamesByDate(source: readonly Game[]) {
  const groups = new Map<string, Game[]>();
  for (const game of source) {
    const date = easternDate(game.date);
    const group = groups.get(date) ?? [];
    group.push(game);
    groups.set(date, group);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, games]) => ({ date, games }));
}

export function appointmentGames(
  source: readonly Game[],
  teams: readonly Team[],
  limit = 5,
) {
  const byId = new Map(teams.map((team) => [team.id, team]));
  const score = (game: Game) => {
    const awayRank = byId.get(game.awayTeamId)?.rank;
    const homeRank = byId.get(game.homeTeamId)?.rank;
    const rankedTeams = [awayRank, homeRank].filter(
      (rank): rank is number => rank != null,
    );
    const rankValue = rankedTeams.reduce(
      (total, rank) => total + (26 - rank) * 4,
      0,
    );
    const broadcastValue = game.broadcast ? 28 : 0;
    const timeValue = /\d{1,2}:\d{2} (?:AM|PM) ET/.test(game.kickoffLabel)
      ? 8
      : 0;
    return rankValue + broadcastValue + timeValue;
  };
  return [...source]
    .sort(
      (a, b) =>
        score(b) - score(a) ||
        a.date.localeCompare(b.date) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, Math.max(0, limit));
}

export function scoreboardDateLabel(date: string, long = false) {
  const parsed = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "Date not published";
  return new Intl.DateTimeFormat("en-US", {
    weekday: long ? "long" : "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

export function kickoffTimeLabel(game: Game) {
  return game.kickoffLabel.match(/\d{1,2}:\d{2} (?:AM|PM) ET/)?.[0] ?? (/Kickoff TBA/.test(game.kickoffLabel) ? "Kickoff TBA" : "TBD");
}

export function broadcastLabel(game: Game) {
  return game.broadcast ?? "Network not assigned";
}

/** Only deliberate horizontal swipes navigate weeks; vertical pulls do nothing. */
export function scoreboardSwipeDirection(deltaX: number, deltaY: number): "next" | "previous" | null {
  if (Math.abs(deltaX) <= 62 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return null;
  return deltaX < 0 ? "next" : "previous";
}


interface SourceStamps {
  week?: number;
  schedule_verified_at?: string;
  results_verified_at?: string;
}

/** A week-scoped source label; a fresh release never restamps other weeks.
 * A release that covers several board weeks supplies each week's own stamps. */
export function scoreboardSourceLabel(
  week: number,
  snapshot: SourceStamps | null,
  boardWeeks: readonly SourceStamps[] = [],
): { badge: string; detail: string } {
  const board = boardWeeks.find((row) => row.week === week);
  const source = board ?? (snapshot?.week === week ? snapshot : null);
  if (!snapshot || !source) {
    return { badge: "Published snapshot", detail: `Week ${week} retains its original source dates. This board does not provide continuous live scoring.` };
  }
  const stamp = (value: string | undefined) => value && Number.isFinite(Date.parse(value))
    ? `${new Date(value).toISOString().slice(0, 16).replace("T", " ")} UTC`
    : "not published";
  const finals = board && !board.results_verified_at ? "no finals verified yet" : `finals verified ${stamp(source.results_verified_at)}`;
  return {
    badge: "Verified snapshot",
    detail: `Week ${week} schedule checked ${stamp(source.schedule_verified_at)}; ${finals}. Status changes require a newer verified release.`,
  };
}
