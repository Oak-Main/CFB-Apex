import { execFileSync } from "node:child_process";
import { sourceDateLabel } from "../lib/game-calendar.ts";
import assert from "node:assert/strict";
import test from "node:test";
import {
  dateLabel,
  kickoffTime,
  playerSlug,
  published,
  weekGames,
  type BroadcastGame,
} from "../lib/homepage.ts";
import {
  appointmentGames,
  broadcastLabel,
  continuousWeeks,
  defaultScoreboardWeek,
  filterScoreboardGames,
  gamesForWeek,
  groupGamesByDate,
  kickoffTimeLabel,
  scoreboardDateLabel,
  scoreboardSourceLabel,
  scoreboardSwipeDirection,
  type ScoreboardFilter,
} from "../lib/scoreboard.ts";
import { stadiumPageTitle, staticRootTitle, STATIC_ROOT_TITLES, teamPageTitle } from "../lib/seo-titles.ts";
import { SITEMAP_EXCLUDED_ROOTS, STATIC_ROOTS } from "../lib/static-roots.ts";
import type { Game, Team } from "../lib/types.ts";

/**
 * Fixtures are minimal but complete `Game`/`Team` records: the helpers under
 * test only read `week`, `date`, `kickoffLabel`, `broadcast`, the team ids,
 * and a team's `rank`/`conference`/`subdivision`. Building whole records keeps
 * these tests honest about the real shapes instead of hiding behind `as any`.
 */
function fixtureGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "2026-09-12-alabama-at-kentucky",
    week: 3,
    date: "2026-09-12T17:00:00.000Z",
    kickoffLabel: "3:30 PM ET",
    status: "scheduled",
    statusDetail: "Scheduled",
    awayTeamId: "alabama",
    homeTeamId: "kentucky",
    venueSlug: "kroger-field",
    venue: "Kroger Field",
    city: "Lexington",
    broadcast: "ABC",
    weather: null,
    neutralSite: false,
    modelHomeWinProbability: 0.4,
    modelUncertainty: 0.2,
    provenance: {
      provider: "fixture",
      providerRecordId: "fixture-1",
      sourceAsOf: "2026-09-07",
      fetchedAt: "2026-09-07T00:00:00.000Z",
      verifiedAt: "2026-09-07T00:00:00.000Z",
      verificationStatus: "synthetic",
      licenseClass: "R0_FIXTURE",
      confidence: 1,
      dataEnvironment: "fixture",
      recordOrigin: "fixture",
      freshness: "current",
    },
    ...overrides,
  };
}

function fixtureTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: "alabama",
    slug: "alabama",
    name: "Alabama Crimson Tide",
    shortName: "Alabama",
    abbreviation: "ALA",
    monogram: "A",
    conference: "Southeastern Conference",
    subdivision: "P4",
    record: "1-0",
    color: "#9e1b32",
    strength: 95,
    returningProduction: 0.8,
    portalImpact: 0.1,
    playoffProbability: 0.9,
    provenance: {
      provider: "fixture",
      providerRecordId: "fixture-team-1",
      sourceAsOf: "2026-09-07",
      fetchedAt: "2026-09-07T00:00:00.000Z",
      verifiedAt: "2026-09-07T00:00:00.000Z",
      verificationStatus: "synthetic",
      licenseClass: "R0_FIXTURE",
      confidence: 1,
      dataEnvironment: "fixture",
      recordOrigin: "fixture",
      freshness: "current",
    },
    ...overrides,
  };
}

// --- week window boundaries (Monday-start) --------------------------------

