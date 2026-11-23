// Weekly refresh builder: Week 12 finals, Week 13 slate, November 22 polls.
//
// Fetches every required source once with a receipt, reconciles the reviewed
// snapshot from those receipts, and writes:
//   data/cfb-2026/refresh/evidence/2026-11-22-week12-refresh.json
//   data/cfb-2026/refresh/evidence/2026-11-22-full-season-audit.json
//   data/cfb-2026/refresh/verified-refresh.json
//
// Usage: node scripts/build-weekly-refresh-2026-11-22.mjs <scratch-dir>
// The scratch dir holds the raw downloaded responses (never committed).
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { reconcileGameDay, editorialComposite } from "./reconcile-gameday.mjs";
import { htmlTables, htmlText, ncaaInventory, tvPattern } from "./gameday-source-validation.mjs";
import { HOST_SCHEDULE_SOURCES, HOST_KICKOFF_SETTLEMENTS, HELD_KICKOFFS, zonedToUtc } from "./week13-host-kickoffs.mjs";

// The AP and AFCA Coaches poll edition this release publishes (provider date,
// YYYY-MM-DD). Every poll-date assertion and label below derives from it.
const POLL_EDITION_DATE = "2026-11-22";
// The editions the base snapshot carries. They differ: the November 15 release
// kept the November 8 AP edition because no newer AP poll was published at its
// retrieval, and took the November 15 Coaches edition.
const BASE_AP_EDITION_DATE = "2026-11-08";
const BASE_COACHES_EDITION_DATE = "2026-11-15";
// The AP edition that preceded the Week 12 games. The provider published it on
// November 16, after the November 15 release was captured, so the base
// snapshot never carried it. It supplies the pregame ranks of the Week 12
// finals and the week-over-week AP movement, and is archived with its own date.
const PREGAME_AP_EDITION_DATE = "2026-11-16";
const SCRIPT_ID = "weekly-refresh-2026-11-22";
const BASE_SCRIPT_ID = "weekly-refresh-2026-11-15";
const longDate = ymd => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric" }).format(new Date(`${ymd}T12:00:00Z`));
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
// Refresh origin/main before reading it, so the base is what main publishes
// now. A shallow checkout without the ref fetches just that ref.
let hasMainRef = true;
try { execSync("git rev-parse --verify --quiet refs/remotes/origin/main", { cwd: repoRoot, stdio: "ignore" }); } catch { hasMainRef = false; }
execSync(`git fetch --no-tags ${hasMainRef ? "" : "--depth=1 "}origin +main:refs/remotes/origin/main`, { cwd: repoRoot, stdio: "inherit" });
const publishedSnapshot = JSON.parse(execSync("git show origin/main:apps/site/data/cfb-2026/refresh/verified-refresh.json", { encoding: "utf8", maxBuffer: 1024 * 1024 * 512, cwd: repoRoot }));
const workingSnapshot = read("data/cfb-2026/refresh/verified-refresh.json");
const snapshot = workingSnapshot.refresh_log.at(-1).script === SCRIPT_ID ? structuredClone(publishedSnapshot) : workingSnapshot;
assert.notEqual(snapshot.refresh_log.at(-1).script, SCRIPT_ID, "base snapshot already carries this release");
assert.equal(snapshot.refresh_log.at(-1).script, BASE_SCRIPT_ID, "base snapshot is the November 15 release");
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
  // A cached body is reused only while its receipt is a 200 inside the
  // two-hour window for the same URL and the body still has the receipt's
  // hash. Anything else is fetched again, so an old scratch directory can
  // never feed stale sources into a release.
  if (existsSync(cached)) {
    const saved = loadReceipts().find(r => r.id === id);
    const age = saved ? Date.now() - Date.parse(saved.checkedAt) : Number.NaN;
    const body = readFileSync(cached, "utf8");
    if (saved?.status === 200 && saved.url === url && age >= 0 && age < 7_200_000 && createHash("sha256").update(body).digest("hex") === saved.sha256) {
      docs.set(id, body);
      receipts.push(saved);
      return saved;
    }
  }
  // Some official sites answer an occasional 403 from their bot filter. A
  // receipt is only ever a 200; a non-200 or a dropped connection is retried
  // twice, a few seconds apart, before the build stops.
  let response, body, lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, 4_000 * attempt));
    try {
      response = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 CFB-Apex-verification/1.0", accept: "text/html,application/json;q=0.9,*/*;q=0.8" },
        signal: AbortSignal.timeout(30_000),
      });
      // The body is read inside the loop: a connection that drops after the
      // headers is retried like any other failed attempt.
      body = await response.text();
      if (response.status === 200) break;
    } catch (error) { lastError = error; response = undefined; body = undefined; }
  }
  assert.ok(response && body !== undefined, `${id}: ${url} ${lastError?.message ?? ""}`);
  assert.equal(response.status, 200, `${id}: ${url}`);
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
// Season calendar days through the Week 13 board (Aug 22 .. Nov 29). Days
// through Nov 21 are the completed-season audit trail (the last Week 12 final
// was played Saturday, November 21); Nov 24-28 carry the upcoming Week 13 slate.
for (let d = new Date("2026-08-22T00:00:00Z"); d <= new Date("2026-11-29T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
  const ymd = d.toISOString().slice(0, 10).replaceAll("-", "");
  const prefix = ymd >= "20261117" && ymd <= "20261129" ? "day" : "history";
  daily.push([`${prefix}-${ymd}`, espnDay(ymd)[2]]);
}
// Reviewed slate size: the build stops if the provider's Week 13 inventory
// changes, so a new or dropped fixture is reconciled by hand, never absorbed.
const WEEK13_FIXTURES = 69;
const WEEK13_FCS_FIXTURES = 0;
const weekly = [
  ["espn-standings", "https://site.web.api.espn.com/apis/v2/sports/football/college-football/standings?season=2026&level=3&group=80"],
  ["rankings", "https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings?seasons=2026"],
  // The provider's own Week 12 document: the receipt for the November 16 AP
  // edition, the poll that preceded the Week 12 games.
  ["rankings-ap-pregame", "https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings?seasons=2026&weeks=12&types=2"],
  ["ap-ncaa", "https://www.ncaa.com/rankings/football/fbs/associated-press"],
  // Second aggregator for the AP table; its "Prev" column states each ranked
  // team's rank in the preceding (November 16) edition.
  ["ap-usatoday", "https://sportsdata.usatoday.com/football/ncaaf/ap-poll"],
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
  // Host school schedules that settle a kickoff the provider and the NCAA do
  // not both state (see HOST_KICKOFF_SETTLEMENTS).
  ...HOST_SCHEDULE_SOURCES,
];
const ncaaWeeks = [];
for (let week = 1; week <= 13; week++) ncaaWeeks.push([week < 10 ? `ncaa-history-${week}` : `ncaa${week}`, `https://www.ncaa.com/scoreboard/football/fbs/2026/${String(week).padStart(2, "0")}/all-conf`]);

await batched(daily, 6);
await batched(ncaaWeeks, 4);
await batched(weekly, 6);
// A build-time receipt for the November 16 AP edition: a second aggregator's
// archived page of that edition. The edition is historical and does not
// change, so this receipt is recorded with its hash and observed rows in the
// evidence and is not one of the sources the gate re-fetches for freshness.
const PREGAME_AP_ARCHIVE = ["ap-pregame-archive", "https://collegepolltracker.com/football/2026/week-11"];
const pregameArchiveReceipt = await grab(...PREGAME_AP_ARCHIVE);
receipts.splice(receipts.indexOf(pregameArchiveReceipt), 1);
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
// Week 12 was played Tuesday, November 17 through Saturday, November 21; the
// Week 13 slate runs Tuesday, November 24 through Saturday, November 28.
const WEEK_DAYS = { 12: ["20261117", "20261118", "20261119", "20261120", "20261121"], 13: ["20261124", "20261125", "20261126", "20261127", "20261128"] };
const weekEvents = week => WEEK_DAYS[week].flatMap(d => eventsByDay.get(d) ?? []);
for (const week of [12, 13]) {
  assert.equal(allEvents.filter(e => e.week?.number === week).length, weekEvents(week).length, `week ${week} events outside its reviewed provider days`);
  assert.ok(weekEvents(week).every(e => e.week?.number === week), `foreign event on a week ${week} provider day`);
}

// Poll editions. Both the AP and the Coaches edition must be the new one: this
// release is built only once the provider publishes both.
const rankingsDoc = JSON.parse(docs.get("rankings"));
const apNewEdition = rankingsDoc.rankings.find(p => p.id === "1");
const coachesEdition = rankingsDoc.rankings.find(p => p.id === "2");
assert.ok(apNewEdition, "AP edition present");
assert.ok(coachesEdition, "Coaches edition present");
assert.equal(apNewEdition.date.slice(0, 10), POLL_EDITION_DATE, "AP edition");
assert.equal(coachesEdition.date.slice(0, 10), POLL_EDITION_DATE, "Coaches edition");
const AP_PUBLISHED = true;
const basePolls = snapshot.polls.filter(p => p.poll !== "composite");
const baseAp = basePolls.find(p => p.poll === "ap");
const baseCoaches = basePolls.find(p => p.poll === "coaches");
assert.equal(baseAp.release_date, BASE_AP_EDITION_DATE, "base AP edition");
assert.equal(baseCoaches.release_date, BASE_COACHES_EDITION_DATE, "base Coaches edition");
// The November 16 AP edition, from the provider's Week 12 document.
const apPregameEdition = JSON.parse(docs.get("rankings-ap-pregame")).rankings.find(p => p.id === "1");
assert.ok(apPregameEdition && apPregameEdition.date.slice(0, 10) === PREGAME_AP_EDITION_DATE, "provider Week 12 AP edition");
assert.equal(apPregameEdition.ranks.length, 25, "provider Week 12 AP rows");
assert.ok(apPregameEdition.ranks.every(r => slugOf(r.team.id)), "provider Week 12 AP teams are FBS members");
// Second sources for that edition.
//   1. The new edition states each ranked team's previous rank. The provider
//      and USA Today's AP table ("Prev" column) must both give the provider's
//      Week 12 rank for every team ranked in both editions, and "NR"/0 for a
//      team that was not ranked. The ranks USA Today's column no longer lists
//      must be exactly the Week 12 ranks of the teams that left the Top 25,
//      and the provider's own dropped-out list must name the same teams.
//   2. A second aggregator's archived page of the November 16 edition itself
//      must list the same 25 teams at the same ranks with the same records.
// The official NCAA AP table also prints a "PREVIOUS RANKING" column. Its
// values are recorded as an observation only and are not used.
const pregameApRanks = new Map(apPregameEdition.ranks.map(r => [slugOf(r.team.id), r.current]));
assert.equal(pregameApRanks.size, 25, "pregame AP edition has 25 distinct teams");
const apRanks = new Map(apNewEdition.ranks.map(r => [slugOf(r.team.id), r.current]));
const usaTodayApTable = htmlTables(docs.get("ap-usatoday")).find(t => t.some(row => /PTS/i.test(row.join(" "))));
assert.ok(usaTodayApTable && usaTodayApTable.length - 1 === 25, "USA Today AP table rows");
const usaPrevColumn = usaTodayApTable[0].findIndex(h => /^prev$/i.test(h));
const usaPointsColumn = usaTodayApTable[0].findIndex(h => /^pts$/i.test(h));
const usaRecordColumn = usaTodayApTable[0].findIndex(h => /^record$/i.test(h));
assert.ok(usaPrevColumn > 0 && usaPointsColumn > 0 && usaRecordColumn > 0, "USA Today AP table columns");
assert.match(htmlText(docs.get("ap-usatoday")), /Published November 22, 2026/, "USA Today AP table edition date");
const ncaaApTable = htmlTables(docs.get("ap-ncaa")).find(t => t.some(row => /SCHOOL/i.test(row.join(" "))));
const ncaaPrevColumn = ncaaApTable?.[0].findIndex(h => /PREVIOUS/i.test(h)) ?? -1;
const pregameCorroboration = [];
apNewEdition.ranks.forEach((r, i) => {
  const slug = slugOf(r.team.id);
  const usaRow = usaTodayApTable[i + 1];
  // The USA Today row is this edition's same rank, points and record.
  assert.equal(Number(usaRow[0]), r.current, `USA Today AP rank ${slug}`);
  assert.equal(Number(usaRow[usaPointsColumn].replaceAll(",", "")), r.points, `USA Today AP points ${slug}`);
  assert.equal(usaRow[usaRecordColumn], r.recordSummary, `USA Today AP record ${slug}`);
  const usaPrevious = /^\d+$/.test(usaRow[usaPrevColumn]) ? Number(usaRow[usaPrevColumn]) : null;
  if (usaPrevious == null) assert.equal(usaRow[usaPrevColumn], "NR", `USA Today previous rank ${slug}`);
  const expected = pregameApRanks.get(slug) ?? null;
  assert.equal(usaPrevious, expected, `USA Today previous rank ${slug}`);
  assert.equal(r.previous || null, expected, `provider previous rank ${slug}`);
  pregameCorroboration.push({ team_slug: slug, pregame_rank: expected, provider_previous: r.previous || null, usa_today_previous: usaPrevious, ncaa_previous_column_observation: ncaaPrevColumn > 0 ? ncaaApTable[i + 1]?.[ncaaPrevColumn] ?? null : null });
});
const pregameLeft = [...pregameApRanks].filter(([slug]) => !apRanks.has(slug)).map(([slug, rank]) => ({ team_slug: slug, rank }));
const usaPreviousTop25 = new Set(pregameCorroboration.map(row => row.usa_today_previous).filter(rank => rank != null));
const vacated = Array.from({ length: 25 }, (_, i) => i + 1).filter(rank => !usaPreviousTop25.has(rank));
assert.deepEqual(pregameLeft.map(r => r.rank).sort((a, b) => a - b), vacated, "ranks vacated in USA Today's previous-rank column equal the Week 12 ranks of the teams that left");
assert.deepEqual(new Set((apNewEdition.droppedOut ?? []).map(r => slugOf(r.team.id))), new Set(pregameLeft.map(r => r.team_slug)), "provider dropped-out list");
// The archived page of the November 16 edition: 25 rows, same rank, team and record.
const archiveText = htmlText(docs.get(PREGAME_AP_ARCHIVE[0]));
assert.match(archiveText, /AP Poll \(Nov 16, 2026\)/, "archived AP page is the November 16 edition");
const archiveRows = [...archiveText.matchAll(/(?:^|\s)(\d{1,2}) ([A-Z][A-Za-z&.'() -]*?) (?:\(\d+\) )?(\d{1,2}-\d{1,2}) Previous: \S+/g)].map(m => ({ rank: Number(m[1]), team: m[2], record: m[3] })).slice(0, 25);
assert.deepEqual(archiveRows.map(row => row.rank), Array.from({ length: 25 }, (_, i) => i + 1), "archived AP page lists ranks 1-25 in order");
const plainName = value => value.replace(/\s*\(.*?\)/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
apPregameEdition.ranks.forEach((r, i) => {
  assert.equal(r.current, archiveRows[i].rank, `archived AP rank ${r.team.location}`);
  assert.equal(plainName(archiveRows[i].team), plainName(r.team.location), `archived AP team at No. ${r.current}`);
  assert.equal(archiveRows[i].record, r.recordSummary, `archived AP record ${r.team.location}`);
});
const pregameArchive = { id: pregameArchiveReceipt.id, url: pregameArchiveReceipt.url, checkedAt: pregameArchiveReceipt.checkedAt, sha256: pregameArchiveReceipt.sha256, bytes: pregameArchiveReceipt.bytes, edition_label: "AP Poll (Nov 16, 2026)", rows: archiveRows };
console.log("AP editions: new", apNewEdition.date.slice(0, 10), "| pregame", apPregameEdition.date.slice(0, 10), "| left the Top 25:", JSON.stringify(pregameLeft), "| provider default document polls:", rankingsDoc.rankings.map(p => `${p.id}@${p.date.slice(0, 10)}`).join(", "));

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

// Every Week 12 final is F on the NCAA scoreboard at this cutoff; a non-final
// NCAA row fails the build instead of being promoted on a guess. No Week 12
// final needs a school receipt: none moved off its listed date and none is
// still in progress on the NCAA scoreboard. The table stays so a later
// re-capture that finds such a row has to add a reviewed receipt first.
const SCHOOL_CORROB = {};
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
for (const event of weekEvents(12)) {
  const competition = event.competitions[0];
  assert.ok(!snapshot.playedGames.some(p => p.provider_id === event.id), `Week 12 event already published as a final: ${event.id}`);
  // Never promote a game because its kickoff time passed: the provider must
  // report it completed, and a postponed or canceled game stops the build.
  assert.equal(competition.status.type.completed, true, `Week 12 event not completed at cutoff: ${event.id} (${competition.status.type.name})`);
  assert.equal(competition.status.type.state, "post", `Week 12 event state ${event.id}`);
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
assert.equal(finals.length, 66, `finals count ${finals.length}`);
// The four FBS-vs-FCS games the November 15 release kept outside the board.
// They are completed too: each is a verified final for the whole-team records
// and the full-season audit, and joins the excluded rows, never the board.
assert.equal(fcsFinalEvents.length, 4, `Week 12 FCS finals ${fcsFinalEvents.length}`);
const baseWeekEvidence = read("data/cfb-2026/refresh/evidence/2026-11-15-week11-refresh.json");
assert.deepEqual(new Set(fcsFinalEvents.map(e => e.id)), new Set(baseWeekEvidence.excluded_upcoming.map(row => row.provider_id)), "Week 12 FCS finals equal the fixtures the November 15 release excluded");
const fcsFinalRows = fcsFinalEvents.map(event => {
  const competition = event.competitions[0];
  const home = competition.competitors.find(t => t.homeAway === "home");
  const away = competition.competitors.find(t => t.homeAway === "away");
  const homeSlug = slugOf(home.team.id), awaySlug = slugOf(away.team.id);
  assert.ok((homeSlug == null) !== (awaySlug == null), `FCS final must have exactly one FBS side ${event.id}`);
  for (const team of [home, away]) {
    const quarters = (team.linescores ?? []).map(q => q.value);
    assert.ok(quarters.length >= 4, `line score missing ${event.id}`);
    assert.equal(quarters.reduce((a, b) => a + b, 0), Number(team.score), `line score sum ${event.id}`);
  }
  const contestId = eventMatch.get(event.id);
  assert.ok(contestId, `no NCAA contest for ${event.id}`);
  const contest = ncaaByContest.get(contestId);
  assert.equal(contest.gameState, "F", `NCAA state ${event.id}`);
  const ncaaHome = contest.teams.find(t => t.isHome), ncaaAway = contest.teams.find(t => !t.isHome);
  assert.equal(Number(ncaaHome.score), Number(home.score), `NCAA home score ${event.id}`);
  assert.equal(Number(ncaaAway.score), Number(away.score), `NCAA away score ${event.id}`);
  if (homeSlug) assert.equal(seonameToSlug.get(ncaaHome.seoname), homeSlug, `NCAA home ${event.id}`);
  if (awaySlug) assert.equal(seonameToSlug.get(ncaaAway.seoname), awaySlug, `NCAA away ${event.id}`);
  return {
    provider_id: event.id,
    source_url: `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=${etDate(event.date).replaceAll("-", "")}&groups=80&limit=200`,
    date: etDate(event.date),
    kickoff_utc: event.date,
    week: 12,
    home_slug: homeSlug,
    away_slug: awaySlug,
    site: competition.venue?.fullName ?? null,
    tv: broadcastOf(competition),
    neutral_site: competition.neutralSite === true,
    verified_at: CUT,
    name: `${away.team.displayName} at ${home.team.displayName}`,
    reason: "FBS–FCS: one opponent is outside the verified current 138-team membership. Retained in full-season evidence and whole-team records; native board displays FBS vs FBS.",
    espn_conference_ids: { home: home.team.conference?.id ?? home.team.conferenceId ?? null, away: away.team.conference?.id ?? away.team.conferenceId ?? null },
    home_score: Number(home.score), away_score: Number(away.score),
    state: competition.status.type,
    ncaa_url: `https://www.ncaa.com/game/${contestId}`,
  };
});
const schoolHosts = read("data/cfb-2026/refresh/official-school-hosts.json").hosts;
const schoolCorroborations = Object.entries(SCHOOL_CORROB).map(([providerId, rule]) => {
  const game = finalsById.get(providerId);
  assert.ok(game, `school corroboration for a game outside the Week 12 finals ${providerId}`);
  assert.equal(game.home_slug, rule.host_slug, `school corroboration must come from the host ${providerId}`);
  const source = weekly.find(([id]) => id === rule.id);
  assert.equal(new URL(source[1]).hostname, schoolHosts[rule.host_slug], `school source is not the host's official site ${providerId}`);
  const observed = htmlText(docs.get(rule.id)).match(rule.expect);
  assert.ok(observed, `school page does not show the reviewed final (${rule.school})`);
  game.corroborator = { kind: "school", id: rule.id };
  return { provider_id: providerId, kind: "school", source_id: rule.id, school: rule.school, url: source[1], observed_text: observed[0] };
});
// Every Week 12 final replaces exactly one published scheduled row.
const publishedWeek12 = snapshot.scheduledGames.filter(row => row.week === 12);
assert.equal(publishedWeek12.length, 66, "published Week 12 slate");
assert.deepEqual(new Set(publishedWeek12.map(row => row.provider_id)), new Set(finalsById.keys()), "Week 12 finals equal the published slate");
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

// ------------------------------------------------------------ week 13 slate
const tvText = htmlText(docs.get("tv-ncaa"));
function tvArticleRow(awayName, homeName) {
  const norm = s => s.toLowerCase().replace(/\(.*\)/g, "").replace(/[^a-z0-9]/g, "");
  const a = norm(awayName), h = norm(homeName);
  const lines = tvText.split(/(?=Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday,)/);
  for (const block of lines) {
    if (!/November 2[3-9]|Nov\. 2[3-9]/.test(block)) continue;
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
// A Week 13 kickoff is published only when the provider and the NCAA agree on
// it (the NCAA scoreboard lists the same instant, or the official NCAA TV
// article lists the same Eastern time), or when the host school's own official
// schedule settles it (literal text, the host's listed local time, and the
// page's own UTC instant where it publishes one). The source gate re-asserts
// each settlement. `local` is the host's listed date, time and time zone.
const officialHosts = read("data/cfb-2026/refresh/official-school-hosts.json").hosts;
const kickoffDisagreements = [], kickoffSettlements = [], ncaaAbsent = [], kickoffHolds = [], settlementsSuperseded = [];
// FBS-vs-FCS games stay outside the board; each carries the provider's own
// conference ids as evidence that one side is outside the 138-team membership.
const FBS_CONFERENCE_IDS = new Set(["1", "4", "5", "8", "9", "12", "15", "17", "18", "37", "151"]);
const excludedUpcoming = [];
for (const event of weekEvents(13)) {
  const competition = event.competitions[0];
  const home = competition.competitors.find(t => t.homeAway === "home");
  const away = competition.competitors.find(t => t.homeAway === "away");
  const homeSlug = slugOf(home.team.id), awaySlug = slugOf(away.team.id);
  assert.equal(competition.status.type.completed, false, `week 13 event already completed ${event.id}`);
  assert.equal(competition.status.type.name, "STATUS_SCHEDULED", `week 13 event status ${event.id}`);
  if (!homeSlug || !awaySlug) {
    const conferenceIds = { home: home.team.conferenceId ?? null, away: away.team.conferenceId ?? null };
    const fcsSide = homeSlug ? "away" : "home";
    assert.ok(homeSlug || awaySlug, `week 13 event without an FBS side ${event.id}`);
    assert.ok(conferenceIds[fcsSide] != null && !FBS_CONFERENCE_IDS.has(String(conferenceIds[fcsSide])), `no FCS conference-id evidence ${event.id}`);
    excludedUpcoming.push({ provider_id: event.id, date: etDate(event.date), week: 13, name: event.name, home_slug: homeSlug, away_slug: awaySlug, espn_conference_ids: conferenceIds, ncaa_contest_id: eventMatch.get(event.id) ?? null, reason: "FBS–FCS: one opponent is outside the verified current 138-team membership; the board displays FBS vs FBS." });
    continue;
  }
  const contestId = eventMatch.get(event.id);
  // A fixture the NCAA scoreboard does not list at all is published only on
  // a reviewed host-school settlement that says so (`ncaa_absent`).
  if (!contestId) {
    assert.ok(HOST_KICKOFF_SETTLEMENTS[event.id]?.ncaa_absent === true, `no NCAA contest for week 13 event ${event.id} (${event.name})`);
    ncaaAbsent.push(event.id);
  } else assert.ok(!HOST_KICKOFF_SETTLEMENTS[event.id]?.ncaa_absent, `NCAA scoreboard now lists ${event.id}; reconcile the settlement`);
  const ncaaRow = contestId ? ncaaByContest.get(contestId) : null;
  const ncaaGameUrl = contestId ? `https://www.ncaa.com/game/${contestId}` : "";
  const timeValid = competition.timeValid === true;
  const hasNcaaTime = ncaaRow?.hasStartTime === true;
  const article = tvArticleRow(away.team.displayName, home.team.displayName);
  const espnTv = broadcastOf(competition);
  let kickoff_utc, kickoff_status, timing_sources, timing_note, settlement = null;
  if (timeValid) {
    kickoff_utc = event.date;
    kickoff_status = "confirmed";
    timing_sources = [event.sourceUrl ?? "", ncaaGameUrl].filter(Boolean);
    timing_note = null;
    const ncaaListed = hasNcaaTime ? new Date(ncaaRow.startTimeEpoch * 1000).toISOString() : null;
    const scoreboardAgrees = hasNcaaTime && ncaaRow.startTimeEpoch * 1000 === Date.parse(event.date);
    let articleAgrees = false;
    if (article?.time) {
      const literal = article.time.match(/(\d{1,2})(?::(\d{2}))?\s*([ap])\s*\.\s*m/i);
      assert.ok(literal, `unparsable TV article time: ${article.raw}`);
      const articleEt = `${String(Number(literal[1]) % 12 + (literal[3].toLowerCase() === "p" ? 12 : 0)).padStart(2, "0")}:${literal[2] ?? "00"}`;
      articleAgrees = etTime(event.date) === articleEt;
    }
    // A reviewed host settlement is used only while the NCAA scoreboard does not
    // state the provider instant itself. Once it does, the two boards agree and
    // the row needs no settlement.
    const reviewedRule = HOST_KICKOFF_SETTLEMENTS[event.id];
    if (reviewedRule && scoreboardAgrees) settlementsSuperseded.push(event.id);
    const rule = scoreboardAgrees ? undefined : reviewedRule;
    const held = HELD_KICKOFFS[event.id];
    assert.ok(!(rule && held), `settlement and hold for one event ${event.id}`);
    if (held) {
      assert.equal(held.host_slug, homeSlug, `hold must cite the host school ${event.id}`);
      const source = weekly.find(([id]) => id === held.id);
      assert.equal(new URL(source[1]).hostname, officialHosts[homeSlug], `school source is not the host's official site ${event.id}`);
      const page = docs.get(held.id);
      const hostText = held.raw ? page : htmlText(page);
      assert.match(hostText, held.expect, `host schedule no longer shows the reviewed listing (${held.school})`);
      const hostUtc = zonedToUtc(held.local);
      assert.notEqual(Date.parse(hostUtc), Date.parse(event.date), `host schedule now agrees with the provider; settle ${event.id}`);
      assert.ok(!hasNcaaTime, `NCAA scoreboard now lists a start time for ${event.id}; reconcile the hold`);
      kickoff_utc = null;
      kickoff_status = "official_tbd";
      timing_sources = [source[1], event.sourceUrl ?? ""].filter(Boolean);
      timing_note = null;
      kickoffHolds.push({ provider_id: event.id, name: event.name, kind: "unsettled", source_id: held.id, school: held.school, url: source[1], observed_text: hostText.match(held.expect)[0], host_local: { date: held.local[0], time: held.local[1], time_zone: held.local[2] }, host_kickoff_utc: hostUtc, espn_listed_kickoff_utc: event.date, ncaa_listed_kickoff_utc: null });
    } else if (rule) {
      // The host school's own official schedule settles its home game: the
      // provider must show the same instant. The NCAA scoreboard's listing
      // (a different instant, or none yet) stays a separate observation.
      assert.ok(!scoreboardAgrees, `settlement recorded for a kickoff the NCAA scoreboard already agrees on ${event.id}`);
      assert.equal(rule.host_slug, homeSlug, `settlement must come from the host school ${event.id}`);
      const source = weekly.find(([id]) => id === rule.id);
      assert.equal(new URL(source[1]).hostname, officialHosts[homeSlug], `school source is not the host's official site ${event.id}`);
      const page = docs.get(rule.id);
      // `raw` rules read the page's own structured data (schema.org SportsEvent).
      const hostText = rule.raw ? page : htmlText(page);
      assert.match(hostText, rule.expect, `host schedule no longer shows the reviewed kickoff (${rule.school})`);
      const hostUtc = zonedToUtc(rule.local);
      if (rule.page_utc) {
        assert.ok(page.includes(rule.page_utc_literal ?? `"date_utc":"${rule.page_utc}"`), `host schedule UTC instant changed (${rule.school})`);
        assert.equal(Date.parse(rule.page_utc), Date.parse(hostUtc), `host page instant differs from its listed local time (${rule.school})`);
      }
      assert.equal(Date.parse(hostUtc), Date.parse(event.date), `host schedule differs from the provider listing ${event.id}`);
      settlement = { kind: "host-school", source_id: rule.id, school: rule.school, url: source[1], observed_text: hostText.match(rule.expect)[0], ncaa_absent: rule.ncaa_absent === true, host_local: { date: rule.local[0], time: rule.local[1], time_zone: rule.local[2] }, host_page_utc: rule.page_utc, host_kickoff_utc: hostUtc, espn_listed_kickoff_utc: event.date, ncaa_listed_kickoff_utc: ncaaListed };
      timing_sources = [source[1], ...timing_sources];
      timing_note = ncaaListed
        ? `Announced kickoff: the host school's official schedule and the provider listing agree (${hostUtc}); the NCAA scoreboard lists ${ncaaListed}.`
        : `Announced kickoff: the host school's official schedule and the provider listing agree (${hostUtc}).`;
      kickoffSettlements.push({ provider_id: event.id, ...settlement });
    } else if (scoreboardAgrees) {
      timing_note = articleAgrees ? "Announced kickoff: NCAA TV article and provider listing agree" : "Announced kickoff: provider listing";
    } else if (!hasNcaaTime && articleAgrees) {
      timing_sources = [...timing_sources, "https://www.ncaa.com/news/football/article/college-football-tv-schedule-game-times-preview"];
      timing_note = "Announced kickoff: NCAA TV article and provider listing agree";
    } else {
      // The provider and the NCAA do not both state this kickoff. Only the
      // host school's own official schedule settles it; without that reviewed
      // settlement the build stops instead of choosing a side.
      kickoffDisagreements.push({ provider_id: event.id, name: event.name, host: homeSlug, espn: event.date, ncaa: ncaaListed, ncaa_tv_article: article?.time ?? null });
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
    timing_sources = ["https://www.ncaa.com/scoreboard/football/fbs/2026/13/all-conf", `https://www.ncaa.com/game/${contestId}`];
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
    kickoff_utc, kickoff_status, week: 13,
    home_slug: homeSlug, away_slug: awaySlug,
    home: homeSlug, away: awaySlug,
    tv, tv_status,
    time_et: kickoff_utc == null ? null : timeValid ? etTime(event.date) : etTime(kickoff_utc),
    site: competition.venue?.fullName ?? null,
    neutral_site: competition.neutralSite === true,
    verified_at: CUT,
    game_status: "scheduled",
    announced_kickoff_utc: kickoff_utc,
    timing_sources, ...(timing_note ? { timing_note } : {}),
    source_urls: [event.sourceUrl ?? "", ncaaGameUrl].filter(Boolean),
    ncaa_listed_kickoff_utc: hasNcaaTime ? new Date(ncaaRow.startTimeEpoch * 1000).toISOString() : null,
    official_tv: article?.tv ? { observed_text: article.raw, tv: TV[article.tv] ?? article.tv, time: article.time } : null,
    ...(settlement ? { kickoff_settlement: settlement } : {}),
    ...(kickoffHolds.some(h => h.provider_id === event.id) ? { kickoff_hold: kickoffHolds.find(h => h.provider_id === event.id) } : {}),
  });
}
if (kickoffDisagreements.length) console.log("UNSETTLED", JSON.stringify(kickoffDisagreements, null, 1));
assert.deepEqual(kickoffDisagreements, [], `unsettled kickoff disagreements: ${kickoffDisagreements.length}`);
assert.deepEqual(new Set([...kickoffSettlements.map(r => r.provider_id), ...settlementsSuperseded]), new Set(Object.keys(HOST_KICKOFF_SETTLEMENTS)), "every reviewed host settlement is used or superseded by the NCAA scoreboard");
console.log("host settlements used:", kickoffSettlements.length, "| superseded by the NCAA scoreboard:", JSON.stringify(settlementsSuperseded));
assert.deepEqual(new Set(kickoffHolds.map(r => r.provider_id)), new Set(Object.keys(HELD_KICKOFFS)), "every reviewed hold is used");
console.log("kickoff holds:", JSON.stringify(kickoffHolds.map(r => [r.provider_id, r.school, r.host_kickoff_utc, r.espn_listed_kickoff_utc])));
console.log("kickoff settlements:", JSON.stringify(kickoffSettlements.map(r => [r.provider_id, r.school, r.host_kickoff_utc, r.ncaa_listed_kickoff_utc])));
console.log("week 13 slate:", scheduled.length, "FBS-vs-FBS,", excludedUpcoming.length, "FBS-vs-FCS; NCAA inventory", inventories.get(13).length);
assert.equal(scheduled.length, WEEK13_FIXTURES, `week 13 slate ${scheduled.length}`);
assert.equal(excludedUpcoming.length, WEEK13_FCS_FIXTURES, `week 13 FCS fixtures ${excludedUpcoming.length}`);
assert.equal(scheduled.length + excludedUpcoming.length - ncaaAbsent.length, inventories.get(13).length, "week 13 provider slate equals the NCAA inventory plus the host-settled fixtures the NCAA scoreboard omits");
assert.equal(ncaaUsed.size, ncaaByContest.size, "every NCAA contest is matched to a provider event");

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
//      the gap must be exactly that team's verified Week 12 final, and the
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
  // A lagging row is reconciled only through an FBS-vs-FBS final; a row that
  // lags on an FBS-vs-FCS final stops the build for review.
  assert.ok(!fcsFinalRows.some(g => g.home_slug === slug || g.away_slug === slug), `NCAA standings row for ${slug} lags in a week with an FCS final; review by hand`);
  assert.ok(uncounted.length > 0, `NCAA standings row for ${slug} lags without a Week 12 final`);
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
    primaryRecords.push({ slug, overall: records[slug], conference: conferenceRecords[slug], source_id: page, source_school: espnLocationOf[slug], basis: "official conference standings page; the NCAA standings row had not yet counted the verified Week 12 final" });
    continue;
  }
  const receipt = schoolCorroborations.find(c => lag.uncounted_finals.includes(c.provider_id));
  assert.ok(receipt && lag.uncounted_finals.length === 1, `${slug}: NCAA standings row lags and no conference page or host-school receipt corroborates the record`);
  lag.corroborated_by = receipt.source_id;
  primaryRecords.push({ slug, overall: records[slug], conference: conferenceRecords[slug], source_id: receipt.source_id, source_school: receipt.school, basis: "provider standings; last verified record plus the host-school-corroborated final; the NCAA standings row had not yet counted it" });
}
assert.equal(primaryRecords.length, 138);

// ------------------------------------------------------------ polls
// Week-over-week movement compares each new edition with the edition that
// preceded it: the November 16 AP edition and the November 15 Coaches edition.
const priorCoaches = baseCoaches;
const priorComposite = snapshot.polls.find(p => p.poll === "composite");
assert.equal(priorComposite.release_date, BASE_AP_EDITION_DATE, "base composite pairs the November 8 editions");
const pollFromEspn = (edition, kind) => ({
  poll: kind,
  name: kind === "ap" ? "AP Top 25" : "AFCA Coaches Poll",
  release_date: edition.date.slice(0, 10),
  rankings: edition.ranks.map(r => ({ rank: r.current, team_slug: slugOf(r.team.id), team: null, record: r.recordSummary, points: r.points, first_place_votes: kind === "ap" ? r.firstPlaceVotes ?? null : r.firstPlaceVotes ?? null, previous_rank: r.previous ?? null, tied: !!(r.tie ?? false) })),
  others: (edition.others ?? []).map(r => ({ team_slug: slugOf(r.team.id), team: null, points: r.points })).filter(row => row.team_slug),
  source_urls: kind === "ap"
    ? ["https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings?seasons=2026", "https://www.ncaa.com/rankings/football/fbs/associated-press", "https://sportsdata.usatoday.com/football/ncaaf/ap-poll"]
    : ["https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings?seasons=2026", "https://sportsdata.usatoday.com/football/ncaaf/coaches-poll"],
  publication_precision: "date",
  provider_reported_date: edition.date,
});
// Fill team display names from the base editions where the slug already had one.
const teamNameOf = new Map([...baseAp.rankings, ...priorCoaches.rankings].map(r => [r.team_slug, r.team]));
for (const r of entries) teamNameOf.set(ids.get(r.team.id), r.team.displayName);
const apPoll = pollFromEspn(apNewEdition, "ap");
const coachesPoll = pollFromEspn(coachesEdition, "coaches");
// The November 16 AP edition in the same shape, for the archive and for the
// movement notes. Its source is the provider's Week 12 document; its
// second sources are the archived edition page and USA Today's previous-rank
// column (see above).
const priorAp = { ...pollFromEspn(apPregameEdition, "ap"), source_urls: ["https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings?seasons=2026&weeks=12&types=2", PREGAME_AP_ARCHIVE[1], "https://sportsdata.usatoday.com/football/ncaaf/ap-poll"] };
assert.equal(priorAp.release_date, PREGAME_AP_EDITION_DATE, "pregame AP release date is the edition's own");
for (const poll of [apPoll, coachesPoll, priorAp]) {
  for (const row of poll.rankings) row.team ??= teamNameOf.get(row.team_slug) ?? row.team_slug;
  for (const row of poll.others) row.team ??= teamNameOf.get(row.team_slug) ?? row.team_slug;
}
assert.ok(apPoll.rankings.every(r => r.team && r.team !== r.team_slug), "AP team display names");
assert.ok(coachesPoll.rankings.every(r => r.team && r.team !== r.team_slug), "Coaches team display names");
assert.ok(apPoll.others.every(r => r.team && r.team !== r.team_slug), "AP others display names");
assert.ok(coachesPoll.others.every(r => r.team && r.team !== r.team_slug), "Coaches others display names");
assert.ok(priorAp.rankings.every(r => r.team && r.team !== r.team_slug), "pregame AP team display names");
assert.equal(apPoll.release_date, POLL_EDITION_DATE, "AP release date is the edition's own");
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
assert.match(htmlText(docs.get("coaches")), /November 22|Nov\.?\s*22/, "coaches page edition date");
// The NCAA AP table states its own edition: games through Saturday, November 21.
assert.match(htmlText(docs.get("ap-ncaa")), /Through Games NOV\. 21, 2026/i, "NCAA AP table edition");

// The composite averages two editions of the same date: both are November 22.
assert.equal(apPoll.release_date, coachesPoll.release_date, "composite pairs editions of one date");
const composite = editorialComposite([apPoll, coachesPoll]);
const polls = [apPoll, coachesPoll, composite];

// Poll notes describe AP movement from the November 16 edition to this one.
const priorApRanks = new Map(priorAp.rankings.map(r => [r.team_slug, r.rank]));
const priorCoachesRanks = new Map(priorCoaches.rankings.map(r => [r.team_slug, r.rank]));
const movers = (poll, prior) => poll.rankings.filter(r => prior.has(r.team_slug) && prior.get(r.team_slug) !== r.rank).map(r => ({ team: r.team, team_slug: r.team_slug, from: prior.get(r.team_slug), to: r.rank, move: r.rank - prior.get(r.team_slug) })).sort((a, b) => a.to - b.to).slice(0, 10);
const debuts = poll => poll.rankings.filter(r => !priorApRanks.has(r.team_slug) && !priorCoachesRanks.has(r.team_slug)).map(r => ({ team: r.team, team_slug: r.team_slug, rank: r.rank }));
const pollNotes = {
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
  sources: ["https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings?seasons=2026", "https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings?seasons=2026&weeks=12&types=2", "https://www.ncaa.com/rankings/football/fbs/associated-press", "https://sportsdata.usatoday.com/football/ncaaf/coaches-poll"],
};
assert.equal(pollNotes.as_of, POLL_EDITION_DATE, "poll notes carry the new AP edition's date");
// Each mover's "from" is the previous rank the new edition itself states.
for (const row of pollNotes.movers_ap) assert.equal(row.from, apNewEdition.ranks.find(r => slugOf(r.team.id) === row.team_slug).previous, `AP movement ${row.team_slug}`);

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
const week13Teams = new Set([...scheduled.flatMap(g => [g.home_slug, g.away_slug]), ...excludedUpcoming.flatMap(g => [g.home_slug, g.away_slug]).filter(Boolean)]);
assert.equal(week13Teams.size, scheduled.length * 2 + excludedUpcoming.length, `week 13 participants ${week13Teams.size}`);
const byes = Object.keys(records).filter(slug => !week13Teams.has(slug));
assert.equal(byes.length, 138 - week13Teams.size, `bye count ${byes.length}`);

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
assert.equal(auditFinals.length, 822, `completed finals ${auditFinals.length}`);
const computed = Object.fromEntries([...recordsFromFinals].map(([slug, t]) => [slug, t.join("-")]));
const disagreements = Object.keys(records).filter(slug => computed[slug] !== records[slug]);
assert.deepEqual(disagreements, [], `records do not reproduce from finals: ${disagreements.join(", ")}`);
const fbsFinals = auditFinals.filter(r => r.home_slug && r.away_slug).length;
const fcsFinals = auditFinals.length - fbsFinals;
assert.equal(fbsFinals, 695, `fbs finals ${fbsFinals}`);
assert.equal(fcsFinals, 127, `fcs finals ${fcsFinals}`);

// Audit raw source receipts: the daily + NCAA history pages.
// The audit calendar runs through Saturday, November 21 (the last Week 12
// final): week-13 day boards stay with the weekly evidence and are not part
// of the completed-season audit.
const auditRawSources = [...receipts.filter(r => /^(history-|ncaa-history-)/.test(r.id)), ...receipts.filter(r => /^day-/.test(r.id) && r.id <= "day-20261121")].map(({ id, url, resolvedUrl, status, checkedAt, sha256, bytes }) => ({ id, url, resolvedUrl, status, checkedAt, sha256, bytes }));

// ------------------------------------------------------------ evidence files
const tbdCount = scheduled.filter(g => g.kickoff_status === "official_tbd").length;
const tvPendingCount = scheduled.filter(g => !g.tv).length;
const apStatus = { published: true, release_date: apPoll.release_date, note: `AP Top 25 edition dated ${apPoll.release_date} published by the provider and matched on the NCAA table.` };
const evidence = {
  schema_version: 1,
  scope: `Complete Week 12 finals (November 17-21), full Week 13 slate, current whole-team records, ${POLL_EDITION_LABEL} AFCA Coaches and AP editions, NCAA leaders; full-season review in the companion audit file`,
  cutoff_utc: CUT,
  inventories: { 12: { expected: finals.length + fcsFinalRows.length, finals: finals.length, fcs_finals: fcsFinalRows.length }, 13: { expected: scheduled.length + excludedUpcoming.length, upcoming: scheduled.length, fcs: excludedUpcoming.length } },
  records, conferenceRecords, primaryRecords,
  finals,
  fcs_finals: fcsFinalRows,
  rescheduled,
  schedule: scheduled,
  excluded_upcoming: excludedUpcoming,
  kickoff_settlements: kickoffSettlements,
  kickoff_holds: kickoffHolds,
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
  bye_status: `${byes.length} programs are absent from the complete official Week 13 slate; no individual official bye designation asserted`,
  byes,
  counts: { week12Finals: finals.length, week12FcsFinals: fcsFinalRows.length, week12Rescheduled: rescheduled.length, week13Fixtures: scheduled.length, week13FcsFixtures: excludedUpcoming.length, kickoffTBAorDisputed: tbdCount, tvPending: tvPendingCount, records: 138, seasonCompleted: auditFinals.length, seasonFbsFinals: fbsFinals, seasonFcsFinals: fcsFinals },
  primary_records_note: `All 138 whole-team records match current provider standings and reproduce from the complete verified finals. ${138 - ncaaStandingsLag.length} equal their rows on the official NCAA standings page (${ncaaStandingsStamp ?? "no update stamp"}); ${ncaaStandingsLag.length} rows there had not yet counted a verified Week 12 final (${ncaaStandingsLag.map(r => r.slug).join(", ") || "none"}) and are recorded as lagging observations, each with separate official corroboration (${ncaaStandingsLag.map(r => `${r.slug}: ${r.corroborated_by}`).join(", ") || "none"}). No other conference standings page is asserted in this release. Whole-team totals include FCS opponents.`,
  broadcast_evidence: null,
  poll_editions: { ap: apPoll, coaches: coachesPoll },
  // The November 16 AP edition (pregame ranks of the Week 12 finals), with
  // the per-team agreement of the provider's and the NCAA table's stated
  // previous ranks, and the teams that left the Top 25.
  pregame_ap_edition: { poll: priorAp, previous_rank_agreement: pregameCorroboration, left_top_25: pregameLeft, usa_today_vacated_ranks: vacated, archived_edition: pregameArchive, note: "The official NCAA AP table's PREVIOUS RANKING column repeats ranks and differs from both aggregators on several rows; it is recorded per row as an observation and not used." },
  ap_edition_status: apStatus,
  school_corroborations: schoolCorroborations,
  ncaa_standings_lag: ncaaStandingsLag,
};

const audit = {
  schema_version: 1,
  scope: `Complete season review through the ${new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric" }).format(new Date(CUT))} cutoff: every completed game involving an FBS program, across twelve NCAA weekly inventories and the full provider calendar through Saturday, November 21`,
  data_cutoff_utc: CUT,
  verification_completed_at: new Date().toISOString(),
  counts: { completed: auditFinals.length, fbs_finals: fbsFinals, fcs_finals: fcsFinals, calendar_days: auditRawSources.filter(r => /^(history-|day-)/.test(r.id)).length, ncaa_weeks: 12 },
  raw_sources: auditRawSources,
  finals: auditFinals,
};
assert.equal(audit.counts.calendar_days, 92, `audit calendar days ${audit.counts.calendar_days}`);

// ------------------------------------------------------------ apply
const review = { finals, scheduled, scheduleWeeks: [12, 13], records, conferenceRecords, observedAt: CUT };
const next = reconcileGameDay(snapshot, review);
// The four Week 12 FBS-vs-FCS finals join the excluded rows, each with its own receipt.
assert.ok(fcsFinalRows.every(row => !next.excludedGames.some(prior => prior.provider_id === row.provider_id)), "FCS final already excluded");
next.excludedGames = [...next.excludedGames, ...fcsFinalRows];
assert.equal(next.playedGames.length, fbsFinals, "published finals equal the audit");
assert.equal(next.scheduledGames.length, scheduled.length, "only the Week 13 slate is upcoming");
assert.equal(next.excludedGames.length, fcsFinals, "excluded FCS finals equal the audit");
// The conference tables and the overall records beside them are the records
// reconciled at this cutoff, so their own date says so. (The November 8
// release replaced the values but left the October 28 label in place.)
const CUT_LABEL = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric" }).format(new Date(CUT));
next.retainedBaseline.as_of = CUT.slice(0, 10);
next.retainedBaseline.verified_at = CUT;
next.retainedBaseline.note = `Overall and conference records reconciled ${CUT_LABEL}; source order is not an official conference tiebreak ranking.`;
next.retainedBaseline.overall_records_note = `Current overall and conference records rechecked ${CUT_LABEL} after Week 12.`;

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

// Board weeks: Week 12 becomes an archive, Week 13 arrives as the preview.
const boardWeeks = structuredClone(snapshot.board_weeks);
assert.deepEqual(boardWeeks.map(w => w.week), [6, 7, 8, 9, 10, 11, 12], "base board weeks");
const week12Board = boardWeeks.findIndex(w => w.week === 12);
const WEEK12_MARQUEE = boardWeeks[week12Board].marquee_game_id;
assert.ok(next.playedGames.some(g => g.game_id === WEEK12_MARQUEE && g.week === 12), `week 12 marquee final present ${WEEK12_MARQUEE}`);
const rescheduledNote = rescheduled.filter(r => r.played_date !== r.published_date).map(r => {
  const game = finalsById.get(r.provider_id);
  const label = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" }).format(new Date(r.played_kickoff_utc));
  return ` ${locationOf(game.away_slug)} at ${locationOf(game.home_slug)} was played ${label}.`;
}).join("");
boardWeeks[week12Board] = {
  ...boardWeeks[week12Board],
  retrieved_at: CUT, results_verified_at: CUT, records_verified_at: CUT,
  note: `Week 12 archive: all ${finals.length} FBS-vs-FBS games are verified finals, each matched between ESPN and the NCAA scoreboard.${rescheduledNote}`,
};
// Marquee by the board's own rule (lib/homepage.ts featuredGame): the lowest
// combined AP rank, an unranked side counting 150, earlier date first.
const marqueeScore = g => (apRanks.get(g.away_slug) ?? 150) + (apRanks.get(g.home_slug) ?? 150);
const marqueeRow = [...scheduled].sort((a, b) => marqueeScore(a) - marqueeScore(b) || a.date.localeCompare(b.date))[0];
const WEEK13_MARQUEE = `${marqueeRow.date}-${marqueeRow.away_slug}-at-${marqueeRow.home_slug}`;
console.log("week 13 marquee:", WEEK13_MARQUEE, "AP", apRanks.get(marqueeRow.away_slug) ?? "NR", "at", apRanks.get(marqueeRow.home_slug) ?? "NR");
boardWeeks.push({
  week: 13, start: "2026-11-23", end: "2026-11-29", label: "Nov 24–28", cutover_utc: "2026-11-22T14:00:00Z",
  snapshot_id: "week13-" + createHash("sha256").update(JSON.stringify(scheduled)).digest("hex").slice(0, 12),
  marquee_game_id: WEEK13_MARQUEE,
  retrieved_at: CUT, schedule_verified_at: CUT,
  note: `Week 13 full slate retrieved before any kickoff: ${scheduled.length} FBS-vs-FBS games; ${excludedUpcoming.length} FBS-vs-FCS games stay outside the board. Unannounced kickoffs and unpublished networks stay explicit; the poll editions predate the slate and keep their own dates.`,
});
next.board_weeks = boardWeeks;

// Polls and history. Only an edition that is replaced is archived.
next.polls = polls;
next.pollsStatus = `AP and AFCA Coaches editions published ${POLL_EDITION_LABEL}, ${POLL_EDITION_YEAR}, checked against NCAA/USA Today and ESPN. Prior ${longDate(BASE_AP_EDITION_DATE)} AP and ${longDate(BASE_COACHES_EDITION_DATE)} Coaches editions are archived. Composite remains an editorial average (unranked = 26); build time is not source freshness.`;
// Archive every edition this release replaces, each under its own date: the
// base AP edition joins the November 8 entry beside the Coaches edition the
// November 15 release archived, the base Coaches edition gets a November 15
// entry, and the November 16 AP edition (never a current table on the site)
// gets its own.
const history = structuredClone(snapshot.poll_history);
const nov8 = history.find(entry => entry.release_date === BASE_AP_EDITION_DATE);
assert.ok(nov8 && nov8.polls.length === 1 && nov8.polls[0].poll === "coaches", "base archive holds the November 8 Coaches edition only");
assert.ok(!history.some(entry => [BASE_COACHES_EDITION_DATE, PREGAME_AP_EDITION_DATE].includes(entry.release_date)), "no archive entry yet for the replaced editions");
nov8.polls = [structuredClone(baseAp), ...nov8.polls];
next.poll_history = [...history, { release_date: BASE_COACHES_EDITION_DATE, polls: [structuredClone(baseCoaches)] }, { release_date: PREGAME_AP_EDITION_DATE, polls: [priorAp] }];
next.poll_notes = pollNotes;

// The week's finals story: generated from the verified finals and the pregame
// (November 16) AP edition only. No opinion copy.
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
  id: "week12-verified-finals",
  week: 12,
  headline: rankedLosses.length ? `Week 12 finals: ${rankedLosses.length} of ${rankedSides.length} AP-ranked teams lost` : `Week 12 finals: all ${rankedSides.length} AP-ranked teams won`,
  body: `All ${finals.length} FBS-vs-FBS finals match ESPN and NCAA. ${rankedSides.length} AP teams played and ${rankedLosses.length} lost, using the ${longDate(PREGAME_AP_EDITION_DATE)} pregame poll${lossLines.length ? `: ${lossLines.join("; ")}` : ""}.${playedLater}`,
  game_provider_id: null,
  result_provider_ids: finals.map(g => g.provider_id),
  as_of: CUT.slice(0, 10),
  sources: ["https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings?seasons=2026&weeks=12&types=2", "https://www.ncaa.com/scoreboard/football/fbs/2026/12/all-conf"],
};
assert.ok(!snapshot.storylines.some(s => s.id === finalsStory.id || s.week === 12), "no Week 12 story on the base");
next.storylines = [finalsStory, ...snapshot.storylines];
console.log("story:", finalsStory.headline, "|", finalsStory.body);

// Metrics, dates, log.
next.metrics = evidence.metrics;
next.requested_cutoff = CUT;
next.retrieved_at = CUT;
next.week = 13;
next.week_start = "2026-11-23";
next.reference_date = "2026-11-22";
next.baseline_note = `Week 12 complete: ${finals.length} verified finals. Week 13 is the full upcoming slate. Weeks 6-11 are archived boards; source facts, historical editorial modules and unavailable projections keep separate dates.`;
next.results_verified_at = CUT;
next.schedule_verified_at = CUT;
next.records_verified_at = CUT;
next.refresh_log = [...snapshot.refresh_log, { applied_at: new Date().toISOString(), evidence_checked_at: CUT, script: SCRIPT_ID, evidence: "data/cfb-2026/refresh/evidence/2026-11-22-week12-refresh.json", scope: `Complete Week 12 finals (${finals.length}) and ${fcsFinalRows.length} FBS-vs-FCS finals outside the board, full Week 13 slate (${scheduled.length}), 138 primary-source whole-team records, ${POLL_EDITION_LABEL} AP and AFCA Coaches editions, NCAA leaders` }];
next.full_season_review = { checked_at: audit.verification_completed_at, through_games: CUT, completed: auditFinals.length, fbs_finals: fbsFinals, fcs_finals: fcsFinals, evidence: "data/cfb-2026/refresh/evidence/2026-11-22-full-season-audit.json", note: "All twelve NCAA weekly inventories and the full provider calendar reconciled through November 21; whole-team totals reproduce all 138 independently verified official records. Week 12 completes the board; source cutoff is unchanged by later verification." };
next.team_records_review = {
  as_of: CUT,
  verified: 138,
  carried_from_2026_10_10: [],
  withheld: [],
  rule: "All 138 current overall and conference records match fresh provider standings and reconcile from the prior reviewed snapshot plus the corroborated finals.",
  note: `${138 - ncaaStandingsLag.length} records equal their rows on the official NCAA standings page; ${ncaaStandingsLag.length} rows there had not yet counted a verified Week 12 final at the cutoff and those records rest on provider standings, the verified final and a conference or host-school page. Whole-team totals include FCS opponents; never derived from the filtered board.`,
};
next.holds = [
  "Ratings retain their September 27 snapshot and SOS its independent source date; current licensed SP+/FPI/FEI updates are unavailable.",
  `National leader cards use NCAA tables at the ${CUT_LABEL} retrieval; detailed team/player season tables remain the September 5 sample. A complete current statistical warehouse is unavailable.`,
  "Roster/depth and portal coverage keeps its dated inventories; absence from them is not an assertion of no change.",
  "Injury research retains its October 22 as-of; no Week 12/13 official availability designation is inferred from unreviewed reports.",
  "SP+ and FPI remain unavailable pending permitted, verified sources.",
];

// ranked matchups for the new preview week (current AP edition)
next.ranked_matchups = scheduled.filter(g => (apRanks.get(g.home_slug) ?? 99) <= 25 && (apRanks.get(g.away_slug) ?? 99) <= 25).slice(0, 6).map(g => ({ game_id: `${g.date}-${g.away_slug}-at-${g.home_slug}`, matchup: `${g.home_slug} vs ${g.away_slug}`, polls: ["ap"] }));

// ---------------------------------------------------------------- write
writeFileSync(new URL("../data/cfb-2026/refresh/evidence/2026-11-22-week12-refresh.json", import.meta.url), JSON.stringify(evidence));
writeFileSync(new URL("../data/cfb-2026/refresh/evidence/2026-11-22-full-season-audit.json", import.meta.url), JSON.stringify(audit));
writeFileSync(new URL("../data/cfb-2026/refresh/verified-refresh.json", import.meta.url), JSON.stringify(next));

const oldest = receipts.reduce((a, r) => (a.checkedAt < r.checkedAt ? a : r));
console.log(JSON.stringify({
  cutoff: CUT,
  oldestReceipt: oldest.checkedAt,
  mergeBy: new Date(Date.parse(oldest.checkedAt) + 105 * 60_000).toISOString(),
  gateExpiry: new Date(Date.parse(oldest.checkedAt) + 120 * 60_000).toISOString(),
  sources: receipts.length,
  finals: finals.length,
  fcsFinals: fcsFinalRows.length,
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
  marquee: WEEK13_MARQUEE,
  kickoffSettlements: kickoffSettlements.length,
  kickoffHolds: kickoffHolds.length,
}, null, 1));
