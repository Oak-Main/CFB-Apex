/** Port the reviewed Week 7 release (Gameday Command Center source) into the
 * native verified snapshot, offline. Week 6 history and its source dates stay.
 * Usage: node scripts/apply-week7-release.mjs [--dry-run]
 * Official TBD kickoffs stay null; nothing substitutes a midnight placeholder.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const path = new URL('../data/cfb-2026/refresh/verified-refresh.json', import.meta.url);
const evidenceFile = 'data/cfb-2026/refresh/evidence/2026-10-11-week7-release.json';
const snapshot = JSON.parse(readFileSync(path, 'utf8'));
const evidence = JSON.parse(readFileSync(new URL(`../${evidenceFile}`, import.meta.url), 'utf8'));
const easternDate = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
const easternTime = (iso) => new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
const short = (iso) => iso.replace(/:00(?:\.0+)?Z$/, 'Z');
const LOG_SCRIPT = 'scripts/apply-week7-release.mjs';
if ((snapshot.refresh_log ?? []).some((entry) => entry.script === LOG_SCRIPT)) {
  console.log('Week 7 release already applied; nothing to do.');
  process.exit(0);
}
assert.equal(snapshot.week, 6);
assert.equal(snapshot.reference_date, '2026-10-05');
assert.equal(evidence.release.source_revision, 'deb4f64ea413c91c38e4e5062ceadd2326753861');
assert.equal(evidence.release.snapshot_id, 'week7-90552f488b59c2cd');
assert.equal(evidence.release.canonical_revision, '2d1f2a47feb8a052e26f4f7817b4e40ce79f821e');
const slugs = new Set(Object.keys(snapshot.teamRecords));
assert.equal(slugs.size, 138);

/* ------------------------------------------------ Oct 10 finals (Week 6) */
for (const final of evidence.finals_added) {
  const espn = final.espn_summary;
  assert.equal(espn.completed, true);
  assert.equal(espn.state, 'post');
  const row = snapshot.scheduledGames.find((g) => g.provider_id === final.provider_id);
  assert.ok(row, `Missing scheduled Week 6 game ${final.provider_id}`);
  assert.equal(row.home, final.home);
  assert.equal(row.away, final.away);
  assert.equal(row.date, final.date);
  assert.equal(easternDate(espn.kickoff_utc), row.date);
  const sides = { home: { ...espn.sides.home, slug: final.home }, away: { ...espn.sides.away, slug: final.away } };
  assert.equal(sides.home.points, final.home_score, `${final.provider_id} home score`);
  assert.equal(sides.away.points, final.away_score, `${final.provider_id} away score`);
  for (const side of Object.values(sides)) {
    assert.equal(side.line_score.reduce((a, b) => a + b, 0), side.points);
    assert.equal(side.record, evidence.records.verified[side.slug]?.record, `${side.slug} record agrees with the reviewed release`);
  }
  snapshot.playedGames.push({
    provider_id: row.provider_id, source_url: row.source_url, game_id: `${row.date}-${row.away_slug}-at-${row.home_slug}`,
    date: row.date, kickoff_utc: espn.kickoff_utc, week: row.week, home_slug: row.home_slug, away_slug: row.away_slug,
    site: row.site, tv: row.tv, neutral_site: row.neutral_site, verified_at: espn.checked_at, title: espn.detail,
    teams: [sides.home, sides.away].map((t) => ({ slug: t.slug, name: snapshot.retainedBaseline.conferenceStandings.flatMap((c) => c.rows).find((r) => r.team_slug === t.slug)?.team ?? t.name, points: t.points })),
    meta: { as_of: easternDate(espn.checked_at), sources: [espn.url, ...final.reviewed_sources], conference_game: espn.conference_game,
      line_score: { [sides.home.slug]: sides.home.line_score, [sides.away.slug]: sides.away.line_score },
      reviewed_at: final.reviewed_at, release: evidence.release.snapshot_id },
  });
  snapshot.scheduledGames = snapshot.scheduledGames.filter((g) => g.provider_id !== row.provider_id);
}
const week6Remaining = snapshot.scheduledGames.filter((g) => g.week === 6);
assert.equal(week6Remaining.length, 44);
assert.equal(snapshot.playedGames.filter((g) => g.week === 6 && g.verified_at).length, 14);

