import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { visibleText, withoutComments } from "./html-text.mjs";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

async function fetchRoute(path, init) {
  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html", ...(init?.headers ?? {}) },
      ...init,
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the finished home utility", async () => {
  const response = await fetchRoute("/");
  assert.equal(response.status, 200);
  // The board week depends on the request's server clock: never cacheable.
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/i);
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);

  const html = await response.text();
  assert.match(html, /Every Saturday/);
  assert.match(html, /GAME OF THE WEEK|MARQUEE MATCHUP/);
  assert.match(html, /138/);
  assert.match(html, /FBS programs/);
  assert.match(html, /Clean Mode/);
  // The Drive loader connects to configuration/collection on its own origin.
  // A script-src allowance alone loads the JS but leaves Drive without config.
  const directives = new Map((response.headers.get("content-security-policy") ?? "").split(";").map(part => {
    const [name, ...sources] = part.trim().split(/\s+/);
    return [name, sources];
  }));
  assert.ok(new Set(directives.get("script-src")).has("https://tpembars.com"));
  assert.ok(new Set(directives.get("connect-src")).has("https://tpembars.com"));
  assert.ok(!directives.get("connect-src")?.some(source => ["*", "https:", "http:"].includes(source)));
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("Command Center serves the same dated public snapshot and reviewed archives", async () => {
  const response = await fetchRoute("/api/gameday");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  const snapshot = await response.json();
  assert.equal(snapshot.schemaVersion, 1);
  assert.match(snapshot.revision, /^[a-f0-9]{64}$/);
  assert.equal(snapshot.teams.length, 138);
  assert.equal(snapshot.injuries.officialReports.find(r => r.player === "Malachi Singleton")?.status, "Available");
  assert.equal(snapshot.injuries.officialReports.find(r => r.player === "Dante Moore")?.status, "Out");
  assert.equal(snapshot.injuries.officialReports.find(r => r.player === "Mark Bowman")?.published_at, "2026-10-21");
  for (const week of snapshot.weeks) {
    const feed = await fetchRoute(`/api/gameday?week=${week.week}`);
    const doc = await feed.json();
    const page = await fetchRoute(`/gameday?week=${week.week}`);
    assert.equal(page.status, 200);
    const text = visibleText(await page.text());
    assert.ok(text.includes("GameDay Command Center"));
    assert.match(text, new RegExp(`WEEK ${week.week}`));
    assert.ok(text.includes(`${doc.games.length} matching games`));
    assert.ok(text.includes("Official Available"));
    assert.ok(text.includes("Official Questionable"));
    assert.ok(text.includes("Official Out"));
    assert.ok(text.includes("exact publication time is not displayed"));
    assert.ok(text.includes("these are current records, including when viewing an archived schedule"));
    assert.equal(doc.revision, snapshot.revision);
  }
  for (const week of ["10", "8junk", "", "-1"]) assert.equal((await fetchRoute(`/api/gameday?week=${week}`)).status, 400);
  const options = await fetchRoute("/api/gameday", {method:"OPTIONS"});
  assert.equal(options.status, 204);
  assert.equal((await fetchRoute("/api/gameday", {method:"POST"})).status, 405);
});

test("the upcoming neutral-site marquee uses the verified event venue across native surfaces", async () => {
  const html = withoutComments(await (await fetchRoute("/?week=9")).text());
  const marquee = html.match(/<section[^>]*aria-labelledby="marquee-title"[\s\S]*?<\/section>/)?.[0];
  assert.ok(marquee);
  assert.match(visibleText(marquee), /Florida vs Georgia/);
  assert.match(visibleText(marquee), /Mercedes-Benz Stadium/);
  assert.doesNotMatch(visibleText(marquee), /Sanford Stadium/);
  const feed = await (await fetchRoute("/api/gameday?week=9")).json();
  const game = feed.games.find(g => g.homeTeamId === "georgia" && g.awayTeamId === "florida");
  assert.equal(game.neutralSite, true); assert.equal(game.venue, "Mercedes-Benz Stadium");
});

