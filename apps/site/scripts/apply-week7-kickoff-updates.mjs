/** Apply the October 11 Week 7 kickoff and network recheck offline.
 * Usage: node scripts/apply-week7-kickoff-updates.mjs [--dry-run]
 * A kickoff is adopted only when a participating school's official schedule
 * publishes it and ESPN lists the same instant; a network only when a
 * participating school publishes it and no reviewed source lists another.
 * No deploy.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const path = new URL('../data/cfb-2026/refresh/verified-refresh.json', import.meta.url);
const evidenceFile = 'data/cfb-2026/refresh/evidence/2026-10-11-week7-kickoffs.json';
const snapshot = JSON.parse(readFileSync(path, 'utf8'));
const evidence = JSON.parse(readFileSync(new URL(`../${evidenceFile}`, import.meta.url), 'utf8'));
const LOG_SCRIPT = 'scripts/apply-week7-kickoff-updates.mjs';
if ((snapshot.refresh_log ?? []).some((entry) => entry.script === LOG_SCRIPT)) {
  console.log('Week 7 kickoff and network recheck already applied; nothing to do.');
  process.exit(0);
}
const easternDate = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
const timeEt = (iso) => new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
const localTime = (iso, timeZone) => new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
const sameNetwork = (a, b) => a.toUpperCase() === b.toUpperCase();
assert.equal(snapshot.week, 7);
const week7 = snapshot.board_weeks.find((row) => row.week === 7);
assert.ok(week7);
assert.equal(evidence.updates.length, 6);

/* ------------------------------------------------------- per-game updates */
const kickoffs = [];
const networks = [];
for (const update of evidence.updates) {
  const { primary, espn } = update;
  const row = snapshot.scheduledGames.find((game) => game.provider_id === update.provider_id);
  assert.ok(row, `Missing scheduled Week 7 game ${update.provider_id}`);
  assert.equal(row.week, 7);
  assert.equal(row.away, update.away);
  assert.equal(row.home, update.home);
  assert.equal(`${row.date}-${row.away}-at-${row.home}`, update.game_id);
  // The row still holds exactly what the evidence replaces.
  for (const [key, value] of Object.entries(update.before)) assert.deepEqual(row[key], value, `${row.provider_id} ${key} before`);
  assert.ok([row.away, row.home].includes(primary.team_slug), `${row.provider_id} primary source is a participant`);
  if (update.other) assert.ok([row.away, row.home].includes(update.other.team_slug) && update.other.team_slug !== primary.team_slug);
  const kickoff = update.after.kickoff_utc ?? row.kickoff_utc;
  const tv = update.after.tv ?? row.tv;
  assert.ok(kickoff && tv);
  // Every source agrees on the instant: ESPN exactly, the school in its own time zone.
  assert.equal(espn.kickoff_utc, kickoff, `${row.provider_id} ESPN kickoff`);
  assert.equal(localTime(kickoff, primary.time_zone), primary.local_time, `${row.provider_id} school time`);
  assert.equal(easternDate(kickoff), row.date, `${row.provider_id} stays on its Eastern date`);
  // The school's network is the adopted one, and ESPN lists no other.
  assert.ok(sameNetwork(primary.network, tv), `${row.provider_id} school network`);
  assert.ok(espn.broadcasts.every((name) => sameNetwork(name, tv)), `${row.provider_id} ESPN lists no other network`);
  if ('kickoff_utc' in update.after) {
    assert.equal(update.after.time_et, timeEt(kickoff));
    assert.equal(update.after.kickoff_status, 'confirmed');
    kickoffs.push(row.provider_id);
  }
  if ('tv' in update.after) networks.push(row.provider_id);
  Object.assign(row, update.after, {
    verified_at: espn.checked_at,
    timing_note: update.timing_note,
    timing_sources: [primary.url, espn.url],
    source_urls: [...new Set([...(row.source_urls ?? []), espn.url, primary.url, ...(update.other ? [update.other.url] : [])])],
  });
}
assert.deepEqual(kickoffs.sort(), ['401858492', '401862803', '401871091']);
assert.deepEqual(networks.sort(), ['401856723', '401856724', '401858490', '401858492']);

/* -------------------------------------------- the whole Week 7 slate after */
const slate = snapshot.scheduledGames.filter((game) => game.week === 7);
assert.equal(slate.length, 59);
for (const game of slate) {
  assert.ok(game.kickoff_utc && game.time_et && game.kickoff_status === 'confirmed', `${game.provider_id} kickoff published`);
  assert.ok(game.tv && !/ or /.test(game.tv), `${game.provider_id} single network published`);
}

/* ---------------------------------------------------- dates, holds, story */
snapshot.schedule_verified_at = evidence.checked_at;
week7.schedule_verified_at = evidence.checked_at;
week7.note = '59 FBS-vs-FBS games from the reviewed release. October 11 recheck: every kickoff and network is published; nothing is filled with placeholders.';
const tbaHold = snapshot.holds.findIndex((hold) => hold.startsWith('Week 7 official kickoff TBAs'));
assert.ok(tbaHold >= 0);
snapshot.holds[tbaHold] = 'Week 7 kickoffs and networks rechecked October 11: all 59 games have a published kickoff and network. Charlotte–Temple, Louisiana Tech–ULM and Nebraska–Oregon kickoffs and the Penn State–Michigan, Florida–Texas and Alabama–Tennessee networks come from a participating school\'s official schedule; ESPN agrees wherever it lists them, and the other school\'s TBA at review is recorded, not filled.';
const story = snapshot.storylines.find((row) => row.id === 'week7-schedule-notes');
assert.ok(story);
const tbaSentence = 'Kickoffs for Charlotte–Temple, Louisiana Tech–ULM and Nebraska–Oregon are still officially TBA.';
assert.ok(story.body.endsWith(tbaSentence));
story.body = `${story.body.slice(0, -tbaSentence.length)}Penn State at Michigan is 3:30 PM ET on CBS, and Nebraska at Oregon kicks off at 11 PM ET (8 PM PT) on FOX.`;
story.sources = [...new Set([...story.sources, 'https://mgoblue.com/sports/football/schedule/2026', 'https://huskers.com/sports/football/schedule'])];
snapshot.source_urls = [...new Set([...snapshot.source_urls, ...evidence.updates.flatMap((u) => [u.espn.url, u.primary.url, ...(u.other ? [u.other.url] : [])])])];
snapshot.refresh_log = [...(snapshot.refresh_log ?? []), {
  applied_at: evidence.checked_at, script: LOG_SCRIPT, evidence: evidenceFile, scope: evidence.scope,
  kickoffs_adopted: kickoffs, networks_adopted: networks, week7_official_tbd: [],
  untouched_cutoffs: { week7_retrieved_at: snapshot.retrieved_at, results_verified_at: snapshot.results_verified_at, polls_released: snapshot.polls.map((p) => `${p.poll} ${p.release_date}`) },
}];
if (!process.argv.includes('--dry-run')) writeFileSync(path, `${JSON.stringify(snapshot, null, 1)}\n`);
console.log(`Adopted ${kickoffs.length} Week 7 kickoffs and ${networks.length} networks; all 59 games published. No deploy performed.`);
