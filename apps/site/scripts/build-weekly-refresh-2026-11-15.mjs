// Weekly refresh builder: Week 11 finals, Week 12 slate, November 15 polls.
//
// Fetches every required source once with a receipt, reconciles the reviewed
// snapshot from those receipts, and writes:
//   data/cfb-2026/refresh/evidence/2026-11-15-week11-refresh.json
//   data/cfb-2026/refresh/evidence/2026-11-15-full-season-audit.json
//   data/cfb-2026/refresh/verified-refresh.json
//
// Usage: node scripts/build-weekly-refresh-2026-11-15.mjs <scratch-dir>
// The scratch dir holds the raw downloaded responses (never committed).
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { reconcileGameDay, editorialComposite } from "./reconcile-gameday.mjs";
import { htmlTables, htmlText, ncaaInventory, tvPattern } from "./gameday-source-validation.mjs";

// The AP and AFCA Coaches poll edition this release publishes (provider date,
// YYYY-MM-DD). Every poll-date assertion and label below derives from it.
const POLL_EDITION_DATE = "2026-11-15";
// The edition both polls carried in the base snapshot. The AP edition stays on
// it when the provider has not published a newer AP poll (see "Poll editions").
const PRIOR_POLL_EDITION_DATE = "2026-11-08";
const SCRIPT_ID = "weekly-refresh-2026-11-15";
const POLL_EDITION_LABEL = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric" }).format(new Date(`${POLL_EDITION_DATE}T12:00:00Z`));
const POLL_EDITION_YEAR = POLL_EDITION_DATE.slice(0, 4);

const SCRATCH = process.argv[2];
assert.ok(SCRATCH && !SCRATCH.includes("CFB-Apex"), "Pass a scratch directory outside the repository");
mkdirSync(SCRATCH, { recursive: true });

// The cutoff is stamped after the retrieval window completes: every receipt
// below precedes it, and the snapshot describes the data as of that moment.
let CUT = new Date(Date.now() + 0).toISOString();
console.log("retrieval start:", CUT);

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
// The base is always the snapshot main publishes. A re-capture after the
// two-hour receipt window therefore rebuilds from main, never on top of an
// earlier run of this same script.
const repoRoot = new URL("../../..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const publishedSnapshot = JSON.parse(execSync("git show origin/main:apps/site/data/cfb-2026/refresh/verified-refresh.json", { encoding: "utf8", maxBuffer: 1024 * 1024 * 512, cwd: repoRoot }));
const workingSnapshot = read("data/cfb-2026/refresh/verified-refresh.json");
const snapshot = workingSnapshot.refresh_log.at(-1).script === SCRIPT_ID ? structuredClone(publishedSnapshot) : workingSnapshot;
assert.notEqual(snapshot.refresh_log.at(-1).script, SCRIPT_ID, "base snapshot already carries this release");
assert.equal(snapshot.refresh_log.at(-1).script, "weekly-refresh-2026-11-08", "base snapshot is the November 8 release");
const priorEvidence = read("data/cfb-2026/refresh/evidence/2026-10-20-week8-release.json");
const ids = new Map(priorEvidence.conferences.flatMap(c => c.rows).map(r => [r.id, r.slug]));
if (ids.size !== 138) throw new Error(`Registry size ${ids.size}`);
const slugOf = espnId => { const slug = ids.get(espnId); if (!slug) return null; return slug; };
const espnIdOf = slug => { for (const [id, s] of ids) if (s === slug) return id; return null; };

const etDate = value => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
const etTime = value => new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));

