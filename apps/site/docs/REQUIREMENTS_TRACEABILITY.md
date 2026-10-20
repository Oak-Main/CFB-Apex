# Requirements traceability

| Requirement group | Implementation | Evidence | Status |
|---|---|---|---|
| Agent operating system | `AGENTS.md`, `.codex/`, `docs/AGENT_ROSTER.md`, `docs/HANDOFF_PROTOCOL.md` | Repository inspection | Complete |
| Scoreboard and schedule | Catch-all routes, `HubApp`, typed fixtures | Unit, link, rendered HTML, desktop/mobile browser journeys | Complete |
| Portal and volatility | Portal route, filters, comparison states, candid fixture model card | Browser journey + model documentation | Complete (fixture) |
| Playoff simulator | Deterministic simulation, URL scenarios, participant validation, two-sided forcing | Six domain tests + API integration + browser journey | Complete (fixture) |
| Coaching and buyout | Coaching routes, timeline, searchable carousel, buyout calculator | Formula and browser checks | Complete (fixture) |
| DFS projections | Disclosure-gated route with inactive-player zeroing | Domain test + browser journey | Complete (fixture) |
| Team/player/conference/stadium | Dynamic templates with conference slug filtering | Route/link tests + visual QA | Complete (fixture) |
| Provenance and fixture labeling | Synthetic status, visible demo/source/time badges | Contract tests + browser evidence | Complete |
| Clean Mode default | Device-local preference with native disclosure dialog | Keyboard/browser journey | Complete |
| Accessibility | Semantic UI, native modal behavior, focus states, reduced motion | Automated assertions + keyboard browser QA | Complete with manual-screen-reader follow-up |
| SEO | Canonical-domain metadata, structured data, noindex robots, empty sitemap, feeds | SEO and rendered HTML tests | Complete for public fixture beta |
| Ads/CRM/affiliate/social | Inert/provider-neutral fixtures and governance documents | Docs and opt-in journeys | Complete as architecture only |
| Security/operations | Worker headers, request validation/caps, health/readiness, identity/allowlist admin, deployment config/runbooks | Zero high npm audit + integration tests + Wrangler dry run | Complete pending live hostname smoke test |
| Independent release review | Product, data licensing, sports-model audit, then red-team re-review | `docs/BUG_AUDIT.md` and agent handoffs | Complete after final re-review |
| Research-report validation | Primary-source correction and claim quarantine | `docs/RESEARCH_REPORT_AUDIT.md` | Complete for July 31 report |
| Live provider procurement | Common rights/coverage/SLA/pricing questionnaire | `docs/PROVIDER_RFP.md`, `docs/DATA_PROVIDER_MATRIX.md` | Blocked: vendor responses/contracts |
| Live ingestion policy | Canonical transitions, documented correction handling, environment isolation, idempotency material | `lib/live-data.ts`, `tests/live-data.test.ts`, `docs/LIVE_DATA_STRATEGY.md` | Foundation complete; adapters/bindings blocked |
| Public activation controls | Deny-by-default evidence gates and staged runbook | `lib/release-readiness.ts`, `/api/readiness`, `/admin`, `docs/PUBLIC_LAUNCH_RUNBOOK.md` | Complete for pre-deployment gating |
| Replay/shadow pilot | Contracted provider replay and live comparison | Future provider adapters, D1/R2/Queue bindings, pilot artifacts | Blocked: contract/credentials |
| Public fixture URL | CFB Apex branding, Cloudflare Worker config, apex/`www` routes, noindex and live kill switches | `wrangler.deploy.jsonc`, Worker redirect, `docs/DEPLOYMENT_EVIDENCE.md` | Complete |
| Public live-data URL | Licensed, tested, staffed, legal-approved, explicitly authorized release | Public launch runbook and final release evidence | Not authorized |

## October 5 Week 6 refresh

