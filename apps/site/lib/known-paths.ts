import { coaches, fantasyNotes, getConferenceHub, getGame, portalEvents, stadiums, teams } from "./cfb-dataset";
import { getRosterPlayerBySlug, playerSlugForName } from "./player-records";
import { STATIC_ROOTS } from "./static-roots";

const staticRoots: ReadonlySet<string> = new Set(STATIC_ROOTS);

/** Whether `app/[...slug]` has a page for these path segments. */
export function isKnownPath(parts: string[]) {
  const [root, id] = parts;
  if (staticRoots.has(root)) {
    if (!id) return true;
    if (root === "teams" || root === "transfer-portal") return teams.some((team) => team.slug === id);
    if (root === "coaches") return coaches.some((coach) => coach.slug === id);
    if (root === "stadiums") return stadiums.some((stadium) => stadium.slug === id);
    if (root === "conferences") return getConferenceHub(id) != null;
    return false;
  }
  if (root === "games") return getGame(id) != null;
  if (root === "players") {
    return (
      portalEvents.some((event) => event.playerSlug === id) ||
      fantasyNotes.some((note) => playerSlugForName(note.player) === id) ||
      Boolean(getRosterPlayerBySlug(id))
    );
  }
  return false;
}

/** First path segments served by app routes other than `app/[...slug]`, and by vinext itself. */
const APP_ROUTE_ROOTS: ReadonlySet<string> = new Set(["admin", "api", "feeds", "icon.png", "robots.txt", "sitemap.xml", "_next", "_vinext"]);

/**
 * Whether a request is for a page `app/[...slug]` will answer with its
 * not-found UI. vinext 1.2 streams that page under the root loading boundary,
 * so its notFound() arrives after a 200 status is sent; the Worker uses this
 * to send 404 instead. RSC requests keep the framework's own handling.
 */
export function isUnknownCatchAllPage(request: Request, url: URL) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  if (request.headers.get("RSC") === "1" || url.pathname.endsWith(".rsc")) return false;
  let segments: string[];
  try {
    segments = url.pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
  } catch {
    return false;
  }
  if (segments.length === 0 || APP_ROUTE_ROOTS.has(segments[0])) return false;
  return !isKnownPath(segments);
}
