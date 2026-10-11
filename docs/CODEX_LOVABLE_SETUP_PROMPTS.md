# Codex and Lovable setup prompts

Prompts and settings for finishing the GameDay Command Center backend in Lovable Cloud, setting up Codex for both repositories, and running the weekly native refresh. Copy each fenced block as written.

Written 2026-10-11. State at that time:

- **Production** (`cfbapex.com`, this repo, Vinext on Cloudflare) is live on the Week 7 board. All 58 Week 6 finals and 138 records are verified. After the October 11 rechecks, all 59 Week 7 kickoffs and networks are published. Production never reads the preview database.
- **Lovable preview** (`kevynsgrin-a11y/gametime-visuals`, project `87b5a164-7cf5-40fa-9d8a-fb7f3b6646f3`): the hosted RPC `read_ranking_snapshot` returns HTTP 404 / `PGRST202`. That means migration `0001_atomic_ranking_snapshots.sql` is not applied, so the preview shows its reviewed fallback. Runtime credentials and the scheduler are not verified.
- Codex environment: a draft was saved, but it has not been published and a fresh task has not been shown to restore it.

**Ground rules for every prompt below**

- Never paste a key, password or token into any chat, Codex or Lovable.
- Never re-run `0000_rankings_and_roles.sql`.
- Never create users, accept invitations or grant roles just for testing.
- Run exactly one poll scheduler.

## Order of operations

| # | Where | What | Prompt |
|---|---|---|---|
| 1 | Lovable chat (Agent mode) for the `gametime-visuals` project | Migration 0001, runtime credentials, one scheduler, evidence | L1 |
| 2 | Codex settings → Environments | Configure both repos, then publish | E1, E2 |
| 3 | Codex, new task in each repo | Prove a fresh task restores the environment | C1 |
| 4 | Codex, new task in `gametime-visuals` | Independent read-only check of the hosted backend | C2 |
| 5 | Codex, new task in `CFB-Apex`, every week | Native weekly refresh (finals, records, polls, next week, kickoffs) | C3 |

If you would rather not spend Lovable chat credits on step 1, do it by hand with the SQL in the appendix and the Lovable Cloud UI. The appendix also covers the alternative GitHub scheduler.

---

## L1 — Lovable: activate the preview backend

Paste into the Lovable editor chat for https://lovable.dev/projects/87b5a164-7cf5-40fa-9d8a-fb7f3b6646f3 in Agent mode. When a migration-approval card appears, approve it. When a secret form appears, enter the value in the form, never in chat.

