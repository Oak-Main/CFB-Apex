import assert from "node:assert/strict";
import test from "node:test";
import {
  easternDate,
  easternKickoff,
  gameKey,
  seasonWeek,
} from "../lib/game-calendar.ts";
import {
  boardWeeks,
  games,
  getTeamSchedule,
  pollTables,
  teams,
  verifiedRefresh,
} from "../lib/cfb-dataset.ts";
import { boardWeekStart, homepageData, tickerGames, tickerGamesFor } from "../lib/homepage-data.ts";
import { dateLabel, featuredGame, weekGames } from "../lib/homepage.ts";

test("Eastern dates keep Friday finals and late Saturday games on the correct day", () => {
  assert.equal(easternDate("2026-10-03T00:00Z"), "2026-10-02");
  assert.match(dateLabel("2026-10-03T00:00Z"), /Fri, Oct 2/);
  assert.equal(easternDate("2026-10-04T03:59Z"), "2026-10-03");
  assert.equal(seasonWeek("2026-10-03T00:00Z"), 5);
  assert.equal(seasonWeek("2026-10-03T19:30Z"), 5);
  assert.equal(
    easternKickoff("2026-10-03", "11:00"),
    "2026-10-03T15:00:00.000Z",
  );
  assert.equal(
    easternKickoff("2026-11-07", "12:00"),
    "2026-11-07T17:00:00.000Z",
  );
});

test("the Week 6 archive board and its ticker share the verified Week 6 snapshot", () => {
  const slate = weekGames(games, boardWeekStart(6));
  const tickerGames = tickerGamesFor(6);
  // 58 FBS-vs-FBS games, every one a verified final after the October 11 results refresh.
  assert.equal(slate.length, 58);
  assert.equal(slate.filter((game) => game.status === "final").length, 58);
  assert.equal(slate.filter((game) => game.status === "scheduled").length, 0);
  assert.ok(
    !slate.some((game) => /final not yet verified/.test(game.statusDetail)),
    "no Week 6 game is left waiting on a result",
  );
  assert.equal(
    new Set(
      slate.map((game) => gameKey(game.date, game.awayTeamId, game.homeTeamId)),
    ).size,
    slate.length,
  );
  assert.equal(tickerGames.length, 8);
  assert.ok(
    tickerGames.every((game) => game.status === "final" && easternDate(game.date) === "2026-10-10"),
    "the archive ticker leads with the latest Saturday finals and has nothing upcoming",
  );
  assert.ok(slate.every((game) => games.find((row) => row.id === game.id)?.week === 6));
  assert.ok(
    tickerGames.every((game) => slate.some((row) => row.id === game.id)),
  );
  assert.equal(featuredGame(slate, teams)?.id, "2026-10-10-georgia-at-alabama");
});

test("published assignments override stale dates without duplicate scheduled finals", () => {
  const slate = weekGames(games, "2026-10-03");
  assert.equal(slate.length, 56);
  assert.ok(slate.every((game) => game.status === "final"));
  assert.equal(
    slate.filter(
      (game) =>
        game.awayTeamId === "penn-state" && game.homeTeamId === "northwestern",
    ).length,
    1,
  );
  assert.equal(
    slate.find((game) => game.awayTeamId === "memphis")?.date,
    "2026-10-03T15:00Z",
  );
  assert.equal(
    slate.filter(
      (game) =>
        game.awayTeamId === "fresno-state" &&
        game.homeTeamId === "washington-state",
    ).length,
    1,
  );
  assert.ok(
    slate
      .filter((game) => game.status === "scheduled")
      .every((game) => game.homeScore == null && game.awayScore == null),
  );
});

