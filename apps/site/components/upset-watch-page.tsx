/**
 * Upset Watch — the weekly Thursday rail (research prompt 9).
 *
 * Eligibility is strict by contract: a pick requires an underdog getting 6+
 * points per a published line (cited, never computed) AND a concrete on-field
 * reason. Quality over volume — a thin board publishes thin, with the trap
 * as the counterweight. Fail-closed shells render until research lands.
 */

import { upsetWatch, type UpsetPick } from "@/lib/awards-watch";
import { getTeamBySlug } from "@/lib/cfb-dataset";

const CONFIDENCE_LABEL: Record<string, string> = {
  coin_flip: "Coin flip",
  live_dog: "Live dog",
  long_fuse: "Long fuse",
};

function PickCard({ pick, cleanMode }: { pick: UpsetPick; cleanMode: boolean }) {
  const away = getTeamBySlug(pick.away_slug);
  const home = getTeamBySlug(pick.home_slug);
  const boxscoreSources = pick.sources.filter(source => source !== pick.line_source_url);
  return (
    <article
      className="apex-portal-card"
      style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10, borderLeft: `3px solid ${home?.color ?? "var(--border)"}` }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div>
          <h3 style={{ fontSize: 17, fontWeight: 800 }}>
            {away?.shortName ?? pick.away_slug} <span style={{ color: "var(--muted-foreground)" }}>@</span> {home?.shortName ?? pick.home_slug}
          </h3>
          <p style={{ marginTop: 4, fontSize: 13 }}>Upset case: {getTeamBySlug(pick.underdog_slug ?? "")?.shortName ?? pick.underdog_slug ?? "Not identified"}</p>
          {!cleanMode ? <div style={{ marginTop: 4, fontSize: 13, color: "var(--muted-foreground)" }}>
            Underdog {pick.line != null ? pick.line : "line not published"} · {pick.line_source ?? "source n/p"}
            <p>Observed {pick.line_observed_at ?? "unknown"}. <a href={pick.line_source_url} target="_blank" rel="noopener noreferrer">Line source</a></p>
          </div> : null}
        </div>
        {pick.confidence ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "3px 8px",
              borderRadius: 999,
              border: "1px solid color-mix(in srgb, var(--primary) 35%, transparent)",
              color: "var(--primary)",
              whiteSpace: "nowrap",
            }}
          >
            {CONFIDENCE_LABEL[pick.confidence] ?? pick.confidence}
          </span>
        ) : null}
      </header>
      {pick.case ? <p style={{ fontSize: 14, lineHeight: 1.6 }}>{pick.case}</p> : null}
      {pick.race_effect ? (
        <p style={{ fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.6 }}>
          <strong style={{ color: "var(--foreground)" }}>Race effect:</strong> {pick.race_effect}
        </p>
      ) : null}
      <footer style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12 }}>
        {!cleanMode && pick.line_source_url ? <a href={pick.line_source_url} target="_blank" rel="noopener noreferrer">Provider snapshot</a> : null}
        {boxscoreSources.map((source, index) => <a key={source} href={source} target="_blank" rel="noopener noreferrer">Box score {index + 1}</a>)}
      </footer>
    </article>
  );
}

export function UpsetWatchPage({ cleanMode = true, onModeRequest }: { cleanMode?: boolean; onModeRequest?: () => void }) {
  const has = upsetWatch.picks.length > 0 || upsetWatch.trap;
  return (
    <div className="apex-home" style={{ paddingTop: 32 }}>
      <div className="apex-container">
        <div className="apex-home-intro">
          <div>
            <span className="apex-eyebrow">UPSET WATCH</span>
            <h1>Where the weekend&apos;s upsets actually live</h1>
            <p>
              {has
                ? `Week ${upsetWatch.week ?? "?"} editorial upset cases — each meets our published-line threshold and has a concrete on-field reason plus a counterweight. Reviewed ${upsetWatch.as_of ?? ""}. These labels are not calibrated win probabilities.`
                : upsetWatch.notes ?? "The current upset board is pending a sourced line. No line, no pick."}
            </p>
          </div>
          <span className="apex-season-label"><span /><span className="apex-season-word">2026</span> SEASON</span>
        </div>

        {has ? (
          <>
            <div className="apex-lane">
              <div className="apex-lane-heading">
                <div>
                  <span className="apex-eyebrow">THE BOARD · DOGS WITH A CASE</span>
                  <h2>{`${upsetWatch.picks.length} ${upsetWatch.picks.length === 1 ? "pick" : "picks"} this week`}</h2>
                </div>
              </div>
              {cleanMode ? <p>Clean Mode hides market lines. <button type="button" className="button button--ghost" onClick={onModeRequest}>Review Analysis Mode disclosure</button></p> : <p>Eligibility: underdogs receiving at least six published points. Lines are copied from the dated ESPN provider snapshot and may move.</p>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(420px, 100%), 1fr))", gap: 14 }}>
                {upsetWatch.picks.map((p) => (
                  <PickCard key={`${p.away_slug}-${p.home_slug}`} pick={p} cleanMode={cleanMode} />
                ))}
              </div>
              {upsetWatch.notes ? (
                <p style={{ marginTop: 16, fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.6 }}>{upsetWatch.notes}</p>
              ) : null}
            </div>

            {upsetWatch.trap ? (
              <div className="apex-lane" style={{ marginTop: 26 }}>
                <div className="apex-lane-heading">
                  <div>
                    <span className="apex-eyebrow">MARKET TRAP · THE UPSET THE CROWD WANTS THAT THE DATA DOESN&apos;T</span>
                    <h2>
                      {getTeamBySlug(upsetWatch.trap.away_slug)?.shortName ?? upsetWatch.trap.away_slug} @{" "}
                      {getTeamBySlug(upsetWatch.trap.home_slug)?.shortName ?? upsetWatch.trap.home_slug}
                    </h2>
                  </div>
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.6, maxWidth: 720 }}>{upsetWatch.trap.why}</p>
              </div>
            ) : null}
          </>
        ) : (
          <div className="apex-lane">
            <p style={{ fontSize: 14, color: "var(--muted-foreground)" }}>
              Not published yet — the board compiles Thursdays during the season.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
