# Decision log

## D-001 — Preserve the Sites Vinext foundation

The empty workspace was initialized with the bundled Cloudflare-compatible Vinext/Next.js starter. This satisfies the preview-hosting constraint without introducing a second framework.

## D-002 — Fixture-first vertical slices

Priority 1–5 experiences will be functional against deterministic typed fixtures before any credentialed adapter is enabled. Live adapters remain typed external dependencies.

## D-003 — Single application with modular domain boundaries

The MVP remains one deployable web app with `lib` and component boundaries rather than a monorepo. This minimizes operational overhead while preserving clean provider, simulation, analytics, and configuration interfaces.

## D-004 — Fictional neutral programs in demo mode

The preview uses clearly invented teams, coaches, players, and destinations. This avoids representing stale synthetic values as facts and avoids unlicensed marks.

## D-005 — Runtime-aligned agent concurrency

Agent concurrency is capped at four because the current environment exposes four slots. Parallel discovery and audit work is read-heavy; write-heavy ownership is sequenced.

## D-006 — Synthetic provenance is a first-class status

Demonstration records use `synthetic`, not `official` or implied-live language. Model cards state exactly which deterministic transforms exist and which validation work does not.

## D-007 — Native disclosure dialog

Odds and DFS remain opt-in. The disclosure uses the browser's native modal semantics for focus containment, Escape handling, and focus restoration while keeping Clean Mode as the default.

## D-008 — Private preview boundary

The release is deployed only through authenticated private Sites hosting. Public launch is a separate decision that requires licensed providers, distributed rate limiting, production load testing, tighter CSP, and legal approval.

## D-009 — Supported dependency baseline

The release uses patched Next/React/Vite/Cloudflare dependencies and Biome for the lint gate. Overrides pin audited transitive packages where upstream ranges otherwise resolve vulnerable versions.

## D-010 — Research report requires primary-source audit

The supplied Gemini report is retained as discovery input only. Material CFP, membership, SportsDataIO, Cloudflare streaming, authentication, cost, and model claims are corrected or quarantined in `docs/RESEARCH_REPORT_AUDIT.md` before they can influence code or public content.

## D-011 — Provider procurement remains competitive

Sportradar is the leading core-feed RFP candidate and SportsDataIO the leading reconciliation candidate, but neither is selected until a signed rights matrix, SLA, coverage response, quote, and replay/live pilot are compared. AP polling rights and NWS weather are separate source decisions.

## D-012 — Cloudflare-first stream pilot

Do not precommit to AWS, Fly.io, or another relay. Test the contracted streaming feed in an isolated Cloudflare Worker or Durable Object, always reconcile through REST, and add a minimal external relay only if measured lifecycle or vendor networking requirements demand it.

## D-013 — Deny-by-default public activation

Production readiness is represented by explicit evidence gates in `lib/release-readiness.ts`, `/api/readiness`, and the protected admin console. Flags record approvals but do not substitute for contracts or tests. Worker-level noindex remains hard-coded until an explicitly authorized public release changes it.

## D-014 — Public fixture beta on CFB Apex

Deploy the verified fixture application to the Cloudflare Worker custom domains `cfbapex.com` and `www.cfbapex.com`, with the latter returning a permanent redirect to the apex. The public URL authorization changes hosting scope only: fixture labels, global noindex, live-provider and commercial kill switches, and the live-launch evidence gates remain enforced. Wrangler deployment uses the reproducible `wrangler.deploy.jsonc` artifact configuration; Cloudflare creates the custom-domain DNS records and certificates.

## D-2026-10-05 — Reviewed Week 6 source snapshot

Use `data/cfb-2026/refresh/verified-refresh.json` for Week 6 (October 5–11). It includes 51 newly confirmed Saturday finals, 56 upcoming FBS-vs-FBS games, October 4 AP/Coaches polls, an editorial composite recomputed from those polls, and NCAA leaders through October 3. Five FBS-vs-FCS games across the queried dates are recorded separately because the current UI supports FBS vs FBS. Retain historical results and archived standings/injuries with their original dates. Builds use this reviewed snapshot deterministically; replace it after source review for the next refresh.

Reconcile with main fb81b49 to preserve the independently published Saturday board, ratings comparison and ingest-first scoreboard. Current ratings are retained with their own cutoff; their Week 6 accuracy has not been independently confirmed. The new `.github/workflows/deploy-site.yml` verifies pull requests and publishes the verified frontend on main using the existing Cloudflare repository secrets. Missing secrets fail explicitly; a post-deploy check confirms the exact snapshot timestamp. Local credentials remain unavailable.

