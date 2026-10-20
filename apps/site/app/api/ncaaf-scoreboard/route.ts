import { boardWeeks, games, teams, verifiedRefresh } from "@/lib/cfb-dataset";
import { mergeNcaafFeeds, reconcileNcaafEvents, windowThisWeek, type NcaafGameEvent, type NcaafScoreboardPayload, type TsdbRawEvent } from "@/lib/ncaaf-scoreboard";

// This is a partial supplemental snapshot, not a continuously observed live feed.
const CACHE_TTL_MS = 60_000;
const UPSTREAM_TIMEOUT_MS = 6_000;
const INGEST_BASE = process.env.TRUEAPI_INGEST_BASE || "https://ingest.oakandmain.dev";
let cached: { at: number; payload: NcaafScoreboardPayload } | null = null;
interface Feed { events: TsdbRawEvent[]; fetchedAt: string | null }
const names = new Map(teams.map((team) => [team.id, team.shortName]));
// Every reviewed board week (the current week and its archive) reconciles.
const reviewedWeeks = new Set(boardWeeks.map((entry) => entry.week));
const canonical: NcaafGameEvent[] = games.filter((game) => reviewedWeeks.has(game.week) && (game.status === "final" || game.status === "scheduled")).map((game) => ({
  id: game.id, utc: game.date, home: names.get(game.homeTeamId) ?? game.homeTeamId,
  away: names.get(game.awayTeamId) ?? game.awayTeamId, homeScore: game.homeScore ?? null,
  awayScore: game.awayScore ?? null, state: game.status === "final" ? "final" : "scheduled",
  statusLabel: game.status === "final" ? game.statusDetail : null, venue: game.venue,
}));
/** Builds the empty-events fallback payload, stamping its snapshot labels (canonicalAsOf/finalsAsOf) from the reviewed dataset, not from this request's fetch time. */
function envelope(nowMs: number): NcaafScoreboardPayload {
  return { events: [], asOf: null, fetchedAt: new Date(nowMs).toISOString(), upstreamFetchedAt: [],
    canonicalAsOf: verifiedRefresh?.schedule_verified_at ?? verifiedRefresh?.retrieved_at ?? null,
    finalsAsOf: verifiedRefresh?.results_verified_at ?? verifiedRefresh?.retrieved_at ?? null,
    source: "none", degraded: true, coverage: "partial", withheldCount: 0 };
}
async function fetchFeed(url: string, ingest: boolean): Promise<Feed | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS), headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const body = await response.json() as { events?: unknown; data?: { events?: unknown }; fetchedAt?: unknown; fetched_at?: unknown };
    const events = ingest ? body.data?.events : body.events;
    if (!Array.isArray(events)) return null;
    // Ingest retrieval metadata is useful, but is not a game observation time.
    const fetched = body.fetchedAt ?? body.fetched_at;
    const fetchedAt = typeof fetched === "string" && Number.isFinite(Date.parse(fetched)) ? fetched : null;
    return { events: events.filter((event): event is TsdbRawEvent => typeof event === "object" && event !== null), fetchedAt };
  } catch { return null; }
}
async function resolveFeed(key: string, endpoint: string): Promise<Feed | null> {
  const ingest = await fetchFeed(`${INGEST_BASE}/data/thesportsdb${endpoint}`, true);
  if (ingest && ingest.events.length > 0) return ingest;
  return fetchFeed(`https://www.thesportsdb.com/api/v1/json/${key}${endpoint}`, false);
}
/** Serves the cached, reconciled NCAAF scoreboard snapshot, refetching upstream feeds at most once per CACHE_TTL_MS. */
export async function GET() {
  const nowMs = Date.now();
  if (cached && nowMs - cached.at < CACHE_TTL_MS) return Response.json(cached.payload, { headers: { "Cache-Control": "public, max-age=30" } });
  let payload = envelope(nowMs);
  const key = process.env.THESPORTSDB_API_KEY;
  if (key) {
    const [next, past] = await Promise.all([
      resolveFeed(key, "/eventsnextleague.php?id=4479"), resolveFeed(key, "/eventspastleague.php?id=4479"),
    ]);
    if (next || past) {
      const reconciled = reconcileNcaafEvents(mergeNcaafFeeds(next?.events ?? [], past?.events ?? []), canonical);
      payload = { ...payload, ...reconciled, events: windowThisWeek(reconciled.events, nowMs), source: "thesportsdb",
        upstreamFetchedAt: [next?.fetchedAt, past?.fetchedAt].filter((value): value is string => typeof value === "string"),
        degraded: next == null || past == null };
    }
  }
  cached = { at: nowMs, payload };
  return Response.json(payload, { headers: { "Cache-Control": "public, max-age=30" } });
}
