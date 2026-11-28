import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { boardWeeks, games, getGame, pollTables, verifiedRefresh } from "../lib/cfb-dataset.ts";
import { easternDate } from "../lib/game-calendar.ts";
import { gameDaySnapshot, reviewedWeekContractViolation } from "../lib/gameday-shared.ts";
import { clockWeek, parseWeekParam, selectBoardWeek } from "../lib/week-cutover.ts";

const read = (path: string) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const evidence = read("data/cfb-2026/refresh/evidence/2026-11-22-week12-refresh.json");
const raw = read("data/cfb-2026/refresh/verified-refresh.json");
const friday = read("data/cfb-2026/refresh/evidence/2026-11-27-friday-finals.json");
// A fixed clock after the recorded Friday finals check.
const now = Date.parse(friday.checkedAt) + 60_000;

test("Week 13 becomes the default at 14:00Z on November 22 and Week 12 stays an explicit archive", () => {
  const week13 = boardWeeks.find((row) => row.week === 13);
  assert.deepEqual(
    { start: week13?.start, end: week13?.end, label: week13?.label, cutover: week13?.cutover_utc },
    { start: "2026-11-23", end: "2026-11-29", label: "Nov 24–28", cutover: "2026-11-22T14:00:00Z" },
  );
  assert.equal(week13?.results_verified_at, friday.checkedAt);
  assert.equal(week13?.results_partial, true);
  assert.deepEqual(boardWeeks.map((row) => row.week), [6, 7, 8, 9, 10, 11, 12, 13]);
  assert.equal(gameDaySnapshot(Date.parse("2026-11-22T13:59:59Z")).selectedWeek, 12);
  assert.equal(gameDaySnapshot(Date.parse("2026-11-22T14:00:00Z")).selectedWeek, 13);
  assert.equal(gameDaySnapshot(now).selectedWeek, 13);
  assert.equal(gameDaySnapshot(now).explicit, false);
  const archive = gameDaySnapshot(now, "12");
  assert.equal(archive.selectedWeek, 12);
  assert.ok(archive.explicit);
  const weeks = gameDaySnapshot(now).weeks;
  assert.equal(clockWeek(weeks, { week: 12, serverNow: now, explicit: true }), 13);
  assert.equal(clockWeek(weeks, selectBoardWeek(weeks, Date.parse("2026-11-22T13:59:59Z"))), 12);
  assert.equal(parseWeekParam("13", weeks), 13);
  assert.equal(parseWeekParam("14", weeks), null);
  assert.equal(verifiedRefresh?.week, 13);
});

