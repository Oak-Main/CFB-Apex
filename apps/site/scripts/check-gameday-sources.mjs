import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { htmlText, ncaaInventory } from "./gameday-source-validation.mjs";

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const snapshot = read("data/cfb-2026/refresh/verified-refresh.json");
if (["weekly-refresh-2026-10-28", "weekly-refresh-2026-10-29"].includes(snapshot.refresh_log.at(-1)?.script)) {
  await import("./check-oct28-sources.mjs");
  process.exit(0);
}
if (snapshot.refresh_log.at(-1)?.script === "week9-preparation-2026-10-25") {
  await import("./check-week9-sources.mjs");
  process.exit(0);
}
const entry = snapshot.refresh_log.findLast(row => row.evidence?.includes("week8-gameday-results"));
assert.ok(entry?.evidence, "Reviewed GameDay evidence required");
const evidence = read(entry.evidence);
assert.ok(evidence.raw_sources.every(row => Date.now() - Date.parse(row.checkedAt) < 7_200_000), "Source evidence exceeded two hours; genuinely refresh the candidate");
const observed = await Promise.all(evidence.raw_sources.map(async source => {
  const response = await fetch(source.requestedUrl, { signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200, source.id);
  const body = await response.text();
  return { id: source.id, url: response.url, checkedAt: new Date().toISOString(), sha256: createHash("sha256").update(body).digest("hex"), body };
}));
const docs = new Map(observed.map(row => [row.id, row]));
const events = [20, 21, 22, 23, 24].flatMap(day => JSON.parse(docs.get(`espn-${day}`).body).events);
assert.deepEqual(new Set(events.filter(event => event.competitions[0].status.type.completed).map(event => event.id)), new Set(evidence.finals.map(row => row.id)), "A changed final requires candidate reconciliation");
const ncaa = { initialGames: ncaaInventory(docs.get("ncaa-week8").body, 2026, 8) };
assert.equal(ncaa.initialGames.length, 56);
for (const row of evidence.finals) {
  const event = events.find(value => value.id === row.id);
  const competition = event.competitions[0];
  assert.equal(event.season.year, 2026);
  assert.equal(event.week.number, 8);
  assert.equal(competition.status.type.completed, true);
  assert.equal(competition.status.type.state, "post");
  assert.equal(competition.status.period, row.periods);
  assert.equal(Date.parse(event.date), Date.parse(row.espn_listed_kickoff_utc ?? row.kickoff_utc));
  for (const side of ["home", "away"]) {
    const team = competition.competitors.find(value => value.homeAway === side);
    assert.equal(Number(team.score), row[`${side}_score`]);
    assert.deepEqual(team.linescores.map(value => value.value), row[`${side}_lines`]);
  }
  const other = ncaa.initialGames.find(value => value.contestId === row.ncaa.contest_id);
  assert.ok(other);
  assert.equal(other.startTimeEpoch * 1000, Date.parse(row.ncaa_listed_kickoff_utc ?? row.kickoff_utc));
  if (other.gameState === "F") {
    assert.equal(other.teams.find(value => value.isHome).score, row.home_score);
    assert.equal(other.teams.find(value => !value.isHome).score, row.away_score);
  } else {
    assert.equal(row.corroborator.kind, "school", "Non-final NCAA observation requires independent official final corroboration");
    assert.ok(["I", "P"].includes(other.gameState));
  }
  if (row.corroborator.kind === "school") {
    const body = htmlText(docs.get(row.corroborator.id).body);
    if (row.id === "401856837") assert.match(body, /Completed Event:\s*Football versus No\. 14 Houston on October 24, 2026\s*,\s*Win\s*,\s*21\s*,?\s*to\s*,?\s*13/i);
    else if (row.id === "401864527") assert.match(body, /New Mexico Defeats North Dakota State,\s*21\s*[-–]\s*16/i);
    else assert.fail("Unreviewed school corroborator");
  }
}
const original = read("data/cfb-2026/refresh/evidence/2026-10-20-week8-release.json");
const ids = new Map(original.conferences.flatMap(row => row.rows).map(row => [row.id, row.slug]));
const standings = JSON.parse(docs.get("espn-standings").body);
const entries = standings.children.flatMap(row => row.standings?.entries ?? row.children?.flatMap(child => child.standings?.entries ?? []) ?? []);
const records = {}, conferenceRecords = {};
for (const row of entries) { const slug = ids.get(row.team.id); assert.ok(slug); const stat = type => row.stats.find(value => value.type === type); records[slug] = stat("total").summary; conferenceRecords[slug] = stat("vsconf").summary; }
assert.equal(Object.keys(records).length, 138);
assert.deepEqual(records, evidence.records);
assert.deepEqual(records, snapshot.teamRecords);
assert.deepEqual(conferenceRecords, evidence.conferenceRecords);
console.log(JSON.stringify({ acceptance: "PASS", checkedAt: new Date().toISOString(), finals: evidence.finals.length, records: 138, observations: observed.map(({ body: _body, ...row }) => row) }));
