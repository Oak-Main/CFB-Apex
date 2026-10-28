# CFB Apex October 28 release evidence

The native site refresh reconciles the October 27 results and the remaining Week 9 slate. It does not claim that every independently dated editorial or statistical module is newly complete. Owner approval in the October 28 task covers this branch, its PR, fixes, merge after acceptance, and the matching native production deployment. Companion applications, other projects and account/security changes are excluded. No approving review is submitted for the owner.

## Revision and sources

- Base main reverified: `50afe3d5feeeb0b8c083ca20c3676c3974e677ed`; clean isolated checkout, remote `https://github.com/Oak-Main/CFB-Apex.git`.
- Separate open draft security PR54 is preserved; its dependencies/lockfile are not included here.
- Data cutoff: **2026-10-28T20:32:04.954Z / October 28 13:32:04 PDT**. Source retrieval times, HTTP Date/Age, publication dates and through-games dates are distinct.
- Active pipeline: `apps/site/data/cfb-2026` → `apps/site/scripts/build-dataset.mjs` → `apps/site/lib/cfb-2026.generated.ts`. Generated output is never edited by hand.
- Evidence: `data/cfb-2026/refresh/evidence/2026-10-28-week9-refresh.json`. It records event/provider IDs, source URLs, hashes, retrieval/server times, individual records and a complete current-slate inventory. The supplied DOCX/ZIP are research inputs, not fresh server receipts or execution evidence.

| Inventory | Expected | Reconciled |
|---|---:|---:|
| Week 8 finals October 20–24 Eastern dates | 56 | 56 |
| Week 9 October 27 finals | 2 | 2 |
| Week 9 remaining fixtures | 54 | 54 |
| Week 9 full slate | 56 | 56 |
| Full-season completed games involving FBS | 568 | 568 across 71 days / nine NCAA weeks |
| Unique FBS-vs-FBS finals in retained board | 446 | 446 |
| FBS-vs-FCS finals retained outside interface | 122 | 122 |
| Current whole-team overall/conference records | 138 | 138 |
| Current AP / Coaches entries | 25 / 25 | 25 / 25 |
| Displayed national leader categories | 4 | 4 through October 27 |
| Programs absent from Week 9 slate | 26 | 26; individual official bye designation not asserted |

NDSU (Mountain West) and Sacramento State (MAC) are included in current membership. Whole-team records include FCS opponents; LSU remains 6–2 despite its October 3 FCS opponent being outside the interface. All 138 current provider records match primary corroboration: 137 directly retrieved official pages and Notre Dame 6–1 in Navy's October 26 official preview via indexed text. That indexed observation is dated corroboration, not fresh raw HTTP evidence. Notre Dame's own stale home-page record is rejected.

Delaware beat Western Kentucky 35–21; Missouri State beat Sam Houston 24–3. Their four official overall/conference records replace the old values; no records are incremented from the filtered scoreboard. Both scheduled duplicates are removed. A subsequent full-season audit at **21:03:08 UTC / 14:03:08 PDT**, of games completed before the unchanged 20:32 cutoff, found and restored 17 omitted September FBS finals and consolidated two duplicate opening-week entries. Original curated IDs remain canonical and the two removed duplicate URLs resolve as aliases. Eastern playing dates are corrected independently of stable IDs. All 568 finals (446 FBS–FBS, 122 FBS–FCS) match nine complete NCAA inventories and 71 daily provider responses; their totals independently reproduce all 138 official records. Detailed primary/provider identities, scores, quarters, overtime and excluded FCS games are in `refresh/evidence/2026-10-28-full-season-audit.json`. Archived editorial metadata and five Week 8 overtime results remain. No new postponement, cancellation or unfinished game appears in the reconciled official Week 8/9 inventories at cutoff.