```text
Backend activation only. Do not change UI, routes, data releases, tests or any file other than what your migration tool records for step 2.

Context: this project is GitHub kevynsgrin-a11y/gametime-visuals (main at deb4f64 or later). The hosted RPC read_ranking_snapshot currently returns 404 / PGRST202, so the app shows its reviewed fallback. Production cfbapex.com is a separate Vinext/Cloudflare site; never touch it.

Work in order. Stop at the first failure and report exactly what you saw.

1. Read-only migration check. List this Lovable Cloud database's applied migrations, then report whether each object exists (yes/no table):
   - from 0000_rankings_and_roles: table public.user_roles, function public.has_role, table public.team_rankings, table public.sync_runs
   - from 0001_atomic_ranking_snapshots: tables public.ranking_snapshots, public.ranking_publications, public.ranking_sync_lease and function public.read_ranking_snapshot(int, int)
   Do not write anything in this step.

2. Apply 0001 once. Only if every 0000 object exists and the 0001 objects do not: apply the exact, unmodified contents of drizzle/migrations/0001_atomic_ranking_snapshots.sql through your supported migration tool (I will approve it). Never re-run 0000_rankings_and_roles.sql. If the 0000 objects are missing, stop and ask me; do not apply both migrations on your own. If 0001 objects already exist, skip this step and say so. Afterwards call public.read_ranking_snapshot(2026, 7) and confirm it no longer fails with PGRST202; report whether it returns a snapshot or nothing published yet.

3. Runtime credentials, names only. Tell me whether SUPABASE_SERVICE_ROLE_KEY and LOVABLE_CRON_SECRET are available to server functions. Never print, log, echo or hash their values. If either is missing, open your secure secret form for it and I will enter the value there. Never ask me to paste a key or password into chat. Never put either name in VITE_* variables, client code, URLs, logs or Git.

4. Exactly one scheduler. First list every existing scheduled job and report its name, schedule and target. Then, using Lovable's supported cron/scheduled-job feature (the one that authenticates with LOVABLE_CRON_SECRET through src/integrations/supabase/cron-auth.ts), make sure exactly one job sends POST /api/public/cron/sync-rankings on these UTC schedules: */20 17-23 * * 0 and */20 0-3 * * 1 (Sunday 17:00 through Monday 03:40 UTC, which is 10:00 AM–8:40 PM Pacific during daylight time). If a job for this route already exists, reuse it and ask me before removing any duplicate. The GitHub workflow .github/workflows/sunday-polls.yml must stay inactive: do not create or change the repository variable CFBA_POLLS_ENABLED. If Lovable has no supported scheduler for this route, stop and tell me; do not build a substitute.

5. Evidence. Run the job once now; this is its first real write.
   a. An unauthenticated POST to /api/public/cron/sync-rankings returns 401. Report the status only.
   b. Trigger the job or route once with the server-side secret. Report the HTTP status and the JSON result's ok/status/edition fields only, never headers or secrets.
   c. Call public.read_ranking_snapshot(2026, 7) as anon. Report: snapshot id, week, row count (expect 138), the AP and Coaches editions with their own release dates, and lastSyncStatus.
   d. Read-only privilege check. Report the result of:
      select has_table_privilege('anon','public.ranking_snapshots','INSERT,UPDATE,DELETE') as anon_can_write_snapshots,
             has_table_privilege('authenticated','public.team_rankings','INSERT,UPDATE,DELETE') as authed_can_write_legacy;
      Both must be false.
   e. Rollback readiness. Report: select user_id from public.user_roles where role = 'admin';
      If an admin exists, stop; I will run a restore on /weekly-data myself. If none exists, report "rollback test pending owner admin". Do not create users, accept invitations or grant roles.

6. Final report: migration applied (name and time), job (name, schedule, next run in UTC and Pacific), evidence 5a–5e, and anything still pending. Do not mark activation complete unless 5b succeeded and 5c returned a published snapshot.
```

---

## E1 / E2 — Codex environment settings (both repositories)

Enter these in Codex → Settings → Environments, once per repository. Save, then **publish** the environment. Codex labels change over time; match these values to the nearest field.

### E1 — `kevynsgrin-a11y/CFB-Apex`

| Field | Value |
|---|---|
| Name | `CFB-Apex` |
| Repository / branch | `kevynsgrin-a11y/CFB-Apex`, default branch `main` |
| Container image | Universal (default) |
| Package versions | Node.js **22** |
| Setup script | see the block below |
| Maintenance script (cached containers) | `cd apps/site && npm ci` |
| Environment variables | none required |
| Secrets | **none**. Cloudflare deploys run only in GitHub Actions; never add `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` to Codex. |
| Agent internet access | **On**. Domain allowlist: **All (unrestricted)**. Allowed HTTP methods: **GET, HEAD, OPTIONS only**. Research spans ESPN APIs, NCAA.com and many school and conference sites. If you prefer an allowlist, use "Common dependencies" plus `site.api.espn.com`, `site.web.api.espn.com`, `www.espn.com`, `www.ncaa.com`, `cfbapex.com`, `www.cfbapex.com`, and add school domains as tasks need them. |

Setup script:

```bash
set -euo pipefail
cd apps/site
npm ci
node --version
```

### E2 — `kevynsgrin-a11y/gametime-visuals`

