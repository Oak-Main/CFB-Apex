"use client";

import { withPacific } from "@/lib/kickoff-zones";
import { ArrowRight, MapPin, Radio, Star, Tv } from "lucide-react";
import type { Game, Team } from "@/lib/types";
import { broadcastLabel, kickoffTimeLabel } from "@/lib/scoreboard";
import { TeamMark } from "./primitives";

export interface GameDetailPageProps {
  game: Game;
  away: Team;
  home: Team;
  broadcastAsOf: string | null;
  favorites: ReadonlySet<string>;
  onFavorite: (teamId: string) => void;
}

function MatchupTeam({
  team,
  score,
  side,
}: {
  team: Team;
  score?: number;
  side: "away" | "home";
}) {
  return (
    <div className={`game-detail-team game-detail-team--${side}`}>
      <TeamMark team={team} size="hero" priority />
      <div>
        <span>{team.rank != null ? `#${team.rank}` : team.conference}</span>
        <strong className="font-display text-balance">{team.shortName}</strong>
        <small>{team.record || "Record not published"}</small>
      </div>
      {score != null && <b className="font-display">{score}</b>}
    </div>
  );
}

export function GameDetailPage({
  game,
  away,
  home,
  broadcastAsOf,
  favorites,
  onFavorite,
}: GameDetailPageProps) {
  const isFinal = game.status === "final";
  const isFavorite = favorites.has(home.id);
  const network = game.broadcast;

  return (
    <div className="game-detail-page">
      <header
        className="game-detail-hero"
        style={
          {
            "--away-team-color": away.color,
            "--home-team-color": home.color,
          } as React.CSSProperties
        }
      >
        <div className="game-detail-field" aria-hidden="true" />
        <div className="apex-container game-detail-hero__inner">
          <div className="game-detail-hero__topline">
            <a href="/scores">Scoreboard</a>
            <span
              className={`game-detail-status game-detail-status--${game.status}`}
            >
              {game.status === "final" ? "Final" : game.status}
            </span>
            <button
              type="button"
              aria-pressed={isFavorite}
              onClick={() => onFavorite(home.id)}
              aria-label={`${isFavorite ? "Remove" : "Add"} ${home.shortName} ${isFavorite ? "from" : "to"} My Teams`}
            >
              <Star aria-hidden="true" fill={isFavorite ? "currentColor" : "none"} />
              {isFavorite ? "In My Teams" : "Add to My Teams"}
            </button>
          </div>

          <h1 className="sr-only">
            {away.name} at {home.name} game {isFinal ? "result" : "preview"}
          </h1>
          <div className="game-detail-matchup">
            <MatchupTeam team={away} score={game.awayScore} side="away" />
            <div className="game-detail-matchup__center">
              {isFinal ? (
                <>
                  <span className="font-display">FINAL</span>
                  <strong>{game.statusDetail}</strong>
                </>
              ) : (
                <>
                  <span className="font-display">{withPacific(kickoffTimeLabel(game))}</span>
                  <strong>{broadcastLabel(game)}</strong>
                </>
              )}
              <small>{game.neutralSite ? "Neutral site" : "On campus"}</small>
            </div>
            <MatchupTeam team={home} score={game.homeScore} side="home" />
          </div>

          <a
            className="game-detail-venue"
            href={`/stadiums/${game.venueSlug}`}
          >
            <MapPin aria-hidden="true" />
            <span>
              <strong>{game.venue}</strong>
              {game.city && <small>{game.city}</small>}
            </span>
            <ArrowRight aria-hidden="true" />
          </a>
        </div>
      </header>

      <main className="apex-container game-detail-guide-grid">
        <article className="game-detail-guide-card game-detail-guide-card--gameday">
          <span className="game-detail-guide-card__icon">
            <MapPin aria-hidden="true" />
          </span>
          <div>
            <span className="scoreboard-eyebrow">GAMEDAY GUIDE</span>
            <h2 className="font-display">Arrive ready.</h2>
            <p>
              Open the venue guide for parking, bag policy, transit, and stadium
              details published for {game.venue}.
            </p>
          </div>
          <a href={`/stadiums/${game.venueSlug}`}>
            Open venue guide <ArrowRight aria-hidden="true" />
          </a>
        </article>

        <article className="game-detail-guide-card game-detail-guide-card--watch">
          <span className="game-detail-guide-card__icon">
            {network ? <Tv aria-hidden="true" /> : <Radio aria-hidden="true" />}
          </span>
          <div>
            <span className="scoreboard-eyebrow">WHERE TO WATCH</span>
            <h2 className="font-display">{broadcastLabel(game)}</h2>
            {network ? (
              <p>
                Find {network} through your participating TV provider or live TV
                service. Access depends on your subscription and region.
              </p>
            ) : (
              <p>
                No television network is assigned in the current verified
                compilation. Check back after the next designation window.
              </p>
            )}
          </div>
          <small>
            TV designations compiled {broadcastAsOf ?? "date not published"}.
          </small>
        </article>
      </main>
    </div>
  );
}
