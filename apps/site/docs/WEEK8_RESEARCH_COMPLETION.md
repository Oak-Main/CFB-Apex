# Week 8 research completion — October 20, 2026

Mission: complete the outstanding supplied injury/quarterback, Heisman and upset-watch research, publish only supported updates, and verify the resulting production site after merge.

## Inputs and evidence

The supplied October 20 package contains 13 injury/quarterback items. All were reviewed against public dated reports; the reporting chains and linked articles are recorded in `data/cfb-2026/refresh/evidence/2026-10-20-week8-research.json`. Review time is distinct from publication date. ESPN summaries were retrieved again for seven potential upset games and three additional completed games; source URLs, raw-response SHA-256 hashes and retrieval times are retained. Previously verified Week 7 box scores provide the remaining player lines. No paywall was bypassed.

## Published decisions

- Add season-ending reports for Donte Lee Jr. (torn ACL) and James Laubstein (patellar tendon/surgery), retaining the previously corrected Nico Iamaleava report. IR is the site's editorial long-term category, not a formal college roster transaction.
- Publish 11 dated watch notes: Hollywood Smothers, Khobie Martin, Mark Bowman, Kamario Taylor, AJ Bianco, Carter Jones, Malachi Singleton, Jayden Denegal, Noah Kim, Dante Moore and Julian Sayin. A reported questionable/expected-return status is not an official game designation. Martin's latest verified absence belongs to October 17; no October 24 clearance was found. Taylor's October 20 report still leaves his return unresolved. Sayin's reported several-week absence is not converted to an exact number or a season-ending diagnosis.
- Correct Hank Brown to healthy but not starting, based on October 20 reporting. Keep Brock Thomas/Dylan Raiola's job competition as quarterback context, separate from injuries. Together the current ledger, watch and context cover 17 named players across the original items and the two additional injury checks.
- Preserve six October 5 long-term entries and the 87-player October 10 official snapshot as historical records. Current reporting renders in its own section, so an older official Available/Out designation cannot overwrite reporting about a later game. Missing players remain unknown. No practice participation was verified; all practice and likelihood fields stay null.
- Publish a selected seven-player Heisman watch: Smith, Mensah, Chambliss, Legree, Bachmeier, Toney and Weigman. Display Week 7 statistics explicitly as game totals. USA TODAY's October 19 watch informs selection; cases and counterweights are CFBApex editorial analysis. October 20 named-book prices are relayed by Betfirm; multiple book labels are not independent source verification, so confidence is capped at medium. Clean Mode uses editorial order; Analysis Mode uses signed American-price order. Unsupported model weights and independent-engine claims are removed.
- Publish three editorial upset cases: Houston at Utah, Indiana at Michigan (Michigan as underdog), and Texas Tech at Cincinnati (Cincinnati as underdog). Each has at least six literal published underdog points, a concrete box-score reason and an explicit counterweight. Provider lines come from `pointSpread.[side].close.line`; that field name does not mean a future game's market has closed. USC–Wisconsin fails the threshold at three points. No crowd-based trap is asserted without verified betting splits.
- Heisman and upset prices use the existing deliberate Analysis Mode disclosure. Clean Mode remains the default. Case text is visible without exposing prices.

## Deliverables

- `apps/site/data/injury-research/current.json`
- `apps/site/data/cfb-2026/heisman/week8-2026.json`
- `apps/site/data/cfb-2026/upset/week8-2026.json`
- `apps/site/data/cfb-2026/refresh/evidence/2026-10-20-week8-research.json`
- `apps/site/lib/{awards-watch.ts,injury-report.ts,cfb-2026.generated.ts}`
- `apps/site/components/{HubApp.tsx,feature-dashboards.tsx,injury-report-page.tsx,upset-watch-page.tsx}`
- `apps/site/scripts/ingest-injury-research.mjs` (`--check` validates without writes and preserves source metadata)
- `apps/site/scripts/build-dataset.mjs` (retain dated quarterback context in the generated bundle)
- `apps/site/tests/{domain.test.ts,week8.test.ts,rendered-html.test.mjs}`
- This handoff and `apps/site/docs/{REQUIREMENTS_TRACEABILITY.md,ASSUMPTIONS_REGISTER.md,DECISION_LOG.md}`

## Assumptions, limits and next owner

This is a bounded Tuesday research completion, not a complete official Week 8 availability census. Unknown future decisions cannot be filled by inference. Reported prices are dated snapshots and can move. Team effects and candidate cases are editorial interpretations, not calibrated probabilities or measured voter behavior. Previously accepted scores, records, TV, polls, ratings, fantasy and Travelpayouts configuration retain their source dates and behavior. The base-release replay script represents the initial release; do not replay it over later accepted research and TV amendments.

Next owner: the editorial/data maintainer checks subsequent school/conference game-day reports and changes only those statuses supported by newer reporting. Repository/production acceptance requires passing source and rendered-route checks, successful merge deployment, and direct browser verification of all three production pages and the disclosure flow. Final validation and deployment evidence will be recorded with the PR and production handoff.

Acceptance: PASS WITH CONDITIONS once deployment verification completes; the conditions are the explicitly unresolved player returns and single-reporting-chain market data, not unfinished research.