test("the reviewed Week 6 archive renders its games and sourced metrics", async () => {
  const response = await fetchRoute("/?week=6");
  const html = withoutComments(await response.text());
  assert.match(html, /Georgia/);
  assert.match(html, /Alabama/);
  assert.match(html, /Week of Mon, Oct 5/);
  assert.match(html, /Season leaders/);
  assert.match(html, /2,604/);
  assert.doesNotMatch(html, /Rankings: AP preseason|reflect the AP preseason poll|Preseason · Points/);
});

test("www canonicalizes to the apex domain without losing the request target", async () => {
  const response = await worker.fetch(
    new Request("https://www.cfbapex.com/scores?week=1"),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "https://cfbapex.com/scores?week=1");
  assert.match(response.headers.get("strict-transport-security") ?? "", /includeSubDomains/);
});

test("critical product routes render dataset-backed content", async () => {
  const routes = [
    ["/scores", /The slate, without the scavenger hunt/],
    ["/scores", /Select scoreboard week/],
    ["/rankings", /AP and Coaches, straight from the release/],
    ["/transfer-portal", /Cole Adams/],
    ["/transfer-portal/alabama", /portal ledger/],
    ["/transfer-portal/alabama", /vanderbilt/i],
    ["/coaches/kalen-deboer", /\$12,500,000/],
    ["/coaches/kalen-deboer", /Buyout:/],
    ["/stadiums", /Bryant-Denny Stadium/],
    ["/stadiums", /138/],
    ["/stadiums/alabama", /Clear-bag policy/],
    ["/search", /Try Clemson, Dabo Swinney, or Arch Manning/],
    ["/games/2026-09-12-oklahoma-at-michigan", /FOX/],
    ["/games/2026-09-12-oklahoma-at-michigan", /12:00 PM ET/],
    ["/teams/alabama", /SP\+/],
    ["/teams/alabama", /23\.0/],
    ["/playoff-predictor", /Current playoff projections are withheld/],
    ["/coaching-carousel", /Separate the contract/],
    ["/dfs", /Fantasy context, when you ask for it/],
    ["/injuries", /injury/i],
    ["/highlight", /DeSean Bishop/i],
    ["/highlight", /Jamal Roberts|DeSean Bishop/i],
    ["/upset-watch", /Upset Watch/i],
    ["/playoff-audit", /Road to the Playoff/i],
    ["/heisman", /Jeremiah Smith/i],
    ["/watch", /TicketNetwork/],
    ["/watch", /TicketSmarter/],
    ["/api/injuries", /source/],
    ["/injuries", /The injury report, on the record/],
    ["/injuries", /LONG-TERM LEDGER/],
    ["/injuries", /Research as of/],
    ["/injuries", /Heintschel/],
    ["/api/injuries", /"source": ?"ESPN college football injuries feed/],
    ["/watch", /televised games/],
    ["/watch", /WFFN/],
    ["/watch", /Crimson Tide Sports Network/],
    ["/", /hello@cfbapex\.com/],
    ["/", /privacy@cfbapex\.com/],
    ["/privacy", /privacy@cfbapex\.com/],
    ["/media-kit", /media@cfbapex\.com/],
    ["/corrections", /admin@cfbapex\.com/],
    ["/about", /socials@cfbapex\.com/],
    ["/watch", /Local radio/],
    ["/players/arch-manning", /FANTASY NOTE/],
    ["/players/arch-manning", /Week 1 QB rank No\. 1/],
    ["/teams", /All 138 FBS programs/],
    ["/teams/clemson", /Clemson/],
    ["/teams/clemson", /Tigers/],
    ["/teams/clemson", /players listed|Availability/],
    ["/coaches/dabo-swinney", /Dabo Swinney/],
    ["/games/2026-08-29-hawaii-at-stanford", /Stanford/],
    ["/teams/alabama", /Availability|injur/i],
    ["/teams/alabama", /\/logos\/alabama\.png/],
    ["/teams/texas", /\/logos\/texas\.png/],
  ];

  for (const [path, pattern] of routes) {
    const response = await fetchRoute(path);
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), pattern, path);
  }
});

