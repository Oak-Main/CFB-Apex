import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { games, getGame, reviewedScheduleStatus, verifiedRefresh } from "../lib/cfb-dataset.ts";
import { compareGameDates, easternDate, easternKickoff, sourceDateLabel } from "../lib/game-calendar.ts";
import { gameDaySnapshot, isReviewedGameDayRefresh, publicGame } from "../lib/gameday-shared.ts";
import { verifyFullSeason } from "../scripts/full-season-validation.mjs";
import { selectBoardWeek } from "../lib/week-cutover.ts";
import { reconcileGameDay } from "../scripts/reconcile-gameday.mjs";
import { htmlText, isSourceEvidenceFresh, ncaaInventory, schoolBlocks, sourceScheduleStatus, tvPattern, withoutHtmlComments } from "../scripts/gameday-source-validation.mjs";

const evidence = JSON.parse(readFileSync(new URL("../data/cfb-2026/refresh/evidence/2026-10-28-week9-refresh.json", import.meta.url), "utf8"));
const now = Date.parse("2026-10-28T20:32:04.954Z");

test("Week 9 cutover selects the upcoming slate while Week 8 remains a complete explicit archive", () => {
  const upcoming = gameDaySnapshot(now), archive = gameDaySnapshot(now, "8");
  assert.equal(gameDaySnapshot(Date.parse("2026-10-25T12:59:59Z")).selectedWeek, 8);
  assert.equal(gameDaySnapshot(Date.parse("2026-10-25T13:00:00Z")).selectedWeek, 9);
  assert.equal(upcoming.selectedWeek, 9); assert.equal(upcoming.games.length, evidence.inventories[9].expected);
  assert.equal(upcoming.games.filter(g => g.status === "final").length, 2);
  assert.equal(upcoming.games.filter(g => g.status === "scheduled" && g.homeScore === null && g.awayScore === null).length, 54);
  assert.equal(archive.selectedWeek, 8); assert.ok(archive.explicit);
  assert.equal(archive.games.length, evidence.inventories[8].expected);
  assert.ok(archive.games.every(g => g.status === "final"));
  assert.deepEqual(upcoming.previousFinals, archive.games);
  assert.equal(upcoming.revision, archive.revision);
  assert.ok(upcoming.sourceDates.results);
  assert.equal(upcoming.sourceDates.previousResults, archive.sourceDates.results);
  assert.equal(upcoming.weeks.find(w => w.week === 9)?.marquee_game_id, undefined);
});

test("every Week 9 fixture has a stable event and truthful TBA, venue, neutral flag and TV projection", () => {
  for (const row of evidence.schedule) {
    const game = games.find(g => g.week === 9 && g.homeTeamId === row.home && g.awayTeamId === row.away);
    assert.ok(game); assert.equal(game.venue, row.site); assert.equal(game.neutralSite, row.neutral_site);
    assert.equal(easternDate(game.date), row.date); assert.equal(game.broadcast, row.tv);
    if (row.kickoff_utc === null) { assert.equal(game.date, row.date); assert.match(game.kickoffLabel, /TBA/); assert.doesNotMatch(publicGame(game, now + 14 * 86400000).statusDetail ?? "", /Kickoff passed/); }
    else assert.equal(Date.parse(game.date), Date.parse(row.kickoff_utc));
  }
  assert.equal(games.filter(g => g.week === 9 && !g.date.includes("T")).length, evidence.counts.kickoffTBAorDisputed);
});

test("zero weeks, explicit archives and daylight-saving cutovers remain predictable", () => {
  const weeks = [{week:0,cutover_utc:"2026-08-23T13:00Z"},{week:9,cutover_utc:"2026-10-25T13:00Z"},{week:10,cutover_utc:"2026-11-01T14:00Z"}];
  assert.equal(selectBoardWeek(weeks, now, "0").week, 0);
  assert.equal(selectBoardWeek(weeks, Date.parse("2026-11-01T13:59:59Z")).week, 9);
  assert.equal(selectBoardWeek(weeks, Date.parse("2026-11-01T14:00Z")).week, 10);
  assert.equal(easternKickoff("2026-10-31", "20:00"), "2026-11-01T00:00:00.000Z");
  assert.equal(easternKickoff("2026-11-01", "20:00"), "2026-11-02T01:00:00.000Z");
  assert.equal(easternDate("2026-11-01T03:59:00Z"), "2026-10-31");
  assert.deepEqual(["2026-10-31", "2026-10-31T16:00Z", "2026-10-31T02:30Z"].sort(compareGameDates), ["2026-10-31T02:30Z", "2026-10-31T16:00Z", "2026-10-31"]);
});

