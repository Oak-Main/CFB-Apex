/// <reference types="vite/client" />
/**
 * Real 2026 FBS dataset, vendored from the CFB-Apex data repository
 * (data/dist as of 2026-09-05) and mapped onto the app's fixture shapes so
 * every surface that used to read `@/lib/fixtures` can read this instead.
 *
 * Conventions carried over from the dataset itself:
 *   - `null` means the source did not publish a value. Surfaces with no
 *     dataset backing (portal, DFS, stadiums, model estimates, contract
 *     economics) export empty arrays or neutral numbers and mark their
 *     provenance `freshness: "unavailable"` so the UI can say "Not published"
 *     instead of rendering a fabricated zero.
 *   - The data is read from `lib/cfb-2026.generated.ts` (built by
 *     scripts/build-dataset.mjs) at build time. Nothing here touches the
 *     network or the filesystem at request time.
 */
import bundle from "./cfb-2026.generated.ts";
import { easternDate, easternKickoff, gameKey, seasonWeek, weekStart } from "./game-calendar.ts";
import type {
  Coach,
  DfsPlayer,
  Game,
  PortalEvent,
  ProviderHealth,
  ScenarioGame,
  SeasonRules,
  Stadium,
  Team,
} from "./types";

const asOf = "2026-09-05";
export interface CurrentMetrics {
  source_url: string;
  through_games: string;
  verified_at: string;
  categories: Array<{ name: string; unit: string; rows: Array<{ name: string; team: string; value: number }> }>;
}
export interface BroadcastEventRow {
  type: string;
  game_provider_id: string;
  site: string;
  date: string;
  network: string | null;
  announced: string | null;
  badge: string;
  note: string | null;
  sources: string[];
}
export interface StorylineRow {
  id: string;
  headline: string;
  body: string;
  game_provider_id: string | null;
  /** Finals a results recap covers (provider ids in playedGames). */
  result_provider_ids?: string[];
  as_of?: string;
  /** Board week the story belongs to; stories never cross onto another week's board. */
  week?: number;
  sources: string[];
}
export interface BoardWeekRow {
  week: number;
  start: string;
  end: string;
  label: string;
  /** Sunday 06:00 America/Los_Angeles before the week starts, as UTC. */
  cutover_utc: string;
  retrieved_at?: string;
  schedule_verified_at?: string;
  results_verified_at?: string;
  records_verified_at?: string;
  audit_applied_at?: string;
  snapshot_id?: string;
  /** Editorial Game of the Week, when the release names one. */
  marquee_game_id?: string;
  note?: string;
}
interface PollNoteMove { team: string; team_slug: string; from: number; to: number; move: number }
interface PollGapSide { team: string; team_slug: string; ap: number | null; coaches: number | null; ap_points?: number | null; coaches_points?: number | null }
interface VerifiedRefresh {
  week?: number;
  polls?: Array<{ poll: string; name: string; release_date: string }>;
  reference_date: string;
  requested_cutoff: string;
  retrieved_at: string;
  teamRecords: Record<string, string>;
  gameAliases?: Record<string, string>;
  metrics: CurrentMetrics;
  playedGames?: unknown[];
  /** `kickoff_utc`/`time_et` are null only for an official TBD (`kickoff_status: "official_tbd"`). */
  scheduledGames: Array<{ provider_id: string; source_url: string; kickoff_utc: string | null; kickoff_status?: "confirmed" | "official_tbd"; week: number; date: string; away: string; home: string; tv: string | null; tv_status?: string; time_et: string | null; site: string | null; neutral_site: boolean; verified_at?: string; game_status?: string; announced_kickoff_utc?: string; timing_note?: string; timing_sources?: string[] }>;
  /** Weeks this release covers: the current board plus its archived predecessor. */
  board_weeks?: BoardWeekRow[];
  team_records_review?: { as_of: string; verified: number; carried_from_2026_10_10: string[]; withheld: string[]; note: string };
  excludedGames?: Array<{ provider_id: string; name: string; reason: string; date: string; espn_conference_ids?: { home: number; away: number } }>;
  source_urls?: string[];
  holds?: string[];
  audit_applied_at?: string;
  /** When the latest incremental results refresh verified finals (not the base snapshot time). */
  results_verified_at?: string;
  records_verified_at?: string;
  schedule_verified_at?: string;
  availability_review?: { checked_at: string; scope: string; note: string };
  refresh_log?: Array<{ applied_at: string; script: string; scope: string }>;
  broadcast_events?: BroadcastEventRow[];
  storylines?: StorylineRow[];
  ranked_matchups?: Array<{ game_id: string; matchup: string; polls: string[] }>;
  poll_notes?: {
    as_of: string;
    movers_ap: PollNoteMove[];
    debuts_ap: Array<{ team: string; team_slug: string; rank: number }>;
    dropped_out: { ap: Array<{ team: string; team_slug: string; others_points: number | null }>; coaches: Array<{ team: string; team_slug: string; others_points: number | null }> };
    poll_gaps: { ap_only: PollGapSide[]; coaches_only: PollGapSide[]; biggest_splits: PollGapSide[] };
    sources: string[];
  };
  retainedBaseline?: { conferenceStandings: ConferenceStanding[]; espnInjuries: { asOf: string | null; entries: unknown[] } | null; as_of: string; note: string; verified_at?: string; overall_records?: Record<string, string>; overall_records_note?: string };
}
export const verifiedRefresh = (bundle as unknown as { refreshData?: VerifiedRefresh }).refreshData ?? null;
/** Board weeks in calendar order; a snapshot without them covers only its own week. */
export const boardWeeks: BoardWeekRow[] = verifiedRefresh
  ? (verifiedRefresh.board_weeks ?? [{ week: verifiedRefresh.week ?? 0, start: verifiedRefresh.reference_date, end: verifiedRefresh.reference_date, label: "", cutover_utc: verifiedRefresh.reference_date }])
    .slice().sort((a, b) => a.start.localeCompare(b.start))
  : [];
