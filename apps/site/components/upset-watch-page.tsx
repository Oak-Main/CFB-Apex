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

function PickCard({ pick }: { pick: UpsetPick }) {
  const away = getTeamBySlug(pick.away_slug);
  const home = getTeamBySlug(pick.home_slug);
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
          <div style={{ marginTop: 4, fontSize: 13, color: "var(--muted-foreground)" }}>
            {pick.line != null ? pick.line : "line not published"} · {pick.line_source ?? "source n/p"}
          </div>
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
    </article>
  );
}

export function UpsetWatchPage() {
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
                ? `Week ${upsetWatch.week ?? "?"} board — eligibility requires an underdog getting 6+ points per a published, cited line plus a concrete on-field reason. Lines as carried by ESPN (provider-labeled), never computed. Compiled ${upsetWatch.as_of ?? ""}.`
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
                  <h2>{upsetWatch.picks.length} pick{upsetWatch.picks.length === 1 ? "" : "s"} this week</h2>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(420px, 100%), 1fr))", gap: 14 }}>
                {upsetWatch.picks.map((p) => (
                  <PickCard key={`${p.away_slug}-${p.home_slug}`} pick={p} />
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