test("spoofed admin-identity headers never reach the app (NF-1)", async () => {
  const response = await fetchRoute("/admin", {
    headers: { "oai-authenticated-user-email": "operator@cfbapex.com" },
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  // The console must render its unauthenticated state — a spoofed identity
  // header can never authorize it.
  assert.ok(!/operator@cfbapex\.com/.test(html), "spoofed email leaked into the admin page");
});

test("health and readiness endpoints disclose dataset state", async () => {
  const health = await fetchRoute("/api/health", { headers: { accept: "application/json" } });
  assert.equal(health.status, 200);
  assert.equal((await health.json()).dataEnvironment, "dataset");

  const readiness = await fetchRoute("/api/readiness", { headers: { accept: "application/json" } });
  const data = await readiness.json();
  assert.equal(data.readyForPreview, true);
  assert.equal(data.readyForProductionLiveData, false);
  assert.match(readiness.headers.get("cache-control") ?? "", /no-store/i);
  assert.ok(data.productionGates.length >= 10);
  assert.ok(data.productionGates.some((gate) => gate.id === "LIVE_MODE" && gate.status === "blocked"));
});

test("simulation API withholds unvalidated projections and preserves input protections", async () => {
  // Any real scheduled game and one of its real participants.
  const board = await fetchRoute("/api/simulate", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ iterations: 100_000 }),
  });
  assert.equal(board.status, 503);
  assert.equal((await board.json()).status, "unavailable");

  const invalid = await fetchRoute("/api/simulate", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ forced: { "scenario-1": "team-16" }, iterations: 100_000 }),
  });
  assert.equal(invalid.status, 400);

  const unknownTeam = await fetchRoute("/api/simulate", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ forced: { "scenario-1": "clemson" }, iterations: 100_000 }),
  });
  assert.equal(unknownTeam.status, 400);
});

test("weekly release renders current data, truthful pending states and both archived weeks", async () => {
  assert.equal(visibleText("<section>Before<ScRiPt>hidden</script >After<!-- invisible --></section>"), "Before After");
  const paths = ["/", "/?week=6", "/?week=7", "/scores?week=7", "/scores?week=8", "/watch?week=8", "/rankings", "/injuries", "/heisman", "/upset-watch", "/highlight", "/panel", "/playoff-audit", "/data-sources"];
  const pages = new Map(await Promise.all(paths.map(async path => {
    const response = await fetchRoute(path);
    assert.equal(response.status, 200, path);
    const text = visibleText(await response.text());
    assert.doesNotMatch(text, /Demonstration records|fictional|Pending 2026 season data|Live standings from ESPN, refreshed on every build|\b0\s+others receiving votes|No change published|\bmiami fl\b|refreshes live on every page load/i, path);
    return [path, text];
  })));
  const current = pages.get("/");
  assert.match(current, /WEEK 9 · OCT 27–31/);
  assert.match(current, /Two verified October 27 finals; 54 upcoming fixtures/);
  assert.doesNotMatch(current, /kickoff listings remain uncorroborated|TV N\/A/);
  assert.doesNotMatch(current, /College GameDay · Salt Lake City/);
  assert.doesNotMatch(current, /network remains pending school confirmation/);
  assert.match(visibleText(await (await fetchRoute("/?week=8")).text()), /College GameDay · Salt Lake City/);
  assert.match(current, /AP TOP 25 2026-10-25/);
  assert.match(current, /2,604/);
  assert.match(pages.get("/?week=6"), /MARQUEE MATCHUP Georgia at Alabama Sat, Oct 10 ABC · FINAL · Georgia 20, Alabama 17/);
  const week7 = pages.get("/?week=7");
  assert.match(week7, /WEEK 7 · OCT 13–17 · ARCHIVE/);
  assert.match(week7, /MARQUEE MATCHUP Ohio State at Indiana Sat, Oct 17 FOX · FINAL · Ohio State 19, Indiana 15/);
  assert.match(week7, /Week 7 final: eight ranked losses and a new No. 1/);
  assert.doesNotMatch(week7, /Week 8:|No. 14 Houston at No. 10 Utah leads Week 8/);
  assert.match(pages.get("/scores?week=7"), /Final/);
  assert.match(pages.get("/scores?week=8"), /56/);
  assert.match(pages.get("/injuries"), /Week 8 research completed/);
  assert.match(pages.get("/injuries"), /Nico Iamaleava/);
  assert.match(pages.get("/injuries"), /rest of the season/);
  assert.match(pages.get("/heisman"), /7 contenders/);
  assert.doesNotMatch(pages.get("/heisman"), /BetMGM|FanDuel|DraftKings/);
  assert.match(pages.get("/upset-watch"), /3 picks this week/);
  assert.match(pages.get("/highlight"), /WEEK 7 CHAMPION/);
  assert.doesNotMatch(pages.get("/highlight"), /WEEK 1 CHAMPION/);
  assert.match(pages.get("/panel"), /WEEK 8 DEBATE BRIEF/);
  assert.match(pages.get("/playoff-audit"), /First CFP rankings: November 3/);
  assert.doesNotMatch(pages.get("/playoff-audit"), /null losses|Five highest-ranked conference champions/);
  assert.match(pages.get("/data-sources"), /VERIFIED SNAPSHOT/);
  const resolvedGame = await fetchRoute("/games/2026-10-24-sacramento-state-at-ball-state");
  assert.equal(resolvedGame.status, 200);
  const resolvedText = visibleText(await resolvedGame.text());
  assert.match(resolvedText, /3:30 PM ET/);
  assert.match(resolvedText, /ESPN\+/);
  assert.doesNotMatch(resolvedText, /pending school confirmation|TV: Not published/);
});