test("all 66 Week 12 games are verified finals with stable ids, scores and quarter sums", () => {
  const archive = gameDaySnapshot(now, "12");
  assert.equal(archive.games.length, 66);
  assert.equal(evidence.finals.length, 66);
  assert.equal(reviewedWeekContractViolation(12, archive.weeks.find((row) => row.week === 12), archive.games), null);
  assert.equal(new Set(evidence.finals.map((row: { provider_id: string }) => row.provider_id)).size, 66);
  assert.equal(new Set(evidence.finals.map((row: { game_id: string }) => row.game_id)).size, 66);
  for (const row of evidence.finals) {
    // Each provider event maps to exactly one published final with the same id.
    const published = raw.playedGames.filter((g: { provider_id?: string }) => g.provider_id === row.provider_id);
    assert.equal(published.length, 1, `${row.provider_id} published once`);
    assert.equal(published[0].game_id, row.game_id);
    assert.deepEqual(published[0].teams.map((t: { slug: string; points: number }) => [t.slug, t.points]), row.teams.map((t: { slug: string; points: number }) => [t.slug, t.points]));
    const game = games.find((g) => g.id === row.game_id);
    assert.ok(game, row.game_id);
    assert.equal(game.week, 12);
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
  assert.equal(raw.scheduledGames.filter((row: { week: number }) => row.week === 12).length, 0);
  assert.equal(raw.playedGames.filter((row: { week: number }) => row.week === 12).length, 66);
});

test("Oklahoma State at Arizona State keeps its published id and kickoff after starting 15 minutes later", () => {
  const game = getGame("2026-11-21-oklahoma-state-at-arizona-state");
  assert.equal(game?.status, "final");
  assert.equal(game?.date, "2026-11-22T03:30Z");
  assert.equal(easternDate(game?.date ?? ""), "2026-11-21");
  const row = raw.playedGames.find((g: { provider_id: string }) => g.provider_id === "401856870");
  assert.equal(row.game_id, "2026-11-21-oklahoma-state-at-arizona-state");
  assert.equal(row.date, "2026-11-21");
  assert.equal(row.meta.originally_scheduled_kickoff_utc, "2026-11-22T03:15Z");
  assert.deepEqual(evidence.rescheduled.map((r: { provider_id: string }) => r.provider_id), ["401856870"]);
  // No Week 12 final rests on a school page: both boards list every one as final.
  assert.deepEqual(evidence.school_corroborations, []);
});

test("four Week 12 FBS-vs-FCS finals are verified and stay outside the board", () => {
  assert.equal(evidence.fcs_finals.length, 4);
  assert.equal(raw.excludedGames.filter((row: { week: number }) => row.week === 12).length, 4);
  assert.equal(gameDaySnapshot(now, "12").games.length, 66);
});

test("Week 13 keeps the 69-game slate and publishes only the two reviewed Friday finals", () => {
  const board = gameDaySnapshot(now, "13");
  assert.equal(board.games.length, 69);
  const finals = board.games.filter((g) => g.status === "final");
  const scoreline = (g: (typeof finals)[number]) => [g.id, g.awayTeamId, g.homeTeamId, g.awayScore, g.homeScore, g.broadcast];
  assert.deepEqual(finals.map(scoreline).sort(), [
    ["2026-11-27-mississippi-state-at-ole-miss", "mississippi-state", "ole-miss", 17, 41, "ABC"],
    ["2026-11-27-nebraska-at-iowa", "nebraska", "iowa", 7, 31, "CBS"],
  ]);
  for (const result of finals) {
    assert.equal(getGame(result.id)?.status, "final");
    assert.equal(result.statusDetail, "Final");
  }
  const remaining = board.games.filter((g) => g.status !== "final");
  assert.equal(remaining.length, 67);
  assert.ok(remaining.every((g) => g.status === "scheduled" && g.homeScore === null && g.awayScore === null));
  const control = remaining.find((g) => g.id === "2026-11-28-michigan-at-ohio-state");
  assert.ok(control);
  assert.deepEqual(scoreline(control), ["2026-11-28-michigan-at-ohio-state", "michigan", "ohio-state", null, null, "Fox"]);
  assert.equal(control.date, "2026-11-28T17:00Z");
  assert.equal(getGame(control.id)?.status, "scheduled");
  assert.equal(reviewedWeekContractViolation(13, board.weeks.find((row) => row.week === 13), board.games), null);
  assert.equal(board.sourceDates.results, friday.checkedAt);
  const fridayRecords = Object.fromEntries(board.teams
    .filter((team) => ["iowa", "nebraska", "ole-miss", "mississippi-state"].includes(team.slug))
    .map((team) => [team.slug, team.record?.replace("–", "-")]));
  assert.deepEqual(fridayRecords, { iowa: "10-2", nebraska: "7-5", "ole-miss": "8-4", "mississippi-state": "5-7" });
  assert.equal(board.sourceDates.records, verifiedRefresh?.records_verified_at);
  assert.equal(board.sourceDates.previousResults, gameDaySnapshot(now, "12").sourceDates.results);
  const perDay: Record<string, number> = {};
  for (const g of board.games) perDay[easternDate(g.date)] = (perDay[easternDate(g.date)] ?? 0) + 1;
  assert.deepEqual(perDay, { "2026-11-24": 2, "2026-11-26": 1, "2026-11-27": 13, "2026-11-28": 53 });
  assert.equal(evidence.excluded_upcoming.length, 0);
  const marquee = boardWeeks.find((row) => row.week === 13)?.marquee_game_id;
  assert.equal(marquee, "2026-11-28-usc-at-ucla");
  assert.ok(board.games.some((g) => g.id === marquee), "marquee is a Week 13 fixture");
});

test("the scoreboard contract accepts omitted scheduled scores and rejects omitted final scores", () => {
  const archive = { results_verified_at: friday.checkedAt };
  const partial = { ...archive, results_partial: true } as const;
  const final = { status: "final", homeScore: 0, awayScore: 7 };
  const incomplete = { status: "final", homeScore: 7 };
  const scheduled = { status: "scheduled" };
  assert.equal(reviewedWeekContractViolation(13, {}, [scheduled]), null);
  assert.equal(reviewedWeekContractViolation(13, partial, [final, scheduled]), null);
  assert.match(reviewedWeekContractViolation(13, archive, [incomplete]) ?? "", /unscored/);
  assert.match(reviewedWeekContractViolation(13, partial, [final, scheduled, incomplete]) ?? "", /invalid game/);
});

test("every remaining Week 13 kickoff retains its reviewed source and time", () => {
  assert.equal(raw.scheduledGames.length, 67);
  assert.deepEqual(evidence.kickoff_settlements, []);
  assert.deepEqual(evidence.kickoff_holds, []);
  for (const row of raw.scheduledGames) {
    assert.equal(row.kickoff_status, "confirmed", row.provider_id);
    assert.ok(row.kickoff_utc, row.provider_id);
    assert.equal(row.kickoff_settlement ?? null, null);
    assert.equal(row.kickoff_hold ?? null, null);
    assert.ok(row.source_urls.some((url: string) => /ncaa\.com\/game\/\d+$/.test(url)), row.provider_id + " cites its NCAA contest");
  }
});

test("both polls are the November 22 editions and the earlier editions are archived with their own dates", () => {
  const ap = pollTables.find((poll) => poll.poll === "ap"), coaches = pollTables.find((poll) => poll.poll === "coaches"), composite = pollTables.find((poll) => poll.poll === "composite");
  assert.equal(coaches?.release_date, "2026-11-22");
  assert.equal(evidence.ap_edition_status.published, true);
  assert.equal(evidence.ap_edition_status.release_date, "2026-11-22");
  assert.equal(ap?.release_date, "2026-11-22");
  assert.equal(composite?.release_date, "2026-11-22");
  const history = raw.poll_history.map((entry: { release_date: string; polls: Array<{ poll: string }> }) => [entry.release_date, entry.polls.map((poll) => poll.poll).join("+")]);
  assert.deepEqual(history.slice(-3), [["2026-11-08", "ap+coaches"], ["2026-11-15", "coaches"], ["2026-11-16", "ap"]]);
  assert.match(raw.pollsStatus, /AP and AFCA Coaches editions published November 22, 2026/);
  assert.equal(verifiedRefresh?.poll_notes?.as_of, "2026-11-22");
  // Pregame ranks on the Week 12 finals come from the poll that preceded them
  // (the November 16 AP edition), not the edition published after them.
  const ucla = evidence.finals.find((row: { game_id: string }) => row.game_id === "2026-11-21-ucla-at-michigan");
  assert.deepEqual(ucla.meta.pregame_ap_ranks, { michigan: null, ucla: 4 });
});

test("all 138 records reconcile; NCAA standings rows that lag are recorded, not trusted", () => {
  assert.equal(Object.keys(evidence.records).length, 138);
  assert.deepEqual(verifiedRefresh?.teamRecords, evidence.records);
  assert.equal(evidence.primaryRecords.length, 138);
  const lag = evidence.ncaa_standings_lag as Array<{ slug: string; ncaa_row: string[]; provider_overall: string; last_verified_overall: string; uncounted_finals: string[]; corroborated_by: string }>;
  assert.equal(evidence.primaryRecords.filter((row: { source_id: string }) => row.source_id === "ncaa-standings").length, 138 - lag.length);
  for (const row of lag) {
    assert.equal(`${row.ncaa_row[2]}-${row.ncaa_row[3]}`, row.last_verified_overall, `${row.slug} NCAA row is the last verified record`);
    assert.ok(row.uncounted_finals.length >= 1);
    const final = evidence.finals.find((g: { provider_id: string }) => g.provider_id === row.uncounted_finals[0]);
    assert.ok([final.home_slug, final.away_slug].includes(row.slug));
    const won = final.teams.find((t: { slug: string }) => t.slug === row.slug).points > final.teams.find((t: { slug: string }) => t.slug !== row.slug).points;
    const [w, l] = row.last_verified_overall.split("-").map(Number);
    assert.equal(row.provider_overall, won ? `${w + 1}-${l}` : `${w}-${l + 1}`, `${row.slug} last verified record plus the verified final`);
    assert.ok(row.corroborated_by.startsWith("standing-") || row.corroborated_by.startsWith("school-"));
  }
  assert.equal(raw.full_season_review.completed, 822);
  assert.equal(raw.playedGames.filter((row: { week: number }) => row.week < 13).length, 695);
  assert.equal(raw.excludedGames.length, 127);
});

test("the Week 12 finals story is generated from the verified finals and the pregame poll", () => {
  const story = verifiedRefresh?.storylines?.find((row) => row.id === "week12-verified-finals");
  assert.ok(story);
  assert.equal(story.week, 12);
  assert.equal(story.result_provider_ids?.length, 66);
  // Ranks are each final's own pregame (November 16) AP ranks.
  type Final = { game_id: string; teams: Array<{ slug: string; points: number }>; meta: { pregame_ap_ranks: Record<string, number | null> } };
  const ranked = new Map<string, number>();
  for (const row of evidence.finals as Final[]) for (const [slug, rank] of Object.entries(row.meta.pregame_ap_ranks)) if (rank != null) ranked.set(slug, rank);
  const losses = (evidence.finals as Final[]).filter((row) => {
    const [a, b] = row.teams; const loser = a.points > b.points ? b : a;
    return ranked.has(loser.slug);
  });
  // The denominator is the number of distinct AP-ranked teams that played.
  assert.equal(story.headline, `Week 12 finals: ${losses.length} of ${ranked.size} AP-ranked teams lost`);
  assert.ok(story.body.includes(`${ranked.size} AP teams played and ${losses.length} lost`));
  for (const row of losses) {
    const [a, b] = row.teams; const winner = a.points > b.points ? a : b, loser = winner === a ? b : a;
    assert.ok(story.body.includes(`${winner.points}–${loser.points} over No. ${ranked.get(loser.slug)} `), `${row.game_id} result line`);
  }
});
