import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isCurrentEspnInjury, editorialResearchIsHistorical } from "../lib/injury-freshness.mjs";
import { parseEspnInjuryFeed, mergeValidatedEspnInjuries, espnInjuryCachePolicy } from "../lib/espn-injuries.ts";
import { espnInjuries, espnWatchEntries, injuryResearch, officialAvailability, officialAvailabilityFor } from "../lib/injury-report.ts";
import { boardWeeks, fantasyNotesAsOf, verifiedRefresh, games } from "../lib/cfb-dataset.ts";
const NOW = Date.parse("2026-10-10T14:31:21Z");

test("ESPN row-age checks reject old, undated, invalid, and future claims", () => {
  for (const date of ["2020-11-21", "2026-09-20", null, "bad", "2026-02-30", "2026-10-11"]) assert.equal(isCurrentEspnInjury(date, NOW), false, String(date));
  assert.equal(isCurrentEspnInjury("2026-10-09T12:00:00Z", NOW), true);
  assert.ok(!espnInjuries.some((row) => row.player === "Kahleil Jackson"));
  assert.ok(!espnWatchEntries().some((row) => row.player === "Kahleil Jackson"));
  assert.equal(editorialResearchIsHistorical("2026-10-05", NOW), true);
  assert.equal(editorialResearchIsHistorical("2026-10-10", NOW), false);
});

test("ESPN parsing preserves unknown source time and never guesses a status", () => {
  const row = { status: "Out", date: "2026-10-09", athlete: { displayName: "Example Player" } };
  const doc = { injuries: [{ displayName: "Florida Gators", injuries: [row, { ...row, date: "2020-11-21" }, { ...row, date: undefined }, { ...row, status: "Unspecified" }] }] };
  const parsed = parseEspnInjuryFeed(doc, new Map([["florida gators", "florida"]]), NOW);
  assert.equal(parsed.asOf, null);
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0].asOf, "2026-10-09");
  assert.equal(parsed.excludedCount, 3);
  assert.throws(() => parseEspnInjuryFeed({}, new Map(), NOW));
});

test("official overlay has 39 tracked players plus 48 changed players with dated literal statuses", () => {
  assert.equal(officialAvailability?.entries.length, 87);
  assert.equal(new Set(officialAvailability?.entries.map((row) => row.team_slug)).size, 19);
  assert.equal(officialAvailabilityFor("Jayden Gibson", "south-carolina")?.status, "Exempt");
  assert.equal(officialAvailabilityFor("Jayden Gibson", "oklahoma"), null);
  assert.equal(officialAvailabilityFor("Zahir Mathis", "maryland")?.status, "Out");
  assert.equal(officialAvailabilityFor("Jamarion Morrow", "texas-am")?.status, "Available");
  assert.equal(officialAvailabilityFor("Trell Harris", "oklahoma")?.status, "Out");
  assert.equal(officialAvailabilityFor("Andre Clarke Jr.", "kentucky")?.status, "Exempt");
  assert.equal(officialAvailabilityFor("Mario Craver", "texas-am")?.status, "Game Time Decision");
  assert.equal(officialAvailabilityFor("Wyatt Young", "oklahoma-state")?.status, "Game Time Decision");
  assert.equal(officialAvailabilityFor("Dante Moore", "oregon")?.report_type, "Update 2");
  assert.equal(officialAvailabilityFor("Jamarion Morrow", "texas-am")?.report_type, "Game Day");
  assert.equal(officialAvailabilityFor("Not Listed", "alabama"), null);
  for (const row of officialAvailability?.entries ?? []) {
    assert.equal(row.game_date, "2026-10-10");
    assert.ok(Date.parse(row.published_at) <= Date.parse(row.retrieved_at));
    assert.ok(row.source_url.startsWith("https://"));
  }
});

