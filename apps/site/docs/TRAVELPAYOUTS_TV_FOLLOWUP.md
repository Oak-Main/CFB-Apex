# October 20 Travelpayouts and TV follow-up

Mission: fix the installed Travelpayouts Drive configuration failure and resolve the remaining Week 8 TV assignment, then merge/deploy through the existing Cloudflare workflow and verify production.

## Inputs and diagnosis

- Existing root layout, public travel-link configuration and Worker response policy; PR 44's deployed commit `7608d403407728789a7ce519d5a91ff00abc6e2a`.
- The provider's public loader and runtime: `https://tpembars.com/NTcyMzEw.js?t=572310` and `https://tpembars.com/chunk.CEUgPSAP.js`. Runtime configuration is fetched from `/entrypoint_config`; missing configuration reaches its `config is not valid` branch. The site allowed the script but omitted its origin from `connect-src`.
- Public configuration checked October 20 returned HTTP 200 for cfbapex.com, marker 775855, project 572310. Emerald, integration, link_switcher and tooltip remain disabled. No account configuration or monetization feature is changed.
- [Travelpayouts installation guidance](https://support.travelpayouts.com/hc/en-us/articles/21844864838290-How-to-install-Drive-on-your-website) and [project-specific code guidance](https://support.travelpayouts.com/hc/en-us/articles/35971215112850-Where-to-find-your-Drive-code-after-installation).
- [Ball State's October 19 game-week announcement](https://ballstatesports.com/news/2026/10/19/football-cardinals-carry-renewed-confidence-into-homecoming-matchup) explicitly confirms the October 24 Sacramento State game at 3:30 PM ET on ESPN+. Fresh ESPN October 24 scoreboard data agrees, with `timeValid: true`. Both school schedule grids remain blank for TV; this is an omission, not a conflicting assignment.

## Decisions and assumptions

Allow the existing script origin to connect to its own configuration/collection endpoints. Add only `https://tpembars.com` to `connect-src`; no wildcard or other directive changes. Preserve the installed script, project identifiers, feature settings and manual tracked links. Console error suppression is not a fix.

Adopt ESPN+ from the host school's explicit announcement. Preserve the original release evidence and add a separate follow-up evidence file with checked times, provider hash and a short school excerpt hash. The exact Web reader retrieval timestamp was unavailable and remains null. Advance only this game's verification time, update the Week 8 note/hold, and append an audit-log entry. Other games, scores, records, polls and source cutoffs stay unchanged.

## Exact deliverables

- `apps/site/worker/index.ts`
- `apps/site/data/cfb-2026/refresh/evidence/2026-10-20-tv-followup.json`
- `apps/site/scripts/apply-oct20-tv-followup.mjs` (offline, idempotent, supports `--dry-run`)
- `apps/site/data/cfb-2026/refresh/verified-refresh.json` and regenerated `apps/site/lib/cfb-2026.generated.ts`
- `apps/site/tests/week8.test.ts` and `apps/site/tests/rendered-html.test.mjs`
- `apps/site/docs/{DECISION_LOG,ASSUMPTIONS_REGISTER,REQUIREMENTS_TRACEABILITY,WEEK8_RELEASE_VERIFICATION,TRAVELPAYOUTS_TV_FOLLOWUP}.md`

## Validation and handoff

Required: offline replay/dry-run/idempotence; full `npm run verify`; PR and merge-commit checks; production deployment/check; fresh browser load without the Drive configuration warning; working manual travel links; ESPN+ visible on home, scores, watch and the Sacramento State–Ball State game page, without the superseded pending-TV copy. Completed results are recorded in the PR and production verification handoff.

Acceptance is conditional on those checks. The site operator owns deployment and ongoing provider health. The editorial/data owner owns later schedule changes and the separately documented availability/Heisman/upset research gaps. This follow-up does not establish those unrelated claims or affiliate conversion/payout outcomes.
