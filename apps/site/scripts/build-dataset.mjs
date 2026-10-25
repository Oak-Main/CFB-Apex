/**
 * Aggregates the vendored dataset (data/cfb-2026) into a single TypeScript
 * module (lib/cfb-2026.generated.ts) that both the Vite build and the plain
 * Node test runner can import — no import.meta.glob, no JSON import
 * attributes, no filesystem access at runtime.
 *
 * Run automatically before dev/build/test via the package.json pre-hooks.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { isCurrentEspnInjury } from "../lib/injury-freshness.mjs";
import { validateOfficialReports } from "../lib/official-availability-validation.mjs";

const root = fileURLToPath(new URL("../data/cfb-2026", import.meta.url));
const projectRoot = fileURLToPath(new URL("..", import.meta.url));

const read = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const refreshPath = join(root, "refresh/verified-refresh.json");
const refreshSnapshot = existsSync(refreshPath) ? JSON.parse(readFileSync(refreshPath, "utf8")) : null;
// A reviewed snapshot makes builds reproducible and prevents provider outages
// from replacing current polls/results with the original preseason inputs.
async function providerFetch(...args) {
  if (refreshSnapshot) throw new Error("using reviewed source snapshot");
  return fetch(...args);
}

const teams = read("teams.json").teams;
// Validate direct edits before any provider work; errors must fail the build,
// never be swallowed as an optional editorial input.
const RESEARCH_PATH = join(projectRoot, "data", "injury-research", "current.json");
const stagedInjuryResearch = existsSync(RESEARCH_PATH) ? JSON.parse(readFileSync(RESEARCH_PATH, "utf8")) : null;
const reviewedOfficialReports = validateOfficialReports(stagedInjuryResearch?.official_reports, {
  teams, games: [...(refreshSnapshot?.scheduledGames ?? []), ...(refreshSnapshot?.playedGames ?? [])],
  weeks: refreshSnapshot?.board_weeks ?? [], week: stagedInjuryResearch?.week,
});
const conferences = read("conferences.json").conferences;
const sosDoc = read("sos/2026.json");
const sos = sosDoc.teams.map((row) => ({
  slug: row.slug,
  phil_steele_rank: row.phil_steele_rank ?? null,
  espn_fpi_sos_rank: row.espn_fpi_sos_rank ?? null,
}));

const perTeam = (dir, pick) => {
  const out = {};
  for (const file of readdirSync(join(root, dir))) {
    if (!file.endsWith(".json") || file === "index.json") continue;
    const slug = file.replace(/\.json$/, "");
    out[slug] = pick(read(join(dir, file)));
  }
  return out;
};

const schedules = perTeam("schedules", (doc) => doc.games);
const coaching = perTeam("coaching", (doc) => ({
  head_coach: doc.head_coach ?? null,
  staff: (doc.staff ?? [])
    .filter((member) => member.name)
    .map((member) => ({ role: member.role_key ?? null, role_raw: member.role_raw ?? null, name: member.name })),
  schemes: doc.schemes
    ? { offense: doc.schemes.offense?.label ?? null, defense: doc.schemes.defense?.label ?? null }
    : null,
}));

/* Full poll tables: AP and Coaches top 25 plus others receiving votes.
   polls/latest.json is the freshest snapshot; the preseason file stays archived. */
const pollsSource = read("polls/latest.json");
const polls = (pollsSource.polls ?? []).map((poll) => ({
  poll: poll.poll,
  name: poll.name,
  release_date: poll.release_date ?? null,
  rankings: (poll.rankings ?? []).map((entry) => ({
    rank: entry.rank,
    team_slug: entry.team_slug ?? null,
    team: entry.team,
    record: entry.record ? `${entry.record.wins}-${entry.record.losses}` : null,
    points: entry.points ?? null,
    first_place_votes: entry.first_place_votes ?? null,
    previous_rank: entry.previous_rank ?? null,
    tied: entry.tied ?? false,
  })),
  others: (poll.others_receiving_votes ?? []).slice(0, 12).map((entry) => ({
    team: entry.team,
    team_slug: entry.team_slug ?? null,
    points: entry.points ?? null,
  })),
}));
const pollsStatus = pollsSource.status?.note ?? null;

/* Rosters and depth charts cover the seven rostered conferences (92 of 138
   programs); teams without a file are absent, never empty. Trimmed to the
   fields the site renders. */
const rosters = perTeam("rosters", (doc) => ({
  head_coach: doc.head_coach ?? null,
  counts: doc.counts ?? null,
  position_groups: (doc.position_groups ?? []).map((group) => ({
    name: group.name,
    players: (group.players ?? []).map((player) => ({
      name: player.name,
      position: player.position ?? null,
      class: player.class ?? null,
      jersey: player.jersey ?? null,
      height: player.height ?? null,
      weight: player.weight ?? null,
      stars: player.stars ?? null,
      hometown: player.hometown ?? null,
    })),
  })),
}));

const depthCharts = perTeam("depth-charts", (doc) => ({
  status: doc.status ?? null,
  status_caveat: doc.status_caveat ?? null,
  schemes: doc.schemes ?? null,
  units: (doc.units ?? []).map((unit) => ({
    unit: unit.unit,
    positions: (unit.positions ?? []).map((position) => ({
      position: position.position,
      depth: (position.depth ?? []).map((slot) => ({
        rank: slot.rank,
        co_listed: slot.co_listed,
        players: (slot.players ?? []).map((player) => ({
          name: player.name,
          class: player.class ?? null,
          stars: player.stars ?? null,
        })),
      })),
    })),
  })),
}));

const injuriesDoc = read("injuries/latest.json");
const injuries = {
  as_of_date: injuriesDoc.as_of_date ?? null,
  teams: (injuriesDoc.teams ?? []).map((team) => ({
    slug: team.slug,
    opponent_context: team.opponent_context ?? null,
    players: (team.players ?? []).map((player) => ({
      name: player.name,
      position: player.position ?? null,
      status: player.status ?? null,
      injury: player.injury ?? null,
    })),
  })),
};

/* Historical team seasons, trimmed to the headline rates the site renders. */
const historical = {};
for (const file of readdirSync(join(root, "stats/historical/team"))) {
  if (!file.endsWith(".json") || file === "index.json") continue;
  const season = file.replace(/\.json$/, "");
  const doc = read(join("stats/historical/team", file));
  historical[season] = (doc.teams ?? []).map((team) => ({
    slug: team.slug ?? null,
    g: team.games ?? null,
    op: team.offense?.total?.["Pts/G"] ?? null,
    dp: team.defense?.total?.["Pts/G"] ?? null,
    oy: team.offense?.total?.["Yds/G"] ?? null,
    dy: team.defense?.total?.["Yds/G"] ?? null,
  }));
}