/* ------------------------------------------------------- Week 7 schedule */
const { counts, calendar_start: calendarStart, calendar_end: calendarEnd } = evidence.release;
assert.equal(evidence.games.length, 59);
assert.equal(new Set(evidence.games.map((g) => g.provider_id)).size, 59);
assert.equal(new Set(evidence.games.map((g) => [g.away, g.home].sort().join(':'))).size, 59);
const tbd = new Set(evidence.release.official_unknown_kickoffs);
const perDate = {};
const week7Rows = evidence.games.map((g) => {
  assert.ok(slugs.has(g.home) && slugs.has(g.away), `${g.provider_id} teams resolve into the 138-team list`);
  assert.ok(g.date >= calendarStart && g.date <= calendarEnd, `${g.provider_id} inside the Week 7 calendar`);
  assert.equal(g.status, 'scheduled');
  assert.equal(g.kickoff_utc == null, tbd.has(g.provider_id), `${g.provider_id} kickoff is null exactly when officially TBD`);
  assert.equal(g.kickoff_status, g.kickoff_utc == null ? 'official_tbd' : 'confirmed');
  if (g.kickoff_utc) assert.equal(easternDate(g.kickoff_utc), g.date, `${g.provider_id} Eastern date`);
  assert.ok(g.retrieved_at && Number.isFinite(Date.parse(g.retrieved_at)));
  perDate[g.date] = (perDate[g.date] ?? 0) + 1;
  const tv = g.tv === 'Fox' ? 'FOX' : g.tv;
  return {
    provider_id: g.provider_id, source_url: g.source_url, date: g.date,
    kickoff_utc: g.kickoff_utc ? short(g.kickoff_utc) : null, kickoff_status: g.kickoff_status,
    week: 7, home_slug: g.home, away_slug: g.away, site: g.site, tv, tv_status: g.tv_status,
    neutral_site: g.neutral_site, verified_at: g.retrieved_at, away: g.away, home: g.home,
    time_et: g.kickoff_utc ? easternTime(g.kickoff_utc) : null,
    status: g.kickoff_utc ? 'announced' : 'official_tbd', game_status: 'scheduled',
    ...(g.kickoff_utc ? {} : { timing_note: 'Official kickoff TBA · school schedule at review' }),
    timing_sources: [...new Set([g.time_source, g.tv_source].filter(Boolean))],
    source_urls: g.source_urls, release: evidence.release.snapshot_id,
  };
});
assert.deepEqual(perDate, counts);
assert.ok(week7Rows.some((r) => r.provider_id === '401858488' && r.away === 'ohio-state' && r.home === 'indiana' && r.date === '2026-10-17'));
const notes = {
  '401858494': 'Kickoff and network from UCLA and Wisconsin schedules (7:30 PM ET, NBC); provider listed a midnight placeholder at review.',
  '401858488': 'Ohio State announces noon ET on FOX; Indiana schedule still listed TBA at review.',
};
for (const row of week7Rows) if (notes[row.provider_id]) row.timing_note = notes[row.provider_id];
for (const id of evidence.release.unpublished_networks) {
  const row = week7Rows.find((r) => r.provider_id === id);
  assert.equal(row.tv, null, `${id} network stays unpublished`);
}
snapshot.scheduledGames = [...week6Remaining, ...week7Rows].sort((a, b) =>
  a.date.localeCompare(b.date) || (a.kickoff_utc ?? '9999').localeCompare(b.kickoff_utc ?? '9999') || a.provider_id.localeCompare(b.provider_id));

