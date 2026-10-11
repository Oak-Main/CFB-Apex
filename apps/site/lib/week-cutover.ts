/**
 * Server-clock board-week selection. A week replaces its predecessor at its
 * cutover (Sunday 06:00 America/Los_Angeles before it starts), decided by the
 * request's server time; `?week=` previews any reviewed week explicitly. The
 * browser clock never chooses the week, so hydration matches the server.
 */
export interface CutoverWeek {
  week: number;
  cutover_utc: string;
}

export function parseWeekParam(
  value: string | string[] | null | undefined,
  weeks: readonly CutoverWeek[],
): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw == null || !/^\d{1,2}$/.test(raw)) return null;
  const week = Number(raw);
  return weeks.some((entry) => entry.week === week) ? week : null;
}

export function pickBoardWeek(
  weeks: readonly CutoverWeek[],
  nowMs: number,
  override?: number | null,
): number | null {
  if (weeks.length === 0) return null;
  if (override != null && weeks.some((entry) => entry.week === override)) return override;
  const ordered = [...weeks].sort((a, b) => Date.parse(a.cutover_utc) - Date.parse(b.cutover_utc));
  let selected = ordered[0].week;
  for (const entry of ordered) {
    if (nowMs >= Date.parse(entry.cutover_utc)) selected = entry.week;
  }
  return selected;
}

/** The next cutover after `nowMs`, or null when the latest week is showing. */
export function nextCutoverMs(weeks: readonly CutoverWeek[], nowMs: number): number | null {
  const upcoming = weeks
    .map((entry) => Date.parse(entry.cutover_utc))
    .filter((at) => Number.isFinite(at) && at > nowMs)
    .sort((a, b) => a - b);
  return upcoming[0] ?? null;
}

export interface BoardWeekSelection {
  week: number | null;
  /** Server time the selection was made at (epoch ms). */
  serverNow: number;
  /** True when `?week=` chose the week rather than the clock. */
  explicit: boolean;
}

export function selectBoardWeek(
  weeks: readonly CutoverWeek[],
  nowMs: number,
  param?: string | string[] | null,
): BoardWeekSelection {
  const override = parseWeekParam(param, weeks);
  return { week: pickBoardWeek(weeks, nowMs, override), serverNow: nowMs, explicit: override != null };
}