/* Advanced ratings (FEI, SP+) indexed per team slug, most recent season first. */
const teamRatings = {};
for (const file of readdirSync(join(root, "stats/historical/advanced"))) {
  if (!file.endsWith(".json") || file === "index.json") continue;
  const season = file.replace(/\.json$/, "");
  const doc = read(join("stats/historical/advanced", file));
  for (const row of doc.fei ?? []) {
    if (!row.slug) continue;
    if (!teamRatings[row.slug]) teamRatings[row.slug] = [];
    teamRatings[row.slug].push({
      season,
      feiRank: row.rank ?? null,
      fei: row.fei ?? null,
      record: row.record ?? null,
    });
  }
  for (const row of doc.sp_plus ?? []) {
    if (!row.slug) continue;
    if (!teamRatings[row.slug]) teamRatings[row.slug] = [];
    const entry = teamRatings[row.slug].find((item) => item.season === season);
    if (entry) {
      entry.spRank = row.rank ?? null;
      entry.spPlus = row.sp_plus ?? null;
    } else {
      teamRatings[row.slug].push({
        season,
        spRank: row.rank ?? null,
        spPlus: row.sp_plus ?? null,
        record: row.record ?? null,
      });
    }
  }
}
for (const rows of Object.values(teamRatings)) rows.sort((a, b) => b.season.localeCompare(a.season));

/* Individual season leaderboards, indexed by team slug (top-10 finishes only). */
const humanize = (key) => key.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const teamLeaders = {};
for (const file of readdirSync(join(root, "stats/historical/individual"))) {
  if (!file.endsWith(".json") || file === "index.json") continue;
  const season = file.replace(/\.json$/, "");
  const doc = read(join("stats/historical/individual", file));
  for (const [categoryKey, categoryData] of Object.entries(doc.categories ?? {})) {
    const category = humanize(categoryKey);
    for (const leader of categoryData.leaders ?? []) {
      if (!leader.team_slug || (leader.rank ?? 99) > 10) continue;
      if (!teamLeaders[leader.team_slug]) teamLeaders[leader.team_slug] = [];
      teamLeaders[leader.team_slug].push({
        season,
        category,
        player: leader.player ?? null,
        rank: leader.rank ?? null,
      });
    }
  }
}
for (const rows of Object.values(teamLeaders)) rows.sort((a, b) => b.season.localeCompare(a.season));

/* Roster player index for site search: name + team + position only. */
const playerIndex = [];
for (const [slug, roster] of Object.entries(rosters)) {
  for (const group of roster.position_groups ?? []) {
    for (const player of group.players ?? []) {
      if (player.name) playerIndex.push({ n: player.name, t: slug, p: player.position ?? null });
    }
  }
}

const playedGames = readdirSync(join(root, "stats/2026/games"))
  .filter((file) => file.endsWith(".json"))
  .map((file) => read(join("stats/2026/games", file)))
  .map((doc) => ({
    game_id: doc.game_id,
    date: doc.date,
    kickoff_utc: doc.kickoff_utc ?? null,
    week: doc.week ?? null,
    home_slug: doc.home_slug,
    away_slug: doc.away_slug,
    site: doc.site ?? null,
    tv: doc.tv ?? null,
    neutral_site: Boolean(doc.neutral_site),
    title: doc.title ?? "",
    teams: doc.teams ?? [],
  }))
  .sort((a, b) => a.date.localeCompare(b.date));

/* Team logos + brand colors: scan public/logos for verified PNGs (downloaded
   from the ESPN CDN, two-source verified) and derive each team's brand color
   from the mark's dominant saturated pixel bucket. */
const logoSlugs = readdirSync(join(projectRoot, "public/logos"))
  .filter((file) => file.endsWith(".png"))
  .map((file) => file.replace(/\.png$/, ""));

