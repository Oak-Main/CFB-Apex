/** Apply the verified October 10 Saturday finals (Week 6) offline.
 * Usage: node scripts/apply-oct10-saturday-finals.mjs [--dry-run]
 * Every final needs a completed ESPN summary and the same score and winner on
 * NCAA.com; every record must reconcile with ESPN standings. No deploy.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const path = new URL('../data/cfb-2026/refresh/verified-refresh.json', import.meta.url);
const evidenceFile = 'data/cfb-2026/refresh/evidence/2026-10-11-saturday-finals.json';
const snapshot = JSON.parse(readFileSync(path, 'utf8'));
const evidence = JSON.parse(readFileSync(new URL(`../${evidenceFile}`, import.meta.url), 'utf8'));
const easternDate = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
const LOG_SCRIPT = 'scripts/apply-oct10-saturday-finals.mjs';
if ((snapshot.refresh_log ?? []).some((entry) => entry.script === LOG_SCRIPT)) {
  console.log('October 10 Saturday finals already applied; nothing to do.');
  process.exit(0);
}
assert.equal(snapshot.week, 7);
const week6 = snapshot.board_weeks.find((row) => row.week === 6);
assert.ok(week6);
assert.equal(evidence.finals.length, 44);
assert.equal(evidence.ncaa_scoreboard.games, 58);
assert.equal(evidence.reconciliation.disagreements, 0);

/* ------------------------------------------------------------ the finals */
const standingsRows = evidence.standings.conferences.flatMap((conf) => conf.rows);
assert.equal(standingsRows.length, 138);
const school = new Map(standingsRows.map((row) => [row.team_slug, row.team]));
const overall = new Map(standingsRows.map((row) => [row.team_slug, row.overall]));
const added = [];
for (const final of evidence.finals) {
  const { espn, ncaa } = final;
  const row = snapshot.scheduledGames.find((game) => game.provider_id === final.provider_id);
  assert.ok(row, `Missing scheduled Week 6 game ${final.provider_id}`);
  assert.equal(row.week, 6);
  assert.equal(row.home, final.home);
  assert.equal(row.away, final.away);
  assert.equal(espn.sides.home.slug, row.home);
  assert.equal(espn.sides.away.slug, row.away);
  assert.equal(easternDate(espn.kickoff_utc), row.date, `${row.provider_id} Eastern game date`);
  for (const side of [espn.sides.home, espn.sides.away]) {
    assert.ok(Number.isInteger(side.points) && side.points >= 0);
    assert.equal(side.line_score.reduce((a, b) => a + b, 0), side.points, `${row.provider_id} ${side.slug} line score`);
    assert.equal(ncaa.scores[side.slug], side.points, `${row.provider_id} ${side.slug} NCAA score`);
    assert.equal(side.record, overall.get(side.slug), `${side.slug} record agrees with ESPN standings`);
  }
  assert.notEqual(espn.sides.home.points, espn.sides.away.points);
  const kickoffChanged = espn.kickoff_utc !== row.kickoff_utc;
  snapshot.playedGames.push({
    provider_id: row.provider_id, source_url: row.source_url, game_id: `${row.date}-${row.away_slug}-at-${row.home_slug}`,
    date: row.date, kickoff_utc: espn.kickoff_utc, week: 6, home_slug: row.home_slug, away_slug: row.away_slug,
    site: row.site, tv: row.tv, neutral_site: row.neutral_site, verified_at: espn.checked_at, title: espn.detail,
    teams: [espn.sides.home, espn.sides.away].map((side) => ({ slug: side.slug, name: school.get(side.slug) ?? side.name, points: side.points })),
    meta: {
      as_of: easternDate(espn.checked_at), sources: [espn.url, ncaa.url], conference_game: espn.conference_game,
      line_score: { [espn.sides.home.slug]: espn.sides.home.line_score, [espn.sides.away.slug]: espn.sides.away.line_score },
      ...(kickoffChanged ? { originally_scheduled_kickoff_utc: row.kickoff_utc, kickoff_note: 'ESPN game summary lists the actual start; stable Eastern game id retained.' } : {}),
      ...(row.timing_note ? { pregame_timing_note: row.timing_note } : {}),
    },
  });
  snapshot.scheduledGames = snapshot.scheduledGames.filter((game) => game.provider_id !== row.provider_id);
  added.push(row.provider_id);
}
assert.equal(snapshot.scheduledGames.filter((game) => game.week === 6).length, 0);
const week6Finals = snapshot.playedGames.filter((game) => game.week === 6 && game.verified_at);
assert.equal(week6Finals.length, 58);
assert.equal(new Set(week6Finals.map((game) => game.provider_id)).size, 58);