| Requirement | Implementation | Evidence |
|---|---|---|
| Consistent current week | `lib/homepage-data.ts`, verified scoreboard snapshot | `tests/refresh.test.ts`: 56 scheduled and completed Week 5 results, shared ticker |
| Eastern rollover and DST | `lib/game-calendar.ts`, `lib/homepage.ts`, `lib/scoreboard.ts` | Friday UTC rollover and November offset regressions |
| No scheduled duplicate of a final | matchup/week reconciliation in `lib/cfb-dataset.ts` | Penn State–Northwestern and Fresno–Washington State regressions |
| Poll date and Miami entity mapping | reviewed AP/Coaches source boards, ranking copy | October 4 release + Miami ACC test |
| Confirmed cumulative metrics | `components/broadcast/current-metrics.tsx` | NCAA through October 3; 1,851 Atkinson yards |
| Rebuild preserves reviewed results | `scripts/build-dataset.mjs` + verified JSON | Deterministic snapshot build; no provider outage rollback |
| Source honesty | module-specific dates, unpublished records, snapshot labels | Retained portal date and null pregame scores tests |
| Production update | `npm run deploy:production` in `apps/site` | Pending Cloudflare owner credentials and release verification |

| Requirement | Implementation | Evidence |
|---|---|---|
| Full FBS board coverage | audit patch + coverage check in `scripts/build-dataset.mjs` | `tests/refresh.test.ts`: 58 scheduled, both restored games; live check fetched 7/7 days |
| No free-text FCS exclusions | `espn_conference_ids` evidence on every excludedGames row | hermetic build check throws otherwise |
| Poll completeness | others_receiving_votes filled from Oct 4 releases | `tests/refresh.test.ts`: AP 10 / Coaches 15, movers, debuts, gaps, dropouts |
| No stale copy on production pages | forbidden-strings test | `tests/rendered-html.test.mjs` audit test across 6 routes |
| Verified additions render | GameDay badge, storyline, byes names, neutral label | rendered assertions on `/`, game page, `/rankings` |
| Post-deploy multi-surface freshness | `deploy-site.yml` check across home, /rankings, game page | workflow step "Check production Week 6 snapshot across surfaces" |

## October 10 pregame refresh

| Requirement | Implementation | Evidence |
|---|---|---|
| No Friday finals left upcoming | reviewed pregame snapshot + deterministic apply script | refresh tests: five finals, scores, stable Eastern ids, team links |
| Official kickoff changes appear across surfaces | schedule and broadcast snapshot overrides | Rice–ECU 17:00Z; Kansas–Utah 00:00Z next UTC day; rendered game tests |
| Do not imply full data freshness | distinct results/schedule timestamps, retained poll/stat/research cutoffs | source-date tests and visible partial injury-review banner |
| Complete week coverage | all 58 provider ids reviewed, 138 records reconcile | normalized evidence + apply assertions + existing live coverage build check |

## October 10 accuracy containment

| Requirement | Implementation | Evidence |
|---|---|---|
| Dated, limited official designations | `data/injury-research/official-availability.json`, `lib/injury-report.ts`, injury page | 87 exact source rows; report IDs, stages, publication/retrieval dates; `tests/injury-accuracy.test.ts` |
| Identity and availability separation | Four corrected roster identities; explicit Available/Exempt/GTD and editorial long-term label | source URLs plus runtime and rendered regressions |
| Stale ESPN containment | `lib/injury-freshness.mjs`, build filter and `lib/espn-injuries.ts`, API fallback | old/undated/future/invalid rows, last-known-good merge and empty feed tests |
| Canonical supplemental scoreboard | `reconcileNcaafEvents`, server adapter and honest widget labels | incorrect Kansas/Hawai'i dates, AOT, blank score, false 0–0 final, protected final and ambiguous identity tests |
| Historical category honesty | dated fantasy labels and source context; unchanged baseline dates | preserved fantasy/poll/metric cutoffs and rendered player context |
| Dual kickoff meaning | NDSU–UNLV timing note plus separate announced kickoff field | retained 23:00 slot, explicit 23:10 kickoff regression |

