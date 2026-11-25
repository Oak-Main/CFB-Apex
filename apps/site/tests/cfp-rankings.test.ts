import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { pollTables, teams } from "../lib/cfb-dataset.ts";
import { cfpPollTable, cfpRankings } from "../lib/cfp-rankings.ts";
import { buildEdition, checkTrends, impliedPreviousRank, parseCapture, previousRank } from "../scripts/build-cfp-rankings.mjs";

const doc = JSON.parse(readFileSync(new URL("../data/cfb-2026/cfp/selection-committee-rankings.json", import.meta.url), "utf8"));
const latest = doc.editions[0];

test("the site reads the latest committee edition on file, row for row", () => {
  assert.equal(doc.source, "https://collegefootballplayoff.com/rankings");
  const dates: string[] = doc.editions.map((row: { release_date: string }) => row.release_date);
  assert.deepEqual(dates, [...dates].sort().reverse(), "editions newest first");
  assert.equal(cfpRankings.release_date, latest.release_date);
  assert.equal(cfpRankings.retrieved_at, latest.receipt.retrieved_at);
  assert.deepEqual(
    cfpRankings.rankings.map((row) => [row.rank, row.team, row.team_slug, row.record]),
    latest.rankings.map((row: { rank: number; team: string; team_slug: string; record: string }) => [row.rank, row.team, row.team_slug, row.record]),
  );
});

test("every edition is 25 distinct site teams in rank order with a receipt", () => {
  const slugs = new Set(teams.map((team) => team.slug));
  for (const edition of doc.editions) {
    assert.match(edition.release_date, /^2026-(11|12)-\d\d$/);
    assert.equal(new Date(`${edition.release_date}T12:00:00Z`).getUTCDay(), edition.release_date === "2026-12-06" ? 0 : 2, "the committee releases on Tuesdays, and on Selection Day");
    assert.equal(edition.rankings.length, 25);
    edition.rankings.forEach((row: { rank: number; team_slug: string; record: string }, index: number) => {
      assert.equal(row.rank, index + 1);
      assert.ok(slugs.has(row.team_slug), row.team_slug);
      assert.match(row.record, /^\d{1,2}-\d{1,2}$/);
    });
    assert.equal(new Set(edition.rankings.map((row: { team_slug: string }) => row.team_slug)).size, 25);
    assert.equal(edition.receipt.url, doc.source);
    assert.match(edition.receipt.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Date.parse(edition.receipt.retrieved_at) >= Date.parse(`${edition.release_date}T00:00:00Z`), "retrieved on or after the release date");
  }
});

test("previous ranks come from the prior edition on file and agree with the source's trend markers", () => {
  const previous = doc.editions[1];
  if (previous) checkTrends(latest, previous);
  for (const row of latest.rankings) {
    const shown = cfpPollTable.rankings.find((entry) => entry.team_slug === row.team_slug);
    assert.equal(shown?.previous_rank ?? null, previousRank(row, previous), row.team_slug);
  }
  if (previous) {
    const before = new Set(previous.rankings.map((entry: { team_slug: string }) => entry.team_slug));
    const entered = cfpPollTable.rankings.filter((entry) => entry.previous_rank === null).map((entry) => entry.team_slug);
    assert.deepEqual(entered, latest.rankings.filter((row: { team_slug: string }) => !before.has(row.team_slug)).map((row: { team_slug: string }) => row.team_slug));
    assert.equal(entered.length, previous.rankings.filter((row: { team_slug: string }) => !latest.rankings.some((entry: { team_slug: string }) => entry.team_slug === row.team_slug)).length, "as many teams entered as left");
  }
});

test("the committee table publishes no points or votes and stays out of the poll bundle", () => {
  assert.equal(cfpPollTable.poll, "cfp");
  assert.equal(cfpPollTable.name, "CFP Selection Committee Rankings");
  assert.ok(cfpPollTable.rankings.every((row) => row.points === null && row.first_place_votes === null && row.tied === false));
  assert.deepEqual(cfpPollTable.others, []);
  assert.ok(pollTables.every((poll) => poll.poll !== "cfp"));
});

test("the capture parser reads the selected edition and refuses a short table", () => {
  const row = (rank: number, team: string, record: string, trend: string) =>
    `<span class="x text-center">${rank}</span><img alt="${team}"><span class="y font-bold">${record}</span><span aria-label="Trend: ${trend}" role="img"></span>`;
  const html = `<button aria-pressed="true">Nov. 24</button><button aria-pressed="false">Nov. 17</button><h2>Full Rankings</h2>${row(1, "Georgia", "10-1", "no change")}${row(2, "Texas A&amp;M", "9-2", "up 3")}<h2>Related News</h2>`;
  const parsed = parseCapture(html);
  assert.equal(parsed.release_date, "2026-11-24");
  assert.deepEqual(parsed.rows, [
    { rank: 1, team: "Georgia", record: "10-1", trend: "no change" },
    { rank: 2, team: "Texas A&M", record: "9-2", trend: "up 3" },
  ]);
  assert.throws(() => buildEdition(parsed, new Set(["georgia", "texas-am"])), /25 teams/);
  assert.equal(impliedPreviousRank({ rank: 2, source_trend: "up 3" }), 5);
  assert.equal(impliedPreviousRank({ rank: 9, source_trend: "down 4" }), 5);
  assert.equal(impliedPreviousRank({ rank: 7, source_trend: "no change" }), 7);
});
