# Week 8 release verification — October 20, 2026

Acceptance: PASS WITH CONDITIONS. The verified weekly release is suitable for PR review. The research gaps below remain visibly pending; this is not a claim that the entire supplied memo is independently confirmed. October 20 follow-up: Ball State's October 19 game-week announcement explicitly confirms ESPN+ for Sacramento State at Ball State at 3:30 PM ET. All 56 networks are now school-confirmed. The original 55-network findings below describe the initial release and are superseded for this one assignment by `docs/TRAVELPAYOUTS_TV_FOLLOWUP.md`.

## Mission, inputs and decisions

Review the supplied October 20 refresh package against the current main branch and fresh primary/provider data, amend verified facts, and prepare a PR for the existing Vinext/Cloudflare site. No production merge or deployment is included. The prior main revision was 2f2fb6f42a4d6948c1c6467fed04e5acc1bb3423.

Primary evidence: ESPN daily scoreboards (October 13–25), ESPN completed-game summaries and standings, NCAA Week 7 scoreboard and current leader tables, the October 11 ESPN rankings page, October 18 polls, all 56 host school schedule pages, Liberty/Akron school checks, Utah’s GameDay announcement, AP reporting carried by ESPN, and the official CFP release. Retrieval times and hashes are saved in data/cfb-2026/refresh/evidence/2026-10-20-week8-release.json. Source retrieval time is not a live-update guarantee.

## Verified and published

- All 59 FBS-vs-FBS finals match ESPN and NCAA. The 3 FBS-vs-FCS finals also agree and remain excluded. Ten midweek games and 49 Saturday games; 14 within three points; four overtime games; 26 road winners. Twenty-two pregame AP teams played, eight lost; the supplied upset rule yields five upsets. Pregame ranks use October 11.
- All 56 Week 8 FBS matchups, all kickoffs and the 3/1/3/5/44 daily split agree. Seventeen games involve AP teams; two match ranked teams. There are 26 idle teams. All 55 published networks have school support; one is withheld.
- All 138 overall and conference records were re-read. Every overall and conference record also equals the October 11 baseline plus the applicable Week 7 results (or remains unchanged on a bye). Poll records match the October 18 release. Movement uses the existing to-minus-from convention: negative means a rise.
- Current AP/Coaches editions, receiving-votes rows and movement; archived October 4 data and the October 11 AP edition. Composite preserves mean-rank ordering, AP tie-break and its full team union.
- NCAA leaders through October 17: passing (top five), rushing (top three), scoring offense/defense (top three). Braden Atkinson now leads passing at 2,604 yards; Jamal Roberts leads rushing at 867.
- All twelve supplied standout players checked against ESPN box scores. Add Hawkins’s 77 rushing yards/two rushing scores; expand Burgess to Torrance Burgess Jr. (24 carries, 224 rushing yards/four TD plus 52 receiving yards).
- Utah confirms Houston at 10:15 PM ET on ESPN and GameDay at President’s Circle, 9 AM–noon ET. Northwestern confirms Peacock; Liberty–Kennesaw State is Thursday; Georgia State–Arkansas State is in Jonesboro.
- Iamaleava’s season-ending surgery supersedes “out indefinitely.” Other availability coverage remains partial. Older long-term entries are expressly historical, with per-entry source dates; the old weekly watch is archived.
- Week 7 highlight, current Week 8 panel, factual playoff resume check, and dated pending states for Heisman/upset research. CFP confirms 12 teams, the named conference qualification rule, Notre Dame top-12 guarantee, first rankings November 3 (7–8 PM ET), final selections December 6 and the January 25 title game at Allegiant Stadium.

## Conditions and withheld claims

Initial check: Sacramento State–Ball State had ESPN+ only in provider data, with both school schedule grids blank. Follow-up resolved it from the host school's explicit October 19 announcement. ESPN+ is now published; the prior null/pending finding remains in the initial evidence for audit history.

The other twelve supplied availability stories, staff changes, hot-seat list, no-head-coach-firing assertion, unresolved streak/first/record narratives, officiating statement, weather forecasts and most policy/eligibility/transfer-calendar claims have not been independently established in this release. They are not promoted as current facts. Source-coverage gaps cannot establish a universal negative. ESPN’s injury endpoint also contains historical rows, so no broad current feed is inferred from it.

Current SP+/FPI, timestamped Heisman/market odds, NIL, fantasy and portal research are not re-dated. Heisman/upset pages expressly say pending; historical fantasy/portal/ratings retain their existing dates. The supplied SEO/legal/affiliate/privacy observations, static weekly URL feature, automated publishing rhythm and live-provider work are broader follow-ups, not completed work in this PR.

## Deliverables and handoff

- apps/site/data/cfb-2026/refresh/verified-refresh.json and refresh/evidence/2026-10-20-week8-release.json
- apps/site/scripts/apply-week8-release.mjs (offline, idempotent, --dry-run supported)
- apps/site/data/cfb-2026/{highlight,panel,playoff-audit,heisman,upset,polls} weekly/current and archive files
- apps/site/data/injury-research/current.json and inbox/week6-archived-2026-10-20.json
- apps/site/lib/cfb-2026.generated.ts plus the small display/source-date changes
- apps/site/tests/week8.test.ts, tests/html-text.mjs (parse5-backed rendered assertions) and updated archive/render regressions
- docs/DECISION_LOG.md, docs/ASSUMPTIONS_REGISTER.md, docs/REQUIREMENTS_TRACEABILITY.md

Owner: repository maintainer reviews/merges the PR into main through the existing deployment lane. Editorial/data owner resolves the pending network and remaining sourced research. Historical data, null/pending states and current source cutoffs are deliberate acceptance conditions.

Validation results are recorded in the PR after the final checks complete.
`npm run verify` passed locally on October 20: 97 domain/data tests, 15 rendered-route tests, six accessibility/SEO/link tests, typecheck, lint, production build, visual reference-artifact dimensions and migration/seed checks. Lint retains existing warnings. Offline dry-run, exact replay and idempotence checks also passed.