test("source dates and unknown records remain honest while Miami resolves to ACC", () => {
  const miami = pollTables
    .find((poll) => poll.poll === "ap")
    ?.rankings.find((row) => row.rank === 4);
  assert.equal(miami?.team_slug, "miami-fl");
  assert.equal(
    teams.find((team) => team.slug === miami?.team_slug)?.conference,
    "Atlantic Coast Conference",
  );
  assert.equal(homepageData.portalAsOf, "2026-09-07");
  assert.equal(verifiedRefresh?.metrics.through_games, "2026-10-03");
  assert.equal(
    verifiedRefresh?.metrics.categories[0].rows.find(
      (row) => row.name === "Kevin Jennings",
    )?.value,
    1588,
  );
  assert.equal(teams.find((team) => team.slug === "penn-state")?.record, "3–3");
  assert.equal(teams.find((team) => team.slug === "fiu")?.record, "3–2");
  // App State's record was withheld until its Oct 10 final was verified; it now
  // carries that final, with the school and ESPN agreeing.
  assert.equal(
    teams.find((team) => team.slug === "appalachian-state")?.record,
    "3–2",
  );
});

test("the two wrongly excluded FBS games are restored with records and TV", () => {
  const slate = weekGames(games, boardWeekStart(6));
  const nmsuFiu = slate.find(
    (game) => game.awayTeamId === "new-mexico-state" && game.homeTeamId === "fiu",
  );
  assert.ok(nmsuFiu, "New Mexico State at FIU is on the Week 6 board");
  assert.equal(nmsuFiu?.broadcast, "ESPN2");
  assert.equal(nmsuFiu?.date, "2026-10-07T23:30Z");
  assert.equal(nmsuFiu?.status, "final");
  const oduApp = slate.find(
    (game) => game.awayTeamId === "old-dominion" && game.homeTeamId === "appalachian-state",
  );
  assert.ok(oduApp, "Old Dominion at App State is on the Week 6 board");
  assert.equal(oduApp?.broadcast, "ESPN+");
  assert.equal(oduApp?.date, "2026-10-10T17:00Z");
  // Only true FCS-opponent games remain excluded, each with conference-id evidence.
  for (const row of verifiedRefresh?.excludedGames ?? []) {
    assert.ok(row.espn_conference_ids, `${row.name} carries exclusion evidence`);
  }
  assert.equal(verifiedRefresh?.excludedGames?.length, 6);
  assert.equal(verifiedRefresh?.excludedGames?.filter((row) => row.date < "2026-10-12").length, 3);
});

test("October 4 polls carry others receiving votes, movers, debuts and gaps", () => {
  const ap = pollTables.find((poll) => poll.poll === "ap")!;
  const coaches = pollTables.find((poll) => poll.poll === "coaches")!;
  assert.equal(ap.others.length, 10);
  assert.equal(coaches.others.length, 15);
  assert.equal(ap.others[0].team_slug, "kentucky");
  assert.equal(ap.others[0].points, 160);
  assert.equal(coaches.others[0].team_slug, "oklahoma-state");
  assert.equal(coaches.others[0].points, 187);
  const notes = verifiedRefresh?.poll_notes;
  assert.ok(notes, "poll notes published");
  const missouri = notes?.movers_ap.find((row) => row.team_slug === "missouri");
  assert.equal(missouri?.from, 25);
  assert.equal(missouri?.to, 14);
  assert.deepEqual(
    notes?.debuts_ap.map((row) => row.team_slug),
    ["pittsburgh"],
  );
  assert.deepEqual(
    notes?.dropped_out.ap.map((row) => row.team_slug),
    ["kentucky"],
  );
  assert.deepEqual(
    notes?.dropped_out.coaches.map((row) => row.team_slug).sort(),
    ["michigan", "penn-state"],
  );
  const apOnly = notes?.poll_gaps.ap_only.map((row) => row.team_slug).sort();
  assert.deepEqual(apOnly, ["boise-state", "oklahoma-state"]);
  const coachesOnly = notes?.poll_gaps.coaches_only.map((row) => row.team_slug).sort();
  assert.deepEqual(coachesOnly, ["duke", "kentucky"]);
});