test("weekGames opens on Monday 00:00 Eastern and closes the following Monday", () => {
  // 2026-10-03 is a Saturday, so the week window is Mon 2026-09-28 .. Mon 2026-10-05.
  const slate: BroadcastGame[] = [
    fixtureGame({ id: "prev-sunday", date: "2026-09-28T03:59:00.000Z" }),
    fixtureGame({ id: "monday-open", date: "2026-09-28T04:00:00.000Z" }),
    fixtureGame({ id: "sunday-late", date: "2026-10-05T03:59:00.000Z" }),
    fixtureGame({ id: "next-monday", date: "2026-10-05T04:00:00.000Z" }),
  ];
  assert.deepEqual(
    weekGames(slate, "2026-10-03").map((game) => game.id),
    ["monday-open", "sunday-late"],
    "the window is [Monday 00:00 Eastern, next Monday 00:00 Eastern) and results are date-sorted",
  );
});

test("weekGames anchors a Monday reference date to itself", () => {
  const slate: BroadcastGame[] = [
    fixtureGame({ id: "monday", date: "2026-09-28T04:00:00.000Z" }),
    fixtureGame({ id: "sunday", date: "2026-10-04T12:00:00.000Z" }),
    fixtureGame({ id: "tuesday-after", date: "2026-10-05T12:00:00.000Z" }),
  ];
  assert.deepEqual(
    weekGames(slate, "2026-09-28").map((game) => game.id),
    ["monday", "sunday"],
  );
});

test("weekGames sorts by date and returns nothing for an unusable reference date", () => {
  const unordered: BroadcastGame[] = [
    fixtureGame({ id: "b", date: "2026-10-03T20:00:00.000Z" }),
    fixtureGame({ id: "a", date: "2026-09-29T12:00:00.000Z" }),
  ];
  assert.deepEqual(
    weekGames(unordered, "2026-10-03").map((game) => game.id),
    ["a", "b"],
  );
  assert.deepEqual(weekGames(unordered, "not-a-date"), []);
  assert.deepEqual(weekGames([], "2026-10-03"), []);
});

// --- kickoff label parsing ----------------------------------------------

test("kickoffTime extracts a labelled kickoff and fails closed on junk", () => {
  assert.equal(kickoffTime({ kickoffLabel: "3:30 PM ET" } as BroadcastGame), "3:30 PM ET");
  assert.equal(kickoffTime({ kickoffLabel: "8:00 pm et" } as BroadcastGame), "8:00 pm et");
  assert.equal(kickoffTime({ kickoffLabel: "12:05 PM ET" } as BroadcastGame), "12:05 PM ET");
  // Never a raw fragment of a TBD/flex label.
  assert.equal(kickoffTime({ kickoffLabel: "TBD" } as BroadcastGame), "Not published");
  assert.equal(kickoffTime({ kickoffLabel: "" } as BroadcastGame), "Not published");
  assert.equal(kickoffTime({ kickoffLabel: "7:00 PM Central" } as BroadcastGame), "Not published");
});

test("scoreboard kickoffTimeLabel is case-sensitive and defaults to TBD", () => {
  assert.equal(kickoffTimeLabel(fixtureGame()), "3:30 PM ET");
  assert.equal(kickoffTimeLabel(fixtureGame({ kickoffLabel: "8:00 pm et" })), "TBD");
  assert.equal(kickoffTimeLabel(fixtureGame({ kickoffLabel: "TBD" })), "TBD");
  assert.equal(broadcastLabel(fixtureGame({ broadcast: null })), "Network not assigned");
  assert.equal(broadcastLabel(fixtureGame({ broadcast: "ESPN" })), "ESPN");
});

// --- date labelling -------------------------------------------------------

test("dateLabel and scoreboardDateLabel agree on published dates", () => {
  assert.equal(dateLabel("2026-09-12"), "Sat, Sep 12");
  assert.equal(dateLabel("2026-09-12", "long"), "Saturday, Sep 12");
  assert.equal(scoreboardDateLabel("2026-09-12"), "Sat, Sep 12");
  assert.equal(scoreboardDateLabel("2026-09-12", true), "Saturday, Sep 12");
  // Full ISO timestamps are pinned to their own UTC day, never rolled over.
  assert.equal(dateLabel("2026-09-12T23:30:00.000Z"), "Sat, Sep 12");
  assert.equal(scoreboardDateLabel("2026-09-12T23:30:00.000Z"), "Sat, Sep 12");
  // UTC midnight still belongs to the previous Eastern day.
  assert.equal(dateLabel("2026-01-01T00:00:00.000Z"), "Wed, Dec 31");
});

