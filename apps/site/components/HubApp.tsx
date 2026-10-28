"use client";

import { easternDate } from "@/lib/game-calendar";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, CircleOff } from "lucide-react";
import {
  broadcastAsOf,
  broadcastEventForGame,
  broadcastNote,
  coaches,
  fantasyNotes,
  fantasyNotesAsOf,
  fantasyNotesContext,
  games,
  getConferenceHub,
  getGame,
  getPreseasonRating,
  getStadiumBySlug,
  getTeam,
  getTeamBySlug,
  modelEstimatesAvailable,
  pollTables,
  conferenceStandings,
  pollsStatusNote,
  portalAsOf,
  portalCountsFor,
  portalEvents,
  portalStatusNote,
  providerHealth,
  radioAsOf,
  radioForTeam,
  searchPlayers,
  sosAsOf,
  stadiums,
  teams,
  tvRows,
  tvWeeks,
  verifiedRefresh,
  boardWeeks,
} from "@/lib/cfb-dataset";
import { brand, disclosureVersion } from "@/lib/config";
import { homepageData, tickerGamesFor } from "@/lib/homepage-data";
import type { BoardWeekSelection } from "@/lib/week-cutover";
import { WeekSwitch, clockWeek, useBoardWeekCutover } from "./broadcast/week-switch";
import { getRosterPlayerBySlug } from "@/lib/player-records";
import {
  continuousWeeks,
  defaultScoreboardWeek,
  gamesForWeek,
  scoreboardSourceLabel,
  scoreboardSwipeDirection,
} from "@/lib/scoreboard";
import { moduleCoverage, playoffUnavailable } from "@/lib/module-coverage";
import { getTeamHubData } from "@/lib/team-hub";
import type { Game, Provenance, Team } from "@/lib/types";
import { PlayerRecordPage } from "./player-record-page";
import { SiteSearchPage } from "./site-search-page";
import { SourceMeta } from "./SourceMeta";
import { StadiumDetail, StadiumDirectory } from "./stadium-pages";
import { NoNamesPage, HeismanPage, AIPanelPage, HighlightPage } from "./feature-dashboards";
import { UpsetWatchPage } from "./upset-watch-page";
import { GameDayCommandCenter } from "./gameday-command-center";
import { PlayoffAuditPage } from "./playoff-audit-page";
import { InjuryReportPage } from "./injury-report-page";
import { BroadcastFooter } from "./broadcast/footer";
import { BroadcastHeader } from "./broadcast/header";
import { BroadcastHomepage } from "./broadcast/homepage";
import { ScoreTicker } from "./broadcast/score-ticker";
import { WatchPage } from "./broadcast/watch-page";
import { CoachingLedger } from "./coaching-ledger";
import { FantasyNotesBoard } from "./fantasy-notes-board";
import { TeamHub } from "./team-hub/team-hub";
import { TransferPortalBoard } from "./transfer-portal-board";
import { FavoritesProvider, useFavoriteGesture } from "./polish/favorites";
import {
  GameActionSheet,
  GameActionsButton,
  useGameActionSheet,
} from "./polish/game-actions";
import { BoardSkeleton } from "./polish/skeletons";
import { MobileDataCard, MobileDataCardStack } from "./polish/mobile-data-card";
import GamedayPlannerCard from "./GamedayPlannerCard";

type Mode = "clean" | "analysis";
type ScoreFilter = "All" | "P4" | "G5" | "FCS" | "Top 25" | "Favorites";

const percent = (value: number) => `${Math.round(value * 100)}%`;
const signed = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(1)}`;

function teamFor(teamId: string) {
  return getTeam(teamId);
}

function ModeDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [jurisdiction, setJurisdiction] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
      <dialog
        ref={dialogRef}
        className="mode-dialog"
        aria-modal="true"
        aria-labelledby="mode-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
      >
        <span className="eyebrow">Optional experience</span>
        <h2 id="mode-dialog-title">Show Odds & DFS Mode?</h2>
        <p>
          Analysis mode adds model distributions and market context. It does not
          confirm legal eligibility, offer wagering, or guarantee an outcome.
        </p>
        <label className="check-row">
          <input
            type="checkbox"
            checked={ageConfirmed}
            onChange={(event) => setAgeConfirmed(event.target.checked)}
          />
          <span>I confirm I am at least 21 years old.</span>
        </label>
        <label>
          Coarse jurisdiction
          <select value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)}>
            <option value="">Choose a region</option>
            <option value="us-general">United States — general preview</option>
            <option value="outside-us">Outside the United States</option>
            <option value="unknown">Prefer not to say</option>
          </select>
        </label>
        <p className="fine-print">
          No exact birth date or precise location is collected. Operator actions remain disabled
          because no partners or jurisdiction matrix are configured.
        </p>
        <div className="dialog-actions">
          <button className="button button--ghost" type="button" onClick={onClose}>
            Stay in Clean Mode
          </button>
          <button
            className="button button--gold"
            type="button"
            disabled={!ageConfirmed || !jurisdiction}
            onClick={onConfirm}
          >
            Enable preview
          </button>
        </div>
      </dialog>
  );
}

function Monogram({ team, size = "md" }: { team: Team; size?: "sm" | "md" | "lg" }) {
  const favoriteGesture = useFavoriteGesture(team.id, team.shortName);
  return (
    <span
      className={`monogram monogram--${size}${team.logo ? " monogram--img" : ""}`}
      style={{ "--team-color": team.color } as React.CSSProperties}
      aria-hidden="true"
      {...favoriteGesture}
    >
      {team.logo ? (
        <img src={team.logo} alt="" loading="lazy" decoding="async" />
      ) : (
        team.monogram
      )}
    </span>
  );
}

function Freshness({ provenance }: { provenance: Provenance }) {
  const date = new Date(provenance.sourceAsOf).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return (
    <span className="freshness">
      <span aria-hidden="true" />
      Dataset · as of {date}
    </span>
  );
}

function GameCard({
  game,
  mode,
  favoriteIds,
  onFavorite,
}: {
  game: Game;
  mode: Mode;
  favoriteIds: Set<string>;
  onFavorite: (teamId: string) => void;
}) {
  const away = teamFor(game.awayTeamId);
  const home = teamFor(game.homeTeamId);
  const isFavorite = favoriteIds.has(away.id) || favoriteIds.has(home.id);
  const actions = useGameActionSheet();
  const gameLabel = `${away.shortName} at ${home.shortName}`;

  return (
    <>
      <article className="game-card" {...actions.longPressProps}>
        <div className="game-card__topline">
          <span className={`status status--${game.status}`}>{game.statusDetail}</span>
          <span>{game.kickoffLabel}</span>
          <button
            className="favorite-button"
            type="button"
            onClick={() => onFavorite(home.id)}
            aria-pressed={isFavorite}
            aria-label={`${isFavorite ? "Remove" : "Add"} ${home.shortName} as a favorite`}
          >
            {isFavorite ? "★" : "☆"}
          </button>
        </div>
        <a className="game-card__matchup" href={`/games/${game.id}`}>
          <div className="team-line">
            <Monogram team={away} />
            <span>
              <small>{away.rank ? `#${away.rank}` : away.conference}</small>
              <strong>{away.shortName}</strong>
              <em>{away.record}</em>
            </span>
            <b>{game.awayScore ?? "—"}</b>
          </div>
          <div className="team-line">
            <Monogram team={home} />
            <span>
              <small>{home.rank ? `#${home.rank}` : home.conference}</small>
              <strong>{home.shortName}</strong>
              <em>{home.record}</em>
            </span>
            <b>{game.homeScore ?? "—"}</b>
          </div>
        </a>
        <div className="game-card__meta">
          <span>{game.venue}</span>
          <span>
            {game.broadcast
              ? game.broadcast
              : game.weather
                ? `${game.weather.temperature}° · ${game.weather.summary}`
                : "Network not assigned"}
          </span>
        </div>
        <div className="game-card__actions">
          <a href={`/games/${game.id}`}>{game.status === "final" ? "Final details" : "Preview"}</a>
          <a href="/watch">Watch status</a>
          <a href={`/stadiums/${game.venueSlug}`}>Gameday guide</a>
          <GameActionsButton
            className="game-card__more"
            label={`More actions for ${gameLabel}`}
            onClick={() => actions.setOpen(true)}
          />
        </div>
        {mode === "analysis" && game.line ? (
          <div className="odds-strip">
            <span>MARKET</span>
            <strong>
              {home.abbreviation} {game.line.home}
            </strong>
            <small>Market context · no operator actions</small>
          </div>
        ) : null}
      </article>
      <GameActionSheet
        open={actions.open}
        onOpenChange={actions.setOpen}
        gameLabel={gameLabel}
        matchupHref={`/games/${game.id}`}
        guideHref={`/stadiums/${game.venueSlug}`}
      />
    </>
  );
}

function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="page-heading__actions">{actions}</div> : null}
    </header>
  );
}

function SectionHeading({
  eyebrow,
  title,
  href,
  linkLabel = "View all",
}: {
  eyebrow: string;
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="section-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {href ? (
        <a href={href}>
          {linkLabel} <span aria-hidden="true">→</span>
        </a>
      ) : null}
    </div>
  );
}