test("historical cutoffs and long-term classifications are preserved, corrected identities are not duplicated", () => {
  assert.equal(injuryResearch.asOf, "2026-10-05");
  assert.equal(fantasyNotesAsOf, "2026-09-07");
  // Week 6 keeps its base snapshot time; the Week 7 release carries its own.
  assert.equal(boardWeeks.find((row) => row.week === 6)?.retrieved_at, "2026-10-05T07:24:21.400874Z");
  assert.equal(verifiedRefresh?.retrieved_at, "2026-10-11T10:30:00Z");
  assert.equal(verifiedRefresh?.metrics.through_games, "2026-10-03");
  assert.equal(injuryResearch.ledger.find((row) => row.player === "Mason Heintschel")?.status, "IR");
  assert.equal(injuryResearch.ledger.find((row) => row.player === "Zahir Mathis")?.teamSlug, "maryland");
  assert.ok(!injuryResearch.watch.some((row) => row.player === "Tre Harris" || row.player === "Jamariun Morrow"));
  // The final keeps the pregame slot/announced-kickoff history beside its result.
  const ndsu = (verifiedRefresh?.playedGames as Array<{ provider_id?: string; kickoff_utc?: string; meta?: { pregame_timing_note?: string } }> | undefined)?.find((row) => row.provider_id === "401864518");
  assert.equal(ndsu?.kickoff_utc, "2026-10-10T23:00Z");
  assert.match(ndsu?.meta?.pregame_timing_note ?? "", /7:00 PM ET.*7:10 PM ET/);
  const ndsuGame = games.find((row) => row.id === "2026-10-10-north-dakota-state-at-unlv");
  assert.equal(ndsuGame?.status, "final");
  assert.equal(`${ndsuGame?.awayScore}-${ndsuGame?.homeScore}`, "7-13");
});

test("ingestion accepts the out designation already present in the historical research", () => {
  const script = readFileSync(new URL("../scripts/ingest-injury-research.mjs", import.meta.url), "utf8");
  const declaration = script.match(/const LIKELIHOODS = new Set\((\[[^;]+\])\);/)?.[1];
  assert.ok(declaration);
  assert.ok((JSON.parse(declaration) as string[]).includes("out"));
});


test("empty and invalid ESPN responses retain only still-valid last-known rows", () => {
  const prior = [{ player: "Prior Player", teamSlug: "florida", position: "WR", status: "IR" as const, detail: null, asOf: "2026-10-09" }];
  assert.deepEqual(mergeValidatedEspnInjuries(prior, [], NOW), prior);
  const stale = { ...prior[0], asOf: "2020-11-21" };
  assert.deepEqual(mergeValidatedEspnInjuries([stale], [], NOW), []);
  assert.deepEqual(mergeValidatedEspnInjuries(prior, [stale], NOW), prior);
  const active = { ...prior[0], status: "ACTIVE" as const, asOf: "2026-10-10" };
  assert.deepEqual(mergeValidatedEspnInjuries(prior, [active], NOW), [active]);
  const parsed = parseEspnInjuryFeed({ injuries: [null, { displayName: "Florida Gators", injuries: [null] }] }, new Map([["florida gators", "florida"]]), NOW);
  assert.deepEqual(parsed.entries, []);
  assert.equal(parsed.excludedCount, 2);
});

test("mobile injury tables explicitly override the generic unlabeled card transform", () => {
  const css = readFileSync(new URL("../app/data-boards.css", import.meta.url), "utf8");
  assert.match(css, /\.inj-page \.db-table-wrap\s*\{[^}]*max-width: 100%;[^}]*overflow-x: auto;/);
  assert.match(css, /\.inj-page \.inj-table thead\s*\{[^}]*display: table-header-group;[^}]*clip: auto;[^}]*clip-path: none;/);
  assert.match(css, /\.inj-page \.inj-table tbody\s*\{[^}]*display: table-row-group;/);
  assert.match(css, /\.inj-page \.inj-table td\s*\{[^}]*display: table-cell;/);
  assert.match(css, /\.inj-page \.inj-table td::before\s*\{[^}]*content: none;/);
});


test("degraded injury responses retry after one minute and are never browser cached", () => {
  const failed = espnInjuryCachePolicy(true);
  const healthy = espnInjuryCachePolicy(false);
  assert.deepEqual(failed, { ttlMs: 60_000, cacheControl: "no-store" });
  assert.deepEqual(healthy, { ttlMs: 600_000, cacheControl: "public, max-age=300" });
  assert.ok(59_999 < failed.ttlMs);
  assert.ok(!(60_000 < failed.ttlMs), "degraded fetch is retried at the one-minute boundary");
  assert.ok(60_000 < healthy.ttlMs, "healthy data keeps the existing ten-minute isolate TTL");
  const route = readFileSync(new URL("../app/api/injuries/route.ts", import.meta.url), "utf8");
  assert.match(route, /nowMs - cache.at < espnInjuryCachePolicy\(cache.feed.degraded\).ttlMs/);
  assert.equal(route.match(/return injuryResponse\(feed\);/g)?.length, 2, "cache-hit and fresh/fallback responses share the same policy");
  assert.match(route, /"Cache-Control": espnInjuryCachePolicy\(feed.degraded\).cacheControl/);
});
