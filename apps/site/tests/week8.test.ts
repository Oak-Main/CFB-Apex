import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { boardWeeks, games, pollTables, verifiedRefresh } from "../lib/cfb-dataset.ts";
import { easternDate } from "../lib/game-calendar.ts";
import { tickerGamesFor } from "../lib/homepage-data.ts";
import { selectBoardWeek } from "../lib/week-cutover.ts";
import { athleteHighlight, heismanWatch, heismanBoard, oddsRank, panelBrief, playoffAudit, upsetWatch } from "../lib/awards-watch.ts";
import { injuryResearch } from "../lib/injury-report.ts";

const evidence = JSON.parse(readFileSync(new URL("../data/cfb-2026/refresh/evidence/2026-10-20-week8-release.json", import.meta.url), "utf8"));
const tvFollowup = JSON.parse(readFileSync(new URL("../data/cfb-2026/refresh/evidence/2026-10-20-tv-followup.json", import.meta.url), "utf8"));

test("Week 8 selects on the server and Week 7 remains an explicit archive", () => {
  assert.equal(selectBoardWeek(boardWeeks, Date.parse("2026-10-18T12:59:59Z")).week, 7);
  assert.equal(selectBoardWeek(boardWeeks, Date.parse("2026-10-18T13:00:00Z")).week, 8);
  assert.equal(selectBoardWeek(boardWeeks, Date.parse("2026-10-20T19:00:00Z"), "7").week, 7);
  assert.equal(verifiedRefresh?.week, 8);
  assert.equal(boardWeeks.find(w => w.week === 8)?.marquee_game_id, "2026-10-24-houston-at-utah");
});

test("all 59 Week 7 finals match completed ESPN and NCAA scores with stable identities", () => {
  const finals = games.filter(g => g.week === 7);
  assert.equal(finals.length, 59);
  assert.equal(new Set(finals.map(g => g.id)).size, 59);
  for (const row of evidence.finals) {
    const game = finals.find(g => g.id === `${row.date}-${row.away}-at-${row.home}`);
    assert.ok(game);
    assert.equal(game.status, "final");
    assert.equal(row.status.type.completed, true);
    assert.equal(row.status.type.state, "post");
    assert.equal(game.homeScore, row.ncaa.home_score);
    assert.equal(game.awayScore, row.ncaa.away_score);
    assert.equal(row.home_lines.reduce((a: number, b: number) => a + b, 0), game.homeScore);
    assert.equal(row.away_lines.reduce((a: number, b: number) => a + b, 0), game.awayScore);
  }
  assert.deepEqual(evidence.macro, { games: 59, midweek: 10, saturday: 49, within_three_points: 14, overtime_games: 4, road_winners: 26, ranked_participants: 22, ranked_losses: 8 });
  assert.equal(evidence.excluded_finals.length, 3);
  assert.ok(evidence.excluded_finals.every((g: { id: string }) => !evidence.finals.some((f: { id: string }) => f.id === g.id)));
});

