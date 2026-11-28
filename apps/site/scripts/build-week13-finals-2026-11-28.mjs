/**
 * Publishes every completed Tuesday–Friday Week 13 game as a verified final.
 *
 * Captures the ESPN scoreboard for each completed game date and the official
 * NCAA Week 13 FBS scoreboard, requires both to list each game as final with
 * the same score, then moves the game from the reviewed schedule to the
 * reviewed finals and records every affected team's overall record from the
 * same ESPN capture. Re-verifies the finals already on the board in the same
 * pass so the whole partial results review shares one capture time.
 *
 *   node scripts/build-week13-finals-2026-11-28.mjs
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { ncaaInventory } from "./gameday-source-validation.mjs";

const SNAPSHOT = new URL("../data/cfb-2026/refresh/verified-refresh.json", import.meta.url);
const EVIDENCE_PATH = "data/cfb-2026/refresh/evidence/2026-11-28-week13-finals.json";
const EVIDENCE = new URL(`../${EVIDENCE_PATH}`, import.meta.url);
const SCRIPT = "week13-finals-2026-11-28";
const WEEK = 13;
const ESPN_DATES = ["20261124", "20261126", "20261127"];
const espnUrl = (date) => `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=${date}&groups=80&limit=200`;
const NCAA_URL = "https://www.ncaa.com/scoreboard/football/fbs/2026/13";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 CFB-Apex-verification/1.0";

async function capture(url) {
  const response = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,application/json;q=0.9,*/*;q=0.8" }, signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200, url);
  const body = await response.text();
  const checkedAt = new Date().toISOString();
  return { body, source: { url, checkedAt, status: response.status, sha256: createHash("sha256").update(body).digest("hex"), bytes: Buffer.byteLength(body) } };
}

const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
const espnCaptures = [];
for (const date of ESPN_DATES) espnCaptures.push({ date, ...(await capture(espnUrl(date))) });
const ncaaCapture = await capture(NCAA_URL);
const ncaa = ncaaInventory(ncaaCapture.body, 2026, WEEK);

const eventsById = new Map();
for (const { date, body } of espnCaptures) {
  for (const event of JSON.parse(body).events) eventsById.set(event.id, { event, date });
}

const ap = Object.fromEntries((snapshot.polls.find((poll) => poll.poll === "ap")?.rankings ?? []).map((row) => [row.team_slug, row.rank]));
const names = new Map();
for (const row of snapshot.playedGames) for (const team of row.teams ?? []) if (team.slug && team.name) names.set(team.slug, team.name);

const finals = [];
const records = {};
const newPlayed = [];
const movedIds = new Set();

function reviewGame(row, existing) {
  const hit = eventsById.get(row.provider_id);
  assert.ok(hit, `ESPN capture is missing ${row.provider_id}`);
  const { event, date } = hit;
  const competition = event.competitions[0];
  assert.equal(competition.status.type.state, "post", row.provider_id);
  assert.equal(competition.status.type.completed, true, row.provider_id);
  assert.equal(row.neutral_site, false, `${row.provider_id} neutral-site ids are out of scope`);
  const ncaaUrl = (existing ? existing.meta.sources : row.timing_sources).find((url) => /ncaa\.com\/game\/\d+$/.test(url));
  assert.ok(ncaaUrl, `${row.provider_id} has no NCAA contest`);
  const contestId = Number(ncaaUrl.match(/(\d+)$/)[1]);
  const contest = ncaa.find((game) => game.contestId === contestId);
  assert.equal(contest?.gameState, "F", `${row.provider_id} NCAA state`);
  const home = existing ? existing.home_slug : row.home;
  const away = existing ? existing.away_slug : row.away;
  const gameId = existing ? existing.game_id : `${row.date}-${away}-at-${home}`;
  const sides = [["home", home], ["away", away]];
  const teams = sides.map(([side, slug]) => {
    const primary = competition.competitors.find((team) => team.homeAway === side);
    const corroboration = contest.teams.find((team) => team.isHome === (side === "home"));
    const score = Number(primary.score);
    assert.equal(corroboration.score, score, `${gameId} ${side} score disagrees between ESPN and NCAA`);
    const periods = primary.linescores.map((period) => period.value);
    assert.equal(periods.reduce((sum, value) => sum + value, 0), score, `${gameId} ${side} quarter sum`);
    const record = primary.records.find((entry) => entry.type === "total")?.summary;
    assert.match(record ?? "", /^\d+-\d+$/, `${gameId} ${side} record`);
    const name = names.get(slug) ?? primary.team.displayName;
    return { slug, side, espnId: primary.team.id, ncaaSlug: corroboration.seoname, name, score, periods, record };
  });
  const tv = existing ? existing.tv : row.tv;
  const networks = competition.broadcasts.flatMap((entry) => entry.names);
  const tvListed = tv == null || networks.includes(tv);
  const kickoff = existing ? existing.kickoff_utc : row.kickoff_utc;
  const final = {
    gameId,
    providerId: event.id,
    ncaaId: contestId,
    officialRecap: existing ? existing.source_url : ncaaUrl,
    network: tv,
    espnNetworks: networks,
    networkListedByEspn: tvListed,
    scheduledKickoff: kickoff,
    espnKickoff: event.date,
    ncaaKickoff: new Date(contest.startTimeEpoch * 1000).toISOString(),
    espnDate: date,
    teams: teams.map(({ slug, side, espnId, ncaaSlug, name, score, periods, record }) => ({ slug, side, espnId, ncaaSlug, name, score, periods, record })),
  };
  finals.push(final);
  for (const team of teams) records[team.slug] = team.record;
  return { final, teams, event, competition, ncaaUrl, date, contest, kickoff, tv };
}