interface HomeProps {
  mode: Mode;
  favorites: Set<string>;
  onFavorite: (teamId: string) => void;
}

function ScoresPage({ mode, favorites, onFavorite, selection }: HomeProps & { selection?: BoardWeekSelection }) {
  const publishedWeeks = useMemo(
    () => [...new Set(games.map((game) => game.week))].sort((a, b) => a - b),
    [],
  );
  const weeks = useMemo(() => continuousWeeks(publishedWeeks), [publishedWeeks]);
  // The server clock picks the opening week; the rail still reaches every week.
  const initialWeek = selection?.week ?? defaultScoreboardWeek(games, broadcastAsOf);
  const [week, setWeek] = useState(initialWeek);
  useBoardWeekCutover(boardWeeks, selection, week === initialWeek);
  const [filter, setFilter] = useState<ScoreFilter>("All");
  const [isPending, startTransition] = useTransition();
  const weekRail = useRef<HTMLFieldSetElement>(null);
  const gesture = useRef({ active: false, x: 0, y: 0 });
  const weekGames = gamesForWeek(games, week);
  const sourceLabel = scoreboardSourceLabel(week, verifiedRefresh, boardWeeks);
  const filtered = weekGames.filter((game) => {
    const away = teamFor(game.awayTeamId);
    const home = teamFor(game.homeTeamId);
    if (filter === "All") return true;
    if (filter === "Top 25") return Boolean(away.rank || home.rank);
    if (filter === "Favorites") return favorites.has(away.id) || favorites.has(home.id);
    return away.subdivision === filter || home.subdivision === filter;
  });
  const weekIndex = weeks.indexOf(week);
  const previousWeek = weekIndex > 0 ? weeks[weekIndex - 1] : undefined;
  const nextWeek = weekIndex >= 0 && weekIndex < weeks.length - 1 ? weeks[weekIndex + 1] : undefined;

  const updateWeek = (value: number | undefined) => {
    if (value == null || value === week) return;
    startTransition(() => setWeek(value));
  };

  useEffect(() => {
    const active = weekRail.current?.querySelector<HTMLElement>(`[data-week="${week}"]`);
    active?.scrollIntoView({ behavior: "auto", block: "nearest", inline: "center" });
  }, [week]);

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (!event.isPrimary || event.pointerType === "mouse") return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("a, button, input, select, textarea, summary, fieldset")) return;
    gesture.current = { active: true, x: event.clientX, y: event.clientY };
  };

  const finishGesture = (event: React.PointerEvent<HTMLElement>) => {
    if (!gesture.current.active) return;
    const deltaX = event.clientX - gesture.current.x;
    const deltaY = event.clientY - gesture.current.y;
    gesture.current.active = false;
    const direction = scoreboardSwipeDirection(deltaX, deltaY);
    if (direction) updateWeek(direction === "next" ? nextWeek : previousWeek);
  };

  return (
    <>
      <PageHeading
        eyebrow="PRIORITY 01 · SCOREBOARD"
        title="The slate, without the scavenger hunt."
        description={`Scores and assigned TV networks from reviewed source snapshots. ${sourceLabel.detail}`}
        actions={<span className="freshness">{sourceLabel.badge}</span>}
      />
      {selection ? (
        <WeekSwitch weeks={boardWeeks} selected={week} current={clockWeek(boardWeeks, selection)} basePath="/scores" />
      ) : null}
      <div className="sticky-tools scoreboard-tools">
        <div className="scoreboard-week-tools">
          <fieldset className="date-switcher">
            <legend className="sr-only">Change scoreboard week</legend>
            <button
              type="button"
              disabled={previousWeek == null}
              onClick={() => updateWeek(previousWeek)}
              aria-label={previousWeek == null ? "Previous week unavailable" : `View week ${previousWeek}`}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <span>
              <small>2026 · WEEK {week}</small>
              <strong>{weekGames.length} games published</strong>
            </span>
            <button
              type="button"
              disabled={nextWeek == null}
              onClick={() => updateWeek(nextWeek)}
              aria-label={nextWeek == null ? "Next week unavailable" : `View week ${nextWeek}`}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </fieldset>
          <fieldset className="scoreboard-week-rail" ref={weekRail}>
            <legend className="sr-only">Select scoreboard week</legend>
            {weeks.map((item) => (
              <button
                type="button"
                key={item}
                data-week={item}
                aria-pressed={week === item}
                onClick={() => updateWeek(item)}
              >
                W{item}
              </button>
            ))}
          </fieldset>
        </div>
        <fieldset className="filter-chips">
          <legend className="sr-only">Score filters</legend>
          {(["All", "P4", "G5", "FCS", "Top 25", "Favorites"] as ScoreFilter[]).map((item) => (
            <button
              type="button"
              key={item}
              aria-pressed={filter === item}
              onClick={() => startTransition(() => setFilter(item))}
            >
              {item}
            </button>
          ))}
        </fieldset>
      </div>
      <section
        className="content-section scoreboard-touch-zone"
        aria-busy={isPending}
        onPointerDown={onPointerDown}
        onPointerUp={finishGesture}
        onPointerCancel={() => {
          gesture.current.active = false;
        }}
      >
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {`Week ${week}. ${filtered.length} games shown${filter === "All" ? "" : ` for ${filter}`}.`}
        </span>
        <div className="scoreboard-summary">
          <div><span>{weekGames.length}</span><small>WEEK {week} GAMES</small></div>
          <div><span>{weekGames.filter((game) => game.status === "final").length}</span><small>FINAL</small></div>
          <div><span>{weekGames.filter((game) => game.status === "scheduled").length}</span><small>SCHEDULED</small></div>
          <div><span>{teams.length}</span><small>PROGRAMS</small></div>
          <a href="/schedule">Full schedule →</a>
        </div>
        {isPending ? (
          <div role="status" aria-label="Updating scoreboard">
            <BoardSkeleton />
          </div>
        ) : filtered.length ? (
          <div className="game-grid game-grid--two scoreboard-results" key={`${week}-${filter}`}>
            {filtered.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                mode={mode}
                favoriteIds={favorites}
                onFavorite={onFavorite}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<CircleOff aria-hidden="true" />}
            title={weekGames.length ? "No games match this view." : `Week ${week} is not published yet.`}
            copy={weekGames.length ? "Choose another filter or add a team to My Teams from any game card." : "Move to another week or open the full season schedule."}
            href={weekGames.length ? "/teams" : "/schedule"}
            action={weekGames.length ? "Browse teams" : "Open full schedule"}
          />
        )}
      </section>
    </>
  );
}

function SchedulePage(props: HomeProps) {
  return (
    <>
      <PageHeading
        eyebrow="SEASON-AWARE SCHEDULE"
        title="2026 schedule"
        description="Conference membership and postseason rules are versioned by season; the preview never hardcodes a permanent team count."
      />
      <section className="content-section schedule-board">
        {games.map((game) => (
          <GameCard
            key={game.id}
            game={game}
            mode={props.mode}
            favoriteIds={props.favorites}
            onFavorite={props.onFavorite}
          />
        ))}
      </section>
    </>
  );
}