// ---------------------------------------------------------------- fetch layer
const receipts = [];
const docs = new Map();
const RECEIPTS_FILE = join(SCRATCH, "receipts.json");
function loadReceipts() {
  if (!existsSync(RECEIPTS_FILE)) return [];
  return JSON.parse(readFileSync(RECEIPTS_FILE, "utf8"));
}
function persistReceipt(receipt) {
  const all = loadReceipts().filter(r => r.id !== receipt.id);
  all.push(receipt);
  writeFileSync(RECEIPTS_FILE, JSON.stringify(all, null, 1));
}
async function grab(id, url) {
  const cached = join(SCRATCH, `${id}.body`);
  if (existsSync(cached)) {
    const body = readFileSync(cached, "utf8");
    docs.set(id, body);
    const saved = loadReceipts().find(r => r.id === id);
    assert.ok(saved, `cached body without receipt: ${id}`);
    receipts.push(saved);
    return saved;
  }
  // Some official sites answer an occasional 403 from their bot filter. A
  // receipt is only ever a 200; a non-200 or a dropped connection is retried
  // twice, a few seconds apart, before the build stops.
  let response, lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, 4_000 * attempt));
    try {
      response = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 CFB-Apex-verification/1.0", accept: "text/html,application/json;q=0.9,*/*;q=0.8" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 200) break;
      await response.arrayBuffer().catch(() => {});
    } catch (error) { lastError = error; response = undefined; }
  }
  assert.ok(response, `${id}: ${url} ${lastError?.message ?? ""}`);
  assert.equal(response.status, 200, `${id}: ${url}`);
  const body = await response.text();
  writeFileSync(cached, body);
  const receipt = { id, url, resolvedUrl: response.url, status: response.status, checkedAt: new Date().toISOString(), sha256: createHash("sha256").update(body).digest("hex"), bytes: body.length, serverDate: response.headers.get("date"), age: response.headers.get("age") };
  persistReceipt(receipt);
  receipts.push(receipt);
  docs.set(id, body);
  return receipt;
}
async function batched(items, size = 6) {
  const out = [];
  for (let offset = 0; offset < items.length; offset += size) {
    const rows = await Promise.all(items.slice(offset, offset + size).map(([id, url]) => grab(id, url)));
    out.push(...rows);
    process.stdout.write(`fetched ${Math.min(offset + size, items.length)}/${items.length}\r`);
  }
  process.stdout.write("\n");
  return out;
}

// ---------------------------------------------------------------- sources
const espnDay = ymd => ["site.api.espn.com", "scoreboard", `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=${ymd}&groups=80&limit=200`];
const daily = [];
// Season calendar days through the Week 12 board (Aug 22 .. Nov 22). Days
// through Nov 15 are the completed-season audit trail (Week 11 ended with a
// Sunday, November 15 game); Nov 17-21 carry the upcoming Week 12 slate.
for (let d = new Date("2026-08-22T00:00:00Z"); d <= new Date("2026-11-22T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
  const ymd = d.toISOString().slice(0, 10).replaceAll("-", "");
  const prefix = ymd >= "20261110" && ymd <= "20261122" ? "day" : "history";
  daily.push([`${prefix}-${ymd}`, espnDay(ymd)[2]]);
}
const weekly = [
  ["espn-standings", "https://site.web.api.espn.com/apis/v2/sports/football/college-football/standings?season=2026&level=3&group=80"],
  ["rankings", "https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings?seasons=2026"],
  // The provider's own Week 11 document: the receipt for the AP edition that
  // is kept while no newer AP edition is published.
  ["rankings-ap-prior", "https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings?seasons=2026&weeks=11&types=2"],
  ["ap-ncaa", "https://www.ncaa.com/rankings/football/fbs/associated-press"],
  ["coaches", "https://sportsdata.usatoday.com/football/ncaaf/coaches-poll"],
  ["tv-ncaa", "https://www.ncaa.com/news/football/article/college-football-tv-schedule-game-times-preview"],
  ["ncaa-standings", "https://www.ncaa.com/standings/football/fbs"],
  ["stat-passing", "https://www.ncaa.com/stats/football/fbs/current/individual/453"],
  ["stat-rushing", "https://www.ncaa.com/stats/football/fbs/current/individual/469"],
  ["stat-scoring", "https://www.ncaa.com/stats/football/fbs/current/team/27"],
  ["stat-defense", "https://www.ncaa.com/stats/football/fbs/current/team/28"],
  ["cfp-format", "https://collegefootballplayoff.com/news/2026/1/23/2627-format"],
  ["cfp-bracket", "https://collegefootballplayoff.com/sports/2026/8/9/bracket-place-holder"],
  ["cfp-dates", "https://www.ncaa.com/news/football/article/2026-08-10/when-do-college-football-playoff-rankings-come-out"],
  ["standing-bigten", "https://bigten.org/standings.aspx?path=football"],
  ["standing-big12", "https://admin.big12sports.com/standings.aspx?path=football"],
  ["standing-cusa", "https://admin.conferenceusa.com/standings.aspx?path=football"],
  ["standing-american", "https://theamerican.org/standings.aspx?path=football"],
  ["standing-mac", "https://getsomemaction.com/standings.aspx?path=football"],
  ["standing-mw", "https://mountainwest.sidearmsports.com/standings.aspx?path=football"],
  ["standing-pac12", "https://pac-12.com/standings.aspx?path=football"],
  ["standing-acc3", "https://admin.theacc.com/standings.aspx?path=football"],
  ["official-sunbelt", "https://sunbeltsports.org/stats.aspx?path=football&year=2026"],
  ["ndsu-membership", "https://gobison.com/sports/2026/2/9/fbs-frequently-asked-questions"],
  ["sac-membership", "https://hornetsports.com/news/2026/2/16/hornet-football-to-join-the-mac-in-2026.aspx"],
  ["availability-rules", "https://bigtensports.sidearmsports.com/news/2026/8/28/big-ten-announces-changes-to-football-availability-reporting-process.aspx"],
  // Host school schedule that settles a provider/NCAA kickoff disagreement.
  ["school-oklahoma", "https://soonersports.com/sports/football/schedule"],
  ["school-western-michigan", "https://wmubroncos.com/sports/football/schedule"],
  ["school-buffalo", "https://ubbulls.com/sports/football/schedule"],
  ["school-air-force", "https://goairforcefalcons.com/sports/football/schedule"],
];
const ncaaWeeks = [];
for (let week = 1; week <= 12; week++) ncaaWeeks.push([week < 10 ? `ncaa-history-${week}` : `ncaa${week}`, `https://www.ncaa.com/scoreboard/football/fbs/2026/${String(week).padStart(2, "0")}/all-conf`]);

await batched(daily, 6);
await batched(ncaaWeeks, 4);
await batched(weekly, 6);
assert.ok(receipts.every(r => r.status === 200), "every required source answered 200");
const freshest = Math.max(...receipts.map(r => Date.parse(r.checkedAt)));
CUT = new Date(freshest + 1000).toISOString();
const CUT_MS = Date.parse(CUT);
assert.ok(receipts.every(r => CUT_MS - Date.parse(r.checkedAt) > 0), "receipt clocks precede the cutoff");
console.log("sources:", receipts.length, "cutoff:", CUT, "(freshest receipt +1s)");

// ------------------------------------------------------------ season events
const eventsByDay = new Map();
for (const [id] of daily) eventsByDay.set(id.slice(-8), JSON.parse(docs.get(id)).events ?? []);
const allEvents = [...eventsByDay.values()].flat();
assert.equal(new Set(allEvents.map(e => e.id)).size, allEvents.length, "duplicate provider event across days");
const eventById = new Map(allEvents.map(e => [e.id, e]));

// NCAA inventory: week -> rows; contestId -> row
const inventories = new Map();
const ncaaByContest = new Map();
for (const [id, url] of ncaaWeeks) {
  const week = Number(url.match(/fbs\/2026\/(\d+)/)[1]);
  const rows = ncaaInventory(docs.get(id), 2026, week);
  for (const row of rows) {
    assert.ok(!ncaaByContest.has(row.contestId), `duplicate NCAA contest ${row.contestId}`);
    ncaaByContest.set(row.contestId, { ...row, week, sourceId: id });
  }
  inventories.set(week, rows);
}

// Match every ESPN event to an NCAA contest. The NCAA seoname -> team slug
// table is lifted from the reviewed prior full-season audit (every FBS team
// appears there), so the join is exact: same week, kickoff instant (or a
// unique same-day team match for the few differing listed instants), and both
// sides' identities. Ambiguous pairs fail loudly instead of guessing.
const priorAudit = read("data/cfb-2026/refresh/evidence/2026-10-28-full-season-audit.json");
const seonameToSlug = new Map();
for (const row of priorAudit.finals) {
  for (const team of row.ncaa_teams) {
    const slug = team.isHome ? row.home_slug : row.away_slug;
    if (!slug) continue; // FCS side: no verified slug
    const existing = seonameToSlug.get(team.seoname);
    if (existing) assert.equal(existing, slug, `conflicting seoname mapping ${team.seoname}`);
    seonameToSlug.set(team.seoname, slug);
  }
}
const coveredSlugs = new Set(seonameToSlug.values());
assert.equal(coveredSlugs.size, 138, `seoname table covers ${coveredSlugs.size} of 138 teams`);
const eventMatch = new Map();
const ncaaUsed = new Set();
const unmatched = [];
const listingDiffs = [];
for (const event of allEvents) {
  const competition = event.competitions[0];
  const home = competition.competitors.find(t => t.homeAway === "home");
  const away = competition.competitors.find(t => t.homeAway === "away");
  const homeSlug = slugOf(home.team.id), awaySlug = slugOf(away.team.id);
  const sameWeek = row => row.week === event.week?.number;
  const exact = row => sameWeek(row) && Date.parse(event.date) === row.startTimeEpoch * 1000;
  const sidesAgree = row => {
    const ncaaHome = row.teams.find(t => t.isHome), ncaaAway = row.teams.find(t => !t.isHome);
    const sideOk = (seoname, slug) => slug ? seonameToSlug.get(seoname) === slug : !seonameToSlug.has(seoname);
    const direct = sideOk(ncaaHome.seoname, homeSlug) && sideOk(ncaaAway.seoname, awaySlug);
    const flipped = sideOk(ncaaHome.seoname, awaySlug) && sideOk(ncaaAway.seoname, homeSlug);
    return direct || flipped;
  };
  let candidates = [...ncaaByContest.values()].filter(row => exact(row) && sidesAgree(row));
  if (candidates.length === 0) {
    // Same playing date and week with a unique matching team pair; the listed
    // instants may differ and stay separate observations downstream.
    const dayCandidates = [...ncaaByContest.values()].filter(row => sameWeek(row) && etDate(row.startTimeEpoch * 1000) === etDate(event.date) && sidesAgree(row));
    if (dayCandidates.length === 1) candidates = dayCandidates;
    else if (dayCandidates.length === 0) {
      // Last resort: a unique same-week sides match even where the boards
      // disagree about the listed date; recorded as a reviewed difference.
      const weekCandidates = [...ncaaByContest.values()].filter(row => sameWeek(row) && sidesAgree(row));
      if (weekCandidates.length === 1) { candidates = weekCandidates; listingDiffs.push(event.id); }
    }
  }
  assert.ok(candidates.length <= 1, `ambiguous NCAA match for ${event.id}: ${candidates.map(r => r.contestId)}`);
  if (candidates.length === 1) {
    eventMatch.set(event.id, candidates[0].contestId);
    ncaaUsed.add(candidates[0].contestId);
  } else unmatched.push(event.id);
}
console.log("listed-date differences:", listingDiffs.join(", ") || "none");
console.log("matched NCAA contests:", eventMatch.size, "of", allEvents.length, "events; unmatched:", unmatched.length);
if (unmatched.length) console.log("unmatched ids:", unmatched.slice(0, 12).join(", "), unmatched.length > 12 ? `(+${unmatched.length - 12} more)` : "");

// ---------------------------------------------------------------- TV tokens
const TV = { "CBS Sports Network": "CBSSN", "CBSSN": "CBSSN", "The CW": "CW", "CW": "CW", "FOX": "Fox", "ESPN2": "ESPN2", "ESPN U": "ESPNU", "ESPNU": "ESPNU", "ESPN News": "ESPNEWS", "ESPNEWS": "ESPNEWS", "ESPN+": "ESPN+", "ESPN Plus": "ESPN+", "USA Network": "USA Net", "USA": "USA Net", "Big Ten Network": "BTN", "BTN": "BTN", "SEC Network": "SEC Network", "SECN": "SEC Network", "ACC Network": "ACC Network", "ACCN": "ACC Network", "ACC Network Extra": "ACC Network Extra", "FS1": "FS1", "ESPN": "ESPN", "ABC": "ABC", "CBS": "CBS", "NBC": "NBC", "Peacock": "Peacock", "TNT": "TNT", "truTV": "truTV", "Mountain West Network": "MW+", "MW+": "MW+", "The Murkin": "The Murkin" };
const broadcastOf = competition => {
  const names = competition.broadcasts?.flatMap(b => b.names) ?? [];
  const tokens2 = names.map(n => TV[n] ?? n);
  return [...new Set(tokens2)].join(" / ") || null;
};

// ------------------------------------------------------------ week boundaries
// Week 11 ended on Sunday, November 15: Ole Miss at Oklahoma moved off its
// Saturday listing, so that provider day belongs to the week.
const WEEK_DAYS = { 11: ["20261110", "20261111", "20261112", "20261113", "20261114", "20261115"], 12: ["20261117", "20261118", "20261119", "20261120", "20261121"] };
const weekEvents = week => WEEK_DAYS[week].flatMap(d => eventsByDay.get(d) ?? []);
for (const week of [11, 12]) {
  assert.equal(allEvents.filter(e => e.week?.number === week).length, weekEvents(week).length, `week ${week} events outside its reviewed provider days`);
  assert.ok(weekEvents(week).every(e => e.week?.number === week), `foreign event on a week ${week} provider day`);
}

// Poll editions. The Coaches edition must be the new one. The AP edition is
// taken only when the provider publishes it; otherwise the base snapshot's AP
// edition stays, with its own release date, and the release says so.
const rankingsDoc = JSON.parse(docs.get("rankings"));
const apNewEdition = rankingsDoc.rankings.find(p => p.id === "1") ?? null;
const coachesEdition = rankingsDoc.rankings.find(p => p.id === "2");
assert.ok(coachesEdition, "Coaches edition present");
assert.equal(coachesEdition.date.slice(0, 10), POLL_EDITION_DATE, "Coaches edition");
const AP_PUBLISHED = apNewEdition != null && apNewEdition.date.slice(0, 10) > PRIOR_POLL_EDITION_DATE;
if (apNewEdition && !AP_PUBLISHED) assert.equal(apNewEdition.date.slice(0, 10), PRIOR_POLL_EDITION_DATE, "AP edition older than the base snapshot");
const basePolls = snapshot.polls.filter(p => p.poll !== "composite");
const baseAp = basePolls.find(p => p.poll === "ap");
const baseCoaches = basePolls.find(p => p.poll === "coaches");
assert.equal(baseAp.release_date, PRIOR_POLL_EDITION_DATE, "base AP edition");
assert.equal(baseCoaches.release_date, PRIOR_POLL_EDITION_DATE, "base Coaches edition");
// The provider's Week 11 document still carries the kept AP edition row for row.
const apPriorEdition = JSON.parse(docs.get("rankings-ap-prior")).rankings.find(p => p.id === "1");
assert.ok(apPriorEdition && apPriorEdition.date.slice(0, 10) === PRIOR_POLL_EDITION_DATE, "provider Week 11 AP edition");
assert.equal(apPriorEdition.ranks.length, baseAp.rankings.length, "provider Week 11 AP rows");
apPriorEdition.ranks.forEach((r, i) => {
  const row = baseAp.rankings[i];
  assert.equal(slugOf(r.team.id), row.team_slug, `kept AP team ${row.rank}`);
  assert.equal(r.current, row.rank); assert.equal(r.points, row.points); assert.equal(r.recordSummary, row.record);
});
// Pregame ranks for the Week 11 finals come from the edition that preceded
// those games (November 8). Week 12 pairings use the current AP edition.
const pregameApRanks = new Map(baseAp.rankings.map(r => [r.team_slug, r.rank]));
const apRanks = AP_PUBLISHED ? new Map(apNewEdition.ranks.map(r => [slugOf(r.team.id), r.current])) : pregameApRanks;
console.log("AP edition published:", AP_PUBLISHED, "| provider default document polls:", rankingsDoc.rankings.map(p => `${p.id}@${p.date.slice(0, 10)}`).join(", "));

function playedRow(event) {
  const competition = event.competitions[0];
  const home = competition.competitors.find(t => t.homeAway === "home");
  const away = competition.competitors.find(t => t.homeAway === "away");
  const homeSlug = slugOf(home.team.id), awaySlug = slugOf(away.team.id);
  assert.ok(homeSlug && awaySlug, `non-FBS event in finals path ${event.id}`);
  const contestId = eventMatch.get(event.id);
  assert.ok(contestId, `no NCAA contest for ${event.id}`);
  const ncaaRow = ncaaByContest.get(contestId);
  const game = {
    provider_id: event.id,
    source_url: event.sourceUrl ?? `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=${etDate(event.date).replaceAll("-", "")}&groups=80&limit=200`,
    // Game ids never change: a final keeps the id its scheduled row published.
    game_id: publishedGameId(event.id, homeSlug, awaySlug) ?? `${etDate(event.date)}-${awaySlug}-at-${homeSlug}`,
    date: etDate(event.date),
    kickoff_utc: event.date,
    week: event.week.number,
    home_slug: homeSlug, away_slug: awaySlug,
    site: competition.venue?.fullName ?? null,
    tv: broadcastOf(competition),
    neutral_site: competition.neutralSite === true,
    verified_at: CUT,
    title: competition.status.type.description,
    teams: [home, away].map(t => ({ slug: slugOf(t.team.id), points: Number(t.score), name: t.team.displayName })),
    meta: {
      as_of: etDate(event.date),
      sources: [event.sourceUrl ?? "", `https://www.ncaa.com/game/${contestId}`].filter(Boolean),
      conference_game: null,
      line_score: Object.fromEntries([home, away].map(t => [slugOf(t.team.id), (t.linescores ?? []).map(q => q.value)])),
      pregame_ap_ranks: { [homeSlug]: pregameApRanks.get(homeSlug) ?? null, [awaySlug]: pregameApRanks.get(awaySlug) ?? null },
      pregame_timing_note: null,
      originally_scheduled_kickoff_utc: event.date,
      reviewed_status: {
        espn: competition.status.type,
        ncaa: ncaaRow.gameState,
      },
      listed_kickoff_observations: { espn: event.date, ncaa: new Date(ncaaRow.startTimeEpoch * 1000).toISOString(), actual_start: null },
    },
    lines: [null, null],
  };
  // NCAA late-update tolerance: an official school corroboration covers finals
  // the NCAA scoreboard still lists as in-progress at the cutoff.
  if (ncaaRow.gameState !== "F") {
    game.corroborator = schoolCorroborator(event.id, competition);
    game.meta.reviewed_status.ncaa = ncaaRow.gameState;
    game.meta.listed_kickoff_observations.ncaa = new Date(ncaaRow.startTimeEpoch * 1000).toISOString();
  } else {
    // Listed instants can differ by minutes between official boards; both
    // observations stay separate and the gate re-asserts each on its own page.
  }
  const prev = [...snapshot.playedGames, ...snapshot.scheduledGames.map(row => ({ ...row, teams: null }))].find(row => row.provider_id === event.id || row.game_id === game.game_id);
  if (prev?.meta?.correction_history) game.meta.correction_history = prev.meta.correction_history;
  if (prev?.kickoff_utc && Date.parse(prev.kickoff_utc) !== Date.parse(event.date)) {
    game.meta.originally_scheduled_kickoff_utc = prev.kickoff_utc;
    game.meta.pregame_timing_note = `Published kickoff ${prev.kickoff_utc}; the completed game is listed at ${event.date} by ESPN and ${game.meta.listed_kickoff_observations.ncaa} by NCAA.`;
    rescheduled.push({ provider_id: event.id, game_id: game.game_id, published_kickoff_utc: prev.kickoff_utc, played_kickoff_utc: event.date, published_date: prev.date, played_date: game.date });
  }
  return game;
}
const rescheduled = [];
function publishedGameId(providerId, homeSlug, awaySlug) {
  const row = snapshot.scheduledGames.find(r => r.provider_id === providerId);
  if (!row) return null;
  assert.equal(row.home_slug, homeSlug, `scheduled home changed ${providerId}`);
  assert.equal(row.away_slug, awaySlug, `scheduled away changed ${providerId}`);
  return row.game_id ?? `${row.date}-${row.away}-at-${row.home}`;
}

// Every Week 11 final is F on the NCAA scoreboard at this cutoff; a non-final
// NCAA row fails the build instead of being promoted on a guess. One final
// carries an extra host-school receipt: Ole Miss at Oklahoma moved from its
// Saturday listing to Sunday, November 15, and the NCAA standings page had not
// yet counted it at the cutoff. The gate re-asserts the literal observation.
const SCHOOL_CORROB = {
  "401856887": { id: "school-oklahoma", kind: "school", host_slug: "oklahoma", school: "Oklahoma", expect: /Football versus Ole Miss on November 15, 2026\s*,\s*Win\s*,\s*24,\s*to,\s*17/ },
};
function schoolCorroborator(eventId) {
  const rule = SCHOOL_CORROB[eventId];
  assert.ok(rule, `NCAA non-final game ${eventId} has no reviewed school corroboration`);
  const text = htmlText(docs.get(rule.id));
  assert.match(text, rule.expect, `school page no longer shows the reviewed final (${rule.school})`);
  return { kind: "school", id: rule.id };
}

// ------------------------------------------------------------ build finals
const finals = [];
const fcsFinalEvents = [];
for (const event of weekEvents(11)) {
  const competition = event.competitions[0];
  assert.ok(!snapshot.playedGames.some(p => p.provider_id === event.id), `Week 11 event already published as a final: ${event.id}`);
  // Never promote a game because its kickoff time passed: the provider must
  // report it completed, and a postponed or canceled game stops the build.
  assert.equal(competition.status.type.completed, true, `Week 11 event not completed at cutoff: ${event.id} (${competition.status.type.name})`);
  assert.equal(competition.status.type.state, "post", `Week 11 event state ${event.id}`);
  const home = competition.competitors.find(t => t.homeAway === "home");
  const away = competition.competitors.find(t => t.homeAway === "away");
  if (!slugOf(home.team.id) || !slugOf(away.team.id)) { fcsFinalEvents.push(event); continue; }
  for (const team of [home, away]) {
    const quarters = (team.linescores ?? []).map(q => q.value);
    assert.ok(quarters.length >= 4, `line score missing ${event.id}`);
    assert.equal(quarters.reduce((a, b) => a + b, 0), Number(team.score), `line score sum ${event.id}`);
  }
  finals.push(playedRow(event));
}
const finalsById = new Map(finals.map(g => [g.provider_id, g]));
assert.equal(finals.length, 67, `finals count ${finals.length}`);
assert.equal(fcsFinalEvents.length, 0, "Week 11 has no FCS opponent");
const schoolHosts = read("data/cfb-2026/refresh/official-school-hosts.json").hosts;
const schoolCorroborations = Object.entries(SCHOOL_CORROB).map(([providerId, rule]) => {
  const game = finalsById.get(providerId);
  assert.ok(game, `school corroboration for a game outside the Week 11 finals ${providerId}`);
  assert.equal(game.home_slug, rule.host_slug, `school corroboration must come from the host ${providerId}`);
  const source = weekly.find(([id]) => id === rule.id);
  assert.equal(new URL(source[1]).hostname, schoolHosts[rule.host_slug], `school source is not the host's official site ${providerId}`);
  const observed = htmlText(docs.get(rule.id)).match(rule.expect);
  assert.ok(observed, `school page does not show the reviewed final (${rule.school})`);
  game.corroborator = { kind: "school", id: rule.id };
  return { provider_id: providerId, kind: "school", source_id: rule.id, school: rule.school, url: source[1], observed_text: observed[0] };
});
// Every Week 11 final replaces exactly one published scheduled row.
const publishedWeek11 = snapshot.scheduledGames.filter(row => row.week === 11);
assert.equal(publishedWeek11.length, 67, "published Week 11 slate");
assert.deepEqual(new Set(publishedWeek11.map(row => row.provider_id)), new Set(finalsById.keys()), "Week 11 finals equal the published slate");
for (const game of finals) {
  // The NCAA scoreboard must carry the same final: state F, same scores, same winner.
  const contest = ncaaByContest.get(eventMatch.get(game.provider_id));
  assert.equal(contest.gameState, "F", `NCAA state ${game.provider_id}`);
  const ncaaScores = contest.teams.map(t => Number(t.score)).sort((a, b) => a - b);
  const espnScores = game.teams.map(t => t.points).sort((a, b) => a - b);
  assert.deepEqual(ncaaScores, espnScores, `NCAA/ESPN score ${game.provider_id}`);
  const ncaaHome = contest.teams.find(t => t.isHome), ncaaAway = contest.teams.find(t => !t.isHome);
  const homePoints = game.teams.find(t => t.slug === game.home_slug).points, awayPoints = game.teams.find(t => t.slug === game.away_slug).points;
  assert.equal(seonameToSlug.get(ncaaHome.seoname), game.home_slug, `NCAA home ${game.provider_id}`);
  assert.equal(Number(ncaaHome.score), homePoints, `NCAA home score ${game.provider_id}`);
  assert.equal(Number(ncaaAway.score), awayPoints, `NCAA away score ${game.provider_id}`);
}
console.log("rescheduled finals:", JSON.stringify(rescheduled));

const newFinalIds = finals.map(g => g.provider_id);
assert.equal(new Set(newFinalIds).size, finals.length, "duplicate final");

// conference_game flag
for (const game of finals) {
  const contest = ncaaByContest.get(eventMatch.get(game.provider_id));
  const conferences = contest.teams.map(t => t.conferenceSeo);
  game.meta.conference_game = conferences[0] === conferences[1] && conferences[0] !== "fcs";
}

// Finals origin/main already publishes keep their published verification stamp
// and the pregame AP ranks they were published with (the poll that preceded the
// game); only finals main does not yet publish take this cutoff and edition.
const publishedFinals = new Map(publishedSnapshot.playedGames.map(row => [row.provider_id, row]));
let carriedForward = 0;
for (const game of finals) {
  const published = publishedFinals.get(game.provider_id);
  if (!published) continue;
  game.verified_at = published.verified_at;
  game.meta.pregame_ap_ranks = structuredClone(published.meta.pregame_ap_ranks);
  carriedForward++;
}
console.log("finals carried forward from origin/main:", carriedForward, "of", finals.length);

// ------------------------------------------------------------ week 12 slate
const tvText = htmlText(docs.get("tv-ncaa"));
function tvArticleRow(awayName, homeName) {
  const norm = s => s.toLowerCase().replace(/\(.*\)/g, "").replace(/[^a-z0-9]/g, "");
  const a = norm(awayName), h = norm(homeName);
  const lines = tvText.split(/(?=Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday,)/);
  for (const block of lines) {
    if (!/November (?:1[6-9]|2[0-2])|Nov\. (?:1[6-9]|2[0-2])/.test(block)) continue;
    for (const row of block.split(/(?=[A-Z][^|]{2,60}\|)/)) {
      const m = row.match(/^([A-Za-z'.& ()#0-9-]+?)\s+at\s+([A-Za-z'.& ()#0-9-]+?)\s*(?:\|\s*([0-9:apm. ]+)\s*\|)?\s*([A-Za-z0-9 +]+)?$/i);
      if (m && norm(m[1]).includes(a.slice(0, 6)) && norm(m[2]).includes(h.slice(0, 6))) {
        return { time: m[3] ?? null, tv: m[4]?.trim() ?? null, raw: row.trim() };
      }
    }
  }
  return null;
}

const scheduled = [];
// Kickoff disagreements between the provider and the NCAA scoreboard, each
// settled by the host school's official schedule page (literal text and the
// page's own UTC instant). The source gate re-asserts both.
// `local` is the host's own listed date, time and time zone; `page_utc` is
// the UTC instant the page itself embeds, where it publishes one.
const HOST_KICKOFF_SETTLEMENTS = {
  "401866465": { id: "school-western-michigan", host_slug: "western-michigan", school: "Western Michigan", expect: /Nov 17 \(Tue\) \/ 6:00 PM[\s\S]{0,200}?vs Eastern Michigan University/, local: ["2026-11-17", "18:00", "America/Detroit"], page_utc: "2026-11-17T23:00:00Z" },
  "401866469": { id: "school-buffalo", host_slug: "buffalo", school: "Buffalo", expect: /Wed,\s*Nov 18\s*,\s*7:30 pm\s+vs Central Michigan/, local: ["2026-11-18", "19:30", "America/New_York"], page_utc: null },
  "401864545": { id: "school-air-force", host_slug: "air-force", school: "Air Force", expect: /Nov 20 \/ 6:00 PM MT vs UTEP/, local: ["2026-11-20", "18:00", "America/Denver"], page_utc: null },
};
// A wall-clock time in a named zone as a UTC instant.
function zonedToUtc([date, time, zone]) {
  const guess = Date.parse(`${date}T${time}:00Z`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess)).map(p => [p.type, p.value]));
  const shown = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`);
  return new Date(guess - (shown - guess)).toISOString();
}
const officialHosts = read("data/cfb-2026/refresh/official-school-hosts.json").hosts;
const kickoffDisagreements = [], kickoffSettlements = [];
// FBS-vs-FCS games stay outside the board; each carries the provider's own
// conference ids as evidence that one side is outside the 138-team membership.
const FBS_CONFERENCE_IDS = new Set(["1", "4", "5", "8", "9", "12", "15", "17", "18", "37", "151"]);
const excludedUpcoming = [];
for (const event of weekEvents(12)) {
  const competition = event.competitions[0];
  const home = competition.competitors.find(t => t.homeAway === "home");
  const away = competition.competitors.find(t => t.homeAway === "away");
  const homeSlug = slugOf(home.team.id), awaySlug = slugOf(away.team.id);
  assert.equal(competition.status.type.completed, false, `week 12 event already completed ${event.id}`);
  assert.equal(competition.status.type.name, "STATUS_SCHEDULED", `week 12 event status ${event.id}`);
  if (!homeSlug || !awaySlug) {
    const conferenceIds = { home: home.team.conferenceId ?? null, away: away.team.conferenceId ?? null };
    const fcsSide = homeSlug ? "away" : "home";
    assert.ok(homeSlug || awaySlug, `week 12 event without an FBS side ${event.id}`);
    assert.ok(conferenceIds[fcsSide] != null && !FBS_CONFERENCE_IDS.has(String(conferenceIds[fcsSide])), `no FCS conference-id evidence ${event.id}`);
    excludedUpcoming.push({ provider_id: event.id, date: etDate(event.date), week: 12, name: event.name, home_slug: homeSlug, away_slug: awaySlug, espn_conference_ids: conferenceIds, ncaa_contest_id: eventMatch.get(event.id) ?? null, reason: "FBS–FCS: one opponent is outside the verified current 138-team membership; the board displays FBS vs FBS." });
    continue;
  }
  const contestId = eventMatch.get(event.id);
  assert.ok(contestId, `no NCAA contest for week 12 event ${event.id}`);
  const ncaaRow = ncaaByContest.get(contestId);
  const timeValid = competition.timeValid === true;
  const hasNcaaTime = ncaaRow.hasStartTime;
  const article = tvArticleRow(away.team.displayName, home.team.displayName);
  const espnTv = broadcastOf(competition);
  let kickoff_utc, kickoff_status, timing_sources, timing_note, settlement = null;
  if (timeValid) {
    kickoff_utc = event.date;
    kickoff_status = "confirmed";
    timing_sources = [event.sourceUrl ?? "", `https://www.ncaa.com/game/${contestId}`].filter(Boolean);
    timing_note = "Announced kickoff: provider listing";
    if (hasNcaaTime && ncaaRow.startTimeEpoch * 1000 !== Date.parse(event.date)) {
      // The provider and the NCAA scoreboard list different instants. Only the
      // host school's own official schedule settles its home game; without
      // that reviewed settlement the build stops instead of choosing a side.
      const rule = HOST_KICKOFF_SETTLEMENTS[event.id];
      const ncaaListed = new Date(ncaaRow.startTimeEpoch * 1000).toISOString();
      if (!rule) kickoffDisagreements.push({ provider_id: event.id, name: event.name, espn: event.date, ncaa: ncaaListed });
      else {
        assert.equal(rule.host_slug, homeSlug, `settlement must come from the host school ${event.id}`);
        const source = weekly.find(([id]) => id === rule.id);
        assert.equal(new URL(source[1]).hostname, officialHosts[homeSlug], `school source is not the host's official site ${event.id}`);
        const page = docs.get(rule.id);
        assert.match(htmlText(page), rule.expect, `host schedule no longer shows the reviewed kickoff (${rule.school})`);
        const hostUtc = zonedToUtc(rule.local);
        if (rule.page_utc) {
          assert.ok(page.includes(`"date_utc":"${rule.page_utc}"`), `host schedule UTC instant changed (${rule.school})`);
          assert.equal(Date.parse(rule.page_utc), Date.parse(hostUtc), `host page instant differs from its listed local time (${rule.school})`);
        }
        // The host settles its own home game; the provider must show the same instant.
        assert.equal(Date.parse(hostUtc), Date.parse(event.date), `host schedule differs from the provider listing ${event.id}`);
        settlement = { kind: "host-school", source_id: rule.id, school: rule.school, url: source[1], observed_text: htmlText(page).match(rule.expect)[0], host_local: { date: rule.local[0], time: rule.local[1], time_zone: rule.local[2] }, host_page_utc: rule.page_utc, host_kickoff_utc: hostUtc, espn_listed_kickoff_utc: event.date, ncaa_listed_kickoff_utc: ncaaListed };
        timing_sources = [source[1], ...timing_sources];
        timing_note = `Announced kickoff: the host school's official schedule and the provider listing agree (${hostUtc}); the NCAA scoreboard lists ${ncaaListed}.`;
        kickoffSettlements.push({ provider_id: event.id, ...settlement });
      }
    }
    if (article?.time && !settlement) {
      const literal = article.time.match(/(\d{1,2})(?::(\d{2}))?\s*([ap])\s*\.\s*m/i);
      assert.ok(literal, `unparsable TV article time: ${article.raw}`);
      const local = etTime(event.date);
      const articleEt = `${String(Number(literal[1]) % 12 + (literal[3].toLowerCase() === "p" ? 12 : 0)).padStart(2, "0")}:${literal[2] ?? "00"}`;
      assert.equal(local, articleEt, `TV article time differs from provider listing: ${homeSlug} vs ${awaySlug}`);
      timing_note = "Announced kickoff: NCAA TV article and provider listing agree";
    }
  } else if (article?.time) {
    const literal = article.time.match(/(\d{1,2})(?::(\d{2}))?\s*([ap])\s*\.\s*m/i);
    assert.ok(literal, `unparsable TV article time: ${article.raw}`);
    const et = `${String(Number(literal[1]) % 12 + (literal[3].toLowerCase() === "p" ? 12 : 0)).padStart(2, "0")}:${literal[2] ?? "00"}`;
    const date = `${etDate(event.date)}T${String(Number(et.slice(0, 2)) + (Number(et.slice(0, 2)) < 12 && et.slice(3) === "00" ? 0 : 0)).padStart(2, "0")}`;
    // Convert noon-anchored ET to UTC using the Eastern date.
    const instant = new Date(`${etDate(event.date)}T12:00:00Z`); // placeholder replaced below
    const hours = Number(et.slice(0, 2)), minutes = et.slice(3);
    const utc = new Date(Date.parse(`${etDate(event.date)}T12:00:00Z`) - 0);
    // Compute exact UTC: ET = UTC-4 (EDT through Nov 1) / UTC-5 (EST from Nov 2).
    const estOffset = "2026-11-02" <= etDate(event.date) ? 5 : 4;
    const utcStr = `${etDate(event.date)}T${String((Number(hours) + estOffset) % 24).padStart(2, "0")}:${minutes}:00Z`;
    const dayShift = Number(hours) + estOffset >= 24 ? 1 : 0;
    const dateOnly = etDate(event.date).split("-");
    const shifted = new Date(Date.UTC(Number(dateOnly[0]), Number(dateOnly[1]) - 1, Number(dateOnly[2]) + dayShift));
    kickoff_utc = `${shifted.toISOString().slice(0, 10)}T${String((Number(hours) + estOffset) % 24).padStart(2, "0")}:${minutes}:00Z`;
    kickoff_status = "confirmed";
    timing_sources = ["https://www.ncaa.com/news/football/article/college-football-tv-schedule-game-times-preview"];
    timing_note = "Announced kickoff from the official NCAA TV article; provider listing has no time";
    void instant; void utc;
  } else if (hasNcaaTime) {
    kickoff_utc = new Date(ncaaRow.startTimeEpoch * 1000).toISOString();
    kickoff_status = "confirmed";
    timing_sources = ["https://www.ncaa.com/scoreboard/football/fbs/2026/12/all-conf", `https://www.ncaa.com/game/${contestId}`];
    timing_note = "Announced kickoff from the official NCAA scoreboard; provider listing has no time";
  } else {
    kickoff_utc = null;
    kickoff_status = "official_tbd";
    timing_sources = ["https://www.ncaa.com/news/football/article/college-football-tv-schedule-game-times-preview"];
    timing_note = "Kickoff not announced in reviewed sources";
    assert.ok(!hasNcaaTime, `NCAA has a start time for ${event.id} that provider misses`);
  }
  const tv = espnTv ?? (article?.tv ? TV[article.tv] ?? article.tv : null);
  const tv_status = tv ? "published" : "unpublished";
  if (article?.tv && tv) assert.match(tv, tvPattern(tv), `TV token mismatch ${homeSlug}`);
  scheduled.push({
    provider_id: event.id,
    source_url: event.sourceUrl ?? `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=${etDate(event.date).replaceAll("-", "")}&groups=80&limit=200`,
    date: etDate(event.date),
    kickoff_utc, kickoff_status, week: 12,
    home_slug: homeSlug, away_slug: awaySlug,
    home: homeSlug, away: awaySlug,
    tv, tv_status,
    time_et: timeValid ? etTime(event.date) : (kickoff_utc ? etTime(kickoff_utc) : null),
    site: competition.venue?.fullName ?? null,
    neutral_site: competition.neutralSite === true,
    verified_at: CUT,
    game_status: "scheduled",
    announced_kickoff_utc: kickoff_utc,
    timing_sources, timing_note,
    source_urls: [event.sourceUrl ?? "", `https://www.ncaa.com/game/${contestId}`].filter(Boolean),
    ncaa_listed_kickoff_utc: hasNcaaTime ? new Date(ncaaRow.startTimeEpoch * 1000).toISOString() : null,
    official_tv: article?.tv ? { observed_text: article.raw, tv: TV[article.tv] ?? article.tv, time: article.time } : null,
    ...(settlement ? { kickoff_settlement: settlement } : {}),
  });
}
assert.deepEqual(kickoffDisagreements, [], `unsettled kickoff disagreements: ${JSON.stringify(kickoffDisagreements)}`);
console.log("kickoff settlements:", JSON.stringify(kickoffSettlements.map(r => [r.provider_id, r.school, r.host_kickoff_utc, r.ncaa_listed_kickoff_utc])));
assert.equal(scheduled.length, 66, `week 12 slate ${scheduled.length}`);
assert.equal(excludedUpcoming.length, 4, `week 12 FCS fixtures ${excludedUpcoming.length}`);
assert.equal(scheduled.length + excludedUpcoming.length, inventories.get(12).length, "week 12 provider slate equals the NCAA inventory");

// ------------------------------------------------------------ records
const standingsDoc = JSON.parse(docs.get("espn-standings"));
const entries = standingsDoc.children.flatMap(c => c.standings?.entries ?? c.children?.flatMap(x => x.standings?.entries ?? []) ?? []);
const records = {}, conferenceRecords = {};
for (const r of entries) { const slug = ids.get(r.team.id); assert.ok(slug); records[slug] = r.stats.find(s => s.type === "total").summary; conferenceRecords[slug] = r.stats.find(s => s.type === "vsconf").summary; }
assert.equal(Object.keys(records).length, 138);

// Primary record corroboration.
//   1. The official NCAA standings page: every team's row is resolved by the
//      exact NCAA school name the November 8 release reviewed for that team,
//      never by a record or name similarity, and must equal the provider's
//      overall and conference record.
//   2. A row the NCAA page has not yet updated is accepted only as a lagging
//      observation: it must be exactly the record the base release verified,
//      the gap must be exactly that team's verified Week 11 final, and the
//      current record needs its own official corroboration, either the team's
//      conference standings page (exact school name, both records) or a
//      host-school receipt for the uncounted final.
const priorWeekEvidence = read("data/cfb-2026/refresh/evidence/2026-11-08-week10-refresh.json");
const ncaaNameOf = Object.fromEntries(priorWeekEvidence.primaryRecords.map(r => [r.slug, r.source_school]));
assert.equal(Object.keys(ncaaNameOf).length, 138, "NCAA school name registry");
assert.equal(new Set(Object.values(ncaaNameOf)).size, 138, "NCAA school names are unique");
assert.ok(priorWeekEvidence.primaryRecords.every(r => r.source_id === "ncaa-standings"), "registry names come from the NCAA standings page");
const espnConferenceOf = priorEvidence.conferences.reduce((m, c) => { for (const r of c.rows) m[r.slug] = c.id; return m; }, {});
const CONFERENCE_PAGE = { "1": "standing-acc3", "4": "standing-big12", "5": "standing-bigten", "9": "standing-pac12", "12": "standing-cusa", "15": "standing-mac", "17": "standing-mw", "151": "standing-american" };
const norm = value => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const espnLocationOf = {}; for (const r of entries) espnLocationOf[ids.get(r.team.id)] = r.team.location;
const recordCell = value => { const m = /^(\d+)-(\d+)$/.exec(value); return m ? [Number(m[1]), Number(m[2])] : null; };

const ncaaDataRows = htmlTables(docs.get("ncaa-standings")).flatMap(t => t.slice(1)).filter(row => row.length >= 5 && /^\d+$/.test(row[1]));
assert.equal(ncaaDataRows.length, 138, `NCAA standings rows ${ncaaDataRows.length}`);
const ncaaStandingsStamp = (htmlText(docs.get("ncaa-standings")).match(/Last Updated [A-Za-z]+ \d{1,2}, \d{4} \d{1,2}:\d{2} [AP]M [A-Z]{2,4}/) ?? [null])[0];
const ncaaRowFor = {};
const ncaaStandingsLag = [];
for (const slug of Object.keys(records)) {
  const [W, L] = recordCell(records[slug]); const [CW, CL] = recordCell(conferenceRecords[slug]);
  const named = ncaaDataRows.filter(row => row[0] === ncaaNameOf[slug]);
  assert.equal(named.length, 1, `NCAA standings row unresolved for ${slug} (${ncaaNameOf[slug]})`);
  const [nCW, nCL, nW, nL] = named[0].slice(1, 5).map(Number);
  if (nCW === CW && nCL === CL && nW === W && nL === L) { ncaaRowFor[slug] = { name: named[0][0], cells: named[0].slice(1, 5) }; continue; }
  assert.equal(`${nW}-${nL}`, snapshot.teamRecords[slug], `NCAA standings row for ${slug} is neither the current nor the last verified record`);
  const baseConference = snapshot.retainedBaseline.conferenceStandings.flatMap(c => c.rows).find(row => row.team_slug === slug);
  if (baseConference) assert.deepEqual([nCW, nCL], [Number(baseConference.w), Number(baseConference.l)], `NCAA standings conference row for ${slug} is not the last verified one`);
  const uncounted = finals.filter(g => g.home_slug === slug || g.away_slug === slug);
  assert.ok(uncounted.length > 0, `NCAA standings row for ${slug} lags without a Week 11 final`);
  let [eW, eL, eCW, eCL] = [nW, nL, nCW, nCL];
  for (const game of uncounted) {
    const mine = game.teams.find(t => t.slug === slug).points, theirs = game.teams.find(t => t.slug !== slug).points;
    if (mine > theirs) { eW++; if (game.meta.conference_game) eCW++; } else { eL++; if (game.meta.conference_game) eCL++; }
  }
  assert.deepEqual([eW, eL, eCW, eCL], [W, L, CW, CL], `last verified record plus verified finals does not equal provider standings for ${slug}`);
  ncaaStandingsLag.push({ slug, ncaa_name: named[0][0], ncaa_row: named[0].slice(1, 5), provider_overall: records[slug], provider_conference: conferenceRecords[slug], last_verified_overall: snapshot.teamRecords[slug], uncounted_finals: uncounted.map(g => g.provider_id), page_last_updated: ncaaStandingsStamp });
}
assert.equal(Object.keys(ncaaRowFor).length + ncaaStandingsLag.length, 138);
console.log("NCAA standings page stamp:", ncaaStandingsStamp, "| rows not yet updated:", JSON.stringify(ncaaStandingsLag.map(r => [r.slug, r.ncaa_row.join("/"), r.provider_overall, r.provider_conference])));

const primaryRecords = [];
for (const slug of Object.keys(records)) {
  const lag = ncaaStandingsLag.find(r => r.slug === slug);
  if (!lag) { primaryRecords.push({ slug, overall: records[slug], conference: conferenceRecords[slug], source_id: "ncaa-standings", source_school: ncaaRowFor[slug].name }); continue; }
  const page = CONFERENCE_PAGE[espnConferenceOf[slug]];
  const conferenceRow = page ? htmlTables(docs.get(page)).flat().find(row => row.some(cell => norm(cell) === norm(espnLocationOf[slug])) && row.includes(records[slug]) && row.includes(conferenceRecords[slug])) : null;
  if (conferenceRow) {
    lag.corroborated_by = page;
    primaryRecords.push({ slug, overall: records[slug], conference: conferenceRecords[slug], source_id: page, source_school: espnLocationOf[slug], basis: "official conference standings page; the NCAA standings row had not yet counted the verified Week 11 final" });
    continue;
  }
  const receipt = schoolCorroborations.find(c => lag.uncounted_finals.includes(c.provider_id));
  assert.ok(receipt && lag.uncounted_finals.length === 1, `${slug}: NCAA standings row lags and no conference page or host-school receipt corroborates the record`);
  lag.corroborated_by = receipt.source_id;
  primaryRecords.push({ slug, overall: records[slug], conference: conferenceRecords[slug], source_id: receipt.source_id, source_school: receipt.school, basis: "provider standings; last verified record plus the host-school-corroborated final; the NCAA standings row had not yet counted it" });
}
assert.equal(primaryRecords.length, 138);

// ------------------------------------------------------------ polls
const priorPolls = basePolls;
const priorAp = baseAp;
const priorCoaches = baseCoaches;
const priorComposite = snapshot.polls.find(p => p.poll === "composite");
const pollFromEspn = (edition, kind) => ({
  poll: kind,
  name: kind === "ap" ? "AP Top 25" : "AFCA Coaches Poll",
  release_date: edition.date.slice(0, 10),
  rankings: edition.ranks.map(r => ({ rank: r.current, team_slug: slugOf(r.team.id), team: null, record: r.recordSummary, points: r.points, first_place_votes: kind === "ap" ? r.firstPlaceVotes ?? null : r.firstPlaceVotes ?? null, previous_rank: r.previous ?? null, tied: !!(r.tie ?? false) })),
  others: (edition.others ?? []).map(r => ({ team_slug: slugOf(r.team.id), team: null, points: r.points })).filter(row => row.team_slug),
  source_urls: kind === "ap"
    ? ["https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings?seasons=2026", "https://www.ncaa.com/rankings/football/fbs/associated-press"]
    : ["https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings?seasons=2026", "https://sportsdata.usatoday.com/football/ncaaf/coaches-poll"],
  publication_precision: "date",
  provider_reported_date: edition.date,
});
// Fill team display names from the prior edition where the slug already had one.
const teamNameOf = new Map([...priorAp.rankings, ...priorCoaches.rankings].map(r => [r.team_slug, r.team]));
for (const r of entries) teamNameOf.set(ids.get(r.team.id), r.team.displayName);
// An unpublished AP edition is never relabeled: the kept edition is the base
// snapshot's own rows, byte for byte, with its November 8 release date.
const apPoll = AP_PUBLISHED ? pollFromEspn(apNewEdition, "ap") : structuredClone(priorAp);
const coachesPoll = pollFromEspn(coachesEdition, "coaches");
for (const poll of [apPoll, coachesPoll]) {
  for (const row of poll.rankings) row.team ??= teamNameOf.get(row.team_slug) ?? row.team_slug;
  for (const row of poll.others) row.team ??= teamNameOf.get(row.team_slug) ?? row.team_slug;
}
assert.ok(apPoll.rankings.every(r => r.team && r.team !== r.team_slug), "AP team display names");
assert.ok(coachesPoll.rankings.every(r => r.team && r.team !== r.team_slug), "Coaches team display names");
assert.ok(apPoll.others.every(r => r.team && r.team !== r.team_slug), "AP others display names");
assert.ok(coachesPoll.others.every(r => r.team && r.team !== r.team_slug), "Coaches others display names");
assert.equal(apPoll.release_date, AP_PUBLISHED ? apNewEdition.date.slice(0, 10) : PRIOR_POLL_EDITION_DATE, "AP release date is the edition's own");
assert.equal(coachesPoll.release_date, POLL_EDITION_DATE, "Coaches release date is the edition's own");

// Official NCAA AP table corroboration: the table must show the same edition
// the release publishes (rank and points). A table that shows another edition
// than the provider is a disagreement and stops the build.
const apTables = htmlTables(docs.get("ap-ncaa")).find(t => t.some(row => /SCHOOL/i.test(row.join(" "))));
assert.ok(apTables && apTables.length - 1 === apPoll.rankings.length, "NCAA AP table rows");
apPoll.rankings.forEach((row, i) => {
  const official = apTables[i + 1];
  assert.equal(Number(official[0].replace(/\D/g, "")), row.rank, `AP rank ${row.rank}`);
  assert.equal(Number(official[2].replaceAll(",", "")), row.points, `AP points ${row.team_slug}`);
  assert.equal(official[3], row.record, `AP record ${row.team_slug}`);
});
// USA Today coaches corroboration
const coachesTables = htmlTables(docs.get("coaches")).find(t => t.some(row => /PTS/i.test(row.join(" "))));
assert.ok(coachesTables && coachesTables.length - 1 === coachesPoll.rankings.length, "USA Today coaches table rows");
coachesPoll.rankings.forEach((row, i) => {
  const official = coachesTables[i + 1];
  assert.equal(Number(official[0].replace(/\D/g, "")), row.rank, `coaches rank ${row.rank}`);
  assert.equal(Number(official[3].replaceAll(",", "")), row.points, `coaches points ${row.team_slug}`);
  assert.equal(official[2], row.record, `coaches record ${row.team_slug}`);
});
assert.match(htmlText(docs.get("coaches")), /November 15|Nov\.?\s*15/, "coaches page edition date");

// The composite averages two editions of the same date. While the AP edition
// is the November 8 one, the composite stays the published November 8 average.
const composite = AP_PUBLISHED ? editorialComposite([apPoll, coachesPoll]) : structuredClone(priorComposite);
const polls = [apPoll, coachesPoll, composite];

// Poll notes describe AP movement. They are recomputed only for a new AP
// edition; otherwise the published November 8 notes stay with their own date.
const priorApRanks = new Map(priorAp.rankings.map(r => [r.team_slug, r.rank]));
const priorCoachesRanks = new Map(priorCoaches.rankings.map(r => [r.team_slug, r.rank]));
const movers = (poll, prior) => poll.rankings.filter(r => prior.has(r.team_slug) && prior.get(r.team_slug) !== r.rank).map(r => ({ team: r.team, team_slug: r.team_slug, from: prior.get(r.team_slug), to: r.rank, move: r.rank - prior.get(r.team_slug) })).sort((a, b) => a.to - b.to).slice(0, 10);
const debuts = poll => poll.rankings.filter(r => !priorApRanks.has(r.team_slug) && !priorCoachesRanks.has(r.team_slug)).map(r => ({ team: r.team, team_slug: r.team_slug, rank: r.rank }));
const pollNotes = !AP_PUBLISHED ? structuredClone(snapshot.poll_notes) : {
  as_of: apPoll.release_date,
  movers_ap: movers(apPoll, priorApRanks),
  debuts_ap: debuts(apPoll),
  dropped_out: { ap: [...priorApRanks.entries()].filter(([slug]) => !apPoll.rankings.some(r => r.team_slug === slug)).map(([slug]) => ({ team: priorAp.rankings.find(r => r.team_slug === slug)?.team ?? slug, team_slug: slug, others_points: priorAp.rankings.find(r => r.team_slug === slug)?.others_points ?? null })), coaches: [...priorCoachesRanks.entries()].filter(([slug]) => !coachesPoll.rankings.some(r => r.team_slug === slug)).map(([slug]) => ({ team: priorCoaches.rankings.find(r => r.team_slug === slug)?.team ?? slug, team_slug: slug, others_points: priorCoaches.rankings.find(r => r.team_slug === slug)?.others_points ?? null })) },
  poll_gaps: {
    // UI contract: ap_only rows carry {ap, coaches_points}; coaches_only rows
    // carry {coaches, ap_points}; an RV side stays null rather than invented.
    ap_only: apPoll.rankings.filter(r => !coachesPoll.rankings.some(c => c.team_slug === r.team_slug)).map(r => ({ team: r.team, team_slug: r.team_slug, ap: r.rank, coaches_points: null })),
    coaches_only: coachesPoll.rankings.filter(r => !apPoll.rankings.some(a => a.team_slug === r.team_slug)).map(r => ({ team: r.team, team_slug: r.team_slug, coaches: r.rank, ap_points: null })),
    biggest_splits: apPoll.rankings.flatMap(r => { const c = coachesPoll.rankings.find(x => x.team_slug === r.team_slug); return c && Math.abs(c.rank - r.rank) >= 3 ? [{ team: r.team, team_slug: r.team_slug, ap: r.rank, coaches: c.rank }] : []; }).sort((a, b) => Math.abs(b.coaches - b.ap) - Math.abs(a.coaches - a.ap)).slice(0, 5),
  },
  sources: ["https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings?seasons=2026", "https://www.ncaa.com/rankings/football/fbs/associated-press", "https://sportsdata.usatoday.com/football/ncaaf/coaches-poll"],
};
if (!AP_PUBLISHED) assert.equal(pollNotes.as_of, PRIOR_POLL_EDITION_DATE, "kept poll notes keep their date");

// ------------------------------------------------------------ metrics
const statRows = (id, kind) => {
  const tables = htmlTables(docs.get(id));
  const table = tables.find(t => t.length > 3);
  assert.ok(table, `stat table ${id}`);
  const header = table[0];
  const columnOf = pattern => header.findIndex(h => pattern.test(h));
  // Per NCAA tables: individual totals use the "Yds" column; team per-game
  // categories use "PPG"/"Avg". Match the exact published column.
  const valueColumn = kind === "individual"
    ? Math.max(columnOf(/yds/i), columnOf(/yards/i))
    : Math.max(columnOf(/ppg/i), columnOf(/avg/i));
  assert.ok(valueColumn >= 0, `value column on ${id}: ${header.join(" | ")}`);
  const rows = table.slice(1).slice(0, 5).map(row => {
    if (kind === "individual") {
      const nameIdx = columnOf(/^(name|player)$/i) >= 0 ? columnOf(/^(name|player)$/i) : 1;
      const teamIdx = Math.max(columnOf(/^(team|school)$/i), 2);
      return { name: row[nameIdx], team: row[teamIdx] ?? "", value: Number(row[valueColumn]?.replaceAll(",", "")) };
    }
    const teamIdx = Math.max(columnOf(/^(team|school)$/i), 1);
    const name = row[teamIdx];
    return { name, team: name, value: Number(row[valueColumn]?.replaceAll(",", "")) };
  });
  assert.ok(rows.every(r => r.name && Number.isFinite(r.value) && r.value > 0), `stat rows ${id}: ${JSON.stringify(rows.slice(0, 2))}`);
  return rows;
};
const throughText = (htmlText(docs.get("stat-passing")).match(/[Tt]hrough games [A-Za-z]+, [A-Za-z]+ \d{1,2}, \d{4}/) ?? ["not stated"])[0];
console.log("stats through text:", throughText || "(not stated)");

// ------------------------------------------------------------ byes
const week12Teams = new Set([...scheduled.flatMap(g => [g.home_slug, g.away_slug]), ...excludedUpcoming.flatMap(g => [g.home_slug, g.away_slug]).filter(Boolean)]);
assert.equal(week12Teams.size, scheduled.length * 2 + excludedUpcoming.length, `week 12 participants ${week12Teams.size}`);
const byes = Object.keys(records).filter(slug => !week12Teams.has(slug));
assert.equal(byes.length, 138 - week12Teams.size, `bye count ${byes.length}`);

// ------------------------------------------------------------ full season
const auditFinals = [];
const recordsFromFinals = new Map(Object.keys(records).map(slug => [slug, [0, 0]]));
for (const event of allEvents) {
  const competition = event.competitions[0];
  if (!competition.status.type.completed) continue;
  const home = competition.competitors.find(t => t.homeAway === "home");
  const away = competition.competitors.find(t => t.homeAway === "away");
  const homeSlug = slugOf(home.team.id), awaySlug = slugOf(away.team.id);
  const contestId = eventMatch.get(event.id);
  assert.ok(contestId, `no NCAA contest for completed event ${event.id}`);
  const ncaaRow = ncaaByContest.get(contestId);
  const isFbs = homeSlug && awaySlug;
  const row = {
    provider_id: event.id,
    date: etDate(event.date),
    week: event.week.number,
    home_slug: homeSlug, away_slug: awaySlug,
    home_name: home.team.location, away_name: away.team.location,
    home_conference_id: home.team.conference?.id ?? null, away_conference_id: away.team.conference?.id ?? null,
    home_score: Number(home.score), away_score: Number(away.score),
    state: competition.status.type,
    period: competition.status.period,
    line_score: Object.fromEntries([home, away].map(t => [(slugOf(t.team.id) ?? t.team.id), (t.linescores ?? []).map(q => q.value)])),
    kickoff_utc: event.date,
    neutral_site: competition.neutralSite === true,
    site: competition.venue?.fullName ?? null,
    tv: broadcastOf(competition),
    ncaa_contest_id: contestId,
    ncaa_url: `https://www.ncaa.com/game/${contestId}`,
    ncaa_listed_kickoff_utc: new Date(ncaaRow.startTimeEpoch * 1000).toISOString(),
    ncaa_status: ncaaRow.gameState,
    ncaa_teams: ncaaRow.teams.map(t => ({ __typename: t.__typename, seoname: t.seoname, score: t.score, isHome: t.isHome, conferenceSeo: t.conferenceSeo })),
    espn_conference_ids: { home: home.team.conference?.id ?? null, away: away.team.conference?.id ?? null },
  };
  assert.ok(!["F"].includes(ncaaRow.gameState) || ncaaRow.gameState === "F", "ncaa state");
  assert.equal(ncaaRow.gameState, "F", `non-final NCAA row in audit ${event.id}`);
  auditFinals.push(row);
  // Whole-team records include FCS opponents; each FBS side counts its own result.
  for (const [slug, score, other] of [[homeSlug, row.home_score, row.away_score], [awaySlug, row.away_score, row.home_score]]) if (slug) recordsFromFinals.get(slug)[score > other ? 0 : 1]++;
}
// Remove the placeholder assert; enforce real invariants.
assert.ok(auditFinals.every(r => r.home_score !== r.away_score), "no ties in completed games");
assert.equal(auditFinals.length, 752, `completed finals ${auditFinals.length}`);
const computed = Object.fromEntries([...recordsFromFinals].map(([slug, t]) => [slug, t.join("-")]));
const disagreements = Object.keys(records).filter(slug => computed[slug] !== records[slug]);
assert.deepEqual(disagreements, [], `records do not reproduce from finals: ${disagreements.join(", ")}`);
const fbsFinals = auditFinals.filter(r => r.home_slug && r.away_slug).length;
const fcsFinals = auditFinals.length - fbsFinals;
assert.equal(fbsFinals, 629, `fbs finals ${fbsFinals}`);
assert.equal(fcsFinals, 123, `fcs finals ${fcsFinals}`);

// Audit raw source receipts: the daily + NCAA history pages.
// The audit calendar runs through Sunday, November 15 (the last Week 11
// final): week-12 day boards stay with the weekly evidence and are not part
// of the completed-season audit.
const auditRawSources = [...receipts.filter(r => /^(history-|ncaa-history-)/.test(r.id)), ...receipts.filter(r => /^day-/.test(r.id) && r.id <= "day-20261115")].map(({ id, url, resolvedUrl, status, checkedAt, sha256, bytes }) => ({ id, url, resolvedUrl, status, checkedAt, sha256, bytes }));

// ------------------------------------------------------------ evidence files
const tbdCount = scheduled.filter(g => g.kickoff_status === "official_tbd").length;
const tvPendingCount = scheduled.filter(g => !g.tv).length;
const apStatus = AP_PUBLISHED
  ? { published: true, release_date: apPoll.release_date, note: `AP Top 25 edition dated ${apPoll.release_date} published by the provider and matched on the NCAA table.` }
  : { published: false, release_date: apPoll.release_date, expected_edition: POLL_EDITION_DATE, provider_default_document_polls: rankingsDoc.rankings.map(p => ({ id: p.id, date: p.date })), note: `No AP Top 25 edition newer than ${PRIOR_POLL_EDITION_DATE} is published: the provider's current rankings document carries no AP poll, its Week 11 document and the NCAA AP table both show the ${PRIOR_POLL_EDITION_DATE} edition. That edition is kept with its own release date.` };
const evidence = {
  schema_version: 1,
  scope: `Complete Week 11 finals (November 10-15), full Week 12 slate, current whole-team records, ${POLL_EDITION_LABEL} AFCA Coaches edition${AP_PUBLISHED ? " and AP edition" : " (AP edition not yet published; November 8 edition kept)"}, NCAA leaders; full-season review in the companion audit file`,
  cutoff_utc: CUT,
  inventories: { 11: { expected: 67, finals: 67 }, 12: { expected: scheduled.length + excludedUpcoming.length, upcoming: scheduled.length, fcs: excludedUpcoming.length } },
  records, conferenceRecords, primaryRecords,
  finals,
  rescheduled,
  schedule: scheduled,
  excluded_upcoming: excludedUpcoming,
  kickoff_settlements: kickoffSettlements,
  metrics: {
    source_url: "https://www.ncaa.com/stats/football/fbs",
    through_games: throughText,
    categories: [
      { name: "Passing yards", unit: "yards", source_url: "https://www.ncaa.com/stats/football/fbs/current/individual/453", verified_at: CUT, rows: statRows("stat-passing", "individual") },
      { name: "Rushing yards", unit: "yards", source_url: "https://www.ncaa.com/stats/football/fbs/current/individual/469", verified_at: CUT, rows: statRows("stat-rushing", "individual") },
      { name: "Scoring offense", unit: "points per game", source_url: "https://www.ncaa.com/stats/football/fbs/current/team/27", verified_at: CUT, rows: statRows("stat-scoring", "team") },
      { name: "Scoring defense", unit: "points per game", source_url: "https://www.ncaa.com/stats/football/fbs/current/team/28", verified_at: CUT, rows: statRows("stat-defense", "team") },
    ],
  },
  raw_sources: receipts.map(({ id, url, resolvedUrl, status, checkedAt, sha256, bytes, serverDate, age }) => ({ id, url, resolvedUrl, status, checkedAt, sha256, bytes, serverDate, age })),
  bye_status: `${byes.length} programs are absent from the complete official Week 12 slate; no individual official bye designation asserted`,
  byes,
  counts: { week11Finals: finals.length, week11FcsFinals: 0, week11Rescheduled: rescheduled.length, week12Fixtures: scheduled.length, week12FcsFixtures: excludedUpcoming.length, kickoffTBAorDisputed: tbdCount, tvPending: tvPendingCount, records: 138, seasonCompleted: auditFinals.length, seasonFbsFinals: fbsFinals, seasonFcsFinals: fcsFinals },
  primary_records_note: `All 138 whole-team records match current provider standings and reproduce from the complete verified finals. ${138 - ncaaStandingsLag.length} equal their rows on the official NCAA standings page (${ncaaStandingsStamp ?? "no update stamp"}); ${ncaaStandingsLag.length} rows there had not yet counted a verified Week 11 final (${ncaaStandingsLag.map(r => r.slug).join(", ") || "none"}) and are recorded as lagging observations, each with separate official corroboration. Nine conference groups are also corroborated from their official standings pages. Whole-team totals include FCS opponents.`,
  broadcast_evidence: null,
  poll_editions: { ap: apPoll, coaches: coachesPoll },
  ap_edition_status: apStatus,
  school_corroborations: schoolCorroborations,
  ncaa_standings_lag: ncaaStandingsLag,
};

const audit = {
  schema_version: 1,
  scope: `Complete season review through the ${new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric" }).format(new Date(CUT))} cutoff: every completed game involving an FBS program, across eleven NCAA weekly inventories and the full provider calendar through Sunday, November 15`,
  data_cutoff_utc: CUT,
  verification_completed_at: new Date().toISOString(),
  counts: { completed: auditFinals.length, fbs_finals: fbsFinals, fcs_finals: fcsFinals, calendar_days: auditRawSources.filter(r => /^(history-|day-)/.test(r.id)).length, ncaa_weeks: 11 },
  raw_sources: auditRawSources,
  finals: auditFinals,
};
assert.equal(audit.counts.calendar_days, 86, `audit calendar days ${audit.counts.calendar_days}`);

// ------------------------------------------------------------ apply
const review = { finals, scheduled, scheduleWeeks: [11, 12], records, conferenceRecords, observedAt: CUT };
const next = reconcileGameDay(snapshot, review);
assert.equal(next.playedGames.length, fbsFinals, "published finals equal the audit");
assert.equal(next.scheduledGames.length, scheduled.length, "only the Week 12 slate is upcoming");
assert.equal(next.excludedGames.length, fcsFinals, "FCS finals unchanged this week");
// The conference tables and the overall records beside them are the records
// reconciled at this cutoff, so their own date says so. (The November 8
// release replaced the values but left the October 28 label in place.)
const CUT_LABEL = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric" }).format(new Date(CUT));
next.retainedBaseline.as_of = CUT.slice(0, 10);
next.retainedBaseline.verified_at = CUT;
next.retainedBaseline.note = `Overall and conference records reconciled ${CUT_LABEL}; source order is not an official conference tiebreak ranking.`;
next.retainedBaseline.overall_records_note = `Current overall and conference records rechecked ${CUT_LABEL} after Week 11.`;

// Full-season review line scores on every played row.
const auditByProvider = new Map(auditFinals.map(r => [r.provider_id, r]));
for (const row of next.playedGames) {
  const auditRow = auditByProvider.get(row.provider_id);
  assert.ok(auditRow, `published final missing from audit ${row.provider_id}`);
  assert.equal(row.date, auditRow.date); assert.equal(row.home_slug, auditRow.home_slug); assert.equal(row.away_slug, auditRow.away_slug);
  // Re-stamp the whole-season review on every row, preserving the prior
  // review's richer fields and refreshing the reconciled facts.
  row.meta.full_season_review = {
    ...row.meta.full_season_review,
    checked_at: audit.data_cutoff_utc,
    provider_id: auditRow.provider_id,
    ncaa_contest_id: auditRow.ncaa_contest_id,
    source_urls: row.meta.sources,
    line_score: auditRow.line_score,
    state: auditRow.state,
    ncaa_status: auditRow.ncaa_status,
    listed_kickoff_observations: row.meta.listed_kickoff_observations,
  };
}
// Every final main already publishes keeps its gameplay facts and stamps; only
// the whole-season review stamp advances.
const withoutReview = row => { const copy = structuredClone(row); delete copy.meta.full_season_review; return copy; };
for (const prior of snapshot.playedGames) {
  const kept = next.playedGames.find(g => (g.provider_id ?? g.game_id) === (prior.provider_id ?? prior.game_id));
  assert.ok(kept, `published final dropped ${prior.game_id}`);
  assert.deepEqual(withoutReview(kept), withoutReview(prior), `published final changed ${prior.game_id}`);
}

// Board weeks: Week 11 becomes an archive, Week 12 arrives as the preview.
const boardWeeks = structuredClone(snapshot.board_weeks);
assert.deepEqual(boardWeeks.map(w => w.week), [6, 7, 8, 9, 10, 11], "base board weeks");
const week11Board = boardWeeks.findIndex(w => w.week === 11);
const WEEK11_MARQUEE = boardWeeks[week11Board].marquee_game_id;
assert.ok(next.playedGames.some(g => g.game_id === WEEK11_MARQUEE && g.week === 11), `week 11 marquee final present ${WEEK11_MARQUEE}`);
const rescheduledNote = rescheduled.filter(r => r.played_date !== r.published_date).map(r => {
  const game = finalsById.get(r.provider_id);
  const label = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" }).format(new Date(r.played_kickoff_utc));
  return ` ${locationOf(game.away_slug)} at ${locationOf(game.home_slug)} was played ${label}.`;
}).join("");
boardWeeks[week11Board] = {
  ...boardWeeks[week11Board],
  retrieved_at: CUT, results_verified_at: CUT, records_verified_at: CUT,
  note: `Week 11 archive: all ${finals.length} FBS-vs-FBS games are verified finals, each matched between ESPN and the NCAA scoreboard.${rescheduledNote}`,
};
// Marquee by the board's own rule (lib/homepage.ts featuredGame): the lowest
// combined AP rank, an unranked side counting 150, earlier date first.
const marqueeScore = g => (apRanks.get(g.away_slug) ?? 150) + (apRanks.get(g.home_slug) ?? 150);
const marqueeRow = [...scheduled].sort((a, b) => marqueeScore(a) - marqueeScore(b) || a.date.localeCompare(b.date))[0];
const WEEK12_MARQUEE = `${marqueeRow.date}-${marqueeRow.away_slug}-at-${marqueeRow.home_slug}`;
console.log("week 12 marquee:", WEEK12_MARQUEE, "AP", apRanks.get(marqueeRow.away_slug) ?? "NR", "at", apRanks.get(marqueeRow.home_slug) ?? "NR");
boardWeeks.push({
  week: 12, start: "2026-11-16", end: "2026-11-22", label: "Nov 17–21", cutover_utc: "2026-11-15T14:00:00Z",
  snapshot_id: "week12-" + createHash("sha256").update(JSON.stringify(scheduled)).digest("hex").slice(0, 12),
  marquee_game_id: WEEK12_MARQUEE,
  retrieved_at: CUT, schedule_verified_at: CUT,
  note: `Week 12 full slate retrieved before any kickoff: ${scheduled.length} FBS-vs-FBS games; ${excludedUpcoming.length} FBS-vs-FCS games stay outside the board. Unannounced kickoffs and unpublished networks stay explicit; the poll editions predate the slate and keep their own dates.`,
});
next.board_weeks = boardWeeks;

// Polls and history. Only an edition that is replaced is archived.
next.polls = polls;
next.pollsStatus = AP_PUBLISHED
  ? `AP and AFCA Coaches editions published ${POLL_EDITION_LABEL}, ${POLL_EDITION_YEAR}, checked against NCAA/USA Today and ESPN. Prior November 8 editions are archived. Composite remains an editorial average (unranked = 26); build time is not source freshness.`
  : `AFCA Coaches edition published ${POLL_EDITION_LABEL}, ${POLL_EDITION_YEAR}, checked against USA Today and ESPN. No AP Top 25 edition for ${POLL_EDITION_LABEL} was published by ESPN or NCAA at the ${CUT_LABEL} retrieval, so the AP table is the November 8 edition with its own date. The prior November 8 Coaches edition is archived. Composite remains the editorial average of the two November 8 editions (unranked = 26); build time is not source freshness.`;
next.poll_history = [...snapshot.poll_history, { release_date: PRIOR_POLL_EDITION_DATE, polls: AP_PUBLISHED ? priorPolls : [priorCoaches] }];
next.poll_notes = pollNotes;

// The week's finals story: generated from the verified finals and the pregame
// (November 8) AP edition only. No opinion copy.
function locationOf(slug) {
  const event = allEvents.find(e => e.competitions[0].competitors.some(t => slugOf(t.team.id) === slug));
  return event.competitions[0].competitors.find(t => slugOf(t.team.id) === slug).team.location;
}
const rankedSides = finals.flatMap(g => [g.home_slug, g.away_slug]).filter(slug => pregameApRanks.has(slug));
const label = slug => pregameApRanks.has(slug) ? `No. ${pregameApRanks.get(slug)} ${locationOf(slug)}` : locationOf(slug);
const rankedLosses = finals.flatMap(g => {
  const [a, b] = g.teams; const winner = a.points > b.points ? a : b, loser = winner === a ? b : a;
  return pregameApRanks.has(loser.slug) ? [{ game: g, winner, loser }] : [];
}).sort((x, y) => pregameApRanks.get(x.loser.slug) - pregameApRanks.get(y.loser.slug));
const lossLines = rankedLosses.map(({ winner, loser }) => `${label(winner.slug)} ${winner.points}–${loser.points} over ${label(loser.slug)}`);
const playedLater = rescheduled.filter(r => r.played_date !== r.published_date).map(r => {
  const game = finalsById.get(r.provider_id);
  const [a, b] = game.teams; const winner = a.points > b.points ? a : b, loser = winner === a ? b : a;
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" }).format(new Date(r.played_kickoff_utc));
  return ` ${locationOf(game.away_slug)} at ${locationOf(game.home_slug)} was played ${day}: ${locationOf(winner.slug)} ${winner.points}–${loser.points}.`;
}).join("");
const finalsStory = {
  id: "week11-verified-finals",
  week: 11,
  headline: rankedLosses.length ? `Week 11 finals: ${rankedLosses.length} of ${rankedSides.length} AP-ranked teams lost` : `Week 11 finals: all ${rankedSides.length} AP-ranked teams won`,
  body: `All ${finals.length} FBS-vs-FBS finals match ESPN and NCAA. ${rankedSides.length} AP teams played and ${rankedLosses.length} lost, using the November 8 pregame poll${lossLines.length ? `: ${lossLines.join("; ")}` : ""}.${playedLater}`,
  game_provider_id: null,
  result_provider_ids: finals.map(g => g.provider_id),
  as_of: CUT.slice(0, 10),
  sources: ["https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings?seasons=2026&weeks=11&types=2", "https://www.ncaa.com/scoreboard/football/fbs/2026/11/all-conf"],
};
assert.ok(!snapshot.storylines.some(s => s.id === finalsStory.id || s.week === 11), "no Week 11 story on the base");
next.storylines = [finalsStory, ...snapshot.storylines];
console.log("story:", finalsStory.headline, "|", finalsStory.body);

// Metrics, dates, log.
next.metrics = evidence.metrics;
next.requested_cutoff = CUT;
next.retrieved_at = CUT;
next.week = 12;
next.week_start = "2026-11-16";
next.reference_date = "2026-11-15";
next.baseline_note = `Week 11 complete: ${finals.length} verified finals. Week 12 is the full upcoming slate. Weeks 6-10 are archived boards; source facts, historical editorial modules and unavailable projections keep separate dates.`;
next.results_verified_at = CUT;
next.schedule_verified_at = CUT;
next.records_verified_at = CUT;
next.refresh_log = [...snapshot.refresh_log, { applied_at: new Date().toISOString(), evidence_checked_at: CUT, script: SCRIPT_ID, evidence: "data/cfb-2026/refresh/evidence/2026-11-15-week11-refresh.json", scope: `Complete Week 11 finals (${finals.length}), full Week 12 slate (${scheduled.length}), 138 primary-source whole-team records, ${POLL_EDITION_LABEL} AFCA Coaches edition${AP_PUBLISHED ? " and AP edition" : "; AP edition not yet published, November 8 edition kept"}, NCAA leaders` }];
next.full_season_review = { checked_at: audit.verification_completed_at, through_games: CUT, completed: auditFinals.length, fbs_finals: fbsFinals, fcs_finals: fcsFinals, evidence: "data/cfb-2026/refresh/evidence/2026-11-15-full-season-audit.json", note: "All eleven NCAA weekly inventories and the full provider calendar reconciled through November 15; whole-team totals reproduce all 138 independently verified official records. Week 11 completes the board; source cutoff is unchanged by later verification." };
next.team_records_review = {
  as_of: CUT,
  verified: 138,
  carried_from_2026_10_10: [],
  withheld: [],
  rule: "All 138 current overall and conference records match fresh provider standings and reconcile from the prior reviewed snapshot plus the corroborated finals.",
  note: `${138 - ncaaStandingsLag.length} records equal their rows on the official NCAA standings page; ${ncaaStandingsLag.length} rows there had not yet counted a verified Week 11 final at the cutoff and those records rest on provider standings, the verified final and a conference or host-school page. Nine conference groups are also corroborated from their official standings pages. Whole-team totals include FCS opponents; never derived from the filtered board.`,
};
next.holds = [
  "Ratings retain their September 27 snapshot and SOS its independent source date; current licensed SP+/FPI/FEI updates are unavailable.",
  `National leader cards use NCAA tables at the ${CUT_LABEL} retrieval; detailed team/player season tables remain the September 5 sample. A complete current statistical warehouse is unavailable.`,
  "Roster/depth and portal coverage keeps its dated inventories; absence from them is not an assertion of no change.",
  "Injury research retains its October 22 as-of; no Week 11/12 official availability designation is inferred from unreviewed reports.",
  "SP+ and FPI remain unavailable pending permitted, verified sources.",
];

// ranked matchups for the new preview week (current AP edition)
next.ranked_matchups = scheduled.filter(g => (apRanks.get(g.home_slug) ?? 99) <= 25 && (apRanks.get(g.away_slug) ?? 99) <= 25).slice(0, 6).map(g => ({ game_id: `${g.date}-${g.away_slug}-at-${g.home_slug}`, matchup: `${g.home_slug} vs ${g.away_slug}`, polls: ["ap"] }));

// ---------------------------------------------------------------- write
writeFileSync(new URL("../data/cfb-2026/refresh/evidence/2026-11-15-week11-refresh.json", import.meta.url), JSON.stringify(evidence));
writeFileSync(new URL("../data/cfb-2026/refresh/evidence/2026-11-15-full-season-audit.json", import.meta.url), JSON.stringify(audit));
writeFileSync(new URL("../data/cfb-2026/refresh/verified-refresh.json", import.meta.url), JSON.stringify(next));

const oldest = receipts.reduce((a, r) => (a.checkedAt < r.checkedAt ? a : r));
console.log(JSON.stringify({
  cutoff: CUT,
  oldestReceipt: oldest.checkedAt,
  mergeBy: new Date(Date.parse(oldest.checkedAt) + 105 * 60_000).toISOString(),
  gateExpiry: new Date(Date.parse(oldest.checkedAt) + 120 * 60_000).toISOString(),
  sources: receipts.length,
  finals: finals.length,
  rescheduled: rescheduled.length,
  scheduled: scheduled.length,
  excludedUpcoming: excludedUpcoming.length,
  playedTotal: next.playedGames.length,
  excludedTotal: next.excludedGames.length,
  records: Object.keys(next.teamRecords).length,
  byes: byes.length,
  kickoffTbd: tbdCount,
  tvUnpublished: tvPendingCount,
  auditCompleted: auditFinals.length,
  apPublished: AP_PUBLISHED,
  polls: next.polls.map(p => `${p.poll}@${p.release_date}`),
  boardWeeks: next.board_weeks.map(w => w.week),
  marquee: WEEK12_MARQUEE,
}, null, 1));