function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89_50_4e_47) throw new Error("not a PNG");
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 0;
  const idat = [];
  let palette = null;
  let trns = null;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "PLTE") {
      palette = [];
      for (let i = 0; i < data.length; i += 3) palette.push([data[i], data[i + 1], data[i + 2]]);
    } else if (type === "tRNS") {
      trns = Array.from(data);
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 3 ? 1 : 0;
  if (!channels) throw new Error(`unsupported color type ${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prior = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? out[x - channels] : 0;
      const up = prior ? prior[x] : 0;
      const ul = prior && x >= channels ? prior[x - channels] : 0;
      let value = row[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += Math.floor((left + up) / 2);
      else if (filter === 4) value += paeth(left, up, ul);
      out[x] = value & 0xff;
    }
  }
  const rgb = [];
  for (let i = 0; i < width * height; i++) {
    if (colorType === 3) {
      const index = pixels[i];
      const entry = palette?.[index];
      if (!entry) continue;
      const alpha = trns && index < trns.length ? trns[index] : 255;
      if (alpha > 40) rgb.push(entry);
    } else {
      const base = i * channels;
      if (channels < 4 || pixels[base + 3] > 40) rgb.push([pixels[base], pixels[base + 1], pixels[base + 2]]);
    }
  }
  return rgb;
}

function brandColorOf(buffer) {
  const buckets = new Map();
  for (const [r, g, b] of decodePng(buffer)) {
    const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
    if (lightness > 0.93) continue; // paper white / highlight
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }
  let best = null;
  let bestScore = 0;
  for (const bucket of buckets.values()) {
    const r = bucket.r / bucket.count;
    const g = bucket.g / bucket.count;
    const b = bucket.b / bucket.count;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    // Saturated marks win; near-black marks (Iowa, Purdue trim) still qualify.
    const score = bucket.count * (saturation + 0.25) * (lightnessOf(r, g, b) > 0.85 ? 0.1 : 1);
    if (score > bestScore) {
      bestScore = score;
      best = [r, g, b];
    }
  }
  if (!best) return null;
  // Clamp lightness into a readable band for tint chips.
  let [r, g, b] = best.map(Math.round);
  const l = lightnessOf(r, g, b);
  if (l > 0.7) [r, g, b] = [r, g, b].map((v) => Math.round(v * 0.82));
  else if (l < 0.16) [r, g, b] = [r, g, b].map((v) => Math.min(255, Math.round(v * 1.6 + 14)));
  const hex = (v) => v.toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function lightnessOf(r, g, b) {
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
}

const logoColors = {};
for (const slug of logoSlugs) {
  const color = brandColorOf(readFileSync(join(projectRoot, "public/logos", `${slug}.png`)));
  if (color) logoColors[slug] = color;
}

/* Transfer portal (research prompt 4) and head-coach contracts (prompt 5).
   Both use research-package slugs; a small alias table maps display variants
   onto dataset slugs. FCS origins (e.g. chattanooga) are kept verbatim — the
   site renders them as external, unlinked labels. */
const SLUG_ALIASES = {
  "louisiana-monroe": "ulm",
  pitt: "pittsburgh",
  fau: "florida-atlantic",
  miami: "miami-fl",
};

const portalDoc = read("portal/transfers-2026.json");
const portalEvents = portalDoc.transfers.map((row, index) => ({
  id: `portal-2026-${index + 1}`,
  player: row.player,
  position: row.position ?? null,
  class: row.class_raw || null,
  from: SLUG_ALIASES[row.from_team_slug] ?? row.from_team_slug,
  to: SLUG_ALIASES[row.to_team_slug] ?? row.to_team_slug,
  status: row.status,
  date: row.event_date,
  snaps: row.snaps_prior_season,
  notes: row.notes ?? null,
  confidence: row.confidence,
  sources: (row.sources ?? []).slice(0, 2),
}));

const contractsDoc = read("coaching/contracts-2026.json");
const coachContracts = {};
for (const row of contractsDoc) {
  const slug = SLUG_ALIASES[row.team_slug] ?? row.team_slug;
  if (coachContracts[slug]) continue;
  coachContracts[slug] = {
    coach: row.coach,
    salary: row.annual_salary_usd,
    start: row.contract_start,
    end: row.contract_end,
    total_value: row.total_value_usd,
    guaranteed_remaining: row.guaranteed_remaining_usd,
    buyout: row.buyout_summary ?? null,
    offset_mitigation: row.offset_mitigation,
    record_through: row.record_through ?? null,
    notes: row.notes ?? null,
    sources: (row.sources ?? []).slice(0, 3),
    as_of: row.as_of,
  };
}

/* Gameday/stadium guides (research upload) and the broadcast index produced
   by scripts/parse-broadcast-pdf.py from the broadcast-schedule PDF. */
const stadiumGuides = read("stadiums/gameday-guides-2026.json").map((row) => ({
  team_slug: SLUG_ALIASES[row.team_slug] ?? row.team_slug,
  stadium: row.stadium,
  city: row.city,
  address: row.address,
  capacity: row.capacity,
  clear_bag: row.clear_bag,
  parking: row.parking,
  transit: row.transit,
  tailgating: row.tailgating,
  visitor_section: row.visitor_section,
  accessibility: row.accessibility,
  notes: row.notes ?? null,
  last_verified: row.last_verified,
  sources: (row.sources ?? []).slice(0, 3),
}));

/* Full-season TV designations (research upload, supersedes the PDF-derived
   index): networks AND kickoff times, keyed by date + team pair. FCS-only
   matchups and "tbd" placeholder rows fall out naturally. */
const TV_ALIASES = {
  ...SLUG_ALIASES,
  miami: "miami-fl",
  "miami-ohio": "miami-oh",
  "ul-monroe": "ulm",
  "florida-international": "fiu",
  connecticut: "uconn",
  massachusetts: "umass",
  "louisiana-monroe": "ulm",
};
const datasetTeamSlugs = new Set(teams.map((team) => team.slug));

const tvDoc = read("broadcasts/tv-schedule-full-season.json");
const tvByPair = {};
const tvRows = [];
let tvGameCount = 0;
for (const week of tvDoc.weeks ?? []) {
  for (const game of week.games ?? []) {
    const home = TV_ALIASES[game.home_slug] ?? game.home_slug;
    const away = TV_ALIASES[game.away_slug] ?? game.away_slug;
    if (home === "tbd" || away === "tbd") continue;
    if (!datasetTeamSlugs.has(home) || !datasetTeamSlugs.has(away)) continue;
    const key = `${game.date}:${[away, home].sort().join(":")}`;
    tvGameCount += 1;
    if (!tvByPair[key] || (game.network && !tvByPair[key].tv)) {
      tvByPair[key] = { tv: game.network, time_et: game.time_et, status: game.status, week: week.week };
      tvRows.push({ date: game.date, away, home, tv: game.network, time_et: game.time_et, status: game.status, week: week.week });
    }
  }
}
tvRows.sort((a, b) => a.date.localeCompare(b.date) || (a.time_et ?? "").localeCompare(b.time_et ?? ""));

/* Ratings (SP+, FPI, win totals, playoff odds as reported). Prefer the
   newest ratings file; fall back to the preseason archive. */
const ratingsFiles = readdirSync(join(root, "ratings")).filter((f) => /^2026-week\d+\.json$/.test(f)).sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));
const ratingsPath = ratingsFiles.length ? `ratings/${ratingsFiles[ratingsFiles.length - 1]}` : "ratings/preseason-2026.json";
const ratingsAsOfRow = read(ratingsPath).find((row) => row.as_of)?.as_of ?? "2026-09-05";
const preseasonRatings = {};
for (const row of read(ratingsPath)) {
  const slug = TV_ALIASES[row.team_slug] ?? row.team_slug;
  preseasonRatings[slug] = {
    sp: row.sp_plus
      ? { overall: row.sp_plus.overall, rank: row.sp_plus.rank, offense: row.sp_plus.offense ?? null, defense: row.sp_plus.defense ?? null, source: row.sp_plus.source }
      : null,
    fpi: row.fpi ? { value: row.fpi.value, rank: row.fpi.rank, source: row.fpi.source } : null,
    wins: row.win_total
      ? { projected: row.win_total.projected_wins, line: row.win_total.over_under_line, source: row.win_total.source }
      : null,
    playoff: row.playoff_odds_as_reported
      ? { outlet: row.playoff_odds_as_reported.outlet, value: row.playoff_odds_as_reported.value, source: row.playoff_odds_as_reported.source }
      : null,
    notes: row.notes ?? null,
    as_of: row.as_of,
  };
}
/* Every team carries a ratings record; unrated teams are honest nulls so the
   "not published" rendering never silently drops a team. */
for (const team of teams) {
  if (!preseasonRatings[team.slug]) {
    preseasonRatings[team.slug] = { sp: null, fpi: null, wins: null, playoff: null, notes: null, as_of: ratingsAsOfRow };
  }
}

/* Week-1 fantasy/DFS notes: reported roles, usage, availability, and analyst
   projections only — never salaries or invented point projections. */
/* Local-radio flagship research (two-engine compilation). The file is absent
   until the research chats return; the seam stays fail-closed until then. */
const RADIO_PATH = join(root, "radio/flagships-2026.json");
let radioDoc = { as_of: null, stations: [] };
if (existsSync(RADIO_PATH)) {
  try {
    const raw = JSON.parse(readFileSync(RADIO_PATH, "utf8"));
    const rows = Array.isArray(raw) ? raw : (raw.stations ?? []);
    radioDoc = {
      as_of: raw.as_of ?? null,
      stations: rows.map((row) => ({
        team: TV_ALIASES[row.team_slug] ?? row.team_slug,
        station: row.flagship_station ?? null,
        frequency: row.frequency ?? null,
        market: row.market ?? null,
        network: row.network_name ?? null,
        rights_holder: row.rights_holder ?? null,
        satellite: row.satellite_national ?? null,
        stream: row.authorized_stream ?? null,
        notes: row.notes ?? null,
        sources: (row.sources ?? []).slice(0, 2),
        confidence: row.confidence ?? null,
      })),
    };
  } catch (error) {
    console.warn(`radio/flagships-2026.json present but unreadable — skipping (${error.message})`);
  }
}

const fantasyDoc = read("dfs/week1-notes-2026.json");
const fantasyNotes = fantasyDoc.players.map((row, index) => ({
  id: `fantasy-w1-${index + 1}`,
  player: row.player,
  team: TV_ALIASES[row.team_slug] ?? row.team_slug,
  position: row.position ?? null,
  class: row.class_raw ?? null,
  role: row.role_note ?? null,
  usage: row.usage_note ?? null,
  availability: row.availability ?? null,
  injury: row.injury_note ?? null,
  projection: row.analyst_projection
    ? { outlet: row.analyst_projection.outlet ?? null, value: row.analyst_projection.value ?? null }
    : null,
  sources: (row.sources ?? []).slice(0, 2),
  as_of: row.as_of ?? null,
}));

/* ------------------------------------------------- ESPN injury base feed -- */
const ESPN_INJURY_URL = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/injuries";
const STATUS_MAP = { "Injured Reserve": "IR", "Out": "OUT", "Questionable": "QUESTIONABLE", "Doubtful": "DOUBTFUL", "Suspension": "SUSPENSION", "Active": "ACTIVE" };
const espnInjuries = { asOf: null, entries: [] };
const teamByDisplayName = new Map(teams.map((t) => [t.display_name.toLowerCase(), t.slug]));
/* ESPN names teams differently from our display_name in a handful of places
   ("App State Mountaineers" vs "Appalachian State Mountaineers", "Miami
   Hurricanes" vs "Miami (FL) Hurricanes"). Without these aliases the refresh
   dropped two real FBS games and left four standings rows unlinked (Oct 5
   audit); every ESPN name must resolve or the coverage check fails. */
const teamBySchool = new Map(teams.map((t) => [t.school.toLowerCase(), t.slug]));
for (const [school, slug] of teamBySchool) if (!teamByDisplayName.has(school)) teamByDisplayName.set(school, slug);
const ESPN_NAME_ALIASES = {
  "miami hurricanes": "miami-fl",
  "florida international panthers": "fiu",
  "app state mountaineers": "appalachian-state",
  "delaware blue hens": "delaware",
  "massachusetts minutemen": "umass",
  "umass minutemen": "umass",
  "ul monroe warhawks": "ulm",
  "louisiana-monroe warhawks": "ulm",
};
const espnSlugFor = (raw) => {
  const key = String(raw ?? "").toLowerCase().trim();
  return teamByDisplayName.get(key) ?? ESPN_NAME_ALIASES[key] ?? null;
};
try {
  const res = await providerFetch(ESPN_INJURY_URL, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status}`);
  const doc = await res.json();
  espnInjuries.asOf = doc.timestamp ? doc.timestamp.slice(0, 10) : null;
  for (const block of doc.injuries ?? []) {
    const teamSlug = espnSlugFor(block.displayName) ?? null;
    for (const row of block.injuries ?? []) {
      const status = STATUS_MAP[row.status] ?? "QUESTIONABLE";
      if (status === "ACTIVE" || !isCurrentEspnInjury(row.date, Date.now())) continue;
      espnInjuries.entries.push({
        player: row.athlete?.displayName ?? "Unknown",
        team_slug: teamSlug,
        position: row.athlete?.position?.abbreviation ?? null,
        status,
        detail: row.shortComment ?? row.longComment ?? null,
        as_of: row.date ? row.date.slice(0, 10) : null,
      });
    }
  }
  console.log(`ESPN injury base: ${espnInjuries.entries.length} entries across ${doc.injuries?.length ?? 0} team blocks`);
} catch (error) {
  if (!refreshSnapshot) console.warn(`ESPN injury feed unavailable — shipping empty base (${error.message})`);
}

