// Week 13 (November 24-28, 2026) host-school kickoff receipts, shared by the
// builder (build-weekly-refresh-2026-11-22.mjs) and the source gate
// (check-nov22-sources.mjs) so both assert the same reviewed listings.
//
// A Week 13 kickoff is published only when the provider and the NCAA agree on
// it, or when the host school's own official schedule settles it. Each rule
// names the host, the literal text its schedule page must still show, and the
// host's listed local date, time and time zone.
//
// This release needs none. At the November 23 capture the NCAA Week 13
// scoreboard lists all 69 contests with a start time and every one equals the
// provider instant, so no kickoff rests on a school page. (An earlier capture
// the same morning, before the NCAA scoreboard had filled in its times, needed
// sixteen host receipts and one hold; none of that is published.) If the two
// boards stop agreeing, the builder and the gate stop until a reviewed rule is
// added here.
export const HOST_SCHEDULE_SOURCES = [];

export const HOST_KICKOFF_SETTLEMENTS = {};

// A held kickoff stays unpublished ("Kickoff TBA"): the provider lists one
// time, the NCAA scoreboard lists none, and the host school lists another.
export const HELD_KICKOFFS = {};

/** A wall-clock time in a named zone as a UTC instant. */
export function zonedToUtc([date, time, zone]) {
  const guess = Date.parse(`${date}T${time}:00Z`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess)).map(p => [p.type, p.value]));
  const shown = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`);
  return new Date(guess - (shown - guess)).toISOString();
}
