/** Calendar dates on the football site are Eastern; instants remain UTC. */
// Reuse ICU formatters: constructing one for every matchup scan exceeded
// Cloudflare's startup CPU limit. Bound the cache for long-lived isolates.
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
});
const offsetFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", timeZoneName: "shortOffset",
});
const dateCache = new Map<string, string>();

/** Converts a UTC instant (or passes through an already-civil `YYYY-MM-DD` date) to its Eastern civil date. */
export function easternDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const cached = dateCache.get(value);
  if (cached !== undefined) return cached;
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return "";
  const parts = dateFormatter.formatToParts(instant);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value;
  const result = `${part("year")}-${part("month")}-${part("day")}`;
  if (dateCache.size >= 4096) dateCache.clear();
  dateCache.set(value, result);
  return result;
}

/** Returns the Monday (as a civil date) that starts the Eastern week containing `value`. */
export function weekStart(value: string): string {
  const date = easternDate(value);
  if (!date) return "";
  const start = new Date(`${date}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return start.toISOString().slice(0, 10);
}

/** Derives the 2026 season week number from a date's Eastern week start. */
export function seasonWeek(value: string): number {
  const start = weekStart(value);
  // Week 1 spans the opening holiday weekend; Week 2 starts Sept. 7.
  return Math.max(
    0,
    Math.floor((Date.parse(start) - Date.parse("2026-08-31")) / 604_800_000) +
      1,
  );
}

/** Builds a dedupe key from a game's Eastern civil date and its two team names (order-independent). */
export function gameKey(date: string, away: string, home: string): string {
  return `${easternDate(date)}:${[away, home].sort().join(":")}`;
}

/** Resolve a published Eastern wall time using the date's actual DST offset. */
export function easternKickoff(date: string, time: string | null): string {
  if (!time) return `${date}T17:00:00.000Z`; // date-only placeholder; UI says time unpublished
  const probe = new Date(`${date}T12:00:00Z`);
  const zone = offsetFormatter
    .formatToParts(probe)
    .find((part) => part.type === "timeZoneName")?.value;
  const offset = Number(zone?.match(/GMT([+-]\d+)/)?.[1] ?? -5);
  return new Date(
    Date.parse(`${date}T${time}:00Z`) - offset * 3_600_000,
  ).toISOString();
}


const sourceDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC", month: "short", day: "numeric", year: "numeric",
});
/** A published civil date is not an instant to shift into the browser's zone. */
export function sourceDateLabel(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Not published";
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "Not published";
  return sourceDateFormatter.format(date);
}