const weekScheduled = snapshot.scheduledGames.filter((row) => row.week === WEEK);
const weekPlayed = snapshot.playedGames.filter((row) => row.week === WEEK);
const completed = weekScheduled.filter((row) => eventsById.get(row.provider_id)?.event.competitions[0].status.type.completed);

for (const existing of weekPlayed) reviewGame({ provider_id: existing.provider_id, neutral_site: existing.neutral_site }, existing);
for (const row of completed) {
  const { teams, event, competition, ncaaUrl, date, contest, kickoff, tv } = reviewGame(row, null);
  const home = teams.find((team) => team.side === "home");
  const away = teams.find((team) => team.side === "away");
  newPlayed.push({
    provider_id: row.provider_id,
    source_url: ncaaUrl,
    game_id: `${row.date}-${row.away}-at-${row.home}`,
    date: row.date,
    kickoff_utc: kickoff,
    week: WEEK,
    home_slug: row.home,
    away_slug: row.away,
    site: row.site,
    tv,
    neutral_site: false,
    verified_at: null,
    title: "Final",
    teams: [home, away].map((team) => ({ slug: team.slug, points: team.score, name: team.name })),
    meta: {
      as_of: row.date,
      sources: [espnUrl(date), ncaaUrl],
      conference_game: Boolean(competition.conferenceCompetition),
      line_score: Object.fromEntries([home, away].map((team) => [team.slug, team.periods])),
      pregame_ap_ranks: Object.fromEntries([home, away].map((team) => [team.slug, ap[team.slug] ?? null])),
      originally_scheduled_kickoff_utc: kickoff,
      listed_kickoff_observations: { espn: event.date, ncaa: new Date(contest.startTimeEpoch * 1000).toISOString(), actual_start: null },
      reviewed_status: { espn: { name: competition.status.type.name, state: competition.status.type.state, completed: competition.status.type.completed }, ncaa: "F" },
    },
    lines: [null, null],
  });
  movedIds.add(row.provider_id);
}

// Every NCAA final in the Week 13 FBS inventory is accounted for.
const reviewedNcaa = new Set(finals.map((row) => row.ncaaId));
for (const game of ncaa.filter((row) => row.gameState === "F")) assert.ok(reviewedNcaa.has(game.contestId), `NCAA final ${game.contestId} was not reviewed`);

const espnSources = espnCaptures.map(({ source }) => source);
const checkedAt = [...espnSources, ncaaCapture.source].map((source) => source.checkedAt).sort().at(-1);
const espnCheckedAt = espnSources.map((source) => source.checkedAt).sort().at(-1);

for (const row of newPlayed) row.verified_at = checkedAt;
snapshot.playedGames = snapshot.playedGames.map((row) => (row.week === WEEK ? { ...row, verified_at: checkedAt } : row));
const insertAt = snapshot.playedGames.findLastIndex((row) => row.week === WEEK) + 1;
snapshot.playedGames.splice(insertAt, 0, ...newPlayed.sort((a, b) => a.kickoff_utc.localeCompare(b.kickoff_utc) || a.game_id.localeCompare(b.game_id)));
snapshot.scheduledGames = snapshot.scheduledGames.filter((row) => !movedIds.has(row.provider_id));

const finalsCount = finals.length;
const saturdayCount = snapshot.scheduledGames.filter((row) => row.week === WEEK).length;
const board = snapshot.board_weeks.find((row) => row.week === WEEK);
board.results_verified_at = checkedAt;
board.results_partial = true;
board.note = `Week 13 covers 69 FBS-vs-FBS games. All ${finalsCount} Tuesday–Friday games are verified finals. The remaining ${saturdayCount} Saturday fixtures retain the November 23 schedule review.`;
snapshot.results_verified_at = checkedAt;
snapshot.baseline_note = snapshot.baseline_note.replace(/Two Friday finals are verified on the Week 13 board\./, `All ${finalsCount} Tuesday–Friday finals are verified on the Week 13 board.`);
assert.ok(snapshot.baseline_note.includes(`All ${finalsCount} Tuesday–Friday finals`), "baseline note was not updated");
snapshot.team_records_review.partial_update = {
  as_of: espnCheckedAt,
  records: Object.fromEntries(Object.entries(records).sort(([a], [b]) => a.localeCompare(b))),
  source_url: espnUrl(ESPN_DATES.at(-1)),
  source_urls: espnSources.map((source) => source.url),
};
snapshot.refresh_log.push({
  applied_at: new Date().toISOString(),
  evidence_checked_at: checkedAt,
  script: SCRIPT,
  evidence: EVIDENCE_PATH,
  scope: `All ${finalsCount} Tuesday–Friday Week 13 finals and the ${Object.keys(records).length} teams' overall records`,
});

const evidence = {
  checkedAt,
  espn: espnSources,
  ncaa: ncaaCapture.source,
  finals: finals.sort((a, b) => a.scheduledKickoff.localeCompare(b.scheduledKickoff) || a.gameId.localeCompare(b.gameId)),
};
writeFileSync(EVIDENCE, `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(SNAPSHOT, `${JSON.stringify(snapshot)}\n`);
console.log(JSON.stringify({
  checkedAt,
  finals: finals.map((row) => {
    const away = row.teams.find((team) => team.side === "away");
    const home = row.teams.find((team) => team.side === "home");
    return `${row.gameId}: ${away.name} ${away.score} – ${home.name} ${home.score} (${row.network}${row.networkListedByEspn ? "" : ` NOT on ESPN: ${row.espnNetworks.join("/")}`})`;
  }),
  records,
  saturdayFixtures: saturdayCount,
}, null, 2));