/* Live poll refresh — the dist's preseason bake goes stale the moment the
   first regular-season AP Top 25 drops. ESPN's rankings endpoint carries the
   current AP + AFCA Coaches tables (site.web.api host; the plain site.api
   host is Worker-throttled — see the Sep 2026 egress notes). On failure the
   dist tables ship unchanged with their honest status note. */
let pollsNote = pollsStatus;
const ESPN_RANKINGS_URL = "https://site.web.api.espn.com/apis/site/v2/sports/football/college-football/rankings";
try {
  const res = await providerFetch(ESPN_RANKINGS_URL, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status}`);
  const doc = await res.json();
  const espnToTables = (doc.rankings ?? [])
    .filter((board) => /AP Top 25|AFCA Coaches Poll/i.test(board.name ?? ""))
    .map((board) => ({
      poll: /AP Top 25/i.test(board.name) ? "ap" : "coaches",
      name: /AP Top 25/i.test(board.name) ? "AP Top 25" : "AFCA Coaches Poll",
      release_date: (board.lastUpdated ?? board.ranks?.[0]?.date ?? "").slice(0, 10) || null,
      rankings: (board.ranks ?? []).map((entry) => {
        const t = entry.team ?? {};
        const name = t.location || t.nickname || t.name || "Unknown";
        const fullName = `${t.location ?? ""} ${t.name ?? ""}`.trim().toLowerCase();
        return {
          rank: entry.current ?? null,
          team_slug: espnSlugFor(fullName) ?? teamByDisplayName.get(String(t.nickname ?? "").toLowerCase()) ?? null,
          team: name,
          record: entry.recordSummary ?? null,
          points: entry.points ?? null,
          first_place_votes: entry.firstPlaceVotes ?? null,
          previous_rank: entry.previous ?? null,
          tied: false,
        };
      }).filter((e) => e.rank != null),
      others: [],
    }));
  if (espnToTables.length === 2) {
    /* Composite = average of the two polls' ranks; a team ranked in only one
       poll is counted as 26 in the other so unranked-ness is penalized, not
       ignored. Sorted by average, ties broken by AP rank. */
    const ap = espnToTables.find((t) => t.poll === "ap");
    const co = espnToTables.find((t) => t.poll === "coaches");
    const names = new Map();
    for (const table of [ap, co]) {
      for (const e of table.rankings) {
        const row = names.get(e.team) ?? { team: e.team, team_slug: e.team_slug, record: e.record, ranks: {} };
        row.ranks[table.poll] = e.rank;
        if (!row.team_slug && e.team_slug) row.team_slug = e.team_slug;
        names.set(e.team, row);
      }
    }
    const compositeRows = [...names.values()]
      .map((row) => ({ ...row, avg: ((row.ranks.ap ?? 26) + (row.ranks.coaches ?? 26)) / 2 }))
      .sort((a, b) => a.avg - b.avg || (a.ranks.ap ?? 26) - (b.ranks.ap ?? 26));
    const composite = {
      poll: "composite",
      name: "CFB Apex Composite",
      release_date: ap.release_date,
      rankings: compositeRows.map((row, i) => ({
        rank: i + 1,
        team_slug: row.team_slug ?? null,
        team: row.team,
        record: row.record ?? null,
        points: null,
        first_place_votes: null,
        previous_rank: null,
        tied: false,
      })),
      others: [],
    };
    polls.length = 0;
    polls.push(...espnToTables, composite);
    pollsNote = `AP Top 25 and AFCA Coaches Poll refreshed live from ESPN at build time (${new Date().toISOString().slice(0, 10)}). The CFB Apex Composite averages the two polls; a team ranked in only one poll is counted as 26 in the other. The AP releases its regular-season Top 25 Sundays at 2 p.m. ET.`;
    console.log(`Live polls: AP ${ap.rankings.length} + Coaches ${co.rankings.length} entries; composite ${composite.rankings.length} teams`);
  } else {
    console.warn(`ESPN rankings returned ${espnToTables.length}/2 boards — keeping dist polls`);
  }
} catch (error) {
  if (!refreshSnapshot) console.warn(`ESPN rankings unavailable — shipping dist (preseason) polls (${error.message})`);
}

/* Conference standings — the race tracker under /rankings. Same host as the
   polls (site.web.api). ESPN returns one child per FBS conference; each team
   is mapped to OUR conference_slug via our own teams table so the module
   matches the site's conference hubs. Fail-closed: a failed fetch ships an
   empty array and the section simply does not render. */
const conferenceStandings = [];
try {
  const res = await providerFetch("https://site.web.api.espn.com/apis/v2/sports/football/college-football/standings", { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status}`);
  const doc = await res.json();
  for (const child of doc.children ?? []) {
    /* ESPN nests two-division leagues (Sun Belt) as sub-children whose
       parent carries no entries — flatten or the league table never renders. */
    const flatten = (node) => [...(node?.standings?.entries ?? []), ...(node?.children ?? []).flatMap(flatten)];
    const entries = flatten(child);
    const rows = [];
    let confSlug = null;
    for (const entry of entries) {
      const t = entry.team ?? {};
      const name = t.location || t.nickname || t.name;
      if (!name) continue;
      const fullName = `${t.location ?? ""} ${t.name ?? ""}`.trim();
      const ourSlug = espnSlugFor(t.displayName) ?? espnSlugFor(fullName) ?? teamByDisplayName.get(String(t.nickname ?? "").toLowerCase()) ?? null;
      const ourTeam = ourSlug ? teams.find((tm) => tm.slug === ourSlug) : null;
      if (!confSlug && ourTeam) confSlug = ourTeam.conference_slug;
      const stat = (n) => (entry.stats ?? []).find((s) => s.name === n)?.displayValue ?? null;
      rows.push({
        team: name,
        team_slug: ourSlug,
        w: stat("wins") ?? "0",
        l: stat("losses") ?? "0",
        t: stat("ties") ?? "0",
        pct: stat("winPercent") ?? "—",
      });
    }
    if (confSlug && rows.length) {
      conferenceStandings.push({
        slug: confSlug,
        name: child.name || child.displayName || confSlug,
        short: teams.find((tm) => tm.conference_slug === confSlug)?.conference_short ?? confSlug.toUpperCase(),
        rows: rows.slice(0, 20),
      });
    }
  }
  console.log(`Conference standings: ${conferenceStandings.length} conferences, ${conferenceStandings.reduce((n, c) => n + c.rows.length, 0)} teams`);
} catch (error) {
  if (!refreshSnapshot) console.warn(`ESPN conference standings unavailable — conference race section ships empty (${error.message})`);
}

