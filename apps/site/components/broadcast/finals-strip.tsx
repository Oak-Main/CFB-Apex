import { useEffect, useMemo, useState } from "react";
import type { NcaafScoreboardPayload } from "@/lib/ncaaf-scoreboard";
import { LaneHeading } from "./primitives";

/**
 * Thursday/Friday finals rail for the homepage. Reads the same
 * /api/ncaaf-scoreboard feed the team pages use; degrades to nothing
 * (hidden) when the feed is missing or has no reconciled finals yet —
 * the homepage never shows an error surface for live data.
 */
export function FinalsStrip({ referenceDate, fallbackDate }: { referenceDate: string; fallbackDate?: string }) {
  const [payload, setPayload] = useState<NcaafScoreboardPayload | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ncaaf-scoreboard", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: NcaafScoreboardPayload | null) => setPayload(data))
      .catch(() => setPayload(null));
    return () => controller.abort();
  }, []);

  const { finals, lastWeek } = useMemo(() => {
    if (!payload) return { finals: [], lastWeek: false };
    const finalsFor = (date: string) => {
      const start = new Date(`${date.slice(0, 10)}T00:00:00Z`);
      start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 7);
      return payload.events
        .filter((event) => {
          const at = new Date(event.utc);
          return (
            event.state === "final" &&
            Number.isFinite(at.getTime()) &&
            at >= start &&
            at < end &&
            event.homeScore != null &&
            event.awayScore != null
          );
        })
        .sort((a, b) => b.utc.localeCompare(a.utc));
    };
    const current = finalsFor(referenceDate);
    // Before a new week has finals, the previous board week's stay labelled as such.
    if (current.length > 0 || !fallbackDate) return { finals: current, lastWeek: false };
    return { finals: finalsFor(fallbackDate), lastWeek: true };
  }, [payload, referenceDate, fallbackDate]);

  if (finals.length === 0) return null;

  const anchor = finals.reduce((best, event) =>
    Math.abs(event.awayScore! - event.homeScore!) >
    Math.abs(best.awayScore! - best.homeScore!)
      ? event
      : best,
  );
  const rest = finals.filter((event) => event.id !== anchor.id).slice(0, 6);
  const anchorAwayWon = (anchor.awayScore ?? 0) > (anchor.homeScore ?? 0);

  return (
    <section className="apex-lane" aria-labelledby="gdc-finals-title">
      <LaneHeading
        id="gdc-finals-title"
        eyebrow={lastWeek ? "LAST WEEK" : "ON THE BOARD"}
        title={lastWeek ? "Last week's finals" : "The week so far"}
        href="/scores"
        linkLabel="All scores"
      />
      <div className="apex-gdc-finals">
        <div className="apex-gdc-upset" data-testid="gdc-upset">
          <span className="apex-gdc-upset-tag">BIGGEST MARGIN</span>
          <p className="apex-gdc-upset-matchup">
            <span className={anchorAwayWon ? "apex-gdc-winner" : undefined}>
              {anchor.away}
            </span>
            <strong className="apex-gdc-upset-score">
              {anchor.awayScore}–{anchor.homeScore}
            </strong>
            <span className={!anchorAwayWon ? "apex-gdc-winner" : undefined}>
              {anchor.home}
            </span>
          </p>
        </div>
        {rest.length > 0 && (
          <ul className="apex-gdc-final-rail">
            {rest.map((event) => {
              const awayWon = (event.awayScore ?? 0) > (event.homeScore ?? 0);
              return (
                <li key={event.id}>
                  <span className={awayWon ? "apex-gdc-winner" : undefined}>
                    {event.away} {event.awayScore}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className={!awayWon ? "apex-gdc-winner" : undefined}>
                    {event.home} {event.homeScore}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="apex-data-note">
        Partial supplemental feed reconciled to snapshot finals verified {payload?.finalsAsOf ?? "at an unknown time"}. Fetched once on page load; upstream observation time unknown. New unverified scores are withheld.
      </p>
    </section>
  );
}
