import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { boardWeeks, games, getGame, pollTables, verifiedRefresh } from "../lib/cfb-dataset.ts";
import { easternDate } from "../lib/game-calendar.ts";
import { gameDaySnapshot, reviewedWeekContractViolation } from "../lib/gameday-shared.ts";
import { clockWeek, parseWeekParam, selectBoardWeek } from "../lib/week-cutover.ts";

const read = (path: string) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const evidence = read("data/cfb-2026/refresh/evidence/2026-11-15-week11-refresh.json");
const raw = read("data/cfb-2026/refresh/verified-refresh.json");
const hosts = read("data/cfb-2026/refresh/official-school-hosts.json").hosts as Record<string, string>;
// A fixed clock after the Week 12 cutover; no test here reads today's date.
const now = Date.parse("2026-11-16T14:00:00Z");

test("Week 12 becomes the default at 14:00Z on November 15 and Week 11 stays an explicit archive", () => {
  const week12 = boardWeeks.find((row) => row.week === 12);
  assert.deepEqual(
    { start: week12?.start, end: week12?.end, label: week12?.label, cutover: week12?.cutover_utc },
    { start: "2026-11-16", end: "2026-11-22", label: "Nov 17–21", cutover: "2026-11-15T14:00:00Z" },
  );
  assert.equal(week12?.results_verified_at, undefined, "a preview week carries no results date");
  assert.equal(gameDaySnapshot(Date.parse("2026-11-15T13:59:59Z")).selectedWeek, 11);
  assert.equal(gameDaySnapshot(Date.parse("2026-11-15T14:00:00Z")).selectedWeek, 12);
  assert.equal(gameDaySnapshot(now).selectedWeek, 12);
  assert.equal(gameDaySnapshot(now).explicit, false);
  const archive = gameDaySnapshot(now, "11");
  assert.equal(archive.selectedWeek, 11);
  assert.ok(archive.explicit);
  const weeks = gameDaySnapshot(now).weeks;
  assert.equal(clockWeek(weeks, { week: 11, serverNow: now, explicit: true }), 12);
  assert.equal(clockWeek(weeks, selectBoardWeek(weeks, Date.parse("2026-11-15T13:59:59Z"))), 11);
  assert.equal(parseWeekParam("12", weeks), 12);
  assert.equal(parseWeekParam("13", weeks), null);
  assert.equal(verifiedRefresh?.week, 12);
});

test("all 67 Week 11 games are verified finals with stable ids, scores and quarter sums", () => {
  const archive = gameDaySnapshot(now, "11");
  assert.equal(archive.games.length, 67);
  assert.equal(evidence.finals.length, 67);
  assert.equal(reviewedWeekContractViolation(11, archive.weeks.find((row) => row.week === 11), archive.games), null);
  for (const row of evidence.finals) {
    const game = games.find((g) => g.id === row.game_id);
    assert.ok(game, row.game_id);
    assert.equal(game.week, 11);
    assert.equal(game.status, "final");
    assert.equal(easternDate(game.date), row.date);
    assert.equal(game.venue, row.site);
    for (const team of row.teams) {
      assert.equal(game[team.slug === row.home_slug ? "homeScore" : "awayScore"], team.points);
      assert.equal(row.meta.line_score[team.slug].reduce((a: number, b: number) => a + b, 0), team.points, `${row.game_id} quarter sum`);
    }
    assert.equal(row.meta.reviewed_status.espn.completed, true);
    assert.equal(row.meta.reviewed_status.ncaa, "F");
  }
  assert.equal(raw.scheduledGames.filter((row: { week: number }) => row.week === 11).length, 0);
  assert.equal(raw.playedGames.filter((row: { week: number }) => row.week === 11).length, 67);
});

