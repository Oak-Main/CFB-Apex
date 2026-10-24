# GameDay refresh and companion boundary

Base: `156c893d300ed45330e5578add79acaec38d7274` (PR51). PR52 is a separate open copy change and is not modified by this branch. This candidate resolves its Week 0/null/statistics-label edge cases with focused shared formatters.

## Source to native page

`data/cfb-2026/refresh/verified-refresh.json` is the reviewed authority. `scripts/build-dataset.mjs` preserves its source dates and disables provider fetches when that snapshot exists; building alone is not research. It emits `lib/cfb-2026.generated.ts` and its deterministic `sharedDataRevision`. `lib/cfb-dataset.ts` creates the games, team records, standings and reviewed `boardWeeks`. `lib/gameday-shared.ts` projects those same facts to `app/api/gameday/route.ts` and `components/gameday-command-center.tsx` at `/gameday`.

Week selection uses the server clock and reviewed cutovers in `lib/week-cutover.ts`, preserving explicit archives, including numeric zero when reviewed. October 24 is still the reviewed Week 8; the date does not create a Week 9 release. The current dataset season is 2026. Scheduled games remain scheduled when kickoff has passed, with an unconfirmed-result note. Scores of zero are valid. Result, schedule, records, poll and availability dates remain independent. Previous-week results retain their own archive verification date.

The new evidence file records all 12 Week 8 finals and all 138 reconciled overall/conference records. Five Friday finals require fresh ESPN and official-school agreement because the NCAA response still carries pregame/null values. Those literal discrepancies remain recorded; NCAA is not cited as confirmation of Friday finals. Prior played rows and archive metadata are preserved.

## Actual Lovable consumer

Project `87b5a164-7cf5-40fa-9d8a-fb7f3b6646f3`, connected repository `kevynsgrin-a11y/gametime-visuals`, source revision `29e6b8a37dd8d0e93dae99ec566c6fd6947d84d8` was inspected read-only through Lovable. The published URL is `https://gametime-visuals.lovable.app`.

`src/routes/index.tsx` loads `getGamedayFeed` in `src/lib/gameday-feed.functions.ts`, which calls `loadGamedayFeed` in `src/lib/gameday-feed.ts`. Its default endpoint is `https://cfbapex.com/api/gameday`; it uses an eight-second timeout and schemaVersion 1 validation. Server environment override support exists, so source code alone does not prove what the published homepage currently consumes. The homepage revalidates every five visible minutes and on focus/visibility return, and retains explicit archive selection. It renders games via `feedBoard`, current overall records/national rankings via `feedStandings`, and missing/unknown values explicitly. Its rankings panel is labeled as not conference standings. The preview database and disabled polls workflow are not the public homepage's authority.

Routine Week 8 result updates flow through the existing feed and require no new Lovable AI build. Two companion code issues are separate: positive-only week validators reject valid Week 0, and `feedFinalsLabel` currently uses the selected board's results date for the previous-week strip. A focused companion patch is prepared separately; neither is fixed merely by adding fields to CFBApex. The required external step is to apply/review the patch in the connected companion source, test its preview against the candidate feed, allow supported Git synchronization, publish through Lovable, and verify the actual public page. No external write, new credential, permission, database migration or scheduler change is part of this candidate.

## Release status

PR51 production workflow `40074014686` deployed Worker `e60342d6-1489-4a75-8a5c-74bddab8c830` at 07:26 UTC. The public feed at 09:24 UTC matches PR51 revision `3acea5c43a546e2ef74625b153a9a2d73b508db4e640fbfa170ff208b496f47f`, with seven finals and older source checks. This is the deployed baseline, not acceptance of this candidate.

The unchanged dependency/lockfile production audit still reports five affected packages. The denied upgrade remains paused. This candidate must not merge/deploy until required security and acceptance gates clear, source evidence is genuinely refreshed, current main/PR52 overlap is reconciled, and native/companion live parity is verified. A build or Git merge does not establish deployment or Lovable publication.

Interruption status recorded October 24 21:48 UTC: the local-preview browser network-failure test held the task from about 09:44 UTC and returned without a confirmed unavailable notice. Approval request manager:eff26c0987e043b5a73fb7d6049c6064:1 has no recorded human response. That negative browser check is INCOMPLETE, not a deployment failure. Source observations at 09:13–09:19 UTC have exceeded the two-hour release window; genuinely refresh/reconcile all newer finals and records before any future publication. No dependency upgrade, new merge, production deployment or Lovable external write was performed by this follow-through.
