/** Partial TheSportsDB normalization and reviewed-snapshot reconciliation.
 * The API adapter fetches once for each uncached request; no request timestamp
 * establishes event observation age or authorizes unverified scores.
 */

export type NcaafGameState =
  | "scheduled"
  | "live"
  | "halftime"
  | "final"
  | "postponed"
  | "canceled"
  | "other";

export interface NcaafGameEvent {
  id: string;
  /** ISO-8601 UTC instant (TheSportsDB strTimestamp is UTC-naive). */
  utc: string;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  state: NcaafGameState;
  /** Raw provider status for states the widget does not model exactly. */
  statusLabel: string | null;
  venue: string | null;
}

export interface NcaafScoreboardPayload {
  events: NcaafGameEvent[];
  /** Upstream observation timestamp; null when the feed does not establish it. */
  asOf: string | null;
  fetchedAt: string;
  upstreamFetchedAt: string[];
  canonicalAsOf: string | null;
  finalsAsOf: string | null;
  coverage: "partial";
  withheldCount: number;
  source: "thesportsdb" | "none";
  /** True when upstream coverage failed or a key is absent; valid matched rows remain usable. */
  degraded: boolean;
}

/** The subset of TheSportsDB event fields this module consumes. */
export interface TsdbRawEvent {
  idEvent?: string | number | null;
  strTimestamp?: string | null;
  dateEvent?: string | null;
  strTime?: string | null;
  strHomeTeam?: string | null;
  strAwayTeam?: string | null;
  intHomeScore?: string | number | null;
  intAwayScore?: string | number | null;
  strStatus?: string | null;
  strPostponed?: string | null;
  strVenue?: string | null;
}

/**
 * School-name alias groups so dataset school names ("Miami (FL)", "USC",
 * "ULM") match TheSportsDB's bare team names ("Miami", "Southern
 * California", "Louisiana Monroe"). Each group is bidirectional.
 */
const SCHOOL_ALIAS_GROUPS: ReadonlyArray<ReadonlyArray<string>> = [
  ["southern california", "usc"],
  ["texas a m", "texas a and m"],
  ["sam houston", "sam houston state"],
  ["connecticut", "uconn"],
  ["louisiana monroe", "ulm", "louisiana-monroe"],
  ["louisiana lafayette", "louisiana", "ul lafayette"],
  ["miami", "miami fl"],
  ["miami ohio", "miami oh"],
  ["pittsburgh", "pitt"],
  ["north carolina state", "nc state"],
  ["nevada las vegas", "unlv"],
  ["brigham young", "byu"],
  ["ole miss", "mississippi"],
  ["texas christian", "tcu"],
  ["southern methodist", "smu"],
  ["california", "cal berkeley"],
  ["middle tennessee state", "middle tennessee"],
];

