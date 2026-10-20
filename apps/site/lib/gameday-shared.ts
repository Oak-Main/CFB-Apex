import bundle from "./cfb-2026.generated.ts";
import { boardWeeks, games, pollTables, teams, verifiedRefresh } from "./cfb-dataset.ts";
import { injuryResearch } from "./injury-report.ts";
import { selectBoardWeek } from "./week-cutover.ts";
import type { Game } from "./types.ts";

// Explicit projection: no model metrics, sportsbook prices, private config or
// preview database state can enter the public Command Center contract.
function publicGame(game: Game) {
  return {
    id: game.id, week: game.week, date: game.date, kickoffLabel: game.kickoffLabel,
    awayTeamId: game.awayTeamId, homeTeamId: game.homeTeamId, status: game.status,
    homeScore: game.homeScore ?? null, awayScore: game.awayScore ?? null,
    venue: game.venue, broadcast: game.broadcast, neutralSite: game.neutralSite,
    statusDetail: game.statusDetail || null,
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
    revision: (bundle as unknown as { sharedDataRevision: string }).sharedDataRevision,
    serverNow: selection.serverNow, selectedWeek: selected, explicit: selection.explicit,
    weeks: boardWeeks,
    teams: teams.map(team => ({
      slug: team.slug, name: team.name, shortName: team.shortName, abbreviation: team.abbreviation,
      conference: team.conference, color: team.color, logo: team.logo ?? null,
      record: verifiedRefresh?.teamRecords[team.slug] ? team.record : null,
    })),
    games: games.filter(game => game.week === selected).map(publicGame),
    previousFinals: games.filter(game => game.week === priorWeek && game.status === "final").map(publicGame),
    polls: pollTables.filter(poll => poll.poll !== "composite"),
    sourceDates: {
      schedule: metadata?.schedule_verified_at ?? metadata?.retrieved_at ?? null,
      results: metadata?.results_verified_at ?? verifiedRefresh?.results_verified_at ?? null,
      records: verifiedRefresh?.retrieved_at ?? null,
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
