/**
 * CFP Selection Committee rankings, as released on collegefootballplayoff.com.
 *
 * Read from `lib/cfp-rankings.generated.ts` (built by
 * scripts/build-cfp-rankings.mjs from a receipt of the official page). The
 * committee publishes rank and record only: no points and no first-place
 * votes, so those stay null. The record is the one the committee printed with
 * its release. These rankings sit beside the AP and Coaches tables on
 * /rankings and are not part of the GameDay snapshot.
 */
import generated from "./cfp-rankings.generated.ts";
import type { PollTable } from "./cfb-dataset.ts";

export const cfpRankings = generated;

export const cfpPollTable: PollTable = {
  poll: "cfp",
  name: generated.name,
  release_date: generated.release_date,
  rankings: generated.rankings.map((row) => ({
    rank: row.rank,
    team_slug: row.team_slug,
    team: row.team,
    record: row.record,
    points: null,
    first_place_votes: null,
    previous_rank: row.previous_rank,
    tied: false,
  })),
  others: [],
};