| Field | Value |
|---|---|
| Name | `gametime-visuals` |
| Repository / branch | `kevynsgrin-a11y/gametime-visuals`, default branch `main` |
| Container image | Universal (default) |
| Package versions | Node.js **22** (Bun **1.3.11** is pinned by the setup script) |
| Setup script | `bash scripts/setup-cloud.sh` (frozen Bun install, then `tsc`, `vitest` and `vite build`) |
| Maintenance script | `npm exec --yes --package=bun@1.3.11 -- bun install --frozen-lockfile` |
| Environment variables | none. The public `VITE_SUPABASE_*` values are already committed in `.env` by Lovable. |
| Secrets | **none**. Never add `SUPABASE_SERVICE_ROLE_KEY` or `LOVABLE_CRON_SECRET` to Codex; they live only in Lovable Cloud. |
| Agent internet access | Same policy as E1: **All**, **GET/HEAD/OPTIONS only**. With an allowlist, add the project's Supabase host from `.env` and `id-preview--87b5a164-7cf5-40fa-9d8a-fb7f3b6646f3.lovable.app`. |

After both are saved and published, run **C1** once in each repository.

---

## C1 — Codex: prove a fresh task restores the environment

Start a new Codex task in each repository and paste:

```text
Environment check only. No code changes, no commits, no PR.

1. Report node -v and npm -v. In gametime-visuals also report the pinned Bun with: npm exec --yes --package=bun@1.3.11 -- bun --version
2. Confirm the environment setup already installed dependencies (node_modules exists; for CFB-Apex check apps/site/node_modules). Do not reinstall. If they are missing, report a setup failure instead of fixing it inside the task.
3. Run the repo's full check:
   - CFB-Apex: cd apps/site && CI=true npm run verify
   - gametime-visuals: ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run && ./node_modules/.bin/vite build
4. Internet (GET only): report the HTTP status of
   curl -sS -o /dev/null -w '%{http_code}' 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=1'
   and the same for https://www.ncaa.com/ . Expect 200.
5. List environment variable NAMES only (never values) matching KEY|SECRET|TOKEN|PASSWORD. Expect none.

Reply with a table: check | result | evidence (one line each), then PASS / PASS WITH CONDITIONS / FAIL.
```

---

## C2 — Codex: independent read-only check of the hosted preview backend

Run in a new `gametime-visuals` task after L1 reports success:

```text
Read-only verification of the Lovable preview backend. Do not modify or commit files. Do not use any secret. Do not send any request that writes data.

1. From .env read only the public values VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.
2. POST {VITE_SUPABASE_URL}/rest/v1/rpc/read_ranking_snapshot with JSON body {"_season":2026,"_week":7} and headers apikey: <publishable key>, Content-Type: application/json. (This is a read-only RPC; POST is how PostgREST calls functions, so if the GET-only internet policy blocks it, report that and stop.) Report the HTTP status. PGRST202 means migration 0001 is still missing.
3. If a snapshot comes back, validate it with the repo's own validator (src/lib/snapshot-validation.ts) in a throwaway script outside the repo. Report: week, row count (expect 138), AP and Coaches editions and their release dates, lastSyncStatus.
4. Without any Authorization header, send POST https://id-preview--87b5a164-7cf5-40fa-9d8a-fb7f3b6646f3.lovable.app/api/public/cron/sync-rankings (or the origin I name). Expect 401. Report the status only.
5. GET the preview homepage and ?week=6 and ?week=7. Report the HTTP status, the Cache-Control header, and whether the poll panel shows a published edition or the reviewed fallback.

Reply with evidence lines only and PASS / PASS WITH CONDITIONS / FAIL.
```

If your Codex internet policy is GET-only, steps 2 and 4 need a one-task exception that allows POST, or run them yourself with `curl`. Both requests are safe: step 2 is a read-only RPC, and step 4 is refused without a secret.

---

## C3 — Codex: weekly native refresh for cfbapex.com (repeat every week)

Run in a new `CFB-Apex` task. Change the bracketed dates each week; the values shown are for Week 7 → Week 8.