test("unparseable dates surface honest fallbacks, never Invalid Date", () => {
  assert.equal(dateLabel("not-a-date"), "Not published");
  assert.equal(dateLabel(""), "Not published");
  assert.equal(scoreboardDateLabel("not-a-date"), "Date not published");
  assert.equal(scoreboardDateLabel(""), "Date not published");
});

// --- scoreboard week selection ------------------------------------------

test("continuousWeeks fills unpublished gaps and sorts ascending", () => {
  assert.deepEqual(continuousWeeks([]), []);
  assert.deepEqual(continuousWeeks([3]), [3]);
  assert.deepEqual(continuousWeeks([5, 1, 3]), [1, 2, 3, 4, 5]);
  assert.deepEqual(continuousWeeks([2, 2, 4]), [2, 3, 4]);
});

test("defaultScoreboardWeek picks the next published Saturday, else the last week", () => {
  const slate: Game[] = [
    fixtureGame({ id: "wk1", week: 1, date: "2026-08-29T17:00:00.000Z" }),
    fixtureGame({ id: "wk3-sat", week: 3, date: "2026-09-12T17:00:00.000Z" }),
    fixtureGame({ id: "wk3-thu", week: 3, date: "2026-09-10T17:00:00.000Z" }),
  ];
  assert.equal(defaultScoreboardWeek(slate, "2026-09-08"), 3);
  // A reference past every Saturday falls back to the highest published week.
  assert.equal(defaultScoreboardWeek(slate, "2026-12-01"), 3);
  // With no usable asOf the reference floors to "0000-00-00", so every Saturday
  // qualifies and the earliest published one wins. It degrades without throwing.
  assert.equal(defaultScoreboardWeek(slate, "not-a-date"), 1);
  assert.equal(defaultScoreboardWeek(slate, null), 1);
  // Only non-Saturday games published: no Saturday to anchor to, so the last
  // published week carries the default.
  assert.equal(defaultScoreboardWeek([fixtureGame({ id: "thu", week: 5, date: "2026-09-10T17:00:00.000Z" })], "2026-09-08"), 5);
  assert.equal(defaultScoreboardWeek([], "2026-09-08"), 0);
  assert.equal(defaultScoreboardWeek([], null), 0);
});

test("gamesForWeek filters one week and breaks kickoff ties by id", () => {
  const slate: Game[] = [
    fixtureGame({ id: "b", week: 3, date: "2026-09-12T17:00:00.000Z" }),
    fixtureGame({ id: "a", week: 3, date: "2026-09-12T17:00:00.000Z" }),
    fixtureGame({ id: "c", week: 3, date: "2026-09-11T23:00:00.000Z" }),
    fixtureGame({ id: "d", week: 4, date: "2026-09-19T17:00:00.000Z" }),
  ];
  assert.deepEqual(
    gamesForWeek(slate, 3).map((game) => game.id),
    ["c", "a", "b"],
  );
  assert.deepEqual(gamesForWeek(slate, 99), []);
});

test("groupGamesByDate buckets by UTC day in ascending order", () => {
  const slate: Game[] = [
    fixtureGame({ id: "sat-early", date: "2026-09-12T17:00:00.000Z" }),
    fixtureGame({ id: "sat-late", date: "2026-09-12T23:30:00.000Z" }),
    fixtureGame({ id: "fri", date: "2026-09-11T23:00:00.000Z" }),
  ];
  const groups = groupGamesByDate(slate);
  assert.deepEqual(
    groups.map((group) => group.date),
    ["2026-09-11", "2026-09-12"],
  );
  assert.deepEqual(
    groups[1].games.map((game) => game.id),
    ["sat-early", "sat-late"],
    "grouping preserves the incoming order within a day",
  );
  assert.deepEqual(groupGamesByDate([]), []);
});

