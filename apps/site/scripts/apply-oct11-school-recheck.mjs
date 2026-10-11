/** Add official school sources to the 44 Saturday October 10 (Week 6) finals and
 * apply the Week 7 kickoff/network recheck, offline.
 * Usage: node scripts/apply-oct11-school-recheck.mjs [--dry-run]
 * Runs after scripts/apply-oct10-saturday-finals.mjs, which verified the finals
 * against ESPN and NCAA.com. This script changes no score or record: each school
 * page must agree with the published final and with ESPN, and every record must
 * already match. Week 7 board stamps and the October 4 polls are not restamped.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const path = new URL('../data/cfb-2026/refresh/verified-refresh.json', import.meta.url);
const evidenceFile = 'data/cfb-2026/refresh/evidence/2026-10-11-school-sources-week7-recheck.json';
const snapshot = JSON.parse(readFileSync(path, 'utf8'));
const evidence = JSON.parse(readFileSync(new URL(`../${evidenceFile}`, import.meta.url), 'utf8'));
const { hosts: officialHosts } = JSON.parse(readFileSync(new URL('../data/cfb-2026/refresh/official-school-hosts.json', import.meta.url), 'utf8'));
// A school source counts only from that school's own official athletics host.
const assertOfficial = (slug, url) => assert.equal(new URL(url).hostname, officialHosts[slug], `${url} is ${slug}'s official site`);
const easternDate = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
const easternTime = (iso) => new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
const latest = (values) => values.filter(Boolean).sort().at(-1);
const LOG_SCRIPT = 'scripts/apply-oct11-school-recheck.mjs';
if ((snapshot.refresh_log ?? []).some((entry) => entry.script === LOG_SCRIPT)) {
  console.log('October 11 school-source recheck already applied; nothing to do.');
  process.exit(0);
}
assert.equal(snapshot.week, 7);
assert.equal(snapshot.reference_date, '2026-10-12');
assert.ok(snapshot.refresh_log.some((entry) => entry.script === 'scripts/apply-oct10-saturday-finals.mjs'), 'Saturday finals applied first');
// The hash covers the whole evidence file except itself (sorted keys, no whitespace).
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  : JSON.stringify(value);
const { content_sha256: sha, ...body } = evidence;
assert.equal(createHash('sha256').update(canonical(body)).digest('hex'), sha, 'evidence content hash');
const standing = Object.fromEntries(snapshot.retainedBaseline.conferenceStandings.flatMap((c) => c.rows).map((r) => [r.team_slug, r]));
const differences = new Set(evidence.differences_not_adopted.map((d) => `${d.slug}:${d.field}`));
const untouched = JSON.stringify({
  board_weeks: snapshot.board_weeks, polls: snapshot.polls, pollsStatus: snapshot.pollsStatus, retrieved_at: snapshot.retrieved_at,
  schedule_verified_at: snapshot.schedule_verified_at, results_verified_at: snapshot.results_verified_at,
  teamRecords: snapshot.teamRecords, team_records_review: snapshot.team_records_review, retainedBaseline: snapshot.retainedBaseline,
});

/* ----------------------------- October 10 finals: school-source corroboration */
assert.equal(evidence.finals.length, 44);
const corroborated = [];
const postGame = {};
for (const final of evidence.finals) {
  const played = snapshot.playedGames.filter((g) => g.provider_id === final.provider_id);
  assert.equal(played.length, 1, `${final.provider_id} is one verified final`);
  const [game] = played;
  const espn = final.espn_summary;
  assert.equal(espn.completed, true, `${final.provider_id} completed`);
  assert.equal(espn.state, 'post');
  assert.equal(espn.status, 'STATUS_FINAL');
  assert.equal(game.week, 6);
  assert.equal(game.game_id, `${final.date}-${final.away}-at-${final.home}`);
  assert.equal(game.home_slug, final.home);
  assert.equal(game.away_slug, final.away);
  assert.equal(game.kickoff_utc, espn.kickoff_utc, `${final.provider_id} kickoff`);
  assert.equal(easternDate(espn.kickoff_utc), final.date);
  const home = { ...espn.sides.home, slug: final.home };
  const away = { ...espn.sides.away, slug: final.away };
  for (const [side, other] of [[home, away], [away, home]]) {
    const won = side.points > other.points;
    assert.equal(game.teams.find((t) => t.slug === side.slug)?.points, side.points, `${side.slug} published score`);
    assert.deepEqual(game.meta.line_score[side.slug], side.line_score, `${side.slug} published line score`);
    assert.equal(side.line_score.reduce((a, b) => a + b, 0), side.points, `${final.provider_id} ${side.slug} line score sums to the score`);
    assert.equal(side.line_score.length > 4, /OT/.test(espn.detail), `${final.provider_id} overtime periods`);
    assert.equal(side.winner, won);
    // ESPN's post-game records are the ones the site already shows.
    assert.equal(snapshot.teamRecords[side.slug], side.record, `${side.slug} overall record`);
    assert.equal(standing[side.slug].overall, side.record, `${side.slug} standings overall`);
    assert.equal(`${standing[side.slug].w}-${standing[side.slug].l}`, side.conference_record, `${side.slug} conference record`);
    postGame[side.slug] = side.record;
  }
  // At least one official school page reports the same score and winner.
  assert.ok(final.official.some((o) => o.result_text), `${final.provider_id} has an official school result`);
  for (const source of final.official) {
    const [me, them] = source.side === 'home' ? [home, away] : [away, home];
    assert.equal(source.slug, me.slug);
    assert.match(source.url, /^https:\/\//);
    assertOfficial(me.slug, source.url);
    if (source.recap_url) assertOfficial(me.slug, source.recap_url);
    assert.ok(source.fetched_at > espn.kickoff_utc);
    if (source.result_text) {
      assert.equal(source.team_points, me.points, `${source.slug} school score`);
      assert.equal(source.opponent_points, them.points, `${source.slug} school opponent score`);
      assert.equal(source.outcome, me.points > them.points ? 'W' : 'L');
      if (source.overtime) assert.match(espn.detail, /OT/);
    }
    if (source.record) {
      assert.equal(source.record.overall, me.record, `${me.slug} school overall record agrees with ESPN`);
      if (source.record.conference !== me.conference_record) assert.ok(differences.has(`${me.slug}:conference_record`), `${me.slug} conference record difference is recorded`);
    }
  }
  const schoolSources = final.official.map((o) => ({
    slug: o.slug, url: o.url, ...(o.recap_url ? { recap_url: o.recap_url } : {}), result_text: o.result_text ?? null,
    record: o.record?.overall ?? null, fetched_at: o.fetched_at,
  }));
  game.meta = {
    ...game.meta,
    sources: [...new Set([...game.meta.sources, ...final.official.flatMap((o) => [o.url, o.recap_url])].filter(Boolean))],
    school_sources: schoolSources,
    school_checked_at: latest(final.official.map((o) => o.fetched_at)),
    school_evidence: evidenceFile,
  };
  corroborated.push(final.provider_id);
}
assert.equal(Object.keys(postGame).length, 88);
// The records the October 10 refresh restored are the ones the school pages and ESPN show.
for (const [slug, r] of Object.entries(evidence.records.recomputed)) {
  assert.equal(snapshot.teamRecords[slug], r.record, `${slug} restored record`);
  if (r.school_record != null) assert.equal(r.school_record, r.record, `${slug} school record`);
}
// Georgia State has no October 10 game; its record stands on school and ESPN agreement.
const gs = evidence.records.georgia_state;
assertOfficial('georgia-state', gs.school.url);
assert.equal(gs.school.oct10_entry, null);
assert.equal(gs.school.record.overall, gs.espn.record);
assert.equal(snapshot.teamRecords['georgia-state'], gs.record);

/* ------------------------------------------------- Week 7 recheck (rows) */
const week7Changes = [];
for (const check of evidence.week7_recheck.checks) {
  const row = snapshot.scheduledGames.find((g) => g.provider_id === check.provider_id);
  assert.ok(row && row.week === 7, `${check.provider_id} on the Week 7 board`);
  assert.equal(`${row.away} at ${row.home}`, check.matchup);
  const host = check.schools.find((s) => s.role === 'home');
  const visitor = check.schools.find((s) => s.role === 'away');
  for (const school of check.schools) assertOfficial(school.slug, school.url);
  const checkedAt = latest([check.provider.checked_at, ...check.schools.map((s) => s.fetched_at)]);
  row.rechecked_at = checkedAt;
  if (check.field === 'kickoff') {
    assert.equal(row.kickoff_utc, check.release.kickoff_utc);
    assert.equal(row.kickoff_status, 'official_tbd');
    if (check.decision !== 'adopt') {
      assert.equal(check.decision, 'keep_official_tbd');
      continue;
    }
    // A visiting school's time counts only when ESPN shows the same instant as a valid time.
    assert.match(host.time_text, /^TB[AD]$/);
    assert.equal(check.provider.time_valid, true);
    assert.equal(check.provider.kickoff_utc, check.kickoff_utc);
    assert.ok(visitor.time_zone && visitor.text_only_confirmation);
    assert.equal(easternDate(check.kickoff_utc), row.date);
    const before = { kickoff_utc: row.kickoff_utc, kickoff_status: row.kickoff_status };
    const zone = visitor.time_zone.split(':')[0];
    Object.assign(row, {
      kickoff_utc: check.kickoff_utc, kickoff_status: 'confirmed', time_et: easternTime(check.kickoff_utc), status: 'announced',
      verified_at: checkedAt,
      timing_note: `${standing[row.away].team} schedule lists ${visitor.time_text} (${zone}) and ESPN agrees; ${standing[row.home].team} schedule still listed ${host.time_text} at the October 11 recheck.`,
      timing_sources: [...new Set([visitor.url, row.source_url])],
      source_urls: [...new Set([...row.source_urls, visitor.url])],
    });
    week7Changes.push({ provider_id: row.provider_id, field: 'kickoff', before, after: { kickoff_utc: row.kickoff_utc, kickoff_status: row.kickoff_status } });
  } else {
    assert.equal(check.field, 'tv');
    assert.equal(row.tv, null);
    if (check.decision !== 'adopt') {
      assert.equal(check.decision, 'keep_unpublished');
      continue;
    }
    // The host school's own schedule settles its home game's network.
    assert.equal(host.tv_text, `TV: ${check.tv}`);
    assert.equal(row.kickoff_utc, check.release.kickoff_utc);
    Object.assign(row, {
      tv: check.tv, tv_status: 'published', verified_at: checkedAt,
      tv_note: `Network from the ${standing[row.home].team} schedule (October 11 recheck).`,
      source_urls: [...new Set([...row.source_urls, host.url])],
    });
    week7Changes.push({ provider_id: row.provider_id, field: 'tv', before: { tv: null }, after: { tv: row.tv } });
  }
}
assert.deepEqual(week7Changes.map((c) => `${c.provider_id}:${c.field}`), ['401862803:kickoff', '401871091:kickoff', '401858490:tv']);
const week7Rows = snapshot.scheduledGames.filter((g) => g.week === 7);
assert.equal(week7Rows.length, 59);
assert.deepEqual(week7Rows.filter((g) => g.kickoff_utc == null).map((g) => g.provider_id), ['401858492']);
snapshot.scheduledGames.sort((a, b) =>
  a.date.localeCompare(b.date) || (a.kickoff_utc ?? '9999').localeCompare(b.kickoff_utc ?? '9999') || a.provider_id.localeCompare(b.provider_id));

/* ---------------------------------------------------- snapshot metadata */
const holdIndex = snapshot.holds.findIndex((hold) => hold.startsWith('Week 7 official kickoff TBAs'));
assert.ok(holdIndex >= 0);
snapshot.holds[holdIndex] = 'Week 7 official kickoff TBA: Nebraska at Oregon (Oregon lists TBD; Nebraska’s 10 PM CDT listing is not yet corroborated). Network unpublished: Nebraska at Oregon. Rechecked October 11: Charlotte at Temple 1 PM ET and Louisiana Tech at ULM 8 PM ET (visiting-school schedule and ESPN agree; host still TBA); Penn State at Michigan on CBS (Michigan schedule). Texas–Florida and Alabama–Tennessee keep the published ABC-or-ESPN alternative.';
const notes = snapshot.storylines.find((story) => story.id === 'week7-schedule-notes');
assert.match(notes.body, /Kickoffs for Charlotte–Temple, Louisiana Tech–ULM and Nebraska–Oregon are still officially TBA\.$/);
notes.body = notes.body.replace(/Kickoffs for .*$/, 'Charlotte–Temple is 1 PM ET and Louisiana Tech–ULM 8 PM ET; Penn State–Michigan is on CBS. Nebraska–Oregon’s kickoff is still officially TBA.');
notes.sources = [...new Set([...notes.sources, ...evidence.week7_recheck.checks.filter((c) => c.decision === 'adopt').flatMap((c) => c.schools.filter((s) => s.role === (c.field === 'tv' ? 'home' : 'away')).map((s) => s.url))])];
snapshot.source_urls = [...new Set([
  ...snapshot.source_urls,
  ...evidence.finals.flatMap((f) => f.official.flatMap((o) => [o.url, o.recap_url])).filter(Boolean),
  gs.school.url,
  ...evidence.week7_recheck.checks.flatMap((c) => [c.provider.url, ...c.schools.map((s) => s.url)]),
])];
const evidenceCheckedAt = latest([
  ...evidence.finals.flatMap((f) => f.official.map((o) => o.fetched_at)),
  ...evidence.week7_recheck.checks.flatMap((c) => [c.provider.checked_at, ...c.schools.map((s) => s.fetched_at)]),
]);
// The log stays in application order even though this evidence predates the previous entry.
const appliedAt = latest([evidenceCheckedAt, ...snapshot.refresh_log.map((entry) => entry.applied_at)]);
snapshot.refresh_log = [...snapshot.refresh_log, {
  applied_at: appliedAt, evidence_checked_at: evidenceCheckedAt, script: LOG_SCRIPT, evidence: evidenceFile, scope: evidence.scope,
  finals_corroborated: corroborated, records_confirmed: Object.keys(postGame).length,
  week7_changes: week7Changes, week7_kept: evidence.week7_recheck.checks.filter((c) => c.decision !== 'adopt').map((c) => `${c.provider_id}:${c.field}`),
  differences_recorded: evidence.differences_not_adopted.length,
}];
// Scores, records, standings, board stamps and polls stay exactly as the October 10 refresh left them.
assert.equal(JSON.stringify({
  board_weeks: snapshot.board_weeks, polls: snapshot.polls, pollsStatus: snapshot.pollsStatus, retrieved_at: snapshot.retrieved_at,
  schedule_verified_at: snapshot.schedule_verified_at, results_verified_at: snapshot.results_verified_at,
  teamRecords: snapshot.teamRecords, team_records_review: snapshot.team_records_review, retainedBaseline: snapshot.retainedBaseline,
}), untouched);
if (!process.argv.includes('--dry-run')) writeFileSync(path, `${JSON.stringify(snapshot, null, 1)}\n`);
console.log(`School sources added to ${corroborated.length} October 10 finals; ${Object.keys(postGame).length} records confirmed unchanged. Week 7: ${week7Changes.length} recheck changes. No deploy performed.`);
