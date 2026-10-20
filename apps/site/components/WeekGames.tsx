"use client";

/**
 * "This Week's Games" verified-snapshot card for team pages. Fetches the
 * site's own /api/ncaaf-scoreboard route after mount (same-origin, so the
 * worker CSP holds) and renders the week's NCAAF fixtures and finals with
 * the page team's games pinned first.
 *
 * Degrades to nothing: any fetch failure or empty reconciled week
 * renders no section at all — team pages never show an error state.
 */

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  splitTeamWeek,
  type NcaafGameEvent,
  type NcaafGameState,
  type NcaafScoreboardPayload,
} from "@/lib/ncaaf-scoreboard";

const OTHER_GAMES_CAP = 9;

const gameStateLabel: Record<NcaafGameState, string> = {
  scheduled: "",
  live: "LIVE",
  halftime: "HALF",
  final: "FINAL",
  postponed: "PPD",
  canceled: "CANC",
  other: "",
};

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  timeZone: "America/New_York",
});
const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});

/** Derives an event's Eastern day label and status/kickoff-time detail for display. */
function eventTiming(event: NcaafGameEvent): { day: string; detail: string } {
  // A date-only value is an official TBD kickoff: name the day, never a time.
  if (/^\d{4}-\d{2}-\d{2}$/.test(event.utc)) {
    return { day: dayFormatter.format(new Date(`${event.utc}T17:00:00Z`)), detail: "Kickoff TBA" };
  }
  const at = new Date(event.utc);
  if (Number.isNaN(at.getTime())) return { day: "TBD", detail: "Time not published" };
  const day = dayFormatter.format(at);
  if (event.state === "final") return { day, detail: "FINAL" };
  if (event.state === "live" || event.state === "halftime") {
    const label = gameStateLabel[event.state];
    return { day, detail: event.statusLabel ? `${label} · ${event.statusLabel}` : label };
  }
  if (event.state === "postponed" || event.state === "canceled") {
    return { day, detail: event.statusLabel ?? gameStateLabel[event.state] };
  }
  return { day, detail: `${timeFormatter.format(at)} ET` };
}

function WeekGameRow({ event, highlight }: { event: NcaafGameEvent; highlight?: boolean }) {
  const { day, detail } = eventTiming(event);
  const hasScore =
    (event.state === "final" || event.state === "live" || event.state === "halftime") &&
    event.homeScore != null &&
    event.awayScore != null;
  const awayWins = hasScore && (event.awayScore ?? 0) > (event.homeScore ?? 0);
  const homeWins = hasScore && (event.homeScore ?? 0) > (event.awayScore ?? 0);
  return (
    <li className="week-game" data-state={event.state} data-highlight={highlight ?? false}>
      <span className="week-game-day" aria-hidden="true">
        {day}
      </span>
      <div className="week-game-matchup">
        <p className={awayWins ? "week-game-winner" : undefined}>
          {event.away}
          {hasScore ? <strong>{event.awayScore}</strong> : null}
        </p>
        <p className={homeWins ? "week-game-winner" : undefined}>
          {event.home}
          {hasScore ? <strong>{event.homeScore}</strong> : null}
        </p>
        {event.venue ? <span className="week-game-venue">{event.venue}</span> : null}
      </div>
      <span className="week-game-status">{detail}</span>
    </li>
  );
}

/** Renders the team's verified-snapshot week card, labeling it with the reconciled schedule/finals check timestamps. */
export function WeekGames({ school, displayName }: { school: string; displayName?: string }) {
  const [payload, setPayload] = useState<NcaafScoreboardPayload | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ncaaf-scoreboard", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: NcaafScoreboardPayload | null) => {
        if (body && Array.isArray(body.events) ) {
          setPayload(body);
        }
      })
      .catch(() => {
        // Hidden section on any failure — never an error on the page.
      });
    return () => controller.abort();
  }, []);

  if (!payload || payload.events.length === 0) return null;

  const { teamGames, otherGames } = splitTeamWeek(payload.events, school);
  if (teamGames.length === 0 && otherGames.length === 0) return null;

  const shownOthers = otherGames.slice(0, OTHER_GAMES_CAP);
  const hiddenOthers = otherGames.length - shownOthers.length;
  const updated = new Date(payload.fetchedAt);
  const updatedLabel = Number.isNaN(updated.getTime())
    ? null
    : timeFormatter.format(updated);

  return (
    <section className="week-games" aria-label="This week's games">
      <header className="week-games-heading">
        <div>
          <span className="hub-eyebrow">VERIFIED SNAPSHOT</span>
          <h2 className="font-display">This Week&apos;s Games</h2>
        </div>
        <span className="week-games-meta">
          Partial NCAAF feed{updatedLabel ? ` · fetched ${updatedLabel} ET` : ""}
        </span>
      </header>
      {teamGames.length > 0 ? (
        <>
          <h3 className="week-games-sub">
            {displayName ?? school} this week
          </h3>
          <ul className="week-games-list">
            {teamGames.map((event) => (
              <WeekGameRow key={event.id} event={event} highlight />
            ))}
          </ul>
        </>
      ) : null}
      {shownOthers.length > 0 ? (
        <>
          <h3 className="week-games-sub">Around the sport</h3>
          <ul className="week-games-list">
            {shownOthers.map((event) => (
              <WeekGameRow key={event.id} event={event} />
            ))}
          </ul>
          {hiddenOthers > 0 ? (
            <p className="week-games-note">
              Showing {shownOthers.length} of {otherGames.length} games on this
              partial feed.
            </p>
          ) : null}
        </>
      ) : null}
      <p className="week-games-note">Matched games use the reviewed snapshot. Schedule checked {payload.canonicalAsOf ?? "unknown"}; finals checked {payload.finalsAsOf ?? "unknown"}. Upstream observation time is unknown. Fetched once on page load; not continuous live scoring.</p>
      <a className="week-games-link" href="/scores">
        Full 2026 scoreboard
        <ArrowRight size={14} aria-hidden="true" />
      </a>
    </section>
  );
}
