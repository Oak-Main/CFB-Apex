import assert from "node:assert/strict";
import test from "node:test";
import { easternDate } from "../lib/game-calendar.ts";
import { boardWeeks, games, pollsStatusNote, teams, verifiedRefresh } from "../lib/cfb-dataset.ts";
import { boardWeekStart, tickerGamesFor } from "../lib/homepage-data.ts";
import { kickoffTime, weekGames } from "../lib/homepage.ts";
import { gamesForWeek, kickoffTimeLabel } from "../lib/scoreboard.ts";
import { nextCutoverMs, parseWeekParam, pickBoardWeek, selectBoardWeek } from "../lib/week-cutover.ts";

const CUTOVER = Date.UTC(2026, 9, 11, 13, 0, 0);
const week7 = () => gamesForWeek(games, 7);
const game = (id: string) => {
  const row = games.find((candidate) => candidate.id === id);
  assert.ok(row, `${id} is on the board`);
  return row;
};

test("Week 7 replaces Week 6 at 06:00 America/Los_Angeles (13:00 UTC) on October 11", () => {
  assert.equal(boardWeeks.find((row) => row.week === 7)?.cutover_utc, "2026-10-11T13:00:00Z");
  const pacific = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit", hour12: true }).format(CUTOVER);
  assert.equal(pacific, "6:00 AM");
  assert.equal(pickBoardWeek(boardWeeks, Date.parse("2026-10-11T12:59:59.999Z")), 6);
  assert.equal(pickBoardWeek(boardWeeks, Date.parse("2026-10-11T13:00:00.000Z")), 7);
  assert.equal(pickBoardWeek(boardWeeks, Date.parse("2026-10-11T13:00:00.001Z")), 7);
  // Not 06:00 UTC.
  assert.equal(pickBoardWeek(boardWeeks, Date.parse("2026-10-11T06:00:00Z")), 6);
  // After the latest reviewed week, the board stays on it rather than inventing one.
  assert.equal(pickBoardWeek(boardWeeks, Date.parse("2026-11-01T00:00:00Z")), 7);
  assert.equal(nextCutoverMs(boardWeeks, CUTOVER - 1), CUTOVER);
  assert.equal(nextCutoverMs(boardWeeks, CUTOVER), null);
});

test("?week= previews only reviewed weeks and never reads the browser clock", () => {
  assert.equal(parseWeekParam("6", boardWeeks), 6);
  assert.equal(parseWeekParam(["7", "6"], boardWeeks), 7);
  for (const bad of ["8", "0", "6x", " 6", "-6", "", undefined, null]) {
    assert.equal(parseWeekParam(bad, boardWeeks), null, String(bad));
  }
  assert.deepEqual(selectBoardWeek(boardWeeks, CUTOVER + 1, "6"), { week: 6, serverNow: CUTOVER + 1, explicit: true });
  assert.deepEqual(selectBoardWeek(boardWeeks, CUTOVER - 1, "7"), { week: 7, serverNow: CUTOVER - 1, explicit: true });
  assert.deepEqual(selectBoardWeek(boardWeeks, CUTOVER - 1, "9"), { week: 6, serverNow: CUTOVER - 1, explicit: false });
});

test("the Week 7 board is the reviewed 59-game FBS-vs-FBS release", () => {
  const slate = week7();
  assert.equal(slate.length, 59);
  // The calendar-week window and the week number agree exactly.
  assert.deepEqual(weekGames(games, boardWeekStart(7)).map((row) => row.id).sort(), slate.map((row) => row.id).sort());
  assert.ok(slate.every((row) => row.status === "scheduled" && row.week === 7));
  const perDay: Record<string, number> = {};
  for (const row of slate) perDay[easternDate(row.date)] = (perDay[easternDate(row.date)] ?? 0) + 1;
  assert.deepEqual(perDay, { "2026-10-13": 2, "2026-10-14": 2, "2026-10-15": 3, "2026-10-16": 3, "2026-10-17": 49 });
  assert.equal(new Set(slate.map((row) => [row.awayTeamId, row.homeTeamId].sort().join(":"))).size, 59);
  const ids = new Set(teams.map((team) => team.id));
  assert.ok(slate.every((row) => ids.has(row.awayTeamId) && ids.has(row.homeTeamId)));
  assert.equal(verifiedRefresh?.week, 7);
  assert.equal(verifiedRefresh?.reference_date, "2026-10-12");
});

test("official TBD kickoffs stay unannounced, never a midnight placeholder", () => {
  const tbd = week7().filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date));
  assert.deepEqual(tbd.map((row) => row.id).sort(), [
    "2026-10-17-charlotte-at-temple",
    "2026-10-17-louisiana-tech-at-ulm",
    "2026-10-17-nebraska-at-oregon",
  ]);
  for (const row of tbd) {
    assert.match(row.kickoffLabel, /Kickoff TBA$/);
    assert.equal(kickoffTime(row), "Kickoff TBA");
    assert.equal(kickoffTimeLabel(row), "Kickoff TBA");
    assert.equal(easternDate(row.date), "2026-10-17", "a date-only TBD stays on its Eastern date");
  }
  for (const row of week7()) assert.doesNotMatch(row.kickoffLabel, /12:00 AM|midnight/i, row.id);
  for (const row of verifiedRefresh?.scheduledGames ?? []) {
    assert.equal(row.kickoff_utc == null, row.kickoff_status === "official_tbd", row.provider_id);
    assert.equal(row.time_et == null, row.kickoff_utc == null, row.provider_id);
  }
});

