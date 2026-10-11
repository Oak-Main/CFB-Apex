/** Apply the October 11 afternoon Week 7 kickoff and network recheck offline.
 * Usage: node scripts/apply-week7-kickoff-updates.mjs [--dry-run]
 * Runs after scripts/apply-oct11-school-recheck.mjs and uses its rule: the
 * host school settles its own home game; a visiting school's listing counts
 * only when ESPN shows the same value with a valid time. School sources must
 * come from official-school-hosts.json. Scores, records, polls and board
 * stamps are not touched. No deploy.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const path = new URL('../data/cfb-2026/refresh/verified-refresh.json', import.meta.url);
const evidenceFile = 'data/cfb-2026/refresh/evidence/2026-10-11-week7-kickoffs.json';
const snapshot = JSON.parse(readFileSync(path, 'utf8'));
const evidence = JSON.parse(readFileSync(new URL(`../${evidenceFile}`, import.meta.url), 'utf8'));
const { hosts: officialHosts } = JSON.parse(readFileSync(new URL('../data/cfb-2026/refresh/official-school-hosts.json', import.meta.url), 'utf8'));
const LOG_SCRIPT = 'scripts/apply-week7-kickoff-updates.mjs';
if ((snapshot.refresh_log ?? []).some((entry) => entry.script === LOG_SCRIPT)) {
  console.log('Week 7 afternoon kickoff and network recheck already applied; nothing to do.');
  process.exit(0);
}
const assertOfficial = (slug, url) => assert.equal(new URL(url).hostname, officialHosts[slug], `${url} is ${slug}'s official site`);
const easternDate = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
const timeEt = (iso) => new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
const localTime = (iso, timeZone) => new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
const sameNetwork = (a, b) => a.toUpperCase() === b.toUpperCase();
assert.equal(snapshot.week, 7);
assert.ok(snapshot.refresh_log.some((entry) => entry.script === 'scripts/apply-oct11-school-recheck.mjs'), 'morning recheck applied first');
const week7 = snapshot.board_weeks.find((row) => row.week === 7);
assert.ok(week7);
const untouched = JSON.stringify({
  polls: snapshot.polls, retrieved_at: snapshot.retrieved_at, schedule_verified_at: snapshot.schedule_verified_at,
  results_verified_at: snapshot.results_verified_at, teamRecords: snapshot.teamRecords, playedGames: snapshot.playedGames,
  stamps: snapshot.board_weeks.map(({ note, ...rest }) => rest),
});
const rowFor = (id) => {
  const row = snapshot.scheduledGames.find((game) => game.provider_id === id);
  assert.ok(row && row.week === 7, `${id} on the Week 7 board`);
  return row;
};
// The school's time, read in its own zone, and ESPN's valid instant are the same.
const checkTime = (row, kickoff, school, scoreboard) => {
  assert.equal(scoreboard.kickoff_utc, kickoff, `${row.provider_id} ESPN scoreboard kickoff`);
  assert.equal(scoreboard.time_valid, true, `${row.provider_id} ESPN time is valid, not a placeholder`);
  assert.equal(localTime(kickoff, school.time_zone), school.local_time, `${row.provider_id} school time`);
  assert.equal(easternDate(kickoff), row.date, `${row.provider_id} stays on its Eastern date`);
};

/* ------------------------------------------------- the morning adoptions */
assert.equal(evidence.reconfirmed.length, 3);
for (const check of evidence.reconfirmed) {
  const row = rowFor(check.provider_id);
  assert.equal(row.kickoff_status, 'confirmed');
  assert.equal(row.kickoff_utc, check.kickoff_utc);
  assert.equal(row.tv, check.tv);
  assertOfficial(check.school.team_slug, check.school.url);
  assertOfficial(check.other.team_slug, check.other.url);
  checkTime(row, row.kickoff_utc, check.school, check.espn_scoreboard);
  assert.equal(check.espn.kickoff_utc, row.kickoff_utc);
  assert.ok(check.espn.broadcasts.every((name) => sameNetwork(name, row.tv)), `${row.provider_id} ESPN lists no other network`);
}