test("corrected finals replace one stable event, reconcile records idempotently and preserve negative statistics", () => {
  const final = {provider_id:"one",game_id:"2026-10-24-a-at-b",teams:[{slug:"a",points:7},{slug:"b",points:0}],verified_at:"2026-10-25T10:00Z",meta:{},title:"Final/OT"};
  const snapshot = {playedGames:[final],scheduledGames:[],teamRecords:{a:"1-0",b:"0-1"},metrics:{value:-2.5},retainedBaseline:{conferenceStandings:[{rows:[{team_slug:"a"},{team_slug:"b"}]}]}};
  const review = {finals:[{...final,teams:[{slug:"a",points:7},{slug:"b",points:10}]}],scheduled:[],scheduleWeeks:[9],records:{a:"0-1",b:"1-0"},conferenceRecords:{a:"0-1",b:"1-0"},observedAt:"2026-10-25T11:00Z"};
  const corrected = reconcileGameDay(snapshot, review), repeated = reconcileGameDay(corrected, review);
  assert.equal(corrected.playedGames.length, 1); assert.equal(corrected.playedGames[0].game_id, final.game_id);
  assert.equal(corrected.playedGames[0].meta.correction_history.length, 1);
  assert.equal(corrected.playedGames[0].title, "Final/OT"); assert.equal(corrected.metrics.value, -2.5);
  assert.deepEqual(repeated, corrected); assert.deepEqual(corrected.teamRecords, review.records);
  assert.throws(() => reconcileGameDay(snapshot, {...review,finals:[review.finals[0],review.finals[0]]}), /Duplicate/);
  assert.equal(snapshot.playedGames[0].teams[1].points, 0);
});

test("postponed, canceled and delayed games never become scheduled or inferred finals", () => {
  const game = games.find(g => g.week === 9 && g.status === "scheduled"); assert.ok(game);
  for (const status of ["postponed", "canceled", "delayed"] as const) {
    assert.equal(reviewedScheduleStatus(status), status);
    const projected = publicGame({...game,status,date:"2026-10-01T00:00Z"}, now);
    assert.equal(projected.status, status); assert.equal(projected.homeScore, null); assert.doesNotMatch(projected.statusDetail ?? "", /result not yet verified/);
  }
  const app = games.find(g => g.id === "2026-10-22-james-madison-at-appalachian-state");
  assert.equal(app?.homeScore, 34); assert.equal(app?.awayScore, 31); assert.match(app?.statusDetail ?? "", /OT/);
});

test("scheduled kickoff, listed time and unverified actual start remain separate", () => {
  const raw = JSON.parse(readFileSync(new URL("../data/cfb-2026/refresh/verified-refresh.json", import.meta.url), "utf8"));
  const row = raw.playedGames.find((g: {provider_id:string}) => g.provider_id === "401864527");
  assert.equal(Date.parse(row.kickoff_utc), Date.parse("2026-10-25T02:00Z"));
  assert.equal(Date.parse(row.meta.listed_kickoff_observations.espn), Date.parse("2026-10-25T02:20Z"));
  assert.equal(row.meta.listed_kickoff_observations.actual_start, null);
  assert.equal(row.meta.originally_scheduled_kickoff_utc, row.kickoff_utc);
});