```text
Weekly native refresh for cfbapex.com (repo kevynsgrin-a11y/CFB-Apex, app apps/site). You have standing approval to open a draft PR, get CI green, mark it ready, merge (merging deploys) and confirm the live site. Never push to main directly.

Start with: git fetch origin main. Read the open PRs and the latest refresh_log entries in apps/site/data/cfb-2026/refresh/verified-refresh.json; another session may be working on the same week. If main moves while you work, merge it into your branch, take main's data files, and re-run your apply script on top. Never hand-merge the snapshot JSON.

Read first: apps/site/AGENTS.md, the last six entries of apps/site/docs/DECISION_LOG.md, and these templates you must follow:
- scripts/apply-week7-release.mjs (new week release)
- scripts/apply-oct10-saturday-finals.mjs (finals plus record reconciliation)
- scripts/apply-oct11-school-recheck.mjs (official school sources for finals; host/visitor kickoff rule)
- scripts/apply-week7-kickoff-updates.mjs (kickoff/network recheck)
plus their evidence files under data/cfb-2026/refresh/evidence/.

Rules. Each is a hard gate; a disagreement blocks the change, never guess.
- Finals: an ESPN summary with status completed/post whose line scores sum to the final, plus the same score and winner on NCAA.com's FBS scoreboard. Never promote a game to final because its kickoff time passed.
- Records: last verified record + verified result must equal the ESPN game-summary record and ESPN standings (site.web.api.espn.com standings, group 80). Conference records come from the stat type vsconf. All 138 must reconcile.
- Kickoffs and networks: the host school's official schedule settles its own home game. A visiting school's listing counts only when ESPN shows the same value with a valid time (scoreboard competitions[0].timeValid === true; convert the school's local time in its own time zone). A host listing two alternatives ("ABC or ESPN") is unresolved, not a conflict. School sources count only from the host listed for that school in data/cfb-2026/refresh/official-school-hosts.json; add a school only after confirming its official athletics site. An official TBA stays kickoff_utc: null with kickoff_status official_tbd and renders "Kickoff TBA", never a midnight time. Game ids use the Eastern date and never change.
- Polls: AP and Coaches each keep their own release date. Never relabel an older edition as the new week's. If an edition is not yet published, keep the previous one and say so.
- Process: research → committed evidence JSON (sources, retrieval times, hashes of saved API responses, verbatim school quotes) → an offline, idempotent apply script with heavy assertions (keyed on refresh_log.script) → snapshot data/cfb-2026/refresh/verified-refresh.json. Never edit the snapshot by hand and never fetch the network from an apply script. Update DECISION_LOG, ASSUMPTIONS_REGISTER and REQUIREMENTS_TRACEABILITY.
- School sites are often bot-protected. Record any page you could not load as unverified; never infer from it.

This week's jobs (do whichever are due; each can be its own PR):
A. Finals for Week [7] (games [Oct 13–17]): verify every Week [7] game per the rules, move them to playedGames, reconcile all 138 records and the conference standings, and write the week's finals story.
B. Polls: the AP Top 25 and AFCA Coaches editions released [Sunday Oct 11] (and later ones as they publish), cross-checked against ESPN rankings (site.api.espn.com/apis/site/v2/sports/football/college-football/rankings). Store each with its own release date.
C. Week [8] release: calendar [2026-10-19 → 2026-10-25], games [Tue Oct 20 – Sat Oct 24]. Build the FBS-vs-FBS slate from ESPN scoreboards (groups=80, one call per date), excluding FBS-vs-FCS games with ESPN conference-id evidence. Confirm every kickoff and network against school schedules per the rules. Add a board_weeks entry {week: [8], start: "[2026-10-19]", end: "[2026-10-25]", label: "[Oct 20–24]", cutover_utc: "[2026-10-18T13:00:00Z]", marquee_game_id} (06:00 America/Los_Angeles on the Sunday before the games; use 14:00Z once standard time starts Nov 1). The prior week stays as an archive. This PR must be merged and live before cutover_utc.
D. Midweek recheck (Mon–Thu): re-run the kickoff/network recheck for any remaining TBA or "X or Y" network using the apply-week7-kickoff-updates.mjs pattern.

Before every push:
1. cd apps/site && CI=true npm run verify must pass completely (typecheck, lint, unit, build with the live ESPN coverage check, integration, a11y, SEO, links, visual, migrations, seed).
2. Extract the node heredoc from the "Check production snapshot across surfaces" step of .github/workflows/deploy-site.yml into a file, run it from apps/site against production with your new snapshot, and fix anything it would fail on after deploy.
3. Keep tests time-independent: pin ?week=N in rendered tests instead of relying on today's date.

After merge: watch the "Deploy CFB Apex site" run on main until it succeeds. Then confirm live:
- curl -sI https://cfbapex.com/ shows Cache-Control containing no-store
- https://cfbapex.com/?week=[8] shows "WEEK [8] · [OCT 20–24]"
- every changed value appears on /?week=N and /scores?week=N
- after cutover, the default page shows the new week

Final reply in the AGENTS.md handoff format, with the PR link(s), the merge commit, and the live checks with timestamps.
```