test("Week 8 is complete, uses Eastern dates and has school support for every kickoff", () => {
  const slate = games.filter(g => g.week === 8);
  assert.equal(slate.length, 56);
  assert.equal(new Set(evidence.schedule.map((g: { id: string }) => g.id)).size, 56);
  assert.ok(slate.every(g => g.status === "scheduled" && g.homeScore == null && g.awayScore == null));
  const counts: Record<string, number> = {};
  for (const game of slate) counts[easternDate(game.date)] = (counts[easternDate(game.date)] ?? 0) + 1;
  assert.deepEqual(counts, { "2026-10-20": 3, "2026-10-21": 1, "2026-10-22": 3, "2026-10-23": 5, "2026-10-24": 44 });
  const hosts = JSON.parse(readFileSync(new URL("../data/cfb-2026/refresh/official-school-hosts.json", import.meta.url), "utf8")).hosts;
  for (const row of evidence.schedule) {
    assert.equal(row.school_source.team, row.home);
    for (const source of [row.school_source, ...row.additional_school_sources]) {
      assert.ok([row.home, row.away].includes(source.team));
      assert.equal(source.home, row.home);
      assert.equal(source.away, row.away);
      assert.equal(source.date, row.date);
    }
    assert.equal(new URL(row.school_source.url).hostname, hosts[row.school_source.team]);
    assert.equal(row.school_source.kickoff_utc, row.kickoff_utc);
    assert.equal(row.timeValid, true);
  }
  const pending = slate.filter(g => !g.broadcast);
  assert.deepEqual(pending, []);
  const resolved = slate.find(g => g.id === tvFollowup.game_id);
  assert.ok(resolved);
  assert.equal(resolved.broadcast, "ESPN+");
  assert.equal(tvFollowup.school.team, resolved.homeTeamId);
  assert.equal(new URL(tvFollowup.school.url).hostname, hosts[tvFollowup.school.team]);
  assert.deepEqual(tvFollowup.school.matchup, { home: "ball-state", away: "sacramento-state", date: "2026-10-24" });
  assert.equal(Date.parse(tvFollowup.kickoff_utc), Date.parse(tvFollowup.espn.kickoff_utc));
  assert.equal(tvFollowup.espn.time_valid, true);
  assert.ok(tvFollowup.espn.broadcasts.includes(resolved.broadcast));
  assert.match(resolved.statusDetail, /confirmed by Ball State/);
  assert.doesNotMatch(resolved.statusDetail, /pending|not adopted/i);
  assert.equal(slate.find(g => g.id.includes("rutgers-at-northwestern"))?.broadcast, "Peacock");
  assert.equal(easternDate(slate.find(g => g.id.includes("liberty-at-kennesaw-state"))?.date ?? ""), "2026-10-22");
  const ap = new Set(pollTables.find(p => p.poll === "ap")?.rankings.map(r => r.team_slug));
  assert.equal(slate.filter(g => ap.has(g.homeTeamId) || ap.has(g.awayTeamId)).length, 17);
  assert.equal(slate.filter(g => ap.has(g.homeTeamId) && ap.has(g.awayTeamId)).length, 2);
});

test("the current ticker leads with Week 7 finals and Week 8 games", () => {
  const ticker = tickerGamesFor(8);
  assert.ok(ticker.slice(0, 8).every(g => easternDate(g.date) === "2026-10-17" && g.status === "final"));
  assert.ok(ticker.slice(8).every(g => easternDate(g.date) >= "2026-10-20" && g.status === "scheduled"));
});

test("source cutoffs advance separately and all 138 records reconcile", () => {
  assert.equal(verifiedRefresh?.metrics.through_games, "2026-10-17");
  assert.deepEqual(pollTables.filter(p => p.poll !== "composite").map(p => p.release_date), ["2026-10-18", "2026-10-18"]);
  assert.equal(pollTables.find(p => p.poll === "ap")?.rankings[0].team_slug, "miami-fl");
  for (const move of verifiedRefresh?.poll_notes?.movers_ap ?? []) assert.equal(move.move, move.to - move.from);
  assert.equal(verifiedRefresh?.poll_notes?.movers_ap.find(r => r.team_slug === "byu")?.move, -6);
  assert.equal(verifiedRefresh?.poll_notes?.movers_ap.find(r => r.team_slug === "texas")?.move, 12);
  assert.equal(evidence.reconciliation.overall_records_checked, 138);
  assert.equal(evidence.reconciliation.disagreements, 0);
  assert.equal(verifiedRefresh?.metrics.categories[0].rows[0].value, 2604);
  assert.equal(boardWeeks.find(w => w.week === 6)?.retrieved_at, "2026-10-05T07:24:21.400874Z");
  for (const row of evidence.conferences.flatMap((c: { rows: unknown[] }) => c.rows)) {
    assert.equal(verifiedRefresh?.teamRecords[row.slug], row.overall);
  }
});

