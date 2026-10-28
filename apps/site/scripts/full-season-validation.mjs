import assert from "node:assert/strict";
import { ncaaInventory } from "./gameday-source-validation.mjs";

const etDate = value => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));

/** Reconcile the complete season, including games intentionally outside the FBS-only interface. */
export function verifyFullSeason(snapshot, audit, idToSlug, docs) {
  assert.equal(audit.finals.length, 568);
  assert.equal(snapshot.playedGames.length, 446, "Unexpected published final row count");
  const games = new Map(snapshot.playedGames.map(game => [game.provider_id, game]));
  assert.equal(games.size, snapshot.playedGames.length, "Duplicate provider identity in published finals");
  const logical = new Set(), records = new Map(Object.keys(snapshot.teamRecords).map(slug => [slug, [0, 0]]));
  let events, ncaa;
  if (docs) {
    const dayIds = [...audit.raw_sources.filter(row => row.id.startsWith("history-")).map(row => row.id), ...Array.from({ length: 12 }, (_, i) => `day-${i + 20}`)];
    assert.equal(dayIds.length, 71);
    const rows = dayIds.flatMap(id => JSON.parse(docs.get(id)).events);
    assert.equal(rows.length, 622); events = new Map(rows.map(row => [row.id, row]));
    assert.equal(events.size, 622, "Repeated event or overlapping calendar day");
    assert.equal(rows.filter(row => row.competitions[0].status.type.completed).length, 568);
    const inventories = Array.from({ length: 9 }, (_, i) => i + 1).flatMap(week => ncaaInventory(docs.get(week < 8 ? `ncaa-history-${week}` : `ncaa${week}`), 2026, week));
    assert.equal(inventories.length, 622, "Unexpected NCAA inventory row count");
    ncaa = new Map(inventories.map(row => [row.contestId, row])); assert.equal(ncaa.size, inventories.length, "Duplicate NCAA contest identity");
  }
  const seenNcaa = new Set();
  for (const row of audit.finals) {
    assert.ok(!seenNcaa.has(row.ncaa_contest_id)); seenNcaa.add(row.ncaa_contest_id);
    assert.ok(row.state.completed); assert.equal(row.state.state, "post"); assert.equal(row.ncaa_status, "F");
    assert.notEqual(row.home_score, row.away_score);
    const key = `${row.date}:${[row.home_name, row.away_name].sort().join(":")}`;
    assert.ok(!logical.has(key), "Duplicate final identity"); logical.add(key);
    for (const [side, other] of [["home", "away"], ["away", "home"]]) {
      const slug = row[`${side}_slug`];
      if (slug) records.get(slug)[row[`${side}_score`] > row[`${other}_score`] ? 0 : 1]++;
    }
    if (row.home_slug && row.away_slug) {
      const published = games.get(row.provider_id); assert.ok(published, `Missing FBS final ${row.provider_id}`);
      assert.equal(published.date, row.date); assert.equal(published.home_slug, row.home_slug); assert.equal(published.away_slug, row.away_slug);
      assert.deepEqual(Object.fromEntries(published.teams.map(t => [t.slug, t.points])), { [row.home_slug]: row.home_score, [row.away_slug]: row.away_score });
      assert.deepEqual(published.meta.full_season_review.line_score, row.line_score);
    } else {
      const excluded = snapshot.excludedGames.find(game => game.provider_id === row.provider_id); assert.ok(excluded, "Missing FCS evidence");
      assert.equal(excluded.home_score, row.home_score); assert.equal(excluded.away_score, row.away_score);
    }
    if (docs) {
      const event = events.get(row.provider_id); assert.ok(event); const c = event.competitions[0];
      assert.equal(etDate(event.date), row.date); assert.equal(c.status.type.completed, true); assert.equal(c.status.type.state, "post"); assert.equal(c.status.period, row.period);
      assert.equal(c.neutralSite === true, row.neutral_site); assert.equal(c.venue?.fullName ?? null, row.site);
      for (const side of ["home", "away"]) {
        const team = c.competitors.find(t => t.homeAway === side);
        assert.equal(idToSlug.get(team.team.id) ?? null, row[`${side}_slug`]); assert.equal(team.team.location, row[`${side}_name`]); assert.equal(Number(team.score), row[`${side}_score`]);
        const lines = team.linescores?.map(q => q.value); assert.deepEqual(lines, row.line_score[idToSlug.get(team.team.id) ?? team.team.id]);
        assert.equal(lines.reduce((a, b) => a + b, 0), Number(team.score));
      }
      const primary = ncaa.get(row.ncaa_contest_id); assert.ok(primary); assert.equal(primary.gameState, "F");
      const facts = teams => teams.map(t => ({ name: t.seoname, score: t.score, home: t.isHome, conference: t.conferenceSeo }));
      assert.deepEqual(facts(primary.teams), facts(row.ncaa_teams));
      assert.equal(primary.startTimeEpoch * 1000, Date.parse(row.ncaa_listed_kickoff_utc));
    }
  }
  assert.equal(snapshot.excludedGames.length, 122);
  assert.deepEqual(Object.fromEntries([...records].map(([slug, totals]) => [slug, totals.join("-")])), snapshot.teamRecords, "Whole-team totals differ from independently verified official records");
  for (const [alias, canonical] of Object.entries(snapshot.gameAliases)) {
    assert.ok(!snapshot.playedGames.some(game => game.game_id === alias)); assert.ok(snapshot.playedGames.some(game => game.game_id === canonical));
  }
  return { completed: 568, fbsFinals: 446, fcsFinals: 122, records: records.size, calendarDays: docs ? 71 : null, ncaaWeeks: docs ? 9 : null };
}
