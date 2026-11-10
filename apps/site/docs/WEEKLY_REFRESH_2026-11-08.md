# CFB Apex November 8 release evidence

The native site refresh reconciles the complete Week 9 results, the full Week 10 finals and the full Week 11 slate, and advances the GameDay board weeks to 6–11. It does not claim that every independently dated editorial or statistical module is newly complete. The owner's November 8 task covers this branch, its PR, fixes, merge after gates, the matching native production deployment and the Lovable GameDay Command verification. Other projects, account and security changes are excluded. No approving review is submitted for the owner.

## Revision and sources

- Base main reverified: `f02e9e2a3babc2851faa89a346ee63224f585337`; clean checkout of `https://github.com/Oak-Main/CFB-Apex.git`, branch `refresh/weekly-2026-11-08`.
- Superseded work: draft PR 57 ("Publish the October 28–29 Week 9 finals", Oct 30) is closed as superseded — its finals are included in this release's complete Week 9 reconciliation, and its base (`35c4441`) predates PRs 58–61. Nothing from PR 57 is merged blind.
- Data cutoff: **2026-11-08T13:54:26.690Z / November 8 06:54:26 PDT** (Sunday, after the 13:00 UTC Week 11 cutover had already switched the board to its Week 11 preview). Source retrieval times, HTTP Date/Age, publication dates and through-games dates are distinct. The board therefore selects Week 10 until 13:00 UTC on November 8 and Week 11 afterwards.
- Active pipeline: `apps/site/data/cfb-2026` → `apps/site/scripts/build-dataset.mjs` → `apps/site/lib/cfb-2026.generated.ts`. Generated output is never edited by hand.
- Evidence: `data/cfb-2026/refresh/evidence/2026-11-08-week10-refresh.json` (weekly review) and `data/cfb-2026/refresh/evidence/2026-11-08-full-season-audit.json` (complete-season audit). They record event/provider IDs, source URLs, hashes, retrieval/server times, individual records and complete slate inventories.

| Inventory | Expected | Reconciled |
|---|---:|---:|
| Week 9 finals (October 27–31 Eastern dates) | 56 | 56 (2 prior rows byte-preserved, 54 new) |
| Week 10 FBS-vs-FBS finals (November 3–7) | 62 | 62 |
| Week 10 FCS final (Merrimack at Wake Forest) | 1 | 1, excluded from the interface with its own receipt |
| Week 11 fixtures (November 10–14) | 67 | 67, no kickoff played |
| Full-season completed games involving FBS | 685 | 685 across 79 provider days / ten NCAA weeks |
| FBS-vs-FBS finals in the interface | 562 | 562 |
| FBS-vs-FCS finals outside the interface | 123 | 123 |
| Whole-team overall/conference records | 138 | 138 |
| AP / Coaches entries | 25 / 25 | 25 / 25, November 1 editions |
| Programs absent from the Week 11 slate | 4 | 4; no individual official bye designation asserted |

Whole-team records include FCS opponents. All 138 current provider records match the official NCAA standings page row-for-row (overall and conference W/L), plus nine conference standings pages for the conference-grouped slugs and ESPN standings as the provider source. Notre Dame's 8–1 appears on the NCAA standings page and follows from the verified November 7 final.

## Late Saturday finals — official school corroboration

Five late November 7 finals were still listed as in-progress on the NCAA scoreboard at the cutoff. Each carries an official school-page corroboration that the gate re-asserts literally:

| Game (ESPN final) | School receipt |
|---|---|
| West Virginia 48 at Texas Tech 53 | texastech.com schedule: "Nov 07 vs West Virginia … 48 53" |
| Fresno State 10 at Utah State 17 | gobulldogs.com schedule: "at Utah State … Fresno L, 10-17" |
| Texas State 42 at Oregon State 21 | osubeavers.com schedule row + both teams' standings streaks |
| Wyoming 41 at UNLV 35 | unlvrebels.com: "versus Wyoming on November 7, 2026, Loss, 35, to, 41" |
| Hawai'i 17 at UTEP 14 | utepminers.com: "L, 14-17 … Hawai'i - November 7, 2026" |

Texas Tech's ESPN venue listing "Galaxy Stadium" matches Texas Tech's own official schedule page, so the venue is published as listed.

## Module decisions

Paths below are relative to `apps/site`.

