import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { calculateBuyout } from "../lib/contracts.ts";
import {
  coaches,
  fantasyNotes,
  games,
  portalAsOf,
  portalEvents,
  preseasonRatings,
  providerHealth,
  scenarioGames,
  stadiums,
  teams,
} from "../lib/cfb-dataset.ts";
import { normalizeForcedOutcomes, runPlayoffSimulation } from "../lib/simulation.ts";

test("transfer portal ledger is complete, sourced, and slug-clean", () => {
  assert.ok(portalEvents.length >= 600, `expected a full portal ledger, got ${portalEvents.length}`);
  assert.match(portalAsOf ?? "", /^\d{4}-\d{2}-\d{2}$/);
  const slugs = new Set(teams.map((team) => team.id));
  for (const event of portalEvents) {
    assert.match(event.eventDate, /^\d{4}-\d{2}-\d{2}$/, event.player);
    assert.ok(event.toTeamId && slugs.has(event.toTeamId), `${event.player}: destination must be a dataset team`);
    // Origins may be external (a handful of FCS move-ins) but must be slugs.
    assert.match(event.fromTeamId, /^[a-z0-9-]+$/, event.player);
    assert.ok(["high", "medium", "low"].includes(event.confidence), event.player);
    assert.ok(event.impact === null, "impact is not modeled for this dataset");
  }
  const external = portalEvents.filter((event) => !slugs.has(event.fromTeamId));
  assert.ok(external.length <= 5, `unexpected number of external origins: ${external.length}`);
});

test("every team lists a head coach and contract data is never fabricated", () => {
  assert.equal(coaches.length, teams.length);
  const withSalary = coaches.filter((coach) => coach.annualSalary > 0);
  assert.ok(withSalary.length >= 60, `expected published salaries for most staffs, got ${withSalary.length}`);
  for (const coach of coaches) {
    if (coach.annualSalary > 0) {
      assert.ok(coach.contractAsOf, `${coach.name}: salary without an as-of date`);
      assert.ok((coach.contractSources ?? []).length > 0, `${coach.name}: salary without sources`);
    } else {
      // Unpublished terms stay zero/blank, never invented.
      assert.equal(coach.guaranteedRemaining, 0, coach.name);
      assert.equal(coach.totalValue ?? 0, 0, coach.name);
    }
  }
  const deBoer = coaches.find((coach) => coach.slug === "kalen-deboer");
  assert.ok(deBoer, "DeBoer contract record missing");
  assert.equal(deBoer.annualSalary, 12_500_000);
});

test("preseason ratings cover all 138 with honest nulls, TV times attach to games", () => {
  assert.equal(Object.keys(preseasonRatings).length, teams.length);
  for (const team of teams) {
    const rating = preseasonRatings[team.id];
    assert.ok(rating, `${team.slug}: missing ratings record`);
    assert.match(rating.as_of, /^\d{4}-\d{2}-\d{2}$/);
    if (rating.sp) {
      assert.ok(typeof rating.sp.rank === "number" && rating.sp.rank >= 1 && rating.sp.rank <= 138, team.slug);
      assert.ok(rating.sp.source.startsWith("http"), `${team.slug}: SP+ without source`);
    }
    if (rating.playoff?.value) assert.match(rating.playoff.value, /^\d+(\.\d+)?%$/, team.slug);
  }
  const alabama = preseasonRatings.alabama;
  assert.equal(alabama.sp?.rank, 6);
  assert.equal(alabama.sp?.overall, 23.0);
  const ucla = preseasonRatings.ucla;
  assert.equal(ucla.playoff?.outlet, "ESPN");
  assert.equal(ucla.playoff?.value, "32.4%");

  const withBroadcast = games.filter((game) => game.broadcast);
  assert.ok(withBroadcast.length >= 140, `expected TV designations, got ${withBroadcast.length}`);
  const withTime = games.filter((game) => game.kickoffLabel.includes("ET"));
  assert.ok(withTime.length >= 120, `expected kickoff times, got ${withTime.length}`);
  const ak = games.find((game) => game.id === "2026-09-12-alabama-at-kentucky");
  assert.equal(ak?.broadcast, "ABC");
  assert.match(ak?.kickoffLabel ?? "", /3:30 PM ET/);
});

