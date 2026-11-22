import { officialAvailabilityFor, officialAvailabilityNote } from "@/lib/injury-report";
import {
  ArrowRight,
  CalendarDays,
  ExternalLink,
  FileWarning,
  ShieldCheck,
} from "lucide-react";
import type { FantasyNote } from "@/lib/cfb-dataset";
import { playerSlugForName, reviewedPlayerProfile, type RosterPlayerRecord } from "@/lib/player-records";
import type { PortalEvent, Team } from "@/lib/types";
import { TeamMark } from "./broadcast/primitives";

interface PlayerRecordPageProps {
  slug: string;
  portalEvents: readonly PortalEvent[];
  fantasyNotes: readonly FantasyNote[];
  rosterPlayer?: RosterPlayerRecord;
  teams: readonly Team[];
}

function hostnameFor(source: string) {
  try {
    return new URL(source).hostname.replace(/^www\./, "");
  } catch {
    return source;
  }
}

function formatEventDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function SourceLinks({ sources }: { sources?: readonly string[] }) {
  if (!sources?.length) return null;
  return (
    <div className="lt-record-sources">
      <span>Sources</span>
      <div>
        {sources.map((source) => (
          <a href={source} key={source} rel="nofollow noreferrer noopener" target="_blank">
            {hostnameFor(source)}
            <ExternalLink aria-hidden="true" />
          </a>
        ))}
      </div>
    </div>
  );
}

function TeamLink({ team, fallback }: { team?: Team; fallback: string }) {
  return team ? <a href={`/teams/${team.slug}`}>{team.shortName}</a> : <span>{fallback}</span>;
}

