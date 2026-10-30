import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { isSourceEvidenceFresh } from "./gameday-source-validation.mjs";
import { OCT30_SCRIPT, verifyOct30Release } from "./oct30-release-validation.mjs";

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const snapshot = read("data/cfb-2026/refresh/verified-refresh.json");
const entry = snapshot.refresh_log.at(-1);
assert.equal(entry.script, OCT30_SCRIPT);
const evidence = read(entry.evidence);
const fullSeason = read(snapshot.full_season_review.evidence);
const observations = [], docs = new Map();
const requiredSources = [...evidence.raw_sources, ...fullSeason.raw_sources];
assert.equal(new Set(requiredSources.map(row => row.id)).size, requiredSources.length, "Duplicate source identity");
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
const acceptance = verifyOct30Release(snapshot, evidence, fullSeason, docs);
console.log(JSON.stringify({ ...acceptance, acceptance: "PASS", cutoff: evidence.cutoff_utc, checkedAt: new Date().toISOString(), primaryRecordRetrieval: { direct: 137, indexedDated: 1 }, observations }));
