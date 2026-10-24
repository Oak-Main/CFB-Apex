# Assumptions register

| ID | Assumption | Rationale | Risk/mitigation |
|---|---|---|---|
| A-001 | The repository is a new project. | It contained no project files or Git history before initialization. | Preserve the generated Vinext foundation and document all migration choices. |
| A-002 | This delivery uses deterministic fixture data. | No provider contracts, credentials, or content rights were supplied. | Label every fixture surface as demo; noindex demo content; expose provider configuration state. |
| A-003 | “CFB Apex” is the approved release brand for `cfbapex.com`. | The owner selected the domain and requested deployment there. | Keep brand strings and metadata centralized so future changes remain consistent. |
| A-004 | Clean Mode is the device default. | Required product principle. | Persist only an explicit local preference; gate Odds & DFS Mode with disclosure. |
| A-005 | `cfbapex.com` and `www.cfbapex.com` are authorized for a public fixture beta; campaign, affiliate, paid-data, and live-data activation are not. | The owner explicitly requested the domain deployment, but supplied no provider contracts or launch evidence. | Keep the fixture/noindex boundary and all commercial/live activation environment-gated. |
| A-006 | Public examples may use invented fixture schools and people. | Avoids false claims and licensing issues. | Mark them as deterministic demonstration records and never present them as live/current. |
| A-007 | The current runtime supports four concurrent agent threads. | Platform limit is four, below the brief’s preferred 6–8. | Use three parallel specialists plus the managing thread and sequence later reviewers. |
| A-008 | The domain release is an unauthenticated fixture beta, not a production live-data launch. | The owner authorized a public URL before provider and legal gates were closed. | Retain global noindex, synthetic labels, server-side kill switches, and lightweight public endpoints only. |
| A-009 | Fixture transformations are product demonstrations, not predictive models. | No licensed historical corpus, trained artifact, calibration, or backtest was supplied. | Use synthetic provenance and candid model cards; never market accuracy claims. |
| A-010 | One client-side product shell is acceptable for this preview. | It provides coherent interactive fixtures quickly. | Split routes and reduce client JavaScript before a public performance launch. |
| A-011 | The supplied July 31 research report is discovery input, not authoritative data. | It contains material conflicts with current primary sources. | Quarantine unsupported facts; use `docs/RESEARCH_REPORT_AUDIT.md` before implementation. |
| A-012 | Sportradar and SportsDataIO are RFP candidates, not selected vendors. | No signed order form, SLA, credentials, or pilot evidence was supplied. | Compare identical written rights/coverage responses and measured replay/live results. |
| A-013 | An external persistent-stream relay may not be necessary. | Current Workers docs allow unlimited HTTP wall time while connected; lifecycle reliability still needs testing. | Prototype on Cloudflare first and add a minimal relay only on measured need. |
| A-014 | Public live-data launch remains explicitly unauthorized. | Domain deployment approval does not supply rights, entity crosswalk, shadow pilot, drills, staffing, or legal approval. | Deny-by-default environment gates, noindex lock, fixture beta, and public live-launch runbook. |

## October 5, 2026 refresh assumptions

- The user moved the target to Week 6, October 5–11. The old October 3 cutoff is superseded. Source retrieval: October 5, 2026, 07:24 UTC / 00:24 PDT.
- Previously committed historical records are retained inputs, not newly independently verified metrics.
- Queries supply 54 October 3 events and 58 October 6–10 events. The UI supports FBS vs FBS: 51 newly confirmed Saturday finals and 56 upcoming matchups. Five FCS-opponent games across the queried dates are recorded separately.
- Poll records are October 4 release snapshots; current team records are separate provider fields. Two programs without a published record remain “Not published.”
- Current Week 6 SP+, FPI, same-minute sportsbook odds, and a complete availability ledger were not verified. Retained modules keep their dates.
- Production publish credentials are unavailable in the working session. A tested source patch is not a production release.

## October 5, 2026 audit-correction assumptions

- The audit's claim set was re-verified independently against ESPN endpoints on October 5: 58 FBS-vs-FBS games for October 6–10, both restored games' kickoffs/TV/venues, October 4 poll rows, others-receiving-votes, and dropouts all matched.
- College GameDay (Tuscaloosa, Oct 10) is confirmed by the show's October 3 announcement (per On3/Saturday Down South, as cited in the audit) and the public GameDay location listing; the air-time window is single-outlet and is NOT printed.
- Standings rows are ESPN league records with the overall record shown beside them; the ESPN injury base retains its September 29 cutoff and is labeled as such.
- The editorial injury layer remains Week 2 (September 9): the page now says so in a banner and collapses its watch table instead of implying live refresh.
- Fantasy notes remain Week 1 (September 7) and are retitled accordingly.