function GamePage({ gameId, mode, favorites, onFavorite }: HomeProps & { gameId: string }) {
  const game = getGame(gameId) ?? games[0];
  const away = teamFor(game.awayTeamId);
  const home = teamFor(game.homeTeamId);
  const gameday = broadcastEventForGame(game);
  const homeEdge = Math.round(game.modelHomeWinProbability * 100);
  const metrics = [
    ["Play value / drive", away.strength - 65, home.strength - 65],
    ["Successful play rate", 47, 51],
    ["Explosive play index", 61, 55],
    ["Disruption created", 58, 64],
    ["Returning production", away.returningProduction, home.returningProduction],
  ] as const;

  return (
    <>
      <div className="game-hero">
        <div className="game-hero__meta">
          <span className={`status status--${game.status}`}>{game.statusDetail}</span>
          {gameday ? (
            <span className="status status--gameday" title={gameday.note ?? undefined}>
              {gameday.badge}
            </span>
          ) : null}
          <Freshness provenance={game.provenance} />
          {game.status === "final" ? <span>Result verified {game.provenance.verifiedAt} · game date {easternDate(game.date)}</span> : null}
        </div>
        <div className="game-hero__matchup">
          <TeamHero team={away} score={game.awayScore} />
          <div className="game-hero__center">
            <h1 className="sr-only">
              {away.name} {game.neutralSite ? "vs" : "at"} {home.name} {game.status === "final" ? "final" : "game preview"}
            </h1>
            <span>{game.kickoffLabel}</span>
            <strong>{game.broadcast ?? "Broadcast provider not configured"}</strong>
            <small>{game.venue} · {game.city}</small>
          </div>
          <TeamHero team={home} score={game.homeScore} />
        </div>
        <div className="game-action-row">
          <a href="/watch">Watch status</a>
          <a href="/watch#radio">Audio status</a>
          {game.neutralSite ? <span>Neutral venue guide unavailable</span> : <a href={`/stadiums/${game.venueSlug}`}>Venue guide</a>}
          <a href="/playoff-bracket">Bracket</a>
          <button type="button" onClick={() => onFavorite(home.id)} aria-pressed={favorites.has(home.id)}>
            {favorites.has(home.id) ? "★ Favorited" : "☆ Favorite"}
          </button>
        </div>
      </div>

      <section className="content-section" style={{ paddingBottom: 0 }}>
        <GamedayPlannerCard
          game={{
            awayTeam: { name: away.name, abbreviation: away.abbreviation, color: away.color, logo: away.logo },
            homeTeam: { name: home.name, abbreviation: home.abbreviation, color: home.color, logo: home.logo },
            date: easternDate(game.date),
            kickoffLabel: game.kickoffLabel,
            broadcast: game.broadcast ? { network: game.broadcast, kickoffTime: game.kickoffLabel } : undefined,
            venue: game.venue,
            city: game.city || "",
            neutralSite: game.neutralSite,
            venueGuideHref: game.neutralSite ? undefined : `/stadiums/${game.venueSlug}`,
          }}
          weather={game.weather ? { temperature: game.weather.temperature, summary: game.weather.summary, windMph: game.weather.windMph } : null}
          radio={(() => {
            const station = radioForTeam(game.homeTeamId);
            return station?.station ? { station: station.station, frequency: station.frequency ?? "", market: station.market ?? "" } : null;
          })()}
          parking={(() => {
            if (game.neutralSite) return null;
            const stadium = getStadiumBySlug(game.venueSlug);
            return stadium ? { summary: stadium.parking.slice(0, 200), lastVerified: stadium.lastVerified } : null;
          })()}
          ticketUrl={null}
        />
        <p className="panel-note">Radio listings and venue guides retain independent source dates. A station listing does not verify carriage of this game. Neutral venue parking and travel guidance are unavailable unless individually sourced.</p>
      </section>

      <section className="content-section game-layout">
        <div className="game-main">
          {modelEstimatesAvailable ? (
            <>
              <SectionHeading eyebrow="MODEL SNAPSHOT" title="Why the model leans this way" />
              <article className="win-model-card">
                <div>
                  <span className="eyebrow">HOME WIN ESTIMATE</span>
                  <strong>{homeEdge}%</strong>
                  <small>±{percent(game.modelUncertainty)} uncertainty</small>
                </div>
                <div className="win-model-card__track" aria-hidden="true">
                  <span style={{ width: `${homeEdge}%` }} />
                </div>
                <p>
                  {home.shortName} carries the stronger strength rating and a modest
                  home-context edge. Weather and unverified availability are excluded rather than
                  invented.
                </p>
              </article>
            </>
          ) : (
            <p className="panel-note">
              No matchup model yet this season — win probabilities resume once in-season results
              accumulate. Game facts and supporting guides retain their individual source dates.
            </p>
          )}

          {modelEstimatesAvailable && (
            <article className="metric-card">
              <div className="metric-card__header">
                <div><Monogram team={away} size="sm" /><strong>{away.abbreviation}</strong></div>
                <span>Original efficiency metrics</span>
                <div><strong>{home.abbreviation}</strong><Monogram team={home} size="sm" /></div>
              </div>
              <div className="metric-list">
                {metrics.map(([label, awayValue, homeValue]) => (
                  <div className="metric-row" key={label}>
                    <b>{awayValue}</b>
                    <div>
                      <span>{label}</span>
                      <div className="split-bar" role="img" aria-label={`${label}: ${away.shortName} ${awayValue}; ${home.shortName} ${homeValue}`}>
                        <i style={{ width: `${awayValue}%` }} />
                        <em style={{ width: `${homeValue}%` }} />
                      </div>
                    </div>
                    <b>{homeValue}</b>
                  </div>
                ))}
              </div>
            </article>
          )}

          {modelEstimatesAvailable && (
            <article className="mismatch-card">
              <div>
                <span className="eyebrow">POSITIONAL MATCHUPS</span>
                <h2>Where Saturday tilts</h2>
                <p>Color intensity is paired with labels and a text summary for accessibility.</p>
              </div>
              <div className="mismatch-grid" role="img" aria-label={`${home.shortName} has advantages in pass protection and secondary; ${away.shortName} has an advantage at receiver`}>
                {[
                  ["QB", 2], ["RB", -1], ["WR", -3], ["OL", 4], ["DL", 1], ["LB", 0], ["DB", 3], ["ST", -1],
                ].map(([label, edge]) => (
                  <div className={`edge edge--${Number(edge) > 1 ? "home" : Number(edge) < -1 ? "away" : "even"}`} key={label}>
                    <span>{label}</span>
                    <strong>{Number(edge) > 0 ? `+${edge} ${home.abbreviation}` : Number(edge) < 0 ? `${Math.abs(Number(edge))} ${away.abbreviation}` : "Even"}</strong>
                  </div>
                ))}
              </div>
            </article>
          )}
        </div>
        <aside className="game-sidebar">
          <article className="sidebar-card">
            <span className="eyebrow">GAMEDAY</span>
            <h2>{game.weather ? `${game.weather.temperature}° · ${game.weather.summary}` : "Weather unavailable"}</h2>
            <p>{game.weather ? `Wind ${game.weather.windMph} mph. Weather is not part of this dataset release.` : "A live weather provider is not configured."}</p>
            {game.neutralSite ? <p>Neutral venue parking, bags and transit guidance unavailable.</p> : <a href={`/stadiums/${game.venueSlug}`}>Parking, bags & transit →</a>}
          </article>
          {mode === "analysis" && game.line ? (
            <article className="sidebar-card sidebar-card--gold">
              <span className="eyebrow">MARKET CONTEXT</span>
              <h2>{home.abbreviation} {game.line.home}</h2>
              <p>No licensed odds provider or operator action is configured.</p>
              <div className="sparkline" role="img" aria-label={`Line movement from ${game.line.movement[0]} to ${game.line.movement.at(-1)}`}>
                {game.line.movement.map((point, index) => (
                  <span key={`${point}-${index}`} style={{ height: `${32 + Math.abs(point) * 10}%` }} />
                ))}
              </div>
            </article>
          ) : null}
          <article className="sidebar-card">
            <SourceMeta provenance={game.provenance} />
            <a href={`/corrections?record=${game.id}`}>Report a data issue →</a>
          </article>
        </aside>
      </section>
    </>
  );
}

function TeamHero({ team, score }: { team: Team; score?: number }) {
  return (
    <div className="team-hero">
      <Monogram team={team} size="lg" />
      <span>
        <small>{team.rank ? `#${team.rank}` : team.conference}</small>
        <strong>{team.name}</strong>
        <em>{team.record}</em>
      </span>
      {score !== undefined ? <b>{score}</b> : null}
    </div>
  );
}

function PlayoffPage() {
  return <><PageHeading eyebrow="PLAYOFF MODEL · UNAVAILABLE" title="Current playoff projections are withheld." description={playoffUnavailable} /><section className="content-section"><a href="https://collegefootballplayoff.com/sports/2026/8/9/bracket-place-holder">Official 2026 CFP qualification and seeding rules</a></section></>;
}

function TeamsPage({ teamSlug }: { teamSlug?: string }) {
  const team = teamSlug ? getTeamBySlug(teamSlug) : undefined;
  if (team) return <TeamDetail team={team} />;

  return (
    <>
      <PageHeading
        eyebrow="SEASON-AWARE MEMBERSHIP"
        title="All 138 FBS programs for 2026."
        description="Conference affiliation, AP rank, record, and a strength index derived from published SOS ratings."
      />
      <section className="team-directory content-section">
        {teams.map((item) => (
          <a href={`/teams/${item.slug}`} key={item.id}>
            <Monogram team={item} />
            <span><small>{item.conference} · {item.subdivision}</small><strong>{item.name}</strong><em>{item.record}</em></span>
            <b>{item.strength}</b>
          </a>
        ))}
      </section>
    </>
  );
}

function TeamDetail({ team }: { team: Team }) {
  return <TeamHub {...getTeamHubData(team)} />;
}