## D-2026-10-05 — Startup CPU remediation

The production publish reached Cloudflare using the repository secrets but failed error 10021 (startup CPU limit). Reuse Eastern calendar ICU formatters and a bounded date cache rather than constructing a formatter in every matchup reconciliation scan. Preserve date and DST behavior and rerun the complete release checks before retrying production.

## D-2026-10-05 — Week 6 verification-audit corrections

An independent audit of the October 5 snapshot found two real FBS games (New Mexico State at FIU, Wed Oct 7; Old Dominion at App State, Sat Oct 10) wrongly excluded as "FBS–FCS": both schools sit in FBS conferences (ESPN conference ids 12/CUSA and 37/Sun Belt), but their ESPN display names ("App State Mountaineers", "Florida International Panthers") did not resolve in the slug map. `scripts/apply-week6-audit.mjs` restores both games with records (FIU 2–2, App State 3–1), fills AP/Coaches others-receiving-votes from the October 4 releases, re-pulls conference standings with a fixed alias layer (Sun Belt divisions flattened; all 138 rows slug-linked), and publishes the verified additions (College GameDay badge, AP movers, poll gaps, ranked-vs-ranked set, NDSU storyline). The board is 58 FBS-vs-FBS games. `scripts/build-dataset.mjs` now carries the ESPN-name aliases, a two-layer coverage check (hermetic exclusion evidence + live week-board coverage, enforced in CI), and the post-deploy probe extends to /rankings and a game page. Runner pinned to ubuntu-24.04 with checkout/setup-node v5 ahead of the October 19 Ubuntu 26 rollover.

## D-2026-10-09 — Week 6 midweek finals refresh

`scripts/apply-week6-midweek-finals.mjs` moves the seven Tue–Thu Week 6 games (Troy–Southern Miss Oct 6; Jacksonville State–Kennesaw State and New Mexico State–FIU Oct 7; Liberty–Sam Houston, WKU–Missouri State, UTSA–South Florida, South Alabama–Arkansas State Oct 8) from `scheduledGames` to `playedGames` only after ESPN's game summary reports them completed. Each move asserts home/away orientation, line-score totals and an unchanged Eastern game date, and keeps the scheduled row's ids. Records for the 14 teams are advanced by result and must equal ESPN's post-game records. The remaining 51 rows are re-checked against ESPN and stamped with their own `verified_at`; the only accepted difference, Hawai'i at Arizona State, moves to 02:30Z (7:30 PM MST) because the Arizona State schedule agrees with ESPN.

Conference standings are re-read using ESPN's "vs. Conf." split. The October 5 re-pull wrote overall wins into W and a hard-coded 0 into L for every league (live /rankings showed, for example, South Florida "4–0" alongside a .500 league percentage); tests now require W/L to fit inside each team's overall record. Freshness stays per source: the base snapshot time (`retrieved_at`), poll release (Oct 4), NCAA leaders (through Oct 3) and injuries (Oct 5) keep their own cutoffs; `results_verified_at` and a `refresh_log` entry with per-source evidence record the Oct 9 verification. Finals render with "Final details" instead of "Preview". Evidence for the hand checks is in `data/cfb-2026/refresh/evidence/2026-10-09-midweek.json`.

## D-2026-10-10 — Saturday pregame information refresh

Rechecked all 58 Week 6 FBS-vs-FBS games: seven prior finals, five Friday finals and 46 Saturday assignments. Reviewed evidence is committed under `data/cfb-2026/refresh/evidence/2026-10-10-*.json`; `scripts/apply-oct10-pregame.mjs` validates and applies it without network access or deployment. Friday scores, line totals, orientation and records reconcile to ESPN and school sources; all 138 standings records match. Rice–ECU moves to 1 PM ET; Kansas–Utah moves to 8 PM ET with ESPN App and the linear network TBD. Preserve Eastern dates and ids across UTC midnight. The BYU actual start is recorded separately from its original scheduled start.

The source snapshot stays dated October 5, polls October 4 and NCAA metrics through October 3. Results and schedule checks have distinct October 10 timestamps. Injury research retains its October 5 baseline; Dante Moore's reported absence and Raiola's reported start are attributed to AP October 8, with an explicit partial-review caveat. Official conference availability filings were not fully accessible; never infer an empty report. GameDay venue and broadcast details use official Alabama/ESPN releases. Weather notes are sourced advisories, not fabricated quantitative forecasts. No live provider is added and no deployment is performed by the refresh script.

