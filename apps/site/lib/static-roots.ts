/**
 * Top-level routes served by app/[...slug]. One list shared by the router
 * (which 404s anything else) and the sitemap, so the sitemap can never list a
 * root the site does not serve, or miss one it does.
 */
export const STATIC_ROOTS = [
  "scores",
  "schedule",
  "transfer-portal",
  "injuries",
  "gameday",
  "playoff-predictor",
  "playoff-bracket",
  "no-names",
  "heisman",
  "upset-watch",
  "playoff-audit",
  "highlight",
  "nil",
  "panel",
  "coaches",
  "coaching-carousel",
  "dfs",
  "teams",
  "conferences",
  "stadiums",
  "watch",
  "rankings",
  "search",
  "newsletter",
  "methodology",
  "data-sources",
  "corrections",
  "about",
  "advertise",
  "partnerships",
  "media-kit",
  "privacy",
  "terms",
  "affiliate-disclosure",
  "responsible-gaming",
  "design-system",
] as const;

/**
 * Served but kept out of the sitemap: internal search results (thin,
 * query-dependent pages Google advises against listing) and the internal
 * design-system showcase.
 */
export const SITEMAP_EXCLUDED_ROOTS: ReadonlySet<string> = new Set(["search", "design-system"]);