export const broadcastEvents = verifiedRefresh?.broadcast_events ?? [];
export const refreshStorylines = verifiedRefresh?.storylines ?? [];
/** Match a site Game to a verified broadcast event (e.g. College GameDay) by date + team pair. */
export function broadcastEventForGame(game: Pick<Game, "date" | "awayTeamId" | "homeTeamId">): BroadcastEventRow | null {
  for (const event of broadcastEvents) {
    if (easternDate(game.date) !== event.date) continue;
    // The event's game may since have become a verified final.
    const scheduled = verifiedRefresh?.scheduledGames.find((g) => g.provider_id === event.game_provider_id);
    const played = (verifiedRefresh?.playedGames as Array<{ provider_id?: string; away_slug: string; home_slug: string }> | undefined)
      ?.find((g) => g.provider_id === event.game_provider_id);
    const pair = scheduled ? [scheduled.away, scheduled.home] : played ? [played.away_slug, played.home_slug] : null;
    if (!pair) continue;
    if (pair.sort().join(":") === [game.awayTeamId, game.homeTeamId].sort().join(":")) return event;
  }
  return null;
}
const datasetProvenanceRoot = {
  provider: "CFB Apex 2026 research dataset",
  sourceDocumentId: "cfb-2026-master-package (data/dist 2026-10-03)",
  sourceAsOf: asOf,
  fetchedAt: asOf,
  verifiedAt: asOf,
  dataEnvironment: "production" as const,
  recordOrigin: "official_document" as const,
};

function derivedProvenance(id: string) {
  return {
    ...datasetProvenanceRoot,
    providerRecordId: `dataset:${id}`,
    verificationStatus: "corroborated" as const,
    licenseClass: "R3_CITED_FACTS" as const,
    confidence: 0.9,
    freshness: "current" as const,
  };
}

/** Fields the dataset does not carry: neutral values, marked unavailable. */
function unavailableProvenance(id: string) {
  return {
    ...datasetProvenanceRoot,
    providerRecordId: `dataset-gap:${id}`,
    verificationStatus: "unverified" as const,
    licenseClass: "R3_CITED_FACTS" as const,
    confidence: 0,
    recordOrigin: "fixture" as const,
    freshness: "unavailable" as const,
  };
}

/* -------------------------------------------------------- transfer portal */

interface PortalRow {
  id: string;
  player: string;
  position: string | null;
  class: string | null;
  from: string;
  to: string;
  status: string;
  date: string;
  snaps: number | null;
  notes: string | null;
  confidence: string;
  sources: string[];
}

const portalDoc = (bundle.portal ?? { asOf: null, statusNote: null, events: [] }) as {
  asOf: string | null;
  statusNote: string | null;
  events: PortalRow[];
};

function playerSlugFor(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z ]/g, "")
    .trim()
    .replaceAll(" ", "-");
}

export const portalEvents: PortalEvent[] = portalDoc.events.map((row) => ({
  id: row.id,
  playerSlug: playerSlugFor(row.player),
  player: row.player,
  position: row.position ?? "—",
  fromTeamId: row.from,
  toTeamId: row.to || null,
  status: (row.status === "enrolled" ? "enrolled" : "committed") as PortalEvent["status"],
  eventDate: row.date,
  snaps: row.snaps,
  usage: null,
  impact: null,
  confidence: (row.confidence === "high" ? "high" : row.confidence === "low" ? "low" : "medium") as PortalEvent["confidence"],
  notes: row.notes,
  sources: row.sources,
  provenance: derivedProvenance(row.id),
}));

export const portalAsOf = portalDoc.asOf;
export const portalStatusNote = portalDoc.statusNote;

/* Net transfer intake per dataset team (incoming minus outgoing, both sides
   restricted to teams the dataset lists). */
const portalNetBySlug = new Map<string, number>();
const portalInBySlug = new Map<string, number>();
const portalOutBySlug = new Map<string, number>();
const datasetSlugSet = new Set(
  ((bundle.teams ?? []) as Array<{ slug: string }>).map((team) => team.slug),
);
for (const event of portalEvents) {
  if (datasetSlugSet.has(event.fromTeamId)) {
    portalOutBySlug.set(event.fromTeamId, (portalOutBySlug.get(event.fromTeamId) ?? 0) + 1);
  }
  if (event.toTeamId && datasetSlugSet.has(event.toTeamId)) {
    portalInBySlug.set(event.toTeamId, (portalInBySlug.get(event.toTeamId) ?? 0) + 1);
  }
}
for (const team of [...datasetSlugSet]) {
  portalNetBySlug.set(
    team,
    (portalInBySlug.get(team) ?? 0) - (portalOutBySlug.get(team) ?? 0),
  );
}

export function portalCountsFor(slug: string) {
  return {
    incoming: portalInBySlug.get(slug) ?? 0,
    outgoing: portalOutBySlug.get(slug) ?? 0,
    net: portalNetBySlug.get(slug) ?? 0,
  };
}

/* ---------------------------------------------------------------- teams */

interface DatasetTeam {
  slug: string;
  school: string;
  nickname: string | null;
  display_name: string;
  conference: string;
  conference_slug: string;
  conference_short: string;
  division: string | null;
  football_only: boolean;
}

const datasetTeams = bundle.teams as DatasetTeam[];

const p4Conferences = new Set(["sec", "acc", "big-ten", "big12", "pac12"]);