---

## Appendix A — By hand in Lovable Cloud (no chat credits)

In the Lovable editor, open **Cloud → Database → SQL editor** and run:

```sql
-- 1. Read-only: which migrations' objects exist?
select
  to_regclass('public.user_roles')           is not null as m0000_user_roles,
  to_regclass('public.team_rankings')        is not null as m0000_team_rankings,
  to_regclass('public.sync_runs')            is not null as m0000_sync_runs,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'has_role') as m0000_has_role,
  to_regclass('public.ranking_snapshots')    is not null as m0001_ranking_snapshots,
  to_regclass('public.ranking_publications') is not null as m0001_ranking_publications,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'read_ranking_snapshot') as m0001_read_snapshot;
```

- **All `m0000_*` true and all `m0001_*` false:** apply `drizzle/migrations/0001_atomic_ranking_snapshots.sql` once, unmodified. The supported migration runner is preferred because it records history. Pasting the file into the SQL editor works but leaves no migration record.
- **Any `m0000_*` false:** stop. Do not run 0000 on an existing database.

After applying:

```sql
-- 2. Read-only verification
select public.read_ranking_snapshot(2026, 7) is not null as has_published_snapshot;
select has_table_privilege('anon', 'public.ranking_snapshots', 'INSERT,UPDATE,DELETE') as anon_can_write_snapshots,   -- expect false
       has_table_privilege('authenticated', 'public.team_rankings', 'INSERT,UPDATE,DELETE') as authed_can_write_legacy; -- expect false
select user_id from public.user_roles where role = 'admin';  -- owner check only; grant nothing
```

Then:

1. Set the secrets in **Cloud → Secrets** (`SUPABASE_SERVICE_ROLE_KEY` only if missing; `LOVABLE_CRON_SECRET`).
2. Create the single job in Lovable's scheduled-jobs UI: `POST /api/public/cron/sync-rankings` on `*/20 17-23 * * 0` and `*/20 0-3 * * 1` (UTC).
3. Use "Run now" once and keep the result.

## Appendix B — GitHub scheduler instead of Lovable's (pick exactly one)

Use this only if Lovable has no supported job for the route. Make sure no Lovable job targets the route.

1. Create a random secret on your own machine, for example `openssl rand -base64 48`. Enter it in **two places, each through its own secure form**:
   - Lovable Cloud → Secrets → `LOVABLE_CRON_SECRET`
   - GitHub → `gametime-visuals` → Settings → Environments → **New environment `lovable-preview`** → Environment secret `CFBA_CRON_SECRET`

   Never put it in chat or Git.
2. In the same environment, add the variable `CFBA_PREVIEW_URL` = the HTTPS `*.lovable.app` origin. Use the one where an unauthenticated `POST /api/public/cron/sync-rankings` returns **401**.
3. Confirm `.github/workflows/sunday-polls.yml` is on `main`.
4. Settings → Secrets and variables → Actions → **Variables** → New repository variable `CFBA_POLLS_ENABLED` = `true`.
5. Actions → "Sunday poll editions (preview only)" → **Run workflow** on `main` once. Keep the run URL, then run C2.

To roll back the scheduler, set `CFBA_POLLS_ENABLED` to `false`, or delete the Lovable job.