export function normalizeSchoolName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Typographic apostrophes are part of names ("Hawai'i"), not separators.
    .replace(/['\u2018\u2019\u02bc`´]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function aliasVariants(normalized: string): ReadonlyArray<string> {
  for (const group of SCHOOL_ALIAS_GROUPS) {
    if (group.includes(normalized)) return group;
  }
  return [normalized];
}

/** True when either event participant is the given school (alias-aware). */
export function eventInvolvesSchool(
  event: Pick<NcaafGameEvent, "home" | "away">,
  school: string,
): boolean {
  const schoolVariants = aliasVariants(normalizeSchoolName(school));
  const participants = [event.home, event.away].flatMap((name) =>
    aliasVariants(normalizeSchoolName(name)),
  );
  return schoolVariants.some((variant) => participants.includes(variant));
}

/** Maps a raw provider status (and postponed flag) to this module's game state and display status label. */
export function mapTsdbStatus(
  status: string | null | undefined,
  postponed: string | null | undefined,
): { state: NcaafGameState; statusLabel: string | null } {
  const raw = (status ?? "").trim();
  const upper = raw.toUpperCase();
  if ((postponed ?? "").trim().toLowerCase() === "yes") {
    return { state: "postponed", statusLabel: raw || null };
  }
  if (upper === "" || upper === "NS" || upper === "TBD") {
    return { state: "scheduled", statusLabel: null };
  }
  if (upper === "FT" || upper === "AET" || upper === "AOT" || upper === "PEN") {
    return { state: "final", statusLabel: null };
  }
  if (upper === "HT") return { state: "halftime", statusLabel: null };
  if (upper === "1H" || upper === "2H" || /^\d{1,3}'?$/.test(upper)) {
    return { state: "live", statusLabel: raw };
  }
  if (upper === "PPD" || upper === "PTN" || upper === "PST") {
    return { state: "postponed", statusLabel: raw };
  }
  if (upper === "CANC" || upper === "CAN" || upper === "CANCELLED" || upper === "CANCELED") {
    return { state: "canceled", statusLabel: raw };
  }
  return { state: "other", statusLabel: raw || null };
}

function parseScore(value: string | number | null | undefined): number | null {
  if (value == null || (typeof value === "string" && value.trim() === "")) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

/** Resolves a raw provider event's kickoff to an ISO-8601 UTC instant, preferring the timestamp field over date/time parts. */
function eventUtc(event: TsdbRawEvent): string | null {
  const stamp = (event.strTimestamp ?? "").trim();
  const time = (event.strTime ?? "").trim();
  const date = (event.dateEvent ?? "").trim();
  let candidate: string | null = null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(stamp)) {
    candidate = stamp.length === 16 ? `${stamp}:00Z` : `${stamp}Z`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    candidate =
      /^\d{2}:\d{2}(:\d{2})?$/.test(time)
        ? `${date}T${time.length === 5 ? `${time}:00` : time}Z`
        : `${date}T00:00:00Z`;
  }
  if (candidate && !Number.isNaN(Date.parse(candidate))) return candidate;
  return null;
}

/** Maps one raw provider event; returns null when identity or timing is unusable. */
export function tsdbEventToNcaafEvent(raw: TsdbRawEvent): NcaafGameEvent | null {
  const id = raw.idEvent != null ? String(raw.idEvent) : "";
  const home = (raw.strHomeTeam ?? "").trim();
  const away = (raw.strAwayTeam ?? "").trim();
  const utc = eventUtc(raw);
  if (!id || !home || !away || !utc) return null;
  const { state, statusLabel } = mapTsdbStatus(raw.strStatus, raw.strPostponed);
  return {
    id,
    utc,
    home,
    away,
    homeScore: parseScore(raw.intHomeScore),
    awayScore: parseScore(raw.intAwayScore),
    state,
    statusLabel,
    venue: (raw.strVenue ?? "").trim() || null,
  };
}

/**
 * Keeps events inside the rolling "this week" window: finals from the last
 * few days plus fixtures through the coming week. The provider feeds cap at
 * next-20/past-15 anyway; the window keeps the card honest about scope.
 */
export function windowThisWeek(
  events: ReadonlyArray<NcaafGameEvent>,
  nowMs: number,
  backDays = 4,
  forwardDays = 8,
): NcaafGameEvent[] {
  const from = nowMs - backDays * 86_400_000;
  const to = nowMs + forwardDays * 86_400_000;
  return events.filter((event) => {
    const at = Date.parse(event.utc);
    return !Number.isNaN(at) && at >= from && at <= to;
  });
}

/** Sanitizes, dedupes (an event can appear in both feeds), and sorts by kickoff. */
export function mergeNcaafFeeds(
  nextEvents: ReadonlyArray<TsdbRawEvent>,
  pastEvents: ReadonlyArray<TsdbRawEvent>,
): NcaafGameEvent[] {
  const byId = new Map<string, NcaafGameEvent>();
  for (const raw of [...nextEvents, ...pastEvents]) {
    const event = tsdbEventToNcaafEvent(raw);
    if (event) byId.set(event.id, event);
  }
  return [...byId.values()].sort((a, b) => a.utc.localeCompare(b.utc));
}

export function splitTeamWeek(
  events: ReadonlyArray<NcaafGameEvent>,
  school: string,
): { teamGames: NcaafGameEvent[]; otherGames: NcaafGameEvent[] } {
  const teamGames: NcaafGameEvent[] = [];
  const otherGames: NcaafGameEvent[] = [];
  for (const event of events) {
    if (eventInvolvesSchool(event, school)) teamGames.push(event);
    else otherGames.push(event);
  }
  return { teamGames, otherGames };
}

/** Reconcile a partial provider list without treating fetched-at as observed-at.
 * All displayed facts come from a unique reviewed snapshot event. Unknown or
 * ambiguous identities are withheld; unverified live scores never advance it.
 */
export function reconcileNcaafEvents(
  events: ReadonlyArray<NcaafGameEvent>,
  canonical: ReadonlyArray<NcaafGameEvent>,
): { events: NcaafGameEvent[]; withheldCount: number } {
  const result = new Map<string, NcaafGameEvent>();
  let withheldCount = 0;
  for (const event of events) {
    const candidates = canonical.filter((game) =>
      eventInvolvesSchool(event, game.home) && eventInvolvesSchool(event, game.away) &&
      Math.abs(Date.parse(game.utc) - Date.parse(event.utc)) <= 7 * 86_400_000,
    );
    if (candidates.length !== 1) { withheldCount += 1; continue; }
    const game = candidates[0];
    if (game.state === "final" && (game.homeScore == null || game.awayScore == null)) {
      withheldCount += 1; continue;
    }
    result.set(game.id, { ...game,
      homeScore: game.state === "final" ? game.homeScore : null,
      awayScore: game.state === "final" ? game.awayScore : null,
    });
  }
  return { events: [...result.values()].sort((a, b) => a.utc.localeCompare(b.utc)), withheldCount };
}