/* Completed-game results — merges the live ESPN scoreboard for every played
   week into playedGames. The curated files under stats/2026/games/ carry the
   full editorial layer (narrative, leaders, stats) and WIN any collision; the
   ESPN rows exist so weeks without curated files still show honest result
   lines (teams + points + TV), with editorial fields explicitly absent. */
try {
  const today = new Date();
  const ymd = (d) => d.toISOString().slice(0, 10).replaceAll("-", "");
  /* per-day windows — the CFB scoreboard 400s on multi-day ranges (soccer
     accepts them; football does not), so walk the season-to-date one day at a
     time in small parallel batches */
  const days = [];
  for (let d = new Date(Date.UTC(2026, 7, 23)); d <= today; d = new Date(d.getTime() + 86400000)) days.push(ymd(d));
  const espnResults = new Map();
  const parseDoc = (doc) => {
    for (const ev of doc.events ?? []) {
      const comp = (ev.competitions && ev.competitions[0]) || {};
      const cs = comp.competitors || [];
      if (ev.status?.type?.state !== "post" || !ev.status?.type?.completed) continue;
      const home = cs.find((c) => c.homeAway === "home");
      const away = cs.find((c) => c.homeAway === "away");
      if (!home || !away) continue;
      const mapTeam = (c) => {
        const t = c.team ?? {};
        const fullName = t.displayName ?? `${t.location ?? ""} ${t.name ?? ""}`.trim();
        return { slug: espnSlugFor(fullName) ?? null, name: t.shortDisplayName || t.location || fullName, points: c.score != null ? Number(c.score) : null };
      };
      const h = mapTeam(home), a = mapTeam(away);
      if (!h.slug || !a.slug) continue;
      espnResults.set(`${ev.date.slice(0, 10)}-${a.slug}-at-${h.slug}`, {
        away_slug: a.slug,
        date: ev.date.slice(0, 10),
        kickoff_utc: ev.date,
        game_id: `${ev.date.slice(0, 10)}-${a.slug}-at-${h.slug}`,
        home_slug: h.slug,
        leaders: {},
        line_score: [],
        meta: {
          as_of: new Date().toISOString().slice(0, 10),
          dataset: "game",
          notes: ["Result line from the live ESPN scoreboard. Editorial layers (narrative, team stats, leaders) not yet published for this game."],
          schema_version: "1.0.0",
          sources: ["ESPN college football scoreboard"],
        },
        neutral_site: Boolean(comp.neutralSite),
        season: 2026,
        site: (comp.venue && comp.venue.fullName) || null,
        teams: [
          { name: h.name, points: h.points, slug: h.slug },
          { name: a.name, points: a.points, slug: a.slug },
        ],
        title: ev.shortName || `${a.name} at ${h.name}`,
        tv: (comp.broadcasts && comp.broadcasts[0] && comp.broadcasts[0].names && comp.broadcasts[0].names[0]) || null,
      });
    }
  };
  for (let i = 0; i < days.length; i += 5) {
    const batch = days.slice(i, i + 5);
    const docs = await Promise.all(batch.map(async (day) => {
      const res = await providerFetch(`https://site.web.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=${day}`, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`${res.status} on ${day}`);
      return res.json();
    }));
    for (const doc of docs) parseDoc(doc);
  }
  const curated = new Set(playedGames.map((g) => g.game_id));
  let added = 0;
  for (const [id, row] of espnResults) {
    if (!curated.has(id)) { playedGames.push(row); added += 1; }
  }
  playedGames.sort((a, b) => a.date.localeCompare(b.date));
  console.log(`ESPN results merged: ${added} games added, ${curated.size} curated kept, ${playedGames.length} total played`);
} catch (error) {
  if (!refreshSnapshot) console.warn(`ESPN results merge unavailable — playedGames stays curated-only (${error.message})`);
}

