/**
 * Ticket-affiliate partner configuration (TicketNetwork primary, TicketSmarter
 * secondary).
 *
 * LINK-FIRST BY DESIGN: partner links are ALWAYS rendered — users get a
 * working path to ticket inventory whether or not our commission paperwork
 * has cleared. While `trackedUrl` is null the link points directly at the
 * partner's public search results (no tracking, no commission). The moment
 * the affiliate click URL is issued, filling `trackedUrl` flips every link
 * on every surface to the tracked wrapper with zero component changes.
 *
 * To activate a partner once approved:
 *   1. Fill `trackedUrl` with the network click link, e.g.
 *      "https://<impact-or-cj-host>/click-<ids>?url={url}"
 *      ({url} is replaced with the percent-encoded destination).
 *   2. Verify the destination template resolves to that partner's live
 *      search results.
 *   3. Rendered links carry rel="sponsored nofollow" and sit beside the
 *      /affiliate-disclosure page, which describes the pending state.
 */

export interface TicketPartnerConfig {
  id: "ticketnetwork" | "ticketsmarter";
  name: string;
  /** Destination search URL; {query} is replaced with the team display name. */
  destTemplate: string;
  /** Network click URL wrapping the destination; null until tracking is live. */
  trackedUrl: string | null;
  commissionNote: string;
}

export const ticketPartners: TicketPartnerConfig[] = [
  {
    id: "ticketnetwork",
    name: "TicketNetwork",
    destTemplate: "https://www.ticketnetwork.com/search?q={query}",
    trackedUrl: "https://goto.ticketnetwork.com/c/7746757/120057/2322?url={url}",
    commissionNote: "12.5-14.5% per sale (via Impact)",
  },
  {
    id: "ticketsmarter",
    name: "TicketSmarter",
    destTemplate: "https://www.ticketsmarter.com/search?q={query}",
    trackedUrl: null,
    commissionNote: "8% per sale",
  },
];

export interface TicketLink {
  partner: string;
  url: string;
  commissionNote: string;
  /** True only when the link passes through the affiliate network wrapper. */
  tracked: boolean;
}

/**
 * Ticket partner links for a team. ALWAYS returns a link per partner —
 * direct while tracking is pending, wrapped once the network URL is set.
 */
export function ticketLinksForTeam(displayName: string): TicketLink[] {
  return ticketPartners.map((partner) => {
    const destination = partner.destTemplate.replace(
      "{query}",
      encodeURIComponent(`${displayName} football tickets`),
    );
    if (partner.trackedUrl) {
      return {
        partner: partner.name,
        url: partner.trackedUrl.replace("{url}", encodeURIComponent(destination)),
        commissionNote: partner.commissionNote,
        tracked: true,
      };
    }
    return {
      partner: partner.name,
      url: destination,
      commissionNote: partner.commissionNote,
      tracked: false,
    };
  });
}

/** True when at least one tracking URL is configured; not evidence of approval, clicks or commissions. */
export const ticketAffiliatesConfigured = ticketPartners.some(
  (partner) => partner.trackedUrl != null,
);
