import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parse } from "parse5";
import { htmlTables, htmlText, isSourceEvidenceFresh, ncaaInventory, tvPattern } from "./gameday-source-validation.mjs";
import { verifyFullSeason } from "./full-season-validation.mjs";
import { editorialComposite } from "./reconcile-gameday.mjs";

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const snapshot = read("data/cfb-2026/refresh/verified-refresh.json");
const entry = snapshot.refresh_log.at(-1);
assert.ok(["weekly-refresh-2026-10-28", "weekly-refresh-2026-10-29"].includes(entry.script));
const evidence = read(entry.evidence);
const fullSeason = read(snapshot.full_season_review.evidence);
const observations = [], docs = new Map();
const requiredSources = [...evidence.raw_sources, ...fullSeason.raw_sources];
function inertiaArticle(html) {
  let data;
  function visit(node) {
    const attr = node.attrs?.find(a => a.name === "data-page");
    if (attr) data = JSON.parse(attr.value);
    for (const child of node.childNodes ?? []) visit(child);
  }
  visit(parse(html));
  assert.ok(data?.props?.article?.content_blocks, "Official SEC article payload missing");
  return htmlText(data.props.article.content_blocks.map(b => b.data.paragraph ?? "").join(" "));
}
// Every required saved receipt and every newly retrieved response must be fresh.
// HTTP Date and Age are checked separately from the retrieval clock.
for (let offset = 0; offset < requiredSources.length; offset += 6) {
  await Promise.all(requiredSources.slice(offset, offset + 6).map(async row => {
    assert.equal(row.status, 200, row.id);
    assert.ok(isSourceEvidenceFresh(row.checkedAt, Date.now()), `${row.id}: saved evidence exceeded two hours`);
    const response = await fetch(row.url, { signal: AbortSignal.timeout(30_000) });
    assert.equal(response.status, 200, row.id);
    const serverDate = response.headers.get("date");
    assert.ok(serverDate && isSourceEvidenceFresh(serverDate, Date.now()), `${row.id}: HTTP Date absent or stale`);
    assert.ok(Number(response.headers.get("age") ?? 0) < 7200, `${row.id}: cached response exceeded two hours`);
    const body = await response.text();
    docs.set(row.id, body);
    observations.push({ id: row.id, url: response.url, checkedAt: new Date().toISOString(), serverDate, age: response.headers.get("age"), sha256: createHash("sha256").update(body).digest("hex") });
  }));
}
const original = read("data/cfb-2026/refresh/evidence/2026-10-20-week8-release.json");
const ids = new Map(original.conferences.flatMap(c => c.rows).map(r => [r.id, r.slug]));
const events = Array.from({ length: 12 }, (_, i) => i + 20).flatMap(day => JSON.parse(docs.get(`day-${day}`)).events);
assert.equal(new Set(events.map(e => e.id)).size, events.length, "Duplicate provider event");
assert.equal(events.length, 112, "New or omitted FBS game requires reconciliation");
const inventories = new Map([8, 9].map(week => [week, ncaaInventory(docs.get(`ncaa${week}`), 2026, week)]));
const prior = read("data/cfb-2026/refresh/evidence/2026-10-25-week9-preparation.json");
const published = [...evidence.finals, ...evidence.schedule];
assert.deepEqual(new Set(events.map(e => e.id)), new Set(published.map(r => r.provider_id)), "Changed event inventory");
for (const week of [8, 9]) assert.equal(inventories.get(week).length, 56, `NCAA Week ${week} inventory`);
const seen = new Set(), matchedNcaa = new Set();
for (const row of published) {
  const event = events.find(e => e.id === row.provider_id), c = event.competitions[0];
  const home = c.competitors.find(t => t.homeAway === "home"), away = c.competitors.find(t => t.homeAway === "away");
  const h = ids.get(home.team.id), a = ids.get(away.team.id);
  assert.equal(h, row.home_slug); assert.equal(a, row.away_slug);
  assert.equal(event.season.year, 2026); assert.equal(event.week.number, row.week);
  const logical = `${row.date}:${a}:${h}`;
  assert.ok(!seen.has(logical), "Duplicate scheduled/final game"); seen.add(logical);
  const ncaa = inventories.get(row.week).find(n => row.week === 8
    ? prior.finals.find(r => r.id === event.id)?.source_urls.includes(`https://www.ncaa.com${n.url}`)
    : n.contestId === prior.schoolEvidence.find(s => s.id === event.id)?.ncaa.contestId);
  assert.ok(ncaa, `NCAA game missing ${event.id}`);
  assert.ok(!matchedNcaa.has(ncaa.contestId)); matchedNcaa.add(ncaa.contestId);
  assert.equal(c.neutralSite === true, row.neutral_site); assert.equal(c.venue?.fullName ?? null, row.site);
  if (row.teams) {
    assert.equal(c.status.type.completed, true); assert.equal(c.status.type.state, "post"); assert.equal(ncaa.gameState, "F");
    const saved = snapshot.playedGames.find(r => r.provider_id === event.id);
    assert.equal(saved.game_id, row.game_id);
    assert.ok(!snapshot.scheduledGames.some(r => r.provider_id === event.id));
    for (const [side, team] of [[true, home], [false, away]]) {
      const slug = ids.get(team.team.id), score = Number(team.score), lines = team.linescores.map(q => q.value);
      assert.equal(row.teams.find(t => t.slug === slug).points, score);
      assert.equal(saved.teams.find(t => t.slug === slug).points, score);
      assert.equal(ncaa.teams.find(t => t.isHome === side).score, score);
      assert.deepEqual(saved.meta.line_score[slug], lines); assert.equal(lines.reduce((a, b) => a + b, 0), score);
    }
    assert.equal(c.status.period, saved.meta.line_score[h].length, "Overtime period changed");
    assert.equal(Date.parse(event.date), Date.parse(saved.meta.listed_kickoff_observations.espn));
    assert.equal(ncaa.startTimeEpoch * 1000, Date.parse(saved.meta.listed_kickoff_observations.ncaa));
  } else {
    assert.equal(c.status.type.completed, false);
    if (row.result_pending_review) {
      assert.ok(["pre", "in"].includes(c.status.type.state), "A new final requires reconciliation");
      assert.ok(["P", "I"].includes(ncaa.gameState), "A new official final requires reconciliation");
      assert.ok(Date.parse(row.kickoff_utc) < Date.now(), "Only a past kickoff can be result-pending");
      assert.ok(row.teams == null && row.homeScore == null && row.awayScore == null, "Pending observations must not publish provisional scores");
    } else {
      assert.equal(c.status.type.state, "pre"); assert.equal(ncaa.gameState, "P");
    }
    const saved = snapshot.scheduledGames.find(r => r.provider_id === event.id);
    assert.ok(saved);
    assert.equal(Date.parse(event.date), Date.parse(row.announced_kickoff_utc));
    assert.equal(Date.parse(row.ncaa_listed_kickoff_utc), ncaa.startTimeEpoch * 1000);
    if (row.kickoff_utc === null) { assert.equal(row.kickoff_status, "official_tbd"); assert.equal(ncaa.hasStartTime, false); }
    else {
      assert.equal(c.timeValid, true); assert.equal(Date.parse(event.date), Date.parse(row.kickoff_utc));
      // The NCAA TV article is the announced time; the Iowa scoreboard's
      // 12:10 listing is separately retained, never claimed as actual start.
      const text = htmlText(docs.get("tv-ncaa"));
      assert.ok(text.includes(row.official_tv.observed_text), `Official TV assignment changed ${h}`);
      assert.ok(tvPattern(row.tv).test(row.official_tv.tv));
      const literal = row.official_tv.time.match(/(\d{1,2})(?::(\d{2}))?\s*([ap])\.m\./i);
      assert.ok(literal);
      const localTime = new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(row.kickoff_utc));
      assert.equal(localTime, `${String(+literal[1] % 12 + (literal[3] === "p" ? 12 : 0)).padStart(2, "0")}:${literal[2] ?? "00"}`, "Official announced time differs");
      assert.equal(saved.tv, row.tv); assert.equal(saved.kickoff_utc, row.kickoff_utc);
    }
    assert.ok(c.broadcasts.flatMap(b => b.names).includes(row.tv));
  }
}
assert.equal(matchedNcaa.size, 112);
const records = {}, conferenceRecords = {};
const entries = JSON.parse(docs.get("espn-standings")).children.flatMap(c => c.standings?.entries ?? c.children?.flatMap(x => x.standings?.entries ?? []) ?? []);
for (const r of entries) { const slug = ids.get(r.team.id); assert.ok(slug); records[slug] = r.stats.find(s => s.type === "total").summary; conferenceRecords[slug] = r.stats.find(s => s.type === "vsconf").summary; }
assert.equal(Object.keys(records).length, 138); assert.deepEqual(records, evidence.records); assert.deepEqual(records, snapshot.teamRecords); assert.deepEqual(conferenceRecords, evidence.conferenceRecords);
assert.equal(new Set(evidence.primaryRecords.map(r => r.slug)).size, 138);
const secText = inertiaArticle(docs.get("sec-preview"));
for (const r of evidence.primaryRecords) {
  assert.equal(r.overall, records[r.slug]); assert.equal(r.conference, conferenceRecords[r.slug]);
  if (r.source_id.startsWith("standing-")) {
    const table = htmlTables(docs.get(r.source_id))[0], header = table[0];
    const row = table.find(row => row[0] === r.source_school);
    assert.ok(row, `Official standing absent ${r.slug}`);
    assert.equal(row[header.indexOf("Overall")], r.overall);
    assert.equal(row[header.indexOf("Conf") >= 0 ? header.indexOf("Conf") : header.indexOf("ACC")], r.conference);
  } else if (r.source_id === "official-sunbelt") {
    assert.ok(htmlText(docs.get(r.source_id)).includes(`${r.source_school} (${r.overall}-0, ${r.conference}-0)`), `Sun Belt record changed ${r.slug}`);
  } else if (r.source_id === "sec-preview") {
    assert.ok(secText.includes(`${r.source_school} ${r.overall} (${r.conference} SEC)`), `SEC record changed ${r.slug}`);
  } else if (r.source_id === "school-uconn") {
    assert.match(htmlText(docs.get(r.source_id)), /Overall Wins 4 Losses 3/);
  } else {
    assert.equal(r.source_id, "navy-preview-indexed");
    assert.equal(r.source_published_at, "2026-10-26");
    assert.equal(r.overall, "6-1");
    assert.ok(!events.some(e => e.week.number === 9 && e.competitions[0].competitors.some(t => ids.get(t.team.id) === "notre-dame") && e.competitions[0].status.type.completed), "A new Notre Dame final requires new primary record evidence");
  }
}
for (const conf of snapshot.retainedBaseline.conferenceStandings) for (const r of conf.rows) { assert.equal(r.overall, records[r.team_slug]); assert.equal(`${r.w}-${r.l}`, conferenceRecords[r.team_slug]); }
// Official records are whole-team totals, independently corroborated. In
// particular LSU's FCS win must not disappear with the FBS-only UI filter.
assert.equal(records.lsu, "6-2");
for (const poll of JSON.parse(docs.get("rankings")).rankings.filter(p => ["1", "2"].includes(p.id))) {
  const saved = snapshot.polls.find(p => p.poll === (poll.id === "1" ? "ap" : "coaches"));
  assert.equal(poll.date.slice(0, 10), saved.release_date);
  const table = htmlTables(docs.get(poll.id === "1" ? "ap-ncaa" : "coaches")).find(t => t[0].includes(poll.id === "1" ? "SCHOOL" : "PTS"));
  assert.equal(table.length - 1, 25);
  poll.ranks.forEach((r, i) => { const s = saved.rankings[i], p = table[i + 1]; assert.equal(ids.get(r.team.id), s.team_slug); assert.equal(r.current, s.rank); assert.equal(r.points, s.points); assert.equal(r.recordSummary, s.record); assert.equal(Number(p[0].replace(/\D/g, "")), s.rank); assert.equal(Number(p[poll.id === "1" ? 2 : 3].replaceAll(",", "")), s.points); assert.equal(p[poll.id === "1" ? 3 : 2], s.record); });
}
assert.deepEqual(editorialComposite(snapshot.polls).rankings, snapshot.polls.find(p => p.poll === "composite").rankings);
for (const [id, column, category] of [["stat-passing", "Pass Yds", 0], ["stat-rushing", "Rush Yds", 1], ["stat-scoring", "PPG", 2], ["stat-defense", "Avg", 3]]) {
  const html = docs.get(id); assert.ok(htmlText(html).includes(snapshot.metrics.categories[category].through_games_label), "Statistical through-games date differs");
  const table = htmlTables(html)[0], header = table[0];
  snapshot.metrics.categories[category].rows.forEach((r, i) => { const s = table[i + 1]; assert.equal(s[header.indexOf("Name")] ?? s[header.indexOf("Team")], r.name); assert.equal(s[header.indexOf("Team")], r.team); assert.equal(Number(s[header.indexOf(column)]), r.value); });
}
assert.match(htmlText(docs.get("usc-preview")), /out indefinitely/);
assert.match(htmlText(docs.get("espn-week9")), /College GameDay Built by The Home Depot in Bloomington/);
const seasonAcceptance = verifyFullSeason(snapshot, fullSeason, ids, docs);
console.log(JSON.stringify({ fullSeason: seasonAcceptance, acceptance: "PASS", cutoff: evidence.cutoff_utc, checkedAt: new Date().toISOString(), finals: evidence.finals.length, pendingOrUpcoming: evidence.schedule.length, records: 138, primaryRecordRetrieval: { direct: 137, indexedDated: 1 }, daysFetched: "12/12", observations }));