All 54 remaining times/networks agree with the official NCAA TV article and current provider listings. Three formerly TBD kickoffs and 15 held TV fields now have evidence. Generic TBD behavior remains tested; later-week unknowns are not filled. Wisconsin–Iowa is announced at noon ET in NCAA's TV article and ESPN; NCAA's scoreboard lists 12:10 ET. Keep noon as the announced kickoff and preserve the separate 12:10 observation; neither is claimed as actual start. Georgia–Florida uses Mercedes-Benz Stadium, Atlanta; Notre Dame–Navy uses Gillette Stadium, Foxborough. UTC rollover remains separate from the Eastern game date. Official College GameDay context is Bloomington; precise campus site/show time is not inferred.

AP retains both tied No. 20 entries and no No. 21. Poll records remain edition records. Composite formula is unchanged: mean AP/Coaches rank, absent = 26, AP rank breaks equal means. Conference rows are sorted by conference win percentage with an explicit statement that championship tiebreak procedures are not applied.

## Module decisions

Paths below are relative to `apps/site`.

| Actual module | File and field or renderer | Evidence and publication decision |
|---|---|---|
| Scores, ticker, GameDay, game detail | `refresh/verified-refresh.json` playedGames/scheduledGames; `lib/homepage-data.ts`, `lib/gameday-shared.ts`, broadcast components | 58 recent finals, 54 upcoming; source gate compares every identity/status/score/quarter and both official inventories. No inferred live states. |
| Schedule and Watch | same scheduledGames → generated broadcasts.rows/byPair; `components/broadcast/watch-page.tsx` | 54 official date/time/TV assignments. Later weeks retain baseline dates. Radio coverage is separately dated. |
| Teams and conferences | refresh.teamRecords, retainedBaseline.conferenceStandings; `lib/team-hub.ts`, `components/HubApp.tsx` | 138 records independently reconciled. FCS totals retained. Equal conference percentages are not an official tiebreak ranking. |
| Polls and composite | refresh.polls; `scripts/reconcile-gameday.mjs` editorialComposite | October 25 AP/Coaches; ties and historical editions retained; exact formula rechecked. No official CFP rank substituted. |
| Ratings and SOS | `data/cfb-2026/ratings/2026-week6.json`, `sos/2026.json`; Rankings/team hub | September 27 ratings and separate SOS date retained. No new licensed SP+/FPI/FEI evidence; no mirrors or invented ratings. |
| National leaders | refresh.metrics.categories | Four NCAA tables through October 27, top five displayed rows per category, independently sourced URLs and retrieval times. |
| Detailed team/player statistics | `data/cfb-2026/stats/2026/season.json`, team hubs | September 5 sample remains historical; a complete current statistical warehouse is unavailable. Visible coverage disclosure added. |
| Availability and injuries | `data/injury-research/current.json` context_notes; `lib/injury-report.ts`, injury/GameDay pages | Add USC's October 27 attributed Sayin out-indefinitely context. Preserve October 22 document and prior official game/publication identities. No Week 9 final designation or clearance inferred from Wednesday evidence. |
| Roster/depth | `data/cfb-2026/rosters`, `depth-charts`; team hub | October 3 inventory 92/138, not newly complete. Preserve official/projected distinctions and blanks; visible limitation. |
| Portal and coaches | `data/cfb-2026/portal`, coaching, contracts; ledgers | Dated evidence retained; coaching inventory 136/138. No unsupported new event or absence-of-change assertion. |
| Heisman | `heisman/week8-2026.json`; `components/feature-dashboards.tsx` | October 20 watch remains explicitly historical; no fresh odds/season totals invented. |
| Highlight | `highlight/week7-2026.json`; feature dashboard | Week 7 selection remains historical. Supplied Week 8 recommendations are not silently published as an approved award. No watched-film claim added. |
| Panel and upset watch | `panel/week8-2026.json`, `upset/week8-2026.json`; page metadata | Historical October 20 editions labeled; current picks/lines unavailable. Correct Week 5 metadata; personas are editorial constructs. |
| Resume audit | `playoff-audit/week8-2026.json`; audit page | Historical publication records/composite explicitly labeled. Use current rankings/team pages for current factual records. |
| Playoff simulator and bracket | `components/HubApp.tsx`, `app/api/simulate/route.ts`, `lib/module-coverage.ts` | Public probabilities/bracket withheld; retained demonstration lacks full qualification and calibrated season model. API returns 503 for valid requests and retains malformed/oversize/participant protections. |
| CFP rules | `lib/module-coverage.ts` | Official CFP bracket: 12 teams, four Power Four champions, highest-ranked other-six team, seven at-large; Notre Dame final top-12 qualification; four highest-ranked byes. First rankings November 3; none at cutoff. |
| Fantasy | `dfs/week1-notes-2026.json`; fantasy board | September 7 historical slate; current operator/scoring/salary/usage/lock evidence unavailable. Actions remain disabled. |
| No Names | `lib/no-names.ts`, feature dashboard | Null rating becomes unknown, not unrated. Pool is research candidates, not verified qualifiers or breakout leaders. No award verdict. |
| NIL | retained `nil/week6-2026.json`; native route in HubApp | Current native module withheld pending primary verification of deals, valuations and policy interpretations. No fresh legal or value claim. Historical source file preserved. |
| Venue, radio, travel | stadium/radio datasets, stadium pages and Watch | Correct current neutral-game venues retained. Historical guides/radio dates disclosed; no new bag/parking/rights claim. |
| Search and player identity | `lib/player-records.ts`, search/player pages | Existing stable slugs retained; roster/portal/fantasy evidence remains independently dated. |
| Freshness, source pages, metadata | `lib/module-coverage.ts`, data-sources/methodology renderers, catch-all page metadata | Independent module dates and unavailable states visible; no blanket freshness timestamp. Commercial/legal roots and controls otherwise retained. |