test("Oct 9 refresh: midweek finals render as finals, not as upcoming games", async () => {
  const visible = async (path) => visibleText(await (await fetchRoute(path)).text());
  // Week 6 is the archive board after the Oct 11 cutover; `?week=6` pins it.
  const home = await visible("/?week=6");
  // Homepage week board: Tue-Thu rows are finals with scores, no kickoff times.
  assert.match(home, /Tue, Oct 6 final Southern Miss 34 Troy 55 Final/);
  assert.match(home, /Thu, Oct 8 final Sam Houston 3 Liberty 35 Final/);
  // Every Tue-Thu board row is a final; no midweek row carries a kickoff/TV slot.
  assert.doesNotMatch(home, /(Tue, Oct 6|Wed, Oct 7|Thu, Oct 8) (?!final\b)/);
  // Saturday's late game is a verified final on its own Eastern date.
  const hawaii = await visible("/games/2026-10-10-hawaii-at-arizona-state");
  assert.match(hawaii, /Arizona State Sun Devils final Sat · 2026-10-10 · 10:30 PM ET FS1/);
  assert.match(hawaii, /Arizona State Sun Devils 4–3 30/);
  const game = await visible("/games/2026-10-08-south-florida-at-utsa");
  assert.match(game, /South Florida Bulls at UTSA Roadrunners final/);
  assert.doesNotMatch(game, /South Florida Bulls at UTSA Roadrunners game preview/);
  assert.match(game, /Thu · 2026-10-08 · 7:30 PM ET/);
  const troy = await visible("/teams/troy");
  assert.match(troy, /Oct 6 vs Southern Miss[\s\S]{0,80}W 55–34 FINAL/);
  const rankings = await visible("/rankings");
  assert.match(rankings, /as of 2026-10-28/);
  assert.match(rankings, /UTSA 4 0 0 1\.000 7[-–]1/);
  assert.match(rankings, /South Florida 1 2 0 0\.333 5-2/);
});

