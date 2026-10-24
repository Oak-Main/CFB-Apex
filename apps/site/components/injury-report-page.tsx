"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { BroadcastTeam } from "@/lib/homepage";
import { DataBoardHero, DataBoardSummary } from "./data-board-primitives";
import {
  INJURY_METHOD,
  type EspnInjuryEntry,
  type InjuryStatus,
  type InjuryWatchEntry,
  espnInjuriesAsOf,
  espnLedgerEntries,
  espnWatchEntries,
  injuryResearch,
  officialAvailability,
  officialAvailabilityFor,
  officialAvailabilityNote,
  type OfficialAvailabilityEntry,
} from "@/lib/injury-report";
import { verifiedRefresh } from "@/lib/cfb-dataset";
import { editorialResearchIsHistorical } from "@/lib/injury-freshness.mjs";

function StatusPill({ status }: { status: InjuryStatus }) {
  const cls =
    status === "IR" ? "inj-pill--ir" : status === "OUT" ? "inj-pill--out" : status === "SUSPENSION" ? "inj-pill--susp" : "inj-pill--q";
  return <span className={`inj-pill ${cls}`}>{status === "IR" ? "IR" : status === "OUT" ? "OUT" : status === "SUSPENSION" ? "SUSP" : status === "DOUBTFUL" ? "DOUBTFUL" : "Q"}</span>;
}

function LikelihoodPill({ likelihood, confidence }: { likelihood: string | null; confidence: string | null }) {
  if (!likelihood) return <span className="inj-pill inj-pill--none">Not graded</span>;
  const cls =
    likelihood === "likely" ? "inj-pill--likely" : likelihood === "questionable" ? "inj-pill--q" : "inj-pill--out";
  return (
    <span className={`inj-pill ${cls}`}>
      {likelihood.toUpperCase()}
      {confidence ? <small> · {confidence} conf</small> : null}
    </span>
  );
}

function PracticeCell({ status }: { status: string | null }) {
  if (!status) return <span className="inj-practice inj-practice--none">—</span>;
  const cls = status === "FP" ? "inj-practice--fp" : status === "LP" ? "inj-practice--lp" : "inj-practice--dnp";
  return <span className={`inj-practice ${cls}`}>{status}</span>;
}

interface LiveInjury {
  player: string;
  teamSlug: string | null;
  position: string | null;
  status: string;
  detail: string | null;
  asOf: string | null;
}

