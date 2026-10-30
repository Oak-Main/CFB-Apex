# CFB Apex October 30 GameDay results release

This is a content release. It publishes the four Week 9 games played October 28–29, which still showed as scheduled after the October 28 cutoff. It contains no dependency, security or workflow change. The owner approves and merges; no approving review is submitted for the owner.

## Revision and production target

- Base main: `9c67fcf9606856206ae35434a7e603d08f710a74`, in a clean isolated clone.
- Production before this release: Worker `cfb-apex`, version **847cb462-c7e7-473c-9974-dc59a0167584** at 100% traffic (deployment `86c113ee-ad22-4cec-b731-c10a249f9b24`, 2026-10-30T04:00:46Z, main run 41000322673 for #56). This was confirmed read-only through the Cloudflare API for account `820e7cee61fccc60d14c8e20bc686942` at 04:13Z on October 30. The previous version was e68bf76c-9dbe-4d89-aac8-ea82bf2a5f7b.
- `reviewedProductionVersion` in `scripts/verify-production-target.mjs` advances from e68bf76c to 847cb462. The guard still refuses a newer or split deployment, and it still requires the version this deploy publishes to take 100% of traffic.
- Rollback target for this release: 847cb462-c7e7-473c-9974-dc59a0167584.

## Results

The reviewed finals all match primary sources. No score, status or overtime period differs from the review.

| Game (Eastern date) | Final | Line score | ESPN | NCAA | Official school box score |
|---|---|---|---|---|---|
| Kennesaw State at Middle Tennessee (Oct 28) | Kennesaw State 44–28 | KSU 7-12-8-17, MTSU 7-10-3-8 | Final | F 44–28 | Kennesaw State |
| Jacksonville State at New Mexico State (Oct 28) | Jacksonville State 24–0 | JSU 0-7-10-7, NMSU 0-0-0-0 | Final | F 24–0 | Jacksonville State |
| Florida Atlantic at North Texas (Oct 29) | North Texas 48–41 | FAU 10-14-7-10, UNT 3-21-17-7 | Final | FINAL_CAPTURE | FINAL_CAPTURE |
| Troy at James Madison (Oct 29) | Troy 24–21 (OT) | Troy 0-7-14-0-3, JMU 14-7-0-0-0 | Final/OT | FINAL_CAPTURE | James Madison |

Each new final needs an ESPN final, an NCAA final with the same score, and at least one official school box score with the same quarter-by-quarter line, including overtime. A school box score that disagrees stops the capture. Middle Tennessee's site has no comparable box score; New Mexico State's returned HTTP 500 during preparation.

## Records

Records are replaced from fresh ESPN standings, never incremented. As a cross-check, the eight changes equal the prior verified records plus the four results. Every value matches the official conference source used on October 28.

| Team | Before | After (conference) | Official source |
|---|---|---|---|
| Kennesaw State | 1-6 (0-3) | 2-6 (1-3) | Conference USA standings |
| Middle Tennessee | 4-3 (2-1) | 4-4 (2-2) | Conference USA standings |
| Jacksonville State | 5-2 (3-0) | 6-2 (4-0) | Conference USA standings |
| New Mexico State | 3-4 (2-1) | 3-5 (2-2) | Conference USA standings |
| North Texas | 5-2 (3-0) | 6-2 (4-0) | The American standings |
| Florida Atlantic | 5-2 (2-1) | 5-3 (2-2) | The American standings |
| Troy | 3-4 (1-2) | 4-4 (2-2) | Sun Belt season results |
| James Madison | 7-1 (4-1) | 7-2 (4-2) | Sun Belt season results |

The other 130 records are unchanged and re-read from the same official pages. Notre Dame keeps the dated October 26 Navy preview via indexed official text.

## Other reconciled facts

- **Oklahoma State at Iowa State, October 31, 7 p.m. ET: FS1 → FOX.** Iowa State's official game card reads "FOX | Radio: Cyclone Radio Network … Event Time 6:00 PM" (Central), and ESPN lists FOX. On October 26 the same card listed FS1. NCAA's TV article still listed FS1 at capture; that line is kept as the superseded observation. The kickoff time is unchanged.
- No other game completed after the October 28 cutoff. The other 49 remaining fixtures keep their reviewed date, kickoff, venue and network, matched again against ESPN, the NCAA Week 9 scoreboard and NCAA's TV article.
- NCAA national leader tables are re-read through FINAL_CAPTURE.
- The 56 Week 8 finals and two October 27 finals are verified again. The full season now has 572 completed games: 450 FBS-vs-FBS and 122 FBS-vs-FCS, across 71 provider days and nine NCAA weekly inventories.
- Polls (October 25 editions), injuries and the dated editorial modules are unchanged.

## Pipeline

- `scripts/capture-oct30-gameday.mjs` fetches every source the gate re-reads and keeps the raw bodies outside the repository. It changes `data/cfb-2026/refresh/verified-refresh.json` only through `reconcileGameDay`, and runs the deploy gate's own checks on the captured bodies before writing. A preliminary capture is marked as such, and the gate and tests refuse it.
- Evidence: `data/cfb-2026/refresh/evidence/2026-10-30-gameday-results.json` and `2026-10-30-full-season-audit.json`. The October 28 evidence files are unchanged.
- `scripts/build-dataset.mjs` regenerates `lib/cfb-2026.generated.ts`; the generated file is never edited by hand.
- `npm run gameday:source-gate` dispatches to `scripts/check-oct30-sources.mjs`. It keeps the October 28 rules: every saved receipt and every refetched response must be less than two hours old, with HTTP Date and Age checked separately. The checks live in `scripts/oct30-release-validation.mjs`.
- `verifyFullSeason` now requires the release's season totals as an argument (October 28: 568/446/122; October 30: 572/450/122). Calling it without totals fails.
- `scripts/smoke-gameday.mjs` expects six Week 9 finals and 50 upcoming games after deployment.

## Timing

Evidence cutoff: FINAL_CAPTURE. The gate refuses this evidence two hours later, so the merge to main must happen before FINAL_CAPTURE. The release must be live before the first Friday kickoff, Tulane at Charlotte at 23:00Z on October 30.

## Checks

FINAL_CAPTURE

## Rollback

Scoped to the same account and Worker. First verify the latest active version and any newer unrelated work. Then, only with the owner's specific decision:

`CLOUDFLARE_ACCOUNT_ID=820e7cee61fccc60d14c8e20bc686942 npx wrangler rollback 847cb462-c7e7-473c-9974-dc59a0167584 --config wrangler.deploy.jsonc`

Recheck the provider's active version and the served data revision afterwards. An upload alone proves nothing.