test("October 10 pregame corrections and partial availability caveat render", async () => {
  const visible = async (path) => visibleText(await (await fetchRoute(path)).text());
  const home = await visible("/?week=6");
  assert.match(home, /SCHEDULE CHECKED 2026-10-10/);
  assert.match(home, /Friday finals: Louisville, Iowa, Utah State, Wyoming and BYU win/);
  assert.match(home, /Rice–ECU at 1 PM ET/);
  const utah = await visible("/games/2026-10-10-kansas-at-utah");
  assert.match(utah, /8:00 PM ET/);
  assert.match(utah, /Sat, Oct 10/);
  assert.doesNotMatch(utah, /Sun, Oct 11/);
  assert.match(utah, /ESPN App · linear network TBD/);
  const byu = await visible("/games/2026-10-09-iowa-state-at-byu");
  assert.match(byu, /Iowa State Cyclones at BYU Cougars final/);
  assert.match(byu, /Fri · 2026-10-09 · 10:30 PM ET/);
  assert.match(byu, /Fri, Oct 9/);
  // The watch board opens on the server-clock board week.
  const watchHtml = withoutComments(await (await fetchRoute("/watch")).text());
  const boardWeek = Date.now() >= Date.parse("2026-10-25T13:00:00Z") ? 9 : Date.now() >= Date.parse("2026-10-18T13:00:00Z") ? 8 : Date.now() >= Date.parse("2026-10-11T13:00:00Z") ? 7 : 6;
  assert.match(watchHtml, new RegExp(`aria-pressed="true">W(?:eek|K|k) ?${boardWeek}</button>`));
  const watch = await visible("/watch?week=6");
  assert.match(watch, /ESPN App · linear network TBD/);
  assert.match(watch, /Iowa[\s\S]{0,80}Washington/);
  const injuries = await visible("/injuries");
  assert.match(injuries, /Limited official availability snapshot · 2026-10-10/);
  assert.match(injuries, /Week 8 research completed/);
  assert.match(injuries, /Research as of 2026-10-22/);
});

test("official availability containment renders literal designations and historical context", async () => {
  const html = withoutComments(await (await fetchRoute("/injuries")).text());
  const text = visibleText(html);
  assert.doesNotMatch(text, /Kahleil Jackson|Jamariun Morrow|Tre Harris/);
  assert.match(text, /87 tracked players from 19 teams/);
  assert.match(text, /Jayden Gibson[\s\S]*?South Carolina/);
  assert.match(text, /Zahir Mathis[\s\S]*?Maryland/);
  assert.match(text, /Jamarion Morrow[\s\S]*?Available/);
  assert.match(text, /Trell Harris[\s\S]*?Out/);
  assert.match(text, /Mario Craver[\s\S]*?Game Time Decision/);
  assert.match(text, /Exempt is not Available/);
  assert.match(text, /Six October 5 ledger entries/);
  assert.match(text, /Published 2026-10-10T09:30:00-05:00; retrieved 2026-10-10T14:31/);
  assert.doesNotMatch(html, /class="db-table-wrap db-desktop-data-table"/);
  const player = withoutComments(await (await fetchRoute("/players/dante-moore")).text());
  assert.match(player, /Historical Week 1 availability/);
  assert.match(player, /This Week 1 note retains its original date/);
  assert.match(player, /UCLA vs Oregon: Out|Oregon vs UCLA: Out/);
});


