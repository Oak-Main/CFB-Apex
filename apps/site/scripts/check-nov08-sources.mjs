import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { htmlTables, htmlText, isSourceEvidenceFresh, ncaaInventory, tvPattern } from "./gameday-source-validation.mjs";
import { verifyFullSeason } from "./full-season-validation.mjs";

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const snapshot = read("data/cfb-2026/refresh/verified-refresh.json");
const entry = snapshot.refresh_log.at(-1);
assert.equal(entry.script, "weekly-refresh-2026-11-08");
const evidence = read(entry.evidence);
const fullSeason = read(snapshot.full_season_review.evidence);
const original = read("data/cfb-2026/refresh/evidence/2026-10-20-week8-release.json");
const ids = new Map(original.conferences.flatMap(c => c.rows).map(r => [r.id, r.slug]));
const priorWeek9 = read("data/cfb-2026/refresh/evidence/2026-10-28-week9-refresh.json");

// Every required saved receipt and every newly retrieved response must be fresh.
// HTTP Date and Age are checked separately from the retrieval clock. The
// server's Date can sit a few seconds ahead of the local clock, so freshness
// is judged with a small skew allowance; the two-hour window itself is exact.
const requiredSources = [...evidence.raw_sources, ...fullSeason.raw_sources];
const observations = [], docs = new Map();
const SERVER_DATE_SKEW_MS = 60_000;
async function observe(row) {
  let response;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetch(row.url, { signal: AbortSignal.timeout(30_000) });
      break;
    } catch (error) { lastError = error; }
  }
  assert.ok(response, `${row.id}: source fetch failed ${lastError?.message ?? ""}`);
  assert.equal(response.status, 200, row.id);
  const serverDate = response.headers.get("date");
  assert.ok(serverDate && isSourceEvidenceFresh(serverDate, Date.now() + SERVER_DATE_SKEW_MS), `${row.id}: HTTP Date absent or stale`);
  assert.ok(Number(response.headers.get("age") ?? 0) < 7200, `${row.id}: cached response exceeded two hours`);
  const body = await response.text();
  docs.set(row.id, body);
  observations.push({ id: row.id, url: response.url, checkedAt: new Date().toISOString(), serverDate, age: response.headers.get("age"), sha256: createHash("sha256").update(body).digest("hex") });
}
for (let offset = 0; offset < requiredSources.length; offset += 6) {
  await Promise.all(requiredSources.slice(offset, offset + 6).map(row => {
    assert.equal(row.status, 200, row.id);
    assert.ok(isSourceEvidenceFresh(row.checkedAt, Date.now()), `${row.id}: saved evidence exceeded two hours`);
    return observe(row);
  }));
}

const etDate = value => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
const weekDays = { 9: ["20261027", "20261028", "20261029", "20261030", "20261031"], 10: ["20261103", "20261104", "20261105", "20261106", "20261107"], 11: ["20261110", "20261111", "20261112", "20261113", "20261114"] };
const events = week => weekDays[week].flatMap(day => JSON.parse(docs.get(`day-${day}`)).events);
const inventories = new Map([9, 10, 11].map(week => [week, ncaaInventory(docs.get(week < 10 ? `ncaa-history-${week}` : `ncaa${week}`), 2026, week)]));

// Official inventories: every reviewed week keeps its full slate, no new or
// omitted events. The finals/upcoming split at the cutoff is recorded in the
// evidence; the live re-fetch may show later states (a late final flipping to
// F) and each row's state is handled individually below.
assert.equal(inventories.get(9).length, 56, "NCAA week 9 inventory");
assert.equal(inventories.get(10).length, 63, "NCAA week 10 inventory");
assert.equal(inventories.get(11).length, 67, "NCAA week 11 inventory");
assert.equal(new Set(inventories.get(10).map(row => row.gameState)).difference(new Set(["F", "I"])).size, 0, "unexpected week 10 state");

