/**
 * Feature dashboards: No Names, Heisman Watch, NIL Watch, AI Panel.
 * All use the broadcast design system (apex-* classes).
 */
import { useMemo, useState } from "react";
import { Trophy, Star, GraduationCap, Brain, Users, TrendingUp, ShieldAlert, ExternalLink } from "lucide-react";
import { noNames, noNamesByPosition, noNamesTeamCounts, type NoNamePlayer } from "@/lib/no-names";
import { teams, getTeamBySlug } from "@/lib/cfb-dataset";
import {
  heismanBoard,
  heismanWatch,
  nilWatch,
  athleteHighlight,
  panelBrief,
  formatValuation,
  type HeismanContender,
  type HighlightEntry,
} from "@/lib/awards-watch";

/* ================================================================ No Names */

export function NoNamesPage() {
  const [position, setPosition] = useState("All");
  const [query, setQuery] = useState("");
  const positions = ["All", ...noNamesByPosition().slice(0, 12).map((p) => p.position)];
  const topTeams = noNamesTeamCounts().slice(0, 8);
  const posBreakdown = noNamesByPosition().slice(0, 8);

  const filtered = useMemo(() => {
    let rows = noNames;
    if (position !== "All") rows = rows.filter((p) => p.position === position);
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter((p) => p.player.toLowerCase().includes(q) || p.team.includes(q));
    }
    return rows.slice(0, 200);
  }, [position, query]);

  return (
    <div className="apex-home" style={{ paddingTop: 32 }}>
      <div className="apex-container">
        <div className="apex-home-intro">
          <div>
            <span className="apex-eyebrow">THE BATTLE OF THE NO NAMES</span>
            <h1>Unrated. Under-recruited. Overdelivering.</h1>
            <p>Tracking every unrated and 2-star recruit on FBS rosters. At season's end, one player lifts the Breakout Star Award.</p>
          </div>
          <span className="apex-season-label"><span /><span className="apex-season-word">2026</span> SEASON</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 28 }}>
          <StatCard icon={<Users size={20} />} label="Qualifying players" value={noNames.length.toLocaleString()} />
          <StatCard icon={<Trophy size={20} />} label="Programs with no-names" value={noNamesTeamCounts().length.toString()} />
          <StatCard icon={<Star size={20} />} label="Highest rated qualifier" value="2-star" />
          <StatCard icon={<TrendingUp size={20} />} label="Award" value="Breakout Star" gold />
        </div>

        <div className="apex-lane">
          <div className="apex-lane-heading">
            <div>
              <span className="apex-eyebrow">BY THE NUMBERS</span>
              <h2>Where the no-names are</h2>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div className="apex-portal-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
              {topTeams.map(({ team, count }) => {
                const t = getTeamBySlug(team);
                return (
                  <div key={team} className="apex-portal-card" style={{ padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{t?.shortName ?? team}</span>
                      <b style={{ color: "var(--accent)", fontSize: 20, fontFamily: "var(--display-family)" }}>{count}</b>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="apex-rating-strip" style={{ flexWrap: "wrap" }}>
              {posBreakdown.map(({ position: pos, count }) => (
                <div key={pos} className="apex-rating-item" style={{ minWidth: 120, padding: "12px 16px" }}>
                  <div>
                    <strong style={{ fontSize: 20 }}>{count}</strong>
                    <small>{pos}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="apex-lane">
          <div className="apex-lane-heading">
            <div>
              <span className="apex-eyebrow">QUALIFYING PLAYERS</span>
              <h2>Browse the pool</h2>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <select value={position} onChange={(e) => setPosition(e.target.value)} style={{ background: "var(--card)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: 14 }}>
              {positions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search player or team…" style={{ background: "var(--card)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: 14, flex: 1, minWidth: 200 }} />
            <span style={{ color: "var(--muted-foreground)", fontSize: 14, alignSelf: "center" }}>{filtered.length} shown</span>
          </div>
          <div style={{ maxHeight: 400, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 12 }}>
            {filtered.map((p, i) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: i < filtered.length - 1 ? "1px solid color-mix(in srgb, var(--border) 60%, transparent)" : "none" }}>
                <span style={{ width: 36, textAlign: "center", fontFamily: "var(--display-family)", fontSize: 18, color: "var(--muted-foreground)" }}>{p.jersey ?? "–"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.player}</div>
                  <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                    {p.position ?? "?"} · {getTeamBySlug(p.team)?.shortName ?? p.team} {p.class ? `· ${p.class}` : ""}
                  </div>
                </div>
                <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 6, background: p.stars === 2 ? "rgba(245,185,66,.12)" : "var(--secondary)", color: p.stars === 2 ? "var(--primary)" : "var(--muted-foreground)", fontWeight: 600 }}>
                  {p.stars === 2 ? "2★" : "Unrated"}
                </span>
              </div>
            ))}
          </div>
          <p style={{ marginTop: 12, fontSize: 13, color: "var(--muted-foreground)" }}>
            Performance tracking, snap counts, and breakout candidates populate as the season progresses. The Breakout Star Award is presented after the final week.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ============================================================== Heisman Watch */

function OddsChips({ contender }: { contender: HeismanContender }) {
  if (!contender.odds_as_reported || contender.odds_as_reported.length === 0) {
    return <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>No verified price in this snapshot</span>;
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {contender.odds_as_reported.map((odds) => (
        <span
          key={`${contender.player}-${odds.outlet}`}
          style={{
            fontSize: 12,
            fontWeight: 600,
            fontFamily: "var(--display-family)",
            padding: "3px 9px",
            borderRadius: 999,
            border: "1px solid color-mix(in srgb, var(--primary) 35%, transparent)",
            color: "var(--primary)",
            background: "color-mix(in srgb, var(--primary) 8%, transparent)",
          }}
        >
          {odds.outlet} {odds.value}
        </span>
      ))}
    </div>
  );
}

export function HeismanPage({ cleanMode = true, onModeRequest }: { cleanMode?: boolean; onModeRequest?: () => void }) {
  const board = cleanMode ? heismanWatch.contenders : heismanBoard();
  const hasBoard = board.length > 0;

  return (
    <div className="apex-home" style={{ paddingTop: 32 }}>
      <div className="apex-container">
        <div className="apex-home-intro">
          <div>
            <span className="apex-eyebrow">HEISMAN TROPHY WATCH</span>
            <h1>The most outstanding player in college football</h1>
            <p>
              {hasBoard
                ? `Week ${heismanWatch.week ?? 2} watch list — ${board.length} selected contenders with verified Week 7 box scores and dated sources. Reviewed ${heismanWatch.as_of ?? ""}. Cases for and against are editorial analysis.`
                : heismanWatch.notes ?? "The current Heisman watch is pending source verification."}
            </p>
          </div>
          <span className="apex-season-label"><span /><span className="apex-season-word">2026</span> SEASON</span>
        </div>

        {hasBoard ? (
          <>
            <div className="apex-lane">
              <div className="apex-lane-heading">
                <div>
                  <span className="apex-eyebrow">{cleanMode ? "THE BOARD · EDITORIAL WATCH ORDER" : "THE BOARD · ORDERED BY SHORTEST REPORTED ODDS"}</span>
                  <h2>{board.length} contenders</h2>
                </div>
              </div>
              {cleanMode ? <p>Clean Mode hides market prices. <button type="button" className="button button--ghost" onClick={onModeRequest}>Review Analysis Mode disclosure</button></p> : <p>Reported prices dated {heismanWatch.odds_as_of ?? "unknown"}; reviewed {heismanWatch.checked_at ?? "unknown"}. <a href={heismanWatch.odds_source ?? undefined} target="_blank" rel="noopener noreferrer">Market source</a>. Named books as carried by Betfirm; no live-price claim.</p>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(420px, 100%), 1fr))", gap: 14 }}>
                {board.map((contender, index) => {
                  const team = getTeamBySlug(contender.team_slug);
                  return (
                    <article
                      key={contender.player}
                      className="apex-portal-card"
                      style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10, borderLeft: `3px solid ${team?.color ?? "var(--border)"}` }}
                    >
                      <header style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                        <div>
                          <span style={{ fontFamily: "var(--display-family)", fontSize: 13, fontWeight: 700, color: "var(--muted-foreground)" }}>
                            {String(index + 1).padStart(2, "0")}
                          </span>{" "}
                          <h3 style={{ display: "inline", fontSize: 18, fontWeight: 800 }}>{contender.player}</h3>
                          <div style={{ marginTop: 4, fontSize: 13, color: "var(--muted-foreground)" }}>
                            {team ? (
                              <a href={`/teams/${team.slug}`} style={{ color: "var(--muted-foreground)", textDecoration: "none" }}>
                                {team.name}
                              </a>
                            ) : (
                              contender.team_slug
                            )} · {contender.position}{contender.class ? ` · ${contender.class}` : ""}
                          </div>
                        </div>
                        <span
                          role="img"
                          aria-label={`${contender.confidence} confidence`}
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            padding: "3px 8px",
                            borderRadius: 999,
                            color:
                              contender.confidence === "high"
                                ? "var(--green)"
                                : contender.confidence === "medium"
                                  ? "var(--gold)"
                                  : "var(--red)",
                            border: "1px solid currentColor",
                          }}
                        >
                          {contender.confidence} conf
                        </span>
                      </header>

                      <p style={{ fontSize: 13, fontFamily: "var(--display-family)", color: "var(--foreground)", margin: 0 }}>{contender.stat_line}</p>

                      {!cleanMode ? <OddsChips contender={contender} /> : null}

                      <div style={{ display: "grid", gap: 6, fontSize: 13, lineHeight: 1.5 }}>
                        <p style={{ margin: 0 }}><strong style={{ color: "var(--green)" }}>Case for:</strong> <span style={{ color: "var(--muted-foreground)" }}>{contender.case_for}</span></p>
                        <p style={{ margin: 0 }}><strong style={{ color: "var(--red)" }}>Case against:</strong> <span style={{ color: "var(--muted-foreground)" }}>{contender.case_against}</span></p>
                        <p style={{ margin: 0 }}><strong>Next test:</strong> <span style={{ color: "var(--muted-foreground)" }}>{contender.next_test}</span></p>
                      </div>

                      <footer style={{ marginTop: "auto", display: "flex", flexWrap: "wrap", gap: 10, fontSize: 12, color: "var(--muted-foreground)" }}>
                        <a href={contender.sources[0]} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          Box score <ExternalLink size={11} aria-hidden />
                        </a>
                        {contender.sources[1] ? (
                          <a href={contender.sources[1]} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            Market compilation <ExternalLink size={11} aria-hidden />
                          </a>
                        ) : null}
                        {contender.sources[2] ? <a href={contender.sources[2]} target="_blank" rel="noopener noreferrer">Watch selection</a> : null}
                      </footer>
                    </article>
                  );
                })}
              </div>
              {heismanWatch.notes ? (
                <p style={{ marginTop: 16, fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.6 }}>{heismanWatch.notes}</p>
              ) : null}
            </div>

            <div className="apex-lane">
              <div className="apex-lane-heading">
                <div>
                  <span className="apex-eyebrow">METHODOLOGY</span>
                  <h2>How this board is built</h2>
                </div>
              </div>
              <p style={{ fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.6, marginTop: 0 }}>
                ESPN box scores establish the displayed Week 7 statistics. USA TODAY&apos;s October 19 watch informs the
                selected field; cases and counterweights are our editorial interpretation. This board has no weighted
                scoring model, vote projection or measured public-sentiment input. Reported prices come from one
                market compilation, so confidence is capped at medium even when multiple book labels appear.
              </p>
            </div>
          </>
        ) : (
          <div className="apex-lane" style={{ textAlign: "center", padding: "48px 24px", border: "1px solid var(--border)", borderRadius: 16, background: "var(--card)" }}>
            <Trophy size={48} style={{ color: "var(--primary)", marginBottom: 16 }} aria-hidden />
            <h2 style={{ fontSize: 28, textTransform: "uppercase", marginBottom: 8 }}>Watch List Pending</h2>
            <p style={{ color: "var(--muted-foreground)", maxWidth: 480, margin: "0 auto" }}>
              {heismanWatch.notes ?? "The current watch list publishes after its player statistics and source dates have been verified."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ==================================================== Athlete Highlight */

function HighlightCard({
  entry,
  rank,
  emphasis,
}: {
  entry: HighlightEntry;
  rank?: string;
  emphasis?: boolean;
}) {
  const team = getTeamBySlug(entry.team_slug);
  const opponent = getTeamBySlug(entry.opponent_slug);
  return (
    <article
      className="apex-portal-card"
      style={{
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        borderLeft: `3px solid ${team?.color ?? "var(--border)"}`,
        ...(emphasis ? { background: "linear-gradient(135deg, color-mix(in srgb, var(--primary) 8%, var(--card)), var(--card))", border: "1px solid color-mix(in srgb, var(--primary) 35%, var(--border))" } : {}),
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {entry.photo?.url || team?.logo ? (
            <img
              src={entry.photo?.url ?? team?.logo}
              alt={entry.photo?.alt ?? `${team?.name ?? entry.team_slug} mark`}
              width={56}
              height={56}
              loading="lazy"
              style={{ borderRadius: 999, objectFit: "cover", background: "var(--muted)", boxShadow: `0 0 0 2px ${team?.color ?? "var(--border)"}` }}
            />
          ) : null}
          <div>
            {rank ? (
              <span style={{ fontFamily: "var(--display-family)", fontSize: 12, fontWeight: 700, letterSpacing: 2, color: "var(--primary)" }}>{rank}</span>
            ) : null}
            <h3 style={{ fontSize: emphasis ? 24 : 18, fontWeight: 800, margin: rank ? "4px 0 0" : 0 }}>{entry.player}</h3>
            <div style={{ marginTop: 4, fontSize: 13, color: "var(--muted-foreground)" }}>
              {team ? <a href={`/teams/${team.slug}`} style={{ color: "inherit", textDecoration: "none" }}>{team.name}</a> : entry.team_slug}
              {" · "}
              {entry.position}
              {entry.class ? ` · ${entry.class}` : ""}
          </div>
        </div>
        </div>
        {emphasis ? <Star size={20} style={{ color: "var(--primary)" }} aria-hidden /> : null}
      </header>
      <p style={{ margin: 0, fontSize: 13.5, fontFamily: "var(--display-family)" }}>{entry.stat_line}</p>
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground)" }}>
        {entry.result} — vs. {opponent?.shortName ?? entry.opponent_slug}
      </p>
      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>{entry.why}</p>
      <footer style={{ marginTop: "auto", display: "flex", gap: 12, fontSize: 12, flexWrap: "wrap" }}>
        {entry.video_url ? (
          <a href={entry.video_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--primary)" }}>
            Licensed highlights <ExternalLink size={11} aria-hidden />
          </a>
        ) : null}
        {entry.sources?.[0] ? (
          <a href={entry.sources[0]} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--muted-foreground)" }}>
            Source <ExternalLink size={11} aria-hidden />
          </a>
        ) : null}
      </footer>
    </article>
  );
}

export function HighlightPage() {
  const hasHighlight = athleteHighlight.athlete_of_the_week !== null;
  const winner = athleteHighlight.athlete_of_the_week;

  return (
    <div className="apex-home" style={{ paddingTop: 32 }}>
      <div className="apex-container">
        <div className="apex-home-intro">
          <div>
            <span className="apex-eyebrow">ATHLETE HIGHLIGHT OF THE WEEK</span>
            <h1>One week. One player. The tape decides.</h1>
            <p>
              {hasHighlight
                ? `Week ${athleteHighlight.week} — compiled from a sourced research pass, cross-checked against the box scores of record (${athleteHighlight.window ?? ""}). Selections weight dominance versus real opponents and the plays that decided consequential games.`
                : "The first highlight publishes after Week 1 concludes. Selections are compiled from verified box scores and licensed highlight footage only."}
            </p>
          </div>
          <span className="apex-season-label"><span /><span className="apex-season-word">2026</span> SEASON</span>
        </div>

        {hasHighlight && winner ? (
          <>
            <div className="apex-lane">
              <div className="apex-lane-heading">
                <div>
                  <span className="apex-eyebrow">WEEK {athleteHighlight.week} · ATHLETE OF THE WEEK</span>
                  <h2>The pick</h2>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(480px, 100%), 1fr))", gap: 14 }}>
                <HighlightCard entry={winner} rank={`WEEK ${athleteHighlight.week} CHAMPION`} emphasis />
              </div>
            </div>

            {athleteHighlight.spotlights.length ? (
              <div className="apex-lane">
                <div className="apex-lane-heading">
                  <div>
                    <span className="apex-eyebrow">WEEK {athleteHighlight.week} · SPOTLIGHTS</span>
                    <h2>The week&apos;s other game-wreckers</h2>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(420px, 100%), 1fr))", gap: 14 }}>
                  {athleteHighlight.spotlights.map((entry) => (
                    <HighlightCard key={entry.player} entry={entry} rank="SPOTLIGHT" />
                  ))}
                </div>
              </div>
            ) : null}

            <div className="apex-lane">
              <div className="apex-lane-heading">
                <div>
                  <span className="apex-eyebrow">RUNNERS-UP · IN ORDER</span>
                  <h2>Right behind him</h2>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(400px, 100%), 1fr))", gap: 14 }}>
                {athleteHighlight.runners_up.map((entry, index) => (
                  <HighlightCard key={entry.player} entry={entry} rank={`No. ${index + 2}`} />
                ))}
              </div>
            </div>

            {athleteHighlight.honorable_mentions.length ? (
              <div className="apex-lane">
                <div className="apex-lane-heading">
                  <div>
                    <span className="apex-eyebrow">HONORABLE MENTIONS</span>
                    <h2>Also on the ballot</h2>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))", gap: 12 }}>
                  {athleteHighlight.honorable_mentions.map((entry) => (
                    <article key={entry.player} className="apex-portal-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                      <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{entry.player}</h3>
                      <div style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>
                        {getTeamBySlug(entry.team_slug)?.shortName ?? entry.team_slug} · {entry.position} · {entry.result}
                      </div>
                      <p style={{ margin: 0, fontSize: 12.5, fontFamily: "var(--display-family)" }}>{entry.stat_line}</p>
                      <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.5 }}>{entry.why}</p>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {athleteHighlight.criteria_note ? (
              <p style={{ fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.7 }}>
                <strong>How the pick was made:</strong> {athleteHighlight.criteria_note}
              </p>
            ) : null}
            {athleteHighlight.verification_note ? (
              <p style={{ fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.7 }}>
                <strong>Accuracy check:</strong> {athleteHighlight.verification_note}
              </p>
            ) : null}
          </>
        ) : (
          <div className="apex-lane" style={{ textAlign: "center", padding: "48px 24px", border: "1px solid var(--border)", borderRadius: 16, background: "var(--card)" }}>
            <Trophy size={48} style={{ color: "var(--primary)", marginBottom: 16 }} aria-hidden />
            <h2 style={{ fontSize: 28, textTransform: "uppercase", marginBottom: 8 }}>First Highlight Publishes After Week 1</h2>
            <p style={{ color: "var(--muted-foreground)", maxWidth: 480, margin: "0 auto" }}>
              One winner, four runners-up, and the criteria that picked them — compiled from verified box scores, never a vibe.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================ NIL Watch */

export function NILWatchPage() {
  const hasDeals = nilWatch.week_deals.length > 0;
  const hasValuations = nilWatch.watch_valuations.length > 0;

  return (
    <div className="apex-home" style={{ paddingTop: 32 }}>
      <div className="apex-container">
        <div className="apex-home-intro">
          <div>
            <span className="apex-eyebrow">NIL DEAL TRACKER</span>
            <h1>Verified deals, sourced and linked</h1>
            <p>
              {hasDeals
                ? `Week ${nilWatch.week ?? ""} ledger — ${nilWatch.week_deals.length} verified developments from ${nilWatch.window ?? "the past week"}, every entry attributed. No rumors, no estimates, no speculation.`
                : "Every NIL deal in our tracker is verified by a news source. No rumors, no estimates, no speculation."}
            </p>
          </div>
          <span className="apex-season-label"><span /><span className="apex-season-word">2026</span> SEASON</span>
        </div>

        {hasDeals ? (
            <div className="apex-lane">
              <div className="apex-lane-heading">
                <div>
                  <span className="apex-eyebrow">THE WEEK IN NIL · {nilWatch.window ?? ""}</span>
                  <h2>Verified deal ledger</h2>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(400px, 100%), 1fr))", gap: 14 }}>
                {nilWatch.week_deals.map((deal) => {
                  const team = getTeamBySlug(deal.team_slug);
                  return (
                    <article
                      key={`${deal.player}-${deal.parties}`}
                      className="apex-portal-card"
                      style={{ padding: 18, display: "flex", flexDirection: "column", gap: 8, borderLeft: `3px solid ${team?.color ?? "var(--border)"}` }}
                    >
                      <header style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                        <div>
                          <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{deal.player}</h3>
                          <div style={{ marginTop: 3, fontSize: 12.5, color: "var(--muted-foreground)" }}>
                            {team ? (
                              <a href={`/teams/${team.slug}`} style={{ color: "inherit", textDecoration: "none" }}>{team.name}</a>
                            ) : (
                              deal.team_slug
                            )}
                            {deal.position ? ` · ${deal.position}` : ""}
                          </div>
                        </div>
                        <span
                          role="img"
                          aria-label={`${deal.confidence} confidence`}
                          style={{
                            fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                            padding: "3px 8px", borderRadius: 999,
                            color: deal.confidence === "high" ? "var(--green)" : deal.confidence === "medium" ? "var(--gold)" : "var(--red)",
                            border: "1px solid currentColor", whiteSpace: "nowrap",
                          }}
                        >
                          {deal.confidence} conf
                        </span>
                      </header>
                      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}>{deal.deal_summary}</p>
                      <div style={{ fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
                        <div><strong>Parties:</strong> {deal.parties}</div>
                        <div>
                          <strong>Announced value:</strong>{" "}
                          <span style={{ fontFamily: "var(--display-family)", color: deal.announced_value != null ? "var(--primary)" : "var(--muted-foreground)" }}>
                            {deal.announced_value != null ? formatValuation(deal.announced_value) : "Not disclosed"}
                          </span>
                          {deal.announced_value != null ? " (as reported)" : " — we never estimate"}
                        </div>
                        <div><strong>Announced by:</strong> {deal.announced_by}</div>
                      </div>
                      <footer style={{ marginTop: "auto", display: "flex", gap: 10, fontSize: 12 }}>
                        {deal.sources.map((source, index) => (
                          <a key={source} href={source} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--muted-foreground)" }}>
                            {index === 0 ? "Source" : "Second source"} <ExternalLink size={11} aria-hidden />
                          </a>
                        ))}
                      </footer>
                    </article>
                  );
                })}
              </div>
            </div>
            ) : nilWatch.as_of ? (
              <div className="apex-lane" style={{ textAlign: "center", padding: "40px 24px", border: "1px solid var(--border)", borderRadius: 16, background: "var(--card)" }}>
                <h2 style={{ fontSize: 22, textTransform: "uppercase", marginBottom: 8 }}>Week {nilWatch.week}: no verified in-window deals</h2>
                <p style={{ color: "var(--muted-foreground)", maxWidth: 620, margin: "0 auto", lineHeight: 1.6 }}>
                  {nilWatch.notes ?? "No deals met the verification bar inside this window."} Window: {nilWatch.window ?? ""}. The ledger ships empty rather than guessing — policy and valuation coverage below remain live.
                </p>
              </div>
            ) : null}

            {nilWatch.policy_notes.length ? (
              <div className="apex-lane">
                <div className="apex-lane-heading">
                  <div>
                    <span className="apex-eyebrow">POLICY & LANDSCAPE</span>
                    <h2>The rules around the money</h2>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(360px, 100%), 1fr))", gap: 14 }}>
                  {nilWatch.policy_notes.map((note) => (
                    <article key={note.title} className="apex-portal-card" style={{ padding: 18 }}>
                      <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 8px" }}>{note.title}</h3>
                      <p style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.6 }}>{note.body}</p>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {hasValuations ? (
              <div className="apex-lane">
                <div className="apex-lane-heading">
                  <div>
                    <span className="apex-eyebrow">VALUATION BOARD · AS REPORTED BY ON3 (DEAL-BASED MODEL)</span>
                    <h2>Most-covered players, priced by the market</h2>
                  </div>
                </div>
                <div className="db-table-wrap db-desktop-data-table">
                  <table className="db-table">
                    <thead>
                      <tr>
                        <th scope="col">#</th>
                        <th scope="col">Player</th>
                        <th scope="col">Team</th>
                        <th scope="col">Reported valuation</th>
                        <th scope="col">Reported by</th>
                        <th scope="col">As of</th>
                        <th scope="col">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nilWatch.watch_valuations.map((entry, index) => {
                        const team = getTeamBySlug(entry.team_slug);
                        return (
                          <tr key={`${entry.player}-valuation`}>
                            <td>{index + 1}</td>
                            <td><strong>{entry.player}</strong></td>
                            <td>{team?.shortName ?? entry.team_slug}</td>
                            <td style={{ fontFamily: "var(--display-family)", color: "var(--primary)" }}>
                              {formatValuation(entry.valuation.amount_reported)}
                            </td>
                            <td>{entry.valuation.reported_by}</td>
                            <td>{entry.valuation.reported_on}</td>
                            <td style={{ color: entry.confidence === "high" ? "var(--green)" : "var(--gold)" }}>{entry.confidence}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {nilWatch.valuation_methodology ? (
                  <p style={{ marginTop: 12, fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.6 }}>
                    {nilWatch.valuation_methodology}
                  </p>
                ) : null}
              </div>
            ) : null}

            {nilWatch.notes ? (
              <p style={{ fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.6 }}>{nilWatch.notes}</p>
            ) : null}
      </div>
    </div>
  );
}

/* ================================================================ AI Panel */

const AI_PANELISTS = [
  {
    name: "Frank Mitchell",
    alias: "The Bulwark",
    specialty: "Traditionalist · Trenches · Defense",
    color: "#C4B5FD",
    philosophy: "Football is won at the line of scrimmage. Everything else is noise.",
    background: "40 years covering the game. Former offensive line coach at two Power 4 programs. Believes the forward pass was a mistake the sport never corrected.",
    icon: "🛡️",
  },
  {
    name: "Quinn Vance",
    alias: "The Quant",
    specialty: "Analytics · Efficiency · SP+",
    color: "#67E8F9",
    philosophy: "Feel is just data you didn't write down. The numbers don't lie — people do.",
    background: "Former Wall Street quant who left finance for football. Lives by SP+, EPA, success rate, and PPA. Thinks the eye test is confirmation bias with confidence.",
    icon: "📊",
  },
  {
    name: "Sandra Okafor",
    alias: "The Scout",
    specialty: "Talent Evaluation · Traits · Development",
    color: "#FDA4AF",
    philosophy: "The numbers tell you what happened. They don't always tell you why, or what's coming next.",
    background: "15 years as a D1 scouting director. Evaluates through traits: arm strength, speed, frame, bend. Respects analytics but thinks they miss developmental context.",
    icon: "🔍",
  },
];

export function AIPanelPage() {
  return (
    <div className="apex-home" style={{ paddingTop: 32 }}>
      <div className="apex-container">
        <div className="apex-home-intro">
          <div>
            <span className="apex-eyebrow">THE PANEL · WEEKLY DEBATE</span>
            <h1>Three minds. One game. Zero agreement.</h1>
            <p>Three football analysts with conflicting philosophies break down the week's biggest games, make picks, and argue about it.</p>
          </div>
          <span className="apex-season-label"><span /><span className="apex-season-word">2026</span> SEASON</span>
        </div>

        {panelBrief.topics.length ? (
          <div className="apex-lane">
            <div className="apex-lane-heading">
              <div>
                <span className="apex-eyebrow">WEEK {panelBrief.week} DEBATE BRIEF · {panelBrief.as_of}</span>
                <h2>This week&apos;s arguments</h2>
              </div>
            </div>
            <div style={{ display: "grid", gap: 18 }}>
              {panelBrief.topics.map((topic, index) => (
                <article
                  key={topic.id}
                  className="apex-portal-card"
                  style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12 }}
                >
                  <header>
                    <span style={{ fontFamily: "var(--display-family)", fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: 2 }}>
                      DEBATE {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3 style={{ fontSize: 19, fontWeight: 800, margin: "6px 0 0", lineHeight: 1.4 }}>{topic.question}</h3>
                  </header>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: 12 }}>
                    <div style={{ padding: 14, borderRadius: 12, border: "1px solid color-mix(in srgb, #67E8F9 30%, transparent)", background: "color-mix(in srgb, #67E8F9 6%, transparent)" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#67E8F9", marginBottom: 8 }}>🛡️ The Bulwark — Traditionalist</div>
                      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{topic.traditionalist}</p>
                    </div>
                    <div style={{ padding: 14, borderRadius: 12, border: "1px solid color-mix(in srgb, var(--primary) 30%, transparent)", background: "color-mix(in srgb, var(--primary) 6%, transparent)" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--primary)", marginBottom: 8 }}>📊 The Quant — Analyst</div>
                      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{topic.analyst}</p>
                    </div>
                    <div style={{ padding: 14, borderRadius: 12, border: "1px solid color-mix(in srgb, #FDA4AF 30%, transparent)", background: "color-mix(in srgb, #FDA4AF 6%, transparent)" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#FDA4AF", marginBottom: 8 }}>🔍 The Scout — Talent Evaluator</div>
                      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{topic.evaluator}</p>
                    </div>
                  </div>
                  <div style={{ padding: 14, borderRadius: 12, border: "1px dashed var(--border)", display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <ShieldAlert size={16} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 2 }} aria-hidden />
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--accent)", marginBottom: 4 }}>What settles it</div>
                      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--muted-foreground)" }}>{topic.what_settles_it}</p>
                    </div>
                  </div>
                  <footer style={{ display: "flex", gap: 12, fontSize: 12, flexWrap: "wrap" }}>
                    {topic.sources.slice(0, 3).map((source) => (
                      <a key={source} href={source} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--muted-foreground)" }}>
                        Source <ExternalLink size={11} aria-hidden />
                      </a>
                    ))}
                  </footer>
                </article>
              ))}
            </div>
            {panelBrief.also_on_the_desk.length ? (
              <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: 12 }}>
                {panelBrief.also_on_the_desk.map((item) => (
                  <div key={item.question} style={{ padding: 14, borderRadius: 12, border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{item.question}</div>
                    <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.55 }}>{item.one_liner}</p>
                  </div>
                ))}
              </div>
            ) : null}
            {panelBrief.notes ? (
              <p style={{ marginTop: 14, fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.6 }}>{panelBrief.notes}</p>
            ) : null}
          </div>
        ) : (
          <div className="apex-lane" style={{ textAlign: "center", padding: "48px 24px", border: "1px solid var(--border)", borderRadius: 16, background: "var(--card)" }}>
            <Brain size={48} style={{ color: "var(--accent)", marginBottom: 16 }} aria-hidden />
            <h2 style={{ fontSize: 28, textTransform: "uppercase", marginBottom: 8 }}>First Debate Drops After Week 1 Results</h2>
            <p style={{ color: "var(--muted-foreground)", maxWidth: 480, margin: "0 auto" }}>
              The panel analyzes the AP Top 10 teams and the five biggest games each week, using real stats from our dataset.
              Each analyst produces independent picks and rebuttals from their own philosophy.
            </p>
          </div>
        )}

        <div className="apex-lane">
          <div className="apex-lane-heading">
            <div>
              <span className="apex-eyebrow">MEET THE PANEL</span>
              <h2>Three philosophies, zero overlap</h2>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr)), gap: 16" }}>
            {AI_PANELISTS.map((p) => (
              <div key={p.alias} style={{ padding: 24, border: `1px solid ${p.color}33`, borderRadius: 16, background: `linear-gradient(135deg, ${p.color}08, transparent)`, position: "relative" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }} aria-hidden>{p.icon}</div>
                <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: p.color, fontWeight: 600, marginBottom: 4 }}>{p.alias}</div>
                <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>{p.name}</h3>
                <p style={{ fontSize: 13, color: p.color, fontWeight: 600, marginBottom: 12 }}>{p.specialty}</p>
                <blockquote style={{ fontSize: 14, fontStyle: "italic", color: "var(--foreground)", borderLeft: `3px solid ${p.color}`, paddingLeft: 12, marginBottom: 12 }}>
                  "{p.philosophy}"
                </blockquote>
                <p style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.6 }}>{p.background}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="apex-lane">
          <div className="apex-lane-heading">
            <div>
              <span className="apex-eyebrow">HOW IT WORKS</span>
              <h2>Weekly format</h2>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
            {[
              { step: "01", title: "Game Selection", desc: "Five biggest games of the week, selected by stakes, rankings, and rivalry weight." },
              { step: "02", title: "Independent Analysis", desc: "Each analyst gets the same data package (stats, SP+, betting lines) and produces their own breakdown." },
              { step: "03", title: "Picks & Predictions", desc: "Each panelist picks winners with confidence levels and key matchups to watch." },
              { step: "04", title: "Cross-Examination", desc: "Each analyst responds to the others' picks, explaining where and why they disagree." },
            ].map((s) => (
              <div key={s.step} style={{ padding: 20, border: "1px solid var(--border)", borderRadius: 12, background: "var(--card)" }}>
                <div style={{ fontFamily: "var(--display-family)", fontSize: 32, fontWeight: 800, color: "color-mix(in srgb, var(--primary) 40%, var(--card))", marginBottom: 8 }}>{s.step}</div>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{s.title}</h3>
                <p style={{ fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.5 }}>{s.desc}</p>
              </div>
            ))}
          </div>
          <p style={{ marginTop: 16, fontSize: 13, color: "var(--muted-foreground)" }}>
            The panel consumes the same verified dataset that powers this site. Every stat cited in a debate links back to our sources. No fabricated analysis, ever.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ================================================================ Shared */

function StatCard({ icon, label, value, gold }: { icon: React.ReactNode; label: string; value: string; gold?: boolean }) {
  return (
    <div style={{ padding: 18, border: "1px solid var(--border)", borderRadius: 12, background: "var(--card)", display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 44, height: 44, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: gold ? "color-mix(in srgb, var(--primary) 15%, var(--card))" : "var(--secondary)", color: gold ? "var(--primary)" : "var(--muted-foreground)" }}>
        {icon}
      </div>
      <div>
        <div style={{ fontFamily: "var(--display-family)", fontSize: 24, fontWeight: 700, color: gold ? "var(--primary)" : "var(--foreground)" }}>{value}</div>
        <div style={{ fontSize: 12, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      </div>
    </div>
  );
}