/* ------------------------------------------------- awards & NIL watches ----- */
// Two-engine research compilations, cross-verified. Fail-closed when absent.
// Research engines sometimes emit mascot-style slugs ("lsu-tigers",
// "miami-hurricanes", "pittsburgh-panthers"). Normalize onto canonical
// dataset slugs: strip the mascot, then resolve special cases (both Miamis).
const MASCOT_SLUG_ALIASES = {
  miami: "miami-fl",
  miamihurricanes: "miami-fl",
  "miami-hurricanes": "miami-fl",
  "miami-fl-hurricanes": "miami-fl",
  "miami-oh-redhawks": "miami-oh",
  miamiredhawks: "miami-oh",
  "miami-redhawks": "miami-oh",
};
function readWatch(relativePath) {
  const path = join(root, relativePath);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    // Normalize research slugs onto the dataset's canonical ones.
    const normalize = (slug) => {
      if (!slug) return slug;
      if (datasetTeamSlugs.has(slug)) return slug;
      const mapped = MASCOT_SLUG_ALIASES[slug] ?? TV_ALIASES[slug] ?? slug;
      if (datasetTeamSlugs.has(mapped)) return mapped;
      // "lsu-tigers" -> try "lsu" when the stripped form is a real team.
      const stripped = slug.replace(/-(tigers|hurricanes|panthers|rebels|ducks|broncos|cardinals|wolverines|longhorns|buckeyes|mustangs|blue-devils|green-wave|seminoles|aggies|sooners|mountaineers|cougars|red-wolves|golden-hurricanes|chippewas|owls|knights|bulls|midshipmen|black-knights|green-wave)$/, "");
      if (datasetTeamSlugs.has(stripped)) return stripped;
      return slug;
    };
    if (Array.isArray(raw.contenders)) {
      raw.contenders = raw.contenders.map((entry) => ({ ...entry, team_slug: normalize(entry.team_slug) }));
    }
    if (Array.isArray(raw.week_deals)) {
      raw.week_deals = raw.week_deals.map((entry) => ({ ...entry, team_slug: normalize(entry.team_slug) }));
    }
    if (Array.isArray(raw.watch_valuations)) {
      raw.watch_valuations = raw.watch_valuations.map((entry) => ({ ...entry, team_slug: normalize(entry.team_slug) }));
    }
    return raw;
  } catch (error) {
    console.warn(`${relativePath} present but unreadable — skipping (${error.message})`);
    return null;
  }
}
// Weekly watches: latest staged week file wins (week3-2026.json over week2-*.json);
// fail-closed when nothing is staged.
function readWatchLatest(dir) {
  const files = readdirSync(join(projectRoot, "data", "cfb-2026", dir)).filter((f) => /^week\d+-\d{4}\.json$/.test(f)).sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));
  return files.length ? readWatch(`${dir}/${files[files.length - 1]}`) : null;
}
const heismanWatch = readWatchLatest("heisman") ?? readWatch("heisman/week2-2026.json");
const nilWatch = readWatchLatest("nil") ?? readWatch("nil/week2-2026.json");
const athleteHighlight = readWatchLatest("highlight") ?? readWatch("highlight/week1-2026.json");
const panelBrief = readWatchLatest("panel") ?? readWatch("panel/week2-2026.json");
const upsetWatch = readWatchLatest("upset");
const playoffAudit = readWatchLatest("playoff-audit");
console.log(`Athlete highlight: ${athleteHighlight ? "week " + athleteHighlight.week + " — " + athleteHighlight.athlete_of_the_week.player : "not staged (fail-closed)"}`);
console.log(`Panel brief: ${panelBrief ? panelBrief.topics.length + " topics" : "not staged (fail-closed)"}`);
console.log(`Heisman watch: ${heismanWatch ? heismanWatch.contenders.length + " contenders" : "not staged (fail-closed)"}`);
console.log(`NIL watch: ${nilWatch ? nilWatch.week_deals.length + " deals, " + nilWatch.watch_valuations.length + " valuations" : "not staged (fail-closed)"}`);
console.log(`Upset watch: ${upsetWatch ? "week " + upsetWatch.week + " — " + upsetWatch.picks.length + " picks" : "not staged (fail-closed)"}`);
console.log(`Playoff audit: ${playoffAudit ? "week " + playoffAudit.week + " — " + playoffAudit.contenders.length + " contenders" : "not staged (fail-closed)"}`);