## October 9, 2026 midweek-refresh assumptions

- ESPN's completed game summary is the primary results source, as in prior refreshes. Conference USA and Sun Belt official standings corroborate their five finals; the American's standings page and both school schedule pages had not posted UTSA 31–24 South Florida at check time, so that result is single-sourced to ESPN (completed status, quarter line score sums to the final).
- Iowa at Washington stays without a TV designation: Washington's schedule shows "FOX or FS1", which is not an assignment.
- Big Ten availability report pages could not be retrieved from the verification environment. No player designation was changed; the panel topic on Dante Moore's status remains a pre-report framing dated Oct 5.
- No other FBS games were played between the Oct 5 snapshot and the Oct 9 refresh, so the re-read standings equal the Oct 5 state plus the seven midweek results (all 138 overall records match teamRecords).

## October 10 pregame refresh

- Advertised kickoff times are used consistently; minor field-ceremony times in school previews do not replace broadcast slots. Rice–ECU and Kansas–Utah have explicit official changes.
- ESPN's complete-game statuses, line scores and school reports corroborate Friday results; all conference and overall records reconcile. Poll records remain historical publication-time records.
- The AP October 8 Moore/Raiola report is labeled reported, not an independently retrieved official conference filing. Other availability entries were not fully reverified and keep prior dates.
- Saturday weather advisories do not establish live conditions or a blanket all-clear. GameDay's indoor relocation and Georgia Tech's canceled festivities are explicitly sourced.

## October 11 Week 7 release

- The reviewed Gameday Command Center release is the Week 7 authority. ESPN's FBS scoreboard (checked 2026-10-11 12:20 UTC) lists all 59 pairings plus the three excluded FCS games; its differences (TBD times, "ABC or ESPN" alternatives, the Wisconsin–UCLA placeholder, network abbreviations) are recorded and not adopted.
- The cutover is a fixed editorial time, Sunday 06:00 America/Los_Angeles before the week starts; poll publication remains independent of it.
- A team's October 10 ESPN-reconciled record stays valid when its Week 6 game was already a verified final before that check, or its schedule lists an explicit October 10 bye.
- ESPN conference ids 179 (Charleston Southern), 48 (Elon) and 29 (The Citadel) are outside the FBS set, so those three games stay excluded with evidence.

## October 11 Saturday finals

- NCAA.com's server-rendered FBS week 6 scoreboard (58 games, all final, NCAA ORG-SPORTS feed) is the independent official check beside ESPN's completed-game summaries. School pages were largely bot-protected from this environment.
- ESPN standings after Saturday are the record authority only where they agree with the derivation from verified results; a disagreement would block the refresh.

## October 11 school-source and Week 7 recheck

- A school page rendered through Cloudflare Browser Rendering is the school's own published page; the rendering service only gets past bot protection and changes no content.
- A school schedule that lists a specific time while the host still lists TBA counts for a kickoff only when ESPN shows the same time as valid; a network shown only as a visiting school's logo is not adopted.

## October 11 Week 7 afternoon recheck

- ESPN's `timeValid` flag separates a placeholder from a set time. A visiting school's listing is adopted once ESPN shows the same instant with `timeValid: true`.
- A host schedule that lists two alternative networks ("ABC or ESPN") is unresolved, not conflicting. A participating school's single network that ESPN also shows resolves it.

## October 20 Week 8 verification

- Scope is the October 20 package and the weekly site surfaces. Scores are final only when completed ESPN data agrees with NCAA; a passed kickoff is insufficient.
- School-local times convert to the same ESPN UTC instant. A named participating school’s network can resolve a missing/ambiguous host listing when ESPN agrees; Sacramento State–Ball State remains unresolved.
- Current overall records reconcile from the previously reviewed October 11 baseline, including three FCS opponents. AP movement uses October 11, not the older October 4 snapshot.
- NCAA totals are through October 17; polls are October 18. Ratings, portal, fantasy and historical official availability retain their own dates.
- Missing Week 8 availability is unknown. The ESPN injuries endpoint returned historical rows (including 2020); it cannot support a general current injury feed. No all-clear or universal no-firing finding is published.
- Unretrieved policy/eligibility/transfer-window claims, hot-seat rankings, weather, streak discrepancies and timestamped odds remain unverified. The CFP format/calendar is separately verified from its official August 6 release.

## October 20 Travelpayouts and TV follow-up

