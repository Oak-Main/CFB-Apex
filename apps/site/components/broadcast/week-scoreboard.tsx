"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  dateLabel,
  kickoffTime,
  published,
  type BroadcastGame,
  type BroadcastTeam,
} from "@/lib/homepage";
import { BroadcastBadge, LaneHeading, TeamMark } from "./primitives";
import { broadcastEventForGame } from "@/lib/cfb-dataset";
import { easternDate, weekStart } from "@/lib/game-calendar";
import {
  GameActionSheet,
  GameActionsButton,
  useGameActionSheet,
} from "@/components/polish/game-actions";

/** Renders one scoreboard game card, including its civil-date label and kickoff/status detail. */
function WeekGameCard({
  game,
  away,
  home,
}: {
  game: BroadcastGame;
  away: BroadcastTeam;
  home: BroadcastTeam;
}) {
  const actions = useGameActionSheet();
  const hasScore = game.status === "final" || game.status === "live";
  const gameLabel = game.neutralSite
    ? `${away.shortName} vs ${home.shortName}`
    : `${away.shortName} at ${home.shortName}`;
  const gameday = broadcastEventForGame(game);
  const rankedBoth = away.rank != null && home.rank != null;

  return (
    <>
      <article
        className={`apex-game-card apex-game-card--actions${rankedBoth ? " apex-game-card--ranked" : ""}${gameday ? " apex-game-card--gameday" : ""}`}
        {...actions.longPressProps}
      >
        <a className="apex-game-card__link" href={`/games/${game.id}`}>
          <div className="apex-game-card-main">
            <div className="apex-game-card-top">
              <span>
                {dateLabel(game.date)}
                {game.neutralSite && game.venue ? " · Neutral" : null}
              </span>
              {gameday ? (
                <BroadcastBadge tone="gold">{gameday.badge}</BroadcastBadge>
              ) : (
                <BroadcastBadge
                  tone={game.status === "live" ? "cyan" : "neutral"}
                >
                  {hasScore ? game.status : game.broadcast || "TV: Not published"}
                </BroadcastBadge>
              )}
            </div>
            {[away, home].map((team, index) => (
              <div className="apex-card-team" key={team.slug}>
                <TeamMark team={team} size="sm" />
                <span>
                  {team.rank != null && <small>{team.rank}</small>}
                  {team.shortName}
                </span>
                {hasScore ? (
                  <strong>
                    {published(index === 0 ? game.awayScore : game.homeScore)}
                  </strong>
                ) : (
                  <strong className="apex-record">
                    {team.record || "Not published"}
                  </strong>
                )}
              </div>
            ))}
          </div>
          <div className="apex-game-card-bottom">
            <span>
              {game.neutralSite && game.venue
                ? `${game.venue} (neutral) · `
                : ""}
              {hasScore
                ? game.statusDetail || game.status
                : kickoffTime(game) === "Not published"
                  ? "Kickoff: Not published"
                  : kickoffTime(game)}
            </span>
            <ChevronRight size={16} aria-hidden="true" />
          </div>
        </a>
        <GameActionsButton
          className="apex-game-card-more"
          label={`More actions for ${gameLabel}`}
          onClick={() => actions.setOpen(true)}
        />
      </article>
      <GameActionSheet
        open={actions.open}
        onOpenChange={actions.setOpen}
        gameLabel={gameLabel}
        matchupHref={`/games/${game.id}`}
        guideHref="/stadiums"
      />
    </>
  );
}

/** This-week scoreboard lane: filters games by Eastern civil date/rank and labels the published week using `referenceDate`. */
export function WeekScoreboard({
  games,
  teams,
  referenceDate,
}: {
  games: readonly BroadcastGame[];
  teams: readonly BroadcastTeam[];
  referenceDate: string;
}) {
  const [day, setDay] = useState("all");
  const [rankedOnly, setRankedOnly] = useState(false);
  const rail = useRef<HTMLElement>(null);
  const bySlug = new Map(teams.map((team) => [team.slug, team]));
  const dates = [...new Set(games.map((game) => easternDate(game.date)))];
  const filtered = games.filter(
    (game) =>
      (day === "all" || easternDate(game.date) === day) &&
      (!rankedOnly ||
        bySlug.get(game.awayTeamId)?.rank ||
        bySlug.get(game.homeTeamId)?.rank),
  );
  const scroll = (direction: number) =>
    rail.current?.scrollBy({
      left: direction * 300,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });

  return (
    <section
      className="apex-lane apex-enter"
      aria-labelledby="this-week-title"
      style={{ "--entrance-index": 1 } as React.CSSProperties}
    >
      <div className="apex-week-heading">
        <LaneHeading
          id="this-week-title"
          eyebrow="CLEAR YOUR SATURDAY"
          title="This week"
          href="/scores"
          linkLabel="Full scoreboard"
        />
        <div className="apex-week-tools">
          <fieldset className="apex-day-tabs">
            <legend className="sr-only">Filter scoreboard by day</legend>
            <button
              type="button"
              aria-pressed={day === "all" && !rankedOnly}
              onClick={() => {
                setDay("all");
                setRankedOnly(false);
              }}
            >
              All games
            </button>
            {dates.map((date) => (
              <button
                type="button"
                key={date}
                aria-pressed={day === date}
                onClick={() => {
                  setDay(date);
                  setRankedOnly(false);
                }}
              >
                {new Intl.DateTimeFormat("en-US", {
                  weekday: "short",
                  timeZone: "UTC",
                }).format(new Date(`${date}T12:00:00Z`))}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={rankedOnly}
              onClick={() => {
                setDay("all");
                setRankedOnly(true);
              }}
            >
              Top 25
            </button>
          </fieldset>
          <div className="apex-scroll-buttons">
            <button
              type="button"
              className="apex-icon-button"
              onClick={() => scroll(-1)}
              aria-label="Previous scoreboard games"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              className="apex-icon-button"
              onClick={() => scroll(1)}
              aria-label="Next scoreboard games"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
      <section
        className="apex-horizontal apex-crossfade"
        key={`${day}-${rankedOnly}`}
        ref={rail}
        tabIndex={0}
        aria-label="This week's games"
        aria-live="polite"
      >
        {filtered.length === 0 && (
          <p className="apex-empty">No games published for this selection.</p>
        )}
        {filtered.map((game) => {
          const away = bySlug.get(game.awayTeamId);
          const home = bySlug.get(game.homeTeamId);
          if (!away || !home) return null;
          return (
            <WeekGameCard key={game.id} game={game} away={away} home={home} />
          );
        })}
      </section>
      <p className="apex-data-note">
        Week of {dateLabel(weekStart(referenceDate))} · All times Eastern · FBS
        vs FBS · Rankings reflect the latest published AP poll. Scheduled games
        are a verified snapshot.
      </p>
    </section>
  );
}