test("verified additions: GameDay badge, ranked matchups, NDSU storyline, standings", () => {
  const gameday = verifiedRefresh?.broadcast_events?.find(
    (event) => event.type === "college-gameday",
  );
  assert.ok(gameday, "College GameDay event published");
  assert.equal(gameday?.game_provider_id, "401856712");
  assert.match(gameday?.badge ?? "", /Tuscaloosa/);
  const matchups = verifiedRefresh?.ranked_matchups ?? [];
  assert.ok(matchups.some((row) => /Georgia/.test(row.matchup) && /Alabama/.test(row.matchup)));
  assert.ok(matchups.some((row) => /UCLA/.test(row.matchup) && /Oregon/.test(row.matchup)));
  assert.ok(matchups.some((row) => row.polls.includes("Coaches only") && /Kentucky/.test(row.matchup)));
  assert.ok(
    verifiedRefresh?.storylines?.some((row) => row.id === "ndsu-first-fbs-season"),
  );
  const standings = verifiedRefresh?.retainedBaseline?.conferenceStandings ?? [];
  const sunBelt = standings.find((conf) => conf.slug === "sun-belt");
  assert.ok(sunBelt, "Sun Belt standings table present");
  assert.ok(sunBelt.rows.length >= 10);
  assert.ok(sunBelt.rows.every((row) => row.team_slug), "every Sun Belt row links to a team hub");
  const sec = standings.find((conf) => conf.slug === "sec");
  // W/L are conference games (Georgia 5-0 overall, 3-0 SEC), not overall wins.
  const georgia = sec?.rows.find((row) => row.team_slug === "georgia");
  assert.equal(`${georgia?.w}-${georgia?.l}`, "3-0");
  assert.equal(georgia?.overall, "5-0");
  for (const conf of standings) {
    assert.ok(conf.rows.every((row) => row.team_slug), `${conf.slug} rows all linked`);
    for (const row of conf.rows) {
      // The tables keep their October 10 date; so do the overall records beside them.
      const record = row.team_slug ? verifiedRefresh?.retainedBaseline?.overall_records?.[row.team_slug] : undefined;
      const [ow, ol] = (record ?? "").split("-").map(Number);
      assert.equal(row.overall, record, `${row.team_slug} overall matches the October 10 records`);
      assert.ok(Number(row.w) <= ow && Number(row.l) <= ol, `${row.team_slug} conference record fits inside overall`);
    }
  }
});

test("editorial composite follows the documented mean-rank and AP tie break without poll votes", () => {
  const ap = pollTables.find((poll) => poll.poll === "ap")!;
  const coaches = pollTables.find((poll) => poll.poll === "coaches")!;
  const composite = pollTables.find((poll) => poll.poll === "composite")!;
  const rank = (poll: typeof ap, slug: string | null) => poll.rankings.find((row) => row.team_slug === slug)?.rank ?? 26;
  const expected = [...new Set([...ap.rankings, ...coaches.rankings].map((row) => row.team_slug))]
    .sort((a, b) => (rank(ap, a) + rank(coaches, a)) - (rank(ap, b) + rank(coaches, b)) || rank(ap, a) - rank(ap, b));
  assert.deepEqual(composite.rankings.map((row) => row.team_slug), expected);
  assert.ok(composite.rankings.every((row) => row.points == null && row.first_place_votes == null));
});

/* ---------------------------------------------------------------------------
 * Oct 9 midweek refresh: the seven Tue-Thu Week 6 games are final.
 * Each must appear exactly once, as final, never as upcoming, with the
 * verified score, its original Eastern game date, and stable ids.
 * ------------------------------------------------------------------------- */
