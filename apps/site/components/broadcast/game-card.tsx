"use client";

import { withPacific } from "@/lib/kickoff-zones";
import { ChevronDown, MapPin, Star, Tv } from "lucide-react";
import type { Game, Team } from "@/lib/types";
import {
  broadcastLabel,
  kickoffTimeLabel,
  scoreboardDateLabel,
} from "@/lib/scoreboard";
import { TeamMark } from "./primitives";

interface BroadcastGameCardProps {
  game: Game;
  away: Team;
  home: Team;
  favoriteIds: ReadonlySet<string>;
  onFavorite: (teamId: string) => void;
  variant?: "compact" | "wide";
  broadcastNote?: string | null;
}

function TeamRow({
  team,
  score,
  showScore,
}: {
  team: Team;
  score?: number;
  showScore: boolean;
}) {
  return (
    <div className="score-game-card__team">
      <TeamMark team={team} size="md" />
      <span className="score-game-card__team-copy">
        <span>
          {team.rank != null && (
            <small className="score-game-card__rank">{team.rank}</small>
          )}
          <strong className="font-display">{team.shortName}</strong>
        </span>
        <small>{team.record || "Record not published"}</small>
      </span>
      {showScore && (
        <b className="score-game-card__score font-display">
          {score ?? "—"}
        </b>
      )}
    </div>
  );
}

export function BroadcastGameCard({
  game,
  away,
  home,
  favoriteIds,
  onFavorite,
  variant = "wide",
  broadcastNote,
}: BroadcastGameCardProps) {
  const isFavorite = favoriteIds.has(home.id);
  const showScore = game.status === "final";
  const date = game.date.slice(0, 10);

  return (
    <article
      className={`score-game-card score-game-card--${variant}`}
      style={{ "--home-team-color": home.color } as React.CSSProperties}
    >
      <header className="score-game-card__topline">
        <span className="score-game-card__date">
          {scoreboardDateLabel(date)}
        </span>
        <span
          className={`score-game-card__status score-game-card__status--${game.status}`}
          title={game.statusDetail}
        >
          {game.status === "final" ? "Final" : game.status}
        </span>
        <button
          className="score-game-card__favorite"
          type="button"
          aria-pressed={isFavorite}
          aria-label={`${isFavorite ? "Remove" : "Add"} ${home.shortName} ${isFavorite ? "from" : "to"} My Teams`}
          onClick={() => onFavorite(home.id)}
        >
          <Star aria-hidden="true" fill={isFavorite ? "currentColor" : "none"} />
        </button>
      </header>

      <a
        className="score-game-card__matchup"
        href={`/games/${game.id}`}
        aria-label={`${away.name} at ${home.name}, ${game.statusDetail}`}
      >
        <TeamRow team={away} score={game.awayScore} showScore={showScore} />
        <TeamRow team={home} score={game.homeScore} showScore={showScore} />
      </a>

      <footer className="score-game-card__footer">
        <span>
          <Tv aria-hidden="true" />
          <strong>{broadcastLabel(game)}</strong>
        </span>
        <span className="score-game-card__kickoff font-display">
          {showScore ? game.statusDetail : withPacific(kickoffTimeLabel(game))}
        </span>
      </footer>

      <details className="score-game-card__details">
        <summary>
          <span>Game details</span>
          <ChevronDown aria-hidden="true" />
        </summary>
        <div>
          <p>
            <MapPin aria-hidden="true" />
            <span>
              <strong>{game.venue}</strong>
              {game.city && <small>{game.city}</small>}
            </span>
          </p>
          <a href={`/stadiums/${game.venueSlug}`}>Open gameday guide</a>
          {broadcastNote && <small>{broadcastNote}</small>}
        </div>
      </details>
    </article>
  );
}
