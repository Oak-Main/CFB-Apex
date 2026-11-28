import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isSourceEvidenceFresh, ncaaInventory } from "./gameday-source-validation.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const snapshot = read("data/cfb-2026/refresh/verified-refresh.json");
const evidence = read("data/cfb-2026/refresh/evidence/2026-11-27-friday-finals.json");
const targetIds = ["2026-11-27-nebraska-at-iowa", "2026-11-27-mississippi-state-at-ole-miss"];
assert.deepEqual(evidence.finals.map((row) => row.gameId), targetIds);
assert.deepEqual(snapshot.playedGames.filter((row) => row.week === 13).map((row) => row.game_id), targetIds);
assert.equal(snapshot.board_weeks.find((row) => row.week === 13)?.results_partial, true);
assert.equal(snapshot.results_verified_at, evidence.checkedAt);

async function fetchRecent(source) {
  assert.ok(isSourceEvidenceFresh(source.checkedAt, Date.now()), `${source.url}: capture exceeded two hours`);
  const response = await fetch(source.url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 CFB-Apex-verification/1.0",
      accept: "text/html,application/json;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(response.status, 200, source.url);
  const age = Number(response.headers.get("age") ?? 0);
  const date = Date.parse(response.headers.get("date") ?? "");
  assert.ok(Number.isFinite(age) && age >= 0 && age < 7200, `${source.url}: response Age exceeded two hours`);
  assert.ok(date <= Date.now() + 60_000 && date > Date.now() - 7_200_000, `${source.url}: stale or missing HTTP Date`);
  return response;
}

const [provider, official] = await Promise.all([fetchRecent(evidence.espn), fetchRecent(evidence.ncaa)]);
const espn = (await provider.json()).events;
const ncaa = ncaaInventory(await official.text(), 2026, 13);
for (const final of evidence.finals) {
  const event = espn.find((row) => row.id === final.providerId);
  const competition = event?.competitions[0];
  assert.equal(competition?.status.type.state, "post", final.gameId);
  assert.equal(competition.status.type.completed, true, final.gameId);
  assert.equal(event.date, final.espnKickoff, final.gameId);
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
  assert.ok(!snapshot.scheduledGames.some((row) => row.provider_id === final.providerId), final.gameId);
  for (const team of final.teams) {
    const primary = competition.competitors.find((row) => row.homeAway === team.side);
    const corroboration = contest.teams.find((row) => row.isHome === (team.side === "home"));
    assert.equal(primary?.team.id, team.espnId, final.gameId);
    assert.equal(corroboration?.seoname, team.ncaaSlug, final.gameId);
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
