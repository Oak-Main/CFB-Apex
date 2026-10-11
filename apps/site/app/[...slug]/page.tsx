import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HubApp } from "@/components/HubApp";
import { boardWeeks, coaches, fantasyNotes, games, getConferenceHub, portalEvents, stadiums, teams } from "@/lib/cfb-dataset";
import { getRosterPlayerBySlug, playerSlugForName } from "@/lib/player-records";
import { stadiumPageTitle, staticRootTitle, teamPageTitle } from "@/lib/seo-titles";
import { STATIC_ROOTS } from "@/lib/static-roots";
import { selectBoardWeek } from "@/lib/week-cutover";

// The scoreboard and ticker follow the request's server clock; never cache.
export const dynamic = "force-dynamic";

// Stadium names shared by multiple programs (e.g. "Memorial Stadium" x3) get
// team-qualified titles so they never collide in SERPs.
const sharedStadiumNames = new Set(
  stadiums
    .map((stadium) => stadium.name)
    .filter((name, index, all) => all.indexOf(name) !== index),
);


const staticRoots: ReadonlySet<string> = new Set(STATIC_ROOTS);

function isKnownPath(parts: string[]) {
  const [root, id] = parts;
  if (staticRoots.has(root)) {
    if (!id) return true;
    if (root === "teams" || root === "transfer-portal") return teams.some((team) => team.slug === id);
    if (root === "coaches") return coaches.some((coach) => coach.slug === id);
    if (root === "stadiums") return stadiums.some((stadium) => stadium.slug === id);
    if (root === "conferences") return getConferenceHub(id) != null;
    return false;
  }
  if (root === "games") return games.some((game) => game.id === id);
  if (root === "players") {
    return (
      portalEvents.some((event) => event.playerSlug === id) ||
      fantasyNotes.some((note) => playerSlugForName(note.player) === id) ||
      Boolean(getRosterPlayerBySlug(id))
    );
  }
  return false;
}