## October 11 Week 7 release

| Requirement | Implementation | Evidence |
|---|---|---|
| Reviewed Week 7 release, Week 6 history retained | `scripts/apply-week7-release.mjs`, `data/cfb-2026/refresh/evidence/2026-10-11-week7-release.json`, `board_weeks` | apply assertions (59 games, per-day counts, unique pairs, 138-team identities); `tests/week7.test.ts`; live ESPN coverage build check for Oct 12–18 |
| Official TBD kickoffs without placeholders | nullable `kickoff_utc`/`time_et`, date-only game date, "Kickoff TBA" labels, Saturday-board TBA group, team-feed timing | build-time guard; `tests/week7.test.ts`; rendered `/?week=7` |
| Server-clock week selection | `lib/week-cutover.ts`, `app/page.tsx`, `app/[...slug]/page.tsx`, `components/broadcast/week-switch.tsx` | 12:59:59.999Z → 6, 13:00:00.000Z/.001Z → 7; `no-store` header and rendered default-week tests |
| Week navigation | `WeekSwitch` links with `aria-current`, scoreboard rail and source labels per board week | rendered `/scores?week=6|7`, keyboard focus and 390px browser check |
| Honest records and byes | `team_records_review`, retained October 10 overall records, "Ranked, not on this FBS board" | `tests/week7.test.ts`, refresh/rendered regressions |

## October 11 Saturday finals

| Requirement | Implementation | Evidence |
|---|---|---|
| Every Week 6 game verified, none promoted by time | `scripts/apply-oct10-saturday-finals.mjs`, `data/cfb-2026/refresh/evidence/2026-10-11-saturday-finals.json` | ESPN summary + NCAA.com score/winner per game; line-score sums; `tests/refresh.test.ts` (58/58 finals) |
| Records reconcile, none stale or withheld | derived Oct 10 + result = ESPN summary = ESPN standings = existing site records | builder fails on any disagreement; `tests/week7.test.ts` |
| Archive marquee and GameDay badge stay correct | `broadcastEventForGame` reads played games; marquee shows FINAL score | rendered `/?week=6` assertions |

## October 11 school-source and Week 7 recheck

| Requirement | Implementation | Evidence |
|---|---|---|
| Official school source for every October 10 final | `scripts/apply-oct11-school-recheck.mjs`, `meta.school_sources`, `data/cfb-2026/refresh/official-school-hosts.json` (per-school official host), `data/cfb-2026/refresh/evidence/2026-10-11-school-sources-week7-recheck.json` | apply assertions (school score and winner, ESPN agreement, line-score sums, records unchanged, evidence hash); `tests/refresh.test.ts` school-source regression |
| Week 7 TBD recheck with primary sources | `week7_recheck` evidence, row `timing_note`/`tv_note`/`rechecked_at` | `tests/week7.test.ts` TBD, adopted-kickoff and network tests; rendered `/?week=7` TBA group |

## October 11 Week 7 afternoon recheck

| Requirement | Implementation | Evidence |
|---|---|---|
| No TBA filled without a school source and a valid ESPN time | `scripts/apply-week7-kickoff-updates.mjs`, `data/cfb-2026/refresh/evidence/2026-10-11-week7-kickoffs.json` | school time in its own zone = ESPN instant with `timeValid: true`; official-host check; `tests/week7.test.ts` |
| Every Week 7 game shows one published kickoff and network | all 59 rows `confirmed` with a single `tv` | apply assertions; rendered `/?week=7` board assertions |

## October 20 Week 8 release

