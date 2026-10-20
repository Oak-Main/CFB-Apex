"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { gameDaySnapshot, type GameDaySnapshot } from "@/lib/gameday-shared";
import { easternDate } from "@/lib/game-calendar";
import { dateLabel } from "@/lib/homepage";
import type { BoardWeekSelection } from "@/lib/week-cutover";
import { useBoardWeekCutover } from "@/components/broadcast/week-switch";

export function GameDayCommandCenter({ selection }: { selection?: BoardWeekSelection }) {
  const explicitWeek = selection?.explicit ? selection.week : null;
  const [snapshot, setSnapshot] = useState(() => gameDaySnapshot(selection?.serverNow ?? Date.now(), explicitWeek == null ? null : String(explicitWeek)));
  const [query, setQuery] = useState("");
  const [day, setDay] = useState("");
  const [conference, setConference] = useState("");
  const [refreshFailed, setRefreshFailed] = useState(false);
  useBoardWeekCutover(snapshot.weeks, { week: snapshot.selectedWeek, explicit: snapshot.explicit, serverNow: snapshot.serverNow }, true);

  useEffect(() => {
    let active = true;
    let pending = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (document.visibilityState !== "visible" || pending) return;
      pending = true;
      try {
        const response = await fetch(`/api/gameday${explicitWeek == null ? "" : `?week=${explicitWeek}`}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
        if (!response.ok) throw new Error("Snapshot unavailable");
        const doc = await response.json() as GameDaySnapshot;
        if (doc.schemaVersion !== 1 || !doc.revision || !Array.isArray(doc.games) || !Array.isArray(doc.teams) || !Array.isArray(doc.polls) || !Array.isArray(doc.injuries?.watch)) throw new Error("Invalid snapshot");
        if (active) { setSnapshot(doc); setRefreshFailed(false); }
      } catch {
        if (active) setRefreshFailed(true);
      } finally { pending = false; }
    };
    void refresh();
    const interval = window.setInterval(refresh, 300000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { active = false; controller.abort(); window.clearInterval(interval); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [explicitWeek]);

  const bySlug = useMemo(() => new Map(snapshot.teams.map(team => [team.slug, team])), [snapshot.teams]);
  const ap = snapshot.polls.find(poll => poll.poll === "ap");
  const ranks = new Map(ap?.rankings.map(row => [row.team_slug, row.rank]));
  const week = snapshot.weeks.find(row => row.week === snapshot.selectedWeek);
  const marquee = snapshot.games.find(game => game.id === week?.marquee_game_id);
  const dates = [...new Set(snapshot.games.map(game => easternDate(game.date)))].sort();
  const conferences = [...new Set(snapshot.teams.map(team => team.conference))].sort();
  const visibleGames = snapshot.games.filter(game => {
    const away = bySlug.get(game.awayTeamId);
    const home = bySlug.get(game.homeTeamId);
    return (!day || easternDate(game.date) === day) && (!conference || away?.conference === conference || home?.conference === conference) &&
      `${away?.name} ${home?.name} ${game.broadcast ?? ""} ${game.venue}`.toLowerCase().includes(query.trim().toLowerCase());
  });

  const teamLine = (slug: string) => {
    const team = bySlug.get(slug);
    return <span className="gd-team"><img src={team?.logo ?? ""} alt="" width={30} height={30} loading="lazy" />{ranks.has(slug) ? <b className="gd-rank">{ranks.get(slug)}</b> : null}<strong>{team?.shortName ?? slug}</strong><small>{team?.record ?? "Record not verified"}</small></span>;
  };

  return <div className="gd-command apex-container">
    <header className="gd-intro"><span className="apex-eyebrow">CFB APEX · WEEK {snapshot.selectedWeek} · {week?.label}</span><h1>GameDay Command Center</h1><p>One reviewed board for kickoff, TV, results and player availability. The Command Center and companion Lovable app use the same approved release.</p></header>
    <nav className="gd-weeks" aria-label="Command Center weeks"><a href="/gameday" aria-current={!snapshot.explicit ? "page" : undefined}>Current week</a>{snapshot.weeks.map(row => <a key={row.week} href={`/gameday?week=${row.week}`} aria-current={snapshot.explicit && row.week === snapshot.selectedWeek ? "page" : undefined}>Week {row.week}{row.week < Math.max(...snapshot.weeks.map(w => w.week)) ? " archive" : ""}</a>)}</nav>
    {refreshFailed ? <p className="gd-notice" role="status">Refresh unavailable. Showing the last verified snapshot with its original source dates.</p> : null}
    {marquee ? <section className="gd-hero" style={{ "--gd-away": bySlug.get(marquee.awayTeamId)?.color, "--gd-home": bySlug.get(marquee.homeTeamId)?.color } as CSSProperties} aria-labelledby="gd-marquee-title">
      <span className="gd-chip">{marquee.status === "final" ? "VERIFIED FINAL" : "GAME OF THE WEEK"} · {marquee.broadcast ?? "TV not published"}</span>
      <h2 id="gd-marquee-title">{bySlug.get(marquee.awayTeamId)?.shortName} at {bySlug.get(marquee.homeTeamId)?.shortName}</h2>
      <div className="gd-hero-teams">{teamLine(marquee.awayTeamId)}<span>AT</span>{teamLine(marquee.homeTeamId)}</div>
      <p>{marquee.status === "final" ? `FINAL · ${marquee.awayScore}–${marquee.homeScore}` : marquee.kickoffLabel} · {marquee.venue}</p><a href={`/games/${marquee.id}`}>Open verified game file →</a>
    </section> : null}
    <p className="gd-dates">Schedule checked {snapshot.sourceDates.schedule ?? "unknown"} · Results checked {snapshot.sourceDates.results ?? "unknown"}. Latest AP: {ap?.release_date ?? "not published"}. Team records checked {snapshot.sourceDates.records ?? "unknown"}; these are current records, including when viewing an archived schedule.</p>
    <section className="gd-panel" aria-labelledby="gd-timeline"><div className="gd-section-head"><div><span className="apex-eyebrow">WEEK {snapshot.selectedWeek} · REVIEWED SNAPSHOT</span><h2 id="gd-timeline">Game-day timeline</h2></div><strong>{snapshot.games.length} games</strong></div><div className="gd-timeline"><button type="button" aria-pressed={!day} onClick={() => setDay("")}>All days<br /><strong>{snapshot.games.length}</strong></button>{dates.map(date => <button key={date} type="button" aria-pressed={day === date} onClick={() => setDay(date)}>{dateLabel(date)}<br /><strong>{snapshot.games.filter(game => easternDate(game.date) === date).length} games</strong></button>)}</div></section>
    <section className="gd-panel" aria-labelledby="gd-finder"><div className="gd-section-head"><div><span className="apex-eyebrow">GROUNDED IN THIS WEEK’S BOARD</span><h2 id="gd-finder">Game finder</h2></div><span>{visibleGames.length} matching games</span></div><div className="gd-filters"><label>Find a team, network or venue<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Houston, ESPN, Rice-Eccles…" /></label><label>Conference<select value={conference} onChange={event => setConference(event.target.value)}><option value="">All conferences</option>{conferences.map(value => <option key={value}>{value}</option>)}</select></label></div>
      <div className="gd-games">{visibleGames.map(game => <article className="gd-game" key={game.id}><div className="gd-game-meta"><time>{dateLabel(easternDate(game.date))}</time><strong>{game.status.toUpperCase()}</strong></div>{teamLine(game.awayTeamId)}<span className="gd-at">{game.neutralSite ? "VS · NEUTRAL" : "AT"}</span>{teamLine(game.homeTeamId)}<p>{game.status === "final" ? `FINAL · ${game.awayScore}–${game.homeScore}` : game.kickoffLabel}</p><p>{game.broadcast ?? "TV not published"} · {game.venue}</p><a href={`/games/${game.id}`}>Game details and sources →</a></article>)}</div>{!visibleGames.length ? <p role="status">No matches in the reviewed Week {snapshot.selectedWeek} board. Try another team, day or conference.</p> : null}
    </section>
    <section className="gd-panel" aria-labelledby="gd-injuries"><div className="gd-section-head"><div><span className="apex-eyebrow">SOURCE DATE · {snapshot.injuries.asOf ?? "UNKNOWN"}</span><h2 id="gd-injuries">Player availability desk</h2></div><a href="/injuries">Full injury report →</a></div><p>{snapshot.injuries.coverageNote}</p><div className="gd-notes">{snapshot.injuries.watch.map(row => <article key={`${row.player}-${row.teamSlug}`}><h3>{row.player} <small>· {bySlug.get(row.teamSlug)?.shortName}</small></h3><strong>{row.reportedStatus ?? "Return unconfirmed"}</strong><p>Source date {row.sourceAsOf ?? "unknown"}. {row.note}</p>{row.sources[0] ? <a href={row.sources[0]} target="_blank" rel="noopener noreferrer">Source report</a> : null}</article>)}{snapshot.injuries.contextNotes.map(row => <article key={row.player}><h3>{row.player}</h3><strong>{row.title}</strong><p>Source date {row.source_as_of}. {row.note}</p><a href={row.sources[0]} target="_blank" rel="noopener noreferrer">Source report</a></article>)}</div></section>
    <section className="gd-panel" aria-labelledby="gd-finals"><div className="gd-section-head"><h2 id="gd-finals">Previous reviewed week · verified finals</h2><a href={`/scores?week=${snapshot.previousFinals[0]?.week ?? snapshot.selectedWeek}`}>Full results →</a></div><div className="gd-finals">{snapshot.previousFinals.map(game => <a key={game.id} href={`/games/${game.id}`}>{bySlug.get(game.awayTeamId)?.shortName} {game.awayScore} · {bySlug.get(game.homeTeamId)?.shortName} {game.homeScore} <small>FINAL</small></a>)}</div>{!snapshot.previousFinals.length ? <p>No earlier reviewed finals in this release.</p> : null}</section>
    <section className="gd-panel" aria-labelledby="gd-polls"><div className="gd-section-head"><h2 id="gd-polls">Polls on the record</h2><a href="/rankings">All rankings →</a></div><p>Poll editions retain their publication dates independently of the selected schedule. SP+ and FPI are unavailable pending permitted, current source verification.</p><div className="gd-polls">{snapshot.polls.map(poll => <div key={poll.poll}><h3>{poll.name} · {poll.release_date ?? "Unknown date"}</h3><ol>{poll.rankings.slice(0,10).map(row => <li key={`${row.rank}-${row.team_slug}`}><b>{row.rank}</b> {row.team_slug ? bySlug.get(row.team_slug)?.shortName ?? row.team : row.team}</li>)}</ol></div>)}</div></section>
  </div>;
}
