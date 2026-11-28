import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setTimeout as wait } from "node:timers/promises";
import { isSourceEvidenceFresh, ncaaInventory } from "./gameday-source-validation.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const snapshot = read("data/cfb-2026/refresh/verified-refresh.json");
const evidence = read("data/cfb-2026/refresh/evidence/2026-11-27-friday-finals.json");
const targetIds = ["2026-11-27-nebraska-at-iowa", "2026-11-27-mississippi-state-at-ole-miss"];
const sources = [evidence.espn, evidence.ncaa];
const gateStarted = Date.now();
for (const source of sources) {
  assert.equal(source.status, 200, source.url);
  assert.match(source.sha256, /^[a-f0-9]{64}$/, source.url);
  assert.ok(Number.isSafeInteger(source.bytes) && source.bytes > 0, source.url);
  assert.ok(isSourceEvidenceFresh(source.checkedAt, gateStarted), `${source.url}: invalid, future or expired capture time`);
}
assert.equal(Date.parse(evidence.checkedAt), Math.max(...sources.map((source) => Date.parse(source.checkedAt))), "Results date must match the latest verified capture");
assert.deepEqual(evidence.finals.map((row) => row.gameId), targetIds);
assert.deepEqual(snapshot.playedGames.filter((row) => row.week === 13).map((row) => row.game_id), targetIds);
const week = snapshot.board_weeks.find((row) => row.week === 13);
assert.equal(week?.results_partial, true);
assert.equal(week.results_verified_at, evidence.checkedAt);
assert.equal(snapshot.results_verified_at, evidence.checkedAt);
const partialRecords = snapshot.team_records_review?.partial_update;
assert.equal(partialRecords?.as_of, evidence.espn.checkedAt);
assert.equal(partialRecords.source_url, evidence.espn.url);
assert.deepEqual(partialRecords.records, Object.fromEntries(evidence.finals.flatMap((final) =>
  final.teams.map((team) => [team.slug, team.record]))));

async function fetchRecent(source) {
  let response;
  let body;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch(source.url, {
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 CFB-Apex-verification/1.0",
          accept: "text/html,application/json;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(30_000),
      });
      assert.equal(response.status, 200, source.url);
      body = await response.text();
      break;
    } catch (error) {
      if (attempt === 2) throw error;
      await wait((attempt + 1) * 2_000);
    }
  }
  const now = Date.now();
  assert.ok(isSourceEvidenceFresh(source.checkedAt, now), `${source.url}: capture exceeded two hours`);
  const age = Number(response.headers.get("age") ?? 0);
  const date = Date.parse(response.headers.get("date") ?? "");
  assert.ok(Number.isFinite(age) && age >= 0 && age < 7200, `${source.url}: response Age exceeded two hours`);
  assert.ok(date <= now + 60_000 && date > now - 7_200_000, `${source.url}: stale or missing HTTP Date`);
  return body;
}

const [provider, official] = await Promise.all(sources.map(fetchRecent));
const espn = JSON.parse(provider).events;
const ncaa = ncaaInventory(official, 2026, 13);
for (const final of evidence.finals) {
  const event = espn.find((row) => row.id === final.providerId);
  const competition = event?.competitions[0];
  assert.equal(competition?.status.type.state, "post", final.gameId);
  assert.equal(competition.status.type.completed, true, final.gameId);
  const kickoff = Date.parse(event.date);
  assert.ok(Number.isFinite(kickoff), final.gameId);
  assert.equal(kickoff, Date.parse(final.espnKickoff), final.gameId);
  assert.ok(competition.broadcasts.some((row) => row.names.includes(final.network)), final.gameId);
  const contest = ncaa.find((row) => row.contestId === final.ncaaId);
  assert.equal(contest?.gameState, "F", final.gameId);
  assert.equal(contest.startTimeEpoch * 1000, Date.parse(final.scheduledKickoff), final.gameId);
  const published = snapshot.playedGames.find((row) => row.game_id === final.gameId);
  assert.ok(published, final.gameId);
  assert.equal(published.provider_id, final.providerId);
  assert.equal(published.kickoff_utc, final.scheduledKickoff);
  assert.equal(published.tv, final.network);
  assert.equal(published.source_url, final.officialRecap);
  assert.equal(published.verified_at, evidence.checkedAt);
  assert.ok(!snapshot.scheduledGames.some((row) => row.provider_id === final.providerId), final.gameId);
  for (const team of final.teams) {
    const primary = competition.competitors.find((row) => row.homeAway === team.side);
    const corroboration = contest.teams.find((row) => row.isHome === (team.side === "home"));
    assert.equal(primary?.team.id, team.espnId, final.gameId);
    assert.equal(corroboration?.seoname, team.ncaaSlug, final.gameId);
    assert.match(team.record, /^\d+-\d+$/, team.slug);
    assert.equal(primary.records.find((row) => row.type === "total")?.summary, team.record, team.slug);
    assert.equal(Number(primary.score), team.score, final.gameId);
    assert.equal(corroboration.score, team.score, final.gameId);
    assert.deepEqual(primary.linescores.map((row) => row.value), team.periods, final.gameId);
    assert.equal(team.periods.reduce((sum, score) => sum + score, 0), team.score, final.gameId);
    assert.equal(published[`${team.side}_slug`], team.slug, final.gameId);
    assert.equal(published.teams.find((row) => row.slug === team.slug)?.points, team.score, final.gameId);
    assert.deepEqual(published.meta.line_score[team.slug], team.periods, final.gameId);
  }
}
console.log(JSON.stringify({ acceptance: "PASS", scope: "Two Week 13 Friday finals", gameIds: targetIds, checkedAt: new Date().toISOString() }));
