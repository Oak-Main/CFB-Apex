import assert from "node:assert/strict";
import test from "node:test";
import { easternDate } from "../lib/game-calendar.ts";
import { boardWeeks, games, pollsStatusNote, teams, verifiedRefresh } from "../lib/cfb-dataset.ts";
import { boardWeekStart, tickerGamesFor } from "../lib/homepage-data.ts";
import { kickoffTime, weekGames } from "../lib/homepage.ts";
import { gamesForWeek, kickoffTimeLabel } from "../lib/scoreboard.ts";
import { nextCutoverMs, parseWeekParam, pickBoardWeek, selectBoardWeek } from "../lib/week-cutover.ts";

const archiveWeeks = boardWeeks.filter((row) => row.week <= 7);
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
  assert.equal(pickBoardWeek(archiveWeeks, Date.parse("2026-10-11T12:59:59.999Z")), 6);
  assert.equal(pickBoardWeek(archiveWeeks, Date.parse("2026-10-11T13:00:00.000Z")), 7);
  assert.equal(pickBoardWeek(archiveWeeks, Date.parse("2026-10-11T13:00:00.001Z")), 7);
  // Not 06:00 UTC.
  assert.equal(pickBoardWeek(archiveWeeks, Date.parse("2026-10-11T06:00:00Z")), 6);
  // After the latest reviewed week, the board stays on it rather than inventing one.
  assert.equal(pickBoardWeek(archiveWeeks, Date.parse("2026-11-01T00:00:00Z")), 7);
  assert.equal(nextCutoverMs(archiveWeeks, CUTOVER - 1), CUTOVER);
  assert.equal(nextCutoverMs(archiveWeeks, CUTOVER), null);
});

test("?week= previews only reviewed weeks and never reads the browser clock", () => {
  assert.equal(parseWeekParam("6", archiveWeeks), 6);
  assert.equal(parseWeekParam(["7", "6"], archiveWeeks), 7);
  for (const bad of ["8", "0", "6x", " 6", "-6", "", undefined, null]) {
    assert.equal(parseWeekParam(bad, archiveWeeks), null, String(bad));
  }
  assert.deepEqual(selectBoardWeek(archiveWeeks, CUTOVER + 1, "6"), { week: 6, serverNow: CUTOVER + 1, explicit: true });
  assert.deepEqual(selectBoardWeek(archiveWeeks, CUTOVER - 1, "7"), { week: 7, serverNow: CUTOVER - 1, explicit: true });
  assert.deepEqual(selectBoardWeek(archiveWeeks, CUTOVER - 1, "9"), { week: 6, serverNow: CUTOVER - 1, explicit: false });
});

test("the Week 7 board is the reviewed 59-game FBS-vs-FBS release", () => {
  const slate = week7();
  assert.equal(slate.length, 59);
  // The calendar-week window and the week number agree exactly.
  assert.deepEqual(weekGames(games, boardWeekStart(7)).map((row) => row.id).sort(), slate.map((row) => row.id).sort());
  assert.ok(slate.every((row) => row.status === "final" && row.week === 7));
  const perDay: Record<string, number> = {};
  for (const row of slate) perDay[easternDate(row.date)] = (perDay[easternDate(row.date)] ?? 0) + 1;
  assert.deepEqual(perDay, { "2026-10-13": 2, "2026-10-14": 2, "2026-10-15": 3, "2026-10-16": 3, "2026-10-17": 49 });
  assert.equal(new Set(slate.map((row) => [row.awayTeamId, row.homeTeamId].sort().join(":"))).size, 59);
  const ids = new Set(teams.map((team) => team.id));
  assert.ok(slate.every((row) => ids.has(row.awayTeamId) && ids.has(row.homeTeamId)));
  assert.equal(verifiedRefresh?.week, 8);
  assert.equal(verifiedRefresh?.reference_date, "2026-10-19");
});

test("every Week 7 kickoff is published after the October 11 rechecks, with no midnight placeholder", () => {
  assert.deepEqual(week7().filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date)).map((row) => row.id), []);
  for (const row of week7()) assert.doesNotMatch(row.kickoffLabel, /12:00 AM|midnight|Kickoff TBA/i, row.id);
  for (const row of verifiedRefresh?.scheduledGames ?? []) {
    assert.equal(row.kickoff_utc == null, row.kickoff_status === "official_tbd", row.provider_id);
    assert.equal(row.time_et == null, row.kickoff_utc == null, row.provider_id);
  }
  assert.ok(!(verifiedRefresh?.scheduledGames ?? []).some((row) => row.week === 7 && row.kickoff_status === "official_tbd"));
});

test("an official TBD kickoff still renders as Kickoff TBA, never a midnight placeholder", () => {
  const tbd = { ...game("2026-10-17-nebraska-at-oregon"), date: "2026-10-17", kickoffLabel: "Sat · 2026-10-17 · Kickoff TBA" };
  assert.equal(kickoffTime(tbd), "Kickoff TBA");
  assert.equal(kickoffTimeLabel(tbd), "Kickoff TBA");
  assert.equal(easternDate(tbd.date), "2026-10-17", "a date-only TBD stays on its Eastern date");
});