## D-2026-10-10 — Pregame accuracy containment (14:31 UTC)

Publish a limited official-availability snapshot for 87 players on 19 teams: the 39 previously tracked identities and 48 newly changed game-day designations. Official public reports retain exact team, player, game date, matchup, report ID/stage, publication time, retrieval time and portal URL. A Friday Update 2 stays Friday Update 2. Available, Exempt and Game Time Decision are literal participation designations, not injury inference; a missing row is unknown. Correct four verified identity errors (Gibson to South Carolina, Mathis to Maryland, Jamarion Morrow, Trell Harris). Preserve historical injury narratives, but official Available removes stale absence from the current long-term display. IR remains an explicitly editorial long-term category.

Quarantine ESPN rows with missing/invalid/future dates or older than 14 days in both build and runtime paths. Unknown provider observation time stays null; fetched-at and build-snapshot dates cannot impersonate source dates. Empty, failed and stale-only feeds retain only still-valid prior rows and never clear availability by omission. The historical editorial banner uses the current calendar, not the October 5 snapshot comparing itself with October 5.

The existing supplemental scoreboard remains partial and fetches once on page load. Match only unique reviewed Week 6 identities, retaining canonical timing, venue, status and final scores. The provider's unknown observation time cannot validate new scores, so those are withheld. Map AOT to final, never parse blank score strings as zero, drop unmatched/FCS/ambiguous rows, and remove live-scoreboard wording. Continuous in-game scoring still requires validated provider observation timestamps, coverage and operational review; this patch does not deliver it. Preserve ingest retrieval metadata when supplied, without interpreting it as an observation time.

NDSU–UNLV retains the advertised 23:00 UTC broadcast slot and adds the separately labeled 23:10 school-announced kickoff supported by both schools. Weather remains incompletely reviewed; no universal all-clear is added. Historical Week 1 fantasy, SP+, SOS, poll and metrics cutoffs are not restamped. Historical fantasy availability is explicitly labeled on board and player pages, with dated official context when tracked.

## D-2026-10-11 — Week 7 Gameday Command Center release (native port)

Port the reviewed Gameday Command Center Week 7 release (`week7-90552f488b59c2cd`, source revision `deb4f64ea413c91c38e4e5062ceadd2326753861` of the Lovable preview repository) into the native verified snapshot through `scripts/apply-week7-release.mjs` and its committed evidence. Production keeps its own data authority: nothing reads the preview database, and hosting, domain and the Vinext/Cloudflare lane are unchanged.

The snapshot now covers two board weeks (`board_weeks`): Week 6 as the archive with its original October 5–10 source dates, and Week 7 (59 FBS-vs-FBS games, Oct 13–17) as the current release. The homepage, scoreboard, ticker and watch board pick the week from the request's server clock: Week 7 replaces Week 6 at 06:00 America/Los_Angeles on October 11 (13:00 UTC), never 06:00 UTC and never the browser clock. `?week=6|7` selects a reviewed week explicitly. Clock-dependent pages render with `force-dynamic` (`Cache-Control: no-store`), and an open page reloads once after the cutover, measuring elapsed time from the server's render time.

Official TBD kickoffs (Charlotte–Temple, Louisiana Tech–ULM, Nebraska–Oregon) keep `kickoff_utc: null` and a date-only game date; every surface says "Kickoff TBA" and none shows a placeholder time. ESPN's 12:20 UTC provider listing of times for two of them is recorded in the evidence, not adopted. Wisconsin–UCLA keeps the primary-source 7:30 PM ET/NBC correction; Washington–Purdue is Friday. The release's editorial marquee (Ohio State at Indiana) is carried as `marquee_game_id` rather than replaced by the rank-sum default.

Records: 102 Week 7 participants carry school and provider agreement (October 11). The review withheld 16 only because school pages failed to load; any team without a verified record keeps its October 10 ESPN-reconciled record only when it has not played since (a verified Tue–Fri Week 6 final or an explicit October 10 bye row). A missing schedule row is not a bye. The other 26 teams show "Not published" rather than a stale record. The October 10 standings tables keep their date and their own overall column.

