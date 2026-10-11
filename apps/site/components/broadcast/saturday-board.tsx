import { easternDate } from "@/lib/game-calendar";
import { LaneHeading, TeamMark } from "./primitives";
import { kickoffTime, type BroadcastGame, type BroadcastTeam } from "@/lib/homepage";

const WAVES = [
  { key: "early", label: "EARLY", hint: "before 2:30 PM ET", max: 14 * 60 + 29 },
  { key: "afternoon", label: "AFTERNOON", hint: "2:30 – 5:29 PM ET", max: 17 * 60 + 29 },
  { key: "prime", label: "PRIME", hint: "5:30 – 9:29 PM ET", max: 21 * 60 + 29 },
  { key: "late", label: "LATE", hint: "9:30 PM ET and later", max: 24 * 60 },
] as const;

function kickoffMinutes(game: BroadcastGame): number | null {
  const m = kickoffTime(game).match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!m) return null;
  let hours = Number(m[1]) % 12;
  if (/PM/i.test(m[3])) hours += 12;
  return hours * 60 + Number(m[2]);
}

function BoardRow({
  game,
  away,
  home,
}: {
  game: BroadcastGame;
  away: BroadcastTeam;
  home: BroadcastTeam;
}) {
  return (
    <li className="apex-gdc-row">
      <span className="apex-gdc-time">{kickoffTime(game)}</span>
      <div className="apex-gdc-matchup">
        <span className="apex-gdc-team">
          {away.rank != null && <em className="apex-gdc-rank">{away.rank}</em>}
          {away.shortName}
        </span>
        <span className="apex-gdc-at">{game.neutralSite ? "vs" : "at"}</span>
        <span className="apex-gdc-team">
          {home.rank != null && <em className="apex-gdc-rank">{home.rank}</em>}
          {home.shortName}
        </span>
        {game.neutralSite && game.venue ? (
          <span className="apex-gdc-neutral">{game.venue} (neutral site)</span>
        ) : null}
      </div>
      {game.broadcast ? (
        <span className="apex-gdc-tv" data-net={game.broadcast.replace(/\s+/g, "")}>
          {game.broadcast}
        </span>
      ) : (
        <span className="apex-gdc-tv apex-gdc-tv--none">TV N/A</span>
      )}
    </li>
  );
}

export function SaturdayBoard({
  games,
  teams,
  pollTables,
}: {
  games: readonly BroadcastGame[];
  teams: readonly BroadcastTeam[];
  pollTables: readonly {
    poll: string;
    rankings: readonly { team_slug: string | null; rank: number }[];
  }[];
}) {
  const bySlug = new Map(teams.map((team) => [team.slug, team]));
  const rows = games
    .filter((game) => new Date(`${easternDate(game.date)}T12:00:00Z`).getUTCDay() === 6 && game.status !== "final")
    .map((game) => {
      const away = bySlug.get(game.awayTeamId);
      const home = bySlug.get(game.homeTeamId);
      if (!away || !home) return null;
      return { game, away, home, minutes: kickoffMinutes(game) };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);
  if (rows.length === 0) return null;
  // Official TBA kickoffs stay on the board in their own group, never in a time wave.
  const unslotted = rows.filter((row) => row.minutes == null);

  const playingSlugs = new Set(games.flatMap((game) => [game.awayTeamId, game.homeTeamId]));
  const ap = pollTables.find((table) => table.poll === "ap");
  // Absence from an FBS-vs-FBS board is not a bye: the team may face an FCS opponent.
  const offBoard =
    ap?.rankings
      .filter((entry) => entry.team_slug && !playingSlugs.has(entry.team_slug))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 8) ?? [];

  return (
    <section className="apex-lane" aria-labelledby="gdc-board-title">
      <LaneHeading
        id="gdc-board-title"
        eyebrow="GAMEDAY CENTRAL"
        title="Saturday board"
        href="/scores"
        linkLabel="Full slate"
      />
      <div className="apex-gdc-waves">
        {WAVES.map((wave, index) => {
          const waveRows = rows.filter((row) => {
            const previous = WAVES[index - 1]?.max ?? -1;
            return row.minutes != null && row.minutes > previous && row.minutes <= wave.max;
          });
          return (
            <div className="apex-gdc-wave" key={wave.key}>
              <div className="apex-gdc-wave-head">
                <span className="apex-gdc-wave-index" aria-hidden="true">
                  0{index + 1}
                </span>
                <div>
                  <strong>{wave.label}</strong>
                  <span>{wave.hint}</span>
                </div>
              </div>
              {waveRows.length === 0 ? (
                <p className="apex-gdc-empty">No games slotted</p>
              ) : (
                <ul>
                  {waveRows.map((row) => (
                    <BoardRow key={row.game.id} {...row} />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {unslotted.length > 0 && (
        <div className="apex-gdc-wave apex-gdc-wave--tba">
          <div className="apex-gdc-wave-head">
            <div>
              <strong>KICKOFF TBA</strong>
              <span>officially unannounced</span>
            </div>
          </div>
          <ul>
            {unslotted.map((row) => (
              <BoardRow key={row.game.id} game={row.game} away={row.away} home={row.home} />
            ))}
          </ul>
        </div>
      )}
      {offBoard.length > 0 && (
        <p className="apex-gdc-byes">
          <strong>Ranked, not on this FBS board:</strong>{" "}
          {offBoard
            .map((entry) => {
              const team = bySlug.get(entry.team_slug ?? "");
              return `No. ${entry.rank} ${team?.shortName ?? entry.team_slug}`;
            })
            .join(" · ")}
        </p>
      )}
      <p className="apex-data-note">
        Kickoffs and TV designations as scheduled · rankings reflect the latest AP poll ·
        times Eastern.
      </p>
    </section>
  );
}
