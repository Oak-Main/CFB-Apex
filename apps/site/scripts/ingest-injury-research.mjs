/**
 * Ingests the weekly injury research JSON into the vendored editorial layer.
 *
 * Usage:
 *   node scripts/ingest-injury-research.mjs [input.json] [--week N]
 *
 * Without an argument it scans data/injury-research/inbox/*.json and ingests
 * the newest valid file (by mtime). After a successful ingest it rewrites
 * data/injury-research/current.json — the build script bakes that file into
 * the deployed dataset. Every entry must reference a known team slug; every
 * likelihood must carry a confidence; anything failing validation is
 * rejected loudly rather than partially ingested.
 */
import { readdirSync, readFileSync, writeFileSync, statSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const INBOX = join(root, "data", "injury-research", "inbox");
const CURRENT = join(root, "data", "injury-research", "current.json");

const LIKELIHOODS = new Set(["likely", "questionable", "doubtful", "unlikely", "out"]);
const CONFIDENCE = new Set(["high", "medium", "low"]);
const PRACTICE = new Set(["DNP", "LP", "FP", null]);
const LEDGER_STATUS = new Set(["IR", "OUT"]);

function teamSlugs() {
  // Read the generated bundle for the canonical slug list (no TS import needed).
  const generated = readFileSync(join(root, "lib", "cfb-2026.generated.ts"), "utf8");
  const slugs = new Set();
  for (const m of generated.matchAll(/"slug":"([a-z0-9-]+)"/g)) slugs.add(m[1]);
  if (slugs.size === 0) throw new Error("could not read team slugs from lib/cfb-2026.generated.ts");
  return slugs;
}

function fail(message, entry, index) {
  throw new Error(`validation failed — ${message}${entry ? ` (ledger[${index}]: ${entry.player ?? "?"})` : ""}`);
}

function validate(doc, slugs) {
  if (!doc || typeof doc !== "object") fail("document is not an object");
  const ledger = Array.isArray(doc.ledger) ? doc.ledger : [];
  const watch = Array.isArray(doc.watch) ? doc.watch : [];
  ledger.forEach((entry, index) => {
    if (!entry.player) fail("player missing", entry, index);
    if (!slugs.has(entry.team_slug)) fail(`unknown team_slug ${entry.team_slug}`, entry, index);
    if (!LEDGER_STATUS.has(entry.status)) fail(`status must be IR or OUT, got ${entry.status}`, entry, index);
    if (entry.status === "OUT" && !(typeof entry.weeks_out === "number" && entry.weeks_out > 2)) {
      fail("OUT entries need weeks_out > 2 (week-to-week belongs in watch)", entry, index);
    }
    if (entry.confidence && !CONFIDENCE.has(entry.confidence)) fail(`bad confidence ${entry.confidence}`, entry, index);
    if (!Array.isArray(entry.sources) || entry.sources.length === 0) fail("at least one source URL required", entry, index);
  });
  watch.forEach((entry, index) => {
    if (!entry.player) fail("player missing", entry, index);
    if (entry.reported_status && !/^\d{4}-\d{2}-\d{2}$/.test(entry.source_as_of ?? "")) fail("dated reported status requires source_as_of", entry, index);
    if (!slugs.has(entry.team_slug)) fail(`unknown team_slug ${entry.team_slug}`, entry, index);
    for (const day of ["wed", "thu", "fri", "sat"]) {
      if (!PRACTICE.has(entry.practice?.[day] ?? null)) {
        fail(`practice.${day} must be DNP|LP|FP|null, got ${entry.practice?.[day]}`, entry, index);
      }
    }
    if (entry.likelihood && !LIKELIHOODS.has(entry.likelihood)) fail(`bad likelihood ${entry.likelihood}`, entry, index);
    if (!entry.confidence || !CONFIDENCE.has(entry.confidence)) fail("watch entries need a confidence", entry, index);
    // A watch row may carry only a dated note — practice designations and
    // likelihood grades stay null when nothing was verified. The page renders
    // "Not graded" rather than inventing one.
    if (!entry.likelihood && !entry.practice?.wed && !entry.practice?.thu && !entry.practice?.fri && !entry.practice?.sat && !entry.note) {
      fail("watch entries need practice status, a likelihood, or a dated note", entry, index);
    }
    const allSources = [...(entry.sources ?? []), ...(entry.social ?? [])];
    if (allSources.length === 0) fail("at least one source or verified social link required", entry, index);
  });
  const context = Array.isArray(doc.context_notes) ? doc.context_notes : [];
  for (const entry of context) {
    if (!entry.player || !entry.title || !entry.note || !slugs.has(entry.team_slug) || !/^\d{4}-\d{2}-\d{2}$/.test(entry.source_as_of ?? "") || !Array.isArray(entry.sources) || entry.sources.length === 0) fail("invalid dated quarterback context");
  }
  if (doc.official_reports != null && !Array.isArray(doc.official_reports)) fail("official_reports must be an array");
  const official = doc.official_reports ?? [];
  const seen = new Set();
  const statuses = new Set(["Available", "Out", "Doubtful", "Questionable", "Probable", "Game Time Decision", "Exempt", "Out (1st Half)", "Out for Season"]);
  for (const row of official) {
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(row.game_date ?? "") && Number.isFinite(Date.parse(row.game_date)) && new Date(row.game_date).toISOString().slice(0, 10) === row.game_date;
    const published = Date.parse(row.published_at);
    const retrieved = Date.parse(row.retrieved_at);
    if (!row.player || !slugs.has(row.team_slug) || !row.position || !row.conference || !statuses.has(row.status) || !validDate || !row.matchup || !row.report_id || !row.report_type || !Number.isFinite(published) || !Number.isFinite(retrieved) || published > retrieved || !/^https:\/\//.test(row.source_url ?? "")) fail("invalid dated official availability report");
    const key = `${row.team_slug}:${row.player}:${row.game_date}`;
    if (seen.has(key)) fail("duplicate official availability report");
    seen.add(key);
  }
  return {
    week: typeof doc.week === "number" ? doc.week : null,
    as_of: doc.as_of ?? new Date().toISOString().slice(0, 10),
    coverage_note: doc.coverage_note ?? null,
    checked_at: doc.checked_at ?? null,
    context_notes: context,
    official_reports: official,
    ledger,
    watch,
  };
}

const argFile = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : null;
const weekArg = process.argv.includes("--week") ? Number(process.argv[process.argv.indexOf("--week") + 1]) : null;

let sourcePath = argFile;
if (!sourcePath) {
  const files = readdirSync(INBOX)
    .filter((name) => name.endsWith(".json"))
    .map((name) => ({ name, mtime: statSync(join(INBOX, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (files.length === 0) {
    console.error(`No research JSON staged. Drop the weekly research export into:\n  ${INBOX}\nor pass a path: node scripts/ingest-injury-research.mjs <file.json>`);
    process.exit(1);
  }
  sourcePath = join(INBOX, files[0].name);
  console.log(`Ingesting newest inbox file: ${files[0].name}`);
}

const slugs = teamSlugs();
const raw = JSON.parse(readFileSync(sourcePath, "utf8"));
const doc = validate(weekArg ? { ...raw, week: weekArg } : raw, slugs);

if (process.argv.includes("--check")) {
  console.log(`Validated week ${doc.week}: ${doc.ledger.length} ledger, ${doc.watch.length} watch, ${doc.context_notes.length} context entries; no files written.`);
  process.exit(0);
}

writeFileSync(CURRENT, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
// Keep the source for auditability.
copyFileSync(sourcePath, join(root, "data", "injury-research", `ingested-${doc.as_of}.json`));

console.log(`Injury research staged: week ${doc.week ?? "n/a"}, as of ${doc.as_of}`);
console.log(`  ledger entries: ${doc.ledger.length} (IR or 3+ weeks out)`);
console.log(`  watch entries:  ${doc.watch.length}`);
console.log(`Wrote ${CURRENT}`);
console.log("Next: npm run build && npx wrangler deploy --config wrangler.deploy.jsonc (or let the scheduled automation handle it)");
