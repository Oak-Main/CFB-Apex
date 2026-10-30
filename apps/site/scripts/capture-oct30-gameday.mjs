/** Capture and apply the October 30 GameDay results release.
 *   node scripts/capture-oct30-gameday.mjs <body-dir> [--apply] [--preliminary]
 * Runs on the October 28 snapshot: restore verified-refresh.json from main
 * before a recapture. Fetches every source the deploy gate re-reads, keeps raw
 * bodies in <body-dir> outside the repository, and changes the snapshot only
 * through reconcileGameDay. Records are replaced from fresh standings and
 * corroborated by official pages; the results are a cross-check, never an
 * increment. Without --preliminary nothing is written unless the deploy gate's
 * own checks pass on the captured bodies. --preliminary writes evidence that
 * the gate refuses. No deployment.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { htmlTables, ncaaInventory } from "./gameday-source-validation.mjs";
import { reconcileGameDay } from "./reconcile-gameday.mjs";
import { OCT30_NEW_FINALS, OCT30_SCRIPT, boxScoreRows, primaryRecordFailures, standingsRecords, throughGamesDate, verifyOct30Release } from "./oct30-release-validation.mjs";

const [bodyDir, ...flags] = process.argv.slice(2);
assert.ok(bodyDir, "Usage: node scripts/capture-oct30-gameday.mjs <body-dir> [--apply] [--preliminary]");
const apply = flags.includes("--apply"), preliminary = flags.includes("--preliminary");
mkdirSync(bodyDir, { recursive: true });
const file = path => new URL(`../${path}`, import.meta.url);
const read = path => JSON.parse(readFileSync(file(path), "utf8"));
const snapshotPath = "data/cfb-2026/refresh/verified-refresh.json";
const evidencePath = "data/cfb-2026/refresh/evidence/2026-10-30-gameday-results.json";
const auditPath = "data/cfb-2026/refresh/evidence/2026-10-30-full-season-audit.json";
const snapshot = read(snapshotPath);
assert.equal(snapshot.refresh_log.at(-1).script, "weekly-refresh-2026-10-28", "Capture on the October 28 snapshot; restore it from main before a recapture");
const previous = read(snapshot.refresh_log.at(-1).evidence), previousAudit = read(snapshot.full_season_review.evidence);
assert.deepEqual(previous.records, snapshot.teamRecords);
const prior = read("data/cfb-2026/refresh/evidence/2026-10-25-week9-preparation.json");
const original = read("data/cfb-2026/refresh/evidence/2026-10-20-week8-release.json");
const ids = new Map(original.conferences.flatMap(c => c.rows).map(r => [r.id, r.slug]));
const etDate = iso => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const monthDay = date => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric" }).format(new Date(`${date}T12:00:00Z`));

// Official athletics sites for both schools in each new final, with the
// opponent slug each site uses. Middle Tennessee's site has no Sidearm box
// score. A box score counts only once posted; a posted line that differs stops.
const SCHOOLS = {
  "401871058": [["https://ksuowls.com", ["middle-tennessee"]]],
  "401871057": [["https://jaxstatesports.com", ["nm-state", "new-mexico-state"]], ["https://nmstatesports.com", ["jax-state", "jacksonville-state"]]],
  "401862812": [["https://meangreensports.com", ["florida-atlantic", "fau"]], ["https://fausports.com", ["north-texas", "unt"]]],
  "401869963": [["https://jmusports.com", ["troy"]], ["https://troytrojans.com", ["james-madison", "jmu"]]],
};

// Network moves published after October 28 on the host school's official game
// card. ESPN must list the same network; the older NCAA article line is kept as
// the superseded observation.
const TV_UPDATES = {
  "401856847": { school: "Iowa State", source_id: "tv-school-iowa-state", url: "https://cyclones.com/sports/football/schedule/2026", opponent: "Oklahoma State", tv: "Fox", official: "FOX", observed_text: "FOX | Radio: Cyclone Radio Network", time: "6:00 PM", time_zone: "America/Chicago" },
};

const pending = [], docs = new Map();
async function capture([id, url]) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const body = await response.text(), checkedAt = new Date().toISOString();
  writeFileSync(join(bodyDir, `${id}.body`), body);
  docs.set(id, body);
  const header = name => response.headers.get(name);
  return { id, url, resolvedUrl: response.url, status: response.status, checkedAt, serverDate: header("date"), age: header("age"), sha256: createHash("sha256").update(body).digest("hex"), bytes: Buffer.byteLength(body), headers: Object.fromEntries(["date", "last-modified", "age", "cache-control", "content-type", "etag"].filter(name => header(name)).map(name => [name, header(name)])) };
}
async function captureAll(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i += 6) out.push(...await Promise.all(rows.slice(i, i + 6).map(capture)));
  return out;
}

const schoolSources = [];
for (const [providerId, schools] of Object.entries(SCHOOLS)) for (const [host, opponents] of schools) {
  try {
    const response = await fetch(`${host}/sports/football/schedule/2026`, { signal: AbortSignal.timeout(30_000) });
    const html = await response.text();
    const paths = [...new Set([...html.matchAll(/href="(\/sports\/football\/stats\/2026\/([^/"]+)\/boxscore\/\d+)"/g)].filter(m => opponents.includes(m[2])).map(m => m[1]))];
    if (paths.length === 1) schoolSources.push({ providerId, id: `final-${new URL(host).hostname.split(".")[0]}`, url: `${host}${paths[0]}` });
    else pending.push(`${host}: ${paths.length} box score links for ${providerId}`);
  } catch (error) { pending.push(`${host}: ${error.message}`); }
}
const captured = await captureAll([...previous.raw_sources.map(r => [r.id, r.url]), ...Object.values(TV_UPDATES).map(u => [u.source_id, u.url]), ...schoolSources.map(s => [s.id, s.url])]);
const auditSources = await captureAll(previousAudit.raw_sources.map(r => [r.id, r.url]));
for (const row of [...captured, ...auditSources]) if (row.status !== 200 && !row.id.startsWith("final-")) throw new Error(`${row.id}: HTTP ${row.status}; recapture`);
const cutoff = new Date(Math.max(...[...captured, ...auditSources].map(r => Date.parse(r.checkedAt)))).toISOString();

const events = Array.from({ length: 12 }, (_, i) => i + 20).flatMap(day => JSON.parse(docs.get(`day-${day}`)).events);
assert.equal(events.length, 112, "New or omitted FBS game requires reconciliation");
assert.deepEqual(new Set(events.filter(e => e.competitions[0].status.type.completed).map(e => e.id)), new Set([...previous.finals.map(r => r.provider_id), ...OCT30_NEW_FINALS]), "Completed games changed beyond the four reviewed finals; reconcile before capture");
const ncaa9 = ncaaInventory(docs.get("ncaa9"), 2026, 9);

const played = [], auditRows = [], corroboration = [], usedSchoolIds = new Set();
for (const providerId of OCT30_NEW_FINALS) {
  const event = events.find(e => e.id === providerId), c = event.competitions[0], status = structuredClone(c.status.type);
  const scheduled = snapshot.scheduledGames.find(r => r.provider_id === providerId);
  const contest = ncaa9.find(n => n.contestId === prior.schoolEvidence.find(s => s.id === providerId).ncaa.contestId);
  const home = c.competitors.find(t => t.homeAway === "home"), away = c.competitors.find(t => t.homeAway === "away");
  const homeSlug = ids.get(home.team.id), awaySlug = ids.get(away.team.id), date = etDate(event.date);
  assert.equal(homeSlug, scheduled.home); assert.equal(awaySlug, scheduled.away); assert.equal(date, scheduled.date);
  assert.equal(c.venue?.fullName, scheduled.site); assert.equal(c.neutralSite === true, scheduled.neutral_site);
  assert.ok(c.broadcasts.flatMap(b => b.names).includes(scheduled.tv));
  assert.equal(Date.parse(event.date), Date.parse(scheduled.kickoff_utc));
  assert.equal(status.completed, true); assert.equal(status.state, "post");
  const lines = Object.fromEntries([home, away].map(t => [ids.get(t.team.id), t.linescores.map(q => q.value)]));
  for (const t of [home, away]) assert.equal(lines[ids.get(t.team.id)].reduce((a, b) => a + b, 0), Number(t.score));
  assert.equal(c.status.period, lines[homeSlug].length);
  assert.notEqual(Number(home.score), Number(away.score));
  const gameId = `${date}-${awaySlug}-at-${homeSlug}`, ncaaUrl = `https://www.ncaa.com${contest.url}`;
  if (contest.gameState === "F") for (const [isHome, t] of [[true, home], [false, away]]) assert.equal(contest.teams.find(x => x.isHome === isHome).score, Number(t.score), `NCAA score differs ${gameId}`);
  else pending.push(`NCAA ${contest.contestId} ${gameId}: gameState ${contest.gameState}`);
  const schoolUrls = [];
  for (const source of schoolSources.filter(s => s.providerId === providerId)) {
    const row = captured.find(r => r.id === source.id);
    if (row.status !== 200) { pending.push(`${source.id}: HTTP ${row.status}`); continue; }
    let rows;
    try { rows = boxScoreRows(docs.get(source.id)); } catch (error) { pending.push(`${source.id}: ${error.message}`); continue; }
    const homeRow = rows.find(r => isDeepStrictEqual(r.values, [...lines[homeSlug], Number(home.score)]));
    const awayRow = rows.find(r => isDeepStrictEqual(r.values, [...lines[awaySlug], Number(away.score)]));
    assert.ok(homeRow && awayRow && homeRow !== awayRow, `Official box score disagrees with ESPN: ${source.url} ${JSON.stringify(rows)}`);
    corroboration.push({ provider_id: providerId, game_id: gameId, source_id: source.id, url: source.url, home_label: homeRow.label, away_label: awayRow.label, home_line: homeRow.values, away_line: awayRow.values });
    schoolUrls.push(source.url); usedSchoolIds.add(source.id);
  }
  if (!schoolUrls.length) pending.push(`${gameId}: no official school box score yet`);
  const listed = { espn: event.date, ncaa: new Date(contest.startTimeEpoch * 1000).toISOString(), actual_start: null };
  played.push({
    provider_id: providerId, source_url: scheduled.source_url, game_id: gameId, date, kickoff_utc: event.date, week: 9,
    home_slug: homeSlug, away_slug: awaySlug, site: scheduled.site, tv: scheduled.tv, neutral_site: scheduled.neutral_site, verified_at: cutoff, title: status.detail,
    teams: [home, away].map(t => ({ slug: ids.get(t.team.id), points: Number(t.score), name: t.team.displayName })),
    meta: {
      as_of: date, sources: [scheduled.source_url, ncaaUrl, ...schoolUrls], conference_game: c.conferenceCompetition === true, line_score: lines,
      reviewed_status: { espn: status, ncaa: contest.gameState }, listed_kickoff_observations: listed,
      full_season_review: { checked_at: cutoff, provider_id: providerId, ncaa_contest_id: contest.contestId, source_urls: [scheduled.source_url, ncaaUrl], line_score: lines, state: status, ncaa_status: contest.gameState, listed_kickoff_observations: listed },
    },
  });
  auditRows.push({
    provider_id: providerId, date, week: 9, home_slug: homeSlug, away_slug: awaySlug, home_name: home.team.location, away_name: away.team.location,
    home_conference_id: home.team.conferenceId, away_conference_id: away.team.conferenceId, home_score: Number(home.score), away_score: Number(away.score),
    state: status, period: c.status.period, line_score: lines, kickoff_utc: event.date, neutral_site: scheduled.neutral_site, site: scheduled.site, tv: scheduled.tv,
    ncaa_contest_id: contest.contestId, ncaa_url: ncaaUrl, ncaa_listed_kickoff_utc: listed.ncaa, ncaa_status: contest.gameState, ncaa_teams: structuredClone(contest.teams),
    source_url: scheduled.source_url, existing_game_id: gameId,
  });
}

// Records come from fresh standings. Cross-check only: the four reviewed
// results move exactly the eight participants from the prior verified records.
const { records, conferenceRecords } = standingsRecords(docs.get("espn-standings"), ids);
const expectedRecords = structuredClone(previous.records), expectedConference = structuredClone(previous.conferenceRecords);
const bump = (record, win) => { const [w, l] = record.split("-").map(Number); return `${w + win}-${l + 1 - win}`; };
for (const row of played) for (const team of row.teams) {
  const win = Number(team.points > row.teams.find(o => o.slug !== team.slug).points);
  expectedRecords[team.slug] = bump(expectedRecords[team.slug], win);
  if (row.meta.conference_game) expectedConference[team.slug] = bump(expectedConference[team.slug], win);
}
assert.deepEqual(records, expectedRecords, "Standings differ from the prior verified records plus the four reviewed results");
assert.deepEqual(conferenceRecords, expectedConference, "Conference standings differ from the prior verified records plus the four reviewed results");
const primaryRecords = previous.primaryRecords.map(r => ({ ...r, overall: records[r.slug], conference: conferenceRecords[r.slug] }));
for (const failure of primaryRecordFailures(primaryRecords, docs, events, ids)) pending.push(`official record ${failure.slug} (${failure.source_id}): ${failure.message}`);
const recordChanges = Object.keys(records).filter(slug => records[slug] !== previous.records[slug] || conferenceRecords[slug] !== previous.conferenceRecords[slug])
  .map(slug => ({ slug, before: { overall: previous.records[slug], conference: previous.conferenceRecords[slug] }, after: { overall: records[slug], conference: conferenceRecords[slug] }, official_source: primaryRecords.find(r => r.slug === slug).source_id }));
assert.equal(recordChanges.length, 8);

const schedule = previous.schedule.filter(r => !OCT30_NEW_FINALS.includes(r.provider_id)).map(row => structuredClone(row));
const scheduled = snapshot.scheduledGames.filter(r => !OCT30_NEW_FINALS.includes(r.provider_id)).map(row => structuredClone(row));
const tvChanges = [];
for (const [providerId, update] of Object.entries(TV_UPDATES)) {
  const row = schedule.find(r => r.provider_id === providerId), saved = scheduled.find(r => r.provider_id === providerId);
  const event = events.find(e => e.id === providerId), source = captured.find(r => r.id === update.source_id);
  assert.ok(event.competitions[0].broadcasts.flatMap(b => b.names).includes(update.tv), `ESPN does not list ${update.tv} for ${providerId}`);
  const official_tv = { away: row.away, home: row.home, source_id: update.source_id, source_url: update.url, opponent: update.opponent, time: update.time, time_zone: update.time_zone, tv: update.official, observed_text: update.observed_text, checked_at: source.checkedAt, superseded: row.official_tv };
  tvChanges.push({ provider_id: providerId, game_id: `${row.date}-${row.away}-at-${row.home}`, before: row.tv, after: update.tv, official_source: update.url, superseded_ncaa_text: row.official_tv.observed_text });
  Object.assign(row, { tv: update.tv, official_tv, verified_at: source.checkedAt });
  Object.assign(saved, {
    tv: update.tv, verified_at: source.checkedAt, source_urls: [...new Set([...saved.source_urls, update.url])],
    timing_note: `NCAA Week 9 schedule and ESPN agree on the listed time. Network moved from ${row.official_tv.superseded.tv} to ${update.official} on ${update.school}'s official schedule and ESPN; NCAA's TV article still listed ${row.official_tv.superseded.tv} when checked. Listed schedule time, not actual start.`,
  });
}

const metricSources = ["stat-passing", "stat-rushing", "stat-scoring", "stat-defense"], columns = ["Pass Yds", "Rush Yds", "PPG", "Avg"];
const categories = snapshot.metrics.categories.map((category, i) => {
  const id = metricSources[i], html = docs.get(id), table = htmlTables(html)[0], header = table[0], source = captured.find(r => r.id === id);
  assert.equal(category.source_url, source.url);
  return { ...category, through_games: throughGamesDate(html), verified_at: source.checkedAt, rows: table.slice(1, 6).map(s => ({ name: s[header.indexOf("Name")] ?? s[header.indexOf("Team")], team: s[header.indexOf("Team")], value: Number(s[header.indexOf(columns[i])]) })) };
});
const through = [...new Set(categories.map(c => c.through_games))];
assert.equal(through.length, 1, "NCAA statistics tables have different cutoffs");
const metrics = { ...snapshot.metrics, through_games: through[0], verified_at: categories.map(c => c.verified_at).sort().at(-1), categories };

const next = reconcileGameDay(snapshot, { finals: played, scheduled, scheduleWeeks: [9], records, conferenceRecords, observedAt: cutoff });
Object.assign(next, {
  requested_cutoff: cutoff, retrieved_at: cutoff, results_verified_at: cutoff, schedule_verified_at: cutoff, records_verified_at: cutoff, metrics,
  baseline_note: "Week 9 partial completion: six finals (October 27–29) and 50 upcoming fixtures. Week 8 retains 56 verified finals. Source facts, historical editorial modules and unavailable projections keep separate dates.",
});
const replaceHold = (prefix, text) => { const i = next.holds.findIndex(h => h.startsWith(prefix)); assert.ok(i >= 0, prefix); next.holds[i] = text; };
replaceHold("National leader cards use NCAA tables through", `National leader cards use NCAA tables through ${monthDay(metrics.through_games)}; detailed team/player season tables remain the September 5 sample. A complete current statistical warehouse is unavailable.`);
replaceHold("No continuous live scoring feed is asserted.", "No continuous live scoring feed is asserted. Week 8 has 56 finals; Week 9 has six finals and 50 upcoming games at the October 30 cutoff.");
next.source_urls = [...new Set([...next.source_urls, ...played.flatMap(r => r.meta.sources), ...Object.values(TV_UPDATES).map(u => u.url)])];
next.team_records_review = { ...next.team_records_review, as_of: cutoff, verified: 138, note: "All 138 overall and conference records matched current ESPN standings. 137 corroborated with directly retrieved official conference/team pages, including the eight records changed by the October 28–29 finals; Notre Dame 6-1 corroborated with Navy’s October 26 official preview via indexed text. The stale Notre Dame home-page record is not used. Full totals include FCS opponents; never derived from the filtered board." };
Object.assign(next.board_weeks.find(w => w.week === 8), { records_verified_at: cutoff, results_verified_at: cutoff });
Object.assign(next.board_weeks.find(w => w.week === 9), { schedule_verified_at: cutoff, records_verified_at: cutoff, retrieved_at: cutoff, results_verified_at: cutoff, note: "Six verified finals (October 27–29); 50 upcoming fixtures. All kickoff times and TV corroborated with official NCAA schedule; dates use Eastern calendar. No live-score inference." });
next.refresh_log.push({ script: OCT30_SCRIPT, applied_at: new Date().toISOString(), evidence_checked_at: cutoff, evidence: evidencePath, scope: "Four October 28–29 Week 9 finals, 50 remaining fixtures, 138 primary-source whole-team records (eight changed) and NCAA national leaders; Week 8 and October 27 finals revalidated. Other module source dates are preserved.", finals: played.map(r => r.game_id), records_checked: 138 });
next.full_season_review = { checked_at: cutoff, through_games: cutoff, completed: 572, fbs_finals: 450, fcs_finals: 122, evidence: auditPath, note: "All nine NCAA weekly inventories and 71 provider calendar days reconciled again at the October 30 cutoff, including the four October 28–29 finals. Full-team totals reproduce all 138 independently verified records. The 17 September rows restored on October 28 and both duplicate aliases are retained." };

const audit = {
  ...previousAudit,
  scope: "Every completed 2026 game involving a current FBS member through the October 30 release cutoff, including FCS opponents. Week 9 upcoming inventory is in the separate current release evidence.",
  data_cutoff_utc: cutoff, verification_completed_at: cutoff, previous_audit: snapshot.full_season_review.evidence, additions_verified_at: previousAudit.verification_completed_at,
  counts: { ...previousAudit.counts, completed: 572, upcoming: 50, fbs_finals: 450 }, raw_sources: auditSources,
  finals: [...previousAudit.finals, ...auditRows], new_finals: played.map(r => r.game_id),
};
const evidence = {
  schema_version: 1,
  scope: "Four Week 9 finals from October 28–29 (Kennesaw State at Middle Tennessee, Jacksonville State at New Mexico State, Florida Atlantic at North Texas, Troy at James Madison), revalidation of 56 Week 8 and two October 27 finals, 50 remaining fixtures, 138 whole-team records and NCAA national leaders. Other modules keep their independent dates.",
  cutoff_utc: cutoff,
  previous_release: { evidence: snapshot.refresh_log.at(-1).evidence, cutoff_utc: previous.cutoff_utc },
  inventories: { 8: { expected: 56, finals: 56 }, 9: { expected: 56, finals: 6, upcoming: 50 } },
  records, conferenceRecords, primaryRecords, record_changes: recordChanges,
  new_finals: [...OCT30_NEW_FINALS], school_corroboration: corroboration,
  finals: [...previous.finals, ...played], schedule, tv_changes: tvChanges, metrics,
  raw_sources: captured.filter(r => !r.id.startsWith("final-") || r.id === "final-wku" || r.id === "final-missouristate" || usedSchoolIds.has(r.id)),
  bye_status: previous.bye_status, byes: previous.byes,
  counts: { week8Finals: 56, week9Fixtures: 56, week9Finals: 6, week9Upcoming: 50, kickoffTBAorDisputed: previous.counts.kickoffTBAorDisputed, tvPending: previous.counts.tvPending, records: 138, recordChanges: 8, schoolBoxScores: corroboration.length, tvChanges: tvChanges.length },
  primary_records_note: "137 directly retrieved official records re-read at this cutoff. The eight changed records come from the official Conference USA standings (Kennesaw State, Middle Tennessee, Jacksonville State, New Mexico State), The American standings (North Texas, Florida Atlantic) and the Sun Belt season results (Troy, James Madison). Notre Dame keeps the dated October 26 Navy preview via indexed official text; that observation is not counted as fresh raw HTTP evidence.",
  broadcast_evidence: previous.broadcast_evidence,
};

let acceptance = null;
try { acceptance = verifyOct30Release(next, evidence, audit, docs); }
catch (error) { pending.push(`deploy gate: ${error.message}`); }
const report = { cutoff, mode: preliminary ? "preliminary" : "final", apply, pending, acceptance, newFinals: played.map(r => ({ game_id: r.game_id, title: r.title, score: r.teams.map(t => `${t.slug} ${t.points}`).join(", "), ncaa: r.meta.reviewed_status.ncaa, schoolBoxScores: r.meta.sources.slice(2) })), recordChanges, tvChanges, metricsThrough: metrics.through_games };
if (pending.length && !preliminary) { console.log(JSON.stringify(report, null, 2)); throw new Error("Capture incomplete; nothing written"); }
if (preliminary) Object.assign(evidence, { preliminary: true, pending });
if (apply) {
  const json = value => `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(file(snapshotPath), json(next));
  writeFileSync(file(evidencePath), json(evidence));
  writeFileSync(file(auditPath), json(audit));
}
console.log(JSON.stringify(report, null, 2));