| Actual module | File and field or renderer | Evidence and publication decision |
|---|---|---|
| Scores, ticker, GameDay, game detail | `refresh/verified-refresh.json` playedGames/scheduledGames; `lib/homepage-data.ts`, `lib/gameday-shared.ts` | 562 retained finals, 67 upcoming. The two October 27 finals keep their original verification stamps and gameplay facts byte-for-byte. |
| Schedule and Watch | scheduledGames → generated broadcasts | 67 Week 11 rows: 54 confirmed kickoffs, 13 official TBD; 53 published networks, 14 unpublished (never filled). LSU at Texas carries the NCAA-scoreboard announced time the provider does not list. |
| Teams and conferences | teamRecords, retainedBaseline.conferenceStandings | 138 records independently reconciled. Every record equals its official NCAA standings row. |
| Polls and composite | refresh.polls; `scripts/reconcile-gameday.mjs` editorialComposite | November 1 AP/Coaches editions, cross-checked against the NCAA AP table and USA Today coaches table (rank, points, record). October 25 editions archived in poll_history. Composite formula unchanged. Poll-gap rows keep the UI contract (`ap`/`coaches`/`ap_points`/`coaches_points`); an RV side stays null rather than invented. |
| Ratings and SOS | `ratings/2026-week6.json`, `sos/2026.json` | September 27 ratings and separate SOS date retained. No new licensed SP+/FPI/FEI evidence. |
| National leaders | refresh.metrics.categories | Four NCAA tables with their own through-games statement ("Through games Friday, November 06, 2026"), exact published column (Yds / PPG / Avg). |
| Detailed team/player statistics | `stats/2026/season.json` | September 5 sample remains historical; visible coverage disclosure unchanged. |
| Availability and injuries | `data/injury-research/current.json`; injury/GameDay pages | October 22 as-of retained; no Week 10/11 official designation inferred from unreviewed reports. |
| Roster/depth, portal, coaching | rosters, depth-charts, portal, coaching | Dated inventories retained; absence of change never asserted. |
| Heisman / highlight / panel / upset watch / playoff audit | week-dated module files | Historical editions labeled; Week 11 picks/lines unavailable. `lib/module-coverage.ts` and the catch-all page copy advance from "Week 9" unavailable-claims to "Week 11". |
| CFP rules | `lib/module-coverage.ts` | Official format retained; first rankings November 3 note stays. |
| Fantasy / No Names / NIL | week-dated files | September 7 / research-pool disclosures retained. |
| Board weeks | board_weeks 6–11 | Week 10 archive entry carries schedule/results/records verification stamps and the Miami at Notre Dame marquee; Week 11 preview entry carries only schedule verification (no results exist) and the Missouri at Georgia marquee. |

## Engineering and release gates

Run `npm run verify`, `npm run cf:types`, `npm run deploy:dry-run`, `npm run gameday:source-gate`, production dependency audit and generated parity. The source gate (`scripts/check-nov08-sources.mjs`) re-fetches all 215 receipts (127 weekly + 95 audit-scope + per-page observations are the same receipt set), requires every saved receipt and live HTTP Date within two hours, checks Age separately, and asserts: the 56/62/67 week inventories, every final's identity/score/quarter-sum/kickoff observations against ESPN and NCAA, the five school corroborations, official-TBD weeks stay un-announced, all 138 records against ESPN standings + the NCAA standings page + conference pages, both poll tables against NCAA/USA Today, leader totals, and the 685-final full-season audit via `verifyFullSeason` (counts now parameterized by the audit's committed counts block; this release's audit declares 685/562/123/79 days/10 weeks).

`verify-production-target.mjs` advances deliberately to the reviewed version `cb5df1f4-74b9-4d75-9fa6-150cad85e8be` (PR60 main `f02e9e2` deployment `1dedd563-5dc8-4f72-a185-c8e58cd529b9`, 2026-11-04T10:51:12.728409Z, read from provider history before this release). A newer or split deployment fails closed before this release writes.

Candidate commands, counts and the final acceptance record belong in the PR description. `smoke-gameday.mjs` now covers weeks 9 (56 finals), 10 (62 finals) and 11 (67 scheduled).

## Verified deployment target and provider state

Provider history inspected November 8: account `820e7cee61fccc60d14c8e20bc686942`, Worker **cfb-apex**, Production, active version `cb5df1f4-74b9-4d75-9fa6-150cad85e8be` at 100% traffic. Domain bindings remain `cfbapex.com` and `www.cfbapex.com`; ASSETS and IMAGES are the two bindings; no database migration is involved. GitHub `Deploy CFB Apex site` runs from main with `apps/site` as working directory and deploys only after verify, types, dry-run, the freshness-gated source check, audit, credential check, prior-version guard, deploy and post-deploy verification.

Prior active, ready Worker version before this release: `cb5df1f4-74b9-4d75-9fa6-150cad85e8be` (100% traffic). Preserve the provider version history; do not delete it. Rollback is scoped to the same account/Worker via `npx wrangler rollback <id> --config wrangler.deploy.jsonc` and requires an explicit owner decision if it would revert newer unrelated work.

## Consumer surface

The Lovable GameDay Command public app (`https://gametime-visuals.lovable.app`, project `87b5a164-7cf5-40fa-9d8a-fb7f3b6646f3`, repo `kevynsgrin-a11y/gametime-visuals` at `5d613638bbb98ffac163b2a21c46803ebb513f98`) renders this feed through `src/lib/gameday-feed.ts` (schemaVersion 1, 8s timeout, no-store). Its weeks list is dynamic, so weeks 10 and 11 appear without a Lovable code change; the preview database is never the public read path. Post-deploy verification covers both surfaces at their public URLs.
