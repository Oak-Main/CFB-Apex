import bundle from "./cfb-2026.generated.ts";
import { boardWeeks, games, pollTables, seasonRules, teams, verifiedRefresh } from "./cfb-dataset.ts";
import { injuryResearch } from "./injury-report.ts";
import { selectBoardWeek } from "./week-cutover.ts";
import type { Game } from "./types.ts";
import { compareGameDates } from "./game-calendar.ts";

// Explicit projection: no model metrics, sportsbook prices, private config or
// preview database state can enter the public Command Center contract.
export function publicGame(game: Game, nowMs: number) {
  const resultPending = game.status === "scheduled" && game.date.includes("T") && Date.parse(game.date) < nowMs;
  return {
    id: game.id, week: game.week, date: game.date, kickoffLabel: game.kickoffLabel,
    awayTeamId: game.awayTeamId, homeTeamId: game.homeTeamId, status: game.status,
    homeScore: game.homeScore ?? null, awayScore: game.awayScore ?? null,
    venue: game.venue, broadcast: game.broadcast, neutralSite: game.neutralSite,
    statusDetail: resultPending
      ? "Kickoff passed; result not yet verified in this reviewed snapshot."
      : game.statusDetail || null,
    sources: game.provenance.sourceUrl ? [game.provenance.sourceUrl] : [],
  };
}

export function gameDaySnapshot(nowMs: number, week?: string | null) {
  const selection = selectBoardWeek(boardWeeks, nowMs, week);
  const selected = selection.week ?? verifiedRefresh?.week ?? 8;
  const metadata = boardWeeks.find(row => row.week === selected);
  const priorWeek = boardWeeks.filter(row => row.week < selected && games.some(game => game.week === row.week && game.status === "final"))
    .map(row => row.week).sort((a, b) => b - a)[0];
  return {
    schemaVersion: 1 as const,
    season: seasonRules.season,
    revision: (bundle as unknown as { sharedDataRevision: string }).sharedDataRevision,
    serverNow: selection.serverNow, selectedWeek: selected, explicit: selection.explicit,
    weeks: boardWeeks,
    teams: teams.map(team => ({
      slug: team.slug, name: team.name, shortName: team.shortName, abbreviation: team.abbreviation,
      conference: team.conference, color: team.color, logo: team.logo ?? null,
      record: verifiedRefresh?.teamRecords[team.slug] ? team.record : null,
    })),
    games: games.filter(game => game.week === selected).sort((a, b) => compareGameDates(a.date, b.date)).map(game => publicGame(game, nowMs)),
    previousFinals: games.filter(game => game.week === priorWeek && game.status === "final").sort((a, b) => compareGameDates(a.date, b.date)).map(game => publicGame(game, nowMs)),
    polls: pollTables.filter(poll => poll.poll !== "composite"),
    sourceDates: {
      schedule: metadata?.schedule_verified_at ?? metadata?.retrieved_at ?? null,
      results: metadata?.results_verified_at ?? null,
      records: verifiedRefresh?.records_verified_at ?? verifiedRefresh?.retrieved_at ?? null,
      previousResults: boardWeeks.find(row => row.week === priorWeek)?.results_verified_at ?? null,
      injuries: injuryResearch.asOf,
    },
    injuries: {
      week: injuryResearch.week, asOf: injuryResearch.asOf, coverageNote: injuryResearch.coverageNote,
      ledger: injuryResearch.ledger,
      watch: injuryResearch.watch.map(({ practice: _practice, likelihood: _likelihood, social: _social, ...row }) => row),
      contextNotes: injuryResearch.contextNotes,
      officialReports: injuryResearch.officialReports,
    },
  };
}

export type GameDaySnapshot = ReturnType<typeof gameDaySnapshot>;

/**
 * Reviewed week contract, derived from the release itself rather than pinned
 * counts: a board week whose own `results_verified_at` is set is an archive
 * and must be entirely finals with complete scores; a week without it is a
 * preview and must be entirely scheduled with no scores. Returns null when
 * the shape satisfies the contract, else the reason it does not.
 */
export function reviewedWeekContractViolation(
  week: number,
  meta: { results_verified_at?: string | null } | undefined,
  games: ReadonlyArray<{ status: string; homeScore: number | null; awayScore: number | null }>,
): string | null {
  if (!meta) return `Week ${week} is not a reviewed board week`;
  if (games.length === 0) return `Week ${week} has no reviewed games`;
  if (meta.results_verified_at != null) {
    const pending = games.find(game => game.status !== "final" || game.homeScore == null || game.awayScore == null);
    return pending
      ? `Archive week ${week} carries a non-final or unscored game (status ${pending.status})`
      : null;
  }
  const started = games.find(game => game.status !== "scheduled" || game.homeScore != null || game.awayScore != null);
  return started
    ? `Preview week ${week} carries a started or scored game (status ${started.status})`
    : null;
}

/** Reject a broken or wrong-archive refresh; the caller retains its dated snapshot. */
export function isReviewedGameDayRefresh(value: unknown, explicitWeek: number | null): value is GameDaySnapshot {
  if (!value || typeof value !== "object") return false;
  const doc = value as Partial<GameDaySnapshot>;
  return doc.schemaVersion === 1 && /^[a-f0-9]{64}$/.test(doc.revision ?? "") &&
    Number.isInteger(doc.season) && Number.isInteger(doc.selectedWeek) && (doc.selectedWeek ?? -1) >= 0 &&
    (explicitWeek == null || doc.selectedWeek === explicitWeek) &&
    Array.isArray(doc.weeks) && doc.weeks.some(row => row && typeof row === "object" && row.week === doc.selectedWeek) &&
    Array.isArray(doc.games) && doc.games.every(game => game && typeof game === "object" && game.week === doc.selectedWeek && ["scheduled", "final", "delayed", "postponed", "canceled"].includes(game.status) && [game.homeScore, game.awayScore].every(score => score === null || (typeof score === "number" && Number.isInteger(score) && score >= 0)) && (game.status !== "final" || (game.homeScore !== null && game.awayScore !== null))) &&
    Array.isArray(doc.teams) && Array.isArray(doc.polls) && Array.isArray(doc.injuries?.watch);
}