Week 6 adds the two Saturday finals the release verified (Indiana 20–17 Nebraska, Ohio State 45–16 Maryland), rechecked against ESPN completed-game summaries. The other 44 October 10 games are not promoted to final; they say their result is not yet verified. Ranked teams absent from an FBS-vs-FBS board are no longer labelled byes (several face FCS opponents). AP and Coaches stay the October 4 editions; SP+/FPI keep their own dates.

## D-2026-10-11 — October 10 Saturday finals verified (Week 6 complete)

The 44 October 10 games the Week 7 release left unverified are now finals, applied offline by `scripts/apply-oct10-saturday-finals.mjs` from committed evidence. Each final needs a completed ESPN game summary whose quarter scores sum to the final, plus the same score and winner in NCAA.com's 2026 FBS week 6 scoreboard. Week 6 is now 58 of 58 verified finals; no game was promoted to final because its kickoff had passed.

Records are derived, not assumed: each team's October 10 ESPN-reconciled record plus its verified Saturday result must equal both its ESPN game-summary record and ESPN's standings after Saturday. All 138 overall and conference records agree, and so do the 112 records the site already showed. This resolves the 26 records the Week 7 release had withheld. The conference tables move to October 11. Polls keep their October 4 editions and metrics their October 3 cutoff. The College GameDay badge now also finds its game once the game is final, and an archived week's marquee shows its final score instead of a kickoff time.

## D-2026-10-11 — School sources for the October 10 finals and Week 7 kickoff recheck

`scripts/apply-oct11-school-recheck.mjs` runs after `scripts/apply-oct10-saturday-finals.mjs`. It applies `data/cfb-2026/refresh/evidence/2026-10-11-school-sources-week7-recheck.json`, offline and with no deploy. It changes no score or record. For each of the 44 Saturday October 10 finals, an official school page must agree with the published score and winner and with ESPN's completed-game summary. Quarter scores must sum, and every ESPN post-game overall and conference record must equal the site's records and standings; school-published records must agree. Each school source must come from that school's own official athletics host, listed in `data/cfb-2026/refresh/official-school-hosts.json` (exact hostname match). The school URLs and result text are added to each final (`meta.school_sources`). The log entry keeps the evidence time (`evidence_checked_at`) apart from `applied_at`, which never sorts before the previous entry. Most school schedules sit behind Incapsula bot protection, so those pages were rendered through Cloudflare Browser Rendering; direct-fetch quotes are checked against the saved page text. Recorded, not adopted: Western Michigan's stale school conference record (1–0 against 2–0), Nevada's recap slug, South Carolina's unposted result, and Utah's network wording for Kansas–Utah.