/* ------------------------------------------- editorial injury research ----- */
// data/injury-research/current.json is written by scripts/ingest-injury-research.mjs
// from the weekly research run. Absent file = nothing published.
let injuryResearch = { week: null, as_of: null, coverage_note: null, checked_at: null, ledger: [], watch: [], context_notes: [] };
if (stagedInjuryResearch) {
    const raw = stagedInjuryResearch;
    injuryResearch = {
      week: typeof raw.week === "number" ? raw.week : null,
      as_of: raw.as_of ?? null,
      coverage_note: raw.coverage_note ?? null,
      checked_at: raw.checked_at ?? null,
      context_notes: Array.isArray(raw.context_notes) ? raw.context_notes : [],
      official_reports: reviewedOfficialReports,
      ledger: Array.isArray(raw.ledger) ? raw.ledger : [],
      watch: Array.isArray(raw.watch) ? raw.watch : [],
    };
} else {
  console.log("No injury research staged yet — editorial layer ships empty (fail-closed).");
}

const officialPath = join(projectRoot, "data", "injury-research", "official-availability.json");
const officialAvailability = existsSync(officialPath) ? JSON.parse(readFileSync(officialPath, "utf8")) : null;

if (officialAvailability) {
  const statuses = new Set(["Available", "Out", "Doubtful", "Questionable", "Probable", "Game Time Decision", "Exempt"]);
  const knownSlugs = new Set(teams.map((team) => team.slug));
  const seen = new Set();
  for (const row of officialAvailability.entries) {
    const key = `${row.game_date}:${row.team_slug}:${row.player}`;
    if (seen.has(key) || !knownSlugs.has(row.team_slug) || !statuses.has(row.status) || !row.source_url || !row.report_id || !row.report_type ||
        !Number.isFinite(Date.parse(row.published_at)) || !Number.isFinite(Date.parse(row.retrieved_at)) || Date.parse(row.published_at) > Date.parse(row.retrieved_at)) {
      throw new Error(`Invalid official availability row: ${key}`);
    }
    seen.add(key);
  }
}

const payload = { officialAvailability, teams, conferences, polls, pollsStatus: pollsNote, conferenceStandings, sos, sosAsOf: sosDoc.meta?.as_of ?? null, schedules, coaching, playedGames, rosters, depthCharts, injuries, historical, teamRatings, teamLeaders, playerIndex, logoSlugs, logoColors, portal: { asOf: portalDoc.meta.as_of, statusNote: portalDoc.meta.completeness, events: portalEvents }, coachContracts, stadiumGuides, broadcasts: { asOf: tvDoc.as_of, note: tvDoc.notes, byPair: tvByPair, games: tvGameCount, rows: tvRows }, preseasonRatings, radio: radioDoc, fantasy: { asOf: fantasyDoc.as_of, context: fantasyDoc.week_context, notes: fantasyNotes }, espnInjuries, injuryResearch, heismanWatch, nilWatch, athleteHighlight, panelBrief, upsetWatch, playoffAudit };

