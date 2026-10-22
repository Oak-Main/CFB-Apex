/** Shared publication gate for ingestion AND every dataset build. */
export function validateOfficialReports(value, { teams, games, weeks, week }) {
  const fail = detail => { throw new Error(`Invalid official availability report: ${detail}`); };
  if (value == null) return [];
  if (!Array.isArray(value)) fail("official_reports must be an array");
  const bySlug = new Map(teams.map(team => [team.slug, team]));
  const board = weeks.find(row => row.week === week);
  const statuses = new Set(["Available", "Out", "Doubtful", "Questionable", "Probable", "Game Time Decision", "Exempt", "Out (1st Half)", "Out for Season"]);
  const seen = new Set();
  for (const row of value) {
    if (!row || typeof row !== "object") fail("row must be an object");
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(row.game_date ?? "") && Number.isFinite(Date.parse(row.game_date)) && new Date(row.game_date).toISOString().slice(0, 10) === row.game_date;
    // Some official public boards publish only a calendar date. Require an
    // explicit precision marker rather than inventing a midnight timestamp.
    const dateOnly = row.publication_precision === "date";
    const validPublicationDate = typeof row.published_at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.published_at) && Number.isFinite(Date.parse(row.published_at)) && new Date(row.published_at).toISOString().slice(0, 10) === row.published_at;
    const validPrecision = row.publication_precision == null || row.publication_precision === "timestamp" || dateOnly;
    const published = validPrecision && (dateOnly ? validPublicationDate : typeof row.published_at === "string" && row.published_at.includes("T")) ? Date.parse(row.published_at) : NaN;
    const retrieved = typeof row.retrieved_at === "string" && row.retrieved_at.includes("T") ? Date.parse(row.retrieved_at) : NaN;
    let source;
    try { source = new URL(row.source_url); } catch { fail("source URL is malformed"); }
    if (!row.player || !bySlug.has(row.team_slug) || !row.position || !row.conference || !statuses.has(row.status) || !validDate || !row.report_id || !row.report_type || !Number.isFinite(published) || !Number.isFinite(retrieved) || published > retrieved || source.protocol !== "https:" || !source.hostname || source.username || source.password) fail("missing or invalid dated source fields");
    if (!board || row.game_date < board.start || row.game_date > board.end) fail("game date is outside the research week");
    const match = games.find(game => {
      const id = game.game_id ?? `${game.date}-${game.away_slug}-at-${game.home_slug}`;
      return id === row.game_id && game.date === row.game_date && [game.away_slug, game.home_slug].includes(row.team_slug) && (game.week == null || game.week === week);
    });
    if (!match) fail("game ID/date/team does not match a reviewed game");
    const away = bySlug.get(match.away_slug)?.school;
    const home = bySlug.get(match.home_slug)?.school;
    const canonical = `${away} ${match.neutral_site ? "vs" : "at"} ${home}`;
    if (!away || !home || row.matchup !== canonical) fail(`matchup must be ${canonical}`);
    const key = `${row.team_slug}:${row.player}:${row.game_date}`;
    if (seen.has(key)) fail("duplicate player/game");
    seen.add(key);
  }
  return value;
}
