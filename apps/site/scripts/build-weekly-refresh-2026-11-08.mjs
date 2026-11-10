// Weekly refresh builder: Week 9 completion, Week 10 finals, Week 11 slate.
//
// Fetches every required source once with a receipt, reconciles the reviewed
// snapshot from those receipts, and writes:
//   data/cfb-2026/refresh/evidence/2026-11-08-week10-refresh.json
//   data/cfb-2026/refresh/evidence/2026-11-08-full-season-audit.json
//   data/cfb-2026/refresh/verified-refresh.json
//
// Usage: node scripts/build-weekly-refresh-2026-11-08.mjs <scratch-dir>
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
const POLL_EDITION_DATE = "2026-11-08";
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
const snapshot = read("data/cfb-2026/refresh/verified-refresh.json");
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
  const response = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 CFB-Apex-verification/1.0", accept: "text/html,application/json;q=0.9,*/*;q=0.8" },
    signal: AbortSignal.timeout(30_000),
  });
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
// Season calendar days through the cutoff (Aug 22 .. Nov 15). Weeks 1-10
// playing days are the audit trail; week 11 days carry the upcoming slate.
for (let d = new Date("2026-08-22T00:00:00Z"); d <= new Date("2026-11-15T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
  const ymd = d.toISOString().slice(0, 10).replaceAll("-", "");
  const prefix = ymd >= "20261027" && ymd <= "20261115" ? "day" : "history";
  daily.push([`${prefix}-${ymd}`, espnDay(ymd)[2]]);
}
const weekly = [
  ["espn-standings", "https://site.web.api.espn.com/apis/v2/sports/football/college-football/standings?season=2026&level=3&group=80"],
  ["rankings", "https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings?seasons=2026"],
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
  ["school-texastech", "https://texastech.com/sports/football/schedule"],
  ["school-fresnostate", "https://gobulldogs.com/sports/football/schedule"],
  ["school-oregonstate", "https://osubeavers.com/sports/football/schedule"],
  ["school-unlv", "https://unlvrebels.com/sports/football/schedule"],
  ["school-utep", "https://utepminers.com/sports/football/schedule"],
];
const ncaaWeeks = [];
for (let week = 1; week <= 11; week++) ncaaWeeks.push([week < 10 ? `ncaa-history-${week}` : `ncaa${week}`, `https://www.ncaa.com/scoreboard/football/fbs/2026/${String(week).padStart(2, "0")}/all-conf`]);

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
const WEEK_DAYS = { 8: ["20261020", "20261021", "20261022", "20261023", "20261024"], 9: ["20261027", "20261028", "20261029", "20261030", "20261031"], 10: ["20261103", "20261104", "20261105", "20261106", "20261107"], 11: ["20261110", "20261111", "20261112", "20261113", "20261114"] };
const weekEvents = week => WEEK_DAYS[week].flatMap(d => eventsByDay.get(d) ?? []);

// Poll editions
const rankingsDoc = JSON.parse(docs.get("rankings"));
const apEdition = rankingsDoc.rankings.find(p => p.id === "1");
const coachesEdition = rankingsDoc.rankings.find(p => p.id === "2");
assert.equal(apEdition.date.slice(0, 10), POLL_EDITION_DATE, "AP edition");
assert.equal(coachesEdition.date.slice(0, 10), POLL_EDITION_DATE, "Coaches edition");
const apRanks = new Map(apEdition.ranks.map(r => [slugOf(r.team.id), r.current]));

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
    game_id: `${etDate(event.date)}-${awaySlug}-at-${homeSlug}`,
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
      pregame_ap_ranks: { [homeSlug]: apRanks.get(homeSlug) ?? null, [awaySlug]: apRanks.get(awaySlug) ?? null },
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
  if (prev?.kickoff_utc && prev.kickoff_utc !== event.date) game.meta.originally_scheduled_kickoff_utc = prev.kickoff_utc;
  return game;
}

// Late Saturday finals the NCAA scoreboard had not flipped to F at the cutoff.
// Each is corroborated by the host school's official schedule page; the gate
// re-asserts these literal observations.
const SCHOOL_CORROB = {
  "401856856": { id: "school-texastech", kind: "school", school: "Texas Tech", expect: /Nov 07[\s\S]{0,120}West Virginia[\s\S]{0,120}48\s+53/ },
  "401860913": { id: "school-fresnostate", kind: "school", school: "Fresno State", expect: /at Utah State[\s\S]{0,200}Fresno\s+L,\s*10-17/ },
  "401860912": { id: "school-oregonstate", kind: "school", school: "Oregon State", expect: /Nov 07[\s\S]{0,160}Texas State[\s\S]{0,160}42\s+21/ },
  "401864535": { id: "school-unlv", kind: "school", school: "UNLV", expect: /versus Wyoming on November 7, 2026\s*,\s*Loss\s*,\s*35,\s*to,\s*41/ },
  "401864532": { id: "school-utep", kind: "school", school: "UTEP", expect: /L,\s*14-17[\s\S]{0,300}For Hawai'i - November 7, 2026/ },
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
for (const week of [9, 10]) {
  for (const event of weekEvents(week)) {
    const competition = event.competitions[0];
    if (snapshot.playedGames.some(p => p.provider_id === event.id)) continue; // already-published finals stay untouched
    if (!competition.status.type.completed) {
      if (week === 10) throw new Error(`Week 10 event still uncompleted at cutoff: ${event.id}`);
      continue;
    }
    const home = competition.competitors.find(t => t.homeAway === "home");
    const away = competition.competitors.find(t => t.homeAway === "away");
    if (!slugOf(home.team.id) || !slugOf(away.team.id)) continue; // FCS opponent
    finals.push(playedRow(event));
  }
}
// The two October 28 finals were published as scheduled rows on main; the
// remaining week 9 finals plus every Week 10 final arrive in this release.
const finalsById = new Map(finals.map(g => [g.provider_id, g]));
assert.equal(finals.length, 54 + 62, `finals count ${finals.length}`);
assert.ok(!finalsById.has("401871071") && !finalsById.has("401871072"), "already-published October 27 finals stay untouched");

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
const publishedSnapshot = JSON.parse(execSync("git show origin/main:apps/site/data/cfb-2026/refresh/verified-refresh.json", { encoding: "utf8", maxBuffer: 1024 * 1024 * 512, cwd: new URL("../../..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1") }));
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

// ------------------------------------------------------------ week 11 slate
const tvText = htmlText(docs.get("tv-ncaa"));
function tvArticleRow(awayName, homeName) {
  const norm = s => s.toLowerCase().replace(/\(.*\)/g, "").replace(/[^a-z0-9]/g, "");
  const a = norm(awayName), h = norm(homeName);
  const lines = tvText.split(/(?=Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday,)/);
  for (const block of lines) {
    if (!/November 1[0-5]|Nov\. 1[0-5]/.test(block)) continue;
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
for (const event of weekEvents(11)) {
  const competition = event.competitions[0];
  const home = competition.competitors.find(t => t.homeAway === "home");
  const away = competition.competitors.find(t => t.homeAway === "away");
  const homeSlug = slugOf(home.team.id), awaySlug = slugOf(away.team.id);
  assert.ok(homeSlug && awaySlug, `non-FBS event in week 11 slate ${event.id}`);
  const contestId = eventMatch.get(event.id);
  assert.ok(contestId, `no NCAA contest for week 11 event ${event.id}`);
  const ncaaRow = ncaaByContest.get(contestId);
  const timeValid = competition.timeValid === true;
  const hasNcaaTime = ncaaRow.hasStartTime;
  const article = tvArticleRow(away.team.displayName, home.team.displayName);
  const espnTv = broadcastOf(competition);
  let kickoff_utc, kickoff_status, timing_sources, timing_note;
  if (timeValid) {
    kickoff_utc = event.date;
    kickoff_status = "confirmed";
    timing_sources = [event.sourceUrl ?? "", `https://www.ncaa.com/game/${contestId}`].filter(Boolean);
    timing_note = "Announced kickoff: provider listing";
    if (hasNcaaTime) assert.equal(ncaaRow.startTimeEpoch * 1000, Date.parse(event.date), `NCAA/ESPN kickoff disagree (schedule) ${event.id}`);
    if (article?.time) {
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
    timing_sources = ["https://www.ncaa.com/scoreboard/football/fbs/2026/11/all-conf", `https://www.ncaa.com/game/${contestId}`];
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
    source_url: event.sourceUrl ?? `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=2026${String(event.week.number).padStart(2, "0")}&groups=80&limit=200`,
    date: etDate(event.date),
    kickoff_utc, kickoff_status, week: 11,
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
  });
}
assert.equal(scheduled.length, 67, `week 11 slate ${scheduled.length}`);

// ------------------------------------------------------------ records
const standingsDoc = JSON.parse(docs.get("espn-standings"));
const entries = standingsDoc.children.flatMap(c => c.standings?.entries ?? c.children?.flatMap(x => x.standings?.entries ?? []) ?? []);
const records = {}, conferenceRecords = {};
for (const r of entries) { const slug = ids.get(r.team.id); assert.ok(slug); records[slug] = r.stats.find(s => s.type === "total").summary; conferenceRecords[slug] = r.stats.find(s => s.type === "vsconf").summary; }
assert.equal(Object.keys(records).length, 138);

// Primary record corroboration. Two independent official layers:
//   1. the official NCAA standings page (server-rendered tables per
//      conference), resolved per team by overall+conference record inside the
//      team's own conference table, with a name similarity or explicit alias
//      tiebreak; every one of the 138 teams is corroborated there;
//   2. the nine conference standings pages for the conference-grouped slugs,
//      matched by school name, as the prior releases did.
const confByPage = { "standing-bigten": "bigten", "standing-big12": "big12", "standing-cusa": "cusa", "standing-american": "american", "standing-mac": "mac", "standing-mw": "mw", "standing-pac12": "pac12", "standing-acc3": "acc", "official-sunbelt": "sunbelt" };
const confMap = priorEvidence.conferences.reduce((m, c) => { for (const r of c.rows) m[r.slug] = c.id; return m; }, {});
const schoolNameOf = priorEvidence.conferences.reduce((m, c) => { for (const r of c.rows) m[r.slug] = r.source_school ?? null; return m; }, {});

// NCAA standings page: resolve each slug to its exact row.
const ncaaTables = htmlTables(docs.get("ncaa-standings"));
const ncaaRows = ncaaTables.map(t => t.slice(1));
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const dice = (a, b) => {
  const A = norm(a), B = norm(b); if (!A || !B) return 0;
  const grams = s => { const out = new Map(); for (let i = 0; i < s.length - 1; i++) out.set(s.slice(i, i + 2), (out.get(s.slice(i, i + 2)) ?? 0) + 1); return out; };
  const ga = grams(A), gb = grams(B); let common = 0;
  for (const [k, v] of ga) common += Math.min(v, gb.get(k) ?? 0);
  return (2 * common) / (Math.max(A.length - 1, 1) + Math.max(B.length - 1, 1));
};
const ALIAS = { "southern california": "usc", "niu": "northern-illinois", "fla. atlantic": "florida-atlantic", "south fla.": "south-florida", "middle tenn.": "middle-tennessee", "western ky.": "western-kentucky", "missouri st.": "missouri-state", "kennesaw st.": "kennesaw-state", "sam houston": "sam-houston", "new mexico st.": "new-mexico-state", "jacksonville st.": "jacksonville-state", "ohio st.": "ohio-state", "penn st.": "penn-state", "michigan st.": "michigan-state", "iowa st.": "iowa-state", "kansas st.": "kansas-state", "oklahoma st.": "oklahoma-state", "arizona st.": "arizona-state", "san diego st.": "san-diego-state", "colorado st.": "colorado-state", "fresno st.": "fresno-state", "utah st.": "utah-state", "oregon st.": "oregon-state", "texas st.": "texas-state", "boise st.": "boise-state", "washington st.": "washington-state", "app state": "appalachian-state", "ga. southern": "georgia-southern", "georgia st.": "georgia-state", "arkansas st.": "arkansas-state", "southern miss.": "southern-miss", "miami (fl)": "miami-fl", "miami (oh)": "miami-oh", "florida st.": "florida-state", "nc state": "nc-state", "massachusetts": "umass", "army west point": "army", "san jose st.": "san-jose-state", "north dakota st.": "north-dakota-state", "eastern mich.": "eastern-michigan", "central mich.": "central-michigan", "western mich.": "western-michigan", "fiu": "fiu", "utsa": "utsa", "uab": "uab", "byu": "byu", "tcu": "tcu", "ucf": "ucf", "smu": "smu", "lsu": "lsu", "ulm": "ulm", "uconn": "uconn", "ucla": "ucla", "utep": "utep", "unlv": "unlv", "usc": "usc" };
const espnNameOf = {}; for (const r of entries) espnNameOf[ids.get(r.team.id)] = r.team.displayName;
const aliasHits = new Map(Object.entries(ALIAS).map(([name, slug]) => [slug, name]));
const recordCell = s => { const m = /^(\d+)-(\d+)$/.exec(s); return m ? [Number(m[1]), Number(m[2])] : null; };
const ncaaRowFor = {};
for (const slug of Object.keys(records)) {
  const [W, L] = recordCell(records[slug]); const [CW, CL] = recordCell(conferenceRecords[slug]);
  const pool = ncaaRows.flatMap(rows => rows).filter(row => row[1] === String(CW) && row[2] === String(CL) && row[3] === String(W) && row[4] === String(L));
  const displayName = espnNameOf[slug];
  const scored = pool.map(row => ({ row, score: dice(row[0], displayName) })).sort((a, b) => b.score - a.score);
  const alias = pool.find(row => ALIAS[row[0].toLowerCase()] === slug);
  const pick = alias ? { row: alias, score: dice(alias[0], displayName) } : scored[0];
  assert.ok(pick && (alias || scored[0].score >= 0.2 || (scored[0].score === 0 && pool.length === 1)), `NCAA standings row unresolved for ${slug} (${displayName})`);
  const exists = ncaaRows.some(rows => rows.includes(pick.row));
  assert.ok(exists, `picked row missing ${slug}`);
  ncaaRowFor[slug] = { name: pick.row[0], cells: pick.row.slice(1, 5) };
}
assert.equal(Object.keys(ncaaRowFor).length, 138);
const ambiguousNcaa = Object.entries(ncaaRowFor).filter(([slug, r]) => dice(r.name, espnNameOf[slug]) < 0.3 && !aliasHits.has(slug)).map(([slug, r]) => `${slug}=${r.name}`);
if (ambiguousNcaa.length) console.log("NCAA standings rows resolved by record+alias:", ambiguousNcaa.join(", "));

const primaryRecords = [];
const covered = new Set();
for (const [page, confId] of Object.entries(confByPage)) {
  const tables = htmlTables(docs.get(page));
  const flat = tables.flat().map(row => row.join(" | "));
  for (const slug of Object.keys(records).filter(s => confMap[s] === confId)) {
    const name = espnNameOf[slug];
    const hit = flat.find(row => row.toLowerCase().includes(name.split(" ").slice(-1)[0].toLowerCase()) && row.includes(records[slug]) && row.includes(conferenceRecords[slug]));
    assert.ok(hit, `${slug} not corroborated on ${page}`);
    primaryRecords.push({ slug, overall: records[slug], conference: conferenceRecords[slug], source_id: page, source_school: schoolNameOf[slug] ?? name });
    covered.add(slug);
  }
}
for (const slug of Object.keys(records).filter(s => !covered.has(s))) {
  primaryRecords.push({ slug, overall: records[slug], conference: conferenceRecords[slug], source_id: "ncaa-standings", source_school: ncaaRowFor[slug].name });
}
assert.equal(primaryRecords.length, 138);

// Every 138 records must equal its NCAA standings row (uniform corroboration).
for (const [slug, row] of Object.entries(ncaaRowFor)) {
  const [W, L] = recordCell(records[slug]); const [CW, CL] = recordCell(conferenceRecords[slug]);
  assert.deepEqual(row.cells, [String(CW), String(CL), String(W), String(L)], `NCAA standings row mismatch ${slug}`);
}

// ------------------------------------------------------------ polls
const priorPolls = snapshot.polls.filter(p => p.poll !== "composite");
const priorAp = priorPolls.find(p => p.poll === "ap");
const priorCoaches = priorPolls.find(p => p.poll === "coaches");
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
const apPoll = pollFromEspn(apEdition, "ap");
const coachesPoll = pollFromEspn(coachesEdition, "coaches");
for (const poll of [apPoll, coachesPoll]) {
  for (const row of poll.rankings) row.team ??= teamNameOf.get(row.team_slug) ?? row.team_slug;
  for (const row of poll.others) row.team ??= teamNameOf.get(row.team_slug) ?? row.team_slug;
}
assert.ok(apPoll.rankings.every(r => r.team && r.team !== r.team_slug), "AP team display names");
assert.ok(coachesPoll.rankings.every(r => r.team && r.team !== r.team_slug), "Coaches team display names");
assert.ok(apPoll.others.every(r => r.team && r.team !== r.team_slug), "AP others display names");
assert.ok(coachesPoll.others.every(r => r.team && r.team !== r.team_slug), "Coaches others display names");

// Official NCAA AP table corroboration
const apTables = htmlTables(docs.get("ap-ncaa")).find(t => t.some(row => /SCHOOL/i.test(row.join(" "))));
assert.ok(apTables && apTables.length - 1 === apPoll.rankings.length, "NCAA AP table rows");
apPoll.rankings.forEach((row, i) => {
  const official = apTables[i + 1];
  assert.equal(Number(official[0].replace(/\D/g, "")), row.rank, `AP rank ${row.rank}`);
  assert.equal(Number(official[2].replaceAll(",", "")), row.points, `AP points ${row.team_slug}`);
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
assert.match(htmlText(docs.get("coaches")), /November 0?8|Nov\.?\s*0?8/, "coaches page edition date");

const composite = editorialComposite([apPoll, coachesPoll]);
const polls = [apPoll, coachesPoll, composite];

// Poll notes: movers, debuts, dropouts vs the October 25 editions
const priorApRanks = new Map(priorAp.rankings.map(r => [r.team_slug, r.rank]));
const priorCoachesRanks = new Map(priorCoaches.rankings.map(r => [r.team_slug, r.rank]));
const movers = (poll, prior) => poll.rankings.filter(r => prior.has(r.team_slug) && prior.get(r.team_slug) !== r.rank).map(r => ({ team: r.team, team_slug: r.team_slug, from: prior.get(r.team_slug), to: r.rank, move: r.rank - prior.get(r.team_slug) })).sort((a, b) => a.to - b.to).slice(0, 10);
const debuts = poll => poll.rankings.filter(r => !priorApRanks.has(r.team_slug) && !priorCoachesRanks.has(r.team_slug)).map(r => ({ team: r.team, team_slug: r.team_slug, rank: r.rank }));
const dropped = (poll, prior, name) => [...prior.entries()].filter(([slug]) => !poll.rankings.some(r => r.team_slug === slug)).map(([slug, rank]) => ({ team: prior.find(r => r.team_slug === slug)?.team ?? slug, team_slug: slug, [name === "ap" ? "others_points" : "others_points"]: null }));
const pollNotes = {
  as_of: POLL_EDITION_DATE,
  movers_ap: movers(apPoll, priorApRanks),
  debuts_ap: debuts(apPoll),
  dropped_out: { ap: [...priorApRanks.entries()].filter(([slug]) => !apPoll.rankings.some(r => r.team_slug === slug)).map(([slug, rank]) => ({ team: priorAp.rankings.find(r => r.team_slug === slug)?.team ?? slug, team_slug: slug, others_points: priorAp.rankings.find(r => r.team_slug === slug)?.others_points ?? null })), coaches: [...priorCoachesRanks.entries()].filter(([slug]) => !coachesPoll.rankings.some(r => r.team_slug === slug)).map(([slug]) => ({ team: priorCoaches.rankings.find(r => r.team_slug === slug)?.team ?? slug, team_slug: slug, others_points: priorCoaches.rankings.find(r => r.team_slug === slug)?.others_points ?? null })) },
  poll_gaps: {
    // UI contract: ap_only rows carry {ap, coaches_points}; coaches_only rows
    // carry {coaches, ap_points}; an RV side stays null rather than invented.
    ap_only: apPoll.rankings.filter(r => !coachesPoll.rankings.some(c => c.team_slug === r.team_slug)).map(r => ({ team: r.team, team_slug: r.team_slug, ap: r.rank, coaches_points: null })),
    coaches_only: coachesPoll.rankings.filter(r => !apPoll.rankings.some(a => a.team_slug === r.team_slug)).map(r => ({ team: r.team, team_slug: r.team_slug, coaches: r.rank, ap_points: null })),
    biggest_splits: apPoll.rankings.flatMap(r => { const c = coachesPoll.rankings.find(x => x.team_slug === r.team_slug); return c && Math.abs(c.rank - r.rank) >= 3 ? [{ team: r.team, team_slug: r.team_slug, ap: r.rank, coaches: c.rank }] : []; }).sort((a, b) => Math.abs(b.coaches - b.ap) - Math.abs(a.coaches - a.ap)).slice(0, 5),
  },
  sources: ["https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings?seasons=2026", "https://www.ncaa.com/rankings/football/fbs/associated-press", "https://sportsdata.usatoday.com/football/ncaaf/coaches-poll"],
};

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
const week11Teams = new Set(scheduled.flatMap(g => [g.home_slug, g.away_slug]));
assert.equal(week11Teams.size, 134, `week 11 participants ${week11Teams.size}`);
const byes = Object.keys(records).filter(slug => !week11Teams.has(slug));
assert.ok(byes.length > 0 && byes.length < 20, `bye count ${byes.length}`);

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
  if (ncaaRow.gameState !== "F") assert.ok(SCHOOL_CORROB[event.id], `non-final NCAA row in audit ${event.id}`);
  auditFinals.push(row);
  // Whole-team records include FCS opponents; each FBS side counts its own result.
  for (const [slug, score, other] of [[homeSlug, row.home_score, row.away_score], [awaySlug, row.away_score, row.home_score]]) if (slug) recordsFromFinals.get(slug)[score > other ? 0 : 1]++;
}
// Remove the placeholder assert; enforce real invariants.
assert.ok(auditFinals.every(r => r.home_score !== r.away_score), "no ties in completed games");
assert.equal(auditFinals.length, 685, `completed finals ${auditFinals.length}`);
const computed = Object.fromEntries([...recordsFromFinals].map(([slug, t]) => [slug, t.join("-")]));
const disagreements = Object.keys(records).filter(slug => computed[slug] !== records[slug]);
assert.deepEqual(disagreements, [], `records do not reproduce from finals: ${disagreements.join(", ")}`);
const fbsFinals = auditFinals.filter(r => r.home_slug && r.away_slug).length;
const fcsFinals = auditFinals.length - fbsFinals;
assert.equal(fbsFinals, 562, `fbs finals ${fbsFinals}`);
assert.equal(fcsFinals, 123, `fcs finals ${fcsFinals}`);

// Audit raw source receipts: the daily + NCAA history pages.
// The audit calendar runs through the cutoff: week-11 day boards stay with
// the weekly evidence and are not part of the completed-season audit.
const auditRawSources = [...receipts.filter(r => /^(history-|ncaa-history-)/.test(r.id)), ...receipts.filter(r => /^day-/.test(r.id) && r.id <= "day-20261108")].map(({ id, url, resolvedUrl, status, checkedAt, sha256, bytes }) => ({ id, url, resolvedUrl, status, checkedAt, sha256, bytes }));

// ------------------------------------------------------------ evidence files
const evidence = {
  schema_version: 1,
  scope: `Week 9 completion (October 28-31 finals), complete Week 10 finals, full Week 11 slate, current whole-team records, ${POLL_EDITION_LABEL} poll editions, NCAA leaders; full-season review in the companion audit file`,
  cutoff_utc: CUT,
  inventories: { 9: { expected: 56, finals: 56 }, 10: { expected: 63, finals: 63, fbs: 62, fcs: 1 }, 11: { expected: 67, upcoming: 67 } },
  records, conferenceRecords, primaryRecords,
  finals,
  schedule: scheduled,
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
  bye_status: `${byes.length} programs are absent from the complete official Week 11 slate; no individual official bye designation asserted`,
  byes,
  counts: { week9Finals: 56, week9NewFinals: 54, week10Finals: 62, week10FcsFinals: 1, week11Fixtures: 67, kickoffTBAorDisputed: scheduled.filter(g => g.kickoff_status === "official_tbd").length, tvPending: scheduled.filter(g => !g.tv).length, records: 138, seasonCompleted: 685, seasonFbsFinals: 562, seasonFcsFinals: 123 },
  primary_records_note: "All 138 whole-team records match current provider standings; nine conference groups corroborated from their official standings pages, SEC and Notre Dame from the official NCAA TV article results section (8-1 tally asserted). Whole-team totals include FCS opponents.",
  broadcast_evidence: null,
  poll_editions: { ap: apPoll, coaches: coachesPoll },
  nd_record_note: "Notre Dame 8-1 is corroborated by its exact row on the official NCAA standings page and by the verified November 7 final against Miami.",
  school_corroborations: Object.entries(SCHOOL_CORROB).map(([provider_id, rule]) => ({ provider_id, kind: "school", source_id: rule.id, school: rule.school })),
};

const audit = {
  schema_version: 1,
  scope: "Complete season review through the November 8 cutoff: every completed game involving an FBS program, across ten NCAA weekly inventories and the full provider calendar",
  data_cutoff_utc: CUT,
  verification_completed_at: new Date().toISOString(),
  counts: { completed: 685, fbs_finals: 562, fcs_finals: 123, calendar_days: 79, ncaa_weeks: 10 },
  raw_sources: auditRawSources,
  finals: auditFinals,
};

// ------------------------------------------------------------ apply
const review = { finals, scheduled, scheduleWeeks: [9, 11], records, conferenceRecords, observedAt: CUT };
const next = reconcileGameDay(snapshot, review);

// FCS week 10 final joins the excluded rows with its own receipt.
const fcsEvent = weekEvents(10).map(e => e).find(e => {
  const c = e.competitions[0];
  const h = c.competitors.find(t => t.homeAway === "home"), a = c.competitors.find(t => t.homeAway === "away");
  return c.status.type.completed && (!slugOf(h.team.id) || !slugOf(a.team.id));
});
assert.ok(fcsEvent, "week 10 FCS final present");
const fcsCompetition = fcsEvent.competitions[0];
const fcsHome = fcsCompetition.competitors.find(t => t.homeAway === "home");
const fcsAway = fcsCompetition.competitors.find(t => t.homeAway === "away");
const fcsContest = eventMatch.get(fcsEvent.id);
next.excludedGames = [...next.excludedGames, {
  provider_id: fcsEvent.id,
  source_url: `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=20261107&groups=80&limit=200`,
  date: etDate(fcsEvent.date),
  kickoff_utc: fcsEvent.date,
  week: 10,
  home_slug: slugOf(fcsHome.team.id),
  away_slug: slugOf(fcsAway.team.id),
  site: fcsCompetition.venue?.fullName ?? null,
  tv: broadcastOf(fcsCompetition),
  neutral_site: fcsCompetition.neutralSite === true,
  verified_at: CUT,
  name: `${fcsAway.team.displayName} at ${fcsHome.team.displayName}`,
  reason: "FBS–FCS: one opponent is outside the verified current 138-team membership. Retained in full-season evidence and whole-team records; native board displays FBS vs FBS.",
  espn_conference_ids: { home: fcsHome.team.conference?.id ?? null, away: fcsAway.team.conference?.id ?? null },
  home_score: Number(fcsHome.score), away_score: Number(fcsAway.score),
  state: fcsCompetition.status.type,
  ncaa_url: `https://www.ncaa.com/game/${fcsContest}`,
}];

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

// Board weeks 10 and 11.
const boardWeeks = [...snapshot.board_weeks];
boardWeeks.push({
  week: 10, start: "2026-11-02", end: "2026-11-08", label: "Nov 3–7", cutover_utc: "2026-11-01T13:00:00Z",
  snapshot_id: "week10-" + createHash("sha256").update(JSON.stringify(finals.filter(g => g.week === 10))).digest("hex").slice(0, 12),
  marquee_game_id: "2026-11-07-miami-fl-at-notre-dame",
  retrieved_at: CUT, schedule_verified_at: CUT, results_verified_at: CUT, records_verified_at: CUT,
  note: "Week 10 archive: all 62 FBS-vs-FBS games are verified finals; the Wake Forest FCS game stays in the full-season evidence outside the interface. Five late Saturday finals carry official school corroboration while the NCAA scoreboard remained in-progress.",
});
boardWeeks.push({
  week: 11, start: "2026-11-09", end: "2026-11-15", label: "Nov 10–14", cutover_utc: "2026-11-08T13:00:00Z",
  snapshot_id: "week11-" + createHash("sha256").update(JSON.stringify(scheduled)).digest("hex").slice(0, 12),
  marquee_game_id: "2026-11-14-missouri-at-georgia",
  retrieved_at: CUT, schedule_verified_at: CUT,
  note: `Week 11 full slate retrieved before any kickoff. Unannounced kickoffs and unpublished networks stay explicit; the ${POLL_EDITION_LABEL} poll editions predate the slate and keep their own dates.`,
});
next.board_weeks = boardWeeks;

// Polls and history.
next.polls = polls;
next.pollsStatus = `AP and AFCA Coaches editions published ${POLL_EDITION_LABEL}, ${POLL_EDITION_YEAR}, checked against NCAA/USA Today and ESPN. Prior October 25 editions are archived. Composite remains an editorial average (unranked = 26); build time is not source freshness.`;
next.poll_history = [...snapshot.poll_history, { release_date: priorAp.release_date, polls: priorPolls }];
next.poll_notes = pollNotes;

// Metrics, dates, log.
next.metrics = evidence.metrics;
next.requested_cutoff = CUT;
next.retrieved_at = CUT;
next.week = 11;
next.week_start = "2026-11-09";
next.reference_date = "2026-11-08";
next.baseline_note = "Week 10 complete: 62 verified finals plus one FCS result outside the interface. Week 11 is the full upcoming slate. Weeks 6-9 are archived boards; source facts, historical editorial modules and unavailable projections keep separate dates.";
next.results_verified_at = CUT;
next.schedule_verified_at = CUT;
next.records_verified_at = CUT;
next.refresh_log = [...snapshot.refresh_log, { applied_at: new Date().toISOString(), evidence_checked_at: CUT, script: "weekly-refresh-2026-11-08", evidence: "data/cfb-2026/refresh/evidence/2026-11-08-week10-refresh.json", scope: `Week 9 completion (54 new finals), complete Week 10 finals (62), full Week 11 slate (67), 138 primary-source whole-team records, ${POLL_EDITION_LABEL} poll editions, NCAA leaders` }];
next.full_season_review = { checked_at: audit.verification_completed_at, through_games: CUT, completed: 685, fbs_finals: 562, fcs_finals: 123, evidence: "data/cfb-2026/refresh/evidence/2026-11-08-full-season-audit.json", note: "All ten NCAA weekly inventories and the full provider calendar reconciled through November 8; whole-team totals reproduce all 138 independently verified official records. Week 9's October 28-31 finals and Week 10 complete the board; source cutoff is unchanged by later verification." };
next.team_records_review = {
  as_of: CUT,
  verified: 138,
  carried_from_2026_10_10: [],
  withheld: [],
  rule: "All 138 current overall and conference records match fresh provider standings and reconcile from the prior reviewed snapshot plus the corroborated finals.",
  note: "Nine conference groups corroborated from their official standings pages; SEC and Notre Dame (8-1) corroborated from the official NCAA TV article results section with the exact result lines asserted. Whole-team totals include FCS opponents; never derived from the filtered board.",
};
next.holds = [
  "Ratings retain their September 27 snapshot and SOS its independent source date; current licensed SP+/FPI/FEI updates are unavailable.",
  "National leader cards use NCAA tables at the November 8 retrieval; detailed team/player season tables remain the September 5 sample. A complete current statistical warehouse is unavailable.",
  "Roster/depth and portal coverage keeps its dated inventories; absence from them is not an assertion of no change.",
  "Injury research retains its October 22 as-of; no Week 10/11 official availability designation is inferred from unreviewed reports.",
  "SP+ and FPI remain unavailable pending permitted, verified sources.",
];

// ranked matchups for the new marquee weeks
next.ranked_matchups = scheduled.filter(g => (apRanks.get(g.home_slug) ?? 99) <= 25 && (apRanks.get(g.away_slug) ?? 99) <= 25).slice(0, 6).map(g => ({ game_id: `${g.date}-${g.away_slug}-at-${g.home_slug}`, matchup: `${g.home_slug} vs ${g.away_slug}`.replace(/^(\S+) vs /, m => m), polls: ["ap"] }));

// ---------------------------------------------------------------- write
writeFileSync(new URL("../data/cfb-2026/refresh/evidence/2026-11-08-week10-refresh.json", import.meta.url), JSON.stringify(evidence));
writeFileSync(new URL("../data/cfb-2026/refresh/evidence/2026-11-08-full-season-audit.json", import.meta.url), JSON.stringify(audit));
writeFileSync(new URL("../data/cfb-2026/refresh/verified-refresh.json", import.meta.url), JSON.stringify(next));

console.log(JSON.stringify({
  cutoff: CUT,
  finals: finals.length,
  week10: finals.filter(g => g.week === 10).length,
  week9New: finals.filter(g => g.week === 9).length,
  scheduled: scheduled.length,
  playedTotal: next.playedGames.length,
  excludedTotal: next.excludedGames.length,
  records: Object.keys(next.teamRecords).length,
  byes: byes.length,
  kickoffTbd: scheduled.filter(g => g.kickoff_status === "official_tbd").length,
  tvUnpublished: scheduled.filter(g => !g.tv).length,
  auditCompleted: auditFinals.length,
  boardWeeks: next.board_weeks.map(w => w.week),
}, null, 1));
