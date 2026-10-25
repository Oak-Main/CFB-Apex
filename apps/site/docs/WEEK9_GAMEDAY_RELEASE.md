# Week 9 preparation and Week 8 archive

Mission: advance the reviewed 2026 college board through the existing Sunday cutover, retain completed Week 8, and preserve the independently dated injury/editorial/statistics modules. DukeFantasy is outside this pivot.

## Source contract

Evidence: `data/cfb-2026/refresh/evidence/2026-10-25-week9-preparation.json`. Source checks began October 25 at 19:23 UTC (12:23 PDT). Full NCAA Week 8/9 inventories each contain 56 contests and match the unions of the dated ESPN scoreboards one-to-one. The ESPN weekly endpoint returns only 25 rows and is explicitly insufficient for inventory acceptance. No missing or excluded contests appeared in these two independently matched inventories.

Week 8: 56 verified finals, 429 season results retained. Illinois 21–Oregon 10 and Utah 21–Houston 13 now agree with NCAA final observations as well as ESPN. The earlier NCAA in-progress observations remain in the prior evidence file. All 138 overall and conference records were reread, replacing authoritative values rather than incrementing them. Corrected results preserve stable game IDs, prior scores and observation history. Legitimate negative statistics are untouched.

Week 9: 56 upcoming fixtures on October 27–31; default cutover October 25 at 13:00 UTC / 06:00 PDT. Three uncorroborated kickoff times remain date-only/TBA; five NCAA-unpublished times are now corroborated by fresh official-school clock/timezone announcements and ESPN. Fifteen provider TV listings lack accepted school confirmation and remain unpublished. These are field-level holds, not omitted games. Venue and neutral flags retain their source values; the neutral marquee uses the event venue rather than the nominal home stadium. Source evidence includes provider listings and exact holds. North Dakota State–New Mexico retains its school-verified scheduled 02:00 UTC kickoff; ESPN's 02:20 listing is separately recorded. Neither observation is asserted to be the actual start.

AP and Coaches editions are published October 25. AP is checked against the official NCAA carrier; Coaches against USA Today. Provider date carriers are not exact poll publication clocks. October 18 editions are retained in `poll_history`. The composite is an explicitly editorial average, not an official poll. Injury reporting remains Week 8, season leaders remain through October 17, and editorial sources keep their existing dates.

## Integration and release ownership

Native `/gameday` and `/api/gameday` project the same vendored snapshot and SHA-256 data revision. Explicit `?week=8` and `?week=9` select reviewed archives; nullish selection preserves valid Week 0 values. Upcoming Week 9 has no results-check timestamp and no invented College GameDay designation. Previous results carry the Week 8 observation date. Postponed, canceled and delayed statuses survive projection. Failed refreshes retain the previous reviewed snapshot and original dates.

The existing Lovable project `87b5a164-7cf5-40fa-9d8a-fb7f3b6646f3` consumes this public feed through `src/lib/gameday-feed.ts` and its server function; the preview database is not an independent homepage data authority. Published behavior must be checked separately from source compatibility. Current source is `9b3f5a10a6a2450baab345d3cf02c3adf7a36e3e`. The protected generated difference at `src/integrations/supabase/previewAuthStorage.ts` is preserved for review; no authentication weakening or protected-file workaround is authorized.

Keep PR53 as the single candidate. PR52 overlaps; PR53's nullish Week 0 and actual statistics-week fixes supersede the overlapping copy changes. Do not merge both blindly. Main's existing serialized workflow is the only production deployment writer. No production migration/seed is required; repository fixture checks operate locally.

## Required acceptance

Run final clean output through `npm run verify`, `npm run cf:types`, `npm run deploy:dry-run`, production audit, and `npm run gameday:source-gate`. The gate rereads both official inventories, final scores/quarters, fixtures, records and polls, plus every published TV school confirmation. Evidence expires after two hours. A source change fails closed for reconciliation. Rebuilds do not refresh source facts.

Fresh desktop/mobile browser acceptance must inspect Week 9 default, Week 8 archive, direct URLs/reloads, TBA and empty states, refresh failure, console/network errors and data revision parity. Existing visual image dimension checks are not new browser acceptance. Companion security/build/auth-diff and publication acceptance remain separate gates. Do not merge or deploy while required gates are incomplete. Record exact-head CI, merge/deployment IDs, data hashes and public observations in UTC and America/Los_Angeles before claiming acceptance.