- A host school's explicit game-week announcement can resolve a blank schedule-grid network when the matchup, date, time and ESPN assignment agree. Ball State's October 19 announcement now confirms ESPN+; this supersedes the earlier unresolved-TV finding without rewriting its historical evidence.
- Travelpayouts' public configuration identifies cfbapex.com, marker 775855 and project 572310. The existing account configuration is valid; only the missing exact-origin connection permission changes. Its disabled feature settings stay disabled, so this fix does not enable automatic link switching or offers.
- The single-game recheck advances that row's verification time and adds a refresh-log entry. Whole-slate, poll, result and record cutoffs keep their own dates.

## October 20 Week 8 research completion

- All 13 supplied availability items have a sourced disposition, including unresolved returns. Research completion does not establish medical clearance. Reported statuses are separate from dated official designations; no practice participation is inferred.
- Brown is reported healthy and not starting; Thomas/Raiola competition is context, not an injury. Laubstein's newer season-ending report supersedes the uncertain prognosis. Six older ledger items and October 10 official rows remain historical.
- Heisman statistics are Week 7 game totals. Selection and cases are editorial, with no weighted voting model. October 20 prices are Betfirm's named-book reports, not independent sportsbook captures; sourcing confidence remains medium.
- Upset labels are editorial risk categories, not probabilities. Only literal published underdog lines of six or more points qualify. Retrieval times are known; provider publication times are not. No betting-split claim supports a market-trap card.
- Clean Mode hides prices and uses editorial Heisman ordering. Analysis Mode is an explicit opt-in through the existing disclosure.

## October 20 official follow-up and shared feed

- Singleton's official Questionable designation applies to October 22 only; source update time and retrieval remain distinct. Other pending official statuses retain their older reporting dates.
- The public Command Center feed exposes only reviewed public facts and uses current records/poll editions even with an archived schedule, explicitly labeled. Request time does not renew freshness.
- Lovable's public homepage consumes the production release; its preview database and old poll scheduler are not production authorities. Routine weekly releases require no Lovable AI build or code republish.
- Follow-up is bounded to Week 8 through October 25, with sequential writers and checked exact-head merges. Source/connector failure preserves unknowns and the last verified release.
- Direct JSON edits receive the same official game/source validation as ingestion. Interrupted locks can be recovered only after confirming the recorded owner stopped; uncertain ownership blocks recovery.

## October 22 official publication precision

- The Big Ten public board supplies an Initial Report date, not an exact publication time. Preserve the literal date with an explicit date-only precision marker; policy update times cannot fill the gap. UTC retrieval remains a full timestamp.
- SEC's displayed October 21 7:10 p.m. Central converts to October 22 00:10 UTC. Sun Belt and Pac-12 `updatedAtUTC` values describe source updates, not newly inferred publication times.
- Available is the literal Singleton game designation, not a prognosis or a guarantee of participation. Unlisted names, unreadable reports and byes do not establish clearance. Historical ledger/report dates and unrelated research cutoffs stay unchanged.
- The hourly watcher is off. The final authorized scheduled check is October 24 at 3 a.m. Pacific; there is no unscheduled Sunday reconciliation.

2026-10-24 UTC / October 23 Pacific results refresh: Publish seven completed October 20–22 Week 8 games only after fresh ESPN/NCAA final, identity and score agreement. Preserve kickoff instants, original game IDs, quarters and overtime. Reconcile every one of 138 overall/conference records against fresh ESPN standings and the prior snapshot plus those finals. Friday in-progress games are held as non-final. Schedule, polls, leaders, injury and editorial cutoffs remain independently dated. Evidence: data/cfb-2026/refresh/evidence/2026-10-23-week8-results.json. Release through the existing serialized main workflow; no production database changes.

2026-10-24 GameDay follow-through: refresh the shared reviewed snapshot from main 156c893 with five ESPN/official-school Friday finals (Duke 19–Virginia 16, UConn 35–UMass 16, Army 38–Tulsa 35, Wyoming 28–Air Force 14, Stanford 31–NC State 28). All 138 overall/conference records reconcile; 12 of 56 Week 8 games are final and 44 remain non-final at the actual source checks. Retain NCAA pregame/null discrepancies, original IDs/kickoffs/quarters, old archive results and unrelated module dates. Native /gameday and the existing Lovable homepage read /api/gameday. Expose the reviewed season and separate previous-results verification date; render elapsed scheduled kickoffs as unconfirmed. PR52 remains untouched; zero/null/mixed statistics-week labels are covered without inferring stats week from the watch week. Dependency versions and lockfiles remain unchanged. Current audit still blocks release; companion Week 0/previous-results label code changes require a separate supported source sync/publication. See GAMEDAY_REFRESH_2026-10-24.md.