// --- scoreboard filters ---------------------------------------------------

test("filterScoreboardGames applies each filter and drops unknown teams", () => {
  const sec = "Southeastern Conference";
  const acc = "Atlantic Coast Conference";
  const teams: Team[] = [
    fixtureTeam({ id: "alabama", slug: "alabama", shortName: "Alabama", rank: 1, conference: sec, subdivision: "P4" }),
    fixtureTeam({ id: "kentucky", slug: "kentucky", shortName: "Kentucky", rank: 12, conference: sec, subdivision: "P4" }),
    fixtureTeam({ id: "clemson", slug: "clemson", shortName: "Clemson", conference: acc, subdivision: "P4" }),
    fixtureTeam({ id: "davidson", slug: "davidson", shortName: "Davidson", conference: acc, subdivision: "FCS" }),
  ];
  const slate: Game[] = [
    fixtureGame({ id: "sec-top25", awayTeamId: "alabama", homeTeamId: "kentucky" }),
    fixtureGame({ id: "acc-unranked", awayTeamId: "clemson", homeTeamId: "kentucky", date: "2026-09-13T17:00:00.000Z" }),
    fixtureGame({ id: "fcs", awayTeamId: "davidson", homeTeamId: "clemson", date: "2026-09-13T20:00:00.000Z" }),
    fixtureGame({ id: "unknown-team", awayTeamId: "alabama", homeTeamId: "not-a-team", date: "2026-09-13T23:00:00.000Z" }),
  ];
  const ids = (filter: ScoreboardFilter, conference = acc, favorites: ReadonlySet<string> = new Set()) =>
    filterScoreboardGames({ source: slate, teams, filter, conference, favorites }).map((game) => game.id);

  // "all" still refuses games with an unmappable team so no card renders a blank.
  assert.deepEqual(ids("all"), ["sec-top25", "acc-unranked", "fcs"]);
  assert.deepEqual(ids("fbs"), ["sec-top25", "acc-unranked"]);
  // "top-25" keys off either side being ranked, so the ranked-host game stays in.
  assert.deepEqual(ids("top-25"), ["sec-top25", "acc-unranked"]);
  assert.deepEqual(ids("conference", acc), ["acc-unranked", "fcs"]);
  assert.deepEqual(ids("conference", sec), ["sec-top25", "acc-unranked"]);
  assert.deepEqual(ids("my-teams", acc, new Set(["clemson"])), ["acc-unranked", "fcs"]);
  assert.deepEqual(ids("my-teams", acc, new Set(["nope"])), []);
});

test("appointmentGames favours ranked, televised, timed matchups and honors the limit", () => {
  const teams: Team[] = [
    fixtureTeam({ id: "alabama", rank: 1 }),
    fixtureTeam({ id: "texas", rank: 2 }),
    fixtureTeam({ id: "kentucky", rank: 12 }),
  ];
  const marquee = fixtureGame({ id: "marquee", awayTeamId: "alabama", homeTeamId: "texas", broadcast: "ABC" });
  const untimed = fixtureGame({ id: "untimed", awayTeamId: "kentucky", homeTeamId: "texas", kickoffLabel: "TBD", broadcast: null });
  const slate: Game[] = [untimed, marquee, fixtureGame({ id: "third", awayTeamId: "kentucky", homeTeamId: "alabama" })];

  const top = appointmentGames(slate, teams, 2);
  assert.equal(top[0].id, "marquee", "two ranked teams plus a network outrank a lower-ranked unheralded game");
  assert.equal(top.length, 2);
  assert.deepEqual(appointmentGames(slate, teams, 0), []);
  assert.deepEqual(appointmentGames([], teams, 3), []);
  // The input array is never reordered in place.
  assert.equal(slate[0].id, "untimed");
});