test("poll publication and per-module source dates do not follow build or request time", () => {
  const first = gameDaySnapshot(now), later = gameDaySnapshot(now + 86400000);
  assert.deepEqual(first.sourceDates, later.sourceDates); assert.equal(first.revision, later.revision);
  assert.ok(first.polls.every(p => p.release_date === "2026-10-25"));
  assert.equal(sourceDateLabel("2026-10-25"), "Oct 25, 2026");
  assert.equal(verifiedRefresh?.metrics.through_games, "2026-10-27");
  assert.equal(first.injuries.week, 8); assert.notEqual(first.sourceDates.injuries, first.sourceDates.schedule);
});

test("the October 18 poll edition remains an archive when October 25 becomes current", () => {
  const raw = JSON.parse(readFileSync(new URL("../data/cfb-2026/refresh/verified-refresh.json", import.meta.url), "utf8"));
  const previous = raw.poll_history.find((p: {release_date:string}) => p.release_date === "2026-10-18").polls.find((p: {poll:string}) => p.poll === "ap");
  assert.equal(previous.rankings.find((r: {team_slug:string}) => r.team_slug === "byu").rank, 2);
  assert.equal(previous.others.find((r: {team_slug:string}) => r.team_slug === "oklahoma-state").points, 128);
});

test("malformed refreshes fail closed so callers retain the last-good version and source dates", () => {
  const lastGood = gameDaySnapshot(now);
  for (const response of [null, {...lastGood,games:[null]}, {...lastGood,weeks:[null]}, {...lastGood,revision:"bad"}, gameDaySnapshot(now,"8")]) {
    const retained = isReviewedGameDayRefresh(response, 9) ? response : lastGood;
    assert.equal(retained, lastGood); assert.deepEqual(retained.sourceDates, lastGood.sourceDates);
  }
});

test("school TV confirmation cannot borrow a network from another game card", () => {
  const html = '<section><article>Oct 31 Arizona ESPN</article><article>Oct 24 Iowa ABC</article></section>';
  const blocks = schoolBlocks(html, "31", ["Arizona"]);
  assert.deepEqual(blocks, ["Oct 31 Arizona ESPN"]);
  assert.ok(blocks.some(b => tvPattern("ESPN").test(b)));
  assert.ok(!blocks.some(b => tvPattern("ABC").test(b)));
});

test("refresh validation rejects unsupported statuses and invalid scores while retaining provisional scores", () => {
  const lastGood = gameDaySnapshot(now), game = lastGood.games[0];
  assert.ok(game);
  const refresh = (value: object) => ({...lastGood,games:[{...game,...value}]});
  for (const status of ["live-ish", "", "FINAL", null]) {
    const response = refresh({status});
    assert.equal(isReviewedGameDayRefresh(response, 9), false);
    assert.equal(isReviewedGameDayRefresh(response, 9) ? response : lastGood, lastGood);
  }
  for (const score of [0.5, -1, NaN, Infinity, "7", undefined]) {
    assert.equal(isReviewedGameDayRefresh(refresh({status:"final",homeScore:score,awayScore:7}), 9), false);
  }
  assert.equal(isReviewedGameDayRefresh(refresh({status:"final",homeScore:null,awayScore:7}), 9), false);
  assert.equal(isReviewedGameDayRefresh(refresh({status:"final",homeScore:0,awayScore:7}), 9), true);
  for (const status of ["scheduled", "delayed", "postponed", "canceled"]) {
    assert.equal(isReviewedGameDayRefresh(refresh({status,homeScore:null,awayScore:null}), 9), true);
  }
  const delayed = refresh({status:"delayed",homeScore:14,awayScore:0});
  assert.equal(isReviewedGameDayRefresh(delayed, 9), true);
  assert.equal(delayed.games[0].homeScore, 14);
  assert.equal(delayed.games[0].awayScore, 0);
});