## Engineering and release gates

Run `npm run verify`, `npm run cf:types`, `npm run deploy:dry-run`, `npm run gameday:source-gate`, production dependency audit and generated parity. The source gate requires all 71 daily responses, all nine complete NCAA inventories and every required source receipt within two hours, and checks HTTP Date/Age separately. It compares official record rows, poll ties/formula and announced-time/TV facts. Zero fetched days or partially fetched coverage cannot count as acceptance. Existing archive, malformed refresh, duplicate logical game, delayed/postponed/cancelled, zero-score, null/TBD, date-boundary and stale availability protections remain.

Candidate commands, failed iterations and final counts belong in the final acceptance record. A local 17-image visual artifact inventory only checks existing image dimensions; it is not a fresh browser test. The connected browser cannot reach the workspace's localhost server. The managed environment first rejected a duplicated `nodejs_compat` flag; removing its redundant Vite override preserves the Wrangler flag. Its Workers binary then proved too old for the existing production compatibility date. Candidate browser acceptance uses the exact built Worker and client assets through a scratch Node HTTP/asset adapter at the managed service's returned URL. That adapter is not shipped; browser image optimization and Workers runtime behavior require production/CI evidence. No compatibility date or security control is changed. No hosted candidate version, Sites publication or companion publication is used.

PR CI checks out a synthetic merge by default; record both that checkout SHA and the reviewed branch head. Merged-main CI must be inspected separately, including actual deploy and smoke steps. A skipped production step in PR CI is not a production pass. Merge only the reviewed candidate after gates and material findings are resolved; do not submit an approving review for the owner or bypass protection.

## Verified deployment target and rollback

Provider dashboard inspected October 28: account `820e7cee61fccc60d14c8e20bc686942`, namespace `kevynsgrin.workers.dev`, Worker **cfb-apex**, Production. Actual domain bindings are `cfbapex.com` and `www.cfbapex.com`. ASSETS and IMAGES are the two bindings; no production database migration is needed. The Worker has no direct Git build connection. GitHub `Deploy CFB Apex site` runs from main with `apps/site` as working directory, `npm run verify`, types, build/dry-run, source gate and audit, then `wrangler deploy --config wrangler.deploy.jsonc`. This change adds a fail-closed account-ID guard. The old root data API is a separate Worker and its path trigger is outside this change.