/* -------------------------------------------- Week 7 FBS–FCS exclusions */
const excludedHome = { '401858261': 'clemson', '401858262': 'stanford', '401856725': 'texas-am' };
for (const row of evidence.excluded) {
  const home = excludedHome[row.provider_id];
  assert.ok(home && slugs.has(home));
  assert.ok(row.espn_conference_ids && Number.isInteger(row.espn_conference_ids.away));
  snapshot.excludedGames.push({
    provider_id: row.provider_id, source_url: row.source_url, date: easternDate(row.kickoff_utc), kickoff_utc: row.kickoff_utc,
    week: 7, home_slug: home, away_slug: null, site: null, tv: null, neutral_site: false, verified_at: evidence.provider_crosscheck.checked_at,
    name: row.name, reason: `FBS–FCS: away team sits in ESPN conference id ${row.espn_conference_ids.away}, outside the FBS conference set; current UI supports FBS vs FBS only.`,
    espn_conference_ids: row.espn_conference_ids,
  });
}

/* ----------------------------------------------------------- team records */
// Week 7 records need school and provider agreement. A team without one (the
// review's school pages failed to load, or it is off the Week 7 board) keeps
// its October 10 ESPN-reconciled record only when it has not played since: its
// Week 6 game was a verified Tue–Fri final or its schedule lists an Oct 10 bye.
// A missing schedule row is not a bye.
const previous = snapshot.teamRecords;
const verified = evidence.records.verified;
const withheld = new Set(evidence.records.withheld_participants);
assert.equal(Object.keys(verified).length, 102);
assert.equal(withheld.size, 16);
const participants = new Set(week7Rows.flatMap((r) => [r.home, r.away]));
assert.equal(participants.size, 118);
for (const slug of participants) assert.ok(Boolean(verified[slug]) !== withheld.has(slug), `${slug} is verified or withheld`);
const oct10Rows = [...week6Remaining, ...snapshot.playedGames.filter((g) => g.week === 6)].filter((g) => g.date === '2026-10-10');
assert.equal(oct10Rows.length, evidence.oct10_scoreboard.events);
const playedOct10 = new Set(oct10Rows.flatMap((g) => [g.home ?? g.home_slug, g.away ?? g.away_slug]));
assert.equal(playedOct10.size, 92);
const earlierWeek6Final = new Set(snapshot.playedGames.filter((g) => g.week === 6 && g.date < '2026-10-10').flatMap((g) => [g.home_slug, g.away_slug]));
const schedulesDir = new URL('../data/cfb-2026/schedules/', import.meta.url);
const byeOct10 = new Set(readdirSync(schedulesDir).filter((file) => file.endsWith('.json')).filter((file) => {
  const doc = JSON.parse(readFileSync(new URL(file, schedulesDir), 'utf8'));
  return (Array.isArray(doc) ? doc : doc.games ?? []).some((row) => row.date === '2026-10-10' && row.type === 'bye');
}).map((file) => file.replace(/\.json$/, '')));
const records = {};
const carried = [];
for (const slug of [...slugs].sort()) {
  if (verified[slug]) records[slug] = verified[slug].record;
  else if (!playedOct10.has(slug) && (earlierWeek6Final.has(slug) || byeOct10.has(slug))) {
    assert.ok(previous[slug], `${slug} has an October 10 record to keep`);
    records[slug] = previous[slug];
    carried.push(slug);
  }
}
assert.deepEqual(carried, ['clemson', 'iowa', 'iowa-state', 'kennesaw-state', 'liberty', 'new-mexico-state', 'south-alabama', 'texas-state', 'utah-state', 'wyoming']);
for (const final of snapshot.playedGames.filter((g) => g.date === '2026-10-10' && g.meta?.release)) {
  for (const t of final.teams) assert.ok(records[t.slug], `${t.slug} record after its verified final`);
}
const recordsWithheld = [...slugs].filter((slug) => !records[slug]).sort();
assert.equal(recordsWithheld.length, 26);
snapshot.retainedBaseline = { ...snapshot.retainedBaseline, overall_records: previous,
  overall_records_note: 'Overall records as reconciled October 10 against ESPN, before Saturday Week 6 games; the conference tables keep this date.' };