// Week 9: the two already-published October 27 finals keep every gameplay
// fact identical to the reviewed October 28 snapshot; only the whole-season
// review stamp advances (the same re-stamp that release applied).
const priorSnapshot = JSON.parse(execSync("git show origin/main:apps/site/data/cfb-2026/refresh/verified-refresh.json", { encoding: "utf8", maxBuffer: 1024 * 1024 * 512, cwd: new URL("../../..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1") }));
const publishedWeek9Finals = snapshot.playedGames.filter(g => g.week === 9);
assert.equal(publishedWeek9Finals.length, 56, "week 9 published finals");
const withoutReview = row => { const copy = structuredClone(row); delete copy.meta.full_season_review; return copy; };
for (const prior of priorSnapshot.playedGames.filter(row => row.week === 9)) {
  const published = snapshot.playedGames.find(g => g.provider_id === prior.provider_id);
  assert.ok(published, `prior week 9 final missing ${prior.provider_id}`);
  assert.deepEqual(withoutReview(published), withoutReview(prior), `prior week 9 final changed ${prior.provider_id}`);
  const review = published.meta.full_season_review, priorReview = prior.meta.full_season_review;
  for (const key of ["provider_id", "ncaa_contest_id", "line_score", "state", "ncaa_status", "listed_kickoff_observations"]) {
    assert.deepEqual(review[key], priorReview[key], `prior week 9 review fact changed (${key}) ${prior.provider_id}`);
  }
  assert.ok(Date.parse(review.checked_at) >= Date.parse(priorReview.checked_at), `review stamp moved backwards ${prior.provider_id}`);
}
const week9Events = events(9);
assert.equal(week9Events.filter(e => e.competitions[0].status.type.completed).length, 56, "week 9 completed events");
for (const row of publishedWeek9Finals) {
  const event = week9Events.find(e => e.id === row.provider_id);
  assert.ok(event, `week 9 final event missing ${row.provider_id}`);
  const competition = event.competitions[0];
  assert.equal(competition.status.type.completed, true);
  assert.equal(competition.status.type.state, "post");
  assert.equal(event.week.number, 9);
  for (const side of ["home", "away"]) {
    const team = competition.competitors.find(t => t.homeAway === side);
    assert.equal(ids.get(team.team.id), side === "home" ? row.home_slug : row.away_slug);
    assert.equal(Number(team.score), row.teams.find(t => t.slug === ids.get(team.team.id)).points);
    assert.deepEqual(team.linescores?.map(q => q.value), row.meta.line_score[ids.get(team.team.id)]);
    assert.equal(team.linescores?.map(q => q.value).reduce((a, b) => a + b, 0), Number(team.score), `line score sum ${row.game_id}`);
  }
  assert.equal(Date.parse(event.date), Date.parse(row.meta.listed_kickoff_observations.espn));
  const ncaa = inventories.get(9).find(n => row.meta.sources.some(url => url.endsWith(`/game/${n.contestId}`)));
  assert.ok(ncaa, `week 9 NCAA contest missing ${row.provider_id}`);
  if (ncaa.gameState === "F") assert.equal(ncaa.startTimeEpoch * 1000, Date.parse(row.meta.listed_kickoff_observations.ncaa));
}

