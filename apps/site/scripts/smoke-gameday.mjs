import assert from "node:assert/strict";
import { withoutHtmlComments } from "./gameday-source-validation.mjs";
import { gameDaySnapshot } from "../lib/gameday-shared.ts";

const origin = process.env.GAMEDAY_SMOKE_ORIGIN ?? "https://cfbapex.com";
const expected = gameDaySnapshot(Date.now()), startedAt = new Date().toISOString(), deadline = Date.now() + 120_000;
let current, lastError;
// Existing release policy: at most two minutes for propagation, then fail.
for (let attempt = 0; attempt < 12 && Date.now() < deadline; attempt++) {
  try {
    const response = await fetch(`${origin}/api/gameday?release=${expected.revision}&attempt=${attempt}`, { signal: AbortSignal.timeout(Math.max(1, Math.min(10_000, deadline - Date.now()))) });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    const doc = await response.json();
    assert.equal(doc.revision, expected.revision);
    assert.equal(doc.season, expected.season);
    assert.equal(doc.selectedWeek, expected.selectedWeek);
    current = doc; break;
  } catch (error) { lastError = error; }
  if (attempt < 11 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, Math.min(10_000, deadline - Date.now())));
}
assert.ok(current, `Exact GameDay revision did not propagate: ${lastError?.message}`);
const observations = [];
for (const week of [8, 9]) {
  const response = await fetch(`${origin}/api/gameday?week=${week}&release=${expected.revision}`, { signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, 200); assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const age = response.headers.get("age"), serverDate = response.headers.get("date");
  assert.ok(age === null || Number(age) === 0, `Week ${week}: a no-store response has cached age`);
  assert.ok(serverDate && Math.abs(Date.now() - Date.parse(serverDate)) <= 300_000, `Week ${week}: HTTP Date is missing or stale`);
  const actual = await response.json(), wanted = gameDaySnapshot(Date.now(), String(week));
  assert.equal(actual.revision, wanted.revision); assert.equal(actual.season, 2026); assert.equal(actual.selectedWeek, week);
  for (const key of ["games", "previousFinals", "teams", "polls", "sourceDates"]) assert.deepEqual(actual[key], wanted[key], `${key}: Week ${week}`);
  const page = await fetch(`${origin}/gameday?week=${week}&release=${expected.revision}`, { signal: AbortSignal.timeout(10_000) });
  assert.equal(page.status, 200);
  // Assertion-only normalization: preserve script literals and remove parsed comment nodes.
  const html = withoutHtmlComments(await page.text());
  assert.ok(html.includes(`WEEK ${week}`)); assert.ok(html.includes(wanted.sourceDates.schedule));
  if (week === 9) { assert.equal(wanted.games.filter(g => g.status === "final").length, 6); assert.equal(wanted.games.filter(g => g.status === "scheduled").length, 50); }
  else assert.ok(wanted.games.every(g => g.status === "final"));
  observations.push({ week, games:actual.games.length, finals:actual.games.filter(g => g.status === "final").length, cacheControl:response.headers.get("cache-control"), cacheStatus:response.headers.get("cf-cache-status"), age, serverDate });
}
console.log(JSON.stringify({ acceptance:"PASS", origin, revision:expected.revision, season:expected.season, defaultWeek:current.selectedWeek, startedAt, checkedAt:new Date().toISOString(), observations }));