const MIDWEEK_FINALS = [
  { id: "2026-10-06-southern-miss-at-troy", provider: "401871090", away: "southern-miss", home: "troy", awayScore: 34, homeScore: 55, dateEt: "2026-10-06", kickoffUtc: "2026-10-07T00:00Z" },
  { id: "2026-10-07-jacksonville-state-at-kennesaw-state", provider: "401871051", away: "jacksonville-state", home: "kennesaw-state", awayScore: 27, homeScore: 26, dateEt: "2026-10-07", kickoffUtc: "2026-10-07T23:00Z" },
  { id: "2026-10-07-new-mexico-state-at-fiu", provider: "401871066", away: "new-mexico-state", home: "fiu", awayScore: 3, homeScore: 22, dateEt: "2026-10-07", kickoffUtc: "2026-10-07T23:30Z" },
  { id: "2026-10-08-sam-houston-at-liberty", provider: "401870766", away: "sam-houston", home: "liberty", awayScore: 3, homeScore: 35, dateEt: "2026-10-08", kickoffUtc: "2026-10-08T23:00Z" },
  { id: "2026-10-08-missouri-state-at-western-kentucky", provider: "401871052", away: "missouri-state", home: "western-kentucky", awayScore: 13, homeScore: 34, dateEt: "2026-10-08", kickoffUtc: "2026-10-08T23:00Z" },
  { id: "2026-10-08-south-florida-at-utsa", provider: "401862794", away: "south-florida", home: "utsa", awayScore: 24, homeScore: 31, dateEt: "2026-10-08", kickoffUtc: "2026-10-08T23:30Z" },
  { id: "2026-10-08-south-alabama-at-arkansas-state", provider: "401869933", away: "south-alabama", home: "arkansas-state", awayScore: 56, homeScore: 49, dateEt: "2026-10-08", kickoffUtc: "2026-10-08T23:30Z" },
] as const;

const pairOf = (a: string, b: string) => [a, b].sort().join(":");

test("each midweek final appears exactly once, as final, with the verified score", () => {
  for (const want of MIDWEEK_FINALS) {
    const matches = games.filter((game) => pairOf(game.awayTeamId, game.homeTeamId) === pairOf(want.away, want.home) && game.week === 6);
    assert.equal(matches.length, 1, `${want.id} appears once in Week 6`);
    const [game] = matches;
    assert.equal(game.id, want.id, "stable game id kept from the scheduled row");
    assert.equal(game.status, "final");
    assert.equal(game.awayTeamId, want.away, "away team orientation");
    assert.equal(game.homeTeamId, want.home, "home team orientation");
    assert.equal(game.awayScore, want.awayScore);
    assert.equal(game.homeScore, want.homeScore);
    const played = (verifiedRefresh?.playedGames as Array<{ provider_id?: string; game_id: string }> | undefined)?.filter((row) => row.provider_id === want.provider) ?? [];
    assert.equal(played.length, 1, `${want.provider} recorded once in playedGames`);
    assert.equal(played[0].game_id, want.id);
  }
});

test("midweek finals no longer appear as upcoming anywhere", () => {
  const providers = new Set<string>(MIDWEEK_FINALS.map((row) => row.provider));
  assert.ok(!(verifiedRefresh?.scheduledGames ?? []).some((row) => providers.has(row.provider_id)), "removed from scheduledGames");
  const pairs = new Set(MIDWEEK_FINALS.map((row) => pairOf(row.away, row.home)));
  const slate = weekGames(games, boardWeekStart(6));
  assert.ok(
    !slate.some((game) => game.status !== "final" && pairs.has(pairOf(game.awayTeamId, game.homeTeamId))),
    "no scheduled/live duplicate on the weekly board",
  );
  assert.ok(
    !tickerGames.some((game) => game.status !== "final" && pairs.has(pairOf(game.awayTeamId, game.homeTeamId))),
    "ticker shows them only as finals",
  );
  // Every Week 6 game is now final, so the archive features a verified final, never a stale scheduled row.
  assert.equal(featuredGame(slate, teams)?.status, "final");
});

