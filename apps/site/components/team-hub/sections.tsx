"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  MapPin,
  Radio,
  ShieldCheck,
  TrainFront,
  Trophy,
} from "lucide-react";
import { ticketLinksForTeam } from "@/lib/affiliates";
import { travelLinksForQuery, travelAffiliatesConfigured } from "@/lib/travel-affiliates";
import type { HubTransfer, TeamHubProps } from "@/lib/team-hub";
import {
  dateLabel,
  decimal,
  HubEmpty,
  HubHeading,
  HubLink,
  HubSection,
  published,
  rank,
} from "./ui";

function TransferRow({
  row,
  incoming,
}: {
  row: HubTransfer;
  incoming: boolean;
}) {
  return (
    <div className="hub-transfer-row">
      <span className="hub-position-chip">{published(row.position)}</span>
      <div>
        <strong>
          {row.href ? <a href={row.href}>{row.player}</a> : row.player}
        </strong>
        <p>
          {incoming ? "From" : "To"} {published(incoming ? row.from : row.to)}
        </p>
      </div>
      <time dateTime={row.date ?? undefined}>{dateLabel(row.date, false)}</time>
    </div>
  );
}

function TransferLedger({
  rows,
  incoming,
}: {
  rows: HubTransfer[];
  incoming: boolean;
}) {
  return (
    <div className="hub-card hub-ledger" data-incoming={incoming}>
      <div className="hub-card-heading">
        <h3>
          {incoming ? (
            <ArrowDownLeft size={18} aria-hidden="true" />
          ) : (
            <ArrowUpRight size={18} aria-hidden="true" />
          )}
          {incoming ? "Incoming" : "Outgoing"}
          <span className="hub-count">{rows.length}</span>
        </h3>
        <span className="hub-muted">DATE</span>
      </div>
      {rows.length ? (
        <>
          {rows.slice(0, 5).map((row) => (
            <TransferRow row={row} incoming={incoming} key={row.id} />
          ))}
          {rows.length > 5 ? (
            <details className="hub-ledger-more">
              <summary>
                View all {rows.length} {incoming ? "arrivals" : "departures"}
                <ChevronDown size={16} aria-hidden="true" />
              </summary>
              {rows.slice(5).map((row) => (
                <TransferRow row={row} incoming={incoming} key={row.id} />
              ))}
            </details>
          ) : null}
        </>
      ) : (
        <HubEmpty
          title={`No ${incoming ? "incoming" : "outgoing"} moves recorded`}
        >
          No verified transfers in this direction appear in the current dataset.
        </HubEmpty>
      )}
    </div>
  );
}

export function PortalSection({
  portal,
  team,
}: Pick<TeamHubProps, "portal" | "team">) {
  const net = portal ? portal.incoming.length - portal.outgoing.length : null;
  return (
    <HubSection id="portal">
      <HubHeading eyebrow="THE ROSTER RESHUFFLE" title="Transfer portal">
        {portal ? (
          <span className="hub-portal-total">
            {portal.incoming.length} in / {portal.outgoing.length} out{" "}
            <span>
              · net {net != null && net > 0 ? "+" : ""}
              {net}
            </span>
          </span>
        ) : null}
      </HubHeading>
      {portal ? (
        <>
          <div className="hub-two-column">
            <TransferLedger rows={portal.incoming} incoming />
            <TransferLedger rows={portal.outgoing} incoming={false} />
          </div>
          <div className="hub-section-foot">
            <span>Verified moves · As of {dateLabel(portal.asOf)}</span>
            <HubLink href={`/transfer-portal/${team.slug}`}>
              Full transfer ledger
            </HubLink>
          </div>
        </>
      ) : (
        <HubEmpty title="Transfer ledger not published">
          No sourced transfer dataset is available for this program.
        </HubEmpty>
      )}
    </HubSection>
  );
}