// --- homepage formatting --------------------------------------------------

test("published and playerSlug keep absent values honest and slugs url-safe", () => {
  assert.equal(published(null), "Not published");
  assert.equal(published(undefined), "Not published");
  assert.equal(published(""), "Not published");
  assert.equal(published(12), "12");
  assert.equal(published("4-2"), "4-2");

  assert.equal(playerSlug("Jalen Milroe"), "jalen-milroe");
  assert.equal(playerSlug("Nick Singleton III"), "nick-singleton-iii");
  assert.equal(playerSlug("Quinn Ewers"), "quinn-ewers");
});

// --- seo titles -----------------------------------------------------------

test("teamPageTitle prefers the full intent tail and degrades when too long", () => {
  assert.equal(teamPageTitle("Alabama"), "Alabama Football: Schedule, Roster & Portal");
  // "Jacksonsville State" cannot carry the long tail inside 60 chars with the suffix.
  const long = teamPageTitle("Jacksonsville State");
  assert.equal(long, "Jacksonsville State Football: Schedule & Roster");
  assert.ok(long.length + " | CFB Apex".length <= 60, long);
});

test("stadiumPageTitle keeps the bag-policy query through three fallbacks", () => {
  // "Memorial Stadium" is short enough to carry the full seating tail.
  assert.equal(
    stadiumPageTitle("Memorial Stadium", "Clemson"),
    "Memorial Stadium: Bag Policy, Parking & Seating",
  );
  // A shared-name stadium resolves to the team brand, which is the stronger query.
  assert.equal(
    stadiumPageTitle("Memorial Stadium", "Clemson", { disambiguate: true }),
    "Clemson Stadium Guide: Bag Policy & Parking",
  );
  // Disambiguation without a team cannot render a team brand, so it falls through.
  assert.equal(
    stadiumPageTitle("Memorial Stadium", undefined, { disambiguate: true }),
    "Memorial Stadium: Bag Policy, Parking & Seating",
  );
  // A longer name drops the seating clause but keeps the bag-policy query words.
  const compact = stadiumPageTitle("Bryant-Denny Stadium", "Alabama");
  assert.equal(compact, "Bryant-Denny Stadium Bag Policy & Parking");
  assert.ok(compact.includes("Bag Policy"), compact);
  // Long corporate names fall back to the team brand rather than truncate.
  const longest = stadiumPageTitle("University of Mississippi at Oxford Corporate Pavilion Field", "Ole Miss");
  assert.ok(longest.includes("Ole Miss"), longest);
  assert.ok(longest.length + " | CFB Apex".length <= 60, longest);
});

// --- static roots ---------------------------------------------------------

test("every served root has a fallback title unless the router titles it inline", () => {
  // These roots return their own metadata from app/[...slug]/page.tsx before
  // the staticRootTitle fallback is reached, so they legitimately have no
  // entry here. Pinning the set keeps a new root from silently losing its title.
  const routerTitled = new Set(["highlight", "panel", "upset-watch", "playoff-audit"]);
  for (const root of STATIC_ROOTS) {
    if (routerTitled.has(root)) continue;
    assert.ok(staticRootTitle(root), `static root /${root} lost its title`);
  }
  // A title registered for a root the router does not serve is dead metadata.
  for (const root of Object.keys(STATIC_ROOT_TITLES)) {
    assert.ok((STATIC_ROOTS as readonly string[]).includes(root), `title for unserved root /${root}`);
  }
  assert.equal(staticRootTitle("not-a-root"), undefined);
  assert.equal(new Set(STATIC_ROOTS).size, STATIC_ROOTS.length, "static roots must not repeat");
});