test("midweek finals keep their Eastern game dates across time zones", () => {
  for (const want of MIDWEEK_FINALS) {
    const game = games.find((row) => row.id === want.id)!;
    assert.equal(game.date, want.kickoffUtc, "kickoff instant unchanged");
    assert.equal(easternDate(game.date), want.dateEt, `${want.id} Eastern date`);
    assert.equal(game.week, 6);
  }
  // Thursday games are Oct 8 in Eastern, Pacific and UTC alike.
  const pacific = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  for (const want of MIDWEEK_FINALS.filter((row) => row.dateEt === "2026-10-08")) {
    const game = games.find((row) => row.id === want.id)!;
    assert.equal(easternDate(game.date), "2026-10-08");
    assert.equal(pacific(game.date), "2026-10-08");
    assert.equal(game.date.slice(0, 10), "2026-10-08");
    assert.match(dateLabel(game.date), /Thu, Oct 8/);
  }
  // Troy's 8 PM ET Tuesday kickoff is Wednesday in UTC; the board must keep Tuesday.
  const troy = games.find((row) => row.id === "2026-10-06-southern-miss-at-troy")!;
  assert.equal(troy.date.slice(0, 10), "2026-10-07");
  assert.equal(easternDate(troy.date), "2026-10-06");
  assert.match(dateLabel(troy.date), /Tue, Oct 6/);
});

test("team schedules show the result and link the final, including the UTC-rollover game", () => {
  const troyRow = getTeamSchedule("troy")?.find((row) => row.date === "2026-10-06");
  assert.equal(troyRow?.result, "W 55–34");
  assert.equal(troyRow?.href, "/games/2026-10-06-southern-miss-at-troy");
  const utsaRow = getTeamSchedule("utsa")?.find((row) => row.date === "2026-10-08");
  assert.equal(utsaRow?.result, "W 31–24");
  assert.equal(utsaRow?.href, "/games/2026-10-08-south-florida-at-utsa");
  const usfRow = getTeamSchedule("south-florida")?.find((row) => row.date === "2026-10-08");
  assert.equal(usfRow?.result, "L 24–31");
  const jsuRow = getTeamSchedule("jacksonville-state")?.find((row) => row.date === "2026-10-07");
  assert.equal(jsuRow?.result, "W 27–26");
});

test("records for the fourteen midweek teams match the verified finals", () => {
  const expected: Record<string, string> = {
    troy: "3–2", "southern-miss": "1–4", "jacksonville-state": "4–2", "kennesaw-state": "1–4",
    fiu: "3–2", "new-mexico-state": "2–4", liberty: "5–1", "sam-houston": "1–4",
    "western-kentucky": "2–4", "missouri-state": "1–4", utsa: "5–1", "south-florida": "4–2",
    "south-alabama": "4–2", "arkansas-state": "2–4",
  };
  for (const [slug, record] of Object.entries(expected)) {
    assert.equal(teams.find((team) => team.slug === slug)?.record, record, slug);
  }
  const standings = verifiedRefresh?.retainedBaseline?.conferenceStandings ?? [];
  const row = (slug: string) => standings.flatMap((conf) => conf.rows).find((r) => r.team_slug === slug);
  const conf: Record<string, string> = {
    utsa: "2-0", "south-florida": "1-2", liberty: "2-0", "sam-houston": "0-1", "western-kentucky": "1-1",
    "missouri-state": "0-1", "jacksonville-state": "2-0", "kennesaw-state": "0-1", fiu: "1-0",
    "new-mexico-state": "1-1", "south-alabama": "2-0", "arkansas-state": "0-2", troy: "1-0", "southern-miss": "0-1",
  };
  for (const [slug, record] of Object.entries(conf)) {
    assert.equal(`${row(slug)?.w}-${row(slug)?.l}`, record, `${slug} conference record`);
  }
});

