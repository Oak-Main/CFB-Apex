"use client";

import { useEffect } from "react";
import type { BoardWeekRow } from "@/lib/cfb-dataset";
import { nextCutoverMs, type BoardWeekSelection } from "@/lib/week-cutover";

/** The week the server clock would show without an explicit `?week=`. */
export function clockWeek(weeks: readonly BoardWeekRow[], selection: BoardWeekSelection): number | null {
  if (!selection.explicit) return selection.week;
  const passed = weeks.filter((entry) => selection.serverNow >= Date.parse(entry.cutover_utc));
  return (passed.at(-1) ?? weeks[0])?.week ?? null;
}

/**
 * Reload once the server's next cutover passes so an open page picks up the
 * new board. Elapsed time is measured from the server's render time; the
 * browser's wall clock never decides the week, and the server re-decides.
 */
export function useBoardWeekCutover(
  weeks: readonly BoardWeekRow[],
  selection: BoardWeekSelection | undefined,
  enabled: boolean,
) {
  const serverNow = selection?.serverNow ?? null;
  const active = enabled && selection != null && !selection.explicit;
  useEffect(() => {
    if (!active || serverNow == null) return;
    const cutover = nextCutoverMs(weeks, serverNow);
    if (cutover == null) return;
    const mountedAt = performance.now();
    const due = () => serverNow + (performance.now() - mountedAt) >= cutover;
    const check = () => {
      if (due() && document.visibilityState === "visible") window.location.reload();
    };
    // One second of margin keeps a slightly slow edge clock from re-serving the old week.
    const delay = cutover - serverNow + 1_000;
    const timer = delay < 2_147_483_647 ? window.setTimeout(check, delay) : null;
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      if (timer != null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [active, serverNow, weeks]);
}

/** Explicit week navigation: plain links, so it works before hydration too. */
export function WeekSwitch({
  weeks,
  selected,
  current,
  basePath = "/",
}: {
  weeks: readonly BoardWeekRow[];
  selected: number | null;
  current: number | null;
  basePath?: string;
}) {
  if (weeks.length < 2) return null;
  return (
    <nav className="apex-week-nav" aria-label="Board week">
      {weeks.map((entry) => {
        const href = entry.week === current ? basePath : `${basePath}?week=${entry.week}`;
        const tag = entry.week === current ? "Current" : entry.week < (current ?? entry.week) ? "Archive" : "Preview";
        return (
          <a
            key={entry.week}
            href={href}
            aria-current={entry.week === selected ? "page" : undefined}
            className="apex-week-nav__link"
          >
            <strong>Week {entry.week}</strong>
            <span>
              {entry.label} · {tag}
            </span>
          </a>
        );
      })}
    </nav>
  );
}
