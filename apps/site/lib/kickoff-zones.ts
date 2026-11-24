/**
 * Pacific time beside Eastern, for display only.
 *
 * Kickoff labels are published in Eastern time ("3:30 PM ET"). Eastern and
 * Pacific change clocks on the same nights, so Pacific is always three hours
 * behind: the conversion needs no date. A label with no Eastern time in it
 * ("Kickoff TBA", "Not published", "TBD") is returned unchanged.
 */
const ET_TIME = /(\d{1,2}):(\d{2})\s*([AP]M)\s*ET/i;

export function pacificFromEastern(label: string): string | null {
  const m = label.match(ET_TIME);
  if (!m) return null;
  const hour12 = Number(m[1]);
  const minute = m[2];
  if (hour12 < 1 || hour12 > 12) return null;
  const hour24 = (hour12 % 12) + (m[3]?.toUpperCase() === "PM" ? 12 : 0);
  const pacific = (hour24 + 21) % 24;
  const suffix = pacific >= 12 ? "PM" : "AM";
  return `${pacific % 12 === 0 ? 12 : pacific % 12}:${minute} ${suffix} PT`;
}

/** "3:30 PM ET" -> "3:30 PM ET / 12:30 PM PT". */
export function withPacific(label: string): string {
  const pacific = pacificFromEastern(label);
  if (!pacific || /\bPT\b/.test(label)) return label;
  return label.replace(ET_TIME, (et) => `${et} / ${pacific}`);
}
