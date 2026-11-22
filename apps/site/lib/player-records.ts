import { getRoster, teams } from "./cfb-dataset";

export interface RosterPlayerRecord {
  name: string;
  position: string | null;
  teamId: string;
  teamName: string;
}

// A dated editorial snapshot supplements the historical transfer record only.
// It does not assert game availability, participation, or current statistics.
const javonnieGibsonProfile = {
  displayName: "Javonnie (JV) Gibson",
  rosterName: "JV Gibson",
  teamId: "cincinnati",
  season: 2026,
  jersey: "11",
  position: "WR",
  height: "6 ft 2 in",
  weight: "208 lb",
  classYear: "Fifth year",
  hometown: "Opelousas, Louisiana",
  previousSchool: "Oklahoma",
  checkedOn: "2026-11-22",
  sourceUrl: "https://gobearcats.com/sports/football/roster/player/jv-gibson",
  title: "Javonnie (JV) Gibson: Cincinnati WR Profile",
  description:
    "Javonnie (JV) Gibson is listed as a Cincinnati wide receiver on the 2026 official roster. See dated roster facts and his January transfer record.",
} as const;

export function reviewedPlayerProfile(slug: string) {
  return slug === "javonnie-gibson" ? javonnieGibsonProfile : undefined;
}

export function playerSlugForName(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z ]/g, "")
    .trim()
    .replaceAll(" ", "-");
}

let rosterPlayerIndex: Map<string, RosterPlayerRecord> | null = null;

function getRosterPlayerIndex() {
  if (rosterPlayerIndex) return rosterPlayerIndex;

  rosterPlayerIndex = new Map<string, RosterPlayerRecord>();
  for (const team of teams) {
    const roster = getRoster(team.slug);
    if (!roster) continue;

    for (const group of roster.position_groups) {
      for (const player of group.players) {
        const slug = playerSlugForName(player.name);
        if (rosterPlayerIndex.has(slug)) continue;
        rosterPlayerIndex.set(slug, {
          name: player.name,
          position: player.position,
          teamId: team.slug,
          teamName: team.name,
        });
      }
    }
  }

  return rosterPlayerIndex;
}

export function getRosterPlayerBySlug(slug: string) {
  return getRosterPlayerIndex().get(slug);
}