test("fantasy notes are reported-only, slug-clean, and never invent projections", () => {
  assert.ok(fantasyNotes.length >= 200, `expected the Week 1 notes board, got ${fantasyNotes.length}`);
  const slugs = new Set(teams.map((team) => team.id));
  for (const note of fantasyNotes) {
    assert.ok(slugs.has(note.team), `${note.player}: unknown team ${note.team}`);
    assert.ok(["QB", "RB", "WR", "TE"].includes(note.position ?? ""), note.player);
    assert.ok(
      ["active", "questionable", "doubtful", "inactive", "suspended"].includes(note.availability ?? ""),
      `${note.player}: bad availability ${note.availability}`,
    );
    // A projection must always carry its outlet; reported ranks only, no invented points.
    if (note.projection) {
      assert.ok(note.projection.outlet, `${note.player}: projection without an outlet`);
      assert.ok(!/\d+\.\d+ pts/i.test(note.projection.value ?? ""), note.player);
    }
  }
  const smith = fantasyNotes.find((note) => note.player === "Jeremiah Smith");
  assert.equal(smith?.team, "ohio-state");
  assert.equal(smith?.projection?.value, "Week 1 WR rank No. 1");
});

test("affiliate and radio seams stay fail-closed until configured", async () => {
  const { ticketLinksForTeam, ticketAffiliatesConfigured } = await import("../lib/affiliates.ts");
  if (!ticketAffiliatesConfigured) {
    assert.deepEqual(ticketLinksForTeam("Alabama Crimson Tide"), []);
  } else {
    for (const link of ticketLinksForTeam("Alabama Crimson Tide")) {
      assert.match(link.url, /^https:\/\//);
      if (link.tracked) {
        assert.ok(link.url.includes("url="), "network wrapper must encode the destination");
      } else {
        assert.ok(!link.url.includes("url="), "pending links must go direct to the partner search, unwrapped");
      }
    }
  }
  const { radioStations } = await import("../lib/cfb-dataset.ts");
  assert.ok(Array.isArray(radioStations));
  assert.equal(radioStations.length, teams.length, "every program carries a radio record");
  const slugs = new Set(teams.map((team) => team.id));
  for (const station of radioStations) {
    assert.ok(slugs.has(station.team), `radio: unknown team ${station.team}`);
    assert.match(station.team, /^[a-z0-9-]+$/);
    // Every carried record must be a verified flagship, never a guess.
    if (station.station) {
      assert.match(station.station, /^[A-Z]{3,6}(-[AFM]{2})?$/, `${station.team}: bad callsign ${station.station}`);
      assert.ok((station.sources ?? []).length >= 1, `${station.team}: no source`);
    }
  }
});

test("every program has a gameday guide and broadcasts attach to real games", () => {
  assert.equal(stadiums.length, teams.length);
  const guideTeams = new Set(stadiums.map((stadium) => stadium.teamId));
  for (const team of teams) {
    assert.ok(guideTeams.has(team.id), `${team.slug}: missing gameday guide`);
  }
  for (const stadium of stadiums) {
    assert.ok(stadium.capacity > 0, `${stadium.slug}: capacity missing`);
    assert.ok(stadium.clearBag.length > 10, `${stadium.slug}: clear-bag note missing`);
    assert.match(stadium.lastVerified, /^\d{4}-\d{2}-\d{2}$/, stadium.slug);
  }
  const withBroadcast = games.filter((game) => game.broadcast);
  assert.ok(withBroadcast.length >= 80, `expected broadcast assignments, got ${withBroadcast.length}`);
  for (const game of withBroadcast) {
    assert.ok(typeof game.broadcast === "string" && game.broadcast.length > 0, game.id);
  }
  const alabamaAtKentucky = games.find((game) => game.id === "2026-09-12-alabama-at-kentucky");
  assert.equal(alabamaAtKentucky?.broadcast, "ABC");
});

test("every team carries a verified logo file and a brand color", () => {
  const withLogos = teams.filter((team) => team.logo);
  assert.equal(withLogos.length, teams.length, "all listed teams must have logos");
  const projectRoot = fileURLToPath(new URL("..", import.meta.url));
  for (const team of withLogos) {
    assert.match(team.logo ?? "", /^\/logos\/[a-z0-9-]+\.png$/, team.slug);
    assert.ok(existsSync(`${projectRoot}/public${team.logo}`), `${team.slug}: missing file`);
    assert.match(team.color, /^#[0-9a-f]{6}$/, team.slug);
  }
  for (const slug of ["alabama", "texas", "michigan", "clemson", "florida-state", "notre-dame", "umass"]) {
    assert.ok(withLogos.some((team) => team.slug === slug), `${slug} lost its logo`);
  }
});

test("playoff simulation is deterministic under the same seed", () => {
  const first = runPlayoffSimulation("same-seed", { "scenario-1": teams[0].id }, 2_000);
  const second = runPlayoffSimulation("same-seed", { "scenario-1": teams[0].id }, 2_000);
  assert.deepEqual(first, second);
});

test("different seeds vary and probabilities stay bounded", () => {
  const first = runPlayoffSimulation("seed-a", {}, 2_000);
  const second = runPlayoffSimulation("seed-b", {}, 2_000);
  assert.notDeepEqual(first.results, second.results);
  for (const result of first.results) {
    assert.ok(result.playoff >= 0 && result.playoff <= 1);
    assert.ok(result.bye >= 0 && result.bye <= 1);
    assert.ok(result.title >= 0 && result.title <= 1);
  }
  const titleTotal = first.results.reduce((sum, result) => sum + result.title, 0);
  assert.ok(Math.abs(titleTotal - 1) < 0.001);
});

test("forced outcomes improve the selected team's path", () => {
  const baseline = runPlayoffSimulation("force-test", {}, 20_000);
  // Pick a participant with room to improve; changing weekly data changes ordering.
  const eligible = (id: string) => {
    const chance = baseline.results.find((result) => result.teamId === id)?.playoff ?? 0;
    return chance > 0.01 && chance < 0.99;
  };
  const scenario = scenarioGames.find((game) => eligible(game.homeTeamId) || eligible(game.awayTeamId));
  assert.ok(scenario, "expected a scenario participant with a nontrivial baseline chance");
  const winnerId = eligible(scenario.homeTeamId) ? scenario.homeTeamId : scenario.awayTeamId;
  const team = teams.find((candidate) => candidate.id === winnerId)!;
  const opponent = teams.find((candidate) => candidate.id === (winnerId === scenario.homeTeamId ? scenario.awayTeamId : scenario.homeTeamId))!;
  const forced = runPlayoffSimulation("force-test", { [scenario.id]: team.id }, 20_000);
  const before = baseline.results.find((result) => result.teamId === team.id)!;
  const after = forced.results.find((result) => result.teamId === team.id)!;
  const opponentBefore = baseline.results.find((result) => result.teamId === opponent.id)!;
  const opponentAfter = forced.results.find((result) => result.teamId === opponent.id)!;
  assert.ok(after.playoff > before.playoff);
  // With 138 teams the opponent's expected drop is small; allow sampling
  // noise but never a systematic increase.
  assert.ok(opponentAfter.playoff <= opponentBefore.playoff + 0.02);
});

test("forced outcomes reject nonparticipants and iterations are whole", () => {
  const nonparticipant = teams.find(
    (team) => team.id !== scenarioGames[0].awayTeamId && team.id !== scenarioGames[0].homeTeamId,
  )!;
  assert.deepEqual(normalizeForcedOutcomes({ [scenarioGames[0].id]: nonparticipant.id }), {});
  const result = runPlayoffSimulation("fractional", {}, 1_000.5);
  assert.equal(result.iterations, 1_000);
  assert.ok(Math.abs(result.results.reduce((sum, item) => sum + item.title, 0) - 1) < 0.001);
});

test("buyout applies mitigation without going negative", () => {
  const result = calculateBuyout({
    guaranteedRemaining: 13_000_000,
    mitigationApplies: true,
    estimatedOffset: 2_000_000,
  });
  assert.equal(result.estimatedNet, 11_000_000);
  assert.equal(
    calculateBuyout({
      guaranteedRemaining: 1_000_000,
      mitigationApplies: true,
      estimatedOffset: 2_000_000,
    }).estimatedNet,
    0,
  );
});

test("dataset records are provenance-tagged and never claim live status", () => {
  assert.ok(games.length > 0);
  assert.ok(games.every((game) => game.provenance.dataEnvironment === "production"));
  assert.ok(games.every((game) => game.provenance.licenseClass === "R3_CITED_FACTS"));
  assert.ok(games.every((game) => !game.statusDetail.toLowerCase().includes("live")));
  assert.equal(teams.length, 138);
  // The fixture universe must never leak into the real dataset surfaces.
  const fixtureNames = /red mesa|blue ridge state|north coast|prairie tech|tidewater state|lake union/i;
  assert.ok(teams.every((team) => !fixtureNames.test(team.name)));
  assert.ok(games.every((game) => !fixtureNames.test(game.statusDetail)));
  assert.equal(
    providerHealth.find((provider) => provider.id === "production-sports")?.status,
    "degraded",
  );
});
import { stadiumPageTitle, staticRootTitle, teamPageTitle } from "../lib/seo-titles.ts";

test("seo titles are unique, intent-bearing, and <=60 chars with the brand suffix", () => {
  const suffix = " | CFB Apex";
  const titles: string[] = [];
  for (const team of teams) {
    const title = teamPageTitle(team.shortName);
    assert.ok(title.length + suffix.length <= 60, `${team.shortName}: "${title}" runs long`);
    assert.match(title, /Schedule/);
    titles.push(title);
  }
  let bagPolicy = 0;
  const sharedNames = new Set(
    stadiums.map((stadium) => stadium.name).filter((name, index, all) => all.indexOf(name) !== index),
  );
  for (const stadium of stadiums) {
    const team = teams.find((candidate) => candidate.id === stadium.teamId);
    const title = stadiumPageTitle(stadium.name, team?.shortName, {
      disambiguate: sharedNames.has(stadium.name),
    });
    assert.ok(title.length + suffix.length <= 60, `${stadium.name}: "${title}" runs long`);
    if (title.includes("Bag Policy")) bagPolicy += 1;
    titles.push(title);
  }
  // Most stadiums fit the intent-bearing bag-policy shape; the long corporate
  // names fall back rather than truncate.
  assert.ok(bagPolicy > stadiums.length / 2, `expected most stadium titles to carry bag policy, got ${bagPolicy}/${stadiums.length}`);
  assert.equal(new Set(titles).size, titles.length, "team and stadium titles must not collide");
  // Every static root covered by the router earns its own title.
  for (const root of ["scores", "schedule", "rankings", "heisman", "nil", "teams", "conferences"]) {
    assert.ok(staticRootTitle(root), `static root /${root} lost its title`);
  }
});

test("injury desk: ESPN base maps to dataset teams, long-term rule holds, cadence works", async () => {
  const injury = await import("../lib/injury-report.ts");
  // ESPN's college feed populates through the season — early season may be thin;
  // every published entry must still map to a real dataset team or null.
  const slugs = new Set(teams.map((team) => team.slug));
  for (const entry of injury.espnInjuries) {
    assert.ok(entry.teamSlug === null || slugs.has(entry.teamSlug), `unknown team ${entry.teamSlug}`);
  }
  assert.ok(injury.isLongTerm({ status: "IR", weeksOut: null }));
  assert.ok(injury.isLongTerm({ status: "OUT", weeksOut: 3 }));
  assert.ok(!injury.isLongTerm({ status: "OUT", weeksOut: 2 }));
  assert.ok(!injury.isLongTerm({ status: "QUESTIONABLE", weeksOut: null }));
  assert.equal(injury.likelihoodFromPractice({ wed: null, thu: "FP", fri: "FP", sat: null }).likelihood, "likely");
  assert.equal(injury.likelihoodFromPractice({ wed: null, thu: null, fri: "DNP", sat: null }).likelihood, "doubtful");
  assert.equal(injury.likelihoodFromPractice({ wed: null, thu: null, fri: null, sat: null }).likelihood, null);
  assert.equal(injury.INJURY_CADENCE.length, 3); // Tuesday main + two Saturday slots
  const next = injury.nextInjurySlot();
  assert.ok(next.at.getTime() > Date.now());
  const friday = new Date("2026-09-11T18:00:00Z"); // 11 AM PT Friday
  const fromFriday = injury.nextInjurySlot(friday);
  assert.ok(fromFriday.at.getTime() > friday.getTime());
  assert.equal(fromFriday.slot.id, "saturday-morning");
  // Research ledger ships verified long-term entries that persist across weeks; every row must be sourced.
  for (const row of injury.injuryResearch.ledger) {
    assert.ok(row.sources.length >= 1, row.player + ": unsourced ledger entry");
  }});

test("travel affiliates: config integrity and fail-closed placement", async () => {
  const { travelPartners, activeTravelPartners, travelLinksForQuery, travelAffiliatesConfigured } =
    await import("../lib/travel-affiliates.ts");
  const categories = { hotels: 0, flights: 0, cars: 0 };
  for (const partner of travelPartners) {
    categories[partner.category] += 1;
    assert.match(partner.id, /^[a-z0-9-]+$/);
    assert.ok(partner.commissionNote.length > 3, partner.id);
  }
  // 2-3 partners per category per the strategy doc
  for (const [category, count] of Object.entries(categories)) {
    assert.ok(count >= 2 && count <= 3, `${category}: expected 2-3 partners, got ${count}`);
  }
  // Pre-activation: nothing renders anywhere (fail-closed placement surfaces).
  if (!travelAffiliatesConfigured) {
    assert.equal(activeTravelPartners().length, 0);
    assert.deepEqual(travelLinksForQuery("hotels near Bryant-Denny Stadium", "hotels"), []);
  } else {
    for (const link of travelLinksForQuery("Tuscaloosa car rental", "cars")) {
      assert.match(link.url, /^https:/, link.partner);
    }
  }
});
test("Heisman watch: every contender maps to a dataset team, odds carry outlets, sources exist", async () => {
  const { heismanWatch, heismanBoard, oddsRank } = await import("../lib/awards-watch.ts");
  if (heismanWatch.contenders.length === 0) {
    assert.match(heismanWatch.notes ?? "", /pending/i);
    assert.deepEqual(heismanBoard(), []);
    return;
  }
  assert.ok(heismanWatch.contenders.length > 0);
  const slugs = new Set(teams.map((team) => team.slug));
  for (const contender of heismanWatch.contenders) {
    assert.ok(slugs.has(contender.team_slug), `${contender.player}: unknown team_slug ${contender.team_slug}`);
    assert.ok(["high", "medium", "low"].includes(contender.confidence), contender.player);
    assert.ok(contender.stat_line.length > 10, `${contender.player}: stat line missing`);
    assert.ok(contender.case_for.length > 30 && contender.case_against.length > 20, contender.player);
    assert.ok(contender.sources.length >= 1, `${contender.player}: no source`);
    if (contender.odds_as_reported) {
      for (const odds of contender.odds_as_reported) {
        assert.ok(odds.outlet.length > 1, `${contender.player}: odds without outlet`);
        assert.match(odds.value, /^[+-]\d+$/, `${contender.player}: odds value not a published price`);
      }
    }
  }
  // The board orders by shortest reported odds; unpriced contenders sit last.
  const board = heismanBoard();
  assert.ok(oddsRank(board[0]) <= oddsRank(board[board.length - 1]));
  assert.ok(board[0].odds_as_reported !== null, "board leader must be priced");
  // Cross-verification discipline: the engine-flagged contender is low confidence.
  const reed = heismanWatch.contenders.find((contender) => contender.player === "Marcel Reed");
  assert.ok(!reed || reed.confidence === "low", "Reed carries the unresolved-verification flag");
});

test("NIL watch: ledger is sourced, valuations stay single-source medium, no estimated values", async () => {
  const { nilWatch, formatValuation } = await import("../lib/awards-watch.ts");
  // A published week may honestly carry zero verifiable in-window deals
  // (fail-closed with disclosure) — same philosophy as the injury desk's
  // thin-early-season note. When deals exist, every one must be sourced.
  if (nilWatch.week_deals.length === 0) {
    assert.ok((nilWatch.notes ?? "").length > 20, "empty deals ledger requires a disclosed window note");
  }
  const slugs = new Set(teams.map((team) => team.slug));
  for (const deal of nilWatch.week_deals) {
    assert.ok(slugs.has(deal.team_slug), `${deal.player}: unknown team_slug ${deal.team_slug}`);
    assert.ok(["high", "medium", "low"].includes(deal.confidence), deal.player);
    assert.ok(deal.sources.length >= 1, `${deal.player}: unsourced deal`);
    assert.ok(deal.deal_summary.length > 20, `${deal.player}: summary missing`);
    if (deal.announced_value != null) assert.ok(deal.announced_value > 0, deal.player);
  }
  for (const entry of nilWatch.watch_valuations) {
    assert.ok(slugs.has(entry.team_slug), `valuation: unknown team_slug ${entry.team_slug}`);
    // On3's index is a single proprietary source — high would violate the two-source rule.
    assert.ok(entry.confidence !== "high", `${entry.player}: valuation cannot be high confidence`);
    assert.ok(entry.valuation.reported_by.length > 1, entry.player);
    assert.match(entry.valuation.reported_on, /^\d{4}-\d{2}-\d{2}$/, entry.player);
  }
  assert.ok(nilWatch.watch_valuations.length >= 1, "expected the On3 valuation watch on a published board");
  assert.equal(formatValuation(6500000), "$6.5M");
  assert.equal(formatValuation(225000), "$225K");
  assert.equal(formatValuation(null), "Not disclosed");
});