test("sitemap exclusions cover only roots the site actually serves", () => {
  for (const root of SITEMAP_EXCLUDED_ROOTS) {
    assert.ok(
      (STATIC_ROOTS as readonly string[]).includes(root),
      `sitemap excludes /${root}, which the router does not serve`,
    );
  }
  // Everything else in the shared list must be listed by the sitemap.
  assert.deepEqual(
    STATIC_ROOTS.filter((root) => !SITEMAP_EXCLUDED_ROOTS.has(root)).length,
    STATIC_ROOTS.length - SITEMAP_EXCLUDED_ROOTS.size,
  );
});


test("scoreboard labels are week-specific snapshots with distinct schedule and finals dates", () => {
  const snapshot = { week: 6, schedule_verified_at: "2026-10-10T09:09:11.286Z", results_verified_at: "2026-10-09T11:07:00Z" };
  const current = scoreboardSourceLabel(6, snapshot);
  assert.equal(staticRootTitle("scores"), "College Football Scores");
  assert.equal(current.badge, "Verified snapshot");
  assert.match(current.detail, /schedule checked 2026-10-10 09:09 UTC; finals verified 2026-10-09 11:07 UTC/);
  for (const week of [1, 7]) {
    const other = scoreboardSourceLabel(week, snapshot);
    assert.equal(other.badge, "Published snapshot");
    assert.match(other.detail, /retains its original source dates/);
    assert.doesNotMatch(other.detail, /2026-10-10|2026-10-09/);
  }
  assert.equal(scoreboardSourceLabel(6, null).badge, "Published snapshot");
  assert.match(scoreboardSourceLabel(6, { week: 6 }).detail, /schedule checked not published; finals verified not published/);
  // A two-week release labels each board week with its own stamps.
  const weeks = [
    { week: 6, schedule_verified_at: "2026-10-10T09:09:11.286Z", results_verified_at: "2026-10-11T12:21:23Z" },
    { week: 7, schedule_verified_at: "2026-10-11T10:22:49Z" },
  ];
  const release = { week: 7, schedule_verified_at: "2026-10-11T10:22:49Z", results_verified_at: "2026-10-11T12:21:23Z" };
  assert.match(scoreboardSourceLabel(6, release, weeks).detail, /Week 6 schedule checked 2026-10-10 09:09 UTC; finals verified 2026-10-11 12:21 UTC/);
  assert.match(scoreboardSourceLabel(7, release, weeks).detail, /Week 7 schedule checked 2026-10-11 10:22 UTC; no finals verified yet/);
  assert.equal(scoreboardSourceLabel(5, release, weeks).badge, "Published snapshot");
});

test("civil verification dates agree across server and browser time zones", () => {
  const moduleUrl = new URL("../lib/game-calendar.ts", import.meta.url).href;
  const source = `import { sourceDateLabel } from ${JSON.stringify(moduleUrl)}; process.stdout.write(sourceDateLabel("2026-09-07"));`;
  for (const TZ of ["UTC", "America/Los_Angeles", "America/Denver", "Pacific/Honolulu", "Pacific/Auckland"]) {
    const label = execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", source], { env: { ...process.env, TZ }, encoding: "utf8" });
    assert.equal(label, "Sep 7, 2026", TZ);
  }
  assert.equal(sourceDateLabel("2026-02-30"), "Not published");
  assert.equal(sourceDateLabel("bad date"), "Not published");
});

test("scoreboard gestures navigate horizontally and ignore vertical pulls", () => {
  assert.equal(scoreboardSwipeDirection(-63, 0), "next");
  assert.equal(scoreboardSwipeDirection(63, 0), "previous");
  assert.equal(scoreboardSwipeDirection(-100, 50), "next");
  assert.equal(scoreboardSwipeDirection(100, -50), "previous");
  for (const [x, y] of [[0, 150], [0, -150], [20, 150], [-20, 150], [62, 0], [-62, 0], [100, 80], [-100, -80]]) {
    assert.equal(scoreboardSwipeDirection(x, y), null, `ignored gesture ${x},${y}`);
  }
});
