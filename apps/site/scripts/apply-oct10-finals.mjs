/** Verify the 44 Saturday October 10 (Week 6) finals the Week 7 release left
 * pending, restore the overall records it withheld, and apply the Week 7
 * kickoff/network recheck, offline.
 * Usage: node scripts/apply-oct10-finals.mjs [--dry-run]
 * A game becomes final only when its ESPN completed-game summary and an official
 * school page agree; an elapsed kickoff is never promoted on time alone, and a
 * missing game is never read as a bye. Week 7 board stamps and the October 4
 * polls are not restamped.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const path = new URL('../data/cfb-2026/refresh/verified-refresh.json', import.meta.url);
const evidenceFile = 'data/cfb-2026/refresh/evidence/2026-10-11-oct10-finals.json';
const snapshot = JSON.parse(readFileSync(path, 'utf8'));
const evidence = JSON.parse(readFileSync(new URL(`../${evidenceFile}`, import.meta.url), 'utf8'));
const easternDate = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
const easternTime = (iso) => new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
const latest = (values) => values.filter(Boolean).sort().at(-1);
const LOG_SCRIPT = 'scripts/apply-oct10-finals.mjs';
if ((snapshot.refresh_log ?? []).some((entry) => entry.script === LOG_SCRIPT)) {
  console.log('October 10 finals already applied; nothing to do.');
  process.exit(0);
}
assert.equal(snapshot.week, 7);
assert.equal(snapshot.reference_date, '2026-10-12');
assert.ok(snapshot.refresh_log.some((entry) => entry.script === 'scripts/apply-week7-release.mjs'));
// The hash covers the whole evidence file except itself (sorted keys, no whitespace).
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  : JSON.stringify(value);
const { content_sha256: sha, ...body } = evidence;
assert.equal(createHash('sha256').update(canonical(body)).digest('hex'), sha, 'evidence content hash');

/* ------------------------------------------------ Oct 10 finals (Week 6) */
const pending = snapshot.scheduledGames.filter((g) => g.week === 6);
assert.equal(pending.length, 44);
assert.equal(evidence.finals.length, 44);
assert.deepEqual(evidence.finals.map((f) => f.provider_id).sort(), pending.map((g) => g.provider_id).sort());
const baseRecords = snapshot.retainedBaseline.overall_records;
const standing = Object.fromEntries(snapshot.retainedBaseline.conferenceStandings.flatMap((c) => c.rows).map((r) => [r.team_slug, r]));
const plus = (record, won) => {
  const [w, l] = record.split('-').map(Number);
  return `${w + Number(won)}-${l + Number(!won)}`;
};
const differences = new Set(evidence.differences_not_adopted.map((d) => `${d.slug}:${d.field}`));
const postGame = {};
const added = [];
for (const final of evidence.finals) {
  const row = pending.find((g) => g.provider_id === final.provider_id);
  const espn = final.espn_summary;
  assert.equal(espn.completed, true, `${final.provider_id} completed`);
  assert.equal(espn.state, 'post');
  assert.equal(espn.status, 'STATUS_FINAL');
  assert.match(espn.detail, /^Final/);
  assert.equal(row.home, final.home);
  assert.equal(row.away, final.away);
  assert.equal(row.date, final.date);
  assert.equal(row.kickoff_utc, final.scheduled_kickoff_utc);
  assert.equal(easternDate(espn.kickoff_utc), row.date, `${final.provider_id} Eastern date`);
  assert.equal(espn.neutral_site, row.neutral_site);
  const home = { ...espn.sides.home, slug: row.home };
  const away = { ...espn.sides.away, slug: row.away };
  assert.notEqual(home.points, away.points);
  for (const [side, other] of [[home, away], [away, home]]) {
    const won = side.points > other.points;
    assert.ok(Number.isInteger(side.points) && side.points >= 0);
    assert.ok(side.line_score.length >= 4 && side.line_score.every((q) => Number.isInteger(q) && q >= 0));
    assert.equal(side.line_score.reduce((a, b) => a + b, 0), side.points, `${final.provider_id} ${side.slug} line score sums to the score`);
    assert.equal(side.line_score.length > 4, /OT/.test(espn.detail), `${final.provider_id} overtime periods`);
    assert.equal(side.winner, won);
    // ESPN's post-game record is the October 10 reconciled record plus this result.
    assert.equal(side.record, plus(baseRecords[side.slug], won), `${side.slug} overall record`);
    const confBefore = `${standing[side.slug].w}-${standing[side.slug].l}`;
    assert.equal(side.conference_record, espn.conference_game ? plus(confBefore, won) : confBefore, `${side.slug} conference record`);
    postGame[side.slug] = { record: side.record, provider_id: final.provider_id, won };
  }
  // At least one official school page reports the same score and winner.
  assert.ok(final.official.some((o) => o.result_text), `${final.provider_id} has an official school result`);
  for (const source of final.official) {
    const [me, them] = source.side === 'home' ? [home, away] : [away, home];
    assert.equal(source.slug, me.slug);
    assert.match(source.url, /^https:\/\//);
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
  const verifiedAt = latest([espn.checked_at, ...final.official.map((o) => o.fetched_at)]);
  const kickoffMoved = espn.kickoff_utc !== row.kickoff_utc;
  // Pre-game corrections and timing notes stay with the game as provenance.
  const pregame = Object.fromEntries(['correction', 'correction_sources', 'announced_kickoff_utc', 'timing_note', 'timing_sources']
    .filter((key) => row[key] != null).map((key) => [key, row[key]]));
  snapshot.playedGames.push({
    provider_id: row.provider_id, source_url: row.source_url, game_id: `${row.date}-${row.away}-at-${row.home}`,
    date: row.date, kickoff_utc: espn.kickoff_utc, week: row.week, home_slug: row.home, away_slug: row.away,
    site: row.site, tv: row.tv, neutral_site: row.neutral_site, verified_at: verifiedAt, title: espn.detail,
    teams: [home, away].map((t) => ({ slug: t.slug, name: standing[t.slug]?.team ?? t.name, points: t.points })),
    meta: {
      as_of: easternDate(verifiedAt),
      sources: [...new Set([espn.url, row.source_url, ...final.official.flatMap((o) => [o.url, o.recap_url])].filter(Boolean))],
      conference_game: espn.conference_game,
      line_score: { [home.slug]: home.line_score, [away.slug]: away.line_score },
      evidence: evidenceFile,
      ...(Object.keys(pregame).length ? { pregame } : {}),
      ...(kickoffMoved ? { originally_scheduled_kickoff_utc: row.kickoff_utc, kickoff_note: 'ESPN completed-game summary lists the actual start; stable Eastern game id retained.' } : {}),
    },
  });
  added.push(row.provider_id);
}
const addedSet = new Set(added);
snapshot.scheduledGames = snapshot.scheduledGames.filter((g) => !addedSet.has(g.provider_id));
assert.equal(snapshot.scheduledGames.filter((g) => g.week === 6).length, 0);
const week6Finals = snapshot.playedGames.filter((g) => g.week === 6 && g.verified_at);
assert.equal(week6Finals.length, 58);
assert.equal(new Set(week6Finals.map((g) => g.game_id)).size, 58);
assert.equal(Object.keys(postGame).length, 88);

/* ----------------------------------------------------------- team records */
const review = snapshot.team_records_review;
assert.equal(review.withheld.length, 26);
const records = { ...snapshot.teamRecords };
// Week 7 already verified the other participants after their October 10 games; ESPN must agree.
for (const [slug, { record }] of Object.entries(postGame)) {
  if (records[slug]) assert.equal(records[slug], record, `${slug} Week 7 record agrees with its October 10 final`);
}
const recomputed = evidence.records.recomputed;
const restored = [];
for (const slug of review.withheld) {
  const r = recomputed[slug];
  if (!r) continue;
  const post = postGame[slug];
  assert.ok(post, `${slug} has a verified October 10 final`);
  assert.equal(r.final_provider_id, post.provider_id);
  assert.equal(r.before, baseRecords[slug]);
  assert.equal(r.record, plus(r.before, post.won));
  assert.equal(r.espn_record, r.record);
  assert.equal(post.record, r.record);
  assert.equal(r.agreement, r.school_record == null ? 'verified-final+provider' : 'school+provider');
  if (r.school_record != null) assert.equal(r.school_record, r.record, `${slug} school record`);
  records[slug] = r.record;
  restored.push(slug);
}
assert.equal(restored.length, 25);
// Georgia State has no October 10 game on either schedule. Its record stands only
// because the school and ESPN publish the same one; no bye is inferred.
const gs = evidence.records.georgia_state;
assert.ok(!postGame['georgia-state'] && review.withheld.includes('georgia-state'));
assert.equal(gs.school.oct10_entry, null);
assert.equal(gs.school.record.overall, gs.espn.record);
assert.equal(gs.adopt, true);
records['georgia-state'] = gs.record;
const stillWithheld = review.withheld.filter((slug) => !records[slug]);
assert.deepEqual(stillWithheld, []);
assert.equal(Object.keys(records).length, 138);
const schoolAgreed = restored.filter((slug) => recomputed[slug].agreement === 'school+provider');
snapshot.teamRecords = records;
snapshot.team_records_review = {
  ...review,
  recompute_rule: evidence.records.rule,
  recomputed_from_2026_10_10_finals: restored,
  school_and_provider_without_oct10_game: ['georgia-state'],
  withheld: stillWithheld,
  note: `Records for 102 of 118 Week 7 participants carry school and provider agreement; ${review.carried_from_2026_10_10.length} teams that have not played since the October 10 ESPN reconciliation keep that record; ${restored.length} teams withheld for an unverified October 10 game now carry that record plus their verified final (ESPN post-game record for all, school record agreement for ${schoolAgreed.length}). Georgia State's school and ESPN records agree with no October 10 game claimed. No record is withheld.`,
};

/* ------------------------------------------------- Week 7 recheck (rows) */
const week7Changes = [];
for (const check of evidence.week7_recheck.checks) {
  const row = snapshot.scheduledGames.find((g) => g.provider_id === check.provider_id);
  assert.ok(row && row.week === 7, `${check.provider_id} on the Week 7 board`);
  assert.equal(`${row.away} at ${row.home}`, check.matchup);
  const host = check.schools.find((s) => s.role === 'home');
  const visitor = check.schools.find((s) => s.role === 'away');
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
const resultsVerifiedAt = latest(week6Finals.filter((g) => addedSet.has(g.provider_id)).map((g) => g.verified_at));
const untouched = {
  week7: JSON.stringify(snapshot.board_weeks[1]),
  polls: snapshot.polls.map((p) => `${p.poll} ${p.release_date}`),
  pollsStatus: snapshot.pollsStatus,
  retrieved_at: snapshot.retrieved_at,
  schedule_verified_at: snapshot.schedule_verified_at,
};
assert.equal(snapshot.board_weeks[0].week, 6);
snapshot.board_weeks[0] = {
  ...snapshot.board_weeks[0],
  results_verified_at: resultsVerifiedAt,
  note: 'Week 6 archive: all 58 FBS-vs-FBS games are verified finals. The 44 Saturday October 10 results were verified October 11 against ESPN completed-game summaries and official school pages.',
};
snapshot.results_verified_at = resultsVerifiedAt;
const isHold = (prefix) => (hold) => hold.startsWith(prefix);
const replaceHold = (prefix, text) => {
  const index = snapshot.holds.findIndex(isHold(prefix));
  assert.ok(index >= 0, prefix);
  snapshot.holds[index] = text;
};
replaceHold('No live in-season scores feed', 'No live in-season scores feed is wired. All 58 Week 6 FBS-vs-FBS games are verified finals; the 44 Saturday October 10 results were verified October 11 against ESPN completed-game summaries and official school pages. Week 7 results need another verified refresh.');
replaceHold('Week 7 official kickoff TBAs', 'Week 7 official kickoff TBA: Nebraska at Oregon (Oregon lists TBD; Nebraska’s 10 PM CDT listing is not yet corroborated). Network unpublished: Nebraska at Oregon. Rechecked October 11: Charlotte at Temple 1 PM ET and Louisiana Tech at ULM 8 PM ET (visiting-school schedule and ESPN agree; host still TBA); Penn State at Michigan on CBS (Michigan schedule). Texas–Florida and Alabama–Tennessee keep the published ABC-or-ESPN alternative.');
replaceHold('Overall records:', `Overall records: 102 of 118 Week 7 participants verified October 11 (school and provider agreement); ${review.carried_from_2026_10_10.length} teams with no game since the October 10 ESPN reconciliation keep that record; ${restored.length} teams withheld for an unverified October 10 game now carry their verified final; Georgia State’s school and ESPN records agree. No record is withheld.`);
const storyIndex = (id) => {
  const index = snapshot.storylines.findIndex((story) => story.id === id);
  assert.ok(index >= 0, id);
  return index;
};
const notes = snapshot.storylines[storyIndex('week7-schedule-notes')];
assert.match(notes.body, /Kickoffs for Charlotte–Temple, Louisiana Tech–ULM and Nebraska–Oregon are still officially TBA\.$/);
notes.body = notes.body.replace(/Kickoffs for .*$/, 'Charlotte–Temple is 1 PM ET and Louisiana Tech–ULM 8 PM ET; Penn State–Michigan is on CBS. Nebraska–Oregon’s kickoff is still officially TBA.');
notes.sources = [...new Set([...notes.sources, ...evidence.week7_recheck.checks.filter((c) => c.decision === 'adopt').flatMap((c) => c.schools.filter((s) => s.role === (c.field === 'tv' ? 'home' : 'away')).map((s) => s.url))])];
const bigTen = snapshot.storylines[storyIndex('week6-saturday-big-ten-finals')];
assert.match(bigTen.body, / Other Saturday results are not yet in this release\.$/);
bigTen.body = bigTen.body.replace(/ Other Saturday results are not yet in this release\.$/, '');
const headline = ['401856712', '401856717', '401856715', '401858484', '401858485', '401858480'];
const story = (id) => {
  const game = week6Finals.find((g) => g.provider_id === id);
  const [home, away] = game.teams;
  const winner = home.points > away.points ? home : away;
  const loser = winner === home ? away : home;
  return { game, winner, loser };
};
const lines = headline.map(story).map(({ game, winner, loser }) => {
  const where = game.neutral_site ? ' in Dallas' : winner.slug === game.home_slug ? ` over ${loser.name}` : ` at ${loser.name}`;
  const ot = /OT/.test(game.title) ? ' in overtime' : '';
  return game.neutral_site
    ? `${winner.name} ${winner.points}–${loser.points} over ${loser.name}${where}${ot}`
    : `${winner.name} ${winner.points}–${loser.points}${where}${ot}`;
});
snapshot.storylines.splice(storyIndex('week6-saturday-big-ten-finals'), 0, {
  id: 'week6-saturday-finals', week: 6, headline: 'Saturday finals: Georgia wins at Alabama; Oklahoma edges Texas',
  body: `October 10: ${lines.join('; ')}. All 44 remaining Saturday FBS-vs-FBS results were verified October 11 against ESPN completed-game summaries and official school pages.`,
  game_provider_id: null, result_provider_ids: added, as_of: '2026-10-11',
  sources: [...new Set(headline.flatMap((id) => week6Finals.find((g) => g.provider_id === id).meta.sources))],
});
const recheckSources = evidence.week7_recheck.checks.flatMap((c) => [c.provider.url, ...c.schools.map((s) => s.url)]);
snapshot.source_urls = [...new Set([
  ...snapshot.source_urls,
  ...week6Finals.filter((g) => addedSet.has(g.provider_id)).flatMap((g) => g.meta.sources),
  gs.espn.url, gs.school.url, ...recheckSources,
])];
snapshot.refresh_log = [...snapshot.refresh_log, {
  applied_at: resultsVerifiedAt, script: LOG_SCRIPT, evidence: evidenceFile, scope: evidence.scope,
  finals_added: added, week6_finals: week6Finals.length,
  records_recomputed: restored, records_school_and_provider: ['georgia-state'], records_withheld: stillWithheld,
  week7_changes: week7Changes, week7_kept: evidence.week7_recheck.checks.filter((c) => c.decision !== 'adopt').map((c) => `${c.provider_id}:${c.field}`),
  differences_recorded: evidence.differences_not_adopted.length,
  untouched_cutoffs: { polls_released: untouched.polls, metrics_through_games: snapshot.metrics.through_games, week6_retrieved_at: snapshot.board_weeks[0].retrieved_at, week7_retrieved_at: snapshot.board_weeks[1].retrieved_at },
}];
// Week 7 stamps, the October 4 polls and the snapshot's own cutoffs stay as reviewed.
assert.equal(JSON.stringify(snapshot.board_weeks[1]), untouched.week7);
assert.deepEqual(snapshot.polls.map((p) => `${p.poll} ${p.release_date}`), untouched.polls);
assert.equal(snapshot.pollsStatus, untouched.pollsStatus);
assert.equal(snapshot.retrieved_at, untouched.retrieved_at);
assert.equal(snapshot.schedule_verified_at, untouched.schedule_verified_at);
if (!process.argv.includes('--dry-run')) writeFileSync(path, `${JSON.stringify(snapshot, null, 1)}\n`);
console.log(`Week 6: ${added.length} October 10 finals verified (${week6Finals.length} total). Records: ${restored.length} recomputed, Georgia State school+provider, ${stillWithheld.length} withheld. Week 7: ${week7Changes.length} recheck changes. No deploy performed.`);