Prior active, ready Worker version: **980dc3cc-1034-4da5-a7a1-73a3d0c9ad84**, 100% traffic, associated with main `50afe3d5feeeb0b8c083ca20c3676c3974e677ed` by Actions run **40344810207**, job **121648919154**. That job's checkout, deployment/version/domain output and successful exact-data smoke were inspected. Prior data revision: **7222ebfac887c8458808bcb755e015f0966aec4fd015014e54756ad4e5ff1656**. Preserve the provider version; do not delete it. The old source/data remain in Git.

Rollback is scoped to this same account/Worker: verify the latest active version and unrelated intervening work, then use `CLOUDFLARE_ACCOUNT_ID=<verified account> npx wrangler rollback 980dc3cc-1034-4da5-a7a1-73a3d0c9ad84 --config wrangler.deploy.jsonc` with the already configured authorized credentials. Obtain a specific decision if rolling back would affect newer unrelated work. Recheck terminal provider state and the exact served data revision; an upload alone proves nothing. Do not execute a rollback silently.

Production GET verification is limited to the explicit October 28 native release: representative pages, both new finals, current schedule, records, leader dates, historical/withheld modules and Week 8 archive. Record cache headers/age, served revision and actual provider/build identity. The one-time probe exception ends after this release verification; no recurring monitor or portfolio probe is authorized.

## Candidate acceptance before PR

- `npm run verify` passed before the full-season amendment: 131 unit, 21 rendered, two accessibility, two SEO and two link tests; lint had 87 warnings and 17 informational findings, no errors. Existing 17 image captures passed dimensions/inventory only. Types, bundle dry-run and production audit (zero vulnerabilities) passed separately. Initial assertion failures were corrected to reviewed facts; no gate was removed. Full-season amendment must rerun all checks.
- Browser preview visually rendered the styled Week 8 archive, navigated from Week 9 and displayed the dated current-module withholding states. A first Node production runner could not serve the Workers entry; the final scratch adapter serves the compiled Worker with static assets before routing. These failed preview attempts are not passes.
- Full-season regression covers 568 finals, all 138 official record cross-checks including FCS, the 17 recovered rows, absence of duplicate Memphis–UNLV, both preserved aliases and rejection of a missing row. Network source gate independently re-fetches every daily and primary weekly inventory.

Final component review also found home-campus parking links on neutral-site game pages. Those pages now withhold home-campus venue/travel guidance, label neutral sides, and retain separate radio/guide dates. The two duplicate URLs use the original curated canonical metadata. No Names summary cards now say qualification unverified and award not selected, consistent with the research-pool disclosure.

Browser follow-through: the planner footer now uses the actual `/stadiums/<slug>` route only where a venue guide exists; neutral venue guides remain unavailable. Result provenance uses each game’s Eastern playing date as its through-games date and displays the later verification time separately. Recovered September results cannot inherit the old September 5 fallback date.

The current four Power Four conferences contain 67 programs. The rebuilt Pac-12 is outside that group; public cards/filters say Other FBS rather than the obsolete Group of Five count. The legacy internal G5 enum is retained for compatibility and is not a CFP qualification rule.

PR55 review follow-through: reject duplicate published provider rows before Map conversion and assert the full NCAA array count plus unique contest identities. Regressions cover an appended duplicate and a replaced provider ID. Align the No Names interface/header with unknown rather than asserting an unrated/qualifying status. The planner-footer finding is addressed by the supported-route and neutral-unavailable changes.

Final ratings inspection: replace the directory’s unlabeled derived/fallback strength values with published AP rank. Withhold the unverified derived SOS index, preserve the historical inputs and exact AP/Coaches composite formula, date conference SP+/reported-odds cards to September 27, and exclude completed games from upcoming-TV lists. No new rating or probability is invented.