test("primary-source corrections and unpublished networks are kept as reviewed", () => {
  const wisconsin = game("2026-10-17-wisconsin-at-ucla");
  assert.equal(wisconsin?.date, "2026-10-17T23:30Z");
  assert.equal(kickoffTime(wisconsin), "7:30 PM ET");
  assert.equal(wisconsin?.broadcast, "NBC");
  const purdue = game("2026-10-16-washington-at-purdue");
  assert.equal(easternDate(purdue.date), "2026-10-16", "Washington–Purdue is Friday");
  assert.ok(!games.some((row) => row.week === 7 && row.awayTeamId === "washington" && easternDate(row.date) === "2026-10-17"));
  assert.equal(game("2026-10-17-penn-state-at-michigan")?.broadcast, null);
  assert.equal(game("2026-10-17-nebraska-at-oregon")?.broadcast, null);
  assert.equal(game("2026-10-17-florida-at-texas")?.broadcast, "ABC or ESPN");
  assert.equal(game("2026-10-17-alabama-at-tennessee")?.broadcast, "ABC or ESPN");
});

test("Ohio State at Indiana is the Week 7 marquee with verified records", () => {
  const week = boardWeeks.find((row) => row.week === 7);
  const marquee = game(week?.marquee_game_id ?? "");
  assert.equal(marquee.id, "2026-10-17-ohio-state-at-indiana");
  assert.equal(kickoffTime(marquee), "12:00 PM ET");
  assert.equal(marquee?.broadcast, "FOX");
  assert.equal(marquee?.venue, "Memorial Stadium (Bloomington, IN)");
  assert.equal(teams.find((team) => team.slug === "ohio-state")?.record, "5–1");
  assert.equal(teams.find((team) => team.slug === "indiana")?.record, "6–0");
  for (const [id, away, home] of [["2026-10-10-maryland-at-ohio-state", 16, 45], ["2026-10-10-indiana-at-nebraska", 20, 17]] as const) {
    const final = game(id);
    assert.equal(final?.status, "final");
    assert.equal(final?.awayScore, away);
    assert.equal(final?.homeScore, home);
  }
});

test("records: all 138 reconcile after the verified Week 6 finals", () => {
  const review = verifiedRefresh?.team_records_review;
  assert.equal(review?.verified, 138);
  assert.deepEqual(review?.carried_from_2026_10_10, []);
  assert.deepEqual(review?.withheld, []);
  assert.equal(Object.keys(verifiedRefresh?.teamRecords ?? {}).length, 138);
  // Texas lost to Oklahoma on October 10: 4–0 became 4–1.
  assert.equal(teams.find((team) => team.slug === "texas")?.record, "4–1");
  // Records the Week 7 release verified are unchanged.
  assert.equal(teams.find((team) => team.slug === "ohio-state")?.record, "5–1");
  assert.equal(teams.find((team) => team.slug === "indiana")?.record, "6–0");
  // Every team's record equals its conference table's overall column.
  for (const conf of verifiedRefresh?.retainedBaseline?.conferenceStandings ?? []) {
    for (const row of conf.rows) assert.equal(row.overall, row.team_slug ? verifiedRefresh?.teamRecords[row.team_slug] : undefined, row.team);
  }
});

test("polls keep their October 4 editions on the Week 7 board", () => {
  assert.deepEqual(verifiedRefresh?.polls?.filter((poll) => poll.poll !== "composite").map((poll) => poll.release_date), ["2026-10-04", "2026-10-04"]);
  assert.match(pollsStatusNote ?? "", /October 4/);
  assert.match(pollsStatusNote ?? "", /does not relabel/);
});

test("Week 7 FBS–FCS exclusions carry ESPN conference evidence", () => {
  const excluded = (verifiedRefresh?.excludedGames ?? []).filter((row) => row.date >= "2026-10-12");
  assert.deepEqual(excluded.map((row) => row.provider_id).sort(), ["401856725", "401858261", "401858262"]);
  for (const row of excluded) assert.ok(row.espn_conference_ids && ![1, 4, 5, 8, 9, 12, 15, 17, 18, 37, 151].includes(row.espn_conference_ids.away));
});

test("the Week 7 ticker leads with the latest verified finals, then the new slate", () => {
  const ticker = tickerGamesFor(7);
  const finals = ticker.filter((row) => row.status === "final");
  assert.equal(finals.length, 8);
  // Latest kickoff first: Saturday's late-night Pacific finals.
  assert.equal(easternDate(finals[0].date), "2026-10-10");
  assert.equal(finals[0].date, "2026-10-11T02:30Z");
  const upcoming = ticker.filter((row) => row.status !== "final");
  assert.equal(upcoming.length, 8);
  assert.ok(upcoming.every((row) => easternDate(row.date) >= "2026-10-13" && easternDate(row.date) <= "2026-10-17"));
});

test("stories stay on their own board week", () => {
  const stories = verifiedRefresh?.storylines ?? [];
  assert.ok(stories.every((story) => story.week === 6 || story.week === 7));
  assert.deepEqual(stories.filter((story) => story.week === 7).map((story) => story.id), ["week7-schedule-notes"]);
});
