/**
 * Road to the Playoff — weekly resume audit (research prompt 10).
 *
 * Contenders are the realistic 12-team CFP field per the CFB Apex Composite
 * plus unbeaten non-power programs. Every record, rank, and score is sourced
 * (ESPN finals, post-week AP + Coaches polls, ESPN FPI remaining SOS);
 * tags and loss thresholds are analysis. Fail-closed until the Sunday
 * compile lands.
 */

import { playoffAudit, type PlayoffContender } from "@/lib/awards-watch";
import { getTeamBySlug } from "@/lib/cfb-dataset";

const TAG_LABEL: Record<string, string> = {
  controls_destiny: "Controls destiny",
  needs_help: "Needs help",
  win_out_or_out: "Win out or out",
};

function ContenderCard({ c }: { c: PlayoffContender }) {
  const team = getTeamBySlug(c.team_slug);
  return (
    <article
      className="apex-portal-card"
      style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8, borderLeft: `3px solid ${team?.color ?? "var(--border)"}` }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 800 }}>
            {team?.name ?? c.team_slug} <span style={{ color: "var(--muted-foreground)", fontWeight: 600 }}>{c.record ?? ""}</span>
          </h3>
          <div style={{ marginTop: 3, fontSize: 12.5, color: "var(--muted-foreground)" }}>
            Composite #{c.composite_rank ?? "—"} · {c.remaining_sos ?? "rem. SOS n/p"} ·{" "}
            {c.losses_that_end_case == null ? "At-large margin not projected" : c.losses_that_end_case === 0 ? "zero losses survivable" : `${c.losses_that_end_case} loss${c.losses_that_end_case === 1 ? "" : "es"} ends the case`}
          </div>
        </div>
        {c.tag ? (
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              padding: "3px 8px",
              borderRadius: 999,
              border: "1px solid color-mix(in srgb, var(--primary) 35%, transparent)",
              color: "var(--primary)",
              whiteSpace: "nowrap",
            }}
          >
            {TAG_LABEL[c.tag] ?? c.tag}
          </span>
        ) : null}
      </header>
      {c.resume_state ? <p style={{ fontSize: 13.5, lineHeight: 1.55 }}>{c.resume_state}</p> : null}
    </article>
  );
}

export function PlayoffAuditPage() {
  const has = playoffAudit.contenders.length > 0;
  const sl = playoffAudit.storylines;
  return (
    <div className="apex-home" style={{ paddingTop: 32 }}>
      <div className="apex-container">
        <div className="apex-home-intro">
          <div>
            <span className="apex-eyebrow">ROAD TO THE PLAYOFF</span>
            <h1>The weekly 12-team resume audit</h1>
            <p>
              {has
                ? `Week ${playoffAudit.week ?? "?"} resume check — ${playoffAudit.contenders.length} teams with verified records and an editorial AP/Coaches composite. Remaining schedule strength and at-large loss thresholds are not projected. Compiled ${playoffAudit.as_of ?? ""}. First CFP rankings: November 3.`
                : "The Sunday audit ranks the realistic 12-team field: record, composite rank, remaining SOS, and resume state with every number sourced. Publishes Sundays once Week 3 begins."}
            </p>
          </div>
          <span className="apex-season-label"><span /><span className="apex-season-word">2026</span> SEASON</span>
        </div>

        <p className="apex-data-note">The 2026 CFP has 12 teams: the ACC, Big Ten, Big 12 and SEC champions, the highest-ranked team from the other six FBS conferences, and seven at-large teams. Notre Dame qualifies if ranked in the final CFP top 12. <a href="https://collegefootballplayoff.com/news/2026/8/6/sc-aug-2627" target="_blank" rel="noopener noreferrer">Official CFP format and ranking dates</a>.</p>

        {has ? (
          <>
            {sl ? (
              <div className="apex-lane" style={{ marginBottom: 22 }}>
                <div className="apex-lane-heading">
                  <div>
                    <span className="apex-eyebrow">THE WEEK IN THREE LINES</span>
                    <h2>Storylines</h2>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(380px, 100%), 1fr))", gap: 12 }}>
                  {[
                    ["Mover", sl.mover],
                    ["Watch next week", sl.watch_next_week],
                    ["Weaker than record", sl.weaker_than_record],
                  ]
                    .filter(([, v]) => v)
                    .map(([label, text]) => (
                      <div key={String(label)} className="apex-portal-card" style={{ padding: 14 }}>
                        <span className="apex-eyebrow">{String(label).toUpperCase()}</span>
                        <p style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 6 }}>{String(text)}</p>
                      </div>
                    ))}
                </div>
              </div>
            ) : null}

            <div className="apex-lane">
              <div className="apex-lane-heading">
                <div>
                  <span className="apex-eyebrow">THE BOARD · ORDERED BY CFB APEX COMPOSITE</span>
                  <h2>{playoffAudit.contenders.length} contenders</h2>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(420px, 100%), 1fr))", gap: 12 }}>
                {playoffAudit.contenders.map((c) => (
                  <ContenderCard key={c.team_slug} c={c} />
                ))}
              </div>
              {playoffAudit.source_engines ? (
                <p style={{ marginTop: 16, fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.6 }}>{playoffAudit.source_engines}</p>
              ) : null}
            </div>
          </>
        ) : (
          <div className="apex-lane">
            <p style={{ fontSize: 14, color: "var(--muted-foreground)" }}>Not published yet — the audit compiles Sundays during the season.</p>
          </div>
        )}
      </div>
    </div>
  );
}