// Week 10: every FBS final is verified with scores, quarters and identities;
// the single FCS result stays outside the interface with its own receipt.
const week10Events = events(10);
assert.equal(week10Events.filter(e => e.competitions[0].status.type.completed).length, 63, "week 10 completed events");
const week10Finals = snapshot.playedGames.filter(g => g.week === 10);
assert.equal(week10Finals.length, 62, "week 10 published finals");
const corroborated = new Set(evidence.school_corroborations.map(row => row.provider_id));
for (const row of week10Finals) {
  const event = week10Events.find(e => e.id === row.provider_id);
  assert.ok(event, `week 10 final event missing ${row.provider_id}`);
  const competition = event.competitions[0];
  assert.equal(competition.status.type.completed, true);
  assert.equal(competition.status.type.state, "post");
  assert.equal(event.week.number, 10);
  assert.equal(etDate(event.date), row.date);
  assert.equal(competition.neutralSite === true, row.neutral_site);
  assert.equal(competition.venue?.fullName ?? null, row.site);
  const ncaa = inventories.get(10).find(n => row.meta.sources.some(url => url.endsWith(`/game/${n.contestId}`)));
  assert.ok(ncaa, `week 10 NCAA contest missing ${row.provider_id}`);
  if (ncaa.gameState !== "F") {
    // Late Saturday finals: the NCAA scoreboard remained in-progress at the
    // cutoff, so an official school page carries the independent final.
    assert.ok(corroborated.has(row.provider_id), `non-final NCAA observation without school corroboration ${row.provider_id}`);
  } else {
    assert.equal(ncaa.startTimeEpoch * 1000, Date.parse(row.meta.listed_kickoff_observations.ncaa));
  }
  for (const side of ["home", "away"]) {
    const team = competition.competitors.find(t => t.homeAway === side);
    const slug = ids.get(team.team.id);
    assert.equal(slug, side === "home" ? row.home_slug : row.away_slug);
    assert.equal(Number(team.score), row.teams.find(t => t.slug === slug).points);
    assert.deepEqual(team.linescores?.map(q => q.value), row.meta.line_score[slug]);
    assert.equal(team.linescores?.map(q => q.value).reduce((a, b) => a + b, 0), Number(team.score), `line score sum ${row.game_id}`);
  }
}
const fcsRow = snapshot.excludedGames.find(g => g.week === 10);
assert.ok(fcsRow && fcsRow.provider_id === "401858290", "week 10 FCS exclusion");
const fcsEvent = week10Events.find(e => e.id === "401858290");
assert.equal(Number(fcsEvent.competitions[0].competitors.find(t => t.homeAway === "home").score), fcsRow.home_score);
assert.equal(Number(fcsEvent.competitions[0].competitors.find(t => t.homeAway === "away").score), fcsRow.away_score);
const schoolCorroborations = {
  "401856856": { id: "school-texastech", expect: /Nov 07[\s\S]{0,120}West Virginia[\s\S]{0,120}48\s+53/ },
  "401860913": { id: "school-fresnostate", expect: /at Utah State[\s\S]{0,200}Fresno\s+L,\s*10-17/ },
  "401860912": { id: "school-oregonstate", expect: /Nov 07[\s\S]{0,160}Texas State[\s\S]{0,160}42\s+21/ },
  "401864535": { id: "school-unlv", expect: /versus Wyoming on November 7, 2026\s*,\s*Loss\s*,\s*35,\s*to,\s*41/ },
  "401864532": { id: "school-utep", expect: /L,\s*14-17[\s\S]{0,300}For Hawai'i - November 7, 2026/ },
};
assert.deepEqual(new Set(Object.keys(schoolCorroborations)), corroborated, "school corroboration set");
for (const [providerId, rule] of Object.entries(schoolCorroborations)) {
  const text = htmlText(docs.get(rule.id));
  assert.match(text, rule.expect, `school corroboration changed ${providerId}`);
}

// Week 11: the full slate, with announced kickoffs and networks that still
// agree with the official NCAA TV article and current provider listings.
const week11Events = events(11).filter(e => weekDays[11].includes(etDate(e.date).replaceAll("-", "")));
const scheduled = snapshot.scheduledGames;
assert.equal(scheduled.length, 67, "week 11 scheduled rows");
const tvText = htmlText(docs.get("tv-ncaa"));
for (const row of scheduled) {
  const event = week11Events.find(e => e.id === row.provider_id);
  assert.ok(event, `week 11 event missing ${row.provider_id}`);
  const competition = event.competitions[0];
  assert.equal(competition.status.type.completed, false);
  const ncaa = inventories.get(11).find(n => row.source_urls.some(url => url.endsWith(`/game/${n.contestId}`)));
  assert.ok(ncaa, `week 11 NCAA contest missing ${row.provider_id}`);
  assert.equal(ncaa.gameState, "P");
  assert.equal(competition.neutralSite === true, row.neutral_site);
  assert.equal(competition.venue?.fullName ?? null, row.site);
  if (row.kickoff_status === "official_tbd") {
    assert.equal(row.kickoff_utc, null);
    assert.equal(ncaa.hasStartTime, false, `kickoff announced for ${row.provider_id}; reconcile the hold`);
  } else {
    assert.ok(row.kickoff_utc, `confirmed row without kickoff ${row.provider_id}`);
    if (competition.timeValid) assert.equal(Date.parse(event.date), Date.parse(row.announced_kickoff_utc));
    if (ncaa.hasStartTime) assert.equal(ncaa.startTimeEpoch * 1000, Date.parse(row.ncaa_listed_kickoff_utc ?? row.kickoff_utc));
  }
  if (row.tv) assert.ok(competition.broadcasts.flatMap(b => b.names).some(name => tvPattern(row.tv).test(name) || tvPattern(name).test(row.tv)), `provider TV listing changed ${row.home_slug}`);
  else assert.deepEqual(competition.broadcasts.flatMap(b => b.names), [], `network announced for ${row.provider_id}; reconcile the hold`);
}
// Unannounced kickoffs and unpublished networks equal the counts the reviewed
// evidence records; each such row is re-checked against its live listing above.
const tbaRows = scheduled.filter(row => row.kickoff_status === "official_tbd");
assert.equal(tbaRows.length, evidence.counts.kickoffTBAorDisputed, `official TBD kickoffs ${tbaRows.length}`);
const unpublishedTv = scheduled.filter(row => !row.tv);
assert.equal(unpublishedTv.length, evidence.counts.tvPending, `unpublished networks ${unpublishedTv.length}`);

// Whole-team records: current provider standings, the official NCAA standings
// row for every team, and the nine conference standings pages.
const standings = JSON.parse(docs.get("espn-standings")).children.flatMap(c => c.standings?.entries ?? c.children?.flatMap(x => x.standings?.entries ?? []) ?? []);
const records = {}, conferenceRecords = {};
for (const r of standings) { const slug = ids.get(r.team.id); assert.ok(slug); records[slug] = r.stats.find(s => s.type === "total").summary; conferenceRecords[slug] = r.stats.find(s => s.type === "vsconf").summary; }
assert.equal(Object.keys(records).length, 138);
assert.deepEqual(records, evidence.records);
assert.deepEqual(records, snapshot.teamRecords);
assert.deepEqual(conferenceRecords, evidence.conferenceRecords);
const ncaaStandingsTables = htmlTables(docs.get("ncaa-standings"));
for (const row of evidence.primaryRecords) {
  assert.equal(row.overall, records[row.slug]);
  assert.equal(row.conference, conferenceRecords[row.slug]);
  if (row.source_id === "ncaa-standings") {
    const cells = ncaaStandingsTables.flatMap(t => t.slice(1)).find(r => r[0] === row.source_school);
    assert.ok(cells, `NCAA standings row absent ${row.slug}`);
    const [cw, cl] = conferenceRecords[row.slug].split("-");
    const [w, l] = records[row.slug].split("-");
    assert.deepEqual(cells.slice(1, 5), [cw, cl, w, l], `NCAA standings record mismatch ${row.slug}`);
  } else if (row.source_id.startsWith("standing-") || row.source_id === "official-sunbelt") {
    const table = htmlTables(docs.get(row.source_id)).flat().find(r => r.includes(row.overall) && r.includes(row.conference));
    assert.ok(table, `official standings absent ${row.slug}`);
  }
}

// Polls: the November 1 editions agree with NCAA and USA Today tables.
const rankings = JSON.parse(docs.get("rankings")).rankings.filter(p => ["1", "2"].includes(p.id));
for (const poll of rankings) {
  const saved = snapshot.polls.find(row => row.poll === (poll.id === "1" ? "ap" : "coaches"));
  assert.equal(poll.date.slice(0, 10), saved.release_date, "A newer poll requires reconciliation");
  const table = poll.id === "1"
    ? htmlTables(docs.get("ap-ncaa")).find(t => t.some(r => /SCHOOL/i.test(r.join(" "))))
    : htmlTables(docs.get("coaches")).find(t => t.some(r => /PTS/i.test(r.join(" "))));
  assert.equal(table.length - 1, saved.rankings.length);
  poll.ranks.forEach((r, i) => {
    const row = saved.rankings[i], official = table[i + 1];
    assert.equal(ids.get(r.team.id), row.team_slug);
    assert.equal(r.current, row.rank);
    assert.equal(r.points, row.points);
    assert.equal(r.recordSummary, row.record);
    assert.equal(Number(official[0].replace(/\D/g, "")), row.rank);
    assert.equal(Number(official[poll.id === "1" ? 2 : 3].replaceAll(",", "")), row.points);
    assert.equal(official[poll.id === "1" ? 3 : 2], row.record);
  });
}

// National leaders keep their own through-games statement and totals.
const throughText = (htmlText(docs.get("stat-passing")).match(/[Tt]hrough games [A-Za-z]+, [A-Za-z]+ \d{1,2}, \d{4}/) ?? ["not stated"])[0];
assert.equal(snapshot.metrics.through_games, throughText, "metrics through-games statement");
for (const [id, name] of [["stat-passing", "Passing yards"], ["stat-rushing", "Rushing yards"], ["stat-scoring", "Scoring offense"], ["stat-defense", "Scoring defense"]]) {
  const category = snapshot.metrics.categories.find(c => c.name === name);
  assert.ok(category, `metric category ${name}`);
  const table = htmlTables(docs.get(id)).find(t => t.length > 3);
  for (const row of category.rows) {
    assert.ok(table.some(r => r.some(cell => Number.isFinite(Number(cell.replaceAll(",", ""))) && Number(cell.replaceAll(",", "")) === row.value)), `leader row ${name} ${row.name}`);
  }
}

// Full season: every completed game involving FBS reconciles across ten NCAA
// weekly inventories and the full provider calendar, and the records the
// finals imply equal the independently verified official records.
const audit = read(snapshot.full_season_review.evidence);
const fullSeasonObserved = verifyFullSeason(snapshot, audit, new Map([...ids]), docs);
assert.equal(fullSeasonObserved.completed, 685);
assert.equal(fullSeasonObserved.fbsFinals, 562);
assert.equal(fullSeasonObserved.fcsFinals, 123);
assert.equal(snapshot.playedGames.length, 562);
assert.equal(snapshot.excludedGames.length, 123);

console.log(JSON.stringify({
  acceptance: "PASS",
  checkedAt: new Date().toISOString(),
  cutoff: snapshot.requested_cutoff,
  week9Finals: 56,
  week10Finals: 62,
  week11Fixtures: 67,
  records: 138,
  seasonCompleted: 685,
  observations: observations.slice(0, 8).map(({ body: _body, ...row }) => row).concat([{ total: observations.length }]),
}));