test("freshness stays per source: polls and stats keep their own cutoffs", () => {
  assert.equal(verifiedRefresh?.metrics.through_games, "2026-10-03", "stats cutoff not advanced by new finals");
  assert.equal(verifiedRefresh?.polls?.[0]?.release_date, "2026-10-04");
  const week6 = boardWeeks.find((row) => row.week === 6);
  assert.equal(week6?.retrieved_at, "2026-10-05T07:24:21.400874Z", "Week 6 base snapshot time unchanged");
  assert.ok(week6?.results_verified_at && week6.results_verified_at > week6.retrieved_at);
  for (const want of MIDWEEK_FINALS) {
    const played = ((verifiedRefresh?.playedGames ?? []) as Array<{ provider_id?: string; verified_at?: string }>).find((row) => row.provider_id === want.provider);
    assert.ok(played?.verified_at && played.verified_at >= "2026-10-09", `${want.provider} carries its own verification time`);
  }
  // Rows carry their own re-check time; Hawai'i at Arizona State kept its corrected kickoff as a final.
  const hawaii = ((verifiedRefresh?.playedGames ?? []) as Array<{ provider_id?: string; kickoff_utc?: string; meta?: { pregame?: { correction?: string } } }>)
    .find((row) => row.provider_id === "401856808");
  assert.equal(hawaii?.kickoff_utc, "2026-10-11T02:30Z");
  assert.equal(easternDate(hawaii?.kickoff_utc ?? ""), "2026-10-10");
  assert.match(hawaii?.meta?.pregame?.correction ?? "", /7:30 PM MST/);
  assert.equal(games.find((row) => row.id === "2026-10-10-hawaii-at-arizona-state")?.status, "final");
  assert.ok(verifiedRefresh?.scheduledGames.every((row) => (row.verified_at ?? "") >= "2026-10-09"));
  const recap = verifiedRefresh?.storylines?.find((row) => row.id === "week6-thursday-finals");
  assert.ok(recap && recap.sources.length >= 4, "recap is sourced");
  assert.deepEqual([...(recap?.result_provider_ids ?? [])].sort(), MIDWEEK_FINALS.map((row) => row.provider).sort());
});

const FRIDAY_FINALS = [
  { id: "2026-10-09-florida-state-at-louisville", away: "florida-state", home: "louisville", a: 20, h: 44 },
  { id: "2026-10-09-iowa-at-washington", away: "iowa", home: "washington", a: 41, h: 24 },
  { id: "2026-10-09-washington-state-at-utah-state", away: "washington-state", home: "utah-state", a: 16, h: 17 },
  { id: "2026-10-09-wyoming-at-san-jose-state", away: "wyoming", home: "san-jose-state", a: 16, h: 13 },
  { id: "2026-10-09-iowa-state-at-byu", away: "iowa-state", home: "byu", a: 10, h: 24 },
] as const;

test("October 10 refresh removes every Friday game from upcoming and preserves Eastern ids", () => {
  for (const want of FRIDAY_FINALS) {
    const rows = games.filter(g => g.week === 6 && g.awayTeamId === want.away && g.homeTeamId === want.home);
    assert.equal(rows.length, 1);
    const [game] = rows;
    assert.equal(game.id, want.id);
    assert.equal(game.status, "final");
    assert.equal(game.awayScore, want.a);
    assert.equal(game.homeScore, want.h);
    assert.equal(easternDate(game.date), "2026-10-09");
    assert.ok(!verifiedRefresh?.scheduledGames.some(g => g.away === want.away && g.home === want.home));
    for (const slug of [want.home, want.away]) {
      const schedule = getTeamSchedule(slug)?.find(g => g.date === "2026-10-09");
      assert.equal(schedule?.href, `/games/${want.id}`);
      assert.ok(schedule?.result);
    }
  }
  assert.equal(games.find(g => g.id === "2026-10-09-iowa-state-at-byu")?.date, "2026-10-10T02:30Z");
  assert.equal(games.find(g => g.id === "2026-10-09-iowa-at-washington")?.broadcast, "FOX");
  assert.match(games.find(g => g.id === "2026-10-09-wyoming-at-san-jose-state")?.statusDetail ?? "", /OT/);
});