/* ------------------------------------------------- records and standings */
const records = Object.fromEntries([...overall].sort(([a], [b]) => a.localeCompare(b)));
assert.equal(Object.keys(records).length, 138);
for (const [slug, record] of Object.entries(snapshot.teamRecords)) {
  assert.equal(records[slug], record, `${slug} keeps its already-verified record`);
}
for (const conf of evidence.standings.conferences) for (const row of conf.rows) {
  const [w, l] = row.overall.split('-').map(Number);
  assert.ok(Number(row.w) <= w && Number(row.l) <= l, `${row.team_slug} conference record fits inside overall`);
}
const previouslyWithheld = snapshot.team_records_review.withheld;
snapshot.teamRecords = records;
snapshot.team_records_review = {
  as_of: '2026-10-11', rule: evidence.reconciliation.rule, verified: 138, carried_from_2026_10_10: [], withheld: [],
  note: `All 138 overall records reconcile after the 46 verified October 10 finals: ESPN standings, ESPN game summaries, NCAA.com scores and the earlier ${138 - previouslyWithheld.length} site records agree. This resolves the ${previouslyWithheld.length} records the Week 7 release had withheld.`,
};
snapshot.retainedBaseline = {
  ...snapshot.retainedBaseline,
  conferenceStandings: evidence.standings.conferences,
  as_of: '2026-10-11',
  verified_at: evidence.standings.verified_at,
  overall_records: records,
  overall_records_note: 'Overall records as reconciled October 11 against ESPN standings after every Week 6 final.',
  note: 'Conference and overall standings rechecked October 11 against ESPN after all 58 Week 6 FBS finals; all 138 overall and conference records reconcile with the verified results. Injury base retains its own prior cutoff.',
};

/* ---------------------------------------------------- dates, holds, story */
week6.results_verified_at = evidence.checked_at;
week6.note = 'Week 6 archive: all 58 FBS-vs-FBS games are verified finals (ESPN completed-game summaries, matched against NCAA.com scores).';
snapshot.results_verified_at = evidence.checked_at;
snapshot.holds = snapshot.holds.map((hold) => {
  if (hold.startsWith('No live in-season scores feed')) return 'No live in-season scores feed is wired. All 58 Week 6 FBS-vs-FBS games are verified finals (October 11); Week 7 results require another verified refresh.';
  if (hold.startsWith('Overall records:')) return 'Overall records: all 138 reconcile October 11 against ESPN standings after the verified Week 6 finals; poll records keep their October 4 publication values.';
  return hold;
});
const saturday = snapshot.playedGames.filter((game) => game.date === '2026-10-10');
assert.equal(saturday.length, 46);
const story = {
  id: 'week6-saturday-finals', week: 6, headline: 'Saturday finals: Oklahoma stuns No. 1 Texas; Georgia wins at Alabama',
  body: 'October 10, AP ranks from the October 4 poll: Oklahoma 27–24 over No. 1 Texas; No. 2 Georgia 20–17 at No. 6 Alabama; No. 21 UCLA 17–15 at No. 13 Oregon; Kentucky 35–34 over No. 10 LSU in overtime; South Carolina 38–19 at No. 16 Florida; North Carolina 21–17 at No. 25 Pittsburgh. All 46 Saturday FBS games are verified finals, checked October 11 against ESPN completed-game summaries and NCAA.com.',
  game_provider_id: null, result_provider_ids: saturday.map((game) => game.provider_id), as_of: '2026-10-11',
  sources: ['401856717', '401856712', '401858484', '401856715', '401856714', '401858256'].flatMap((id) => evidence.finals.find((f) => f.provider_id === id).espn.url).concat(evidence.ncaa_scoreboard.url),
};
for (const id of ['401856717', '401856712', '401858484', '401856715', '401856714', '401858256']) {
  assert.ok(snapshot.playedGames.some((game) => game.provider_id === id), `${id} story result is a verified final`);
}
const expectStory = [
  ['401856717', 'oklahoma', 27, 'texas', 24], ['401856712', 'georgia', 20, 'alabama', 17], ['401858484', 'ucla', 17, 'oregon', 15],
  ['401856715', 'kentucky', 35, 'lsu', 34], ['401856714', 'south-carolina', 38, 'florida', 19], ['401858256', 'north-carolina', 21, 'pittsburgh', 17],
];
for (const [id, winner, wp, loser, lp] of expectStory) {
  const game = snapshot.playedGames.find((row) => row.provider_id === id);
  assert.equal(game.teams.find((t) => t.slug === winner)?.points, wp, `${id} story winner score`);
  assert.equal(game.teams.find((t) => t.slug === loser)?.points, lp, `${id} story loser score`);
}
const ap = new Map(snapshot.polls.find((poll) => poll.poll === 'ap').rankings.map((row) => [row.team_slug, row.rank]));
for (const [slug, rank] of [['texas', 1], ['georgia', 2], ['alabama', 6], ['ucla', 21], ['oregon', 13], ['lsu', 10], ['florida', 16], ['pittsburgh', 25]]) {
  assert.equal(ap.get(slug), rank, `${slug} AP rank in the story`);
}
snapshot.storylines = [story, ...snapshot.storylines.filter((row) => row.id !== story.id && row.id !== 'week6-saturday-big-ten-finals')];
snapshot.source_urls = [...new Set([...snapshot.source_urls, ...evidence.finals.flatMap((f) => [f.espn.url, f.ncaa.url]), evidence.ncaa_scoreboard.url, evidence.standings.source_url])];
snapshot.refresh_log = [...(snapshot.refresh_log ?? []), {
  applied_at: evidence.checked_at, script: LOG_SCRIPT, evidence: evidenceFile, scope: evidence.scope,
  finals_added: added, records_resolved: previouslyWithheld, standings_rechecked: evidence.standings.verified_at,
  untouched_cutoffs: { polls_released: snapshot.polls.map((p) => `${p.poll} ${p.release_date}`), metrics_through_games: snapshot.metrics.through_games, week7_retrieved_at: snapshot.retrieved_at },
}];
if (!process.argv.includes('--dry-run')) writeFileSync(path, `${JSON.stringify(snapshot, null, 1)}\n`);
console.log(`Verified ${added.length} October 10 finals (Week 6 now 58/58); 138 records reconcile, resolving ${previouslyWithheld.length} withheld. No deploy performed.`);
