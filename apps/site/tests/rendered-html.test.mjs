import assert from "node:assert/strict";
import test from "node:test";

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
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("the reviewed Week 6 archive renders its games and sourced metrics", async () => {
  const response = await fetchRoute("/?week=6");
  const html = (await response.text()).replace(/<!--[\s\S]*?-->/g, "");
  assert.match(html, /Georgia/);
  assert.match(html, /Alabama/);
  assert.match(html, /Week of Mon, Oct 5/);
  assert.match(html, /Season leaders/);
  assert.match(html, /1,851/);
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
    ["/playoff-predictor", /You call the Saturdays/],
    ["/coaching-carousel", /Separate the contract/],
    ["/dfs", /Fantasy context, when you ask for it/],
    ["/injuries", /injury/i],
    ["/highlight", /Braden Atkinson/i],
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

test("simulation API rejects invalid scenario participants and caps work", async () => {
  // Any real scheduled game and one of its real participants.
  const board = await fetchRoute("/api/simulate", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ iterations: 100_000 }),
  });
  assert.equal(board.status, 200);
  assert.equal((await board.json()).iterations, 20_000);

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

test("audit week 6: forbidden stale strings never ship; verified additions render", async () => {
  // The Oct 5 verification audit found these strings on production pages.
  // They must never come back; the checks run on visible text, not markup.
  const FORBIDDEN = [
    /Demonstration records/i,
    /fictional/i,
    /Pending 2026 season data/,
    /\b0\s+others receiving votes/i,
    /No change published/,
    /\bmiami fl\b/i,
    /Live standings from ESPN, refreshed on every build/,
    /refreshes live on every page load/,
  ];
  const pages = await Promise.all(
    [
      "/",
      "/?week=6",
      "/?week=7",
      "/rankings",
      "/injuries",
      "/data-sources",
      "/games/2026-10-10-georgia-at-alabama",
      "/scores",
      "/scores?week=6",
    ].map(async (path) => {
      const response = await fetchRoute(path);
      assert.equal(response.status, 200, path);
      const html = await response.text();
      // Strip scripts, then tags (HTML comments included); React inserts
      // comment nodes between adjacent text segments, so collapse runs of
      // whitespace before pattern-matching visible copy.
      const text = html
        .replace(/<script[\s\S]*?<\/script>/g, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ");
      return [path, text];
    }),
  );
  for (const [path, text] of pages) {
    for (const pattern of FORBIDDEN) {
      assert.doesNotMatch(text, pattern, `${path} ships forbidden stale copy: ${pattern}`);
    }
  }

  // Verified additions from the same audit must render where promised.
  const byPath = new Map(pages);
  // Week 6 is the archive board after the Oct 11 cutover; `?week=6` pins it.
  const week6 = byPath.get("/?week=6") ?? "";
  assert.match(week6, /College GameDay · Tuscaloosa · Sat Oct 10 · ESPN/);
  assert.match(week6, /WEEK 6 · OCT 6–10 · (ARCHIVE|AS OF 2026-10-05)/);
  assert.match(week6, /SNAPSHOT 2026-10-05 07:24 UTC/);
  assert.match(week6, /FINALS VERIFIED 2026-10-11 \d\d:\d\d UTC/);
  assert.match(week6, /Thursday finals: Liberty, Western Kentucky, UTSA and South Alabama win/);
  assert.match(week6, /Saturday finals: Indiana edges Nebraska; Ohio State beats Maryland/);
  assert.match(week6, /games? played since then (is|are) not yet included/);
  assert.doesNotMatch(week6, /These are season totals, updated after completed games/);
  assert.match(week6, /POLLS RELEASED 2026-10-04/);
  assert.match(week6, /SP\+ CONTRAST · AS OF Sep 27/);
  assert.match(week6, /North Dakota State/);
  // Every Week 6 game is a verified final: nothing waits on a result, and the
  // archive's Saturday board (upcoming kickoffs only) has nothing left to slot.
  assert.doesNotMatch(week6, /final not yet verified|KICKOFF TBA/);
  // Absence from the FBS board is never called a bye.
  for (const text of byPath.values()) assert.doesNotMatch(text, /Byes:/);
  // Week 7: the reviewed release, its marquee, and official TBAs without placeholder times.
  const week7 = byPath.get("/?week=7") ?? "";
  assert.match(week7, /WEEK 7 · OCT 13–17 · (PREVIEW|AS OF 2026-10-11)/);
  assert.match(week7, /REVIEWED 2026-10-11 10:30 UTC/);
  assert.match(week7, /MARQUEE MATCHUP Ohio State at Indiana Sat, Oct 17 FOX · 12:00 PM ET/);
  assert.match(week7, /Ohio State 5–1/);
  assert.match(week7, /Indiana 6–0/);
  // After the Oct 11 recheck only Nebraska–Oregon is still officially TBA; the
  // two kickoffs confirmed by the visiting school and ESPN sit in their waves.
  assert.match(week7, /KICKOFF TBA officially unannounced Kickoff TBA Nebraska at 13 Oregon TV N\/A Ranked, not on this FBS board:/);
  assert.match(week7, /1:00 PM ET Charlotte at Temple ESPN\+/);
  assert.match(week7, /8:00 PM ET Louisiana Tech at ULM ESPN\+/);
  assert.match(week7, /Week 7: Ohio State at Indiana leads a 59-game FBS slate/);
  assert.doesNotMatch(week7, /Saturday finals: Indiana edges Nebraska/, "Week 6 stories stay on Week 6");
  assert.match(week7, /Week 6 Oct 6–10 · (Archive|Current)[\s\S]*?Week 7 Oct 13–17 · (Current|Preview)/);
  // The default board follows the server clock: Week 7 from 06:00 Pacific on Oct 11.
  const home = byPath.get("/") ?? "";
  if (Date.now() >= Date.parse("2026-10-11T13:00:00Z")) assert.match(home, /WEEK 7 · OCT 13–17 · AS OF 2026-10-11/);
  else assert.match(home, /WEEK 6 · OCT 6–10 · AS OF 2026-10-05/);
  // The neutral-site Red River final keeps its neutral label.
  assert.match(byPath.get("/?week=6") ?? "", /Neutral final 1 Texas 24 Oklahoma 27 Cotton Bowl \(neutral\)/);
  assert.match(byPath.get("/games/2026-10-10-georgia-at-alabama") ?? "", /College GameDay · Tuscaloosa · Sat Oct 10 · ESPN/);
  assert.match(byPath.get("/rankings") ?? "", /OTHERS RECEIVING VOTES[\s\S]*?Kentucky/);
  assert.match(byPath.get("/rankings") ?? "", /NEW/);
  assert.match(byPath.get("/rankings") ?? "", /Sun Belt/);
  assert.match(byPath.get("/rankings") ?? "", /dropped out/);
  // The Week 6 report shipped Oct 5: the staleness banner is gone and the
  // sourced desk (ledger + watch) renders instead of the collapsed table.
  assert.match(byPath.get("/injuries") ?? "", /Research as of 2026-10-05/); // collapsed-text match
  assert.match(byPath.get("/injuries") ?? "", /Heintschel/);
  assert.doesNotMatch(byPath.get("/injuries") ?? "", /report not yet published/);
  assert.match(byPath.get("/data-sources") ?? "", /VERIFIED SNAPSHOT/);
  assert.match(byPath.get("/data-sources") ?? "", /Open holds/);
});

test("Oct 9 refresh: midweek finals render as finals, not as upcoming games", async () => {
  const visible = async (path) =>
    (await (await fetchRoute(path)).text())
      .replace(/<script[\s\S]*?<\/script>/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ");
  // Week 6 is the archive board after the Oct 11 cutover; `?week=6` pins it.
  const home = await visible("/?week=6");
  // Homepage week board: Tue-Thu rows are finals with scores, no kickoff times.
  assert.match(home, /Tue, Oct 6 final Southern Miss 34 Troy 55 Final/);
  assert.match(home, /Thu, Oct 8 final Sam Houston 3 Liberty 35 Final/);
  // Every Tue-Thu board row is a final; no midweek row carries a kickoff/TV slot.
  assert.doesNotMatch(home, /(Tue, Oct 6|Wed, Oct 7|Thu, Oct 8) (?!final\b)/);
  // Saturday games are verified finals too, including the late Hawai'i kickoff.
  assert.match(home, /Sat, Oct 10 final Hawai(?:'|&#x27;)i 12 Arizona State 30 Final/);
  const game = await visible("/games/2026-10-08-south-florida-at-utsa");
  assert.match(game, /South Florida Bulls at UTSA Roadrunners final/);
  assert.doesNotMatch(game, /South Florida Bulls at UTSA Roadrunners game preview/);
  assert.match(game, /Thu · 2026-10-08 · 7:30 PM ET/);
  const troy = await visible("/teams/troy");
  assert.match(troy, /Oct 6 vs Southern Miss[\s\S]{0,80}W 55–34 FINAL/);
  const rankings = await visible("/rankings");
  assert.match(rankings, /as of 2026-10-10/);
  assert.match(rankings, /UTSA 2 0 0 1\.000 5-1/);
  assert.match(rankings, /South Florida 1 2 0 0\.333 4-2/);
});

test("October 10 pregame corrections and partial availability caveat render", async () => {
  const visible = async (path) => (await (await fetchRoute(path)).text()).replace(/<!--[\s\S]*?-->/g, "").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
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
  const watchHtml = (await (await fetchRoute("/watch")).text()).replace(/<!--[\s\S]*?-->/g, "");
  const boardWeek = Date.now() >= Date.parse("2026-10-11T13:00:00Z") ? 7 : 6;
  assert.match(watchHtml, new RegExp(`aria-pressed="true">W(?:eek|K|k) ?${boardWeek}</button>`));
  const watch = await visible("/watch?week=6");
  assert.match(watch, /ESPN App · linear network TBD/);
  const iowa = await visible("/games/2026-10-09-iowa-at-washington");
  assert.match(iowa, /Iowa Hawkeyes at Washington Huskies final/);
  const injuries = await visible("/injuries");
  assert.match(injuries, /Limited official availability snapshot · 2026-10-10/);
  assert.match(injuries, /AP reported October 8 that Dante Moore is out/);
  assert.match(injuries, /Research as of 2026-10-05/);
});

test("official availability containment renders literal designations and historical context", async () => {
  const html = (await (await fetchRoute("/injuries")).text()).replace(/<!--[\s\S]*?-->/g, "");
  const text = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.doesNotMatch(text, /Kahleil Jackson|Jamariun Morrow|Tre Harris/);
  assert.match(text, /87 tracked players from 19 teams/);
  assert.match(text, /Jayden Gibson[\s\S]*?South Carolina/);
  assert.match(text, /Zahir Mathis[\s\S]*?Maryland/);
  assert.match(text, /Jamarion Morrow[\s\S]*?Available/);
  assert.match(text, /Trell Harris[\s\S]*?Out/);
  assert.match(text, /Mario Craver[\s\S]*?Game Time Decision/);
  assert.match(text, /Exempt is not Available/);
  assert.match(text, /Historical editorial notes: 2026-10-05/);
  assert.match(text, /Published 2026-10-10T09:30:00-05:00; retrieved 2026-10-10T14:31/);
  assert.doesNotMatch(html, /class="db-table-wrap db-desktop-data-table"/);
  const player = (await (await fetchRoute("/players/dante-moore")).text()).replace(/<!--[\s\S]*?-->/g, "");
  assert.match(player, /Historical Week 1 availability/);
  assert.match(player, /This Week 1 note retains its original date/);
  assert.match(player, /UCLA vs Oregon: Out|Oregon vs UCLA: Out/);
});


test("Available Jake Maikkula keeps explicitly dated ledger history without a current OUT row", async () => {
  const html = (await (await fetchRoute("/injuries")).text()).replace(/<!--[\s\S]*?-->/g, "");
  const tableRows = [...html.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((match) => match[0]);
  const jakeRows = tableRows.filter((row) => row.includes("Jake Maikkula"));
  assert.equal(jakeRows.length, 1, "Available removes the current long-term absence row");
  const text = jakeRows[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(text, /Available/);
  assert.match(text, /Historical editorial note \(2026-10-05\): Knee\. Expected to miss multiple consecutive weeks/);
  assert.doesNotMatch(jakeRows[0], /inj-pill--out/);
});


test("scores metadata and hero disclose the current verified snapshot without restamping history", async () => {
  const html = (await (await fetchRoute("/scores?week=6")).text()).replace(/<!--[\s\S]*?-->/g, "");
  assert.match(html, /<title>College Football Scores \| CFB Apex<\/title>/);
  assert.doesNotMatch(html, /Live College Football Scores/);
  const hero = html.match(/<header class="page-heading">[\s\S]*?<\/header>/)?.[0] ?? "";
  const text = hero.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(text, /Verified snapshot/);
  assert.match(text, /schedule checked 2026-10-10 09:09 UTC; finals verified 2026-10-11 \d\d:\d\d UTC/);
  assert.doesNotMatch(text, /Dataset.*Sep 5|is current/);
  const week7 = (await (await fetchRoute("/scores?week=7")).text()).replace(/<!--[\s\S]*?-->/g, "");
  const week7Hero = (week7.match(/<header class="page-heading">[\s\S]*?<\/header>/)?.[0] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(week7Hero, /Week 7 schedule checked 2026-10-11 \d\d:\d\d UTC; no finals verified yet/);
  const game = (await (await fetchRoute("/games/2026-10-10-north-dakota-state-at-unlv")).text()).replace(/<!--[\s\S]*?-->/g, "");
  assert.match(game, /Verified Sep 7, 2026/);
  assert.doesNotMatch(game, /Verified Sep 6, 2026/);
  // Now a verified final at its 7:00 PM ET slot; the announced 7:10 PM ET start stays in the evidence.
  const gameText = game.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(gameText, /North Dakota State Bison at UNLV Rebels final Sat · 2026-10-10 · 7:00 PM ET/);
});


test("injury search metadata states limited tracked-player coverage", async () => {
  const html = await (await fetchRoute("/injuries")).text();
  assert.match(html, /name="description" content="Dated official game-availability snapshots for tracked players on selected teams, plus sourced historical injury context\. Coverage is limited\."/);
  assert.doesNotMatch(html, /availability watch across every FBS team/);
});

test("scoreboard keeps week navigation without a pretend refresh affordance", async () => {
  const html = (await (await fetchRoute("/scores?week=6")).text()).replace(/<!--[\s\S]*?-->/g, "");
  assert.doesNotMatch(html, /Pull to refresh|Release to check|scoreboard-pull-cue/);
  assert.match(html, /Select scoreboard week/);
  assert.match(html, /aria-label="View week 5"/);
  assert.match(html, /aria-label="View week 7"/);
  assert.match(html, /Week 6\. 58 games shown\./);
  const week7 = (await (await fetchRoute("/scores?week=7")).text()).replace(/<!--[\s\S]*?-->/g, "");
  assert.match(week7, /Week 7\. 59 games shown\./);
  assert.match(week7, /aria-current="page"[^>]*>[\s\S]*?Week 7/);
  assert.match(html, /Status changes require a newer verified release/);
});