export function GamedaySection({
  stadium,
  radio,
  radioAsOf,
  teamName,
}: Pick<TeamHubProps, "stadium" | "radio" | "radioAsOf"> & { teamName?: string }) {
  const ticketLinks = teamName ? ticketLinksForTeam(teamName) : [];
  return (
    <HubSection id="gameday">
      <HubHeading eyebrow="MAKE A SATURDAY OF IT" title="Your gameday, covered">
        <HubLink href="/watch">Watch guide</HubLink>
      </HubHeading>
      <div className="hub-gameday-grid">
        <div className="hub-card hub-stadium">
          <span className="hub-eyebrow">HOME FIELD</span>
          <MapPin size={24} aria-hidden="true" />
          <h3 className="font-display">
            {stadium?.name ?? "Stadium not published"}
          </h3>
          <p>{stadium?.city ?? "City not published"}</p>
          <div className="hub-capacity">
            <strong className="font-display">
              {stadium?.capacity != null
                ? stadium.capacity.toLocaleString("en-US")
                : "Not published"}
            </strong>
            <span>STADIUM CAPACITY</span>
          </div>
          {stadium ? (
            <>
              <HubLink href={`/stadiums/${stadium.slug}`}>
                Gameday guide
              </HubLink>
              <span className="hub-verified">
                <ShieldCheck size={14} aria-hidden="true" />
                Verified {dateLabel(stadium.lastVerified)}
              </span>
            </>
          ) : (
            <p className="hub-muted">
              A verified venue guide is not available for this team.
            </p>
          )}
        </div>
          {travelAffiliatesConfigured && stadium ? (
            <div className="hub-tickets hub-travel">
              <span className="hub-eyebrow">PLAN THE TRIP</span>
              <p>Some links may be affiliate links. CFB Apex may earn a commission if you book through them. See the{" "}
                <a href="/affiliate-disclosure">affiliate disclosure</a>.
              </p>
              {travelLinksForQuery(`hotels near ${stadium.name} ${stadium.city}`, "hotels")
                .concat(travelLinksForQuery(`${stadium.city} car rental`, "cars"))
                .concat(travelLinksForQuery(`flights to ${stadium.city}`, "flights"))
                .map((link) => (
                  <a key={`travel-${link.partner}`} href={link.url} target="_blank" rel="sponsored nofollow noreferrer noopener">
                    {link.category === "hotels" ? "Hotels" : link.category === "cars" ? "Car rental" : "Flights"} · {link.partner}
                    <span>{link.tracked ? "Affiliate link" : "Direct link"}</span>
                  </a>
                ))}
            </div>
          ) : null}
          {ticketLinks.length ? (
            <div className="hub-tickets">
              <span className="hub-eyebrow">TICKETS</span>
              <p>Some links may be affiliate links. CFB Apex may earn a commission if you buy through them. See the{" "}
                <a href="/affiliate-disclosure">affiliate disclosure</a>.
              </p>
              {ticketLinks.map((link) => (
                <a
                  key={link.partner}
                  href={link.url}
                  target="_blank"
                  rel="sponsored nofollow noreferrer noopener"
                >
                  {link.partner}
                  <span>{link.tracked ? "Affiliate link" : "Direct link"}</span>
                </a>
              ))}
            </div>
          ) : null}
        <div className="hub-card hub-gameday-facts">
          <div className="hub-fact">
            <ShieldCheck size={20} aria-hidden="true" />
            <div>
              <h3>Before you reach the gate</h3>
              <p>{stadium?.clearBag || "Clear-bag policy: Not published."}</p>
            </div>
          </div>
          <div className="hub-fact">
            <TrainFront size={20} aria-hidden="true" />
            <div>
              <h3>Getting there</h3>
              <p>{stadium?.transit || "Transit information: Not published."}</p>
            </div>
          </div>
          <div className="hub-fact hub-radio">
            <Radio size={20} aria-hidden="true" />
            <div>
              <span className="hub-eyebrow">ON THE AIR · LOCAL FLAGSHIP</span>
              <h3>
                {radio?.station ?? "Station not published"}
                <span>{radio?.frequency ?? "Frequency not published"}</span>
              </h3>
              <p>
                {radio?.network ?? "Network not published"}
                {radio?.market ? ` · ${radio.market}` : ""}
              </p>
              <span className="hub-muted">As of {dateLabel(radioAsOf)}</span>
              {radio?.stream && /^https?:\/\//.test(radio.stream) ? (
                <HubLink href={radio.stream}>Listen with the network</HubLink>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <p className="hub-fine-print">
        Policies and broadcasts can change. Confirm details with the official
        athletics site before traveling.
      </p>
    </HubSection>
  );
}

function SplitBar({
  label,
  value,
  defense,
}: {
  label: string;
  value: number | null | undefined;
  defense?: boolean;
}) {
  return (
    <div className="hub-rating-split">
      <div>
        <span>{label}</span>
        <strong>{decimal(value)}</strong>
      </div>
      {value != null ? (
        <div className="hub-bar" aria-hidden="true">
          <span
            data-defense={defense}
            style={{
              width: `${Math.max(0, Math.min(100, (value / 60) * 100))}%`,
            }}
          />
        </div>
      ) : (
        <p className="hub-muted">Not published</p>
      )}
    </div>
  );
}

export function NumbersSection({
  preseason,
  ratings,
  season,
}: Pick<TeamHubProps, "preseason" | "ratings" | "season">) {
  const history =
    ratings?.filter((row) => row.spPlus != null || row.fei != null) ?? [];
  const sourceLinks = [
    ...new Set(
      [
        preseason?.sp?.source,
        preseason?.fpi?.source,
        preseason?.wins?.source,
        preseason?.playoff?.source,
      ].filter((url): url is string =>
        Boolean(url && /^https?:\/\//.test(url)),
      ),
    ),
  ];
  return (
    <HubSection id="numbers">
      <HubHeading eyebrow="BEYOND THE EYE TEST" title="By the numbers">
        <span className="hub-muted">
          {season} preseason · Published, not modeled here
        </span>
      </HubHeading>
      <div className="hub-numbers-grid">
        <div className="hub-card hub-preseason">
          <div className="hub-card-heading">
            <h3>Preseason outlook</h3>
            <span className="hub-chip">{season}</span>
          </div>
          <div className="hub-preseason-body">
            <div className="hub-sp-top">
              <div>
                <span className="hub-eyebrow">SP+ OVERALL</span>
                <strong className="font-display">
                  {decimal(preseason?.sp?.overall)}
                </strong>
              </div>
              <div>
                <span className="hub-eyebrow">NATIONAL RANK</span>
                <strong className="font-display">
                  {rank(preseason?.sp?.rank)}
                </strong>
              </div>
            </div>
            <SplitBar label="Offense" value={preseason?.sp?.offense} />
            <SplitBar label="Defense" value={preseason?.sp?.defense} defense />
            <p className="hub-fine-print">
              Points per 20 possessions · Offense: higher is better. Defense:
              lower is better. Shared 0–60 scale.
            </p>
            <dl className="hub-stat-list">
              <div>
                <dt>ESPN FPI rank</dt>
                <dd>{rank(preseason?.fpi?.rank)}</dd>
              </div>
              <div>
                <dt>
                  Win total line <span>vs. projection</span>
                </dt>
                <dd>
                  {decimal(preseason?.wins?.line)}{" "}
                  <span>/ {decimal(preseason?.wins?.projected)}</span>
                </dd>
              </div>
              <div>
                <dt>
                  Playoff probability{" "}
                  <span>
                    {preseason?.playoff?.outlet ?? "Outlet not published"}
                  </span>
                </dt>
                <dd>{published(preseason?.playoff?.value)}</dd>
              </div>
            </dl>
            {preseason?.notes ? (
              <p className="hub-fine-print">{preseason.notes}</p>
            ) : null}
            <div className="hub-source-row">
              <span>As of {dateLabel(preseason?.as_of)}</span>
              {sourceLinks.map((url, index) => (
                <a
                  href={url}
                  key={url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Source {index + 1}
                  <span className="sr-only"> (opens in new tab)</span>
                  <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>
        </div>
        <div className="hub-card hub-ratings-history">
          <div className="hub-card-heading">
            <h3>Ratings through the years</h3>
            <span className="hub-muted">FINAL</span>
          </div>
          {history.length ? (
            <>
              <div className="hub-rating-labels">
                <span>SEASON</span>
                <span>SP+ / FEI</span>
                <span>RANK</span>
              </div>
              {history.slice(0, 6).map((row) => (
                <div className="hub-rating-history-row" key={row.season}>
                  <strong>{row.season}</strong>
                  <span>
                    {row.spPlus != null
                      ? `${decimal(row.spPlus)} SP+`
                      : `${decimal(row.fei)} FEI`}
                  </span>
                  <strong>
                    {rank(row.spPlus != null ? row.spRank : row.feiRank)}
                  </strong>
                </div>
              ))}
              {history.length > 6 ? (
                <details className="hub-ledger-more">
                  <summary>
                    Earlier seasons
                    <ChevronDown size={16} aria-hidden="true" />
                  </summary>
                  {history.slice(6).map((row) => (
                    <div className="hub-rating-history-row" key={row.season}>
                      <strong>{row.season}</strong>
                      <span>
                        {row.spPlus != null
                          ? `${decimal(row.spPlus)} SP+`
                          : `${decimal(row.fei)} FEI`}
                      </span>
                      <strong>
                        {rank(row.spPlus != null ? row.spRank : row.feiRank)}
                      </strong>
                    </div>
                  ))}
                </details>
              ) : null}
            </>
          ) : (
            <HubEmpty title="Ratings history not published">
              No historical SP+ or FEI ratings are included for this program.
            </HubEmpty>
          )}
        </div>
      </div>
    </HubSection>
  );
}

export function HistorySection({
  seasons,
  ratings,
  leaders,
}: Pick<TeamHubProps, "seasons" | "ratings" | "leaders">) {
  const topTen =
    leaders?.filter(
      (row) => row.rank != null && row.rank >= 1 && row.rank <= 10,
    ) ?? [];
  return (
    <HubSection id="history">
      <HubHeading eyebrow="BUILT OVER SATURDAYS" title="The program archive">
        <span className="hub-muted">
          Season records & national player finishes
        </span>
      </HubHeading>
      <div className="hub-history-grid">
        <div className="hub-card hub-season-history">
          <div className="hub-card-heading">
            <h3>Season by season</h3>
          </div>
          {seasons?.length ? (
            <section
              className="hub-table-scroll"
              aria-label="Season records"
              tabIndex={0}
            >
              <table>
                <caption className="sr-only">
                  Published team statistics by season. PPG means points per
                  game.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Season</th>
                    <th scope="col">Record</th>
                    <th scope="col">PPG for</th>
                    <th scope="col">PPG against</th>
                  </tr>
                </thead>
                <tbody>
                  {seasons.map((row) => (
                    <tr key={row.season}>
                      <th scope="row">{row.season}</th>
                      <td>
                        {published(
                          ratings?.find(
                            (rating) => rating.season === row.season,
                          )?.record,
                        )}
                      </td>
                      <td>{decimal(row.op)}</td>
                      <td>{decimal(row.dp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : (
            <HubEmpty title="Season history not published">
              Historical season records are not available for this team.
            </HubEmpty>
          )}
        </div>
        <div className="hub-card hub-finishes">
          <div className="hub-card-heading">
            <h3>
              <Trophy size={18} aria-hidden="true" />
              Top-10 finishes
            </h3>
          </div>
          <p className="hub-finishes-note">
            Individual national statistical leaderboards · Not team poll
            finishes
          </p>
          {topTen.length ? (
            <>
              {topTen.slice(0, 6).map((row, index) => (
                <div
                  className="hub-finish-row"
                  key={`${row.season}-${row.category}-${index}`}
                >
                  <span className="hub-finish-rank font-display">
                    #{row.rank}
                  </span>
                  <div>
                    <strong>{published(row.player)}</strong>
                    <p>{row.category}</p>
                  </div>
                  <span className="hub-muted">{row.season}</span>
                </div>
              ))}
              {topTen.length > 6 ? (
                <details className="hub-ledger-more">
                  <summary>
                    View {topTen.length - 6} more finishes
                    <ChevronDown size={16} aria-hidden="true" />
                  </summary>
                  {topTen.slice(6).map((row, index) => (
                    <div
                      className="hub-finish-row"
                      key={`${row.season}-${row.category}-${index}`}
                    >
                      <span className="hub-finish-rank font-display">
                        #{row.rank}
                      </span>
                      <div>
                        <strong>{published(row.player)}</strong>
                        <p>{row.category}</p>
                      </div>
                      <span className="hub-muted">{row.season}</span>
                    </div>
                  ))}
                </details>
              ) : null}
            </>
          ) : (
            <HubEmpty title="No top-10 finishes recorded">
              No verified individual top-10 leaderboard entries are available
              for this program.
            </HubEmpty>
          )}
        </div>
      </div>
    </HubSection>
  );
}
