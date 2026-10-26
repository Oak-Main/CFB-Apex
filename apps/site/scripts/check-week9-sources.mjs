import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { htmlTables, isSourceEvidenceFresh, ncaaInventory, schoolBlocks, sourceScheduleStatus, tvPattern } from "./gameday-source-validation.mjs";

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const snapshot = read("data/cfb-2026/refresh/verified-refresh.json"), entry = snapshot.refresh_log.at(-1);
assert.equal(entry.script, "week9-preparation-2026-10-25", "Unreviewed release contract");
const evidence = read(entry.evidence), required = ["ncaa8", "ncaa9", "standings", "rankings", "coaches", "ap-ncaa", ...[20, 21, 22, 23, 24, 27, 28, 29, 30, 31].map(day => `day-${day}`)];
const sources = required.map(id => { const row = evidence.raw_sources.find(row => row.id === id); assert.equal(row?.status, 200, id); return row; });
// Compare current authoritative responses even when the saved evidence has expired.
// Report those observations for reconciliation, then retain the same fail-closed gate.
const evidenceTimes = sources.map(row => row.checkedAt);
const docs = new Map(), observations = [];
async function fetchSource(row) {
  const response = await fetch(row.url, { signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200, row.id);
  const body = await response.text();
  observations.push({ id: row.id, url: response.url, checkedAt: new Date().toISOString(), sha256: createHash("sha256").update(body).digest("hex") });
  return body;
}
async function batches(rows, action) { for (let offset = 0; offset < rows.length; offset += 4) await Promise.all(rows.slice(offset, offset + 4).map(action)); }
await batches(sources, async row => docs.set(row.id, await fetchSource(row)));
const original = read("data/cfb-2026/refresh/evidence/2026-10-20-week8-release.json"), ids = new Map(original.conferences.flatMap(c => c.rows).map(r => [r.id, r.slug]));
for (const [week, days] of [[8, [20, 21, 22, 23, 24]], [9, [27, 28, 29, 30, 31]]]) {
  const events = days.flatMap(day => JSON.parse(docs.get(`day-${day}`)).events), ncaa = ncaaInventory(docs.get(`ncaa${week}`), 2026, week), rows = week === 8 ? evidence.finals : evidence.schedule;
  assert.equal(new Set(events.map(e => e.id)).size, events.length, "Duplicate provider event");
  assert.equal(ncaa.length, evidence.inventories[week].expected, "Official inventory changed");
  assert.deepEqual(new Set(events.map(e => e.id)), new Set(rows.map(r => r.id ?? r.provider_id)), "Omitted/new event requires reconciliation");
  const matched = new Set();
  for (const row of rows) {
    const event = events.find(e => e.id === (row.id ?? row.provider_id)), c = event.competitions[0], home = c.competitors.find(t => t.homeAway === "home"), away = c.competitors.find(t => t.homeAway === "away");
    assert.equal(event.season.year, 2026); assert.equal(event.week.number, week);
    assert.equal(ids.get(home.team.id), row.home); assert.equal(ids.get(away.team.id), row.away);
    for (const team of [home, away]) assert.equal(team.records.find(r => r.type === "total").summary, evidence.records[ids.get(team.team.id)], "Affected team record disagrees across scoreboard and standings");
    const n = ncaa.find(n => week === 8 ? row.source_urls.includes(`https://www.ncaa.com${n.url}`) : n.contestId === evidence.schoolEvidence.find(s => s.id === event.id).ncaa.contestId);
    assert.ok(n, "NCAA event identity changed"); assert.ok(!matched.has(n.contestId)); matched.add(n.contestId);
    if (week === 8) {
      assert.equal(c.status.type.completed, true); assert.equal(c.status.type.state, "post"); assert.equal(n.gameState, "F");
      const published = snapshot.playedGames.find(g => g.provider_id === event.id);
      assert.equal(published.game_id, row.game_id);
      for (const side of ["home", "away"]) {
        const team = side === "home" ? home : away, slug = ids.get(team.team.id), score = Number(team.score), lines = team.linescores.map(q => q.value);
        assert.equal(row.teams.find(t => t.slug === slug).points, score); assert.equal(published.teams.find(t => t.slug === slug).points, score);
        assert.equal(n.teams.find(t => t.isHome === (side === "home")).score, score);
        assert.deepEqual(lines, row.lineScore[slug]); assert.equal(lines.reduce((a, b) => a + b, 0), score);
      }
      assert.equal(c.status.period, published.meta.line_score[row.home].length);
      assert.equal(Date.parse(event.date), Date.parse(row.listed_times.espn));
      assert.equal(n.startTimeEpoch * 1000, Date.parse(row.listed_times.ncaa)); assert.equal(row.listed_times.actual_start, null);
    } else {
      assert.equal(c.status.type.completed, false); assert.equal(n.gameState, "P");
      const status = sourceScheduleStatus(c.status.type.name);
      assert.equal(row.game_status, status); assert.equal(row.neutral_site, c.neutralSite === true); assert.equal(row.site, c.venue?.fullName ?? null);
      assert.equal(Date.parse(event.date), Date.parse(row.announced_kickoff_utc));
      if (row.kickoff_utc) {
        assert.equal(c.timeValid, true);
        if (n.hasStartTime) assert.equal(n.startTimeEpoch * 1000, Date.parse(row.kickoff_utc));
        else assert.equal(row.kickoff_confirmation?.kind, "school", "An absent NCAA time requires official-school confirmation");
      }
      else { assert.equal(row.kickoff_status, "official_tbd"); assert.ok(!n.hasStartTime, "Previously unknown NCAA kickoff was announced; reconcile the hold"); }
      if (row.tv) assert.ok(c.broadcasts.flatMap(b => b.names).includes(row.tv), "Provider TV listing changed");
      assert.ok(!("homeScore" in row) && !("awayScore" in row));
      assert.deepEqual(row, snapshot.scheduledGames.find(g => g.provider_id === event.id));
    }
  }
  assert.equal(matched.size, ncaa.length, "An official event was omitted");
}
const entries = JSON.parse(docs.get("standings")).children.flatMap(c => c.standings?.entries ?? c.children?.flatMap(x => x.standings?.entries ?? []) ?? []), records = {}, conferenceRecords = {};
for (const row of entries) { const slug = ids.get(row.team.id); assert.ok(slug); records[slug] = row.stats.find(x => x.type === "total").summary; conferenceRecords[slug] = row.stats.find(x => x.type === "vsconf").summary; }
assert.equal(Object.keys(records).length, ids.size); assert.deepEqual(records, evidence.records); assert.deepEqual(records, snapshot.teamRecords); assert.deepEqual(conferenceRecords, evidence.conferenceRecords);
for (const conference of snapshot.retainedBaseline.conferenceStandings) for (const row of conference.rows) { assert.equal(row.overall, records[row.team_slug]); assert.equal(`${row.w}-${row.l}`, conferenceRecords[row.team_slug]); }
const polls = JSON.parse(docs.get("rankings")).rankings.filter(p => ["1", "2"].includes(p.id));
for (const p of polls) {
  const saved = snapshot.polls.find(row => row.poll === (p.id === "1" ? "ap" : "coaches"));
  assert.equal(p.date.slice(0, 10), saved.release_date, "A newer poll requires reconciliation");
  const table = htmlTables(docs.get(p.id === "1" ? "ap-ncaa" : "coaches")).find(t => t[0].includes(p.id === "1" ? "SCHOOL" : "PTS"));
  assert.equal(table.length - 1, saved.rankings.length);
  p.ranks.forEach((r, i) => { const row = saved.rankings[i], official = table[i + 1]; assert.equal(ids.get(r.team.id), row.team_slug); assert.equal(r.current, row.rank); assert.equal(r.points, row.points); assert.equal(r.recordSummary, row.record); assert.equal(Number(official[0].replace(/\D/g, "")), row.rank); assert.equal(Number(official[p.id === "1" ? 2 : 3].replaceAll(",", "")), row.points); assert.equal(official[p.id === "1" ? 3 : 2], row.record); });
}
assert.match(docs.get("coaches"), /Published October 25, 2026/);
await batches(evidence.schoolEvidence.filter(row => row.publishedTV || row.kickoffConfirmation), async row => {
  evidenceTimes.push(row.school.checkedAt);
  const body = await fetchSource({ id: `school-${row.home}`, url: row.school.resolvedUrl }), event = evidence.schedule.find(g => g.provider_id === row.id), source = JSON.parse(docs.get(`day-${Number(event.date.slice(-2))}`)).events.find(g => g.id === row.id), away = source.competitions[0].competitors.find(t => t.homeAway === "away").team;
  const blocks = schoolBlocks(body, event.date.slice(-2), [away.location, away.shortDisplayName, away.abbreviation].filter(Boolean));
  if (row.publishedTV) assert.ok(blocks.some(block => tvPattern(row.publishedTV).test(block)), `Official TV confirmation changed: ${row.home}`);
  if (row.kickoffConfirmation) {
    const proof = row.kickoffConfirmation;
    evidenceTimes.push(proof.checkedAt);
    assert.deepEqual(proof, event.kickoff_confirmation);
    assert.ok(blocks.some(block => new RegExp(proof.pattern, "i").test(block)), `School kickoff changed: ${row.home}`);
    const literal = proof.observed_text.replaceAll(".", "").match(/(\d{1,2})(?::(\d{2}))?\s*([ap])m/i);
    assert.ok(literal);
    const parts = new Intl.DateTimeFormat("en-US", { timeZone:proof.timezone, hourCycle:"h23", hour:"2-digit", minute:"2-digit", year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(new Date(event.kickoff_utc));
    const part = type => parts.find(p => p.type === type).value;
    assert.equal(+part("hour"), +literal[1] % 12 + (literal[3].toLowerCase() === "p" ? 12 : 0));
    assert.equal(+part("minute"), +(literal[2] ?? 0)); assert.equal(`${part("year")}-${part("month")}-${part("day")}`, event.date);
  }
});
const evidenceFresh = evidenceTimes.every(checkedAt => isSourceEvidenceFresh(checkedAt, Date.now()));
console.log(JSON.stringify({ acceptance: evidenceFresh ? "PASS" : "BLOCKED_STALE_EVIDENCE", sourceComparison: "PASS", checkedAt: new Date().toISOString(), inventories: evidence.inventories, counts: evidence.counts, observations }));
assert.ok(evidenceFresh, "Source evidence exceeded two hours; reconcile a genuinely fresh candidate");