test("weather-related kickoff changes propagate to games, team schedules and broadcast labels", () => {
  const rice = games.find(g => g.id === "2026-10-10-rice-at-east-carolina")!;
  const utah = games.find(g => g.id === "2026-10-10-kansas-at-utah")!;
  assert.equal(rice.date, "2026-10-10T17:00Z");
  assert.equal(rice.broadcast, "ESPN+");
  assert.equal(utah.date, "2026-10-11T00:00Z");
  assert.equal(easternDate(utah.date), "2026-10-10");
  assert.equal(utah.broadcast, "ESPN App · linear network TBD");
  assert.equal(getTeamSchedule("utah")?.find(g => g.date === "2026-10-10")?.href, "/games/2026-10-10-kansas-at-utah");
  // Both are verified finals now; their pre-game corrections stay with the game.
  assert.equal(rice.status, "final");
  assert.equal(utah.status, "final");
  assert.equal(verifiedRefresh?.scheduledGames.filter(g => g.week === 6).length, 0);
  const pregame = (id: string) => ((verifiedRefresh?.playedGames ?? []) as Array<{ game_id: string; meta?: { pregame?: { correction?: string } } }>)
    .find((row) => row.game_id === id)?.meta?.pregame?.correction ?? "";
  assert.match(pregame("2026-10-10-rice-at-east-carolina"), /1 PM ET/);
  assert.match(pregame("2026-10-10-kansas-at-utah"), /6 PM MDT/);
  const week6 = boardWeeks.find((row) => row.week === 6);
  assert.ok(week6?.schedule_verified_at?.startsWith("2026-10-10"));
  assert.match(verifiedRefresh?.availability_review?.note ?? "", /not complete Saturday coverage/);
  assert.equal(week6?.retrieved_at, "2026-10-05T07:24:21.400874Z");
  assert.equal(verifiedRefresh?.polls?.[0].release_date, "2026-10-04");
});

const OCT10_FINALS = [
  { id: "2026-10-10-georgia-at-alabama", away: 20, home: 17 },
  { id: "2026-10-10-texas-at-oklahoma", away: 24, home: 27 },
  { id: "2026-10-10-lsu-at-kentucky", away: 34, home: 35, ot: true },
  { id: "2026-10-10-illinois-at-michigan-state", away: 38, home: 37, ot: true },
  { id: "2026-10-10-ucla-at-oregon", away: 17, home: 15 },
  { id: "2026-10-10-usc-at-penn-state", away: 31, home: 23 },
] as const;

test("every Saturday October 10 game is a verified final with summing line scores and a school source", () => {
  type Played = { game_id: string; date: string; week?: number; kickoff_utc?: string; verified_at?: string; title?: string; teams: Array<{ slug: string; points: number }>; meta?: { sources?: string[]; line_score?: Record<string, number[]>; originally_scheduled_kickoff_utc?: string } };
  const played = (verifiedRefresh?.playedGames ?? []) as Played[];
  const oct10 = played.filter((g) => g.week === 6 && g.date === "2026-10-10");
  assert.equal(oct10.length, 46);
  assert.equal(new Set(oct10.map((g) => g.game_id)).size, 46);
  for (const g of oct10) {
    assert.match(g.title ?? "", /^Final/);
    assert.ok(g.verified_at && g.verified_at >= "2026-10-11", `${g.game_id} verified after the games`);
    assert.equal(easternDate(g.kickoff_utc ?? ""), "2026-10-10", `${g.game_id} keeps its Eastern date`);
    for (const t of g.teams) assert.equal(g.meta?.line_score?.[t.slug]?.reduce((a, b) => a + b, 0), t.points, `${g.game_id} ${t.slug} line score`);
    assert.ok(g.meta?.sources?.some((u) => u.startsWith("https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary?event=")), `${g.game_id} ESPN summary`);
    assert.ok(g.meta?.sources?.some((u) => !/espn\.com/.test(u)), `${g.game_id} official school source`);
  }
  for (const want of OCT10_FINALS) {
    const game = games.find((row) => row.id === want.id);
    assert.equal(game?.status, "final", want.id);
    assert.equal(game?.awayScore, want.away);
    assert.equal(game?.homeScore, want.home);
    assert.equal(/OT/.test(game?.statusDetail ?? ""), "ot" in want, `${want.id} overtime label`);
  }
  // JMU at Georgia Southern started late: ESPN's actual start, same Eastern game id.
  const jmu = played.find((g) => g.game_id === "2026-10-10-james-madison-at-georgia-southern");
  assert.equal(jmu?.kickoff_utc, "2026-10-11T00:10Z");
  assert.equal(jmu?.meta?.originally_scheduled_kickoff_utc, "2026-10-10T23:30Z");
});
