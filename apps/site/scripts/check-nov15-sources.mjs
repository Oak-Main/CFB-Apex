import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { htmlTables, htmlText, isSourceEvidenceFresh, ncaaInventory, tvPattern } from "./gameday-source-validation.mjs";
import { verifyFullSeason } from "./full-season-validation.mjs";

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const snapshot = read("data/cfb-2026/refresh/verified-refresh.json");
const entry = snapshot.refresh_log.at(-1);
assert.equal(entry.script, "weekly-refresh-2026-11-15");
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
// a 200 with a fresh Date is ever accepted.
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
async function observe(row) {
  let response, body;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, 4_000 * attempt));
    try {
      response = await fetch(row.url, { signal: AbortSignal.timeout(30_000) });
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
// Week 11 ended with a Sunday, November 15 game (Ole Miss at Oklahoma).
const weekDays = { 11: ["20261110", "20261111", "20261112", "20261113", "20261114", "20261115"], 12: ["20261117", "20261118", "20261119", "20261120", "20261121"] };
const events = week => weekDays[week].flatMap(day => JSON.parse(docs.get(`day-${day}`)).events);
const inventories = new Map([11, 12].map(week => [week, ncaaInventory(docs.get(`ncaa${week}`), 2026, week)]));

// Official inventories: both reviewed weeks keep their full slates, no new or
// omitted events.
assert.equal(inventories.get(11).length, 67, "NCAA week 11 inventory");
assert.equal(inventories.get(12).length, 70, "NCAA week 12 inventory");
assert.deepEqual([...new Set(inventories.get(11).map(row => row.gameState))], ["F"], "unexpected week 11 state");

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
assert.ok(priorSnapshot.playedGames.length >= 562, "prior published finals");
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

// Week 11: every game is a verified final. The provider reports it completed
// with quarter scores that sum to the final, and the NCAA scoreboard carries
// the same score for the same sides. A passed kickoff time is never enough.
const week11Events = events(11);
assert.equal(week11Events.length, 67, "week 11 provider events");
assert.equal(week11Events.filter(e => e.competitions[0].status.type.completed).length, 67, "week 11 completed events");
const week11Finals = snapshot.playedGames.filter(g => g.week === 11);
assert.equal(week11Finals.length, 67, "week 11 published finals");
assert.equal(evidence.counts.week11Finals, 67);
const priorWeek11 = new Map(priorSnapshot.scheduledGames.filter(row => row.week === 11).map(row => [row.provider_id, row]));
const mainPublishesThisRelease = priorSnapshot.refresh_log.at(-1)?.script === entry.script;
const priorByKey = new Map(priorSnapshot.playedGames.map(row => [keyOf(row), row]));
assert.equal(priorWeek11.size, mainPublishesThisRelease ? 0 : 67, "Week 11 slate on main");
for (const row of week11Finals) {
  const event = week11Events.find(e => e.id === row.provider_id);
  assert.ok(event, `week 11 final event missing ${row.provider_id}`);
  const competition = event.competitions[0];
  assert.equal(competition.status.type.completed, true);
  assert.equal(competition.status.type.state, "post");
  assert.equal(event.week.number, 11);
  assert.equal(etDate(event.date), row.date);
  assert.equal(competition.neutralSite === true, row.neutral_site);
  assert.equal(competition.venue?.fullName ?? null, row.site);
  assert.equal(Date.parse(event.date), Date.parse(row.meta.listed_kickoff_observations.espn));
  // Game ids never change: a final keeps the id its scheduled row published.
  // While main still publishes the Week 11 slate (before this release
  // merges), every final must have its scheduled row there. Once main carries
  // this release the slate is gone and the "prior final changed" comparison
  // above holds every id instead.
  const scheduledBefore = priorWeek11.get(row.provider_id);
  if (mainPublishesThisRelease) assert.ok(priorByKey.has(keyOf(row)), `final absent from main ${row.provider_id}`);
  else assert.ok(scheduledBefore, `no published scheduled row for ${row.provider_id}`);
  if (scheduledBefore) assert.equal(row.game_id, `${scheduledBefore.date}-${scheduledBefore.away}-at-${scheduledBefore.home}`, `game id changed ${row.provider_id}`);
  const ncaa = inventories.get(11).find(n => row.meta.sources.some(url => url.endsWith(`/game/${n.contestId}`)));
  assert.ok(ncaa, `week 11 NCAA contest missing ${row.provider_id}`);
  assert.equal(ncaa.gameState, "F", `week 11 NCAA state ${row.provider_id}`);
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
// The rescheduled Sunday final carries its host school's own result line.
const schoolCorroborations = {
  "401856887": { id: "school-oklahoma", host: "oklahoma", expect: /Football versus Ole Miss on November 15, 2026\s*,\s*Win\s*,\s*24,\s*to,\s*17/ },
};
assert.deepEqual(new Set(Object.keys(schoolCorroborations)), new Set(evidence.school_corroborations.map(row => row.provider_id)), "school corroboration set");
for (const [providerId, rule] of Object.entries(schoolCorroborations)) {
  const saved = evidence.school_corroborations.find(row => row.provider_id === providerId);
  assert.equal(saved.source_id, rule.id);
  assert.equal(new URL(saved.url).hostname, officialHosts[rule.host], `school source host ${providerId}`);
  assert.equal(week11Finals.find(g => g.provider_id === providerId)?.home_slug, rule.host, `school corroboration is the host's ${providerId}`);
  assert.match(htmlText(docs.get(rule.id)), rule.expect, `school corroboration changed ${providerId}`);
}

// Week 12: the full FBS-vs-FBS slate. Kickoffs and networks still agree with
// the current provider listing; FBS-vs-FCS games stay outside the board.
const week12Events = events(12);
assert.equal(week12Events.length, 70, "week 12 provider events");
const scheduled = snapshot.scheduledGames;
assert.equal(scheduled.length, 66, "week 12 scheduled rows");
assert.ok(scheduled.every(row => row.week === 12), "only week 12 is upcoming");
const kickoffSettlements = {
  "401866465": { id: "school-western-michigan", host: "western-michigan", expect: /Nov 17 \(Tue\) \/ 6:00 PM[\s\S]{0,200}?vs Eastern Michigan University/, pageUtc: "2026-11-17T23:00:00Z" },
  "401866469": { id: "school-buffalo", host: "buffalo", expect: /Wed,\s*Nov 18\s*,\s*7:30 pm\s+vs Central Michigan/, pageUtc: null },
  "401864545": { id: "school-air-force", host: "air-force", expect: /Nov 20 \/ 6:00 PM MT vs UTEP/, pageUtc: null },
};
assert.deepEqual(new Set(Object.keys(kickoffSettlements)), new Set(scheduled.filter(row => row.kickoff_settlement).map(row => row.provider_id)), "kickoff settlement set");
for (const row of scheduled) {
  const event = week12Events.find(e => e.id === row.provider_id);
  assert.ok(event, `week 12 event missing ${row.provider_id}`);
  const competition = event.competitions[0];
  // Still a scheduled fixture: a postponed, canceled, delayed or started game
  // needs reconciling before it stays on the board as scheduled.
  assert.equal(competition.status.type.completed, false);
  assert.equal(competition.status.type.state, "pre", `week 12 fixture state ${row.provider_id}`);
  assert.equal(competition.status.type.name, "STATUS_SCHEDULED", `week 12 fixture status ${row.provider_id}`);
  assert.equal(row.game_status, "scheduled");
  assert.equal(event.week.number, 12);
  assert.equal(etDate(event.date), row.date);
  for (const side of ["home", "away"]) assert.equal(ids.get(competition.competitors.find(t => t.homeAway === side).team.id), row[`${side}_slug`]);
  const ncaa = inventories.get(12).find(n => row.source_urls.some(url => url.endsWith(`/game/${n.contestId}`)));
  assert.ok(ncaa, `week 12 NCAA contest missing ${row.provider_id}`);
  assert.equal(ncaa.gameState, "P");
  assert.equal(competition.neutralSite === true, row.neutral_site);
  assert.equal(competition.venue?.fullName ?? null, row.site);
  if (row.kickoff_status === "official_tbd") {
    assert.equal(row.kickoff_utc, null);
    assert.equal(ncaa.hasStartTime, false, `kickoff announced for ${row.provider_id}; reconcile the hold`);
  } else {
    assert.ok(row.kickoff_utc, `confirmed row without kickoff ${row.provider_id}`);
    if (competition.timeValid) assert.equal(Date.parse(event.date), Date.parse(row.announced_kickoff_utc));
    const settlement = kickoffSettlements[row.provider_id];
    if (settlement) {
      // The host school's official schedule settles its own home game. The
      // page must still show the reviewed listing; the NCAA scoreboard may
      // keep its differing instant or have corrected it to the host's.
      assert.equal(row.home_slug, settlement.host);
      assert.equal(row.kickoff_settlement.source_id, settlement.id);
      assert.equal(new URL(row.kickoff_settlement.url).hostname, officialHosts[settlement.host], `settlement host ${row.provider_id}`);
      assert.match(htmlText(docs.get(settlement.id)), settlement.expect, `host schedule changed ${row.provider_id}`);
      if (settlement.pageUtc) assert.ok(docs.get(settlement.id).includes(`"date_utc":"${settlement.pageUtc}"`), `host schedule instant changed ${row.provider_id}`);
      assert.equal(Date.parse(row.kickoff_settlement.host_kickoff_utc), Date.parse(row.kickoff_utc));
      assert.ok(ncaa.hasStartTime && [Date.parse(row.ncaa_listed_kickoff_utc), Date.parse(row.kickoff_utc)].includes(ncaa.startTimeEpoch * 1000), `NCAA listing moved to a third instant ${row.provider_id}`);
    } else if (ncaa.hasStartTime) {
      assert.equal(ncaa.startTimeEpoch * 1000, Date.parse(row.ncaa_listed_kickoff_utc ?? row.kickoff_utc), `NCAA kickoff differs ${row.provider_id}; reconcile`);
    }
  }
  if (row.tv) assert.ok(competition.broadcasts.flatMap(b => b.names).some(name => tvPattern(row.tv).test(name) || tvPattern(name).test(row.tv)), `provider TV listing changed ${row.home_slug}`);
  else assert.deepEqual(competition.broadcasts.flatMap(b => b.names), [], `network announced for ${row.provider_id}; reconcile the hold`);
}
// The four FBS-vs-FCS fixtures: one side is outside the 138-team membership
// and the provider's own conference id for it is not an FBS conference.
const fbsConferenceIds = new Set(["1", "4", "5", "8", "9", "12", "15", "17", "18", "37", "151"]);
assert.equal(evidence.excluded_upcoming.length, 4, "week 12 FCS fixtures");
assert.deepEqual(new Set([...scheduled.map(row => row.provider_id), ...evidence.excluded_upcoming.map(row => row.provider_id)]), new Set(week12Events.map(e => e.id)), "week 12 slate plus exclusions equals the provider inventory");
for (const row of evidence.excluded_upcoming) {
  const event = week12Events.find(e => e.id === row.provider_id);
  const sides = event.competitions[0].competitors;
  const outside = sides.filter(t => !ids.get(t.team.id));
  assert.equal(outside.length, 1, `excluded fixture must have exactly one non-FBS side ${row.provider_id}`);
  assert.ok(outside[0].team.conferenceId != null && !fbsConferenceIds.has(String(outside[0].team.conferenceId)), `no FCS conference-id evidence ${row.provider_id}`);
}
// Unannounced kickoffs and unpublished networks equal the counts the reviewed
// evidence records; each such row is re-checked against its live listing above.
const tbaRows = scheduled.filter(row => row.kickoff_status === "official_tbd");
assert.equal(tbaRows.length, evidence.counts.kickoffTBAorDisputed, `official TBD kickoffs ${tbaRows.length}`);
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
  assert.ok(lag.uncounted_finals.length > 0 && lag.uncounted_finals.every(id => week11Finals.some(g => g.provider_id === id && [g.home_slug, g.away_slug].includes(row.slug))), `uncounted finals ${row.slug}`);
  if (row.source_id.startsWith("standing-")) {
    const conferenceRow = htmlTables(docs.get(row.source_id)).flat().find(r => r.some(cell => norm(cell) === norm(locations[row.slug])) && r.includes(row.overall) && r.includes(row.conference));
    assert.ok(conferenceRow, `official conference standings no longer corroborate ${row.slug}`);
  } else {
    assert.ok(evidence.school_corroborations.some(c => c.source_id === row.source_id && lag.uncounted_finals.includes(c.provider_id)), `host-school receipt absent ${row.slug}`);
  }
}

// Polls. Each edition keeps its own release date. The Coaches edition agrees
// with the provider and the USA Today table. While the provider publishes no
// newer AP edition, the kept AP edition must still be the provider's Week 11
// document and the NCAA AP table; a newer AP edition requires reconciliation.
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
const coachesNow = rankingsNow.find(p => p.id === "2");
assert.ok(coachesNow, "provider Coaches edition");
assert.equal(savedCoaches.release_date, "2026-11-15");
checkEdition(coachesNow, savedCoaches, coachesTable, 3, 2);
const apNow = rankingsNow.find(p => p.id === "1");
if (evidence.ap_edition_status.published) {
  assert.ok(apNow, "provider AP edition");
  checkEdition(apNow, savedAp, apTable, 2, 3);
} else {
  assert.equal(savedAp.release_date, "2026-11-08", "kept AP edition keeps its own date");
  assert.ok(!apNow || apNow.date.slice(0, 10) === savedAp.release_date, "A newer AP poll requires reconciliation");
  const apPrior = JSON.parse(docs.get("rankings-ap-prior")).rankings.find(p => p.id === "1");
  assert.ok(apPrior, "provider Week 11 AP edition");
  checkEdition(apPrior, savedAp, apTable, 2, 3);
  const composite = snapshot.polls.find(row => row.poll === "composite");
  assert.equal(composite.release_date, savedAp.release_date, "composite pairs editions of one date");
  assert.deepEqual(composite, priorSnapshot.polls.find(row => row.poll === "composite") ?? composite, "kept composite changed");
}

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

// Full season: every completed game involving FBS reconciles across eleven
// NCAA weekly inventories and the full provider calendar, and the records the
// finals imply equal the independently verified official records.
const audit = read(snapshot.full_season_review.evidence);
const fullSeasonObserved = verifyFullSeason(snapshot, audit, new Map([...ids]), docs);
assert.equal(fullSeasonObserved.completed, 752);
assert.equal(fullSeasonObserved.fbsFinals, 629);
assert.equal(fullSeasonObserved.fcsFinals, 123);
assert.equal(snapshot.playedGames.length, 629);
assert.equal(snapshot.excludedGames.length, 123);

const oldest = requiredSources.reduce((a, r) => (a.checkedAt < r.checkedAt ? a : r));
console.log(JSON.stringify({
  acceptance: "PASS",
  checkedAt: new Date().toISOString(),
  cutoff: snapshot.requested_cutoff,
  oldestSavedReceipt: oldest.checkedAt,
  week11Finals: 67,
  week12Fixtures: 66,
  week12FcsFixtures: 4,
  records: 138,
  ncaaStandingsRowsLagging: evidence.ncaa_standings_lag.map(row => row.slug),
  apEditionPublished: evidence.ap_edition_status.published,
  seasonCompleted: 752,
  observations: observations.slice(0, 8).concat([{ total: observations.length }]),
}));