function abbreviationFor(school: string) {
  const words = school
    .replace(/[^A-Za-z ]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .map((word) => word[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

/* AP preseason rank per team slug. */
const apRankBySlug = new Map<string, number>();
const apPollTable = (bundle.polls as PollTable[]).find((poll) => poll.poll === "ap");
for (const entry of apPollTable?.rankings ?? []) {
  if (entry.team_slug) apRankBySlug.set(entry.team_slug, entry.rank);
}

/* Played 2026 games → per-team records and the displayable scoreboard. */
interface PlayedGame {
  game_id: string;
  date: string;
  home_slug: string;
  away_slug: string;
  site: string | null;
  tv: string | null;
  neutral_site: boolean;
  title: string;
  teams: Array<{ name: string; slug: string; points: number }>;
  kickoff_utc?: string | null;
  week?: number | null;
  source_url?: string;
  verified_at?: string;
  meta?: { as_of?: string };
}

const playedGames = bundle.playedGames as PlayedGame[];

const winsBySlug = new Map<string, number>();
const lossesBySlug = new Map<string, number>();
function bump(map: Map<string, number>, slug: string) {
  map.set(slug, (map.get(slug) ?? 0) + 1);
}
for (const game of playedGames) {
  const home = game.teams.find((team) => team.slug === game.home_slug);
  const away = game.teams.find((team) => team.slug === game.away_slug);
  if (!home || !away) continue;
  if (home.points > away.points) {
    bump(winsBySlug, home.slug);
    bump(lossesBySlug, away.slug);
  } else if (away.points > home.points) {
    bump(winsBySlug, away.slug);
    bump(lossesBySlug, home.slug);
  }
}

function recordFor(slug: string) {
  if (verifiedRefresh) return verifiedRefresh.teamRecords[slug]?.replace("-", "–") ?? "Not published";
  const wins = winsBySlug.get(slug) ?? 0;
  const losses = lossesBySlug.get(slug) ?? 0;
  return `${wins}–${losses}`;
}

/* Strength index: best-available SOS ranking (Phil Steele, then ESPN FPI SOS),
   inverted to a 0–100 scale. Teams without any published rank sit at 50. */
interface SosTeamRow {
  slug: string;
  phil_steele_rank: number | null;
  espn_fpi_sos_rank: number | null;
}

const sosBySlug = new Map<string, SosTeamRow>();
for (const row of bundle.sos as SosTeamRow[]) {
  sosBySlug.set(row.slug, row);
}

function strengthFor(slug: string) {
  const row = sosBySlug.get(slug);
  const rank = row?.phil_steele_rank ?? row?.espn_fpi_sos_rank ?? null;
  if (rank == null) return { value: 50, published: false };
  return { value: Math.max(1, Math.min(99, Math.round(101 - rank * 0.7))), published: true };
}

/* Verified team marks (public/logos, ESPN CDN, two-source checked) and the
   brand color derived from each mark. */
const logoSlugSet = new Set<string>((bundle.logoSlugs as string[]) ?? []);
const logoColorBySlug = new Map<string, string>(
  Object.entries((bundle.logoColors as Record<string, string>) ?? {}),
);

/* ------------------------------------------------ conference hub pages */

export interface ConferenceHub {
  slug: string;
  name: string;
  shortName: string;
  teams: Team[];
  scheduledGames: Game[];
  topSPPlus: Array<{ team: Team; rank: number; overall: number }>;
  playoffContenders: Array<{ team: Team; odds: string; outlet: string }>;
  tvGamesThisWeek: Array<{ game: Game; network: string }>;
}

const conferenceHubCache = new Map<string, ConferenceHub>();

export function getConferenceHub(slug: string): ConferenceHub | null {
  if (conferenceHubCache.has(slug)) return conferenceHubCache.get(slug)!;

  const conferenceTeams = teams.filter((team) => {
    const datasetTeam = datasetTeams.find((dt) => dt.slug === team.slug);
    return datasetTeam?.conference_slug === slug;
  });
  if (conferenceTeams.length === 0) return null;

  const name = conferenceTeams[0].conference;
  const teamIds = new Set(conferenceTeams.map((team) => team.id));
  const scheduledGames = games
    .filter((game) => teamIds.has(game.homeTeamId) || teamIds.has(game.awayTeamId))
    .sort((a, b) => a.date.localeCompare(b.date));

  const topSPPlus = conferenceTeams
    .map((team) => {
      const rating = preseasonRatings[team.slug];
      return rating?.sp ? { team, rank: rating.sp.rank, overall: rating.sp.overall } : null;
    })
    .filter((row): row is { team: Team; rank: number; overall: number } => row !== null)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 5);

  const playoffContenders = conferenceTeams
    .map((team) => {
      const rating = preseasonRatings[team.slug];
      return rating?.playoff?.value
        ? { team, odds: rating.playoff.value, outlet: rating.playoff.outlet }
        : null;
    })
    .filter((row): row is { team: Team; odds: string; outlet: string } => row !== null)
    .sort((a, b) => parseFloat(b.odds) - parseFloat(a.odds))
    .slice(0, 5);

  const now = Date.now();
  const tvGamesThisWeek = scheduledGames
    .filter(
      (game) =>
        game.broadcast &&
        Date.parse(game.date) >= now - 86400000 * 3 &&
        Date.parse(game.date) <= now + 86400000 * 10,
    )
    .map((game) => ({ game, network: game.broadcast ?? "" }))
    .slice(0, 6);

  const shortNameMap: Record<string, string> = {
    sec: "SEC", "big-ten": "Big Ten", big12: "Big 12", acc: "ACC", pac12: "Pac-12",
    aac: "American", cusa: "C-USA", mac: "MAC", "mountain-west": "Mountain West",
    "sun-belt": "Sun Belt", independents: "Independents",
  };

  const hub: ConferenceHub = {
    slug,
    name,
    shortName: shortNameMap[slug] ?? name,
    teams: conferenceTeams.sort((a, b) => a.shortName.localeCompare(b.shortName)),
    scheduledGames,
    topSPPlus,
    playoffContenders,
    tvGamesThisWeek,
  };
  conferenceHubCache.set(slug, hub);
  return hub;
}

export function conferenceHubSlugs() {
  const slugs = new Set<string>();
  for (const team of datasetTeams) {
    if (team.conference_slug) slugs.add(team.conference_slug);
  }
  return [...slugs].sort();
}

export const teams: Team[] = datasetTeams.map((team) => {
  const strength = strengthFor(team.slug);
  const rank = apRankBySlug.get(team.slug);
  return {
    id: team.slug,
    slug: team.slug,
    name: team.display_name,
    shortName: team.school,
    abbreviation: abbreviationFor(team.school),
    monogram: team.school[0] ?? "?",
    conference: team.conference,
    subdivision: p4Conferences.has(team.conference_slug) ? "P4" : "G5",
    logo: logoSlugSet.has(team.slug) ? `/logos/${team.slug}.png` : undefined,
    rank,
    record: recordFor(team.slug),
    color: logoColorBySlug.get(team.slug) ?? "#64748B",
    strength: strength.value,
    returningProduction: 0,
    portalImpact: portalNetBySlug.get(team.slug) ?? 0,
    playoffProbability: rank ? Math.max(2, Math.round(140 / rank)) : 0,
    provenance: {
      ...derivedProvenance(`team-${team.slug}`),
      recordOrigin: "editorial" as const,
      freshness: strength.published ? ("current" as const) : ("unavailable" as const),
    },
  };
});

/* ---------------------------------------------------------------- games */

function kickoffLabel(date: string) {
  const parsed = new Date(`${date}T17:00:00Z`);
  const day = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(parsed);
  return `${day} · ${date}`;
}

/* Live ESPN result rows carry the true kickoff instant; render it in ET so
 * played games keep the same label shape the scheduled side produces. */
function playedKickoffLabel(date: string, kickoffUtc?: string) {
  if (!kickoffUtc) return kickoffLabel(date);
  const parsed = new Date(kickoffUtc);
  const day = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/New_York" }).format(parsed);
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(parsed);
  return `${day} · ${date} · ${time} ET`;
}


const playedGameKeys = new Set(playedGames.map((game) => gameKey(game.kickoff_utc ?? game.date, game.away_slug, game.home_slug)));
const playedWeekPairs = new Set(playedGames.map((game) => gameKey(weekStart(game.kickoff_utc ?? game.date), game.away_slug, game.home_slug)));
const teamSlugs = new Set(datasetTeams.map((team) => team.slug));
/* Only games between two of the 138 FBS programs render; FBS-vs-FCS results
   still count toward the records above. */
const displayablePlayedGames = playedGames.filter(
  (game) => teamSlugs.has(game.home_slug) && teamSlugs.has(game.away_slug),
);

interface ScheduleRow {
  date: string | null;
  opponent: string;
  opponent_slug: string | null;
  location: "home" | "away" | "neutral" | null;
  site: string | null;
  type: string | null;
  week: number | null;
}

const broadcastIndex = ((bundle.broadcasts ?? { asOf: null, note: null, byPair: {} }) as {
  asOf: string | null;
  note: string | null;
  byPair: Record<string, { tv: string | null; time_et: string | null; status: string; week: number }>;
}).byPair;

export const broadcastAsOf = (bundle.broadcasts as { asOf?: string } | undefined)?.asOf ?? null;
export const broadcastNote = (bundle.broadcasts as { note?: string } | undefined)?.note ?? null;

export interface TvRow {
  date: string;
  away: string;
  home: string;
  tv: string | null;
  time_et: string | null;
  status: string;
  week: number;
}

/** Flat, date-sorted TV designations for the weekly watch board. */
export const tvRows = ((bundle.broadcasts as { rows?: TvRow[] } | undefined)?.rows ?? []) as TvRow[];

export function tvWeeks() {
  return [...new Set(tvRows.map((row) => row.week))].sort((a, b) => a - b);
}

export function tvRowsForWeek(week: number) {
  return tvRows.filter((row) => row.week === week);
}

function broadcastKey(date: string, a: string, b: string) {
  return `${date}:${[a, b].sort().join(":")}`;
}

/* ------------------------------------------------ preseason ratings board */

export interface PreseasonRating {
  sp: { overall: number; rank: number; offense: number | null; defense: number | null; source: string } | null;
  fpi: { value: number | null; rank: number; source: string } | null;
  wins: { projected: number | null; line: number | null; source: string } | null;
  playoff: { outlet: string; value: string | null; source: string } | null;
  notes: string | null;
  as_of: string;
}

export const preseasonRatings = (bundle.preseasonRatings ?? {}) as Record<string, PreseasonRating>;

export function getPreseasonRating(slug: string) {
  return preseasonRatings[slug] ?? null;
}

export function broadcastFor(date: string, awayId: string, homeId: string) {
  return broadcastIndex[broadcastKey(date, awayId, homeId)] ?? null;
}

/** "15:30" -> "3:30 PM ET" */
export function timeEtLabel(timeEt: string | null) {
  if (!timeEt) return null;
  const [hours, minutes] = timeEt.split(":").map(Number);
  if (Number.isNaN(hours)) return null;
  const suffix = hours >= 12 ? "PM" : "AM";
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${String(minutes ?? 0).padStart(2, "0")} ${suffix} ET`;
}

export function reviewedScheduleStatus(status?: string): Game["status"] {
  return status === "postponed" || status === "canceled" || status === "delayed" ? status : "scheduled";
}

function buildScheduledGames(): Game[] {
  const byKey = new Map<string, Game>();
  for (const [homeSlug, rows] of Object.entries(bundle.schedules as Record<string, ScheduleRow[]>)) {
    for (const row of rows) {
      if (row.type === "bye" || !row.date) continue;
      if (row.location === "away") continue; // the opponent's file owns the game
      if (!row.opponent_slug || !teamSlugs.has(row.opponent_slug)) continue;
      if (Date.parse(row.date) < Date.parse("2026-09-06")) continue; // past or already played
      const parts = [homeSlug, row.opponent_slug].sort();
      const key = `${row.date}:${parts[0]}:${parts[1]}`;
      if (byKey.has(key)) continue;
      const isNeutral = row.location === "neutral";
      const homeTeam = isNeutral ? parts[1] : homeSlug;
      const awayTeam = isNeutral ? parts[0] : row.opponent_slug;
      const id = `${row.date}-${awayTeam}-at-${homeTeam}`;
      if (playedGameKeys.has(key) || playedWeekPairs.has(gameKey(weekStart(row.date), awayTeam, homeTeam))) continue;
      const venue =
        row.site ?? `${teams.find((team) => team.slug === homeTeam)?.shortName ?? "Home"} home stadium`;
      const tv = broadcastFor(row.date, awayTeam, homeTeam);
      const timeLabel = timeEtLabel(tv?.time_et ?? null);
      byKey.set(key, {
        id,
        week: row.week ?? seasonWeek(row.date),
        date: easternKickoff(row.date, tv?.time_et ?? null),
        kickoffLabel: timeLabel ? `${kickoffLabel(row.date)} · ${timeLabel}` : kickoffLabel(row.date),
        status: "scheduled" as const,
        statusDetail: row.type === "conference" ? "Conference game" : "Kickoff scheduled",
        awayTeamId: awayTeam,
        homeTeamId: homeTeam,
        venueSlug: homeTeam,
        venue,
        city: "",
        broadcast: tv?.tv ?? null,
        weather: null,
        neutralSite: isNeutral,
        modelHomeWinProbability: 0.5,
        modelUncertainty: 0,
        provenance: derivedProvenance(id),
      });
    }
  }
  // Index once instead of rescanning every schedule for every reviewed matchup.
  const scheduledByWeekPair = new Map<string, string[]>();
  for (const [key, game] of byKey) {
    const pair = gameKey(weekStart(game.date), game.awayTeamId, game.homeTeamId);
    const keys = scheduledByWeekPair.get(pair) ?? [];
    keys.push(key);
    scheduledByWeekPair.set(pair, keys);
  }
  // Official snapshot additions also cover matchups missing from the old schedules.
  const snapshotTime = Date.parse(verifiedRefresh?.retrieved_at ?? "");
  for (const row of verifiedRefresh?.scheduledGames ?? []) {
    // An official TBD keeps a date-only value: no instant, so no invented time.
    const instant = row.kickoff_utc ?? row.date;
    const key = gameKey(instant, row.away, row.home);
    if (playedGameKeys.has(key)) continue;
    const pair = gameKey(weekStart(row.date), row.away, row.home);
    for (const existingKey of scheduledByWeekPair.get(pair) ?? []) byKey.delete(existingKey);
    const id = `${row.date}-${row.away}-at-${row.home}`;
    // An earlier week's game whose kickoff has passed is not a final until verified.
    const status = reviewedScheduleStatus(row.game_status);
    const resultPending = status === "scheduled" && row.kickoff_utc != null && Date.parse(row.kickoff_utc) < snapshotTime;
    byKey.set(key, {
      id, week: row.week, date: instant,
      kickoffLabel: row.kickoff_utc ? playedKickoffLabel(row.date, row.kickoff_utc) : `${kickoffLabel(row.date)} · Kickoff TBA`,
      status,
      statusDetail: resultPending
        ? `Kickoff passed · final not yet verified in this release${row.timing_note ? ` · ${row.timing_note}` : ""}`
        : row.timing_note ?? "Scheduled · verified source snapshot",
      awayTeamId: row.away, homeTeamId: row.home, venueSlug: row.home,
      venue: row.site ?? "Not published", city: "", broadcast: row.tv,
      weather: null, neutralSite: row.neutral_site,
      modelHomeWinProbability: 0.5, modelUncertainty: 0,
      // Each row carries its own last verification; fall back to the base snapshot.
      provenance: { ...derivedProvenance(id), sourceUrl: row.source_url,
        sourceAsOf: row.verified_at ?? verifiedRefresh?.requested_cutoff ?? row.date,
        fetchedAt: row.verified_at ?? verifiedRefresh?.retrieved_at ?? row.date,
        verifiedAt: row.verified_at ?? verifiedRefresh?.retrieved_at ?? row.date },
    });
  }
  if (verifiedRefresh) {
    // Inside every reviewed board week the release is the complete FBS slate.
    const reviewedWeeks = new Set(boardWeeks.map((entry) => weekStart(entry.start)));
    const verifiedKeys = new Set(verifiedRefresh.scheduledGames.map((row) => gameKey(row.kickoff_utc ?? row.date, row.away, row.home)));
    for (const [key, game] of byKey) {
      if (reviewedWeeks.has(weekStart(game.date)) && !verifiedKeys.has(key)) byKey.delete(key);
    }
  }
  return [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export const games: Game[] = [
  ...displayablePlayedGames.map((game) => {
    const home = game.teams.find((team) => team.slug === game.home_slug);
    const away = game.teams.find((team) => team.slug === game.away_slug);
    const id = game.game_id;
    return {
      id,
      week: game.week ?? seasonWeek(game.kickoff_utc ?? game.date),
      date: (game as { kickoff_utc?: string }).kickoff_utc ?? `${game.date}T17:00:00.000Z`,
      kickoffLabel: playedKickoffLabel(easternDate(game.kickoff_utc ?? game.date), game.kickoff_utc ?? undefined),
      status: "final" as const,
      statusDetail: game.title,
      awayTeamId: game.away_slug,
      homeTeamId: game.home_slug,
      awayScore: away?.points,
      homeScore: home?.points,
      venueSlug: game.home_slug,
      venue: game.site ?? `${home?.name ?? "Home"} stadium`,
      city: "",
      broadcast: broadcastFor(easternDate(game.kickoff_utc ?? game.date), game.away_slug, game.home_slug)?.tv ?? game.tv ?? null,
      weather: null,
      neutralSite: game.neutral_site,
      modelHomeWinProbability: 0.5,
      modelUncertainty: 0,
      provenance: {
        ...derivedProvenance(id),
        sourceUrl: game.source_url,
        sourceAsOf: game.meta?.as_of ?? asOf,
        fetchedAt: game.verified_at ?? game.meta?.as_of ?? asOf,
        verifiedAt: game.verified_at ?? game.meta?.as_of ?? asOf,
      },
    };
  }),
  ...buildScheduledGames(),
];

/* ---------------------------------------------------------------- coaches */

interface CoachingDoc {
  head_coach: { name: string | null; title_raw: string | null; first_season: number | null } | null;
}

function coachSlug(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z ]/g, "")
    .trim()
    .replaceAll(" ", "-");
}

/* Head-coach contract research (2026-09-07): supersedes the package coaching
   docs for identity and contract terms when the two disagree — the contract
   file is the later compilation. */
interface ContractRow {
  coach: string;
  salary: number | null;
  start: string | null;
  end: string | null;
  total_value: number | null;
  guaranteed_remaining: number | null;
  buyout: string | null;
  offset_mitigation: boolean | null;
  record_through: string | null;
  notes: string | null;
  sources: string[];
  as_of: string;
}

const contractBySlug = new Map<string, ContractRow>(
  Object.entries((bundle.coachContracts as Record<string, ContractRow>) ?? {}),
);

export const coaches: Coach[] = [];
const handledByContract = new Set<string>();
for (const [teamSlug, doc] of Object.entries(bundle.coaching as Record<string, CoachingDoc>)) {
  const contract = contractBySlug.get(teamSlug);
  const contractName = contract?.coach?.trim() || null;
  const docName = doc.head_coach?.name?.trim() || null;
  // The contract compilation is newer; when it names a different head coach
  // (late-cycle hires), its identity wins.
  const name = contractName ?? docName;
  if (!name) continue;
  if (contract) handledByContract.add(teamSlug);
  const slug = coachSlug(name);
  const wins = winsBySlug.get(teamSlug) ?? 0;
  const losses = lossesBySlug.get(teamSlug) ?? 0;
  coaches.push({
    id: `${slug}-${teamSlug}`,
    slug,
    name,
    teamId: teamSlug,
    title: doc.head_coach?.title_raw ?? "Head Coach",
    contractStart: contract?.start ?? "",
    contractEnd: contract?.end ?? "",
    annualSalary: contract?.salary ?? 0,
    guaranteedRemaining: contract?.guaranteed_remaining ?? 0,
    offsetEstimate: 0,
    mitigationApplies: contract?.offset_mitigation === true,
    hotSeatIndex: 0,
    hotSeatCoverage: 0,
    record: `${wins}–${losses}`,
    timeline: [],
    buyoutSummary: contract?.buyout ?? null,
    totalValue: contract?.total_value ?? null,
    contractAsOf: contract?.as_of ?? null,
    contractNote: contract?.notes ?? null,
    contractSources: contract?.sources ?? [],
    provenance: contract ? derivedProvenance(`contract-${slug}`) : unavailableProvenance(`coach-${slug}`),
  });
}
// Teams with no coaching doc at all still get a coach entry from contracts.
for (const [teamSlug, contract] of contractBySlug) {
  if (handledByContract.has(teamSlug) || !contract?.coach) continue;
  const slug = coachSlug(contract.coach);
  const wins = winsBySlug.get(teamSlug) ?? 0;
  const losses = lossesBySlug.get(teamSlug) ?? 0;
  coaches.push({
    id: `${slug}-${teamSlug}`,
    slug,
    name: contract.coach,
    teamId: teamSlug,
    title: "Head Coach",
    contractStart: contract.start ?? "",
    contractEnd: contract.end ?? "",
    annualSalary: contract.salary ?? 0,
    guaranteedRemaining: contract.guaranteed_remaining ?? 0,
    offsetEstimate: 0,
    mitigationApplies: contract.offset_mitigation === true,
    hotSeatIndex: 0,
    hotSeatCoverage: 0,
    record: `${wins}–${losses}`,
    timeline: [],
    buyoutSummary: contract.buyout ?? null,
    totalValue: contract.total_value ?? null,
    contractAsOf: contract.as_of ?? null,
    contractNote: contract.notes ?? null,
    contractSources: contract.sources ?? [],
    provenance: derivedProvenance(`contract-${slug}`),
  });
}
coaches.sort((a, b) => a.name.localeCompare(b.name));

/* -------------------------------------------------- stadiums & broadcasts */

interface StadiumGuideRow {
  team_slug: string;
  stadium: string;
  city: string;
  address: string;
  capacity: number;
  clear_bag: string;
  parking: string;
  transit: string;
  tailgating: string;
  visitor_section: string;
  accessibility: string;
  notes: string | null;
  last_verified: string;
  sources: string[];
}

export const stadiums: Stadium[] = ((bundle.stadiumGuides ?? []) as StadiumGuideRow[])
  .filter((row) => teamSlugs.has(row.team_slug))
  .map((row) => ({
    slug: row.team_slug,
    name: row.stadium,
    teamId: row.team_slug,
    city: row.city,
    address: row.address,
    capacity: row.capacity,
    parking: row.parking,
    transit: row.transit,
    clearBag: row.clear_bag,
    tailgating: row.tailgating,
    visitorSection: row.visitor_section,
    accessibility: row.accessibility,
    notes: row.notes,
    sources: row.sources,
    lastVerified: row.last_verified,
    provenance: derivedProvenance(`stadium-${row.team_slug}`),
  }));

export const dfsPlayers: DfsPlayer[] = [];

/* --------------------------------------------- local radio flagships */

export interface RadioStation {
  team: string;
  station: string | null;
  frequency: string | null;
  market: string | null;
  network: string | null;
  rights_holder: string | null;
  satellite: string | null;
  stream: string | null;
  notes: string | null;
  sources: string[];
  confidence: string | null;
}

const radioDoc = (bundle.radio ?? { as_of: null, stations: [] }) as {
  as_of: string | null;
  stations: RadioStation[];
};

export const radioStations: RadioStation[] = radioDoc.stations;
export const radioAsOf = radioDoc.as_of;

export function radioForTeam(slug: string) {
  return radioStations.find((station) => station.team === slug) ?? null;
}

/* ------------------------------------------- fantasy/DFS week-1 notes */

export interface FantasyNote {
  id: string;
  player: string;
  team: string;
  position: string | null;
  class: string | null;
  role: string | null;
  usage: string | null;
  availability: string | null;
  injury: string | null;
  projection: { outlet: string | null; value: string | null } | null;
  sources: string[];
  as_of: string | null;
}

const fantasyDoc = (bundle.fantasy ?? { asOf: null, context: null, notes: [] }) as {
  asOf: string | null;
  context: string | null;
  notes: FantasyNote[];
};

export const fantasyNotes: FantasyNote[] = fantasyDoc.notes;
export const fantasyNotesAsOf = fantasyDoc.asOf;
export const fantasyNotesContext = fantasyDoc.context;

export function fantasyNotesForTeam(slug: string) {
  return fantasyNotes.filter((note) => note.team === slug);
}

/** Slugs of every player the fantasy-notes board covers (for route checks). */
export const fantasyPlayerSlugs = new Set(
  fantasyNotes.map((note) =>
    note.player
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z ]/g, "")
      .trim()
      .replaceAll(" ", "-"),
  ),
);

/* ------------------------------------------- surfaces with no dataset data */

/* ------------------------------------------------- rosters & depth charts */

export interface RosterPlayer {
  name: string;
  position: string | null;
  class: string | null;
  jersey: number | null;
  height: string | null;
  weight: string | null;
  stars: number | null;
  hometown: string | null;
}

export interface TeamRoster {
  head_coach: string | null;
  counts: { players: number; with_stars: number; with_high_school: number } | null;
  position_groups: Array<{ name: string; players: RosterPlayer[] }>;
}

export interface DepthSlotEntry {
  rank: number;
  co_listed: boolean;
  players: Array<{ name: string; class: string | null; stars: number | null }>;
}

export interface TeamDepthChart {
  status: string | null;
  status_caveat: string | null;
  schemes: { offense: string | null; defense: string | null; special_teams: string | null } | null;
  units: Array<{ unit: string; positions: Array<{ position: string; depth: DepthSlotEntry[] }> }>;
}

export interface InjuryEntry {
  name: string;
  position: string | null;
  status: string | null;
  injury: string | null;
}

export interface TeamInjuries {
  slug: string;
  opponent_context: string | null;
  players: InjuryEntry[];
}

export interface TeamSeasonRow {
  season: string;
  g: number | null;
  op: number | null;
  dp: number | null;
  oy: number | null;
  dy: number | null;
}

const rosterBySlug = bundle.rosters as Record<string, TeamRoster>;
const depthBySlug = bundle.depthCharts as Record<string, TeamDepthChart>;
const injuriesBySlug = new Map<string, TeamInjuries>(
  ((bundle.injuries as { as_of_date: string | null; teams: TeamInjuries[] }).teams ?? []).map(
    (team) => [team.slug, team],
  ),
);

export const injuriesAsOf = (bundle.injuries as { as_of_date: string | null }).as_of_date;

export function getRoster(slug: string): TeamRoster | undefined {
  return rosterBySlug[slug];
}

export function getDepthChart(slug: string): TeamDepthChart | undefined {
  return depthBySlug[slug];
}

export function getInjuries(slug: string): TeamInjuries | undefined {
  return injuriesBySlug.get(slug);
}

const historicalBySeason = bundle.historical as Record<string, Array<{ slug: string | null; g: number | null; op: number | null; dp: number | null; oy: number | null; dy: number | null }>>;

/** Most-recent-first season rows for one team across all historical seasons. */
export function getTeamSeasons(slug: string): TeamSeasonRow[] {
  return Object.keys(historicalBySeason)
    .sort()
    .reverse()
    .map((season) => {
      const row = historicalBySeason[season].find((team) => team.slug === slug);
      return row ? { season, g: row.g, op: row.op, dp: row.dp, oy: row.oy, dy: row.dy } : null;
    })
    .filter((row): row is TeamSeasonRow => row !== null);
}

export interface TeamRatingRow {
  season: string;
  feiRank: number | null;
  fei: number | null;
  spRank: number | null;
  spPlus: number | null;
  record: string | null;
}

export interface TeamLeaderRow {
  season: string;
  category: string;
  player: string | null;
  rank: number | null;
}

const ratingsBySlug = bundle.teamRatings as Record<string, TeamRatingRow[]>;
const leadersBySlug = bundle.teamLeaders as Record<string, TeamLeaderRow[]>;

/** FEI / SP+ finishes per team, most recent season first. */
export function getTeamRatings(slug: string): TeamRatingRow[] {
  return ratingsBySlug[slug] ?? [];
}

/** Top-10 individual leaderboard finishes by this team's players, latest first. */
export function getTeamLeaders(slug: string): TeamLeaderRow[] {
  return leadersBySlug[slug] ?? [];
}

/* ------------------------------------------------------------- polls (full) */

export interface PollRanking {
  rank: number;
  team_slug: string | null;
  team: string;
  record: string | null;
  points: number | null;
  first_place_votes: number | null;
  previous_rank: number | null;
  tied: boolean;
}

export interface PollTable {
  poll: string;
  name: string;
  release_date: string | null;
  rankings: PollRanking[];
  others: Array<{ team: string; team_slug: string | null; points: number | null }>;
}

export const pollTables = bundle.polls as PollTable[];
export interface ConferenceStandingRow {
  team: string;
  team_slug: string | null;
  w: string;
  l: string;
  t: string;
  pct: string;
  overall?: string | null;
}
export interface ConferenceStanding {
  slug: string;
  name: string;
  short: string;
  rows: ConferenceStandingRow[];
}
export const conferenceStandings = (bundle.conferenceStandings ?? []) as ConferenceStanding[];
export const pollsStatusNote = (bundle.pollsStatus as string | null) ?? null;
export const sosAsOf = (bundle.sosAsOf as string | null) ?? null;

/* -------------------------------------------------- coaching staff & players */

export interface StaffMemberRow {
  role: string | null;
  role_raw: string | null;
  name: string;
}

const staffBySlug: Record<string, { staff: StaffMemberRow[]; schemes: { offense: string | null; defense: string | null } | null }> = {};
for (const [slug, doc] of Object.entries(bundle.coaching as Record<string, CoachingDoc & { staff?: StaffMemberRow[]; schemes?: { offense: string | null; defense: string | null } | null }>)) {
  staffBySlug[slug] = { staff: doc.staff ?? [], schemes: doc.schemes ?? null };
}

export function getStaff(slug: string): StaffMemberRow[] {
  return staffBySlug[slug]?.staff ?? [];
}

export function getSchemes(slug: string): { offense: string | null; defense: string | null } | null {
  return staffBySlug[slug]?.schemes ?? null;
}

/* --------------------------------------------------------- player search */

export interface PlayerIndexEntry {
  n: string;
  t: string;
  p: string | null;
}

const playerIndex = bundle.playerIndex as PlayerIndexEntry[];

/** Case-insensitive substring search across every rostered player. */
export function searchPlayers(query: string, limit = 8): Array<PlayerIndexEntry & { teamName: string }> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const out: Array<PlayerIndexEntry & { teamName: string }> = [];
  for (const entry of playerIndex) {
    if (entry.n.toLowerCase().includes(needle)) {
      const team = datasetTeams.find((candidate) => candidate.slug === entry.t);
      out.push({ ...entry, teamName: team?.display_name ?? entry.t });
      if (out.length >= limit) break;
    }
  }
  return out;
}

export const seasonRules: SeasonRules = {
  id: "season-2026",
  season: 2026,
  label: "2026 season · 12-team College Football Playoff",
  playoffTeams: 12,
  byes: 4,
  membershipVersion: "2026-fbs-138",
  seedingVersion: "cfp-12-team-format",
  sourceStatus: "verified",
  asOf,
};

export const scenarioGames: ScenarioGame[] = games
  .filter((game) => game.status === "scheduled" && easternDate(game.date) >= (verifiedRefresh?.reference_date ?? "2026-09-05"))
  .slice(0, 24)
  .map((game) => ({
    id: game.id,
    awayTeamId: game.awayTeamId,
    homeTeamId: game.homeTeamId,
    week: game.week,
  }));

export const providerHealth: ProviderHealth[] = [
  {
    id: "cfb-apex-dataset",
    label: "CFB Apex 2026 research dataset",
    mode: "production",
    status: "operational",
    lastSuccess: verifiedRefresh?.retrieved_at.slice(0, 10) ?? asOf,
    cadence: "Per verified snapshot release",
    note: `Vendored at build time (138 FBS teams, schedules, polls, coaching, SOS, season results). Current snapshot: week ${verifiedRefresh?.week ?? "—"} retrieved ${verifiedRefresh?.retrieved_at ?? asOf}.`,
  },
  {
    id: "production-sports",
    label: "Supplemental scoreboard snapshot",
    mode: "production",
    status: "degraded",
    lastSuccess: null,
    cadence: "Fetched once per page load; per-isolate cache",
    note: "The main scoreboard uses verified snapshots. Supplemental widgets read a partial TrueAPI/TheSportsDB feed, reconcile unique game identities to verified kickoff/venue/final facts, and withhold unverified scores. Upstream observation age is unknown; this is not continuous live scoring.",
  },
];

/* ---------------------------------------------------------------- getters */

export function getTeam(teamId: string) {
  const team = teams.find((candidate) => candidate.id === teamId);
  if (!team) throw new Error(`Unknown dataset team id: ${teamId}`);
  return team;
}

export function getTeamBySlug(slug: string) {
  return teams.find((team) => team.slug === slug);
}

export function getGame(gameId: string) {
  const canonicalId = verifiedRefresh?.gameAliases?.[gameId] ?? gameId;
  return games.find((game) => game.id === canonicalId);
}

export function getCoachBySlug(slug: string) {
  return coaches.find((coach) => coach.slug === slug);
}

export function getStadiumBySlug(slug: string): Stadium | undefined {
  return stadiums.find((stadium) => stadium.slug === slug);
}

/* ------------------------------------------------ team-hub schedule view */

export interface TeamScheduleGame {
  id: string;
  date: string | null;
  week: number | null;
  opponent: string | null;
  opponentSlug: string | null;
  homeAway: "home" | "away" | "neutral" | null;
  isBye: boolean;
  result: string | null;
  kickoffLabel: string | null;
  broadcast: string | null;
  venue: string | null;
  href: string | null;
}

export function getTeamSchedule(slug: string): TeamScheduleGame[] | null {
  const rows = (bundle.schedules as Record<string, ScheduleRow[]>)[slug];
  if (!rows) return null;
  return rows.map((row, index) => {
    const played = playedGames.find(
      (game) =>
        game.date === row.date &&
        ((game.home_slug === slug && game.away_slug === row.opponent_slug) ||
          (game.away_slug === slug && game.home_slug === row.opponent_slug)),
    );
    const ownScore = played?.teams.find((team) => team.slug === slug)?.points;
    const otherScore = played?.teams.find((team) => team.slug !== slug)?.points;
    const broadcast = row.date && row.opponent_slug ? broadcastFor(row.date, slug, row.opponent_slug) : null;
    const displayGame = games.find(
      (game) =>
        // Compare Eastern calendar dates: a Tuesday 8 PM ET kickoff is Wednesday in UTC.
        easternDate(game.date) === (row.date ?? "not-published") &&
        ((game.homeTeamId === slug && game.awayTeamId === row.opponent_slug) ||
          (game.awayTeamId === slug && game.homeTeamId === row.opponent_slug)),
    );
    const venueTeam = row.location === "home" ? slug : row.location === "away" ? row.opponent_slug : null;
    return {
      id: `${slug}-${row.date ?? "undated"}-${index}`,
      date: row.date,
      week: row.week ?? (row.date ? Math.floor((Date.parse(row.date) - Date.parse("2026-08-24")) / 604_800_000) : null),
      opponent: row.opponent ?? null,
      opponentSlug: row.opponent_slug,
      homeAway: row.location,
      isBye: row.type === "bye",
      result:
        ownScore != null && otherScore != null
          ? `${ownScore > otherScore ? "W" : ownScore < otherScore ? "L" : "T"} ${ownScore}–${otherScore}`
          : null,
      kickoffLabel: timeEtLabel(broadcast?.time_et ?? null),
      broadcast: broadcast?.tv ?? played?.tv ?? null,
      venue: row.site ?? played?.site ?? stadiums.find((stadium) => stadium.teamId === venueTeam)?.name ?? null,
      href: displayGame ? `/games/${displayGame.id}` : null,
    };
  });
}

/** True when the model-estimate surfaces have published numbers behind them. */
export const modelEstimatesAvailable = false;