test("reconciliation rejects duplicate logical inputs and replaces a changed provider ID once", () => {
  const final = {provider_id:"old",game_id:"2026-10-24-a-at-b",teams:[{slug:"a",points:7},{slug:"b",points:0}],verified_at:"2026-10-25T10:00Z"};
  const snapshot = {playedGames:[final],scheduledGames:[],teamRecords:{a:"1-0",b:"0-1"},retainedBaseline:{conferenceStandings:[{rows:[{team_slug:"a"},{team_slug:"b"}]}]}};
  const review = {finals:[{...final,provider_id:"new"}],scheduled:[],scheduleWeeks:[9],records:{a:"1-0",b:"0-1"},conferenceRecords:{a:"1-0",b:"0-1"},observedAt:"2026-10-25T11:00Z"};
  const replaced = reconcileGameDay(snapshot, review);
  assert.equal(replaced.playedGames.length, 1);
  assert.equal(replaced.playedGames[0].provider_id, "new");
  assert.deepEqual(reconcileGameDay(replaced, review), replaced);
  assert.throws(() => reconcileGameDay(snapshot, {...review,finals:[final,{...final,provider_id:"other"}]}), /Duplicate logical/);
  const scheduled = {provider_id:"fixture",date:"2026-10-31",away:"a",home:"b",game_status:"scheduled"};
  assert.throws(() => reconcileGameDay(snapshot, {...review,finals:[],scheduled:[scheduled,{...scheduled,provider_id:"other-fixture"}]}), /Duplicate logical/);
  const overlap = {...scheduled,date:"2026-10-24"};
  assert.throws(() => reconcileGameDay(snapshot, {...review,scheduled:[overlap]}), /Duplicate logical/);
  assert.equal(snapshot.playedGames[0].provider_id, "old");
  assert.equal(snapshot.scheduledGames.length, 0);
});

test("provider schedule mapping preserves delayed and rejects an unknown state", () => {
  for (const [name, expected] of [["STATUS_SCHEDULED","scheduled"],["STATUS_TIME_TBD","scheduled"],["Delayed","delayed"],["STATUS_DELAYED","delayed"],["STATUS_POSTPONED","postponed"],["STATUS_CANCELED","canceled"],["Cancelled","canceled"]]) {
    assert.equal(sourceScheduleStatus(name), expected);
  }
  assert.throws(() => sourceScheduleStatus("STATUS_UNKNOWN"), /Unsupported source schedule status/);
});

test("NCAA JSON extraction follows HTML script parsing and ignores lookalike attributes", () => {
  const payload = JSON.stringify({scoreboard:{seasonYear:"2026",currentDate:{week:"09"},initialGames:[{contestId:123}]}});
  for (const tag of ["script", "SCRIPT", "ScRiPt"]) {
    const html = `<script data-note="prefix-drupal-settings-json">invalid</script><${tag} data-drupal-selector="drupal-settings-json" type="application/json">${payload}</${tag} >`;
    assert.deepEqual(ncaaInventory(html, 2026, 9), [{contestId:123}]);
  }
  assert.throws(() => ncaaInventory("<script>not settings</script>", 2026, 9), /settings missing/);
  assert.throws(() => ncaaInventory(`<script id="drupal-settings-json">${payload}</script>`, 2026, 8));
  assert.equal(htmlText("<SCRIPT>Oct 31 Wrong ESPN</SCRIPT ><p>Oct 31 Arizona &amp; State</p>"), "Oct 31 Arizona & State");
});

test("unknown TV labels are literal regular-expression input", () => {
  for (const label of ["ESPN(2)", "Channel\\\\One", "A+B", "toString"]) assert.ok(tvPattern(label).test(label));
  assert.equal(tvPattern("ESPN(2)").test("ESPN2"), false);
  assert.equal(tvPattern("A.B").test("AxB"), false);
  assert.ok(tvPattern("MW+").test("Mountain West Network"));
  assert.ok(tvPattern("ESPN+").test("ESPN Plus"));
});

test("source evidence retains the strict two-hour gate after current observations are compared", () => {
  const clock = Date.parse("2026-10-26T14:00:00Z");
  assert.equal(isSourceEvidenceFresh("2026-10-26T12:00:00.001Z", clock), true);
  assert.equal(isSourceEvidenceFresh("2026-10-26T12:00:00Z", clock), false);
  assert.equal(isSourceEvidenceFresh("2026-10-25T14:00:00Z", clock), false);
  assert.equal(isSourceEvidenceFresh("2026-10-26T14:00:00.001Z", clock), false);
  assert.equal(isSourceEvidenceFresh("invalid", clock), false);
});

