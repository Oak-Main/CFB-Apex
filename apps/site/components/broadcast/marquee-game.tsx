import Image from "next/image";
import { ArrowUpRight, CalendarDays, MapPin, Radio, Tv } from "lucide-react";
import {
  conferenceLabel,
  dateLabel,
  kickoffTime,
  published,
  type BroadcastGame,
  type BroadcastTeam,
} from "@/lib/homepage";
import { preseasonRatings } from "@/lib/cfb-dataset";
import { BroadcastBadge, BroadcastButton, TeamMark } from "./primitives";

export function MarqueeGame({
  game,
  away,
  home,
  venue,
  gameday,
}: {
  game: BroadcastGame;
  away: BroadcastTeam;
  home: BroadcastTeam;
  venue?: string;
  gameday?: { badge: string; note: string | null } | null;
}) {
  const spRow = preseasonRatings[away.slug]?.sp ? preseasonRatings[away.slug] : preseasonRatings[home.slug];
  const spAsOf = spRow?.as_of
    ? new Date(`${spRow.as_of}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;
  return (
    <section
      className="apex-marquee apex-enter"
      aria-labelledby="marquee-title"
    >
      <Image
        className="apex-marquee-image"
        src="/images/saturday-lights.png"
        alt=""
        fill
        sizes="(max-width: 600px) 100vw, (max-width: 1400px) 92vw, 1320px"
        priority
        unoptimized
      />
      <div className="apex-field-stripes" aria-hidden="true" />
      <div className="apex-marquee-main">
        <div className="apex-marquee-copy">
          <div className="apex-marquee-topline">
            <BroadcastBadge tone="gold">
              <Radio size={13} aria-hidden="true" />
              GAME OF THE WEEK
            </BroadcastBadge>
            {gameday ? (
              <BroadcastBadge tone="gold">{gameday.badge}</BroadcastBadge>
            ) : null}
            <span>{game.neutralSite ? "NEUTRAL SITE" : "MARQUEE MATCHUP"}</span>
          </div>
          <h2 id="marquee-title" className="text-balance">
            <span>{away.shortName} </span>
            <span>
              <em>{game.neutralSite ? "vs" : "at"} </em>
              {home.shortName}
            </span>
          </h2>
          <div className="apex-marquee-meta">
            <span>
              <CalendarDays size={15} aria-hidden="true" />
              {dateLabel(game.date)}
            </span>
            <span>
              <Tv size={15} aria-hidden="true" />
              {published(game.broadcast)}
              <span aria-hidden="true">·</span>
              {/* An archived week's marquee is a verified final: show the result, not a kickoff. */}
              {game.status === "final" && game.awayScore != null && game.homeScore != null
                ? `FINAL · ${away.shortName} ${game.awayScore}, ${home.shortName} ${game.homeScore}`
                : kickoffTime(game)}
            </span>
          </div>
          <div className="apex-marquee-actions">
            <BroadcastButton href={`/games/${game.id}`}>
              Matchup center
            </BroadcastButton>
            <BroadcastButton href="/watch" secondary>
              How to watch
            </BroadcastButton>
          </div>
        </div>
        <div className="apex-marquee-matchup">
          {[away, home].map((team, index) => (
            <div key={team.slug} className="contents">
              {index === 1 && (
                <span className="apex-versus" aria-hidden="true">
                  VS
                </span>
              )}
              <div className="apex-marquee-team">
                <a href={`/teams/${team.slug}`}>
                  <TeamMark team={team} size="hero" priority />
                  <span className="apex-marquee-team-name">
                    {team.rank != null && (
                      <small>
                        <span className="sr-only">Published AP rank </span>
                        {team.rank}
                      </small>
                    )}
                    {team.shortName}
                  </span>
                </a>
                <span>
                  {team.record || "Not published"}
                  <span aria-hidden="true"> · </span>
                  {conferenceLabel(team.conference)}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="apex-sp-duel">
          <span className="apex-sp-duel-head">SP+ CONTRAST{spAsOf ? ` · AS OF ${spAsOf}` : ""}</span>
          {[away, home].map((team) => {
            const sp = preseasonRatings[team.slug]?.sp;
            return (
              <div key={team.slug} className="apex-sp-duel-side">
                <strong>{sp ? `${sp.overall > 0 ? "+" : ""}${sp.overall.toFixed(1)}` : "—"}</strong>
                <span>{sp ? `No. ${sp.rank} SP+` : "Not rated"}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="apex-marquee-bottom">
        <span>
          <MapPin size={16} aria-hidden="true" />
          {venue || game.venue || "Venue not published"}
        </span>
        <a href="/rankings">
          Rankings: latest published AP poll
          <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