export function PlayerRecordPage({
  slug,
  portalEvents,
  fantasyNotes,
  rosterPlayer,
  teams,
}: PlayerRecordPageProps) {
  const profile = reviewedPlayerProfile(slug);
  const portalEvent = portalEvents.find((event) => event.playerSlug === slug);
  const fantasyNote = fantasyNotes.find((note) => playerSlugForName(note.player) === slug);
  const playerName = profile?.displayName ?? portalEvent?.player ?? fantasyNote?.player ?? rosterPlayer?.name ?? slug.replaceAll("-", " ");
  const position = profile?.position ?? portalEvent?.position ?? fantasyNote?.position ?? rosterPlayer?.position ?? "Position not listed";
  const currentTeamId = profile?.teamId ?? portalEvent?.toTeamId ?? fantasyNote?.team ?? rosterPlayer?.teamId ?? portalEvent?.fromTeamId;
  const currentTeam = teams.find((team) => team.id === currentTeamId);
  const originTeam = portalEvent
    ? teams.find((team) => team.id === portalEvent.fromTeamId)
    : undefined;
  const destinationTeam = portalEvent?.toTeamId
    ? teams.find((team) => team.id === portalEvent.toTeamId)
    : undefined;

  return (
    <div className="lt-page">
      <header className="lt-player-hero">
        <div className="lt-player-hero__copy">
          <span className="lt-eyebrow">PLAYER RECORD</span>
          <h1 className="font-display text-balance">{playerName}</h1>
          <p>
            <span>{position}</span>
            <span aria-hidden="true">·</span>
            {currentTeam ? <a href={`/teams/${currentTeam.slug}`}>{currentTeam.name}</a> : <span>Team not listed</span>}
          </p>
        </div>
        {currentTeam ? (
          <a className="lt-player-hero__team" href={`/teams/${currentTeam.slug}`} aria-label={`Open ${currentTeam.name} team page`}>
            <TeamMark team={currentTeam} size="hero" priority />
          </a>
        ) : null}
        <span className="lt-field-stripes" aria-hidden="true" />
      </header>

      <section className="lt-player-layout lt-section" aria-label={`${playerName} data record`}>
        <div className="lt-player-main">
          {profile ? (
            <article className="lt-record-card" aria-labelledby="player-roster-profile-title">
              <div className="lt-record-card__topline">
                <span className="lt-eyebrow">{profile.season} ROSTER PROFILE</span>
                <span className="lt-as-of">Checked {formatEventDate(profile.checkedOn)}</span>
              </div>
              <div className="lt-record-copy">
                <h2 id="player-roster-profile-title" className="font-display">Listed as {profile.rosterName} at Cincinnati</h2>
                <p>
                  Cincinnati's official {profile.season} roster lists Javonnie Gibson as {profile.rosterName},
                  a wide receiver wearing No. {profile.jersey}. The school lists {profile.previousSchool} as his previous school.
                </p>
              </div>
              <dl className="lt-record-facts">
                <div><dt>Position</dt><dd>Wide receiver ({profile.position})</dd></div>
                <div><dt>Jersey</dt><dd>No. {profile.jersey}</dd></div>
                <div><dt>Class</dt><dd>{profile.classYear}</dd></div>
                <div><dt>Height / weight</dt><dd>{profile.height} / {profile.weight}</dd></div>
                <div><dt>Hometown</dt><dd>{profile.hometown}</dd></div>
                <div><dt>Previous school</dt><dd>{profile.previousSchool}</dd></div>
              </dl>
              <div className="lt-record-copy">
                <p>
                  These dated roster facts do not establish current game availability or season statistics.
                  The January transfer event below is retained as history.
                </p>
                <p><a href="/teams/cincinnati">Cincinnati team, schedule and roster</a></p>
              </div>
              <SourceLinks sources={[profile.sourceUrl]} />
            </article>
          ) : null}
          {portalEvent ? (
            <article className="lt-record-card">
              <div className="lt-record-card__topline">
                <span className="lt-eyebrow">{profile ? "HISTORICAL TRANSFER PORTAL EVENT" : "TRANSFER PORTAL EVENT"}</span>
                <span className="lt-confidence" data-confidence={portalEvent.confidence}>
                  <ShieldCheck aria-hidden="true" />
                  {portalEvent.confidence} confidence
                </span>
              </div>

              <section
                className="lt-transfer-route"
                aria-label={`${originTeam?.shortName ?? portalEvent.fromTeamId} to ${destinationTeam?.shortName ?? "available"}`}
              >
                <div>
                  <small>Origin</small>
                  <TeamLink team={originTeam} fallback={portalEvent.fromTeamId.replaceAll("-", " ")} />
                </div>
                <ArrowRight aria-hidden="true" />
                <div>
                  <small>Destination</small>
                  {portalEvent.toTeamId ? (
                    <TeamLink team={destinationTeam} fallback={portalEvent.toTeamId.replaceAll("-", " ")} />
                  ) : (
                    <span>Available</span>
                  )}
                </div>
              </section>

              <dl className="lt-record-facts">
                <div>
                  <dt>Event date</dt>
                  <dd>
                    <CalendarDays aria-hidden="true" />
                    {formatEventDate(portalEvent.eventDate)}
                  </dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{portalEvent.status}</dd>
                </div>
                <div>
                  <dt>Position</dt>
                  <dd>{portalEvent.position}</dd>
                </div>
              </dl>

              {portalEvent.notes ? (
                <div className="lt-record-copy">
                  <h2 className="font-display">Event notes</h2>
                  <p>{portalEvent.notes}</p>
                </div>
              ) : null}
              <SourceLinks sources={portalEvent.sources} />
            </article>
          ) : fantasyNote ? (
            <article className="lt-record-card">
              <div className="lt-record-card__topline">
                <span className="lt-eyebrow">FANTASY NOTE</span>
                <span className="lt-as-of">As of {fantasyNote.as_of ?? "not published"}</span>
              </div>

              <dl className="lt-record-facts lt-record-facts--fantasy">
                <div>
                  <dt>Position</dt>
                  <dd>{fantasyNote.position ?? "Not listed"}</dd>
                </div>
                <div>
                  <dt>Team</dt>
                  <dd>
                    <TeamLink
                      team={teams.find((team) => team.id === fantasyNote.team)}
                      fallback={fantasyNote.team.replaceAll("-", " ")}
                    />
                  </dd>
                </div>
                <div>
                  <dt>Historical Week 1 availability</dt>
                  <dd>{fantasyNote.availability ?? "Not reported"}</dd>
                </div>
              </dl>

              <p className="inj-stale-banner">This Week 1 note retains its original date and is not current availability. <a href="/injuries">Read the dated official reports</a>.</p>
              {officialAvailabilityFor(fantasyNote.player, fantasyNote.team) ? <p className="inj-stale-banner">{officialAvailabilityNote(officialAvailabilityFor(fantasyNote.player, fantasyNote.team)!)}</p> : null}
              <div className="lt-fantasy-copy">
                <section>
                  <span>Role</span>
                  <p>{fantasyNote.role ?? "No role note was published."}</p>
                </section>
                <section>
                  <span>Usage</span>
                  <p>{fantasyNote.usage ?? "No usage note was published."}</p>
                </section>
                {fantasyNote.injury ? (
                  <section>
                    <span>Availability note</span>
                    <p>{fantasyNote.injury}</p>
                  </section>
                ) : null}
              </div>

              <div className="lt-projection">
                <span>Analyst projection</span>
                <strong className="font-display">{fantasyNote.projection?.value ?? "No projection published"}</strong>
                {fantasyNote.projection?.outlet ? <small>{fantasyNote.projection.outlet}</small> : null}
              </div>
              <SourceLinks sources={fantasyNote.sources} />
            </article>
          ) : (
            <div className="lt-empty-state lt-empty-state--record" role="status">
              <FileWarning aria-hidden="true" />
              <h2 className="font-display">No record for this player.</h2>
              <p>No portal event or fantasy note is attached to this roster entry.</p>
            </div>
          )}
        </div>

        <aside className="lt-corrections-card" aria-labelledby="player-corrections-title">
          <FileWarning aria-hidden="true" />
          <span className="lt-eyebrow">CORRECTIONS</span>
          <h2 id="player-corrections-title" className="font-display">See something off?</h2>
          <p>Identity, team, status, and source issues are reviewed against the underlying record.</p>
          <a href={`/corrections?record=player-${slug}`}>Report a data issue</a>
        </aside>
      </section>
    </div>
  );
}