interface RoutePageProps {
  params: Promise<{ slug: string[] }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: RoutePageProps): Promise<Metadata> {
  const { slug } = await params;
  // Self-canonical on every catch-all page (2026-09-22): GSC was carrying
  // http://, https:// and leading-space variants of the same pages as
  // separate rows because nothing declared the canonical form. metadataBase
  // in the root layout resolves these relative paths to absolute URLs.
  const selfCanonical = { alternates: { canonical: `/${slug.join("/")}` } };
  const buildMeta = async (): Promise<Metadata> => {
  const [root, detail] = slug;
  if (root === "stadiums") {
    const stadium = detail ? stadiums.find((candidate) => candidate.slug === detail) : undefined;
    const team = stadium ? teams.find((candidate) => candidate.id === stadium.teamId) : undefined;
    return {
      title: stadium
        ? stadiumPageTitle(stadium.name, team?.shortName, {
            disambiguate: sharedStadiumNames.has(stadium.name),
          })
        : "College Football Stadium Gameday Guides",
      description: stadium
        ? `Parking, transit, bag policy, tailgating, visitor seating, and accessibility guidance for ${stadium.name}, home of ${team?.name ?? "its FBS program"}.`
        : "Verified gameday guides for all 138 FBS stadiums, including parking, transit, bag policy, tailgating, visitor seating, and accessibility.",
    };
  }
  if (root === "teams") {
    const team = detail ? teams.find((candidate) => candidate.slug === detail) : undefined;
    if (!team) return {};
    return {
      title: teamPageTitle(team.shortName),
      description: `${team.name} 2026 football schedule, roster, and transfer portal movement in one place.`,
    };
  }
  if (root === "players" && detail) {
    const portal = portalEvents.find((event) => event.playerSlug === detail);
    const fantasy = fantasyNotes.find((note) => playerSlugForName(note.player) === detail);
    const roster = getRosterPlayerBySlug(detail);
    const playerName = portal?.player ?? fantasy?.player ?? roster?.name ?? detail.replaceAll("-", " ");
    const position = portal?.position ?? fantasy?.position ?? roster?.position ?? "College football player";
    const teamId = portal?.toTeamId ?? fantasy?.team ?? roster?.teamId ?? portal?.fromTeamId;
    const team = teams.find((candidate) => candidate.id === teamId);
    return {
      title: `${playerName} — ${position} Player Record`,
      description: `${playerName} player record${team ? ` for ${team.name}` : ""}, including verified portal movement or fantasy analysis when published.`,
    };
  }
  if (root === "search") {
    return {
      title: "Search Teams, Coaches, and Players",
      description: "Search CFB Apex across all 138 FBS programs, head coaches, and rostered players.",
    };
  }
  if (root === "watch") {
    return {
      title: "Where to Watch College Football",
      description:
        "Find weekly college football TV windows, verified local radio flagships, and official team ticket destinations.",
    };
  }
  if (root === "transfer-portal") {
    const team = detail ? teams.find((candidate) => candidate.slug === detail) : null;
    return {
      title: team ? `${team.shortName} Transfer Portal Ledger` : "College Football Transfer Portal Board",
      description: team
        ? `Verified incoming and outgoing transfer movement for ${team.name}.`
        : "Track verified college football transfers by player, position, program, status, date, and source confidence.",
    };
  }
  if (root === "injuries") {
    return {
      title: "College Football Injury Report",
      description:
        "Dated official game-availability snapshots for tracked players on selected teams, plus sourced historical injury context. Coverage is limited.",
    };
  }
  if (root === "highlight") {
    return {
      title: "Athlete Highlight of the Week — College Football's Top Performance",
      description:
        "One winner, four runners-up, and the criteria that picked them — compiled from verified box scores, weighted for opponent quality and game-deciding execution.",
    };
  }
  if (root === "panel") {
    return {
      title: "The Panel — Three Analysts, Zero Agreement",
      description:
        "Three fixed football philosophies — traditionalist, analyst, talent evaluator — debate the week's biggest questions with sourced facts. The personas argue; the numbers are real.",
    };
  }
  if (root === "upset-watch") {
    return {
      title: "Upset Watch — Week 5 Board",
      description:
        "Three-to-five sourced upset picks with live betting lines, the trap game the public will chase, and the honest counter-argument for every pick.",
    };
  }
  if (root === "playoff-audit") {
    return {
      title: "Road to the Playoff — 12-Team Resume Audit",
      description:
        "The weekly 12-team College Football Playoff resume audit: composite ranks, remaining strength of schedule, best wins, closest calls, and what ends each contender's case.",
    };
  }
  if (root === "dfs") {
    return {
      title: "College Fantasy Notes Board",
      description:
        "Published college fantasy roles, usage notes, availability, and analyst ranks with source context.",
    };
  }
  if (root === "coaching-carousel" || root === "coaches") {
    const coach = detail ? coaches.find((candidate) => candidate.slug === detail) : null;
    return {
      title: coach ? `${coach.name} Contract Ledger` : "College Football Coaching Ledger",
      description:
        "Compare verified college football coaching contracts, source notes, and explainable buyout estimates.",
    };
  }
  if (root === "rankings") {
    return {
      title: "College Football Rankings — AP Top 25, Coaches Poll & Composite",
      description:
        "The current AP Top 25 and Coaches Poll, plus the CFB Apex composite board — every row cited to its release, updated as the polls publish.",
    };
  }
  const fallbackTitle = staticRootTitle(root);
  if (fallbackTitle) {
    return { title: fallbackTitle };
  }
  return {};
  };
  return { ...(await buildMeta()), ...selfCanonical };
}

export default async function RoutePage({ params, searchParams }: RoutePageProps) {
  const { slug } = await params;
  if (!isKnownPath(slug)) notFound();
  // `?week=` only previews the scoreboard; other routes follow the clock.
  const week = slug[0] === "scores" ? (await searchParams)?.week : undefined;
  return <HubApp path={`/${slug.join("/")}`} boardWeek={selectBoardWeek(boardWeeks, Date.now(), week)} />;
}