test("October 11 recheck adopts a visiting school's kickoff only when ESPN agrees", () => {
  const charlotte = game("2026-10-17-charlotte-at-temple");
  assert.equal(charlotte.date, "2026-10-17T17:00Z");
  assert.equal(kickoffTime(charlotte), "1:00 PM ET");
  assert.equal(charlotte.broadcast, "ESPN+");
  const latech = game("2026-10-17-louisiana-tech-at-ulm");
  assert.equal(latech.date, "2026-10-18T00:00Z");
  assert.equal(kickoffTime(latech), "8:00 PM ET");
  assert.equal(easternDate(latech.date), "2026-10-17", "an 8 PM ET kickoff stays on Saturday");
  assert.equal(latech.week, 7);
  // Afternoon recheck: ESPN replaced its timeValid:false placeholder with Nebraska's 10 PM CDT on Fox.
  const nebraska = game("2026-10-17-nebraska-at-oregon");
  assert.equal(nebraska.date, "2026-10-18T03:00Z");
  assert.equal(kickoffTime(nebraska), "11:00 PM ET");
  assert.equal(kickoffTimeLabel(nebraska), "11:00 PM ET");
  assert.equal(easternDate(nebraska.date), "2026-10-17", "an 8 PM Pacific kickoff stays on Saturday");
  assert.equal(nebraska.week, 7);
  for (const id of ["401862803", "401871091", "401858492"]) {
    const row = ((verifiedRefresh?.playedGames ?? []) as Array<{ provider_id: string; meta?: { originally_scheduled_kickoff_utc?: string } }>).find((candidate) => candidate.provider_id === id);
    assert.ok(row?.meta?.originally_scheduled_kickoff_utc, "verified final retains its reviewed pregame kickoff");
  }
});

test("primary-source corrections and networks are kept as reviewed", () => {
  const wisconsin = game("2026-10-17-wisconsin-at-ucla");
  assert.equal(wisconsin?.date, "2026-10-17T23:30Z");
  assert.equal(kickoffTime(wisconsin), "7:30 PM ET");
  assert.equal(wisconsin?.broadcast, "NBC");
  const purdue = game("2026-10-16-washington-at-purdue");
  assert.equal(easternDate(purdue.date), "2026-10-16", "Washington–Purdue is Friday");
  assert.ok(!games.some((row) => row.week === 7 && row.awayTeamId === "washington" && easternDate(row.date) === "2026-10-17"));
  // Hosts settle their own games (Michigan CBS, Tennessee ABC); a visitor's network
  // counts once ESPN shows the same one (Nebraska FOX, Florida ABC).
  assert.equal(game("2026-10-17-penn-state-at-michigan")?.broadcast, "CBS");
  assert.equal(game("2026-10-17-nebraska-at-oregon")?.broadcast, "FOX");
  assert.equal(game("2026-10-17-florida-at-texas")?.broadcast, "ABC");
  assert.equal(game("2026-10-17-alabama-at-tennessee")?.broadcast, "ABC");
  for (const row of week7()) assert.ok(row.broadcast && !/ or /.test(row.broadcast), `${row.id} has one published network`);
});

test("Ohio State at Indiana is the Week 7 marquee with verified records", () => {
  const week = boardWeeks.find((row) => row.week === 7);
  const marquee = game(week?.marquee_game_id ?? "");
  assert.equal(marquee.id, "2026-10-17-ohio-state-at-indiana");
  assert.equal(kickoffTime(marquee), "12:00 PM ET");
  assert.equal(marquee?.broadcast, "FOX");
  assert.equal(marquee?.venue, "Memorial Stadium (Bloomington, IN)");
  assert.equal(teams.find((team) => team.slug === "ohio-state")?.record, "6–1");
  assert.equal(teams.find((team) => team.slug === "indiana")?.record, "6–1");
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
  assert.equal(teams.find((team) => team.slug === "texas")?.record, "4–2");
  // Records the Week 7 release verified are unchanged.
  assert.equal(teams.find((team) => team.slug === "ohio-state")?.record, "6–1");
  assert.equal(teams.find((team) => team.slug === "indiana")?.record, "6–1");
  // Every team's record equals its conference table's overall column.
  for (const conf of verifiedRefresh?.retainedBaseline?.conferenceStandings ?? []) {
    for (const row of conf.rows) assert.equal(row.overall, row.team_slug ? verifiedRefresh?.teamRecords[row.team_slug] : undefined, row.team);
  }
});

test("current polls advance to October 18 and explain historical source dates", () => {
  assert.deepEqual(verifiedRefresh?.polls?.filter((poll) => poll.poll !== "composite").map((poll) => poll.release_date), ["2026-10-18", "2026-10-18"]);
  assert.match(pollsStatusNote ?? "", /October 18/);
  assert.match(pollsStatusNote ?? "", /October 11/);
});

test("Week 7 FBS–FCS exclusions carry ESPN conference evidence", () => {
  const excluded = (verifiedRefresh?.excludedGames ?? []).filter((row) => row.date >= "2026-10-12");
  assert.deepEqual(excluded.map((row) => row.provider_id).sort(), ["401856725", "401858261", "401858262"]);
  for (const row of excluded) assert.ok(row.espn_conference_ids && ![1, 4, 5, 8, 9, 12, 15, 17, 18, 37, 151].includes(row.espn_conference_ids.away));
});

test("the Week 7 archive ticker contains Week 7 finals and no upcoming games", () => {
  const ticker = tickerGamesFor(7);
  const finals = ticker.filter((row) => row.status === "final");
  assert.equal(finals.length, 8);
  // Latest kickoff first: Saturday's late-night Pacific finals.
  assert.equal(easternDate(finals[0].date), "2026-10-17");
  assert.equal(finals[0].date, "2026-10-18T03:00Z");
  const upcoming = ticker.filter((row) => row.status !== "final");
  assert.equal(upcoming.length, 0);
  assert.ok(upcoming.every((row) => easternDate(row.date) >= "2026-10-13" && easternDate(row.date) <= "2026-10-17"));
});

test("stories stay on their own board week", () => {
  const stories = verifiedRefresh?.storylines ?? [];
  assert.ok(stories.every((story) => [6, 7, 8].includes(story.week ?? 0)));
  assert.deepEqual(stories.filter((story) => story.week === 7).map((story) => story.id), ["week7-verified-finals"]);
});
