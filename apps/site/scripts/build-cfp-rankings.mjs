// CFP Selection Committee rankings builder.
//
// The committee's rankings have one official source: the rankings page of
// collegefootballplayoff.com. That page is rendered in the browser, so the
// receipt is a DOM capture taken with a headless browser:
//
//   msedge --headless=new --virtual-time-budget=15000 --dump-dom \
//     https://collegefootballplayoff.com/rankings > <scratch>/rankings.html
//
// Usage: node scripts/build-cfp-rankings.mjs <dom-capture.html> <retrieved-at-iso>
//
// Reads the edition the capture shows (its selected date tab), maps every team
// to the site's team slug, and writes:
//   data/cfb-2026/cfp/selection-committee-rankings.json  (editions + receipts)
//   lib/cfp-rankings.generated.ts                        (what the site reads)
// Neither file is edited by hand. These rankings are not part of the GameDay
// snapshot (verified-refresh.json) and do not change its data revision.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const SOURCE_URL = "https://collegefootballplayoff.com/rankings";
const SEASON = 2026;
const DATA_URL = new URL("../data/cfb-2026/cfp/selection-committee-rankings.json", import.meta.url);
const GENERATED_URL = new URL("../lib/cfp-rankings.generated.ts", import.meta.url);

// The committee's display names that differ from the site's slugs.
const ALIASES = new Map([
  ["Miami", "miami-fl"],
  ["Miami (FL)", "miami-fl"],
  ["Miami (OH)", "miami-oh"],
  ["Southern California", "usc"],
  ["Southern Cal", "usc"],
  ["Mississippi", "ole-miss"],
  ["Pitt", "pittsburgh"],
  ["Texas A&M", "texas-am"],
]);
const slugify = name => name.toLowerCase().replace(/&/g, "").replace(/[().']/g, "").trim().replace(/\s+/g, "-");
const decodeEntities = text => text.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
const MONTHS = { "Nov.": "11", "Dec.": "12" };

export function parseCapture(html) {
  const label = html.match(/<button[^>]*aria-pressed="true"[^>]*>([^<]+)<\/button>/)?.[1]?.trim();
  assert.ok(label && /^(Nov|Dec)\. \d{1,2}$/.test(label), `selected edition tab not found (${label})`);
  const [month, day] = label.split(" ");
  const release_date = `${SEASON}-${MONTHS[month]}-${day.padStart(2, "0")}`;
  const start = html.indexOf("Full Rankings");
  assert.ok(start > 0, "Full Rankings section not found");
  const end = html.indexOf("Related News", start);
  const section = html.slice(start, end > 0 ? end : undefined);
  const rows = [...section.matchAll(/text-center">(\d+)<\/span>[\s\S]*?alt="([^"]+)"[\s\S]*?font-bold">(\d+-\d+)<\/span>[\s\S]*?aria-label="Trend: ([^"]+)"/g)]
    .map(match => ({ rank: Number(match[1]), team: decodeEntities(match[2]), record: match[3], trend: match[4] }));
  return { label, release_date, rows };
}

export function buildEdition(parsed, knownSlugs) {
  assert.equal(parsed.rows.length, 25, "the committee ranks 25 teams");
  parsed.rows.forEach((row, index) => { assert.equal(row.rank, index + 1, `rank order at row ${index + 1}`); });
  const rankings = parsed.rows.map(row => {
    const team_slug = ALIASES.get(row.team) ?? slugify(row.team);
    assert.ok(knownSlugs.has(team_slug), `no site team for "${row.team}" (${team_slug})`);
    const trend = row.trend.match(/^(no change|up (\d+)|down (\d+)|new)/i);
    assert.ok(trend, `unreadable trend "${row.trend}" for ${row.team}`);
    return { rank: row.rank, team: row.team, team_slug, record: row.record, source_trend: row.trend };
  });
  assert.equal(new Set(rankings.map(row => row.team_slug)).size, 25, "25 distinct teams");
  return { release_date: parsed.release_date, source_label: parsed.label, rankings };
}

// The previous rank the source's own trend marker implies. The source marks a
// team that was unranked the week before as "no change", so the marker alone
// cannot tell a new entry from a held rank: previousRank() settles it from the
// prior edition whenever that edition is on file.
export function impliedPreviousRank(row) {
  if (/^no change/i.test(row.source_trend)) return row.rank;
  const up = row.source_trend.match(/^up (\d+)/i);
  if (up) return row.rank + Number(up[1]);
  const down = row.source_trend.match(/^down (\d+)/i);
  if (down) return row.rank - Number(down[1]);
  return null;
}

// Previous rank of a row: from the prior edition when it is on file (null when
// the team was not ranked in it), else from the source's trend marker.
export function previousRank(row, previousEdition) {
  if (!previousEdition) return impliedPreviousRank(row);
  return previousEdition.rankings.find(entry => entry.team_slug === row.team_slug)?.rank ?? null;
}

// The source's trend markers must agree with the prior edition row for row. A
// team absent from the prior edition carries the source's "no change" marker.
export function checkTrends(current, previous) {
  for (const row of current.rankings) {
    const before = previousRank(row, previous);
    if (before == null) assert.match(row.source_trend, /^(no change|new)/i, `${current.release_date} marker for new entry ${row.team}`);
    else assert.equal(impliedPreviousRank(row), before, `${current.release_date} trend for ${row.team} against the ${previous.release_date} edition`);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/").split("/").pop())) {
  const [capturePath, retrievedAt] = process.argv.slice(2);
  assert.ok(capturePath && retrievedAt && !Number.isNaN(Date.parse(retrievedAt)), "Usage: build-cfp-rankings.mjs <dom-capture.html> <retrieved-at-iso>");
  assert.ok(!capturePath.replaceAll("\\", "/").includes("/CFB-Apex/"), "Keep the capture outside the repository");
  const raw = readFileSync(capturePath);
  const parsed = parseCapture(raw.toString("utf8"));
  const snapshot = JSON.parse(readFileSync(new URL("../data/cfb-2026/refresh/verified-refresh.json", import.meta.url), "utf8"));
  const edition = buildEdition(parsed, new Set(Object.keys(snapshot.teamRecords)));
  edition.receipt = {
    url: SOURCE_URL,
    method: "headless browser DOM capture (msedge --headless=new --dump-dom)",
    retrieved_at: new Date(retrievedAt).toISOString(),
    sha256: createHash("sha256").update(raw).digest("hex"),
    bytes: raw.length,
  };
  const doc = existsSync(DATA_URL)
    ? JSON.parse(readFileSync(DATA_URL, "utf8"))
    : { schema_version: 1, name: "CFP Selection Committee Rankings", season: SEASON, source: SOURCE_URL, editions: [] };
  doc.editions = [...doc.editions.filter(row => row.release_date !== edition.release_date), edition]
    .sort((a, b) => b.release_date.localeCompare(a.release_date));
  doc.editions.forEach((current, index) => {
    if (doc.editions[index + 1]) checkTrends(current, doc.editions[index + 1]);
  });
  mkdirSync(new URL(".", DATA_URL), { recursive: true });
  writeFileSync(DATA_URL, `${JSON.stringify(doc, null, 1)}\n`);
  const latest = doc.editions[0];
  const site = {
    name: doc.name,
    source: doc.source,
    release_date: latest.release_date,
    retrieved_at: latest.receipt.retrieved_at,
    rankings: latest.rankings.map(row => ({ rank: row.rank, team: row.team, team_slug: row.team_slug, record: row.record, previous_rank: previousRank(row, doc.editions[1]) })),
  };
  writeFileSync(GENERATED_URL, `// Generated by scripts/build-cfp-rankings.mjs from data/cfb-2026/cfp/selection-committee-rankings.json. Do not edit by hand.\nexport default ${JSON.stringify(site)};\n`);
  console.log(`CFP rankings ${latest.release_date}: ${latest.rankings.length} teams, No. 1 ${latest.rankings[0].team}; editions on file: ${doc.editions.map(row => row.release_date).join(", ")}`);
}
