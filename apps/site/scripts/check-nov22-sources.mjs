import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { htmlTables, htmlText, isSourceEvidenceFresh, ncaaInventory, tvPattern } from "./gameday-source-validation.mjs";
import { verifyFullSeason } from "./full-season-validation.mjs";
import { HOST_KICKOFF_SETTLEMENTS, HELD_KICKOFFS, zonedToUtc } from "./week13-host-kickoffs.mjs";

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const snapshot = read("data/cfb-2026/refresh/verified-refresh.json");
const entry = snapshot.refresh_log.at(-1);
assert.equal(entry.script, "weekly-refresh-2026-11-22");
const evidence = read(entry.evidence);
const fullSeason = read(snapshot.full_season_review.evidence);
const original = read("data/cfb-2026/refresh/evidence/2026-10-20-week8-release.json");
const ids = new Map(original.conferences.flatMap(c => c.rows).map(r => [r.id, r.slug]));
const officialHosts = read("data/cfb-2026/refresh/official-school-hosts.json").hosts;

// Every required saved receipt and every newly retrieved response must be fresh.
// HTTP Date and Age are checked separately from the retrieval clock. The
// server's Date can sit a few seconds ahead of the local clock, so freshness
// is judged with a small skew allowance; the two-hour window itself is exact.
// Some official sites answer an occasional 403 from their bot filter: a
// non-200 or a dropped connection is retried twice, a few seconds apart. Only
// a 200 with a fresh Date is ever accepted. The request carries the same
// identifying user agent the builder used, so a school site answers the gate
// the way it answered the capture.
// The audit's receipts are the same fetches the weekly evidence records, so
// each source id is retrieved once. Both saved copies must describe the same
// receipt, and both are held to the two-hour window.
const savedReceipts = [...evidence.raw_sources, ...fullSeason.raw_sources];
const requiredSources = [...new Map(savedReceipts.map(row => [row.id, row])).values()];
for (const row of savedReceipts) {
  const kept = requiredSources.find(other => other.id === row.id);
  assert.equal(row.url, kept.url, `${row.id}: one id, two URLs`);
  assert.equal(row.sha256, kept.sha256, `${row.id}: one id, two receipts`);
  assert.equal(row.checkedAt, kept.checkedAt, `${row.id}: one id, two retrieval times`);
}
const observations = [], docs = new Map();
const SERVER_DATE_SKEW_MS = 60_000;
const REQUEST_HEADERS = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 CFB-Apex-verification/1.0", accept: "text/html,application/json;q=0.9,*/*;q=0.8" };
async function observe(row) {
  let response, body;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, 4_000 * attempt));
    try {
      response = await fetch(row.url, { headers: REQUEST_HEADERS, signal: AbortSignal.timeout(30_000) });
      // The body is read inside the loop: a connection that drops after the
      // headers is retried like any other failed attempt.
      body = await response.text();
      if (response.status === 200) break;
    } catch (error) { lastError = error; response = undefined; body = undefined; }
  }
  assert.ok(response && body !== undefined, `${row.id}: source fetch failed ${lastError?.message ?? ""}`);
  assert.equal(response.status, 200, row.id);
  const serverDate = response.headers.get("date");
  assert.ok(serverDate && isSourceEvidenceFresh(serverDate, Date.now() + SERVER_DATE_SKEW_MS), `${row.id}: HTTP Date absent or stale`);
  assert.ok(Number(response.headers.get("age") ?? 0) < 7200, `${row.id}: cached response exceeded two hours`);
  docs.set(row.id, body);
  observations.push({ id: row.id, url: response.url, checkedAt: new Date().toISOString(), serverDate, age: response.headers.get("age"), sha256: createHash("sha256").update(body).digest("hex") });
}
for (const row of savedReceipts) {
  assert.equal(row.status, 200, row.id);
  assert.ok(isSourceEvidenceFresh(row.checkedAt, Date.now()), `${row.id}: saved evidence exceeded two hours`);
}
for (let offset = 0; offset < requiredSources.length; offset += 6) {
  await Promise.all(requiredSources.slice(offset, offset + 6).map(row => {
    assert.ok(isSourceEvidenceFresh(row.checkedAt, Date.now()), `${row.id}: saved evidence exceeded two hours`);
    return observe(row);
  }));
}

const etDate = value => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
// Week 12 was played Tuesday, November 17 through Saturday, November 21.
const weekDays = { 12: ["20261117", "20261118", "20261119", "20261120", "20261121"], 13: ["20261124", "20261125", "20261126", "20261127", "20261128"] };
const events = week => weekDays[week].flatMap(day => JSON.parse(docs.get(`day-${day}`)).events);
const inventories = new Map([12, 13].map(week => [week, ncaaInventory(docs.get(`ncaa${week}`), 2026, week)]));

// Official inventories: both reviewed weeks keep their full slates, no new or
// omitted events. The NCAA Week 13 scoreboard lists all 69 provider fixtures.
assert.equal(inventories.get(12).length, 70, "NCAA week 12 inventory");
assert.equal(inventories.get(13).length, 69, "NCAA week 13 inventory");
assert.deepEqual([...new Set(inventories.get(12).map(row => row.gameState))], ["F"], "unexpected week 12 state");

// Every final main already publishes keeps every gameplay fact and stamp;
// only the whole-season review stamp advances.
// The comparison is against what main publishes now, so origin/main is
// refreshed first. A shallow pull-request checkout has no origin/main and
// fetches just that ref. When the ref exists and the refresh itself cannot
// reach the remote, the existing ref is used and the gate says so; CI checks
// out the current ref, so that path is for a local run without network.
const repoRoot = new URL("../../..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
let hasMainRef = true;
try { execSync("git rev-parse --verify --quiet refs/remotes/origin/main", { cwd: repoRoot, stdio: "ignore" }); } catch { hasMainRef = false; }
try { execSync(`git fetch --no-tags ${hasMainRef ? "" : "--depth=1 "}origin +main:refs/remotes/origin/main`, { cwd: repoRoot, stdio: "inherit" }); }
catch (error) { if (!hasMainRef) throw error; console.warn("origin/main could not be refreshed; comparing against the existing ref"); }
const priorSnapshot = JSON.parse(execSync("git show origin/main:apps/site/data/cfb-2026/refresh/verified-refresh.json", { encoding: "utf8", maxBuffer: 1024 * 1024 * 512, cwd: repoRoot }));
const withoutReview = row => { const copy = structuredClone(row); delete copy.meta.full_season_review; return copy; };
const keyOf = row => row.provider_id ?? `legacy:${row.game_id}`;
const publishedByKey = new Map(snapshot.playedGames.map(row => [keyOf(row), row]));
assert.ok(priorSnapshot.playedGames.length >= 629, "prior published finals");
for (const prior of priorSnapshot.playedGames) {
  const published = publishedByKey.get(keyOf(prior));
  assert.ok(published, `prior final missing ${prior.game_id}`);
  assert.deepEqual(withoutReview(published), withoutReview(prior), `prior final changed ${prior.game_id}`);
  const review = published.meta.full_season_review, priorReview = prior.meta.full_season_review;
  for (const key of ["provider_id", "ncaa_contest_id", "line_score", "state", "ncaa_status", "listed_kickoff_observations"]) {
    assert.deepEqual(review[key], priorReview[key], `prior review fact changed (${key}) ${prior.game_id}`);
  }
  assert.ok(Date.parse(review.checked_at) >= Date.parse(priorReview.checked_at), `review stamp moved backwards ${prior.game_id}`);
}

// Week 12: every game is a verified final. The provider reports it completed
// with quarter scores that sum to the final, and the NCAA scoreboard carries
// the same score for the same sides. A passed kickoff time is never enough.
// 66 are FBS vs FBS and are published; 4 have an FCS opponent and stay
// outside the board as excluded rows.
const week12Events = events(12);
assert.equal(week12Events.length, 70, "week 12 provider events");
assert.equal(week12Events.filter(e => e.competitions[0].status.type.completed).length, 70, "week 12 completed events");
const week12Finals = snapshot.playedGames.filter(g => g.week === 12);
assert.equal(week12Finals.length, 66, "week 12 published finals");
assert.equal(evidence.counts.week12Finals, 66);
assert.equal(evidence.counts.week12FcsFinals, 4);
const priorWeek12 = new Map(priorSnapshot.scheduledGames.filter(row => row.week === 12).map(row => [row.provider_id, row]));
const mainPublishesThisRelease = priorSnapshot.refresh_log.at(-1)?.script === entry.script;
const priorByKey = new Map(priorSnapshot.playedGames.map(row => [keyOf(row), row]));
assert.equal(priorWeek12.size, mainPublishesThisRelease ? 0 : 66, "Week 12 slate on main");
for (const row of week12Finals) {
  const event = week12Events.find(e => e.id === row.provider_id);
  assert.ok(event, `week 12 final event missing ${row.provider_id}`);
  const competition = event.competitions[0];
  assert.equal(competition.status.type.completed, true);
  assert.equal(competition.status.type.state, "post");
  assert.equal(event.week.number, 12);
  assert.equal(etDate(event.date), row.date);
  assert.equal(competition.neutralSite === true, row.neutral_site);
  assert.equal(competition.venue?.fullName ?? null, row.site);
  assert.equal(Date.parse(event.date), Date.parse(row.meta.listed_kickoff_observations.espn));
  // Game ids never change: a final keeps the id its scheduled row published.
  // While main still publishes the Week 12 slate (before this release
  // merges), every final must have its scheduled row there. Once main carries
  // this release the slate is gone and the "prior final changed" comparison
  // above holds every id instead.
  const scheduledBefore = priorWeek12.get(row.provider_id);
  if (mainPublishesThisRelease) assert.ok(priorByKey.has(keyOf(row)), `final absent from main ${row.provider_id}`);
  else assert.ok(scheduledBefore, `no published scheduled row for ${row.provider_id}`);
  if (scheduledBefore) assert.equal(row.game_id, `${scheduledBefore.date}-${scheduledBefore.away}-at-${scheduledBefore.home}`, `game id changed ${row.provider_id}`);
  const ncaa = inventories.get(12).find(n => row.meta.sources.some(url => url.endsWith(`/game/${n.contestId}`)));
  assert.ok(ncaa, `week 12 NCAA contest missing ${row.provider_id}`);
  assert.equal(ncaa.gameState, "F", `week 12 NCAA state ${row.provider_id}`);
  assert.equal(ncaa.startTimeEpoch * 1000, Date.parse(row.meta.listed_kickoff_observations.ncaa));
  for (const side of ["home", "away"]) {
    const team = competition.competitors.find(t => t.homeAway === side);
    const slug = ids.get(team.team.id);
    assert.equal(slug, side === "home" ? row.home_slug : row.away_slug);
    const points = row.teams.find(t => t.slug === slug).points;
    assert.equal(Number(team.score), points);
    assert.deepEqual(team.linescores?.map(q => q.value), row.meta.line_score[slug]);
    assert.equal(team.linescores?.map(q => q.value).reduce((a, b) => a + b, 0), Number(team.score), `line score sum ${row.game_id}`);
    const ncaaSide = ncaa.teams.find(t => t.isHome === (side === "home"));
    assert.equal(Number(ncaaSide.score), points, `NCAA score ${row.game_id} (${side})`);
  }
}
// The four FBS-vs-FCS finals: completed on the provider with quarter scores
// that sum to the final, F with the same score on the NCAA scoreboard, and
// published only as excluded rows.
assert.equal(evidence.fcs_finals.length, 4, "week 12 FCS finals");
assert.deepEqual(new Set([...week12Finals.map(row => row.provider_id), ...evidence.fcs_finals.map(row => row.provider_id)]), new Set(week12Events.map(e => e.id)), "week 12 finals plus FCS finals equal the provider inventory");
for (const row of evidence.fcs_finals) {
  const event = week12Events.find(e => e.id === row.provider_id);
  const competition = event.competitions[0];
  assert.equal(competition.status.type.completed, true);
  assert.equal(competition.status.type.state, "post");
  assert.equal(etDate(event.date), row.date);
  const outside = competition.competitors.filter(t => !ids.get(t.team.id));
  assert.equal(outside.length, 1, `FCS final must have exactly one non-FBS side ${row.provider_id}`);
  const ncaa = inventories.get(12).find(n => row.ncaa_url.endsWith(`/game/${n.contestId}`));
  assert.ok(ncaa, `week 12 NCAA contest missing ${row.provider_id}`);
  assert.equal(ncaa.gameState, "F", `week 12 NCAA state ${row.provider_id}`);
  for (const side of ["home", "away"]) {
    const team = competition.competitors.find(t => t.homeAway === side);
    assert.equal(ids.get(team.team.id) ?? null, row[`${side}_slug`]);
    assert.equal(Number(team.score), row[`${side}_score`]);
    assert.equal(team.linescores?.map(q => q.value).reduce((a, b) => a + b, 0), Number(team.score), `line score sum ${row.provider_id}`);
    assert.equal(Number(ncaa.teams.find(t => t.isHome === (side === "home")).score), row[`${side}_score`], `NCAA score ${row.provider_id} (${side})`);
  }
  const excluded = snapshot.excludedGames.filter(game => game.provider_id === row.provider_id);
  assert.equal(excluded.length, 1, `FCS final excluded once ${row.provider_id}`);
  assert.deepEqual(excluded[0], row);
  assert.ok(!snapshot.playedGames.some(game => game.provider_id === row.provider_id), `FCS final on the board ${row.provider_id}`);
}
// No Week 12 final rests on a school receipt.
const schoolCorroborations = {};
assert.deepEqual(new Set(Object.keys(schoolCorroborations)), new Set(evidence.school_corroborations.map(row => row.provider_id)), "school corroboration set");

// Week 13: the full FBS-vs-FBS slate. A published kickoff is one the provider
// and the NCAA agree on, or one the host school's own official schedule
// settles; a kickoff nothing settles stays unpublished. Networks still agree
// with the current provider listing.
const week13Events = events(13);
assert.equal(week13Events.length, 69, "week 13 provider events");
const scheduled = snapshot.scheduledGames;
assert.equal(scheduled.length, 69, "week 13 scheduled rows");
assert.ok(scheduled.every(row => row.week === 13), "only week 13 is upcoming");
// Every published settlement is a reviewed one. A reviewed rule the snapshot
// does not use is a kickoff the NCAA scoreboard stated itself at the capture.
const settledIds = scheduled.filter(row => row.kickoff_settlement).map(row => row.provider_id);
assert.ok(settledIds.every(id => HOST_KICKOFF_SETTLEMENTS[id]), "kickoff settlement set");
assert.deepEqual(new Set(Object.keys(HELD_KICKOFFS)), new Set(scheduled.filter(row => row.kickoff_hold).map(row => row.provider_id)), "kickoff hold set");
assert.deepEqual(new Set(Object.keys(HELD_KICKOFFS)), new Set(scheduled.filter(row => row.kickoff_status === "official_tbd").map(row => row.provider_id)), "only a reviewed hold is unpublished");
const hostText = (rule) => rule.raw ? docs.get(rule.id) : htmlText(docs.get(rule.id));
const matchedNcaa = new Set();
for (const row of scheduled) {
  const event = week13Events.find(e => e.id === row.provider_id);
  assert.ok(event, `week 13 event missing ${row.provider_id}`);
  const competition = event.competitions[0];
  // Still a scheduled fixture: a postponed, canceled, delayed or started game
  // needs reconciling before it stays on the board as scheduled.
  assert.equal(competition.status.type.completed, false);
  assert.equal(competition.status.type.state, "pre", `week 13 fixture state ${row.provider_id}`);
  assert.equal(competition.status.type.name, "STATUS_SCHEDULED", `week 13 fixture status ${row.provider_id}`);
  assert.equal(row.game_status, "scheduled");
  assert.equal(event.week.number, 13);
  assert.equal(etDate(event.date), row.date);
  for (const side of ["home", "away"]) assert.equal(ids.get(competition.competitors.find(t => t.homeAway === side).team.id), row[`${side}_slug`]);
  assert.equal(competition.neutralSite === true, row.neutral_site);
  assert.equal(competition.venue?.fullName ?? null, row.site);
  const settlement = row.kickoff_settlement ? HOST_KICKOFF_SETTLEMENTS[row.provider_id] : undefined;
  const held = HELD_KICKOFFS[row.provider_id];
  const ncaa = inventories.get(13).find(n => row.source_urls.some(url => url.endsWith(`/game/${n.contestId}`)));
  if (settlement?.ncaa_absent) {
    // The NCAA scoreboard does not list this contest (the inventory count
    // above fails the gate the moment it does).
    assert.equal(ncaa, undefined, `NCAA scoreboard now lists ${row.provider_id}; reconcile the settlement`);
    assert.equal(row.kickoff_settlement.ncaa_absent, true);
  } else {
    assert.ok(ncaa, `week 13 NCAA contest missing ${row.provider_id}`);
    assert.equal(ncaa.gameState, "P");
    matchedNcaa.add(ncaa.contestId);
  }
  if (held) {
    // Unpublished kickoff: the host's schedule still lists its own time, the
    // provider still lists another, and the NCAA scoreboard still lists none.
    assert.equal(row.kickoff_status, "official_tbd");
    assert.equal(row.kickoff_utc, null);
    assert.equal(row.time_et, null);
    assert.equal(row.home_slug, held.host_slug);
    assert.equal(row.kickoff_hold.source_id, held.id);
    assert.equal(new URL(row.kickoff_hold.url).hostname, officialHosts[held.host_slug], `hold host ${row.provider_id}`);
    assert.match(hostText(held), held.expect, `host schedule changed ${row.provider_id}; reconcile the hold`);
    assert.equal(Date.parse(row.kickoff_hold.host_kickoff_utc), Date.parse(zonedToUtc(held.local)));
    assert.equal(Date.parse(event.date), Date.parse(row.kickoff_hold.espn_listed_kickoff_utc), `provider listing changed ${row.provider_id}; reconcile the hold`);
    assert.notEqual(Date.parse(event.date), Date.parse(row.kickoff_hold.host_kickoff_utc), `host and provider now agree ${row.provider_id}; settle the hold`);
    assert.equal(ncaa.hasStartTime, false, `kickoff announced for ${row.provider_id}; reconcile the hold`);
  } else {
    assert.equal(row.kickoff_status, "confirmed");
    assert.ok(row.kickoff_utc, `confirmed row without kickoff ${row.provider_id}`);
    assert.equal(competition.timeValid, true, `provider no longer lists a time ${row.provider_id}`);
    assert.equal(Date.parse(event.date), Date.parse(row.kickoff_utc), `provider kickoff changed ${row.provider_id}`);
    assert.equal(Date.parse(row.announced_kickoff_utc), Date.parse(row.kickoff_utc));
    if (settlement) {
      // The host school's official schedule settles its own home game. The
      // page must still show the reviewed listing; the NCAA scoreboard may
      // keep what it listed at the capture (a different instant, or none) or
      // have caught up to the host's instant.
      assert.equal(row.home_slug, settlement.host_slug);
      assert.equal(row.kickoff_settlement.source_id, settlement.id);
      assert.equal(new URL(row.kickoff_settlement.url).hostname, officialHosts[settlement.host_slug], `settlement host ${row.provider_id}`);
      assert.match(hostText(settlement), settlement.expect, `host schedule changed ${row.provider_id}`);
      assert.equal(Date.parse(zonedToUtc(settlement.local)), Date.parse(row.kickoff_utc), `host local time ${row.provider_id}`);
      assert.equal(Date.parse(row.kickoff_settlement.host_kickoff_utc), Date.parse(row.kickoff_utc));
      if (ncaa) {
        const listedNow = ncaa.hasStartTime ? ncaa.startTimeEpoch * 1000 : null;
        const listedAtCapture = row.ncaa_listed_kickoff_utc ? Date.parse(row.ncaa_listed_kickoff_utc) : null;
        assert.ok(listedNow === listedAtCapture || listedNow === Date.parse(row.kickoff_utc), `NCAA listing moved to a third instant ${row.provider_id}`);
      }
    } else {
      // No settlement: the NCAA must state the same kickoff, on its
      // scoreboard or (while the scoreboard has no time) in its TV article.
      if (ncaa.hasStartTime) assert.equal(ncaa.startTimeEpoch * 1000, Date.parse(row.kickoff_utc), `NCAA kickoff differs ${row.provider_id}; reconcile`);
      else assert.equal(row.timing_note, "Announced kickoff: NCAA TV article and provider listing agree", `kickoff rests on the provider alone ${row.provider_id}`);
    }
  }
  if (row.tv) assert.ok(competition.broadcasts.flatMap(b => b.names).some(name => tvPattern(row.tv).test(name) || tvPattern(name).test(row.tv)), `provider TV listing changed ${row.home_slug}`);
  else assert.deepEqual(competition.broadcasts.flatMap(b => b.names), [], `network announced for ${row.provider_id}; reconcile the hold`);
}
assert.equal(matchedNcaa.size, inventories.get(13).length, "every NCAA week 13 contest is on the board");
// No Week 13 fixture has an FCS opponent.
assert.equal(evidence.excluded_upcoming.length, 0, "week 13 FCS fixtures");
assert.deepEqual(new Set(scheduled.map(row => row.provider_id)), new Set(week13Events.map(e => e.id)), "week 13 slate equals the provider inventory");
// Unannounced kickoffs and unpublished networks equal the counts the reviewed
// evidence records; each such row is re-checked against its live listing above.
const tbaRows = scheduled.filter(row => row.kickoff_status === "official_tbd");
assert.equal(tbaRows.length, evidence.counts.kickoffTBAorDisputed, `unpublished kickoffs ${tbaRows.length}`);
const unpublishedTv = scheduled.filter(row => !row.tv);
assert.equal(unpublishedTv.length, evidence.counts.tvPending, `unpublished networks ${unpublishedTv.length}`);

// Whole-team records: current provider standings for all 138, and each team's
// exact row on the official NCAA standings page. A row the NCAA page had not
// updated at the cutoff must still be that reviewed lagging row or have caught
// up to the provider record, and keeps its separate official corroboration.
const standings = JSON.parse(docs.get("espn-standings")).children.flatMap(c => c.standings?.entries ?? c.children?.flatMap(x => x.standings?.entries ?? []) ?? []);
const records = {}, conferenceRecords = {}, locations = {};
for (const r of standings) { const slug = ids.get(r.team.id); assert.ok(slug); records[slug] = r.stats.find(s => s.type === "total").summary; conferenceRecords[slug] = r.stats.find(s => s.type === "vsconf").summary; locations[slug] = r.team.location; }
assert.equal(Object.keys(records).length, 138);
assert.deepEqual(records, evidence.records);
assert.deepEqual(records, snapshot.teamRecords);
assert.deepEqual(conferenceRecords, evidence.conferenceRecords);
const ncaaStandingRows = htmlTables(docs.get("ncaa-standings")).flatMap(t => t.slice(1)).filter(row => row.length >= 5 && /^\d+$/.test(row[1]));
assert.equal(ncaaStandingRows.length, 138, "NCAA standings rows");
const currentCells = slug => { const [cw, cl] = conferenceRecords[slug].split("-"); const [w, l] = records[slug].split("-"); return [cw, cl, w, l]; };
const lagging = new Map(evidence.ncaa_standings_lag.map(row => [row.slug, row]));
assert.equal(evidence.primaryRecords.length, 138);
const norm = value => value.toLowerCase().replace(/[^a-z0-9]/g, "");
for (const row of evidence.primaryRecords) {
  assert.equal(row.overall, records[row.slug]);
  assert.equal(row.conference, conferenceRecords[row.slug]);
  const lag = lagging.get(row.slug);
  if (!lag) {
    assert.equal(row.source_id, "ncaa-standings");
    const cells = ncaaStandingRows.filter(r => r[0] === row.source_school);
    assert.equal(cells.length, 1, `NCAA standings row absent ${row.slug}`);
    assert.deepEqual(cells[0].slice(1, 5), currentCells(row.slug), `NCAA standings record mismatch ${row.slug}`);
    continue;
  }
  const cells = ncaaStandingRows.filter(r => r[0] === lag.ncaa_name);
  assert.equal(cells.length, 1, `NCAA standings row absent ${row.slug}`);
  const observed = cells[0].slice(1, 5);
  assert.ok(JSON.stringify(observed) === JSON.stringify(lag.ncaa_row) || JSON.stringify(observed) === JSON.stringify(currentCells(row.slug)), `NCAA standings row for ${row.slug} is neither the reviewed lagging row nor the current record`);
  assert.equal(row.source_id, lag.corroborated_by);
  assert.ok(lag.uncounted_finals.length > 0 && lag.uncounted_finals.every(id => week12Finals.some(g => g.provider_id === id && [g.home_slug, g.away_slug].includes(row.slug))), `uncounted finals ${row.slug}`);
  if (row.source_id.startsWith("standing-")) {
    const conferenceRow = htmlTables(docs.get(row.source_id)).flat().find(r => r.some(cell => norm(cell) === norm(locations[row.slug])) && r.includes(row.overall) && r.includes(row.conference));
    assert.ok(conferenceRow, `official conference standings no longer corroborate ${row.slug}`);
  } else {
    assert.ok(evidence.school_corroborations.some(c => c.source_id === row.source_id && lag.uncounted_finals.includes(c.provider_id)), `host-school receipt absent ${row.slug}`);
  }
}

// Polls. Each edition keeps its own release date: both are the November 22
// editions. The AP edition agrees with the provider, the official NCAA table
// and USA Today's AP table; the Coaches edition agrees with the provider and
// the USA Today coaches table. A newer edition requires reconciliation.
const rankingsNow = JSON.parse(docs.get("rankings")).rankings;
const savedAp = snapshot.polls.find(row => row.poll === "ap"), savedCoaches = snapshot.polls.find(row => row.poll === "coaches");
const checkEdition = (poll, saved, table, pointsColumn, recordColumn) => {
  assert.equal(poll.date.slice(0, 10), saved.release_date, "A newer poll requires reconciliation");
  assert.equal(table.length - 1, saved.rankings.length);
  assert.equal(poll.ranks.length, saved.rankings.length);
  poll.ranks.forEach((r, i) => {
    const row = saved.rankings[i], official = table[i + 1];
    assert.equal(ids.get(r.team.id), row.team_slug);
    assert.equal(r.current, row.rank);
    assert.equal(r.points, row.points);
    assert.equal(r.recordSummary, row.record);
    assert.equal(Number(official[0].replace(/\D/g, "")), row.rank);
    assert.equal(Number(official[pointsColumn].replaceAll(",", "")), row.points);
    assert.equal(official[recordColumn], row.record);
  });
};
const apTable = htmlTables(docs.get("ap-ncaa")).find(t => t.some(r => /SCHOOL/i.test(r.join(" "))));
const coachesTable = htmlTables(docs.get("coaches")).find(t => t.some(r => /PTS/i.test(r.join(" "))));
const usaTodayApTable = htmlTables(docs.get("ap-usatoday")).find(t => t.some(r => /PTS/i.test(r.join(" "))));
const coachesNow = rankingsNow.find(p => p.id === "2");
assert.ok(coachesNow, "provider Coaches edition");
assert.equal(savedCoaches.release_date, "2026-11-22");
checkEdition(coachesNow, savedCoaches, coachesTable, 3, 2);
const apNow = rankingsNow.find(p => p.id === "1");
assert.equal(evidence.ap_edition_status.published, true);
assert.ok(apNow, "provider AP edition");
assert.equal(savedAp.release_date, "2026-11-22");
checkEdition(apNow, savedAp, apTable, 2, 3);
const usaColumn = pattern => usaTodayApTable[0].findIndex(h => pattern.test(h));
checkEdition(apNow, savedAp, usaTodayApTable, usaColumn(/^pts$/i), usaColumn(/^record$/i));
const composite = snapshot.polls.find(row => row.poll === "composite");
assert.equal(composite.release_date, savedAp.release_date, "composite pairs editions of one date");
// The November 16 AP edition (pregame ranks of the Week 12 finals, movement
// notes, archive): still the provider's Week 12 document row for row, and
// USA Today's previous-rank column still gives each ranked team that rank.
const pregame = evidence.pregame_ap_edition;
const apPregameNow = JSON.parse(docs.get("rankings-ap-pregame")).rankings.find(p => p.id === "1");
assert.ok(apPregameNow && apPregameNow.date.slice(0, 10) === "2026-11-16", "provider Week 12 AP edition");
assert.equal(pregame.poll.release_date, "2026-11-16");
assert.equal(apPregameNow.ranks.length, pregame.poll.rankings.length);
apPregameNow.ranks.forEach((r, i) => {
  const row = pregame.poll.rankings[i];
  assert.equal(ids.get(r.team.id), row.team_slug);
  assert.equal(r.current, row.rank);
  assert.equal(r.points, row.points);
  assert.equal(r.recordSummary, row.record);
});
const pregameRanks = new Map(pregame.poll.rankings.map(row => [row.team_slug, row.rank]));
const usaPrevColumn = usaColumn(/^prev$/i);
assert.ok(usaPrevColumn > 0, "USA Today previous-rank column");
savedAp.rankings.forEach((row, i) => {
  const cell = usaTodayApTable[i + 1][usaPrevColumn];
  assert.equal(/^\d+$/.test(cell) ? Number(cell) : null, pregameRanks.get(row.team_slug) ?? null, `USA Today previous rank ${row.team_slug}`);
  assert.equal(apNow.ranks[i].previous || null, pregameRanks.get(row.team_slug) ?? null, `provider previous rank ${row.team_slug}`);
});
assert.deepEqual(snapshot.poll_history.find(row => row.release_date === "2026-11-16")?.polls, [pregame.poll], "archived November 16 AP edition");
for (const game of week12Finals) for (const slug of [game.home_slug, game.away_slug]) assert.equal(game.meta.pregame_ap_ranks[slug], pregameRanks.get(slug) ?? null, `pregame AP rank ${game.game_id} ${slug}`);

// National leaders keep their own through-games statement and totals.
const throughText = (htmlText(docs.get("stat-passing")).match(/[Tt]hrough games [A-Za-z]+, [A-Za-z]+ \d{1,2}, \d{4}/) ?? ["not stated"])[0];
assert.equal(snapshot.metrics.through_games, throughText, "metrics through-games statement");
for (const [id, name] of [["stat-passing", "Passing yards"], ["stat-rushing", "Rushing yards"], ["stat-scoring", "Scoring offense"], ["stat-defense", "Scoring defense"]]) {
  const category = snapshot.metrics.categories.find(c => c.name === name);
  assert.ok(category, `metric category ${name}`);
  const table = htmlTables(docs.get(id)).find(t => t.length > 3);
  for (const row of category.rows) {
    // The value must sit in the same source row as the leader's name.
    assert.ok(table.some(r => r.includes(row.name) && r.some(cell => cell !== "" && Number.isFinite(Number(cell.replaceAll(",", ""))) && Number(cell.replaceAll(",", "")) === row.value)), `leader row ${name} ${row.name}`);
  }
}

// Full season: every completed game involving FBS reconciles across twelve
// NCAA weekly inventories and the full provider calendar, and the records the
// finals imply equal the independently verified official records.
const audit = read(snapshot.full_season_review.evidence);
const fullSeasonObserved = verifyFullSeason(snapshot, audit, new Map([...ids]), docs);
assert.equal(fullSeasonObserved.completed, 822);
assert.equal(fullSeasonObserved.fbsFinals, 695);
assert.equal(fullSeasonObserved.fcsFinals, 127);
assert.equal(snapshot.playedGames.length, 695);
assert.equal(snapshot.excludedGames.length, 127);

const oldest = requiredSources.reduce((a, r) => (a.checkedAt < r.checkedAt ? a : r));
console.log(JSON.stringify({
  acceptance: "PASS",
  checkedAt: new Date().toISOString(),
  cutoff: snapshot.requested_cutoff,
  oldestSavedReceipt: oldest.checkedAt,
  week12Finals: 66,
  week12FcsFinals: 4,
  week13Fixtures: 69,
  week13KickoffSettlements: settledIds.length,
  week13KickoffHolds: Object.keys(HELD_KICKOFFS).length,
  records: 138,
  ncaaStandingsRowsLagging: evidence.ncaa_standings_lag.map(row => row.slug),
  apEditionPublished: evidence.ap_edition_status.published,
  seasonCompleted: 822,
  observations: observations.slice(0, 8).concat([{ total: observations.length }]),
}));
