import assert from "node:assert/strict";

/** Editorial mean ranks; an unranked team counts as 26, ties use AP order. */
export function editorialComposite(polls) {
  const ap = polls.find(p => p.poll === "ap"), coaches = polls.find(p => p.poll === "coaches");
  assert.ok(ap && coaches);
  const rows = new Map();
  for (const poll of [ap, coaches]) for (const row of poll.rankings) {
    const entry = rows.get(row.team_slug) ?? { ...row, ranks: {} };
    entry.ranks[poll.poll] = row.rank; rows.set(row.team_slug, entry);
  }
  const ranked = [...rows.values()].sort((a, b) => ((a.ranks.ap ?? 26) + (a.ranks.coaches ?? 26)) - ((b.ranks.ap ?? 26) + (b.ranks.coaches ?? 26)) || (a.ranks.ap ?? 26) - (b.ranks.ap ?? 26));
  return { poll: "composite", name: "CFB Apex Composite", release_date: ap.release_date, rankings: ranked.map((row, i) => ({ rank:i+1, team_slug:row.team_slug, team:row.team, record:row.record, points:null, first_place_votes:null, previous_rank:null, tied:false })), others:[] };
}

/** Apply an independently reviewed inventory; records are replaced, never incremented. */
export function reconcileGameDay(snapshot, review) {
  const next = structuredClone(snapshot);
  const incoming = new Set();
  const played = new Map(next.playedGames.map(row => [row.provider_id ?? `legacy:${row.game_id}`, row]));
  for (const row of review.finals) {
    assert.ok(row.provider_id && !incoming.has(row.provider_id), "Duplicate provider event in review");
    incoming.add(row.provider_id);
    assert.equal(row.teams.length, 2);
    assert.ok(row.teams.every(team => Number.isInteger(team.points) && team.points >= 0), "Final scores must be known nonnegative integers");
    const key = [...played.keys()].find(key => key === row.provider_id || played.get(key).game_id === row.game_id);
    const before = key ? played.get(key) : undefined;
    if (before) assert.equal(before.game_id, row.game_id, "A provider event cannot change participants/date");
    const updated = structuredClone(row);
    const history = before?.meta?.correction_history ?? [];
    const oldScore = before?.teams.map(team => [team.slug, team.points]).sort();
    const newScore = row.teams.map(team => [team.slug, team.points]).sort();
    if (before && JSON.stringify(oldScore) !== JSON.stringify(newScore)) {
      updated.meta = { ...updated.meta, correction_history: [...history, { previous: before.teams, previous_verified_at: before.verified_at, corrected_at: review.observedAt }] };
    } else if (history.length) updated.meta = { ...updated.meta, correction_history: history };
    if (key && key !== row.provider_id) played.delete(key);
    played.set(row.provider_id, updated);
  }
  next.playedGames = [...played.values()];
  const scheduleIds = new Set();
  for (const row of review.scheduled) {
    assert.ok(row.provider_id && !scheduleIds.has(row.provider_id) && !incoming.has(row.provider_id));
    scheduleIds.add(row.provider_id);
    assert.ok(["scheduled", "postponed", "canceled", "delayed"].includes(row.game_status));
    if (row.kickoff_status === "official_tbd") assert.equal(row.kickoff_utc, null);
  }
  next.scheduledGames = [...next.scheduledGames.filter(row => !review.scheduleWeeks.includes(row.week) && !incoming.has(row.provider_id)), ...structuredClone(review.scheduled)];
  next.teamRecords = structuredClone(review.records);
  for (const conference of next.retainedBaseline.conferenceStandings) for (const row of conference.rows) {
    assert.ok(review.records[row.team_slug] && review.conferenceRecords[row.team_slug]);
    const [wins, losses] = review.conferenceRecords[row.team_slug].split("-").map(Number);
    Object.assign(row, { w: String(wins), l: String(losses), overall: review.records[row.team_slug], pct: wins + losses ? (wins / (wins + losses)).toFixed(3) : ".000" });
  }
  next.retainedBaseline.overall_records = structuredClone(review.records);
  return next;
}