snapshot.teamRecords = records;
snapshot.team_records_review = {
  as_of: '2026-10-11', rule: evidence.records.rule, verified: Object.keys(verified).length,
  carried_from_2026_10_10: carried, withheld: recordsWithheld,
  note: `Records for 102 of 118 Week 7 participants carry school and provider agreement; ${carried.length} teams that have not played since the October 10 ESPN reconciliation keep that record; the other ${recordsWithheld.length} are withheld rather than shown stale.`,
};

/* ---------------------------------------------------- snapshot metadata */
const week6Stamps = {
  requested_cutoff: snapshot.requested_cutoff, retrieved_at: snapshot.retrieved_at,
  audit_applied_at: snapshot.audit_applied_at, results_verified_at: snapshot.results_verified_at,
  schedule_verified_at: snapshot.schedule_verified_at, baseline_note: snapshot.baseline_note,
};
const latest = (values) => values.filter(Boolean).sort().at(-1);
const scheduleVerifiedAt = new Date(latest(week7Rows.map((r) => r.verified_at))).toISOString();
snapshot.board_weeks = [
  { week: 6, start: '2026-10-05', end: '2026-10-11', label: 'Oct 6–10', cutover_utc: '2026-10-04T13:00:00Z', ...week6Stamps,
    results_verified_at: evidence.finals_added[0].espn_summary.checked_at,
    note: 'Week 6 archive: 14 verified finals; the other 44 Saturday games keep their October 10 schedule check and show no result until a final is verified.' },
  { week: 7, start: '2026-10-12', end: '2026-10-18', label: 'Oct 13–17', cutover_utc: '2026-10-11T13:00:00Z',
    snapshot_id: evidence.release.snapshot_id, source_revision: evidence.release.source_revision,
    // The release's editorial Game of the Week (not the rank-sum default).
    marquee_game_id: '2026-10-17-ohio-state-at-indiana',
    retrieved_at: evidence.release.reviewed_at, schedule_verified_at: scheduleVerifiedAt,
    records_verified_at: new Date(latest(Object.values(verified).map((v) => v.retrieved_at))).toISOString(),
    note: '59 FBS-vs-FBS games from the reviewed release. Three official kickoffs remain TBA and two networks are unpublished; nothing is filled with placeholders.' },
];
snapshot.week = 7;
snapshot.week_start = '2026-10-12';
snapshot.reference_date = '2026-10-12';
snapshot.requested_cutoff = evidence.release.reviewed_at;
snapshot.retrieved_at = evidence.release.reviewed_at;
snapshot.schedule_verified_at = scheduleVerifiedAt;
snapshot.results_verified_at = evidence.finals_added[0].espn_summary.checked_at;
delete snapshot.audit_applied_at;
snapshot.baseline_note = 'Week 7 release reviewed October 11 (59 FBS-vs-FBS games, Oct 13–17). Week 6 history keeps its own snapshot and source dates. Snapshot review time is not a live-update guarantee.';
snapshot.pollsStatus = 'AP and AFCA Coaches editions dated October 4, 2026 (provider week 6) remain the latest verified editions; the Week 7 board does not relabel them as new polls. Composite is an editorial average.';
snapshot.holds = [
  ...snapshot.holds.filter((hold) => !hold.startsWith('No live in-season scores feed')),
  'No live in-season scores feed is wired. Week 6 shows 14 verified finals; the other 44 Saturday October 10 games are not promoted to final until a result is verified.',
  'Week 7 official kickoff TBAs: Charlotte at Temple, Louisiana Tech at ULM and Nebraska at Oregon (school schedules at review). Networks unpublished: Nebraska at Oregon and Penn State at Michigan. Texas–Florida and Alabama–Tennessee keep the published ABC-or-ESPN alternative.',
  `Overall records: 102 of 118 Week 7 participants verified October 11 (school and provider agreement); ${carried.length} teams with no game since the October 10 ESPN reconciliation keep that record; ${recordsWithheld.length} teams that played October 10 without a verified final in this release are withheld rather than shown stale.`,
];
const storyWeek = { 'oct10-kickoff-weather-updates': 6, 'week6-friday-finals': 6, 'week6-thursday-finals': 6, 'ndsu-first-fbs-season': 6 };
snapshot.storylines = snapshot.storylines.map((story) => ({ ...story, week: story.week ?? storyWeek[story.id] ?? 6 }));
const oct10Final = snapshot.playedGames.filter((g) => g.meta?.release === evidence.release.snapshot_id);
snapshot.storylines = [
  { id: 'week7-schedule-notes', week: 7, headline: 'Week 7: Ohio State at Indiana leads a 59-game FBS slate',
    body: 'Ohio State (5–1) visits unbeaten Indiana (6–0) at noon ET on FOX. Washington–Purdue moved to Friday, Oct. 16. Wisconsin at UCLA is 7:30 PM ET on NBC. Kickoffs for Charlotte–Temple, Louisiana Tech–ULM and Nebraska–Oregon are still officially TBA.',
    game_provider_id: '401858488', as_of: '2026-10-11',
    sources: ['https://ohiostatebuckeyes.com/sports/football/schedule/2026', 'https://iuhoosiers.com/sports/football/schedule/2026', 'https://purduesports.com/sports/football/schedule', 'https://uwbadgers.com/sports/football/schedule/2026', 'https://uclabruins.com/sports/football/schedule/2026'] },
  { id: 'week6-saturday-big-ten-finals', week: 6, headline: 'Saturday finals: Indiana edges Nebraska; Ohio State beats Maryland',
    body: 'October 10: Indiana 20–17 at Nebraska; Ohio State 45–16 over Maryland. Verified October 11 against ESPN completed-game summaries and the schools. Other Saturday results are not yet in this release.',
    game_provider_id: null, result_provider_ids: oct10Final.map((g) => g.provider_id), as_of: '2026-10-11',
    sources: [...new Set(oct10Final.flatMap((g) => g.meta.sources))] },
  ...snapshot.storylines,
];
const releaseSources = [
  ...week7Rows.flatMap((r) => [r.source_url, ...r.timing_sources]),
  ...Object.values(verified).flatMap((v) => v.sources),
  ...evidence.excluded.map((r) => r.source_url),
  ...oct10Final.flatMap((g) => g.meta.sources),
  ...evidence.provider_crosscheck.urls,
];
snapshot.source_urls = [...new Set([...snapshot.source_urls, ...releaseSources])];
snapshot.refresh_log = [...(snapshot.refresh_log ?? []), {
  applied_at: evidence.provider_crosscheck.checked_at, script: LOG_SCRIPT, evidence: evidenceFile,
  scope: evidence.scope, release: evidence.release.snapshot_id, source_revision: evidence.release.source_revision,
  finals_added: evidence.finals_added.map((f) => f.provider_id), week7_games: week7Rows.length,
  week7_official_tbd: [...tbd], records_verified: Object.keys(verified).length, records_carried: carried, records_withheld: recordsWithheld,
  provider_differences_recorded: evidence.provider_crosscheck.differences.length,
  untouched_cutoffs: { polls_released: snapshot.polls.map((p) => `${p.poll} ${p.release_date}`), metrics_through_games: snapshot.metrics.through_games, week6_retrieved_at: week6Stamps.retrieved_at },
}];
if (!process.argv.includes('--dry-run')) writeFileSync(path, `${JSON.stringify(snapshot, null, 1)}\n`);
console.log(`Week 7: ${week7Rows.length} games (${tbd.size} official TBD). Week 6: 2 finals added, 44 games retained. Records: ${Object.keys(verified).length} verified, ${carried.length} carried, ${recordsWithheld.length} withheld. No deploy performed.`);
