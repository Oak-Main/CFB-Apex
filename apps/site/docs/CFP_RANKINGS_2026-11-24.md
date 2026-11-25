# CFP Selection Committee rankings, November 24, 2026

Data release. No new reader-facing sentence: the tab label is the committee's own title for its rankings, and the page heading and description are the existing ones.

## What changed

- `/rankings` offers a fourth table beside AP Top 25, AFCA Coaches Poll and the CFB Apex Composite: **CFP Selection Committee Rankings**, the committee's fourth edition of 2026, released Tuesday, November 24.
- The committee publishes rank and record only. Points and first-place votes show a dash, the two vote tiles are not drawn for this table, and "Prev." comes from the committee's November 17 edition. Missouri, Washington and Nebraska were not ranked on November 17 and show as new; Kentucky, Boise State and South Carolina left.
- Nothing else reads these rankings: the homepage lanes, team pages, GameDay and the composite stay on the AP and Coaches polls.

## Source and receipts

One official source: https://collegefootballplayoff.com/rankings. The page is rendered in the browser and refuses a plain HTTP client (212 bytes), so each receipt is a DOM capture from headless Edge (`msedge --headless=new --virtual-time-budget=15000 --dump-dom`), kept outside the repository and recorded by SHA-256 in `data/cfb-2026/cfp/selection-committee-rankings.json`.

| Edition | Captured (UTC) | SHA-256 (first 12) | Selected tab on the page |
|---|---|---|---|
| 2026-11-24 | 2026-11-25T01:20:09Z | 01c2e1764200 | Nov. 24 |
| 2026-11-17 | 2026-11-25T01:05:42Z | 486df713d953 | Nov. 17 |

The November 24 edition was not on the page at 01:05, 01:10, 01:11, 01:14 and 01:17 UTC (the selected tab was still Nov. 17) and was there at 01:20 UTC.

Checks made by `scripts/build-cfp-rankings.mjs` and `tests/cfp-rankings.test.ts`:

- 25 rows, ranks 1 to 25 in order, 25 distinct teams, each mapped to a site team slug.
- Every trend marker on the November 24 page agrees with the November 17 edition row for row (22 teams ranked in both). The page marks a team that was unranked the week before as "no change"; the previous rank therefore comes from the prior edition, not from the marker.
- All 25 records printed by the committee equal the site's verified team records (`verified-refresh.json`, Week 12 finals).

## Pipeline

`scripts/build-cfp-rankings.mjs <dom-capture.html> <retrieved-at>` writes `data/cfb-2026/cfp/selection-committee-rankings.json` (editions and receipts) and `lib/cfp-rankings.generated.ts` (what the site reads through `lib/cfp-rankings.ts`). Neither is edited by hand.

These rankings are not part of the GameDay snapshot. `verified-refresh.json`, `lib/cfb-2026.generated.ts` and the GameDay data revision are unchanged, so the deploy's GameDay freshness gate (which re-verifies results, records and the AP and Coaches editions) reports "not applicable" for this build. The committee table has its own receipt and its own tests instead; CI cannot re-fetch the official page because it needs a browser.

## Next editions

Tuesday, December 1, and Selection Day, Sunday, December 6. Capture the page, run the builder with the capture, run `npm run verify`.