Week 7 recheck: the host school's schedule settles its own home game, and a visiting school's listing counts only when ESPN shows the same value with a valid time. Charlotte–Temple (1 PM ET, from Charlotte) and Louisiana Tech–ULM (8 PM ET, from Louisiana Tech's 7 PM CT) are adopted because ESPN agrees; both hosts still list TBA. Penn State–Michigan is on CBS, from Michigan's own schedule. Nebraska–Oregon stays officially TBA with no published network, as confirmed by the owner: only Nebraska lists a time (10 PM CDT) and a FOX logo, Oregon lists TBD, and ESPN's time is a `timeValid: false` placeholder. Rows carry `rechecked_at`. Board stamps, records, standings and the October 4 polls are asserted unchanged.

## D-2026-10-11 — Week 7 afternoon recheck: every kickoff and network published

`scripts/apply-week7-kickoff-updates.mjs` runs after `scripts/apply-oct11-school-recheck.mjs` and applies `data/cfb-2026/refresh/evidence/2026-10-11-week7-kickoffs.json` offline, under the same rule. Nebraska–Oregon was kept officially TBA at 13:14 UTC only because ESPN showed a `timeValid: false` placeholder (Oct 17 04:00Z, no network). By 14:32 UTC ESPN listed 2026-10-18 03:00Z with `timeValid: true` on Fox, matching Nebraska's own "10:00 PM CDT" and FOX listing, so the visiting-school-plus-ESPN rule now adopts it: 11 PM ET / 8 PM PT on FOX, still Saturday's game. Oregon still listed TBD; that is recorded. Alabama–Tennessee moves from "ABC or ESPN" to ABC, from Tennessee's own schedule. Florida–Texas moves to ABC, from Florida's schedule and its October 10 announcement, with ESPN agreeing; Texas's "ABC or ESPN" includes ABC, so it is not a conflict. The three morning adoptions are reconfirmed unchanged against the same sources. All 59 Week 7 games now show one published kickoff and network. Scores, records, polls and board stamps are asserted unchanged. Only the Week 7 note, hold and schedule story change wording. The date-only "Kickoff TBA" path stays supported and tested for future weeks.

## D-2026-10-20 — Independently verified Week 8 release

Promote Week 8 only after a fresh provider pull and school schedule checks. Preserve Week 6 and Week 7 as archives. All 59 Week 7 FBS finals match ESPN and NCAA; the three FBS–FCS finals also match and remain outside the display count. All 138 October 11 records plus Week 7 results equal current ESPN standings. October 18 AP/Coaches polls and NCAA leaders through October 17 have separate source cutoffs. Preserve the documented composite mean-rank/AP tie-break rule and include the full union of poll-listed teams.

Publish all 56 school-confirmed kickoffs and 55 school-corroborated networks. Sacramento State–Ball State has no network on either school schedule; ESPN+ stays provider-only and the display says pending. Liberty–Kennesaw State is Thursday; Northwestern confirms Peacock; Arkansas State confirms Jonesboro. Utah confirms College GameDay and Houston’s kickoff. Source URLs, hashes, times, score/quarter evidence and all amendments are in the committed release evidence.

Iamaleava is out for the season, superseding the supplied indefinite absence. Availability is explicitly partial. Retained October 5 long-term entries keep their own dates and historical wording; old weekly watch items are archived, never treated as current clearance. Publish a sourced Week 7 highlight, a new Week 8 panel and a factual pre-CFP resume audit. Current Heisman and upset research is pending; omit stale market prices. The official CFP release establishes the 2026 qualification format and November 3 first rankings.

This PR implements the verified weekly data release. The supplied broader SEO, legal/privacy/affiliate, scheduling-automation and live-feed recommendations are not represented as completed. No production deploy or merge is performed by this change.
Security/review follow-up: rendered assertions use the parse5 HTML parser (test-only dependency) and retain the full stale-copy guard list. Poll movement uses the established to-minus-from convention (negative means a rise), ordered by magnitude. Offline application additionally validates source team, both opponents, date and unique game IDs.

## D-2026-10-20 — Travelpayouts connection and final Week 8 TV assignment

The existing Drive loader runs from `https://tpembars.com`, but `connect-src` omitted that origin. Its runtime requests `/entrypoint_config`; a missing configuration produces `config is not valid`. A direct provider check returned HTTP 200 with marker 775855, project 572310 and domain cfbapex.com. All four configured Drive services remain disabled. Permit that exact origin in `connect-src` so the installed integration can load its configuration and send its existing collection requests. Keep the project, features, script and all other policy directives unchanged; do not suppress console errors.

The host school's October 19 game-week announcement explicitly names ESPN+ for Sacramento State at Ball State, October 24 at 3:30 PM ET. A fresh ESPN scoreboard agrees with a valid kickoff. Adopt it through `scripts/apply-oct20-tv-followup.mjs` and separate immutable evidence. Both schedule grids still omit TV; the explicit school announcement resolves that omission. All 56 Week 8 networks are now school-confirmed. Preserve scores, records, polls, other games and source cutoffs. See `docs/TRAVELPAYOUTS_TV_FOLLOWUP.md` for the production handoff.

## D-2026-10-20 — Complete Week 8 research and protect current reporting

Publish the reviewed injury/quarterback items as dated reports with explicit unknowns. Add Donte Lee Jr. and James Laubstein to the long-term ledger, correct Hank Brown's current health/starting context, and distinguish the Oregon competition from injury status. Keep the October 10 official snapshot in a separate historical section; older designations cannot overwrite newer reporting. Preserve all original historical cutoffs.

Publish seven selected Heisman candidates and three eligible upset cases with linked evidence, source dates and honest sourcing confidence. Use Week 7 box-score facts and editorial cases/counterweights, not unsupported scoring weights or an invented independent-engine process. Preserve signed American prices when ordering; malformed prices stay unpriced. The October 20 Betfirm compilation is one reporting chain despite multiple sportsbook labels. ESPN supplies literal provider lines and observation times for upset eligibility. No verified crowd data means no market-trap claim.

Both populated pages use the existing Clean Mode and deliberate Analysis Mode disclosure. Default output hides market prices; clean Heisman ordering remains editorial. Keep previously accepted scores, polls, records, schedules, TV and Travelpayouts configuration unchanged. See `docs/WEEK8_RESEARCH_COMPLETION.md` for scope, exact deliverables, limitations and handoff.
