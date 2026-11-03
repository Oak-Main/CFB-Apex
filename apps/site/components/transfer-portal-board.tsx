"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  SlidersHorizontal,
} from "lucide-react";
import type { PortalEvent, Team } from "@/lib/types";
import { TeamMark } from "./broadcast/primitives";
import {
  DataBoardEmpty,
  DataBoardHero,
  DataBoardSummary,
  formatDataDate,
} from "./data-board-primitives";
import { MobileDataCard, MobileDataCardStack } from "./polish/mobile-data-card";
import { BoardSkeleton } from "./polish/skeletons";
import { TransferPortalGuide } from "./transfer-portal-guide";

interface PortalCounts {
  incoming: number;
  outgoing: number;
  net: number;
}

interface TransferPortalBoardProps {
  events: readonly PortalEvent[];
  teams: readonly Team[];
  asOf: string | null;
  statusNote: string | null;
  countsFor: (slug: string) => PortalCounts;
  teamSlug?: string;
}

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${value}`;
}

function fallbackTeamLabel(slug: string) {
  return slug
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function TransferNote({ note }: { note: string }) {
  return (
    <details className="db-expandable-note">
      <summary>
        <span>{note}</span>
        <span className="db-expandable-note__action">
          <span>Read note</span>
          <span>Hide note</span>
          <ChevronDown size={15} aria-hidden="true" />
        </span>
      </summary>
      <p>{note}</p>
    </details>
  );
}

function TeamLedger({
  title,
  direction,
  events,
  team,
  teamBySlug,
}: {
  title: string;
  direction: "incoming" | "outgoing";
  events: readonly PortalEvent[];
  team: Team;
  teamBySlug: ReadonlyMap<string, Team>;
}) {
  return (
    <section className="db-ledger" aria-labelledby={`ledger-${direction}`}>
      <header className="db-ledger__header">
        <div>
          {direction === "incoming" ? (
            <ArrowDownLeft size={18} aria-hidden="true" />
          ) : (
            <ArrowUpRight size={18} aria-hidden="true" />
          )}
          <h2 id={`ledger-${direction}`} className="font-display">
            {title}
          </h2>
        </div>
        <span>{events.length}</span>
      </header>
      <div className="db-ledger__rows">
        {events.length ? (
          events.map((event) => {
            const partnerSlug =
              direction === "incoming" ? event.fromTeamId : event.toTeamId;
            const partner = partnerSlug ? teamBySlug.get(partnerSlug) : undefined;
            const partnerLabel = partnerSlug
              ? (partner?.shortName ?? fallbackTeamLabel(partnerSlug))
              : "Open destination";
            return (
              <article
                className="db-ledger-row"
                data-direction={direction}
                key={event.id}
              >
                <span className="db-position-tag">{event.position}</span>
                <div>
                  <strong>{event.player}</strong>
                  <span>
                    {direction === "incoming" ? "From" : "To"}{" "}
                    {partner ? (
                      <a href={`/teams/${partner.slug}`}>{partnerLabel}</a>
                    ) : (
                      partnerLabel
                    )}
                  </span>
                </div>
                <div className="db-ledger-row__meta">
                  <span className={`db-status db-status--${event.status}`}>
                    {event.status}
                  </span>
                  <time dateTime={event.eventDate}>
                    {formatDataDate(event.eventDate)}
                  </time>
                </div>
                {event.notes ? <TransferNote note={event.notes} /> : null}
              </article>
            );
          })
        ) : (
          <p className="db-ledger__empty">
            No verified {direction} transfers are listed for {team.shortName}.
          </p>
        )}
      </div>
    </section>
  );
}

function TeamPortalLedger({
  team,
  events,
  counts,
  asOf,
  statusNote,
  teamBySlug,
}: {
  team: Team;
  events: readonly PortalEvent[];
  counts: PortalCounts;
  asOf: string | null;
  statusNote: string | null;
  teamBySlug: ReadonlyMap<string, Team>;
}) {
  const incoming = events.filter((event) => event.toTeamId === team.slug);
  const outgoing = events.filter((event) => event.fromTeamId === team.slug);

  return (
    <div className="db-page db-page--portal">
      <DataBoardHero
        eyebrow="Transfer portal · Program ledger"
        title={`${team.shortName} portal ledger`}
        description={`Every verified move into and out of ${team.shortName}, separated into a clean two-way roster ledger.`}
        action={
          <div className="db-net-score" data-positive={counts.net >= 0}>
            <span>Net movement</span>
            <strong className="font-display">{signed(counts.net)}</strong>
          </div>
        }
      />
      <section className="apex-container db-team-ledger-summary" aria-label={`${team.shortName} transfer totals`}>
        <a href="/transfer-portal">
          <ArrowRight size={16} aria-hidden="true" />
          Full portal board
        </a>
        <div>
          <span><b>{counts.incoming}</b> incoming</span>
          <span><b>{counts.outgoing}</b> outgoing</span>
          <span><b>{signed(counts.net)}</b> net</span>
        </div>
        <p>
          Compiled {formatDataDate(asOf)}. {statusNote}
        </p>
      </section>
      <div className="apex-container db-ledger-grid">
        <TeamLedger
          title="Incoming"
          direction="incoming"
          events={incoming}
          team={team}
          teamBySlug={teamBySlug}
        />
        <TeamLedger
          title="Outgoing"
          direction="outgoing"
          events={outgoing}
          team={team}
          teamBySlug={teamBySlug}
        />
      </div>
    </div>
  );
}

export function TransferPortalBoard({
  events,
  teams,
  asOf,
  statusNote,
  countsFor,
  teamSlug,
}: TransferPortalBoardProps) {
  const [position, setPosition] = useState("All positions");
  const [status, setStatus] = useState("All statuses");
  const [isPending, startTransition] = useTransition();
  const teamBySlug = useMemo(
    () => new Map(teams.map((team) => [team.slug, team])),
    [teams],
  );
  const scopedTeam = teamSlug ? teamBySlug.get(teamSlug) : undefined;
  const positions = useMemo(
    () =>
      [
        "All positions",
        ...new Set(
          events
            .map((event) => event.position)
            .filter((value) => Boolean(value) && value !== "—"),
        ),
      ].sort((a, b) =>
        a === "All positions" ? -1 : b === "All positions" ? 1 : a.localeCompare(b),
      ),
    [events],
  );
  const statuses = useMemo(
    () => ["All statuses", ...new Set(events.map((event) => event.status))],
    [events],
  );
  const filteredEvents = useMemo(
    () =>
      events.filter(
        (event) =>
          (position === "All positions" || event.position === position) &&
          (status === "All statuses" || event.status === status),
      ),
    [events, position, status],
  );
  const busiest = useMemo(
    () =>
      teams
        .map((team) => ({ team, counts: countsFor(team.slug) }))
        .sort(
          (a, b) =>
            b.counts.incoming +
            b.counts.outgoing -
            (a.counts.incoming + a.counts.outgoing),
        )
        .slice(0, 4),
    [countsFor, teams],
  );

  if (scopedTeam) {
    return (
      <TeamPortalLedger
        team={scopedTeam}
        events={events}
        counts={countsFor(scopedTeam.slug)}
        asOf={asOf}
        statusNote={statusNote}
        teamBySlug={teamBySlug}
      />
    );
  }

  return (
    <div className="db-page db-page--portal">
      <DataBoardHero
        eyebrow="CFB transfers · 2026 cycle"
        title="CFB Transfer Portal: 2026 Window Dates"
        description="The college football transfer portal is the roster-movement process behind a player changing programs. CFB Apex tracks verified 2026 FBS transfers; the current dataset records a January 2–16, 2026 winter window."
        action={
          <a className="db-hero-link" href="/methodology#portal">
            Portal methodology
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        }
      />
      <DataBoardSummary
        label="Transfer portal dataset summary"
        caption={statusNote}
        items={[
          { label: "Verified transfers", value: events.length, emphasis: true },
          { label: "Programs tracked", value: teams.length },
          { label: "Compilation date", value: formatDataDate(asOf) },
        ]}
      />
      <TransferPortalGuide />

      {events.length ? (
        <>
          <section className="apex-container db-section" aria-labelledby="busiest-movers-title">
            <div className="db-section-heading">
              <div>
                <span className="db-eyebrow">Roster velocity</span>
                <h2 id="busiest-movers-title" className="font-display">
                  Busiest movers
                </h2>
              </div>
              <p>Programs with the most total recorded movement.</p>
            </div>
            <div className="db-movers-grid">
              {busiest.map(({ team, counts }) => (
                <a
                  className="apex-portal-card db-mover-card"
                  href={`/transfer-portal/${team.slug}`}
                  key={team.slug}
                >
                  <div className="apex-portal-top">
                    <TeamMark team={team} />
                    <div>
                      <h3>{team.shortName}</h3>
                      <span>{team.conference}</span>
                    </div>
                  </div>
                  <div className="apex-portal-counts">
                    <div>
                      <strong>{counts.incoming}</strong>
                      <span>
                        <ArrowDownLeft size={14} aria-hidden="true" />
                        Incoming
                      </span>
                    </div>
                    <div>
                      <strong>{counts.outgoing}</strong>
                      <span>
                        <ArrowUpRight size={14} aria-hidden="true" />
                        Outgoing
                      </span>
                    </div>
                  </div>
                  <div className="db-mover-card__net">
                    <span>Net movement</span>
                    <strong>{signed(counts.net)}</strong>
                  </div>
                </a>
              ))}
            </div>
          </section>

          <section className="apex-container db-section db-section--table" aria-labelledby="portal-table-title">
            <div className="db-table-toolbar">
              <div>
                <span className="db-eyebrow">Complete ledger</span>
                <h2 id="portal-table-title" className="font-display">
                  Player movement
                </h2>
              </div>
              <fieldset className="db-filters">
                <legend className="sr-only">Filter portal records</legend>
                <SlidersHorizontal size={18} aria-hidden="true" />
                <label>
                  <span>Position</span>
                  <select value={position} onChange={(event) => startTransition(() => setPosition(event.target.value))}>
                    {positions.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Status</span>
                  <select value={status} onChange={(event) => startTransition(() => setStatus(event.target.value))}>
                    {statuses.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
              </fieldset>
            </div>
            <p className="db-result-count" aria-live="polite">
              Showing <strong>{filteredEvents.length}</strong> of {events.length} verified records
            </p>
            {isPending ? <BoardSkeleton rows={3} /> : null}
            <section
              className="db-table-wrap db-desktop-data-table"
              hidden={isPending}
              tabIndex={0}
              aria-label="Scrollable portal movement table"
            >
              <table className="db-table db-table--portal">
                <caption>
                  Transfer events compiled {formatDataDate(asOf)}. Notes expand in place; team names link to program pages.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Player</th>
                    <th scope="col">Position</th>
                    <th scope="col">Origin</th>
                    <th scope="col">Destination</th>
                    <th scope="col">Status</th>
                    <th scope="col">Date</th>
                    <th scope="col">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.map((event) => {
                    const origin = teamBySlug.get(event.fromTeamId);
                    const destination = event.toTeamId
                      ? teamBySlug.get(event.toTeamId)
                      : undefined;
                    return (
                      <Fragment key={event.id}>
                        <tr className="db-data-row" data-has-note={Boolean(event.notes)}>
                          <td data-label="Player" className="db-primary-cell">
                            <a className="db-player-link" href={`/players/${event.playerSlug}`}>
                              {event.player}
                            </a>
                            {event.notes ? (
                              <div className="db-mobile-note">
                                <TransferNote note={event.notes} />
                              </div>
                            ) : null}
                          </td>
                          <td data-label="Position">
                            <span className="db-position-tag">{event.position}</span>
                          </td>
                          <td data-label="Origin">
                            {origin ? (
                              <a className="db-team-link" href={`/teams/${origin.slug}`}>
                                {origin.shortName}
                              </a>
                            ) : (
                              fallbackTeamLabel(event.fromTeamId)
                            )}
                          </td>
                          <td data-label="Destination">
                            {destination ? (
                              <a className="db-team-link" href={`/teams/${destination.slug}`}>
                                {destination.shortName}
                              </a>
                            ) : event.toTeamId ? (
                              fallbackTeamLabel(event.toTeamId)
                            ) : (
                              "Open"
                            )}
                          </td>
                          <td data-label="Status">
                            <span className={`db-status db-status--${event.status}`}>
                              {event.status}
                            </span>
                          </td>
                          <td data-label="Date">
                            <time dateTime={event.eventDate}>{formatDataDate(event.eventDate)}</time>
                          </td>
                          <td data-label="Confidence">
                            <span className={`db-confidence db-confidence--${event.confidence}`}>
                              {event.confidence}
                            </span>
                          </td>
                        </tr>
                        {event.notes ? (
                          <tr className="db-note-row" key={`${event.id}-note`}>
                            <td colSpan={7}>
                              <TransferNote note={event.notes} />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </section>
            {!isPending ? (
              <MobileDataCardStack label="Transfer portal records">
                {filteredEvents.map((event) => {
                const origin = teamBySlug.get(event.fromTeamId);
                const destination = event.toTeamId
                  ? teamBySlug.get(event.toTeamId)
                  : undefined;
                const originLabel = origin?.shortName ?? fallbackTeamLabel(event.fromTeamId);
                const destinationLabel = destination?.shortName ?? (event.toTeamId ? fallbackTeamLabel(event.toTeamId) : "Open");
                return (
                  <MobileDataCard
                    key={`mobile-${event.id}`}
                    title={event.player}
                    subtitle={event.status}
                    summary={[
                      { label: "Position", value: event.position },
                      { label: "Origin", value: originLabel },
                      { label: "Destination", value: destinationLabel },
                    ]}
                    details={[
                      { label: "Date", value: <time dateTime={event.eventDate}>{formatDataDate(event.eventDate)}</time> },
                      { label: "Confidence", value: event.confidence },
                      { label: "Status", value: event.status },
                      { label: "Source note", value: event.notes ?? "No additional note published." },
                    ]}
                    action={
                      <a href={`/players/${event.playerSlug}`}>
                        Open player record
                        <ArrowRight aria-hidden="true" />
                      </a>
                    }
                  />
                );
                })}
              </MobileDataCardStack>
            ) : null}
          </section>
        </>
      ) : (
        <section className="apex-container db-section">
          <DataBoardEmpty
            title="Portal data not published"
            description="The full ledger will appear when verified portal records join the dataset."
            action={<a href="/teams">Browse all teams</a>}
          />
        </section>
      )}
    </div>
  );
}