test("Ole Miss at Oklahoma keeps its published id after moving to Sunday, November 15", () => {
  const game = getGame("2026-11-14-ole-miss-at-oklahoma");
  assert.equal(game?.status, "final");
  assert.equal(game?.date, "2026-11-15T18:00Z");
  assert.equal(easternDate(game?.date ?? ""), "2026-11-15");
  assert.equal(`${game?.awayScore}-${game?.homeScore}`, "17-24");
  const row = raw.playedGames.find((g: { provider_id: string }) => g.provider_id === "401856887");
  assert.equal(row.game_id, "2026-11-14-ole-miss-at-oklahoma");
  assert.equal(row.date, "2026-11-15");
  assert.equal(row.meta.originally_scheduled_kickoff_utc, "2026-11-14T21:15Z");
  assert.deepEqual(row.corroborator, { kind: "school", id: "school-oklahoma" });
  const receipt = evidence.school_corroborations.find((c: { provider_id: string }) => c.provider_id === "401856887");
  assert.equal(new URL(receipt.url).hostname, hosts.oklahoma);
  assert.match(receipt.observed_text, /Ole Miss on November 15, 2026/);
  assert.ok(!games.some((g) => g.id === "2026-11-15-ole-miss-at-oklahoma"), "no second id for the same event");
});

test("the Week 12 slate is 66 FBS-vs-FBS fixtures with four FCS games outside the board", () => {
  const preview = gameDaySnapshot(now, "12");
  assert.equal(preview.games.length, 66);
  assert.ok(preview.games.every((g) => g.status === "scheduled" && g.homeScore === null && g.awayScore === null));
  assert.equal(reviewedWeekContractViolation(12, preview.weeks.find((row) => row.week === 12), preview.games), null);
  assert.equal(preview.sourceDates.results, null);
  assert.equal(preview.sourceDates.previousResults, gameDaySnapshot(now, "11").sourceDates.results);
  const perDay: Record<string, number> = {};
  for (const g of preview.games) perDay[easternDate(g.date)] = (perDay[easternDate(g.date)] ?? 0) + 1;
  assert.deepEqual(Object.keys(perDay).sort(), ["2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"]);
  assert.equal(evidence.excluded_upcoming.length, 4);
  const fbsConferenceIds = ["1", "4", "5", "8", "9", "12", "15", "17", "18", "37", "151"];
  for (const row of evidence.excluded_upcoming) {
    const fcsSide = row.home_slug ? "away" : "home";
    assert.ok(!fbsConferenceIds.includes(String(row.espn_conference_ids[fcsSide])), `${row.name} carries FCS conference-id evidence`);
    assert.ok(!preview.games.some((g) => [g.homeTeamId, g.awayTeamId].includes(row.home_slug ?? row.away_slug) && easternDate(g.date) === row.date), `${row.name} stays off the board`);
  }
  const marquee = boardWeeks.find((row) => row.week === 12)?.marquee_game_id;
  assert.ok(preview.games.some((g) => g.id === marquee), "marquee is a Week 12 fixture");
});

test("kickoff disagreements are settled only by the host school's official schedule", () => {
  const settled = raw.scheduledGames.filter((row: { kickoff_settlement?: unknown }) => row.kickoff_settlement);
  assert.deepEqual(settled.map((row: { provider_id: string }) => row.provider_id).sort(), ["401864545", "401866465", "401866469"]);
  for (const row of settled) {
    const s = row.kickoff_settlement;
    assert.equal(s.kind, "host-school");
    assert.equal(new URL(s.url).hostname, hosts[row.home_slug], `${row.provider_id} cites the host's official site`);
    assert.equal(Date.parse(s.host_kickoff_utc), Date.parse(row.kickoff_utc));
    assert.equal(Date.parse(s.espn_listed_kickoff_utc), Date.parse(row.kickoff_utc));
    assert.notEqual(Date.parse(s.ncaa_listed_kickoff_utc), Date.parse(row.kickoff_utc), "the differing NCAA listing stays recorded");
    assert.equal(row.ncaa_listed_kickoff_utc, s.ncaa_listed_kickoff_utc);
    assert.equal(row.kickoff_status, "confirmed");
  }
});

