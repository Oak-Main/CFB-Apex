import {
  boardWeeks,
  broadcastAsOf,
  fantasyNotes,
  fantasyNotesAsOf,
  games,
  pollTables,
  portalAsOf,
  portalCountsFor,
  preseasonRatings,
  stadiums,
  teams,
  verifiedRefresh,
} from "./cfb-dataset.ts";
import { weekGames, type HomepageData } from "./homepage.ts";

const legacyAsOf =
  [broadcastAsOf, portalAsOf, fantasyNotesAsOf, "2026-09-05"]
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1) ?? "2026-09-05";
// Select the scoreboard's week from its own snapshot, independently of portal/fantasy.
const referenceDate = verifiedRefresh?.reference_date ?? legacyAsOf;
const datasetAsOf = verifiedRefresh?.reference_date ?? legacyAsOf;

/** The board week's Monday; the snapshot's current week when none is chosen. */
export function boardWeekStart(week: number | null | undefined): string {
  return boardWeeks.find((entry) => entry.week === week)?.start ?? referenceDate;
}

export const homepageData: HomepageData = {
  teams,
  games,
  pollTables,
  portalCounts: teams
    .map((team) => {
      const counts = portalCountsFor(team.slug);
      return {
        teamSlug: team.slug,
        // No recorded events is not evidence that a team's total is zero.
        incoming: counts.incoming > 0 ? counts.incoming : null,
        outgoing: counts.outgoing > 0 ? counts.outgoing : null,
      };
    })
    .sort((a, b) => (b.incoming ?? -1) - (a.incoming ?? -1)),
  fantasyNotes,
  preseasonRatings,
  stadiums: stadiums.map((stadium) => ({
    ...stadium,
    image: "/images/saturday-lights.png",
    imageIsIllustration: true,
  })),
  referenceDate,
  boardWeeks,
  datasetAsOf,
  portalAsOf,
  fantasyAsOf: fantasyNotesAsOf,
  metrics: verifiedRefresh?.metrics ?? null,
  verifiedAt: verifiedRefresh?.retrieved_at ?? null,
};

/** Latest verified finals through the board week, then that week's games to come. */
export function tickerGamesFor(week: number | null | undefined) {
  const selected = week ?? verifiedRefresh?.week ?? Number.POSITIVE_INFINITY;
  const slate = weekGames(games, boardWeekStart(week));
  return [
    ...games
      .filter((game) => game.status === "final" && game.week <= selected)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8),
    ...slate.filter((game) => game.status !== "final").slice(0, 8),
  ];
}

export const tickerGames = tickerGamesFor(verifiedRefresh?.week);
