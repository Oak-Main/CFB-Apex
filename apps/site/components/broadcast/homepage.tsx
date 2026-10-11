"use client";

import { featuredGame, weekGames, type HomepageData } from "@/lib/homepage";
import { easternDate } from "@/lib/game-calendar";
import { broadcastEventForGame, refreshStorylines, verifiedRefresh, type BoardWeekRow } from "@/lib/cfb-dataset";
import type { BoardWeekSelection } from "@/lib/week-cutover";
import { WeekSwitch, clockWeek, useBoardWeekCutover } from "./week-switch";
import { WeekHeaderStrip } from "./primitives";
import { MarqueeGame } from "./marquee-game";
import { WeekScoreboard } from "./week-scoreboard";
import { SaturdayBoard } from "./saturday-board";
import { LaneHeading } from "./primitives";
import { FinalsStrip } from "./finals-strip";
import { PollsVsMachines } from "./polls-vs-machines";
import { CurrentMetricsLane } from "./current-metrics";
import {
  FantasyLane,
  GamedayLane,
  PortalLane,
  PreseasonLane,
  RankingsLane,
} from "./intelligence-lanes";

const stamp = (value: string | undefined) =>
  value && Number.isFinite(Date.parse(value))
    ? `${new Date(value).toISOString().slice(0, 10)} ${new Date(value).toISOString().slice(11, 16)} UTC`
    : null;

/** Each chip names its own cutoff; one week's release never restamps another's. */
function weekChips(board: BoardWeekRow | undefined, isLatest: boolean): string[] {
  if (!verifiedRefresh) return [];
  const source = board ?? { retrieved_at: verifiedRefresh.retrieved_at, results_verified_at: verifiedRefresh.results_verified_at, schedule_verified_at: verifiedRefresh.schedule_verified_at };
  const chips = [
    stamp(source.retrieved_at) && `${isLatest ? "REVIEWED" : "SNAPSHOT"} ${stamp(source.retrieved_at)}`,
    stamp(source.results_verified_at) && `FINALS VERIFIED ${stamp(source.results_verified_at)}`,
    stamp(source.schedule_verified_at) && `SCHEDULE CHECKED ${stamp(source.schedule_verified_at)}`,
    board && stamp(board.records_verified_at) && `RECORDS CHECKED ${stamp(board.records_verified_at)}`,
    `POLLS RELEASED ${verifiedRefresh.polls?.[0]?.release_date ?? "—"}`,
  ];
  return chips.filter((chip): chip is string => typeof chip === "string");
}