test("each poll keeps its own edition date and an unpublished AP edition is never relabeled", () => {
  const ap = pollTables.find((poll) => poll.poll === "ap"), coaches = pollTables.find((poll) => poll.poll === "coaches"), composite = pollTables.find((poll) => poll.poll === "composite");
  assert.equal(coaches?.release_date, "2026-11-15");
  assert.equal(evidence.ap_edition_status.published, false);
  assert.equal(ap?.release_date, "2026-11-08");
  assert.equal(composite?.release_date, "2026-11-08");
  const archived = raw.poll_history.find((entry: { release_date: string }) => entry.release_date === "2026-11-08");
  assert.deepEqual(archived.polls.map((poll: { poll: string; release_date: string }) => [poll.poll, poll.release_date]), [["coaches", "2026-11-08"]]);
  assert.match(raw.pollsStatus, /No AP Top 25 edition for November 15 was published/);
  assert.equal(verifiedRefresh?.poll_notes?.as_of, "2026-11-08");
  // Pregame ranks on the Week 11 finals come from the poll that preceded them.
  const utah = evidence.finals.find((row: { game_id: string }) => row.game_id === "2026-11-14-utah-at-arizona");
  assert.deepEqual(utah.meta.pregame_ap_ranks, { arizona: 22, utah: 2 });
});

test("all 138 records reconcile; NCAA standings rows that lag are recorded, not trusted", () => {
  assert.equal(Object.keys(evidence.records).length, 138);
  assert.deepEqual(verifiedRefresh?.teamRecords, evidence.records);
  assert.equal(evidence.primaryRecords.length, 138);
  const lag = evidence.ncaa_standings_lag as Array<{ slug: string; ncaa_row: string[]; provider_overall: string; last_verified_overall: string; uncounted_finals: string[]; corroborated_by: string }>;
  assert.equal(evidence.primaryRecords.filter((row: { source_id: string }) => row.source_id === "ncaa-standings").length, 138 - lag.length);
  for (const row of lag) {
    assert.equal(`${row.ncaa_row[2]}-${row.ncaa_row[3]}`, row.last_verified_overall, `${row.slug} NCAA row is the last verified record`);
    assert.equal(row.uncounted_finals.length, 1);
    const final = evidence.finals.find((g: { provider_id: string }) => g.provider_id === row.uncounted_finals[0]);
    assert.ok([final.home_slug, final.away_slug].includes(row.slug));
    const won = final.teams.find((t: { slug: string }) => t.slug === row.slug).points > final.teams.find((t: { slug: string }) => t.slug !== row.slug).points;
    const [w, l] = row.last_verified_overall.split("-").map(Number);
    assert.equal(row.provider_overall, won ? `${w + 1}-${l}` : `${w}-${l + 1}`, `${row.slug} last verified record plus the verified final`);
    assert.ok(row.corroborated_by.startsWith("standing-") || row.corroborated_by.startsWith("school-"));
  }
  assert.equal(raw.full_season_review.completed, 752);
  assert.equal(raw.playedGames.length, 629);
  assert.equal(raw.excludedGames.length, 123);
});

test("the Week 11 finals story is generated from the verified finals and the pregame poll", () => {
  const story = verifiedRefresh?.storylines?.find((row) => row.id === "week11-verified-finals");
  assert.ok(story);
  assert.equal(story.week, 11);
  assert.equal(story.result_provider_ids?.length, 67);
  // Ranks are each final's own pregame (November 8) AP ranks.
  type Final = { game_id: string; teams: Array<{ slug: string; points: number }>; meta: { pregame_ap_ranks: Record<string, number | null> } };
  const ranked = new Map<string, number>();
  for (const row of evidence.finals as Final[]) for (const [slug, rank] of Object.entries(row.meta.pregame_ap_ranks)) if (rank != null) ranked.set(slug, rank);
  const losses = (evidence.finals as Final[]).filter((row) => {
    const [a, b] = row.teams; const loser = a.points > b.points ? b : a;
    return ranked.has(loser.slug);
  });
  assert.match(story.headline, new RegExp(`^Week 11 finals: ${losses.length} of \\d+ AP-ranked teams lost$`));
  for (const row of losses) {
    const [a, b] = row.teams; const winner = a.points > b.points ? a : b, loser = winner === a ? b : a;
    assert.ok(story.body.includes(`${winner.points}–${loser.points} over No. ${ranked.get(loser.slug)} `), `${row.game_id} result line`);
  }
});