| Requirement | Implementation | Verification |
|---|---|---|
| Week 7 finals and archived board | refresh/verified-refresh.json, scripts/apply-week8-release.mjs | All 59 ESPN finals/quarter sums equal NCAA; 3 excluded FCS finals also match; stable game IDs |
| Complete Week 8 board and marquee | 56 rows, school source evidence, Houston–Utah marquee, Utah GameDay badge | Daily counts 3/1/3/5/44; 56 school-supported kickoffs, 55 networks; one explicit pending network |
| Polls, movement, records and leaders | October 18 polls, October 11 AP archive, 138 records, October 17 NCAA totals | Prior records plus Week 7 results equal ESPN standings; composite mean/AP tie-break regression |
| Current editorial and partial availability | Week 7 highlight; Week 8 panel/resume; Iamaleava amendment; Heisman/upset pending | tests/week8.test.ts, rendered-page tests; historical availability dates retained |
| Historical consistency | Week 6 metadata and played-game data preserved; Week 7 final archive | Existing archive/source/score regressions and explicit week 6/7/8 render checks |

Detailed accepted claims, amendments, withheld items and owner handoff: docs/WEEK8_RELEASE_VERIFICATION.md.

## October 20 Travelpayouts and TV follow-up

| Requirement | Implementation | Verification |
|---|---|---|
| Installed Drive loader can obtain its project configuration | Exact `https://tpembars.com` origin added to Worker `connect-src`; no feature or project changes | Rendered-response CSP regression; public configuration identifies cfbapex.com; post-deploy browser console check |
| Resolve the last Week 8 TV assignment from a school source | `scripts/apply-oct20-tv-followup.mjs`, `refresh/evidence/2026-10-20-tv-followup.json`; ESPN+ on game 401866447 | Host school announcement and fresh ESPN valid time/network; all 56 networks published; rendered homepage and game-page checks |
| Keep the scope limited to one network and one connection permission | Prior release evidence retained; other source timestamps and data preserved | Offline dry-run/replay/idempotence and untouched-data assertions; full `npm run verify` |

## October 20 Week 8 research completion

| Requirement | Implementation | Verification |
|---|---|---|
| Resolve all 13 supplied availability items without guessing returns | Dated current ledger/watch and separate quarterback context; historical official table retained | Evidence `refresh/evidence/2026-10-20-week8-research.json`; unknown/practice-null/identity and rendered separation checks |
| Current sourced Heisman watch | Seven selected candidates, Week 7 box scores, October 20 named-book reports, confidence cap | Source links, signed American-price ordering and invalid-format regressions |
| Eligible sourced upset cases | Three underdogs with literal six-plus-point provider lines, reasons and counterweights | Snapshot hash/time evidence, team/week/line eligibility checks; USC–Wisconsin excluded |
| Default Clean Mode and deliberate disclosure | Existing mode state and dialog shared by both research pages | Rendered prices-hidden assertions and production browser disclosure verification |

Detailed source decisions, exact paths and ownership: `docs/WEEK8_RESEARCH_COMPLETION.md`.

## October 20 official follow-up and Command Center integration

| Requirement | Implementation | Verification |
|---|---|---|
| Publish newly verified official designations | Singleton Questionable for October 22; separately dated official rows and immutable source evidence | Source/game/identity/timestamp regression; invalid ingestion rejection |
| One approved weekly release for native and Lovable Command Centers | Versioned odds-free `/api/gameday`, native `/gameday`, dynamic reviewed archives and separate source dates | Revision/data/identity/cutover tests; API methods/CORS/errors; rendered archive checks and both live browsers |
| Safely follow pending official reports | Bounded Week 8 follow-up runbook and shared atomic owner lock | Competing/wrong-owner lock regression; exact-head PR checks and production comparison |

Scope, source portals, integration contract and future ownership: `docs/WEEK8_OFFICIAL_FOLLOWUP.md`.

Review safeguards: `lib/official-availability-validation.mjs` gates direct builds and ingestion with canonical game/week/source checks; `tests/gameday.test.ts` exercises wrong-team/week/matchup/URL rejection and an actual malformed-input build. Owner-verified lock recovery is tested for exact identity/token matching and preservation of the recovered audit record.