test("Available Jake Maikkula keeps explicitly dated ledger history without a current OUT row", async () => {
  const html = withoutComments(await (await fetchRoute("/injuries")).text());
  const tableRows = [...html.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((match) => match[0]);
  const jakeRows = tableRows.filter((row) => row.includes("Jake Maikkula"));
  assert.equal(jakeRows.length, 1, "Available removes the current long-term absence row");
  const text = visibleText(jakeRows[0]);
  assert.match(text, /Available/);
  assert.match(text, /Historical editorial note \(2026-10-05\): Knee\. Historical October 5 entry; not rechecked for Week 8\. Expected to miss multiple consecutive weeks/);
  assert.doesNotMatch(jakeRows[0], /inj-pill--out/);
});

test("Week 8 reporting stays separate from older official availability and Clean Mode hides prices", async () => {
  const injuryHtml = withoutComments(await (await fetchRoute("/injuries")).text());
  const injuryText = visibleText(injuryHtml);
  assert.match(injuryText, /Current injury and quarterback updates/);
  assert.match(injuryText, /Hollywood Smothers Official Questionable · October 24/);
  assert.match(injuryText, /Source date 2026-10-19/);
  assert.match(injuryText, /Hank Brown Healthy; coaching decision/);
  assert.match(injuryText, /James Laubstein.*season-ending patellar tendon/);
  assert.match(injuryText, /Historical official game availability/);
  assert.match(injuryText, /official snapshot 2026-10-10/);
  const currentSection = injuryHtml.split('id="inj-current-title"')[1]?.split('aria-labelledby="inj-watch-title"')[0] ?? "";
  assert.ok(currentSection.includes("Hollywood Smothers"));
  assert.doesNotMatch(visibleText(currentSection), /Official · 2026-10-10|practice.*FP/);
  for (const path of ["/heisman", "/upset-watch"]) {
    const text = visibleText(await (await fetchRoute(path)).text());
    assert.match(text, /Clean Mode hides market/);
    assert.match(text, /Review Analysis Mode disclosure/);
    assert.doesNotMatch(text, /-125|-110|\+325|\+6\.5|\+10\.5/);
  }
  const heisman = visibleText(await (await fetchRoute("/heisman")).text());
  assert.doesNotMatch(heisman, /40%|25%|Two research engines|PFF grade/);
});


test("scores metadata and hero disclose the current verified snapshot without restamping history", async () => {
  const html = withoutComments(await (await fetchRoute("/scores?week=6")).text());
  assert.match(html, /<title>College Football Scores \| CFB Apex<\/title>/);
  assert.doesNotMatch(html, /Live College Football Scores/);
  const hero = html.match(/<header class="page-heading">[\s\S]*?<\/header>/)?.[0] ?? "";
  const text = visibleText(hero);
  assert.match(text, /Verified snapshot/);
  assert.match(text, /schedule checked 2026-10-10 09:09 UTC; finals verified 2026-10-11 \d\d:\d\d UTC/);
  assert.doesNotMatch(text, /Dataset.*Sep 5|is current/);
  const week7 = withoutComments(await (await fetchRoute("/scores?week=7")).text());
  const week7Hero = visibleText(week7.match(/<header class="page-heading">[\s\S]*?<\/header>/)?.[0] ?? "");
  assert.match(week7Hero, /Week 7 schedule checked 2026-10-11 \d\d:\d\d UTC; finals verified 2026-10-20 \d\d:\d\d UTC/);
  const game = withoutComments(await (await fetchRoute("/games/2026-10-10-north-dakota-state-at-unlv")).text());
  assert.match(game, /Verified Sep 7, 2026/);
  assert.doesNotMatch(game, /Verified Sep 6, 2026/);
  // Now final: the result replaces the pregame slot/announced-kickoff note.
  const gameText = visibleText(game);
  assert.match(gameText, /North Dakota State Bison at UNLV Rebels final/);
  assert.match(gameText, /UNLV Rebels 4–3 13/);
});


test("injury search metadata states limited tracked-player coverage", async () => {
  const html = await (await fetchRoute("/injuries")).text();
  assert.match(html, /name="description" content="Dated official game-availability snapshots for tracked players on selected teams, plus sourced historical injury context\. Coverage is limited\."/);
  assert.doesNotMatch(html, /availability watch across every FBS team/);
});

test("scoreboard keeps week navigation without a pretend refresh affordance", async () => {
  const html = withoutComments(await (await fetchRoute("/scores?week=6")).text());
  assert.doesNotMatch(html, /Pull to refresh|Release to check|scoreboard-pull-cue/);
  assert.match(html, /Select scoreboard week/);
  assert.match(html, /aria-label="View week 5"/);
  assert.match(html, /aria-label="View week 7"/);
  assert.match(html, /Week 6\. 58 games shown\./);
  const week7 = withoutComments(await (await fetchRoute("/scores?week=7")).text());
  assert.match(week7, /Week 7\. 59 games shown\./);
  assert.match(week7, /aria-current="page"[^>]*>[\s\S]*?Week 7/);
  assert.match(html, /Status changes require a newer verified release/);
});

test("Friday and Saturday finals and current records agree across the Command Center, API, scores and game files", async () => {
  const expected = JSON.parse(readFileSync(new URL("../data/cfb-2026/refresh/evidence/2026-10-25-week8-gameday-results.json", import.meta.url), "utf8"));
  const feed = await (await fetchRoute("/api/gameday?week=8")).json();
  const command = visibleText(await (await fetchRoute("/gameday?week=8")).text());
  const scores = visibleText(await (await fetchRoute("/scores?week=8")).text());
  assert.equal(feed.season, 2026);
  assert.equal(feed.selectedWeek, 8);
  assert.equal(feed.games.filter(game => game.status === "final").length, 56);
  assert.match(command, /2026/);
  assert.ok(command.includes(feed.sourceDates.previousResults));
  assert.notEqual(feed.sourceDates.previousResults, feed.sourceDates.results);
  for (const id of expected.new_final_ids) {
    const row = expected.finals.find(row => row.id === id);
    const game = feed.games.find(game => game.id === row.game_id);
    assert.equal(game.status, "final");
    assert.equal(game.awayScore, row.away_score);
    assert.equal(game.homeScore, row.home_score);
    assert.ok(command.includes(`FINAL · ${row.away_score}–${row.home_score}`));
    const page = visibleText(await (await fetchRoute(`/games/${row.game_id}`)).text());
    for (const value of [row.away_score, row.home_score]) assert.ok(page.includes(String(value)));
    assert.match(page, /FINAL|Final/);
    assert.ok(scores.includes(String(row.away_score)));
  }
  const records = JSON.parse(readFileSync(new URL("../data/cfb-2026/refresh/evidence/2026-10-28-week9-refresh.json", import.meta.url), "utf8")).records;
  for (const team of feed.teams) assert.equal(team.record.replace("–", "-"), records[team.slug]);
});

test("injury and Heisman week copy retain the actual reviewed weeks and one statistics label", async () => {
  const injuries = visibleText(await (await fetchRoute("/injuries")).text());
  assert.match(injuries, /Dated Week 8 reporting/);
  const heisman = visibleText(await (await fetchRoute("/heisman")).text());
  assert.match(heisman, /Week 8 watch list/);
  assert.match(heisman, /verified Week 7 box scores/);
  assert.match(heisman, /displayed Week 7 statistics/);
  assert.doesNotMatch(heisman, /Week -1/);
});


test("unverified current modules publish an accessible unavailable state and historical coverage remains dated", async () => {
  for (const [path, expected] of [["/playoff-predictor", /Current playoff projections are withheld/], ["/playoff-bracket", /A current projected bracket is unavailable/], ["/nil", /Current NIL coverage is withheld/], ["/no-names", /Missing recruiting ratings are unknown/]]) {
    const response = await fetchRoute(path); assert.equal(response.status, 200);
    const text = visibleText(await response.text()); assert.match(text, expected);
    assert.doesNotMatch(text, /Run 20,000 simulations|Projected field/);
  }
  const teamPage = visibleText(await (await fetchRoute("/teams")).text());
  assert.match(teamPage, /Other FBS/);
  const page = visibleText(await (await fetchRoute("/panel")).text());
  assert.match(page, /Historical editorial brief: Week 8, October 20/);
});


test("consolidated game URLs remain reachable with one canonical scoreboard result", async () => {
  for (const path of ["/games/2026-08-29-north-carolina-at-tcu", "/games/2026-08-30-memphis-at-unlv", "/games/2026-09-03-umass-at-rutgers"]) {
    const response = await fetchRoute(path); assert.equal(response.status, 200);
    const html = await response.text();
    const text = visibleText(html);
    assert.match(text, /final/i);
    assert.doesNotMatch(html, /href="\/stadium\//);
    if (path.includes("north-carolina")) {
      assert.ok(html.includes('href="https://cfbapex.com/games/2026-08-29-north-carolina-vs-tcu"'));
      assert.match(text, /Neutral venue parking, bags and transit guidance unavailable/);
      assert.doesNotMatch(text, /Campus lots around the stadium are managed by TCU/);
    }
  }
});