export function BroadcastHomepage({
  data,
  cleanMode,
  onModeRequest,
  selection,
}: {
  data: HomepageData;
  cleanMode: boolean;
  onModeRequest: () => void;
  /** Server-clock board week; absent only outside a request (tests, previews). */
  selection?: BoardWeekSelection;
}) {
  const weeks = data.boardWeeks ?? [];
  const latest = weeks.at(-1);
  const board = weeks.find((entry) => entry.week === selection?.week) ?? latest;
  const boardStart = board?.start ?? data.referenceDate;
  const previousBoard = board ? weeks[weeks.indexOf(board) - 1] : undefined;
  const current = selection ? clockWeek(weeks, selection) : (latest?.week ?? null);
  useBoardWeekCutover(weeks, selection, true);
  const slate = weekGames(data.games, boardStart);
  // A story belongs to one board week; untagged stories ride the snapshot's own week.
  const storylines = refreshStorylines.filter(
    (story) => (story.week ?? verifiedRefresh?.week) === (board?.week ?? verifiedRefresh?.week),
  );
  // Shared weekly-header grammar, derived from the verified snapshot so it can
  // never advertise a stale week. Hidden entirely when no snapshot ships.
  const isLatest = board == null || board === latest;
  const weekStatus =
    board == null || current == null || board.week === current
      ? `AS OF ${(board?.retrieved_at ?? verifiedRefresh?.retrieved_at ?? "").slice(0, 10)}`
      : board.week < current
        ? "ARCHIVE"
        : "PREVIEW";
  const weekEyebrow = verifiedRefresh
    ? board
      ? `WEEK ${board.week} · ${board.label.toUpperCase()} · ${weekStatus}`
      : `WEEK ${verifiedRefresh.week} · AS OF ${verifiedRefresh.reference_date}`
    : null;
  // Finals on the board that post-date the stats cutoff are not in the leader totals.
  const metricsThrough = data.metrics?.through_games ?? null;
  const finalsAfterMetrics = metricsThrough
    ? data.games.filter(
        (game) => game.status === "final" && easternDate(game.date) > metricsThrough,
      ).length
    : 0;
  const featured =
    slate.find((game) => game.id === board?.marquee_game_id && game.status !== "final") ??
    featuredGame(slate, data.teams);
  const away = data.teams.find((team) => team.slug === featured?.awayTeamId);
  const home = data.teams.find((team) => team.slug === featured?.homeTeamId);
  const stadium =
    data.stadiums.find((venue) => venue.teamId === home?.slug) ??
    data.stadiums[0];
  const stadiumTeam = data.teams.find((team) => team.slug === stadium?.teamId);

  return (
    <div className="apex-home apex-container">
      <div className="apex-home-intro">
        <div>
          <h1 className="font-display text-balance">
            Every team. <span>Every angle.</span>
          </h1>
          <p>Your front-row seat to all {data.teams.length} FBS programs.</p>
        </div>
        <div className="apex-season-label">
          <span aria-hidden="true" />
          {data.referenceDate.slice(0, 4)}
          <span className="apex-season-word"> SEASON</span>
        </div>
      </div>
      <WeekHeaderStrip eyebrow={weekEyebrow} chips={weekChips(board, isLatest)} />
      <WeekSwitch weeks={weeks} selected={board?.week ?? null} current={current} />
      {board?.note ? <p className="apex-data-note apex-week-note">{board.note}</p> : null}
      {featured && away && home ? (
        <MarqueeGame
          game={featured}
          away={away}
          home={home}
          venue={
            data.stadiums.find((venue) => venue.teamId === home.slug)?.name
          }
          gameday={broadcastEventForGame(featured)}
        />
      ) : (
        <section className="apex-marquee">
          <p className="apex-empty">
            This week&apos;s marquee matchup is not published.
          </p>
        </section>
      )}
      <SaturdayBoard
        games={slate}
        teams={data.teams}
        pollTables={data.pollTables}
      />
      {storylines.length > 0 ? (
        <section className="apex-lane" aria-labelledby="storyline-title">
          <LaneHeading
            id="storyline-title"
            eyebrow="THE WEEK'S STORY"
            title="Worth a callout"
            href="/scores"
            linkLabel="Full slate"
          />
          {storylines.map((story) => {
            const row = verifiedRefresh?.scheduledGames.find((g) => g.provider_id === story.game_provider_id);
            const gameId = row ? `${row.date}-${row.away}-at-${row.home}` : null;
            const isRecap = (story.result_provider_ids?.length ?? 0) > 0;
            return (
              <article className="apex-storyline" key={story.id}>
                <h3>{story.headline}</h3>
                <p>{story.body}</p>
                <p className="apex-data-note">
                  {gameId ? (
                    <a href={`/games/${gameId}`}>On the board this week</a>
                  ) : isRecap ? (
                    <a href="/scores">Finals on the scoreboard</a>
                  ) : null}
                  {story.as_of ? ` · As of ${story.as_of}` : null}
                  {story.sources.map((source, index) => (
                    <span key={source}>
                      {" · "}
                      <a href={source} target="_blank" rel="noopener noreferrer">
                        {story.sources.length > 1 ? `Source ${index + 1}` : "Source"}
                      </a>
                    </span>
                  ))}
                </p>
              </article>
            );
          })}
        </section>
      ) : null}
      <WeekScoreboard
        games={slate}
        teams={data.teams}
        referenceDate={boardStart}
      />
      <FinalsStrip referenceDate={boardStart} fallbackDate={previousBoard?.start} />
      <div className="apex-intelligence-grid">
        <RankingsLane pollTables={data.pollTables} teams={data.teams} />
        <PortalLane
          portalCounts={data.portalCounts}
          teams={data.teams}
          portalAsOf={data.portalAsOf}
        />
      </div>
      <PollsVsMachines
        pollTables={data.pollTables}
        preseasonRatings={data.preseasonRatings}
        teams={data.teams}
      />
      {data.metrics ? <CurrentMetricsLane metrics={data.metrics} finalsSince={finalsAfterMetrics} /> : null}
      <FantasyLane
        fantasyNotes={data.fantasyNotes}
        teams={data.teams}
        fantasyAsOf={data.fantasyAsOf}
        cleanMode={cleanMode}
        onModeRequest={onModeRequest}
      />
      <PreseasonLane
        preseasonRatings={data.preseasonRatings}
        teams={data.teams}
      />
      <GamedayLane stadium={stadium} team={stadiumTeam} />
      <p className="apex-data-note">
        Independent college football intelligence · Latest release: board week of{" "}
        {data.datasetAsOf} · Reviewed {data.verifiedAt ?? "Not published"} · Module source dates shown separately ·{" "}
        <a href="/data-sources" className="underline underline-offset-4">
          Sources & data status
        </a>
      </p>
    </div>
  );
}