test("smoke matching removes HTML comment nodes while preserving script text and template content", () => {
  const normalized = withoutHtmlComments('<main>WEEK <!--react marker-->9</main><template><!--hidden marker--><p>Archive</p></template><script>const marker = "<!--literal-->";</script>');
  assert.ok(normalized.includes("WEEK 9"));
  assert.ok(normalized.includes("<p>Archive</p>"));
  assert.ok(normalized.includes('const marker = "<!--literal-->";'));
  assert.equal(normalized.includes("<!--react marker-->"), false);
  assert.equal(normalized.includes("<!--hidden marker-->"), false);
});

test("October 28 release separates two finals, 54 upcoming games and 138 whole-team records", async () => {
  const snapshot = gameDaySnapshot(now, "9");
  assert.equal(snapshot.games.length, 56);
  assert.equal(snapshot.games.filter(g => g.status === "final").length, 2);
  assert.equal(snapshot.games.filter(g => g.status === "scheduled").length, 54);
  for (const [id, away, home] of [["2026-10-27-delaware-at-western-kentucky",35,21],["2026-10-27-sam-houston-at-missouri-state",3,24]] as const) {
    const game = snapshot.games.find(g => g.id === id); assert.ok(game);
    assert.equal(game.awayScore, away); assert.equal(game.homeScore, home); assert.equal(game.status, "final");
  }
  const keys = snapshot.games.map(g => `${easternDate(g.date)}:${g.awayTeamId}:${g.homeTeamId}`);
  assert.equal(new Set(keys).size, 56);
  assert.equal(new Set(evidence.primaryRecords.map((r: {slug:string}) => r.slug)).size, 138);
  assert.equal(verifiedRefresh?.teamRecords.lsu, "6-2", "includes LSU's FCS win");
  assert.equal(verifiedRefresh?.teamRecords.delaware, "4-4");
  const ap = snapshot.polls.find(p => p.poll === "ap"); assert.ok(ap);
  assert.equal(ap.rankings.filter(r => r.rank === 20).length, 2);
  assert.equal(ap.rankings.filter(r => r.rank === 21).length, 0);
  const { noNames } = await import("../lib/no-names.ts");
  assert.ok(noNames.filter(p => p.stars == null).every(p => p.howAcquired === "unknown"));
  const injury = snapshot.injuries.contextNotes.find(r => r.player === "Julian Sayin" && r.source_as_of === "2026-10-27");
  assert.ok(injury); assert.match(injury.note, /not an official Week 9 game-day designation/);
  assert.equal(snapshot.injuries.asOf, "2026-10-22");
  assert.ok(!snapshot.injuries.officialReports.some(r => r.game_date === "2026-10-31"));
});


test("complete season inventory includes FCS records, restores omitted finals and preserves duplicate URLs", () => {
  const snapshot = JSON.parse(readFileSync(new URL("../data/cfb-2026/refresh/verified-refresh.json", import.meta.url), "utf8"));
  const audit = JSON.parse(readFileSync(new URL("../data/cfb-2026/refresh/evidence/2026-10-28-full-season-audit.json", import.meta.url), "utf8"));
  const result = verifyFullSeason(snapshot, audit);
  assert.deepEqual([result.completed, result.fbsFinals, result.fcsFinals, result.records], [568, 446, 122, 138]);
  assert.equal(audit.additions.length, 17);
  for (const id of audit.additions) assert.equal(getGame(id)?.status, "final");
  for (const [alias, canonical] of Object.entries(snapshot.gameAliases)) assert.equal(getGame(alias)?.id, canonical);
  assert.equal(games.filter(g => g.status === "final" && [g.homeTeamId, g.awayTeamId].includes("memphis") && [g.homeTeamId, g.awayTeamId].includes("unlv")).length, 1);
  const missing = structuredClone(snapshot); missing.playedGames.pop();
  assert.throws(() => verifyFullSeason(missing, audit));
});