function RankingsPage() {
  const [pollId, setPollId] = useState("ap");
  const [isPending, startTransition] = useTransition();
  const table = pollTables.find((poll) => poll.poll === pollId) ?? pollTables[0];
  const ratingsRows = [...teams]
    .map((team) => ({ team, rating: getPreseasonRating(team.slug) }))
    .filter((row) => row.rating?.sp)
    .sort((a, b) => (a.rating?.sp?.rank ?? 999) - (b.rating?.sp?.rank ?? 999));
  const ratingsAsOf = ratingsRows[0]?.rating?.as_of;
  if (pollId === "ratings") {
    return (
      <>
        <PageHeading
          eyebrow="2026 RATINGS"
          title="SP+ and FPI, as published."
          description={`Bill Connelly's latest SP+ (after Week 4) and ESPN's FPI, plus playoff odds exactly as each outlet reported them${ratingsAsOf ? ` · compiled through ${ratingsAsOf}` : ""}. Blank means the number was not published.`}
        />
        <div className="sticky-tools">
          <fieldset className="filter-chips">
            <legend className="sr-only">Board</legend>
            {pollTables.map((poll) => (
              <button type="button" key={poll.poll} aria-pressed={poll.poll === pollId} onClick={() => startTransition(() => setPollId(poll.poll))}>
                {poll.poll === "ap" ? "AP Top 25" : "Coaches Poll"}
              </button>
            ))}
            <button type="button" aria-pressed={true} onClick={() => startTransition(() => setPollId("ratings"))}>SP+ / FPI board</button>
          </fieldset>
        </div>
        <section className="content-section">
          <div className="scoreboard-summary">
            <div><span>{ratingsRows.length}</span><small>RATED (SP+)</small></div>
            <div><span>{ratingsRows.filter((r) => r.rating?.fpi).length}</span><small>WITH FPI</small></div>
            <div><span>{ratingsRows.filter((r) => r.rating?.wins?.line != null).length}</span><small>WIN TOTALS PUBLISHED</small></div>
          </div>
          {isPending ? (
            <BoardSkeleton rows={3} />
          ) : (
            <>
              <section className="data-table-wrap mobile-data-table-desktop" tabIndex={0} aria-label="Preseason ratings board">
                <table className="data-table">
              <thead>
                <tr>
                  <th>SP+</th><th>Team</th><th>SP+ rating</th><th>Off.</th><th>Def.</th><th>FPI</th><th>Win total</th><th>Proj. wins</th><th>Playoff odds*</th>
                </tr>
              </thead>
              <tbody>
                {ratingsRows.map(({ team, rating }) => (
                  <tr key={team.id}>
                    <td><b>{rating?.sp?.rank}</b></td>
                    <td><a href={`/teams/${team.slug}`}>{team.shortName}</a><small> {team.conference}</small></td>
                    <td>{rating?.sp ? signed(rating.sp.overall) : "—"}</td>
                    <td>{rating?.sp?.offense != null ? signed(rating.sp.offense - 20) : "—"}</td>
                    <td>{rating?.sp?.defense != null ? signed(20 - rating.sp.defense) : "—"}</td>
                    <td>{rating?.fpi ? `#${rating.fpi.rank}` : "—"}</td>
                    <td>{rating?.wins?.line != null ? rating.wins.line.toFixed(1) : "—"}</td>
                    <td>{rating?.wins?.projected != null ? rating.wins.projected.toFixed(1) : "—"}</td>
                    <td>{rating?.playoff?.value ?? "—"}{rating?.playoff ? <small> {rating.playoff.outlet}</small> : null}</td>
                  </tr>
                ))}
              </tbody>
                </table>
              </section>
              <MobileDataCardStack label="Preseason ratings">
                {ratingsRows.map(({ team, rating }) => (
                  <MobileDataCard
                    key={`mobile-rating-${team.id}`}
                    title={team.shortName}
                    subtitle={team.conference}
                    summary={[
                      { label: "SP+ rank", value: rating?.sp ? `#${rating.sp.rank}` : "—" },
                      { label: "SP+ rating", value: rating?.sp ? signed(rating.sp.overall) : "—" },
                      { label: "FPI", value: rating?.fpi ? `#${rating.fpi.rank}` : "—" },
                    ]}
                    details={[
                      { label: "Offense", value: rating?.sp?.offense != null ? signed(rating.sp.offense - 20) : "—" },
                      { label: "Defense", value: rating?.sp?.defense != null ? signed(20 - rating.sp.defense) : "—" },
                      { label: "Win total", value: rating?.wins?.line != null ? rating.wins.line.toFixed(1) : "—" },
                      { label: "Projected wins", value: rating?.wins?.projected != null ? rating.wins.projected.toFixed(1) : "—" },
                      { label: "Playoff odds", value: rating?.playoff ? `${rating.playoff.value} · ${rating.playoff.outlet}` : "—" },
                    ]}
                    action={<a href={`/teams/${team.slug}`}>Open team ratings <ChevronRight aria-hidden="true" /></a>}
                  />
                ))}
              </MobileDataCardStack>
            </>
          )}
          <p className="table-caption">*Playoff odds are the outlet's reported number (ESPN FPI simulations or The Athletic model), not this site's simulation. SP+ offense/defense columns are adjusted for readability; raw figures sit on each team page.</p>
        </section>
      </>
    );
  }
  if (!table) {
    return (
      <PageHeading
        eyebrow="RANKINGS"
        title="Polls not published."
        description="No poll tables are present in this dataset release."
      />
    );
  }
  return (
    <>
      <PageHeading
        // Truthful to the dataset: August releases are preseason ballots;
        // anything later is the in-season poll. The eyebrow previously
        // hardcoded PRESEASON and went stale the first week of the season.
        eyebrow={
          table.release_date && table.release_date >= "2026-09"
            ? "2026 SEASON RANKINGS"
            : "2026 PRESEASON RANKINGS"
        }
        title="AP and Coaches, straight from the release."
        description={`${table.name}${table.release_date ? ` · released ${table.release_date}` : ""}. AP and Coaches rows cite the release directly; the CFB Apex Composite averages the two polls.`}
      />
      <div className="sticky-tools">
        <fieldset className="filter-chips">
          <legend className="sr-only">Poll</legend>
          {pollTables.map((poll) => (
            <button type="button" key={poll.poll} aria-pressed={poll.poll === pollId} onClick={() => startTransition(() => setPollId(poll.poll))}>
              {poll.name}
            </button>
          ))}
          <button type="button" aria-pressed={pollId === "ratings"} onClick={() => startTransition(() => setPollId("ratings"))}>SP+ / FPI board</button>
        </fieldset>
      </div>
      <section className="content-section">
        <div className="scoreboard-summary">
          <div><span>{table.rankings.length}</span><small>RANKED</small></div>
          <div><span>{table.rankings[0]?.first_place_votes ?? "—"}</span><small>FIRST-PLACE VOTES (NO. 1)</small></div>
          {table.poll === "composite" ? (
            <div><span>{new Set(table.rankings.map((row) => row.team_slug)).size}</span><small>TEAMS ACROSS BOTH POLLS</small></div>
          ) : (
            <div><span>{table.others.length}</span><small>OTHERS RECEIVING VOTES</small></div>
          )}
        </div>
        {isPending ? (
          <BoardSkeleton rows={3} />
        ) : (
          <>
            <section className="data-table-wrap mobile-data-table-desktop" tabIndex={0} aria-label={`${table.name} top 25 table`}>
              <table className="data-table">
            <thead>
              <tr>
                <th>Rank</th><th>Team</th><th>Record</th><th>Points</th><th>First votes</th><th>Prev.</th>
              </tr>
            </thead>
            <tbody>
              {table.rankings.map((entry) => {
                const team = entry.team_slug ? getTeamBySlug(entry.team_slug) : undefined;
                const movement =
                  entry.previous_rank == null ? null : entry.rank - entry.previous_rank;
                return (
                  <tr key={`${entry.rank}-${entry.team_slug}`}>
                    <td><b>{entry.rank}</b>{entry.tied ? <small> T</small> : null}</td>
                    <td>
                      <a href={team ? `/teams/${team.slug}` : "/rankings"}>{team ? team.name : entry.team}</a>
                      <small> {team?.conference ?? ""}</small>
                    </td>
                    <td>{entry.record ?? "—"}</td>
                    <td>{entry.points?.toLocaleString() ?? "—"}</td>
                    <td>{entry.first_place_votes ?? "—"}</td>
                    <td>
                      {movement == null
                        ? <span className="poll-badge poll-badge--new">NEW</span>
                        : movement === 0
                          ? "—"
                          : movement < 0
                            ? `▲ ${-movement}`
                            : `▼ ${movement}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
              </table>
            </section>
            <MobileDataCardStack label={`${table.name} rankings`}>
              {table.rankings.map((entry) => {
                const team = entry.team_slug ? getTeamBySlug(entry.team_slug) : undefined;
                const movement = entry.previous_rank == null ? null : entry.rank - entry.previous_rank;
                const movementLabel = movement == null
                  ? "New to the poll"
                  : movement === 0
                    ? "No change"
                    : movement < 0
                      ? `Up ${-movement}`
                      : `Down ${movement}`;
                return (
                  <MobileDataCard
                    key={`mobile-poll-${entry.rank}-${entry.team_slug}`}
                    title={team?.name ?? entry.team}
                    subtitle={team?.conference ?? table.name}
                    summary={[
                      { label: "Rank", value: `${entry.tied ? "T" : ""}${entry.rank}` },
                      { label: "Record", value: entry.record ?? "—" },
                      { label: "Points", value: entry.points?.toLocaleString() ?? "—" },
                    ]}
                    details={[
                      { label: "First-place votes", value: entry.first_place_votes ?? "—" },
                      { label: "Previous rank", value: entry.previous_rank ?? "—" },
                      { label: "Movement", value: movementLabel },
                      { label: "Poll", value: table.name },
                    ]}
                    action={<a href={team ? `/teams/${team.slug}` : "/rankings"}>Open team context <ChevronRight aria-hidden="true" /></a>}
                  />
                );
              })}
            </MobileDataCardStack>
          </>
        )}
        {table.others.length ? (
          <>
            <SectionHeading eyebrow="OTHERS RECEIVING VOTES" title="Just outside the Top 25" />
            <div className="portal-list">
              {table.others.map((entry) => (
                <a className="portal-row" href={entry.team_slug ? `/teams/${entry.team_slug}` : "/rankings"} key={entry.team}>
                  <span className="status status--scheduled">RV</span>
                  <span><strong>{entry.team}</strong></span>
                  <b>{entry.points?.toLocaleString() ?? "—"} pts</b>
                </a>
              ))}
            </div>
          </>
        ) : null}
        {pollId === "ap" && verifiedRefresh?.poll_notes ? (
          <section aria-labelledby="poll-notes-title" className="poll-notes">
            <SectionHeading eyebrow={`WEEK MOVEMENT · AP, ${verifiedRefresh.poll_notes.as_of}`} title="Who moved, who split, who fell out" />
            <div className="poll-notes-grid">
              <article>
                <h3>Biggest movers</h3>
                <ul>
                  {verifiedRefresh.poll_notes.movers_ap.slice(0, 5).map((row) => (
                    <li key={row.team_slug}>
                      <a href={`/teams/${row.team_slug}`}>{row.team}</a> {row.from} → {row.to}{" "}
                      <b className={row.move < 0 ? "poll-move poll-move--up" : "poll-move"}>{row.move < 0 ? `▲ ${-row.move}` : `▼ ${row.move}`}</b>
                    </li>
                  ))}
                </ul>
              </article>
              <article>
                <h3>AP vs. Coaches gaps</h3>
                <ul>
                  {[
                    ...verifiedRefresh.poll_notes.poll_gaps.ap_only.map((g) => ({ team: g.team, slug: g.team_slug, left: `AP No. ${g.ap}`, right: `Coaches RV${g.coaches_points != null ? ` (${g.coaches_points} pts)` : ""}` })),
                    ...verifiedRefresh.poll_notes.poll_gaps.coaches_only.map((g) => ({ team: g.team, slug: g.team_slug, left: `Coaches No. ${g.coaches}`, right: `AP RV${g.ap_points != null ? ` (${g.ap_points} pts)` : ""}` })),
                  ].map((row) => (
                    <li key={row.slug}>
                      <a href={`/teams/${row.slug}`}>{row.team}</a> — {row.left} · {row.right}
                    </li>
                  ))}
                </ul>
              </article>
              <article>
                <h3>In and out</h3>
                <ul>
                  {verifiedRefresh.poll_notes.debuts_ap.map((row) => (
                    <li key={`in-${row.team_slug}`}><a href={`/teams/${row.team_slug}`}>{row.team}</a> <span className="poll-badge poll-badge--new">NEW</span> at No. {row.rank}</li>
                  ))}
                  {verifiedRefresh.poll_notes.dropped_out.ap.map((row) => (
                    <li key={`out-ap-${row.team_slug}`}><a href={`/teams/${row.team_slug}`}>{row.team}</a> dropped out{row.others_points != null ? ` (${row.others_points} RV pts)` : ""}</li>
                  ))}
                  {verifiedRefresh.poll_notes.dropped_out.coaches.map((row) => (
                    <li key={`out-co-${row.team_slug}`}><a href={`/teams/${row.team_slug}`}>{row.team}</a> dropped from the Coaches Poll</li>
                  ))}
                </ul>
              </article>
            </div>
          </section>
        ) : null}
        {pollsStatusNote ? <p className="panel-note">{pollsStatusNote}</p> : null}
      </section>
      <section className="content-section">
      {conferenceStandings.length ? (
        <section className="content-section">
          <SectionHeading eyebrow="CONFERENCE RACES" title="Who leads every league" />
          <p className="panel-note">
            Conference records from ESPN{verifiedRefresh?.retainedBaseline?.as_of ? `, as of ${verifiedRefresh.retainedBaseline.as_of}` : ""} — the overall record sits beside each league mark. Ordered by conference win percentage; equal percentages remain tied here. Championship tiebreak procedures are not applied. Rows link to team hubs.
          </p>
          <div className="conf-race-grid">
            {conferenceStandings.map((conf) => (
              <div className="conf-race-card" key={conf.slug}>
                <h3>
                  <a href={`/conferences/${conf.slug}`}>{conf.name}</a>
                </h3>
                <table className="data-table conf-race-table">
                  <thead>
                    <tr><th>Team</th><th>W</th><th>L</th><th>T</th><th>PCT</th><th>Ovr</th></tr>
                  </thead>
                  <tbody>
                    {conf.rows.map((row, i) => (
                      <tr className={i === 0 ? "conf-race-leader" : undefined} key={row.team_slug ?? row.team}>
                        <td>
                          {row.team_slug ? <a href={`/teams/${row.team_slug}`}>{row.team}</a> : row.team}
                        </td>
                        <td>{row.w}</td><td>{row.l}</td><td>{row.t}</td><td>{row.pct}</td><td>{row.overall ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      ) : null}
        <SectionHeading eyebrow="STRENGTH OF SCHEDULE" title="Published SOS ratings" />
        <p className="panel-note">
          Composite strength index derived from Phil Steele and ESPN FPI SOS ratings{sosAsOf ? `, as published ${sosAsOf}` : ""} — not SP+, FPI, or a committee ranking, and not refreshed weekly.
        </p>
        <div className="rankings-list">
          {[...teams].sort((a, b) => b.strength - a.strength).slice(0, 25).map((team, index) => (
            <a href={`/teams/${team.slug}`} key={team.id}>
              <b>{index + 1}</b><Monogram team={team} size="sm" />
              <span><strong>{team.name}</strong><small>{team.conference} · {team.record}</small></span>
              <div className="rank-bar"><span style={{ width: `${team.strength}%` }} /></div>
              <em>{team.strength}</em>
            </a>
          ))}
        </div>
      </section>
    </>
  );
}

function NewsletterPage() {
  const [state, setState] = useState<"form" | "pending" | "confirmed" | "unsubscribed">("form");
  const [email, setEmail] = useState("");
  if (state === "unsubscribed") return <SimpleStatus title="You are unsubscribed in the development mail sink." copy="No live message was sent and no production email provider is connected." action={() => setState("form")} actionLabel="Start again" />;
  return (
    <>
      <PageHeading eyebrow="DEVELOPMENT MAIL SINK" title="The Saturday Brief, on your terms." description="A complete double-opt-in and preference flow with no live campaign delivery." />
      <section className="newsletter-page content-section">
        <form onSubmit={(event) => { event.preventDefault(); if (email) setState("pending"); }}>
          <label>Email address<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="fan@example.com" /></label>
          <fieldset><legend>Choose preferences</legend>
            {["Weekly scoreboard", "Portal alerts", "Playoff scenarios", "Coaching carousel", "Stadium & gameday"].map((item) => <label className="check-row" key={item}><input type="checkbox" defaultChecked={item === "Weekly scoreboard"} /><span>{item}</span></label>)}
          </fieldset>
          <label className="check-row"><input type="checkbox" required /><span>I agree to receive the selected development-mode emails. Unsubscribe is always available.</span></label>
          <button className="button button--gold" type="submit">Request confirmation</button>
        </form>
        <aside>
          <span className="eyebrow">DELIVERY STATE</span>
          {state === "pending" ? (
            <>
              <h2>Confirmation captured locally.</h2>
              <p>The development mail sink would send a confirmation link. No live provider is configured.</p>
              <button className="button button--light" type="button" onClick={() => setState("confirmed")}>Simulate confirmation</button>
            </>
          ) : state === "confirmed" ? (
            <>
              <h2>Preferences confirmed.</h2>
              <p>Your subscription is active only in this browser session.</p>
              <button className="button button--ghost" type="button" onClick={() => setState("unsubscribed")}>Unsubscribe</button>
            </>
          ) : (
            <>
              <h2>No production address stored.</h2>
              <p>Double opt-in, unsubscribe, preference segmentation, and suppression behavior are documented before provider activation.</p>
            </>
          )}
        </aside>
      </section>
    </>
  );
}

function CorrectionsPage() {
  const [submitted, setSubmitted] = useState(false);
  if (submitted) return <SimpleStatus title="Correction received." copy="Case CORR-2026-104 was created locally. No personal information was transmitted." action={() => setSubmitted(false)} actionLabel="Report another issue" />;
  return (
    <>
      <PageHeading eyebrow="TRUST WORKFLOW" title="See something wrong? Put it on the record." description="Corrections append a new version; they never silently rewrite historical predictions or source lineage." />
      <form className="correction-form content-section" onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }}>
        <label>Page or record ID<input name="record" defaultValue="Current page" maxLength={120} /></label>
        <label>Issue category<select><option>Score or schedule</option><option>Roster or transfer</option><option>Contract or coach</option><option>Stadium guide</option><option>Source or rights</option><option>Other</option></select></label>
        <label>What should we review?<textarea required minLength={20} maxLength={1200} placeholder="Describe the discrepancy and include a public source when possible." /></label>
        <label>Public source URL (optional)<input type="url" placeholder="https://..." /></label>
        <p>No sensitive medical details, private forum content, or paywalled material. High-risk identity, privacy, and rights issues are quarantined first. Data and site issues can also be reported to <a href="mailto:admin@cfbapex.com">admin@cfbapex.com</a>.</p>
        <button className="button button--gold" type="submit">Submit correction</button>
      </form>
    </>
  );
}

function MethodologyPage() {
  const cards = [
    ["Matchup concept", "A future production model would combine play value, pace, continuity, context, and uncertainty; no such trained model or validation artifact ships here."],
    ["Portal concept", "The 2026 portal ledger lists verified FBS-to-FBS transfers with dates, positions, and source confidence. Destinations are never inferred, impact scores are not modeled, and NIL estimates are excluded."],
    ["Playoff simulation", "Current public projections are withheld. The retained demonstration does not implement the full 2026 qualification rules or a calibrated season model; sampling precision cannot establish predictive accuracy."],
    ["Coaching concept", "Contract terms come from the 2026 head-coach contract compilation (dual-sourced where possible; private-school gaps stay null). Hot-seat context is not published and is never treated as a firing probability; buyout math runs only on user-supplied guarantee inputs."],
    ["DFS concept", "Floor, median, ceiling, volume, and availability projections would power the gated interface; none ship in this release. No trained projection model or backtest ships in this preview."],
  ];
  return (
    <>
      <PageHeading eyebrow="MODEL GOVERNANCE" title="Understand the number before you trust it." description="Every consequential estimate carries a model version, as-of time, source state, confidence, and accessible explanation." />
      <section className="method-grid content-section">
        {cards.map(([title, copy], index) => <article id={index === 1 ? "portal" : index === 3 ? "coaching" : undefined} key={title}><span>0{index + 1}</span><h2>{title}</h2><p>{copy}</p><a href="/data-sources">Inspect source policy →</a></article>)}
      </section>
    </>
  );
}

function DesignSystemPage() {
  const tokens = [
    ["Night", "#07100D", "Primary field"],
    ["Press Box", "#10201A", "Raised surface"],
    ["Signal", "#F4C95D", "Primary action"],
    ["Field", "#9FD356", "Positive state"],
    ["Chalk", "#F1F5EC", "Primary text"],
    ["Fog", "#9BA9A1", "Secondary text"],
  ];
  return (
    <>
      <PageHeading
        eyebrow="LIVING PRODUCT LANGUAGE"
        title="Night Game Ledger"
        description="A compact system for dense Saturday information: high contrast, visible state, restrained motion, and utility before decoration."
      />
      <section className="design-system content-section">
        <article>
          <span className="eyebrow">COLOR TOKENS</span>
          <h2>One dark field, a disciplined signal palette.</h2>
          <div className="token-grid">
            {tokens.map(([name, value, use]) => (
              <div key={name}>
                <span className="token-swatch" style={{ background: value }} aria-hidden="true" />
                <strong>{name}</strong><code>{value}</code><small>{use}</small>
              </div>
            ))}
          </div>
        </article>
        <article>
          <span className="eyebrow">INTERACTION STATES</span>
          <h2>Actions say what will happen.</h2>
          <div className="component-row">
            <button className="button button--gold" type="button">Primary action</button>
            <a className="button button--ghost" href="/methodology">Secondary link</a>
            <button className="button button--ghost" type="button" disabled>Unavailable</button>
          </div>
          <p className="design-note">Keyboard focus is always visible. Disabled controls remain legible and pair with an explanation in product flows.</p>
        </article>
        <article>
          <span className="eyebrow">STATUS & PROVENANCE</span>
          <h2>State belongs next to the claim.</h2>
          <div className="component-row">
            <span className="provider-state provider-state--on">verified</span>
            <span className="provider-state provider-state--off">not configured</span>
            <span className="status status--live">demo state</span>
          </div>
          <p className="design-note">Dataset, modeled, verified, estimated, stale, and unavailable states never share the same visual treatment.</p>
        </article>
        <article>
          <span className="eyebrow">TYPE & SPACING</span>
          <h2 className="design-display">A scoreboard voice with editorial restraint.</h2>
          <p className="design-note">Display headlines compress; body copy breathes. The spacing scale is 4, 8, 12, 16, 24, 32, 48, and 72 pixels.</p>
        </article>
      </section>
    </>
  );
}

function DataSourcesPage() {
  return (
    <>
      <PageHeading eyebrow="PROVENANCE & PROVIDER HEALTH" title="No source, no silent claim." description="Production providers fail closed. The site never swaps data invisibly after an outage." />
      {verifiedRefresh ? (
        <section className="content-section" aria-labelledby="snapshot-manifest-title">
          <SectionHeading
            eyebrow={`VERIFIED SNAPSHOT · WEEK ${verifiedRefresh.week}`}
            title="What shipped, from where"
          />
          <p className="panel-note">
            Snapshot retrieved {verifiedRefresh.retrieved_at.replace("T", " ").replace(/\.\d+Z$/, " UTC")}
            {verifiedRefresh.audit_applied_at ? `, audit corrections applied ${verifiedRefresh.audit_applied_at.replace("T", " ").replace(/\.\d+Z$/, " UTC")}` : ""}.
            {verifiedRefresh.results_verified_at ? ` Results rechecked ${verifiedRefresh.results_verified_at}.` : ""}
            {verifiedRefresh.schedule_verified_at ? ` Schedule rechecked ${verifiedRefresh.schedule_verified_at}.` : ""}
            {verifiedRefresh.scheduledGames?.length ?? 0} scheduled FBS-vs-FBS games and{" "}
            {verifiedRefresh.playedGames?.length ?? 0} played results are on the board.
          </p>
          {boardWeeks.length > 1 ? (
            <ul className="panel-note">
              {boardWeeks.map((entry) => (
                <li key={entry.week}>
                  Week {entry.week} ({entry.label}): {entry.retrieved_at ? `retrieved ${entry.retrieved_at}` : "retrieval time not published"}
                  {entry.schedule_verified_at ? `; schedule checked ${entry.schedule_verified_at}` : ""}
                  {entry.results_verified_at ? `; finals verified ${entry.results_verified_at}` : ""}
                  {entry.records_verified_at ? `; records checked ${entry.records_verified_at}` : ""}.
                  {entry.note ? ` ${entry.note}` : ""} Becomes the default board {entry.cutover_utc.replace("T", " ").replace(/:00(?:\.0+)?Z$/, " UTC")}.
                </li>
              ))}
            </ul>
          ) : null}
          <div className="portal-list">
            {(verifiedRefresh.source_urls ?? []).map((url) => (
              <a className="portal-row" href={url} key={url}>
                <span className="status status--scheduled">SRC</span>
                <span><strong>{url.replace("https://", "").split("?")[0]}</strong></span>
              </a>
            ))}
          </div>
          {(verifiedRefresh.excludedGames ?? []).length ? (
            <>
              <h3>Excluded from the board, with evidence</h3>
              <ul className="manifest-holds">
                {(verifiedRefresh.excludedGames ?? []).map((row) => (
                  <li key={row.provider_id}>
                    <strong>{row.name}</strong> ({row.date}) — {row.reason}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {(verifiedRefresh.holds ?? []).length ? (
            <>
              <h3>Open holds</h3>
              <ul className="manifest-holds">
                {(verifiedRefresh.holds ?? []).map((hold) => (
                  <li key={hold}>{hold}</li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}
      <section className="content-section provider-table">
        {providerHealth.map((provider) => (
          <article key={provider.id}>
            <span className={`provider-state provider-state--${provider.status === "operational" ? "on" : "off"}`}>{provider.status.replaceAll("_", " ")}</span>
            <div><h2>{provider.label}</h2><p>{provider.note}</p></div>
            <div><span>Mode</span><strong>{provider.mode}</strong></div>
            <div><span>Cadence</span><strong>{provider.cadence}</strong></div>
          </article>
        ))}
      </section>
    </>
  );
}

function PolicyPage({ kind }: { kind: string }) {
  const content: Record<string, { eyebrow: string; title: string; intro: string; sections: [string, React.ReactNode][] }> = {
    about: {
      eyebrow: "INDEPENDENCE STATEMENT",
      title: "Built for the Saturday task, not the scroll.",
      intro: `${brand.name} is a conference-neutral product concept for transparent utility, accessible models, and maintained gameday information.`,
      sections: [["What we value", "Speed, source visibility, corrections, calm monetization, and understandable uncertainty."], ["What we do not do", "No paywall bypasses, fabricated live states, unlicensed marks, guaranteed picks, autoplay, or commercial ranking disguised as editorial judgment."], ["Contact", <>General: <a href="mailto:hello@cfbapex.com">hello@cfbapex.com</a> · Social and community: <a href="mailto:socials@cfbapex.com">socials@cfbapex.com</a>.</>]],
    },
    privacy: {
      eyebrow: "DRAFT FOR COUNSEL",
      title: "Privacy notice — preview draft",
      intro: "This site stores only device-local mode and favorite preferences. No production analytics, email, advertising, or precise location provider is active.",
      sections: [["Data minimization", "Future services may process account identity, newsletter email, coarse consent attestation, and short-lived abuse logs only for stated purposes."], ["Your choices", "Production activation requires access, correction, deletion, consent withdrawal, and processor workflows reviewed by counsel."], ["Privacy contact", "Privacy questions, access requests, and deletion requests: privacy@cfbapex.com."]],
    },
    terms: {
      eyebrow: "DRAFT FOR COUNSEL",
      title: "Terms of use — preview draft",
      intro: "Dataset information and model outputs are informational, not live facts, financial advice, legal advice, or a guarantee of any event.",
      sections: [["Permitted use", "Use the preview to evaluate product behavior. Verify critical facts against the cited sources."], ["External services", "Future destinations remain subject to their own terms and may be unavailable by jurisdiction."]],
    },
    "affiliate-disclosure": {
      eyebrow: "COMMERCIAL TRANSPARENCY",
      title: "Affiliate disclosure",
      intro: "TicketNetwork links are TRACKED AND EARNING — every click carries our Impact campaign attribution (12.5-14.5% per sale). TicketSmarter's approval is still pending: its links go directly to its public ticket searches until activated, then convert to tracked referrals automatically.",
      sections: [["How links are labeled", "Partner links carry sponsored/nofollow attributes and are labeled near the action. Tracked and pending states are labeled honestly — a pending link is marked as such."], ["Editorial firewall", "Commercial compensation will never determine model probabilities, editorial ranking, source verification, or correction outcomes."], ["Partner swaps", "If a partner is denied or retired, its links are removed or swapped without touching editorial content — the affiliate layer is a single configuration module."]],
    },
    "responsible-gaming": {
      eyebrow: "INFORMATIONAL MODELS ONLY",
      title: "Responsible gaming",
      intro: "The preview does not accept wagers, direct users to an operator, or guarantee a result.",
      sections: [["Optional mode", "Odds & DFS Mode requires a deliberate adult/coarse-jurisdiction attestation and can be turned off in one action."], ["Know the risk", "Probability and projection models are uncertain. Never chase losses or treat a projection as a promise. Jurisdiction-specific helplines must be supplied through an approved current source before launch."]],
    },
  };
  const page = content[kind] ?? content.about;
  return (
    <>
      <PageHeading eyebrow={page.eyebrow} title={page.title} description={page.intro} />
      <section className="policy-content content-section">
        {page.sections.map(([title, copy]) => <article key={title}><h2>{title}</h2><p>{copy}</p></article>)}
        <p className="legal-note">Generated draft language is not legal advice or final legal approval.</p>
      </section>
    </>
  );
}

function CommercialPage({ kind }: { kind: "advertise" | "partnerships" | "media-kit" }) {
  const isAdvertise = kind === "advertise";
  const isKit = kind === "media-kit";
  return (
    <>
      <PageHeading
        eyebrow="PARTNERSHIP STUDIO"
        title={isAdvertise ? "Reach fans after the utility, never before it." : isKit ? "A trust-first media system." : "Build useful Saturday partnerships."}
        description="No ads, partner IDs, official-status claims, applications, agreements, or paid campaigns are active in this preview."
      />
      <section className="commercial-grid content-section">
        {[
          ["Scoreboard adjacency", "Reserved below primary utility, never disguised as a game card, with fixed dimensions to protect layout stability."],
          ["Gameday guides", "Contextual travel, parking, transit, ticket, and tourism opportunities subject to rights and destination review."],
          ["Newsletter studio", "Consent-based weekly, portal, playoff, coaching, and stadium segments with separate optional DFS content."],
          ["Research partnerships", "Provider, conference, event, and academic opportunities with commercial/editorial separation."],
        ].map(([title, copy]) => <article key={title}><span className="sponsor-placeholder">SPONSOR-SAFE ZONE</span><h2>{title}</h2><p>{copy}</p></article>)}
      </section>
      <section className="inquiry-band"><div><span className="eyebrow">NO LIVE SUBMISSION</span><h2>Partnership inquiry workflow is staged, not activated.</h2><p>Legal entity, inventory, rates, measurement, privacy, and approval owners must be configured first.{isKit ? <> Press and media inquiries: <a href="mailto:media@cfbapex.com">media@cfbapex.com</a>.</> : null}</p></div><a className="button button--light" href="/affiliate-disclosure">Read the commercial firewall</a></section>
    </>
  );
}

function CFPBracketPage() {
  return <><PageHeading eyebrow="12-TEAM BRACKET · UNAVAILABLE" title="A current projected bracket is unavailable." description={playoffUnavailable} /><section className="content-section"><a href="/rankings">Read the dated AP and Coaches polls</a></section></>;
}

function ConferenceHubPage({ slug }: { slug: string }) {
  const hub = getConferenceHub(slug);
  if (!hub) return <NotFoundPage />;
  return (
    <div className="apex-home" style={{ paddingTop: 32 }}>
      <div className="apex-container">
        <div className="apex-home-intro">
          <div>
            <span className="apex-eyebrow">CONFERENCE HUB · 2026 SEASON</span>
            <h1>{hub.name}</h1>
            <p>{hub.teams.length} programs · {hub.scheduledGames.filter((g) => g.status === "final").length} played · {hub.scheduledGames.filter((g) => g.status === "scheduled").length} scheduled</p>
          </div>
          <span className="apex-season-label"><span /><span className="apex-season-word">2026</span> SEASON</span>
        </div>
        {hub.topSPPlus.length > 0 ? (
          <div className="apex-lane">
            <div className="apex-lane-heading">
              <div><span className="apex-eyebrow">PRESEASON RATINGS</span><h2>Top SP+ in the {hub.shortName}</h2></div>
              <a className="apex-text-link" href="/rankings">Full board →</a>
            </div>
            <div className="apex-rating-strip">
              {hub.topSPPlus.map(({ team, rank, overall }) => (
                <a key={team.id} href={`/teams/${team.slug}`} className="apex-rating-item">
                  <span>#{rank}</span>
                  <div><strong>{overall > 0 ? `+${overall.toFixed(1)}` : overall.toFixed(1)}</strong><small>{team.shortName}</small></div>
                </a>
              ))}
            </div>
          </div>
        ) : null}
        {hub.playoffContenders.length > 0 ? (
          <div className="apex-lane">
            <div className="apex-lane-heading"><div><span className="apex-eyebrow">PLAYOFF OUTLOOK</span><h2>Reported playoff odds</h2></div></div>
            <div className="apex-portal-grid" style={{ gridTemplateColumns: `repeat(${Math.min(hub.playoffContenders.length, 5)}, minmax(0, 1fr))` }}>
              {hub.playoffContenders.map(({ team, odds, outlet }) => (
                <a key={team.id} href={`/teams/${team.slug}`} className="apex-portal-card">
                  <div className="apex-portal-top"><Monogram team={team} /><div><h3>{team.shortName}</h3><span>{outlet}</span></div></div>
                  <div className="apex-portal-counts"><div><strong>{odds}</strong><span>playoff odds</span></div></div>
                </a>
              ))}
            </div>
          </div>
        ) : null}
        {hub.tvGamesThisWeek.length > 0 ? (
          <div className="apex-lane">
            <div className="apex-lane-heading">
              <div><span className="apex-eyebrow">ON TV</span><h2>Upcoming televised games</h2></div>
              <a className="apex-text-link" href="/watch">Full TV board →</a>
            </div>
            <div className="apex-horizontal">
              {hub.tvGamesThisWeek.map(({ game, network }) => (
                <a key={game.id} href={`/games/${game.id}`} className="apex-game-card">
                  <div className="apex-game-card-main">
                    <div className="apex-game-card-top"><span>{game.kickoffLabel}</span><span className="apex-badge apex-badge--gold">{network}</span></div>
                    <div className="apex-card-team"><Monogram team={teamFor(game.awayTeamId)} size="sm" /><span>{teamFor(game.awayTeamId).shortName}</span></div>
                    <div className="apex-card-team"><Monogram team={teamFor(game.homeTeamId)} size="sm" /><span>{teamFor(game.homeTeamId).shortName}</span></div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        ) : null}
        <div className="apex-lane">
          <div className="apex-lane-heading"><div><span className="apex-eyebrow">MEMBER PROGRAMS</span><h2>All {hub.teams.length} teams</h2></div></div>
          <div className="apex-portal-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
            {hub.teams.map((team) => (
              <a key={team.id} href={`/teams/${team.slug}`} className="apex-portal-card">
                <div className="apex-portal-top"><Monogram team={team} /><div><h3>{team.shortName}</h3><span>{team.record}</span></div></div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function GenericDirectory({ kind, conferenceSlug }: { kind: "coaches" | "conferences"; conferenceSlug?: string }) {
  if (kind === "coaches") return <CoachingLedger coaches={coaches} teams={teams} />;
  const conferences = [...new Set(teams.map((team) => team.conference))].filter(
    (conference) =>
      !conferenceSlug || conference.toLowerCase().replaceAll(" ", "-") === conferenceSlug,
  );
  return (
    <>
      <PageHeading eyebrow="SEASON-AWARE STRUCTURE" title="Conference membership is data, not a constant." description="Conference affiliation is versioned to the 2026 dataset, not hardcoded." />
      <section className="conference-grid content-section">{conferences.map((conference) => {
        const members = teams.filter((team) => team.conference === conference);
        return <article key={conference}><span className="eyebrow">{members.length} members</span><h2>{conference}</h2><div>{members.map((team) => <a href={`/teams/${team.slug}`} key={team.id}>{team.shortName}<b>{team.record}</b></a>)}</div></article>;
      })}</section>
    </>
  );
}

function EmptyState({
  title,
  copy,
  href,
  action,
  icon = <CircleOff aria-hidden="true" />,
}: {
  title: string;
  copy: string;
  href?: string;
  action?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon" aria-hidden="true">{icon}</span>
      <h2>{title}</h2>
      <p>{copy}</p>
      {href ? <a className="button button--ghost" href={href}>{action}</a> : null}
    </div>
  );
}

function SimpleStatus({ title, copy, action, actionLabel }: { title: string; copy: string; action: () => void; actionLabel: string }) {
  return <section className="simple-status"><span aria-hidden="true">✓</span><h1>{title}</h1><p>{copy}</p><button className="button button--gold" type="button" onClick={action}>{actionLabel}</button></section>;
}

function NotFoundPage() {
  return <EmptyState title="That route is not in the field." copy="The URL may be old, incomplete, or intentionally unavailable." href="/scores" action="Return to scores" />;
}

export function HubApp({ path = "/", boardWeek }: { path?: string; boardWeek?: BoardWeekSelection }) {
  const [mode, setMode] = useState<Mode>("clean");
  const [modeDialogOpen, setModeDialogOpen] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useEffect(() => {
    const storedMode = window.localStorage.getItem("cfb-hub:mode");
    const storedDisclosure = window.localStorage.getItem("cfb-hub:disclosure-version");
    const storedFavorites = window.localStorage.getItem("cfb-hub:favorites");
    queueMicrotask(() => {
      if (storedMode === "analysis" && storedDisclosure === disclosureVersion) setMode("analysis");
      if (storedFavorites) {
        try {
          setFavorites(new Set(JSON.parse(storedFavorites) as string[]));
        } catch {
          window.localStorage.removeItem("cfb-hub:favorites");
        }
      }
    });
  }, []);

  const enableAnalysis = () => {
    setMode("analysis");
    setModeDialogOpen(false);
    window.localStorage.setItem("cfb-hub:mode", "analysis");
    window.localStorage.setItem("cfb-hub:disclosure-version", disclosureVersion);
  };

  const enableClean = () => {
    setMode("clean");
    window.localStorage.setItem("cfb-hub:mode", "clean");
  };

  const toggleFavorite = (teamId: string) => {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      window.localStorage.setItem("cfb-hub:favorites", JSON.stringify([...next]));
      return next;
    });
  };

  const normalizedPath = `/${path.split("?")[0].split("#")[0].replace(/^\/+|\/+$/g, "")}`.replace("//", "/");
  const parts = normalizedPath.split("/").filter(Boolean);
  const root = parts[0] ?? "";
  let content: React.ReactNode;
  const common = { mode, favorites, onFavorite: toggleFavorite };

  if (!root) content = <BroadcastHomepage data={homepageData} cleanMode={mode === "clean"} onModeRequest={() => setModeDialogOpen(true)} selection={boardWeek} />;
  else if (root === "scores") content = <ScoresPage {...common} selection={boardWeek} />;
  else if (root === "schedule") content = <SchedulePage {...common} />;
  else if (root === "games" && parts[1]) content = <GamePage gameId={parts[1]} {...common} />;
  else if (root === "transfer-portal") {
    content = (
      <TransferPortalBoard
        events={portalEvents}
        teams={teams}
        asOf={portalAsOf}
        statusNote={portalStatusNote}
        countsFor={portalCountsFor}
        teamSlug={parts[1]}
      />
    );
  }
  else if (root === "playoff-predictor") content = <PlayoffPage />;
  else if (root === "playoff-bracket") content = <CFPBracketPage />;
  else if (root === "injuries") content = <InjuryReportPage teams={teams} />;
  else if (root === "gameday") content = <GameDayCommandCenter selection={boardWeek} />;

  else if (root === "no-names") content = <NoNamesPage />;
  else if (root === "highlight") content = <HighlightPage />;
  else if (root === "heisman") content = <HeismanPage cleanMode={mode === "clean"} onModeRequest={() => setModeDialogOpen(true)} />;
  else if (root === "upset-watch") content = <UpsetWatchPage cleanMode={mode === "clean"} onModeRequest={() => setModeDialogOpen(true)} />;
  else if (root === "playoff-audit") content = <PlayoffAuditPage />;
  else if (root === "nil") content = <PageHeading eyebrow="NIL · UNAVAILABLE" title="Current NIL coverage is withheld." description="No new athlete deal, valuation or current policy interpretation has been verified for this release. The October 5 source compilation remains historical and is not presented as current legal guidance." />;
  else if (root === "panel") content = <AIPanelPage />;
  else if (root === "coaching-carousel") content = <CoachingLedger coaches={coaches} teams={teams} />;
  else if (root === "coaches") {
    content = parts[1] ? (
      <CoachingLedger coaches={coaches} teams={teams} initialCoachSlug={parts[1]} />
    ) : (
      <GenericDirectory kind="coaches" />
    );
  }
  else if (root === "dfs") {
    content = (
      <FantasyNotesBoard
        cleanMode={mode === "clean"}
        onModeRequest={() => setModeDialogOpen(true)}
        notes={fantasyNotes}
        teams={teams}
        asOf={fantasyNotesAsOf}
        context={fantasyNotesContext}
      />
    );
  }
  else if (root === "teams") content = <TeamsPage teamSlug={parts[1]} />;
  else if (root === "players" && parts[1]) {
    content = (
      <PlayerRecordPage
        slug={parts[1]}
        portalEvents={portalEvents}
        fantasyNotes={fantasyNotes}
        rosterPlayer={getRosterPlayerBySlug(parts[1])}
        teams={teams}
      />
    );
  }
  else if (root === "conferences" && parts[1]) content = <ConferenceHubPage slug={parts[1]} />;
  else if (root === "conferences") content = <GenericDirectory kind="conferences" />;
  else if (root === "stadiums") {
    const stadium = parts[1] ? getStadiumBySlug(parts[1]) : undefined;
    content = stadium ? (
      <StadiumDetail stadium={stadium} team={teamFor(stadium.teamId)} />
    ) : (
      <StadiumDirectory stadiums={stadiums} teams={teams} />
    );
  }
  else if (root === "watch") {
    content = (
      <WatchPage
        defaultWeek={boardWeek?.week ?? null}
        tvRows={tvRows}
        tvWeeks={tvWeeks}
        broadcastAsOf={broadcastAsOf}
        broadcastNote={broadcastNote}
        radioForTeam={radioForTeam}
        radioAsOf={radioAsOf}
        stadiums={stadiums}
        teams={teams}
      />
    );
  }
  else if (root === "rankings") content = <RankingsPage />;
  else if (root === "search") {
    content = <SiteSearchPage teams={teams} coaches={coaches} searchPlayers={searchPlayers} />;
  }
  else if (root === "newsletter") content = <NewsletterPage />;
  else if (root === "methodology") content = <MethodologyPage />;
  else if (root === "data-sources") content = <DataSourcesPage />;
  else if (root === "corrections") content = <CorrectionsPage />;
  else if (["about", "privacy", "terms", "affiliate-disclosure", "responsible-gaming"].includes(root)) content = <PolicyPage kind={root} />;
  else if (["advertise", "partnerships", "media-kit"].includes(root)) content = <CommercialPage kind={root as "advertise" | "partnerships" | "media-kit"} />;
  else if (root === "design-system") content = <DesignSystemPage />;
  else content = <NotFoundPage />;

  return (
    <FavoritesProvider favorites={favorites} onToggle={toggleFavorite}>
      <div className={root === "teams" && parts[1] ? "app-shell app-shell--team" : "app-shell"}>
        <BroadcastHeader
          teams={teams}
          activePath={normalizedPath}
          cleanMode={mode === "clean"}
          onCleanModeChange={(enabled) => enabled ? enableClean() : setModeDialogOpen(true)}
        />
        <ScoreTicker games={tickerGamesFor(boardWeek?.week)} teams={teams} />
        <main id="main-content" className="route-frame" key={normalizedPath}>{moduleCoverage[root] ? <aside className="apex-container apex-data-note" aria-label="Data coverage">{moduleCoverage[root]}</aside> : null}{content}</main>
        <BroadcastFooter />
        <ModeDialog open={modeDialogOpen} onClose={() => setModeDialogOpen(false)} onConfirm={enableAnalysis} />
      </div>
    </FavoritesProvider>
  );
}