if (refreshSnapshot) {
  payload.polls = refreshSnapshot.polls;
  payload.pollsStatus = refreshSnapshot.pollsStatus;
  payload.playedGames = refreshSnapshot.playedGames;
  payload.conferenceStandings = refreshSnapshot.retainedBaseline.conferenceStandings;
  const injuryBase = refreshSnapshot.retainedBaseline.espnInjuries;
  const injuryCutoff = Date.parse(refreshSnapshot.schedule_verified_at ?? refreshSnapshot.retrieved_at);
  payload.espnInjuries = injuryBase ? { ...injuryBase,
    entries: injuryBase.entries.filter((row) => isCurrentEspnInjury(row.as_of, injuryCutoff)),
    excludedCount: injuryBase.entries.filter((row) => !isCurrentEspnInjury(row.as_of, injuryCutoff)).length,
  } : { asOf: null, entries: [], excludedCount: 0 };
  const rows = [...payload.broadcasts.rows];
  const byPair = { ...payload.broadcasts.byPair };
  // A release can cover more than one board week (the current week plus the
  // archived one); each reviewed row only retires rows inside its own week.
  const boardWeeks = refreshSnapshot.board_weeks ?? [{ week: refreshSnapshot.week, start: refreshSnapshot.week_start }];
  const boardWeekStart = (date) => {
    const instant = Date.parse(`${date}T00:00:00Z`);
    return boardWeeks.map((entry) => Date.parse(`${entry.start}T00:00:00Z`))
      .find((start) => instant >= start && instant < start + 7 * 86400000) ?? null;
  };
  const timeEt = (instant) => new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(instant));
  const reviewedWeeks = new Set(boardWeeks.map((entry) => entry.week));
  const reviewedRows = [
    ...refreshSnapshot.playedGames.filter((game) => reviewedWeeks.has(game.week) && game.verified_at).map((game) => ({ ...game, away: game.away_slug, home: game.home_slug, time_et: timeEt(game.kickoff_utc), status: "final" })),
    ...refreshSnapshot.scheduledGames,
  ];
  for (const row of reviewedRows) {
    // Official TBD kickoffs stay null; a missing time is never a midnight placeholder.
    if (row.kickoff_utc == null && (row.time_et != null || row.kickoff_status !== "official_tbd")) {
      throw new Error(`Scheduled row ${row.provider_id} has no kickoff but is not an official TBD`);
    }
    const pair = [row.away, row.home].sort().join(":");
    const rowWeek = boardWeekStart(row.date);
    // Retire the original date for this pair inside the same week. A Friday
    // final can supersede a preseason Saturday row without creating duplicates.
    for (let i = rows.length - 1; i >= 0; i--) {
      const prior = rows[i];
      if (rowWeek != null && boardWeekStart(prior.date) === rowWeek && [prior.away, prior.home].sort().join(":") === pair) rows.splice(i, 1);
    }
    for (const key of Object.keys(byPair)) {
      if (rowWeek != null && boardWeekStart(key.slice(0, 10)) === rowWeek && key.slice(11) === pair) delete byPair[key];
    }
    const status = row.status ?? row.game_status ?? "scheduled";
    byPair[`${row.date}:${pair}`] = { tv: row.tv, time_et: row.time_et, status, week: row.week };
    rows.push({ ...row, status });
    for (const [slug, opponent] of [[row.home, row.away], [row.away, row.home]]) {
      for (const entry of payload.schedules[slug] ?? []) {
        if (entry.opponent_slug !== opponent || rowWeek == null || boardWeekStart(entry.date) !== rowWeek) continue;
        entry.date = row.date;
        entry.week = row.week;
        entry.site = row.site;
      }
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || (a.time_et ?? "").localeCompare(b.time_et ?? ""));
  payload.broadcasts = { ...payload.broadcasts, rows, byPair, games: rows.length,
    asOf: refreshSnapshot.schedule_verified_at?.slice(0, 10) ?? refreshSnapshot.reference_date,
    note: `Week ${refreshSnapshot.week} schedule checked ${refreshSnapshot.schedule_verified_at ?? refreshSnapshot.retrieved_at}; base snapshot ${refreshSnapshot.retrieved_at}. Other weeks retain their original assignment dates. FBS vs FBS display coverage.`,
  };
  payload.refreshData = refreshSnapshot;

  /* Coverage check (Oct 5 audit), two layers:
     1. Hermetic: an excludedGames entry is only legitimate when at least one
        of its teams does NOT resolve into the 138-team list (a true FCS
        opponent) AND carries ESPN conference-id evidence. This is the exact
        rule whose absence let New Mexico State at FIU and Old Dominion at
        App State drop off the board tagged "FBS–FCS".
     2. Live (network required): every ESPN game in the snapshot week whose
        both teams resolve into the list must be on the board. Enforced in CI
        (CI=true); offline local builds warn instead of failing. */
  const teamNameSet = new Set(teams.map((t) => t.display_name.toLowerCase()));
  for (const t of teams) teamNameSet.add(t.school.toLowerCase());
  for (const name of Object.keys(ESPN_NAME_ALIASES)) teamNameSet.add(name);
  const fbsConfIds = new Set([1, 4, 5, 8, 9, 12, 15, 17, 18, 37, 151]); // ESPN FBS conference ids (group 80)
  for (const row of refreshSnapshot.excludedGames ?? []) {
    if (row.espn_conference_ids == null) {
      throw new Error(`excludedGames entry carries no ESPN conference-id evidence: ${row.name}`);
    }
    const ids = row.espn_conference_ids;
    if (fbsConfIds.has(ids.home) && fbsConfIds.has(ids.away)) {
      throw new Error(`excludedGames entry ${row.name} lists two FBS conference ids (${ids.away}/${ids.home}) — it belongs on the board`);
    }
  }
  const playedPairs = new Set(payload.playedGames.map((g) => `${g.date.slice(0, 10)}:${[g.away_slug, g.home_slug].sort().join(":")}`));
  const scheduledPairs = new Set(refreshSnapshot.scheduledGames.map((g) => `${g.date}:${[g.away, g.home].sort().join(":")}`));
  const weekStartMs = Date.parse(`${refreshSnapshot.reference_date}T00:00:00Z`);
  const weekDays = Array.from({ length: 7 }, (_, i) => new Date(weekStartMs + i * 86400000).toISOString().slice(0, 10).replaceAll("-", ""));
  const missing = [];
  const fcsSkipped = [];
  let daysFetched = 0;
  const etDate = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  for (const day of weekDays) {
    let doc;
    try {
      const res = await fetch(`https://site.web.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=${day}`, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`${res.status}`);
      doc = await res.json();
      daysFetched += 1;
    } catch (error) {
      console.warn(`Coverage live-check skipped for ${day} (ESPN unreachable: ${error.message})`);
      continue;
    }
    for (const ev of doc.events ?? []) {
      const comp = (ev.competitions && ev.competitions[0]) || {};
      const cs = comp.competitors || [];
      const home = cs.find((c) => c.homeAway === "home");
      const away = cs.find((c) => c.homeAway === "away");
      if (!home || !away) continue;
      const homeName = home.team.displayName ?? `${home.team.location ?? ""} ${home.team.name ?? ""}`.trim();
      const awayName = away.team.displayName ?? `${away.team.location ?? ""} ${away.team.name ?? ""}`.trim();
      const bothFbs = teamNameSet.has(String(homeName).toLowerCase()) && teamNameSet.has(String(awayName).toLowerCase());
      if (!bothFbs) { fcsSkipped.push(`${ev.date.slice(0, 10)} ${awayName} at ${homeName}`); continue; }
      const hSlug = espnSlugFor(homeName);
      const aSlug = espnSlugFor(awayName);
      const date = etDate(ev.date); // board keys use the Eastern date; late games roll UTC+1
      const key = `${date}:${[aSlug, hSlug].sort().join(":")}`;
      if (!scheduledPairs.has(key) && !playedPairs.has(key)) {
        missing.push(`${date} ${awayName} at ${homeName} → ${aSlug} @ ${hSlug}`);
      }
    }
  }
  if (missing.length) {
    throw new Error(`FBS coverage check FAILED — ESPN lists ${missing.length} FBS-vs-FBS game(s) missing from the board:\n${missing.join("\n")}`);
  }
  if (daysFetched === 0 && process.env.CI === "true") {
    throw new Error("Coverage live-check could not reach ESPN on any day of the snapshot week (CI build)");
  }
  console.log(`Coverage check: hermetic exclusion evidence OK; live board covers ${scheduledPairs.size} scheduled + ${playedPairs.size} played pairs across ${daysFetched}/7 days (${fcsSkipped.length} FCS-opponent entries skipped)`);
}

const sharedDataRevision = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
const body = `// GENERATED by scripts/build-dataset.mjs from data/cfb-2026 — do not edit.
// biome-ignore lint: generated file
export default ${JSON.stringify({ ...payload, sharedDataRevision })};
`;

const target = fileURLToPath(new URL("../lib/cfb-2026.generated.ts", import.meta.url));
writeFileSync(target, body, "utf8");
console.log(
  `Wrote ${target} (${(body.length / 1024).toFixed(0)} KiB): ` +
    `${teams.length} teams, ${Object.keys(schedules).length} schedules, ` +
    `${Object.keys(coaching).length} staffs, ${payload.playedGames.length} played games`,
);