/* ------------------------------------------------------- the new updates */
const changes = [];
for (const update of evidence.updates) {
  const { primary, espn, espn_scoreboard: scoreboard } = update;
  const row = rowFor(update.provider_id);
  assert.equal(`${row.date}-${row.away}-at-${row.home}`, update.game_id);
  for (const [key, value] of Object.entries(update.before)) assert.deepEqual(row[key], value, `${row.provider_id} ${key} before`);
  assert.equal(primary.team_slug, row[update.source_role], `${row.provider_id} source is the ${update.source_role} school`);
  assertOfficial(primary.team_slug, primary.url);
  if (primary.announcement_url) assertOfficial(primary.team_slug, primary.announcement_url);
  if (update.other) assertOfficial(update.other.team_slug, update.other.url);
  const kickoff = update.after.kickoff_utc ?? row.kickoff_utc;
  const tv = update.after.tv ?? row.tv;
  checkTime(row, kickoff, primary, scoreboard);
  assert.equal(espn.kickoff_utc, kickoff, `${row.provider_id} ESPN summary kickoff`);
  assert.ok(sameNetwork(primary.network, tv), `${row.provider_id} school network`);
  assert.ok([...espn.broadcasts, ...scoreboard.broadcasts].every((name) => sameNetwork(name, tv)), `${row.provider_id} ESPN lists no other network`);
  if (update.source_role === 'away') {
    // A visiting school counts only when ESPN shows the same value.
    assert.ok(scoreboard.broadcasts.some((name) => sameNetwork(name, tv)), `${row.provider_id} ESPN shows the visiting school's network`);
    // The host lists TBD/TBA or an alternative that includes this network, never a different one.
    const hostNetwork = update.other.network_text;
    if (hostNetwork) assert.ok(hostNetwork.split(/: | or /).some((name) => sameNetwork(name, tv)), `${row.provider_id} host alternative includes ${tv}`);
  }
  if ('kickoff_utc' in update.after) {
    assert.equal(update.after.time_et, timeEt(kickoff));
    assert.equal(update.after.kickoff_status, 'confirmed');
    assert.match(update.other.time_text, /^TB[AD]$/);
    assert.equal(update.superseded_check.espn_time_valid, false, 'the morning check saw only a placeholder');
  }
  const checkedAt = [espn.checked_at, scoreboard.checked_at].sort().at(-1);
  Object.assign(row, update.after, {
    verified_at: checkedAt, rechecked_at: checkedAt,
    ...(update.timing_note ? { timing_note: update.timing_note, timing_sources: [primary.url, espn.url] } : {}),
    ...(update.tv_note ? { tv_note: update.tv_note } : {}),
    source_urls: [...new Set([...(row.source_urls ?? []), espn.url, primary.url, primary.announcement_url, update.other?.url].filter(Boolean))],
  });
  changes.push(...Object.keys(update.after).filter((key) => key === 'kickoff_utc' || key === 'tv').map((field) => `${row.provider_id}:${field === 'tv' ? 'tv' : 'kickoff'}`));
}
assert.deepEqual(changes, ['401858492:kickoff', '401858492:tv', '401856724:tv', '401856723:tv']);

/* -------------------------------------------- the whole Week 7 slate after */
const slate = snapshot.scheduledGames.filter((game) => game.week === 7);
assert.equal(slate.length, 59);
for (const game of slate) {
  assert.ok(game.kickoff_utc && game.time_et && game.kickoff_status === 'confirmed', `${game.provider_id} kickoff published`);
  assert.ok(game.tv && !/ or /.test(game.tv), `${game.provider_id} single network published`);
}
snapshot.scheduledGames.sort((a, b) =>
  a.date.localeCompare(b.date) || (a.kickoff_utc ?? '9999').localeCompare(b.kickoff_utc ?? '9999') || a.provider_id.localeCompare(b.provider_id));

/* ------------------------------------------------- holds, note and story */
week7.note = '59 FBS-vs-FBS games from the reviewed release. After the October 11 rechecks every kickoff and network is published from a school schedule; nothing is filled with placeholders.';
const holdIndex = snapshot.holds.findIndex((hold) => hold.startsWith('Week 7 official kickoff TBA'));
assert.ok(holdIndex >= 0);
snapshot.holds[holdIndex] = 'Week 7 kickoffs and networks: all 59 published after the October 11 rechecks. Charlotte–Temple 1 PM ET, Louisiana Tech–ULM 8 PM ET and Nebraska–Oregon 11 PM ET on FOX come from the visiting school with ESPN agreeing (hosts still listed TBA/TBD); Penn State–Michigan (CBS) and Alabama–Tennessee (ABC) from the host; Florida–Texas on ABC from Florida and ESPN (Texas still listed ABC or ESPN).';
const story = snapshot.storylines.find((row) => row.id === 'week7-schedule-notes');
const tbaSentence = 'Nebraska–Oregon’s kickoff is still officially TBA.';
assert.ok(story?.body.endsWith(tbaSentence));
story.body = `${story.body.slice(0, -tbaSentence.length)}Nebraska–Oregon is 11 PM ET (8 PM PT) on FOX.`;
story.sources = [...new Set([...story.sources, 'https://huskers.com/sports/football/schedule'])];
snapshot.source_urls = [...new Set([...snapshot.source_urls, evidence.espn_scoreboard.url,
  ...[...evidence.updates, ...evidence.reconfirmed].flatMap((u) => [u.espn.url, (u.primary ?? u.school).url, u.primary?.announcement_url, u.other?.url]).filter(Boolean)])];
const appliedAt = [evidence.checked_at, ...snapshot.refresh_log.map((entry) => entry.applied_at)].sort().at(-1);
snapshot.refresh_log = [...snapshot.refresh_log, {
  applied_at: appliedAt, evidence_checked_at: evidence.checked_at, script: LOG_SCRIPT, evidence: evidenceFile, scope: evidence.scope,
  week7_changes: changes, week7_reconfirmed: evidence.reconfirmed.map((c) => c.provider_id), week7_official_tbd: [],
}];
assert.equal(JSON.stringify({
  polls: snapshot.polls, retrieved_at: snapshot.retrieved_at, schedule_verified_at: snapshot.schedule_verified_at,
  results_verified_at: snapshot.results_verified_at, teamRecords: snapshot.teamRecords, playedGames: snapshot.playedGames,
  stamps: snapshot.board_weeks.map(({ note, ...rest }) => rest),
}), untouched, 'scores, records, polls and board stamps unchanged');
if (!process.argv.includes('--dry-run')) writeFileSync(path, `${JSON.stringify(snapshot, null, 1)}\n`);
console.log(`Week 7: ${changes.length} changes (${changes.join(', ')}); 3 morning adoptions reconfirmed; all 59 games published. No deploy performed.`);
