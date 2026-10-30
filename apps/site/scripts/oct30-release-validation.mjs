import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "parse5";
import { htmlTables, htmlText, ncaaInventory, schoolBlocks, tvPattern } from "./gameday-source-validation.mjs";
import { OCT30_SEASON, verifyFullSeason } from "./full-season-validation.mjs";
import { editorialComposite } from "./reconcile-gameday.mjs";

export const OCT30_SCRIPT = "gameday-results-2026-10-30";
/** Week 8 keeps 56 finals; Week 9 has six finals (October 27–29) and 50 upcoming games. */
export const OCT30_RELEASE = Object.freeze({ finals: 62, week8Finals: 56, week9Finals: 6, upcoming: 50, records: 138 });
export const OCT30_NEW_FINALS = Object.freeze(["401871058", "401871057", "401862812", "401869963"]);

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));

/** "2026-10-29" -> "Thursday, October 29, 2026", as NCAA prints its statistics cutoff. */
export function throughGamesLabel(date) {
  assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${date}T12:00:00Z`));
}

export function throughGamesDate(html) {
  const match = htmlText(html).match(/Through games \w+, (\w+ \d{1,2}, \d{4})/);
  assert.ok(match, "NCAA statistics cutoff missing");
  const date = new Date(`${match[1]} 12:00 UTC`).toISOString().slice(0, 10);
  assert.ok(htmlText(html).includes(`Through games ${throughGamesLabel(date)}`));
  return date;
}

/** Official box-score line score: one row per team, quarter values then the total. */
export function boxScoreRows(html) {
  const table = htmlTables(html).find(rows => rows[0]?.[0] === "Team" && /Total/i.test(rows[0].at(-1) ?? ""));
  assert.ok(table, "Official box-score line score missing");
  const rows = table.slice(1).map(row => ({ label: row[0], values: row.slice(1).map(Number) }));
  assert.equal(rows.length, 2, "Official box score must list exactly two teams");
  assert.ok(rows.every(row => row.values.length >= 5 && row.values.every(Number.isInteger)), "Official line score is incomplete");
  return rows;
}

function inertiaArticle(html) {
  let data;
  function visit(node) {
    const attr = node.attrs?.find(a => a.name === "data-page");
    if (attr) data = JSON.parse(attr.value);
    for (const child of node.childNodes ?? []) visit(child);
  }
  visit(parse(html));
  assert.ok(data?.props?.article?.content_blocks, "Official SEC article payload missing");
  return htmlText(data.props.article.content_blocks.map(b => b.data.paragraph ?? "").join(" "));
}

export function standingsRecords(body, ids) {
  const records = {}, conferenceRecords = {};
  const entries = JSON.parse(body).children.flatMap(c => c.standings?.entries ?? c.children?.flatMap(x => x.standings?.entries ?? []) ?? []);
  for (const r of entries) { const slug = ids.get(r.team.id); assert.ok(slug); records[slug] = r.stats.find(s => s.type === "total").summary; conferenceRecords[slug] = r.stats.find(s => s.type === "vsconf").summary; }
  assert.equal(Object.keys(records).length, 138);
  return { records, conferenceRecords };
}

/** Every official record source used by the October 28 release, re-read for the current values. */
export function primaryRecordFailures(primaryRecords, docs, events, ids) {
  const failures = [];
  const secText = inertiaArticle(docs.get("sec-preview"));
  for (const r of primaryRecords) {
    try {
      if (r.source_id.startsWith("standing-")) {
        const table = htmlTables(docs.get(r.source_id))[0], header = table[0];
        const row = table.find(row => row[0] === r.source_school);
        assert.ok(row, `Official standing absent ${r.slug}`);
        assert.equal(row[header.indexOf("Overall")], r.overall, `Official overall record ${r.slug}`);
        assert.equal(row[header.indexOf("Conf") >= 0 ? header.indexOf("Conf") : header.indexOf("ACC")], r.conference, `Official conference record ${r.slug}`);
      } else if (r.source_id === "official-sunbelt") {
        assert.ok(htmlText(docs.get(r.source_id)).includes(`${r.source_school} (${r.overall}-0, ${r.conference}-0)`), `Sun Belt record changed ${r.slug}`);
      } else if (r.source_id === "sec-preview") {
        assert.ok(secText.includes(`${r.source_school} ${r.overall} (${r.conference} SEC)`), `SEC record changed ${r.slug}`);
      } else if (r.source_id === "school-uconn") {
        assert.match(htmlText(docs.get(r.source_id)), /Overall Wins 4 Losses 3/);
        assert.equal(r.overall, "4-3");
      } else {
        assert.equal(r.source_id, "navy-preview-indexed");
        assert.equal(r.source_published_at, "2026-10-26");
        assert.equal(r.overall, "6-1");
        assert.ok(!events.some(e => e.week.number === 9 && e.competitions[0].competitors.some(t => ids.get(t.team.id) === "notre-dame") && e.competitions[0].status.type.completed), "A new Notre Dame final requires new primary record evidence");
      }
    } catch (error) { failures.push({ slug: r.slug, source_id: r.source_id, message: error.message }); }
  }
  return failures;
}

/** Verify the October 30 release against freshly retrieved source bodies keyed by evidence id. */
export function verifyOct30Release(snapshot, evidence, fullSeason, docs) {
  assert.equal(snapshot.refresh_log.at(-1).script, OCT30_SCRIPT);
  assert.notEqual(evidence.preliminary, true, "Preliminary evidence cannot be published; capture the final evidence");
  const original = read("data/cfb-2026/refresh/evidence/2026-10-20-week8-release.json");
  const prior = read("data/cfb-2026/refresh/evidence/2026-10-25-week9-preparation.json");
  const ids = new Map(original.conferences.flatMap(c => c.rows).map(r => [r.id, r.slug]));
  const events = Array.from({ length: 12 }, (_, i) => i + 20).flatMap(day => JSON.parse(docs.get(`day-${day}`)).events);
  assert.equal(new Set(events.map(e => e.id)).size, events.length, "Duplicate provider event");
  assert.equal(events.length, 112, "New or omitted FBS game requires reconciliation");
  const inventories = new Map([8, 9].map(week => [week, ncaaInventory(docs.get(`ncaa${week}`), 2026, week)]));
  for (const week of [8, 9]) assert.equal(inventories.get(week).length, 56, `NCAA Week ${week} inventory`);
  assert.equal(evidence.finals.length, OCT30_RELEASE.finals); assert.equal(evidence.schedule.length, OCT30_RELEASE.upcoming);
  assert.equal(evidence.finals.filter(r => r.week === 9).length, OCT30_RELEASE.week9Finals);
  assert.deepEqual(evidence.new_finals, [...OCT30_NEW_FINALS]);
  const published = [...evidence.finals, ...evidence.schedule];
  assert.deepEqual(new Set(events.map(e => e.id)), new Set(published.map(r => r.provider_id)), "Changed event inventory");
  assert.deepEqual(new Set(events.filter(e => e.competitions[0].status.type.completed).map(e => e.id)), new Set(evidence.finals.map(r => r.provider_id)), "A changed final requires candidate reconciliation");
  assert.equal(snapshot.playedGames.filter(r => r.week === 9).length, OCT30_RELEASE.week9Finals);
  assert.equal(snapshot.scheduledGames.length, OCT30_RELEASE.upcoming);
  const seen = new Set(), matchedNcaa = new Set();
  for (const row of published) {
    const event = events.find(e => e.id === row.provider_id), c = event.competitions[0];
    const home = c.competitors.find(t => t.homeAway === "home"), away = c.competitors.find(t => t.homeAway === "away");
    const h = ids.get(home.team.id), a = ids.get(away.team.id);
    assert.equal(h, row.home_slug); assert.equal(a, row.away_slug);
    assert.equal(event.season.year, 2026); assert.equal(event.week.number, row.week);
    const logical = `${row.date}:${a}:${h}`;
    assert.ok(!seen.has(logical), "Duplicate scheduled/final game"); seen.add(logical);
    const ncaa = inventories.get(row.week).find(n => row.week === 8
      ? prior.finals.find(r => r.id === event.id)?.source_urls.includes(`https://www.ncaa.com${n.url}`)
      : n.contestId === prior.schoolEvidence.find(s => s.id === event.id)?.ncaa.contestId);
    assert.ok(ncaa, `NCAA game missing ${event.id}`);
    assert.ok(!matchedNcaa.has(ncaa.contestId)); matchedNcaa.add(ncaa.contestId);
    assert.equal(c.neutralSite === true, row.neutral_site); assert.equal(c.venue?.fullName ?? null, row.site);
    if (row.teams) {
      assert.equal(c.status.type.completed, true); assert.equal(c.status.type.state, "post"); assert.equal(ncaa.gameState, "F", `NCAA final missing ${event.id}`);
      const saved = snapshot.playedGames.find(r => r.provider_id === event.id);
      assert.equal(saved.game_id, row.game_id);
      assert.ok(!snapshot.scheduledGames.some(r => r.provider_id === event.id));
      for (const [side, team] of [[true, home], [false, away]]) {
        const slug = ids.get(team.team.id), score = Number(team.score), lines = team.linescores.map(q => q.value);
        assert.equal(row.teams.find(t => t.slug === slug).points, score);
        assert.equal(saved.teams.find(t => t.slug === slug).points, score);
        assert.equal(ncaa.teams.find(t => t.isHome === side).score, score);
        assert.deepEqual(saved.meta.line_score[slug], lines); assert.equal(lines.reduce((x, y) => x + y, 0), score);
      }
      assert.equal(c.status.period, saved.meta.line_score[h].length, "Overtime period changed");
      if (OCT30_NEW_FINALS.includes(event.id)) assert.equal(saved.title, c.status.type.detail);
      assert.equal(Date.parse(event.date), Date.parse(saved.meta.listed_kickoff_observations.espn));
      assert.equal(ncaa.startTimeEpoch * 1000, Date.parse(saved.meta.listed_kickoff_observations.ncaa));
    } else {
      assert.equal(c.status.type.completed, false); assert.equal(ncaa.gameState, "P");
      const saved = snapshot.scheduledGames.find(r => r.provider_id === event.id);
      assert.ok(saved);
      assert.equal(Date.parse(event.date), Date.parse(row.announced_kickoff_utc));
      assert.equal(Date.parse(row.ncaa_listed_kickoff_utc), ncaa.startTimeEpoch * 1000);
      if (row.kickoff_utc === null) { assert.equal(row.kickoff_status, "official_tbd"); assert.equal(ncaa.hasStartTime, false); }
      else {
        assert.equal(c.timeValid, true); assert.equal(Date.parse(event.date), Date.parse(row.kickoff_utc));
        if (row.official_tv.source_id) {
          // A later network move on the host school's own game card supersedes the older NCAA article line.
          const blocks = schoolBlocks(docs.get(row.official_tv.source_id), Number(row.date.slice(8)), [row.official_tv.opponent]);
          assert.ok(blocks.some(b => b.includes(row.official_tv.observed_text) && b.includes(`Event Time ${row.official_tv.time}`)), `Official school TV assignment changed ${h}`);
        } else assert.ok(htmlText(docs.get("tv-ncaa")).includes(row.official_tv.observed_text), `Official TV assignment changed ${h}`);
        assert.ok(tvPattern(row.tv).test(row.official_tv.tv));
        const literal = row.official_tv.time.match(/(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?/i);
        assert.ok(literal);
        const localTime = new Intl.DateTimeFormat("en-GB", { timeZone: row.official_tv.time_zone ?? "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(row.kickoff_utc));
        assert.equal(localTime, `${String(+literal[1] % 12 + (literal[3].toLowerCase() === "p" ? 12 : 0)).padStart(2, "0")}:${literal[2] ?? "00"}`, "Official announced time differs");
        assert.equal(saved.tv, row.tv); assert.equal(saved.kickoff_utc, row.kickoff_utc);
      }
      assert.ok(c.broadcasts.flatMap(b => b.names).includes(row.tv));
    }
  }
  assert.equal(matchedNcaa.size, 112);
  // Each new final also needs at least one official school box score with the
  // same quarter-by-quarter line, including overtime.
  const corroborated = new Set();
  for (const source of evidence.school_corroboration) {
    assert.ok(OCT30_NEW_FINALS.includes(source.provider_id));
    const saved = snapshot.playedGames.find(r => r.provider_id === source.provider_id);
    const rows = boxScoreRows(docs.get(source.source_id));
    for (const side of ["home", "away"]) {
      const slug = saved[`${side}_slug`], line = rows.find(r => r.label === source[`${side}_label`]);
      assert.ok(line, `Official box score team row changed ${source.source_id}`);
      assert.deepEqual(line.values, [...saved.meta.line_score[slug], saved.teams.find(t => t.slug === slug).points], `Official box score differs ${source.source_id}`);
    }
    corroborated.add(source.provider_id);
  }
  assert.deepEqual([...corroborated].sort(), [...OCT30_NEW_FINALS].sort(), "Every new final requires an official school box score");
  const { records, conferenceRecords } = standingsRecords(docs.get("espn-standings"), ids);
  assert.deepEqual(records, evidence.records); assert.deepEqual(records, snapshot.teamRecords); assert.deepEqual(conferenceRecords, evidence.conferenceRecords);
  assert.equal(new Set(evidence.primaryRecords.map(r => r.slug)).size, 138);
  for (const r of evidence.primaryRecords) { assert.equal(r.overall, records[r.slug]); assert.equal(r.conference, conferenceRecords[r.slug]); }
  assert.deepEqual(primaryRecordFailures(evidence.primaryRecords, docs, events, ids), [], "Official record sources disagree");
  for (const conf of snapshot.retainedBaseline.conferenceStandings) for (const r of conf.rows) { assert.equal(r.overall, records[r.team_slug]); assert.equal(`${r.w}-${r.l}`, conferenceRecords[r.team_slug]); }
  // Official records are whole-team totals, independently corroborated. In
  // particular LSU's FCS win must not disappear with the FBS-only UI filter.
  assert.equal(records.lsu, "6-2");
  for (const poll of JSON.parse(docs.get("rankings")).rankings.filter(p => ["1", "2"].includes(p.id))) {
    const saved = snapshot.polls.find(p => p.poll === (poll.id === "1" ? "ap" : "coaches"));
    assert.equal(poll.date.slice(0, 10), saved.release_date);
    const table = htmlTables(docs.get(poll.id === "1" ? "ap-ncaa" : "coaches")).find(t => t[0].includes(poll.id === "1" ? "SCHOOL" : "PTS"));
    assert.equal(table.length - 1, 25);
    poll.ranks.forEach((r, i) => { const s = saved.rankings[i], p = table[i + 1]; assert.equal(ids.get(r.team.id), s.team_slug); assert.equal(r.current, s.rank); assert.equal(r.points, s.points); assert.equal(r.recordSummary, s.record); assert.equal(Number(p[0].replace(/\D/g, "")), s.rank); assert.equal(Number(p[poll.id === "1" ? 2 : 3].replaceAll(",", "")), s.points); assert.equal(p[poll.id === "1" ? 3 : 2], s.record); });
  }
  assert.deepEqual(editorialComposite(snapshot.polls).rankings, snapshot.polls.find(p => p.poll === "composite").rankings);
  assert.deepEqual(snapshot.metrics, evidence.metrics);
  for (const [id, column, category] of [["stat-passing", "Pass Yds", 0], ["stat-rushing", "Rush Yds", 1], ["stat-scoring", "PPG", 2], ["stat-defense", "Avg", 3]]) {
    const html = docs.get(id), saved = snapshot.metrics.categories[category];
    assert.equal(throughGamesDate(html), saved.through_games); assert.equal(saved.through_games, snapshot.metrics.through_games);
    const table = htmlTables(html)[0], header = table[0];
    assert.equal(saved.rows.length, 5);
    saved.rows.forEach((r, i) => { const s = table[i + 1]; assert.equal(s[header.indexOf("Name")] ?? s[header.indexOf("Team")], r.name); assert.equal(s[header.indexOf("Team")], r.team); assert.equal(Number(s[header.indexOf(column)]), r.value); });
  }
  assert.match(htmlText(docs.get("usc-preview")), /out indefinitely/);
  assert.match(htmlText(docs.get("espn-week9")), /College GameDay Built by The Home Depot in Bloomington/);
  const fullSeasonAcceptance = verifyFullSeason(snapshot, fullSeason, ids, docs, OCT30_SEASON);
  return { fullSeason: fullSeasonAcceptance, finals: OCT30_RELEASE.finals, newFinals: OCT30_NEW_FINALS.length, schoolBoxScores: evidence.school_corroboration.length, upcoming: OCT30_RELEASE.upcoming, records: 138, metricsThrough: snapshot.metrics.through_games, daysFetched: "12/12" };
}
