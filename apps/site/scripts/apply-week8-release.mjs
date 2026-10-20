/** Apply the independently reviewed October 20 release, offline.
 * node scripts/apply-week8-release.mjs [--dry-run]
 * Scores need completed ESPN and matching NCAA finals. Kickoffs and networks
 * need school evidence; unresolved networks remain null. No deployment.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const file = new URL('../data/cfb-2026/refresh/verified-refresh.json', import.meta.url);
const evidencePath = 'data/cfb-2026/refresh/evidence/2026-10-20-week8-release.json';
const evidence = JSON.parse(readFileSync(new URL(`../${evidencePath}`, import.meta.url), 'utf8'));
const snapshot = JSON.parse(readFileSync(file, 'utf8'));
const hosts = JSON.parse(readFileSync(new URL('../data/cfb-2026/refresh/official-school-hosts.json', import.meta.url), 'utf8')).hosts;
const script = 'scripts/apply-week8-release.mjs';
if (snapshot.refresh_log.some(row => row.script === script)) {
  console.log('Week 8 release already applied.');
  process.exit(0);
}
assert.equal(snapshot.week, 7);
const previous = structuredClone(snapshot);
const etDate = iso => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
const etTime = iso => new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
const sourceUrl = id => `https://www.espn.com/college-football/game/_/gameId/${id}`;
const records = Object.fromEntries(evidence.conferences.flatMap(c => c.rows).map(r => [r.slug, r.overall]));
const schoolNames = new Map(previous.retainedBaseline.conferenceStandings.flatMap(c => c.rows).map(r => [r.team_slug, r.team]));
assert.equal(Object.keys(records).length, 138);
assert.equal(evidence.finals.length, 59);
assert.equal(new Set(evidence.finals.map(g => g.id)).size, 59);
assert.equal(evidence.schedule.length, 56);
assert.equal(new Set(evidence.schedule.flatMap(g => [g.home, g.away])).size, 112);
for (const g of evidence.finals) {
  const old = snapshot.scheduledGames.find(row => row.provider_id === g.id);
  assert.ok(old, `Unmatched Week 7 final ${g.id}`);
  assert.equal(old.home, g.home);
  assert.equal(old.away, g.away);
  assert.equal(g.status.type.completed, true);
  assert.equal(g.status.type.state, 'post');
  assert.equal(etDate(g.kickoff_utc), old.date);
  for (const side of ['home', 'away']) {
    assert.equal(g[`${side}_lines`].reduce((a, b) => a + b, 0), g[`${side}_score`]);
    assert.equal(g.ncaa[`${side}_score`], g[`${side}_score`]);
    assert.equal(g[`${side}_record`], records[g[side]]);
  }
  snapshot.playedGames.push({
    provider_id: g.id, source_url: sourceUrl(g.id), game_id: `${old.date}-${g.away}-at-${g.home}`,
    date: old.date, kickoff_utc: g.kickoff_utc, week: 7, home_slug: g.home, away_slug: g.away,
    site: g.site ?? old.site, tv: old.tv, neutral_site: g.neutral_site, verified_at: g.source.checked_at,
    title: g.status.type.detail,
    teams: ['home', 'away'].map(side => ({ slug: g[side], name: schoolNames.get(g[side]), points: g[`${side}_score`] })),
    meta: { as_of: etDate(g.source.checked_at), sources: [g.source.url, g.ncaa.url], conference_game: g.conference_game,
      line_score: { [g.home]: g.home_lines, [g.away]: g.away_lines }, pregame_ap_ranks: { [g.home]: g.home_rank < 26 ? g.home_rank : null, [g.away]: g.away_rank < 26 ? g.away_rank : null },
      pregame_timing_note: old.timing_note ?? null, originally_scheduled_kickoff_utc: old.kickoff_utc,
    },
  });
}
snapshot.scheduledGames = snapshot.scheduledGames.filter(g => g.week !== 7);
const counts = {};
for (const g of evidence.schedule) {
  assert.ok(records[g.home] && records[g.away]);
  assert.equal(g.week, 8);
  assert.equal(g.status.type.state, 'pre');
  assert.equal(g.timeValid, true);
  assert.equal(etDate(g.kickoff_utc), g.date);
  for (const school of [g.school_source, ...g.additional_school_sources]) {
    assert.equal(new URL(school.url).hostname, hosts[school.team]);
    assert.equal(school.kickoff_utc, g.kickoff_utc);
  }
  assert.equal(g.tv, g.school_source.tv);
  counts[g.date] = (counts[g.date] ?? 0) + 1;
  const urls = [sourceUrl(g.id), g.school_source.url, ...g.additional_school_sources.map(s => s.url)];
  snapshot.scheduledGames.push({ provider_id: g.id, source_url: sourceUrl(g.id), date: g.date, kickoff_utc: g.kickoff_utc,
    kickoff_status: 'confirmed', week: 8, home_slug: g.home, away_slug: g.away, away: g.away, home: g.home,
    site: g.site, tv: g.tv, tv_status: g.tv ? 'published' : 'unpublished', neutral_site: g.neutral_site,
    verified_at: g.school_source.checked_at, time_et: etTime(g.kickoff_utc), status: 'announced', game_status: 'scheduled',
    timing_sources: urls.slice(1), source_urls: urls,
    ...(g.tv ? {} : { timing_note: 'Network pending school confirmation. Provider lists ESPN+; not adopted.' }),
  });
}
assert.deepEqual(counts, { '2026-10-20': 3, '2026-10-21': 1, '2026-10-22': 3, '2026-10-23': 5, '2026-10-24': 44 });
assert.equal(snapshot.scheduledGames.filter(g => g.week === 7).length, 0);
assert.equal(snapshot.playedGames.filter(g => g.week === 7).length, 59);
const standings = evidence.conferences.map(conf => {
  const old = previous.retainedBaseline.conferenceStandings.find(c => c.rows.some(r => r.team_slug === conf.rows[0].slug));
  assert.ok(old);
  return { ...old, rows: conf.rows.map(row => { const [w, l] = row.conference.split('-'); return { team: schoolNames.get(row.slug), team_slug: row.slug, w, l, t: '0', pct: Number(w) + Number(l) ? (Number(w) / (Number(w) + Number(l))).toFixed(3) : '.000', overall: row.overall }; }) };
});
snapshot.teamRecords = records;
snapshot.team_records_review = { as_of: '2026-10-20', verified: 138, carried_from_2026_10_10: [], withheld: [],
  rule: 'All overall and conference records re-read from ESPN standings; each Week 7 participant overall record also matches its completed ESPN scoreboard row.',
  note: 'All 138 records rechecked October 20 after Week 7; poll records remain the records at poll release.' };
snapshot.retainedBaseline = { ...snapshot.retainedBaseline, conferenceStandings: standings, as_of: '2026-10-20', verified_at: evidence.checked_at,
  overall_records: records, overall_records_note: 'ESPN standings rechecked October 20 after Week 7.',
  note: 'Overall and conference standings rechecked October 20. Historical availability keeps its separate source dates.' };
snapshot.polls = evidence.polls;
snapshot.pollsStatus = 'AP and AFCA Coaches editions released October 18, 2026. Movement uses the October 11 editions; the archived October 4 data is retained separately. Composite is an editorial average of AP and Coaches ranks (unranked = 26).';
const ap = snapshot.polls.find(p => p.poll === 'ap');
const coaches = snapshot.polls.find(p => p.poll === 'coaches');
snapshot.poll_notes = {
  as_of: '2026-10-18',
  movers_ap: ap.rankings.filter(r => r.previous_rank && r.previous_rank !== r.rank).map(r => ({ team: r.team, team_slug: r.team_slug, from: r.previous_rank, to: r.rank, move: r.previous_rank - r.rank })),
  debuts_ap: ap.rankings.filter(r => !r.previous_rank).map(r => ({ team: r.team, team_slug: r.team_slug, rank: r.rank })),
  dropped_out: { ap: evidence.previous_ap.rankings.filter(r => !ap.rankings.some(x => x.team_slug === r.team_slug)).map(r => ({ team: r.team, team_slug: r.team_slug, others_points: ap.others.find(x => x.team_slug === r.team_slug)?.points ?? null })), coaches: [] },
  poll_gaps: { ap_only: ap.rankings.filter(r => !coaches.rankings.some(c => c.team_slug === r.team_slug)).map(r => ({ team: r.team, team_slug: r.team_slug, ap: r.rank, coaches: null })), coaches_only: coaches.rankings.filter(r => !ap.rankings.some(a => a.team_slug === r.team_slug)).map(r => ({ team: r.team, team_slug: r.team_slug, ap: null, coaches: r.rank })), biggest_splits: [] },
  sources: evidence.raw_sources.filter(r => r.name === 'polls-8.json').map(r => r.url),
};
snapshot.metrics = evidence.metrics;
snapshot.poll_notes = evidence.poll_notes;
snapshot.week = 8;
snapshot.week_start = '2026-10-19';
snapshot.reference_date = '2026-10-19';
snapshot.requested_cutoff = evidence.checked_at;
snapshot.retrieved_at = evidence.checked_at;
snapshot.results_verified_at = evidence.finals.map(g => g.source.checked_at).sort().at(-1);
snapshot.schedule_verified_at = evidence.schedule.map(g => g.school_source.checked_at).sort().at(-1);
const week7 = snapshot.board_weeks.find(w => w.week === 7);
week7.results_verified_at = snapshot.results_verified_at;
week7.note = 'Week 7 archive: all 59 FBS-vs-FBS finals independently matched between ESPN and NCAA. Three FBS-vs-FCS games remain outside the board.';
snapshot.board_weeks.push({ week: 8, start: '2026-10-19', end: '2026-10-25', label: 'Oct 20–24', cutover_utc: '2026-10-18T13:00:00Z',
  snapshot_id: 'week8-2026-10-20', marquee_game_id: '2026-10-24-houston-at-utah', retrieved_at: evidence.checked_at,
  schedule_verified_at: snapshot.schedule_verified_at, records_verified_at: evidence.checked_at,
  note: '56 FBS-vs-FBS games; all kickoffs school-confirmed. Sacramento State–Ball State network remains pending school confirmation; 55 other networks confirmed.' });
snapshot.baseline_note = 'Week 8 reviewed October 20; Week 7 has 59 verified finals. Historical weeks and unrelated research retain their own source dates. No continuous live feed.';
snapshot.holds = [
  'SP+ and FPI retain their own September 27 rating snapshot; current-week updates are not independently verified.',
  'Timestamped current-week odds and line movement not verified. No new market claims published.',
  'Week 8 availability coverage is partial: Nico Iamaleava season-ending surgery reported October 19. Other supplied statuses require direct-source verification. October 10 official filings are historical, not Week 8 clearance.',
  'No continuous live in-season scores feed is wired. All 59 Week 7 FBS-vs-FBS games are verified finals; Week 8 results require a further refresh.',
  'Week 8 kickoffs: all 56 school-confirmed. Sacramento State–Ball State TV remains pending; ESPN+ is provider-only and withheld.',
  'All 138 overall and conference records rechecked October 20; AP and Coaches records are October 18 publication values.',
];
const gameday = evidence.amendments.find(r => r.item === 'College GameDay');
snapshot.broadcast_events.push({ type: 'college-gameday', game_provider_id: '401856837', site: "President’s Circle, University of Utah", date: '2026-10-24', network: 'ESPN', announced: '2026-10-18', badge: 'College GameDay · Salt Lake City', note: '9 AM–noon ET; confirmed by Utah Athletics. Kickoff 10:15 PM ET on ESPN.', sources: [gameday.source_url] });
snapshot.storylines = [
  ...snapshot.storylines.filter(r => r.week !== 7),
  { id: 'week7-verified-finals', week: 7, headline: 'Week 7 final: eight ranked losses and a new No. 1', body: 'All 59 FBS-vs-FBS finals match ESPN and NCAA. Auburn beat No. 1 Georgia 27–24; No. 8 BYU beat No. 2 Notre Dame 28–24. Twenty-two AP teams played and eight lost, using the October 11 pregame poll. Miami won 43–35 in two overtimes and leads the October 18 AP poll.', game_provider_id: null, result_provider_ids: evidence.finals.map(g => g.id), as_of: '2026-10-20', sources: evidence.raw_sources.filter(r => r.name === 'ncaa-week7.html' || r.name === 'polls-8.json').map(r => r.url) },
  { id: 'week8-houston-utah', week: 8, headline: 'No. 14 Houston at No. 10 Utah leads Week 8', body: 'Houston (6–1) visits Utah (6–0) Saturday at 10:15 PM ET on ESPN. Utah Athletics confirms College GameDay at President’s Circle, 9 AM–noon ET. The slate has 56 FBS-vs-FBS games, including two AP-ranked matchups: Houston–Utah and Ole Miss–Texas.', game_provider_id: '401856837', as_of: '2026-10-20', sources: [gameday.source_url, 'https://utahutes.com/sports/football/schedule'] },
  { id: 'week8-ucla-quarterback', week: 8, headline: 'UCLA: Iamaleava’s season is over', body: 'Coach Bob Chesney said October 19 that Nico Iamaleava will miss the rest of the season and undergo knee surgery, AP/ESPN reports. No. 9 UCLA hosts Michigan State Saturday at 3:30 PM ET on CBS. This is reported availability, not a retrieved Week 8 conference filing.', game_provider_id: '401858499', as_of: '2026-10-20', sources: [evidence.amendments[0].source_url, 'https://uclabruins.com/sports/football/schedule'] },
];
snapshot.ranked_matchups = evidence.schedule.filter(g => ap.rankings.some(r => r.team_slug === g.home) && ap.rankings.some(r => r.team_slug === g.away)).map(g => ({ game_id: `${g.date}-${g.away}-at-${g.home}`, matchup: `${schoolNames.get(g.away)} at ${schoolNames.get(g.home)}`, polls: ['ap'] }));
snapshot.source_urls = [...new Set([...snapshot.source_urls, ...evidence.finals.flatMap(g => [g.source.url, g.ncaa.url]), ...evidence.schedule.flatMap(g => [g.source.url, g.school_source.url]), ...evidence.metric_sources.map(s => s.url), gameday.source_url, evidence.amendments[0].source_url])];
snapshot.refresh_log.push({ applied_at: evidence.checked_at, script, evidence: evidencePath, scope: evidence.scope,
  finals_added: evidence.finals.map(g => g.id), week8_games: 56, school_confirmed_kickoffs: 56, school_confirmed_networks: 55,
  pending_networks: ['401866447'], records_verified: 138, metrics_through_games: '2026-10-17', polls_released: '2026-10-18',
  untouched_cutoffs: { week6: previous.board_weeks.find(w => w.week === 6), ratings: '2026-09-27', portal: '2026-09-07', fantasy: '2026-09-07' } });
assert.deepEqual(snapshot.board_weeks.find(w => w.week === 6), previous.board_weeks.find(w => w.week === 6));
assert.deepEqual(snapshot.playedGames.filter(g => g.week !== 7), previous.playedGames);
if (!process.argv.includes('--dry-run')) writeFileSync(file, `${JSON.stringify(snapshot, null, 1)}\n`);
console.log('Week 8 validated: 59 archived finals, 56 school-confirmed kickoffs, 55 networks, 138 records, October 18 polls and October 17 NCAA leaders.');