test("current editorial modules retain their independently dated facts", () => {
  assert.equal(athleteHighlight.week, 7);
  assert.equal(athleteHighlight.athlete_of_the_week?.player, "DeSean Bishop");
  assert.equal(panelBrief.week, 8);
  assert.equal(playoffAudit.week, 8);
  assert.ok(playoffAudit.contenders.every(c => c.losses_that_end_case == null && c.remaining_sos == null));
  assert.equal(heismanWatch.week, 8);
  assert.equal(heismanWatch.contenders.length, 7);
  assert.equal(heismanWatch.odds_as_of, "2026-10-20");
  assert.equal(upsetWatch.week, 8);
  assert.equal(upsetWatch.picks.length, 3);
  assert.equal(upsetWatch.trap, null);
  assert.match(injuryResearch.coverageNote ?? "", /Week 8 research completed/);
  assert.match(injuryResearch.ledger.find(r => r.player === "Nico Iamaleava")?.detail ?? "", /rest of the season/);
  assert.equal(injuryResearch.ledger.filter(r => r.sourceAsOf === "2026-10-05").length, 6);
});

test("Week 8 research keeps unknown returns, reported statuses and medical context distinct", () => {
  assert.equal(injuryResearch.watch.length, 11);
  assert.equal(injuryResearch.contextNotes.length, 2);
  assert.ok(injuryResearch.watch.every(r => Object.values(r.practice).every(v => v == null) && r.likelihood == null && r.sourceAsOf && r.sources.length));
  assert.equal(injuryResearch.watch.find(r => r.player === "Khobie Martin")?.reportedStatus, "Week 8 return unconfirmed");
  assert.equal(injuryResearch.watch.find(r => r.player === "Kamario Taylor")?.reportedStatus, "Official Questionable · October 24");
  assert.match(injuryResearch.watch.find(r => r.player === "Kamario Taylor")?.note ?? "", /No medical clearance or practice participation is inferred/);
  assert.match(injuryResearch.contextNotes.find(r => r.player === "Hank Brown")?.note ?? "", /reported healthy/);
  assert.ok(!injuryResearch.watch.some(r => ["Hank Brown", "Brock Thomas", "Dylan Raiola"].includes(r.player)));
  assert.equal(injuryResearch.ledger.find(r => r.player === "James Laubstein")?.status, "IR");
  assert.equal(injuryResearch.ledger.find(r => r.player === "Donte Lee Jr.")?.status, "IR");
});

test("Heisman signed prices sort favorites correctly and invalid formats stay unpriced", () => {
  const example = heismanWatch.contenders[0];
  const rank = (value: string) => oddsRank({ ...example, odds_as_reported: [{ outlet: "test", value }] });
  assert.ok(rank("-125") < rank("-110"));
  assert.ok(rank("-110") < rank("+100"));
  assert.ok(rank("+100") < rank("+325"));
  for (const value of ["N/A", "12/1", "EVEN", "+99", "-20", "+100 text"]) assert.equal(rank(value), Number.POSITIVE_INFINITY);
  assert.ok(rank("+150000") < rank("N/A"));
  assert.equal(heismanBoard()[0].player, "Jeremiah Smith");
  assert.ok(heismanWatch.contenders.every(r => r.confidence === "medium" && r.stat_line.startsWith("Week 7:")));
});

test("upset entries match literal provider lines, eligible dogs, and Week 8 identities", () => {
  const research = JSON.parse(readFileSync(new URL("../data/cfb-2026/refresh/evidence/2026-10-20-week8-research.json", import.meta.url), "utf8"));
  for (const pick of upsetWatch.picks) {
    const source = research.upset_lines.find((r: { url: string }) => r.url === pick.line_source_url);
    assert.ok(source);
    assert.equal(pick.line, pick.underdog_slug === pick.away_slug ? source.away_line : source.home_line);
    assert.ok(Number(pick.line) >= 6);
    assert.equal(pick.line_observed_at, source.retrieved_at);
    assert.ok(pick.case?.includes("Counterweight:"));
    assert.ok(games.some(g => g.week === 8 && g.homeTeamId === pick.home_slug && g.awayTeamId === pick.away_slug));
    assert.ok(pick.sources.length >= 2);
  }
  assert.ok(!upsetWatch.picks.some(r => r.home_slug === "wisconsin"));
});
