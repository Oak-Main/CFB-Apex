/** Apply the school-confirmed Week 8 TV follow-up offline. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../data/cfb-2026/refresh/verified-refresh.json', import.meta.url);
const evidenceFile = 'data/cfb-2026/refresh/evidence/2026-10-20-tv-followup.json';
const evidence = JSON.parse(readFileSync(new URL(`../${evidenceFile}`, import.meta.url), 'utf8'));
const snapshot = JSON.parse(readFileSync(file, 'utf8'));
const script = 'scripts/apply-oct20-tv-followup.mjs';
if (snapshot.refresh_log.some(row => row.script === script)) {
  console.log('October 20 TV follow-up already applied.');
  process.exit(0);
}
const hosts = JSON.parse(readFileSync(new URL('../data/cfb-2026/refresh/official-school-hosts.json', import.meta.url), 'utf8')).hosts;
const row = snapshot.scheduledGames.find(game => game.provider_id === evidence.provider_id);
assert.ok(row && row.week === 8);
assert.equal(`${row.date}-${row.away}-at-${row.home}`, evidence.game_id);
assert.equal(row.home, evidence.school.team);
assert.deepEqual(evidence.school.matchup, { home: row.home, away: row.away, date: row.date });
assert.equal(new URL(evidence.school.url).hostname, hosts[row.home]);
assert.equal(createHash('sha256').update(evidence.school.excerpt).digest('hex'), evidence.school.excerpt_sha256);
assert.equal(row.kickoff_utc, evidence.kickoff_utc);
assert.equal(evidence.school.kickoff_utc, evidence.espn.kickoff_utc);
assert.equal(evidence.espn.status, 200);
assert.equal(evidence.espn.state, 'pre');
assert.equal(evidence.espn.time_valid, true);
assert.equal(evidence.school.tv, evidence.tv);
assert.ok(evidence.espn.broadcasts.includes(evidence.tv));
assert.equal(row.tv, null);
assert.equal(row.tv_status, 'unpublished');
const untouched = JSON.stringify({ polls: snapshot.polls, records: snapshot.teamRecords, standings: snapshot.retainedBaseline, played: snapshot.playedGames, otherGames: snapshot.scheduledGames.filter(g => g !== row), stamps: snapshot.board_weeks.map(({ note, ...rest }) => rest), retrieved_at: snapshot.retrieved_at, schedule_verified_at: snapshot.schedule_verified_at, results_verified_at: snapshot.results_verified_at });
Object.assign(row, {
  tv: evidence.tv,
  tv_status: 'published',
  verified_at: evidence.checked_at,
  rechecked_at: evidence.checked_at,
  timing_note: 'ESPN+ confirmed by Ball State’s October 19 game-week announcement; checked October 20.',
  timing_sources: [...new Set([...row.timing_sources, evidence.school.url])],
  source_urls: [...new Set([...row.source_urls, evidence.school.url, evidence.espn.url])],
});
const slate = snapshot.scheduledGames.filter(g => g.week === 8);
assert.equal(slate.length, 56);
assert.ok(slate.every(g => g.tv && g.tv_status === 'published'));
snapshot.board_weeks.find(board => board.week === 8).note = '56 FBS-vs-FBS games; all kickoffs and networks school-confirmed. Ball State’s October 19 announcement confirms ESPN+ for Sacramento State at Ball State, Saturday at 3:30 PM ET.';
const hold = snapshot.holds.findIndex(text => text.startsWith('Week 8 kickoffs:'));
assert.ok(hold >= 0);
snapshot.holds[hold] = 'Week 8 kickoffs and networks: all 56 school-confirmed. Sacramento State–Ball State ESPN+ confirmed by Ball State’s October 19 game-week announcement, checked October 20. Both school schedule grids still omit the network.';
snapshot.source_urls = [...new Set([...snapshot.source_urls, evidence.school.url, evidence.espn.url])];
snapshot.refresh_log.push({ script, applied_at: evidence.checked_at, evidence_checked_at: evidence.checked_at, evidence: evidenceFile, scope: 'Resolve the last Week 8 TV assignment from the host school game-week announcement, with ESPN agreeing. Other games, scores, records, polls and source cutoffs are unchanged.', tv_changes: [`${row.provider_id}:tv`], school_confirmed_networks: 56, pending_networks: [] });
assert.equal(JSON.stringify({ polls: snapshot.polls, records: snapshot.teamRecords, standings: snapshot.retainedBaseline, played: snapshot.playedGames, otherGames: snapshot.scheduledGames.filter(g => g !== row), stamps: snapshot.board_weeks.map(({ note, ...rest }) => rest), retrieved_at: snapshot.retrieved_at, schedule_verified_at: snapshot.schedule_verified_at, results_verified_at: snapshot.results_verified_at }), untouched);
if (!process.argv.includes('--dry-run')) writeFileSync(file, `${JSON.stringify(snapshot, null, 1)}\n`);
console.log(`${process.argv.includes('--dry-run') ? 'Dry run: ' : ''}ESPN+ adopted; all 56 Week 8 networks school-confirmed.`);