export function InjuryReportPage({ teams }: { teams: readonly BroadcastTeam[] }) {
  const teamBySlug = useMemo(() => new Map(teams.map((team) => [team.slug, team])), [teams]);
  const [teamFilter, setTeamFilter] = useState<string>("");
  const [live, setLive] = useState<LiveInjury[] | null>(null);
  const [liveAsOf, setLiveAsOf] = useState<string | null>(null);

  // Supplemental IR refresh only. It never advances the build-time watch date.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/injuries", { headers: { accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : null))
      .then((doc) => {
        if (!cancelled && doc && Array.isArray(doc.entries)) {
          if (!doc.degraded) setLive(doc.entries as LiveInjury[]);
          setLiveAsOf(doc.asOf ?? null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const baseLedger = useMemo<EspnInjuryEntry[]>(() => espnLedgerEntries(), []);
  const baseWatch = useMemo<EspnInjuryEntry[]>(() => espnWatchEntries(), []);

  const liveLedger = useMemo(() => {
    if (!live) return null;
    return live
      .filter((entry) => entry.status === "IR")
      .map((entry) => ({ ...entry, status: "IR" as InjuryStatus }));
  }, [live]);

  const ledgerRows = useMemo(() => {
    const rows: Array<{
      kind: "espn" | "research";
      player: string;
      teamSlug: string | null;
      position: string | null;
      injury: string | null;
      status: InjuryStatus;
      weeksOut: number | null;
      detail: string | null;
      sources: string[];
      social: string[];
      confidence: string | null;
      sourceAsOf: string | null;
    }> = (liveLedger ?? baseLedger).map((entry) => ({
      kind: "espn" as const,
      player: entry.player,
      teamSlug: entry.teamSlug,
      position: entry.position,
      injury: null as string | null,
      status: entry.status,
      weeksOut: null as number | null,
      detail: entry.detail,
      sources: [] as string[],
      social: [] as string[],
      confidence: null as string | null,
      sourceAsOf: liveAsOf ?? espnInjuriesAsOf,
    }));
    const seen = new Set(rows.map((row) => `${row.player}:${row.teamSlug}`));
    for (const entry of injuryResearch.ledger) {
      const key = `${entry.player}:${entry.teamSlug}`;
      if (seen.has(key)) continue; // research detail joins the ESPN row below
      seen.add(key);
      rows.push({
        kind: "research",
        player: entry.player,
        teamSlug: entry.teamSlug,
        position: entry.position,
        injury: entry.injury,
        status: entry.status as InjuryStatus,
        weeksOut: entry.weeksOut,
        detail: entry.detail,
        sources: entry.sources,
        social: entry.social,
        confidence: entry.confidence,
        sourceAsOf: entry.sourceAsOf ?? null,
      });
    }
    const eligible = rows.filter((row) => {
      const official = officialAvailabilityFor(row.player, row.teamSlug);
      return !(official?.status === "Available" && (!row.sourceAsOf || official.game_date >= row.sourceAsOf));
    });
    const filtered = teamFilter ? eligible.filter((row) => row.teamSlug === teamFilter) : eligible;
    return filtered.sort(
      (a, b) => (a.teamSlug ?? "").localeCompare(b.teamSlug ?? "") || a.player.localeCompare(b.player),
    );
  }, [liveLedger, liveAsOf, baseLedger, teamFilter]);

  const watchRows = useMemo(() => {
    const espnRows = baseWatch.map((entry) => ({
      kind: "espn" as const,
      player: entry.player,
      teamSlug: entry.teamSlug,
      position: entry.position,
      injury: null as string | null,
      practice: null as InjuryWatchEntry["practice"] | null,
      likelihood: entry.status === "OUT" ? ("unlikely" as const) : entry.status === "DOUBTFUL" ? ("doubtful" as const) : null,
      confidence: null as string | null,
      note: entry.detail,
      sources: [] as string[],
      social: [] as string[],
      official: null as OfficialAvailabilityEntry | null,
    }));
    // Current reporting renders separately. An October 10 designation must
    // never replace an October 19/20 report about a different game.
    const priorRows = espnRows;
    const officialRows = (officialAvailability?.entries ?? []).map((official) => {
      const prior = priorRows.find((row) => row.player === official.player && row.teamSlug === official.team_slug);
      const priorLedger = injuryResearch.ledger.find((row) => row.player === official.player && row.teamSlug === official.team_slug);
      const historicalNote = prior?.note ?? [priorLedger?.injury, priorLedger?.detail].filter(Boolean).join(". ");
      return { kind: "research" as const, player: official.player, teamSlug: official.team_slug,
        position: official.position, injury: null, practice: null, likelihood: null, confidence: null,
        note: `${officialAvailabilityNote(official)}${historicalNote ? ` Historical editorial note (${priorLedger?.sourceAsOf ?? injuryResearch.asOf}): ${historicalNote}` : ""}`,
        sources: [official.source_url], social: [] as string[], official };
    });
    const rows = [...officialRows, ...priorRows.filter((row) => !officialAvailabilityFor(row.player, row.teamSlug))];
    const filtered = teamFilter ? rows.filter((row) => row.teamSlug === teamFilter) : rows;
    return filtered.sort(
      (a, b) => (a.teamSlug ?? "").localeCompare(b.teamSlug ?? "") || a.player.localeCompare(b.player),
    );
  }, [baseWatch, teamFilter]);

  const researchLive = injuryResearch.watch.length > 0 || injuryResearch.ledger.length > 0;
  // The date of the old editorial file must not validate itself through the
  // equally old scoreboard reference date. Official game reports stay separate.
  const researchStale =
    researchLive && editorialResearchIsHistorical(injuryResearch.asOf, Date.now());

  return (
    <div className="db-page inj-page">
      <DataBoardHero
        eyebrow="Injury desk · Verified weekly"
        title="The injury report, on the record."
        description={`Dated ${injuryResearch.week ? `Week ${injuryResearch.week}` : "weekly"} reporting, quarterback context and long-term injury updates, alongside clearly separate official game history. Missing players and teams are unknown; this is not a complete college-football injury list.`}
      />
      <DataBoardSummary
        label="Injury desk summary"
        caption={`${INJURY_METHOD.schedule} ESPN build snapshot date: ${espnInjuriesAsOf ?? "unknown"}. Supplemental IR source date: ${liveAsOf ?? "unknown"}.`}
        items={[
          { label: "Long-term ledger", value: ledgerRows.length, emphasis: true },
          { label: "Tracked game designations", value: officialAvailability?.entries.length ?? 0 },
          { label: "Research entries", value: injuryResearch.ledger.length + injuryResearch.watch.length + injuryResearch.contextNotes.length },
          { label: "Research as of", value: injuryResearch.asOf ?? "Not published" },
          { label: "Teams covered", value: new Set([...ledgerRows.map(row => row.teamSlug), ...watchRows.map(row => row.teamSlug), ...injuryResearch.watch.filter(row => !teamFilter || row.teamSlug === teamFilter).map(row => row.teamSlug), ...injuryResearch.contextNotes.filter(row => !teamFilter || row.team_slug === teamFilter).map(row => row.team_slug)].filter(Boolean)).size },
        ]}
      />

      {injuryResearch.coverageNote ? (
        <p className="apex-container inj-stale-banner" role="status">{injuryResearch.coverageNote}</p>
      ) : null}

      {verifiedRefresh?.availability_review ? (
        <div className="apex-container inj-stale-banner" role="status">
          <strong>{verifiedRefresh.availability_review.scope} · {verifiedRefresh.availability_review.checked_at.slice(0, 10)}.</strong>{" "}
          {verifiedRefresh.availability_review.note}
        </div>
      ) : null}

      {researchStale ? (
        <div className="apex-container inj-stale-banner" role="status">
          <strong>
            Historical editorial notes: {injuryResearch.asOf}.
          </strong>{" "}
          Official designations below are dated to their specific game and take precedence over older notes.
          Earlier editorial notes are retained as history, not a fresh availability assessment.
        </div>
      ) : null}

      <section className="apex-container db-section" aria-labelledby="inj-ledger-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">LONG-TERM LEDGER · IR OR 3+ WEEKS OUT</span>
            <h2 id="inj-ledger-title">Out for the long haul</h2>
          </div>
          <div className="db-filters">
            <label className="sr-only" htmlFor="inj-team-filter">
              Filter by team
            </label>
            <select
              id="inj-team-filter"
              value={teamFilter}
              onChange={(event) => setTeamFilter(event.target.value)}
              className="inj-team-select"
            >
              <option value="">All teams</option>
              {teams.map((team) => (
                <option key={team.slug} value={team.slug}>
                  {team.shortName}
                </option>
              ))}
            </select>
          </div>
        </div>
        {ledgerRows.length ? (
          <section className="db-table-wrap" tabIndex={0} aria-label="Scrollable injury report table">
            <table className="db-table inj-table">
              <thead>
                <tr>
                  <th scope="col">Player</th>
                  <th scope="col">Team</th>
                  <th scope="col">Pos</th>
                  <th scope="col">Status</th>
                  <th scope="col">Weeks out</th>
                  <th scope="col">Detail</th>
                  <th scope="col">Sources</th>
                </tr>
              </thead>
              <tbody>
                {ledgerRows.slice(0, 400).map((row) => {
                  const team = row.teamSlug ? teamBySlug.get(row.teamSlug) : undefined;
                  return (
                    <tr key={`${row.player}-${row.teamSlug}-${row.status}`}>
                      <td>
                        <strong>{row.player}</strong>
                        {row.confidence ? <small className="inj-conf"> · {row.confidence} confidence</small> : null}
                      </td>
                      <td>{team?.shortName ?? row.teamSlug ?? "—"}</td>
                      <td>{row.position ?? "—"}</td>
                      <td>
                        <StatusPill status={row.status} />
                        <small className="inj-conf">Editorial long-term category · source {row.sourceAsOf ?? "unknown"}</small>
                      </td>
                      <td>{row.weeksOut != null ? `${row.weeksOut}+` : "See report"}</td>
                      <td className="inj-detail">
                        {row.detail ?? row.injury ?? "Not published"}
                        {officialAvailabilityFor(row.player, row.teamSlug) ? <p>{officialAvailabilityNote(officialAvailabilityFor(row.player, row.teamSlug)!)}</p> : null}
                      </td>
                      <td>
                        {row.sources.length ? (
                          <a href={row.sources[0]} target="_blank" rel="noopener noreferrer">
                            Source
                          </a>
                        ) : (
                          <span className="inj-src-espn">ESPN</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ) : (
          <p className="db-empty">No long-term injuries published{teamFilter ? " for this team" : ""}.</p>
        )}
      </section>

      <section className="apex-container db-section" aria-labelledby="inj-current-title">
        <div className="section-heading"><div><span className="eyebrow">WEEK {injuryResearch.week} · DATED REPORTING</span><h2 id="inj-current-title">Current injury and quarterback updates</h2></div></div>
        <p className="inj-watch-note">Each status is attributed to its dated source. Official game designations are labeled explicitly; other reporting does not establish clearance. No practice participation or return date is inferred.</p>
        <div className="xy-primer-grid">
          {injuryResearch.watch.filter(row => !teamFilter || row.teamSlug === teamFilter).map(row => <article className="xy-primer-card" key={`${row.player}-${row.teamSlug}`}>
            <span className="db-position-tag">{teamBySlug.get(row.teamSlug)?.shortName ?? row.teamSlug} · {row.position}</span>
            <h3>{row.player}</h3>
            <p><strong>{row.reportedStatus ?? "Not graded"}</strong> · {row.injury ?? "Not disclosed"}</p>
            <p>Source date {row.sourceAsOf ?? "unknown"} · {row.confidence ?? "ungraded"} sourcing confidence</p>
            <p>{row.note}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>{row.sources.map((url, index) => <a href={url} key={url} target="_blank" rel="noopener noreferrer">Source {index + 1}</a>)}</div>
          </article>)}
          {injuryResearch.contextNotes.filter(row => !teamFilter || row.team_slug === teamFilter).map(row => <article className="xy-primer-card" key={`${row.player}-${row.team_slug}`}>
            <span className="db-position-tag">QUARTERBACK CONTEXT · {teamBySlug.get(row.team_slug)?.shortName ?? row.team_slug}</span>
            <h3>{row.player}</h3><p><strong>{row.title}</strong></p><p>Source date {row.source_as_of}</p><p>{row.note}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>{row.sources.map((url, index) => <a href={url} key={url} target="_blank" rel="noopener noreferrer">Source {index + 1}</a>)}</div>
          </article>)}
        </div>
      </section>

      <section className="apex-container db-section" aria-labelledby="inj-watch-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">GAME AVAILABILITY · DATED OFFICIAL DESIGNATIONS</span>
            <h2 id="inj-watch-title">Historical official game availability</h2>
          </div>
        </div>
        <p className="inj-watch-note">{officialAvailability?.scope} {officialAvailability?.note}</p>
        {watchRows.length ? (
          <details className="inj-watch-details" open={!researchStale && injuryResearch.watch.length === 0}>
            <summary>
              {`Tracked availability table — ${watchRows.length} rows; official snapshot ${officialAvailability?.as_of ?? "not published"}` }
            </summary>
          <section className="db-table-wrap" tabIndex={0} aria-label="Scrollable injury report table">
            <table className="db-table inj-table inj-table--watch">
              <thead>
                <tr>
                  <th scope="col">Player</th>
                  <th scope="col">Team</th>
                  <th scope="col">Pos</th>
                  <th scope="col">Wed</th>
                  <th scope="col">Thu</th>
                  <th scope="col">Fri</th>
                  <th scope="col">Sat</th>
                  <th scope="col">Game designation / older likelihood</th>
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {watchRows.slice(0, 300).map((row) => {
                  const team = row.teamSlug ? teamBySlug.get(row.teamSlug) : undefined;
                  const practice = row.practice;
                  return (
                    <tr key={`${row.player}-${row.teamSlug}-watch`}>
                      <td>
                        <strong>{row.player}</strong>
                        {row.injury ? <small className="inj-conf"> · {row.injury}</small> : null}
                      </td>
                      <td>{team?.shortName ?? row.teamSlug ?? "—"}</td>
                      <td>{row.position ?? "—"}</td>
                      <td><PracticeCell status={practice ? practice.wed : null} /></td>
                      <td><PracticeCell status={practice ? practice.thu : null} /></td>
                      <td><PracticeCell status={practice ? practice.fri : null} /></td>
                      <td><PracticeCell status={practice ? practice.sat : null} /></td>
                      <td>
                        {row.official ? <><span className="inj-pill">{row.official.status}</span><small className="inj-conf">Official · {row.official.game_date}</small></> : <><LikelihoodPill likelihood={row.likelihood} confidence={row.confidence} /><small className="inj-conf">Historical · {injuryResearch.asOf}</small></>}
                      </td>
                      <td className="inj-detail">
                        {row.note ?? "Not published"}
                        {row.sources.length || row.social.length ? (
                          <>
                            {" "}
                            <a href={(row.sources[0] ?? row.social[0]) as string} target="_blank" rel="noopener noreferrer">
                              Source
                            </a>
                          </>
                        ) : row.kind === "espn" ? (
                          <>
                            {" "}
                            <span className="inj-src-espn">ESPN</span>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
          </details>
        ) : (
          <p className="db-empty">No week-to-week entries published{teamFilter ? " for this team" : ""}.</p>
        )}
      </section>

      <section className="apex-container db-section" aria-labelledby="inj-method-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">METHOD</span>
            <h2 id="inj-method-title">
              <ShieldCheck size={16} aria-hidden="true" /> How this desk works
            </h2>
          </div>
        </div>
        <div className="xy-primer-grid">
          <article className="xy-primer-card">
            <span className="db-position-tag">LEDGER</span>
            <h3>Long-term means long-term</h3>
            <p>{INJURY_METHOD.ledger}</p>
          </article>
          <article className="xy-primer-card">
            <span className="db-position-tag">WATCH</span>
            <h3>Participation first</h3>
            <p>{INJURY_METHOD.watch}</p>
          </article>
          <article className="xy-primer-card">
            <span className="db-position-tag">SOURCES</span>
            <h3>Reporting with attribution</h3>
            <p>{INJURY_METHOD.sentiment}</p>
          </article>
        </div>
        <p className="apex-data-note">
          Public, published information only — no medical speculation beyond what teams and reporters have stated.
          Corrections follow the <a href="/corrections">site-wide policy</a>.
        </p>
      </section>
    </div>
  );
}
