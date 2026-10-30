"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  Accessibility as AccessibilityIcon,
  BadgeCheck,
  Bus,
  Car,
  ExternalLink,
  MapPin,
  Search,
  ShieldAlert,
  Tent,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Stadium, Team } from "@/lib/types";
import { ticketLinksForTeam } from "@/lib/affiliates";
import { travelLinksForQuery, travelAffiliatesConfigured } from "@/lib/travel-affiliates";
import { TeamMark } from "./broadcast/primitives";

interface StadiumDirectoryProps {
  stadiums: readonly Stadium[];
  teams: readonly Team[];
}

interface StadiumDetailProps {
  stadium: Stadium;
  team: Team;
}

interface VenueGuideItem {
  title: string;
  copy: string;
  icon: LucideIcon;
}

function formatVerifiedDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function hostnameFor(source: string) {
  try {
    return new URL(source).hostname.replace(/^www\./, "");
  } catch {
    return source;
  }
}

function teamColorStyle(color?: string) {
  return { "--team-color": color ?? "var(--primary)" } as CSSProperties;
}

function VenueMark({ team, label }: { team?: Team; label: string }) {
  if (team) return <TeamMark team={team} size="lg" />;
  return (
    <span className="lt-venue-fallback font-display" aria-hidden="true">
      {label.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function StadiumDirectory({ stadiums, teams }: StadiumDirectoryProps) {
  const [query, setQuery] = useState("");
  const teamsById = useMemo(
    () => new Map(teams.map((team) => [team.id, team])),
    [teams],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const visibleStadiums = useMemo(() => {
    if (!normalizedQuery) return stadiums;
    return stadiums.filter((stadium) =>
      `${stadium.name} ${stadium.city}`.toLowerCase().includes(normalizedQuery),
    );
  }, [normalizedQuery, stadiums]);
  const newestVerification = [...stadiums]
    .map((stadium) => stadium.lastVerified)
    .sort()
    .at(-1);

  return (
    <div className="lt-page">
      <header className="lt-hero lt-hero--directory">
        <div className="lt-hero__copy">
          <span className="lt-eyebrow">GAMEDAY FIELD NOTES</span>
          <h1 className="font-display text-balance">Know the venue before kickoff.</h1>
          <p className="text-pretty">
            Parking, transit, bag policy, tailgating, visitor seating, and accessibility guidance for every FBS home field.
          </p>
        </div>
        <div className="lt-hero__count" role="status" aria-label={`${stadiums.length} verified venue guides`}>
          <strong className="font-display">{stadiums.length}</strong>
          <span>Verified venue guides</span>
          {newestVerification ? <small>Current through {formatVerifiedDate(newestVerification)}</small> : null}
        </div>
      </header>

      <section className="lt-section" aria-labelledby="stadium-directory-title">
        <div className="lt-section-heading">
          <div>
            <span className="lt-eyebrow">STADIUM DIRECTORY</span>
            <h2 id="stadium-directory-title" className="font-display">
              Every home field
            </h2>
          </div>
          <span className="lt-result-count" aria-live="polite">
            {visibleStadiums.length} {visibleStadiums.length === 1 ? "venue" : "venues"}
          </span>
        </div>

        <form
          className="lt-filter"
          aria-label="Search stadiums"
          onSubmit={(event) => event.preventDefault()}
        >
          <Search aria-hidden="true" />
          <label className="sr-only" htmlFor="stadium-filter">
            Search stadiums by name or city
          </label>
          <input
            id="stadium-filter"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by stadium name or city"
            autoComplete="off"
          />
        </form>

        {visibleStadiums.length ? (
          <div className="lt-stadium-grid">
            {visibleStadiums.map((stadium) => {
              const team = teamsById.get(stadium.teamId);
              return (
                <a
                  className="lt-stadium-card"
                  href={`/stadiums/${stadium.slug}`}
                  key={stadium.slug}
                  style={teamColorStyle(team?.color)}
                >
                  <div className="lt-stadium-card__mark">
                    <VenueMark team={team} label={stadium.name} />
                    <span className="lt-field-stripes" aria-hidden="true" />
                  </div>
                  <div className="lt-stadium-card__body">
                    <span className="lt-stadium-card__city">
                      <MapPin aria-hidden="true" />
                      {stadium.city}
                    </span>
                    <h3 className="font-display text-balance">{stadium.name}</h3>
                    <div className="lt-stadium-card__meta">
                      <span>{stadium.capacity.toLocaleString("en-US")} capacity</span>
                      <span className="lt-verified-badge">
                        <BadgeCheck aria-hidden="true" />
                        Verified {formatVerifiedDate(stadium.lastVerified)}
                      </span>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        ) : (
          <div className="lt-empty-state" role="status">
            <Search aria-hidden="true" />
            <h3 className="font-display">No venues match that search.</h3>
            <p>Try a stadium name or city.</p>
          </div>
        )}
      </section>
    </div>
  );
}

export function StadiumDetail({ stadium, team }: StadiumDetailProps) {
  const guideItems: VenueGuideItem[] = [
    { title: "Parking", copy: stadium.parking, icon: Car },
    { title: "Transit & shuttle", copy: stadium.transit, icon: Bus },
    { title: "Clear-bag policy", copy: stadium.clearBag, icon: ShieldAlert },
    { title: "Tailgating", copy: stadium.tailgating, icon: Tent },
    { title: "Visitor section", copy: stadium.visitorSection, icon: Users },
    { title: "Accessibility", copy: stadium.accessibility, icon: AccessibilityIcon },
  ];

  return (
    <div className="lt-page" style={teamColorStyle(team.color)}>
      <header className="lt-stadium-hero">
        <span className="lt-stadium-hero__stripe" aria-hidden="true" />
        <div className="lt-stadium-hero__mark">
          <TeamMark team={team} size="hero" priority />
        </div>
        <div className="lt-stadium-hero__copy">
          <a className="lt-eyebrow" href={`/teams/${team.slug}`}>
            {team.shortName} · VENUE GUIDE
          </a>
          <h1 className="font-display text-balance">{stadium.name}</h1>
          <div className="lt-stadium-hero__meta">
            <address>
              <MapPin aria-hidden="true" />
              {stadium.address}
            </address>
            <span className="lt-capacity-chip">
              <strong>{stadium.capacity.toLocaleString("en-US")}</strong>
              capacity
            </span>
          </div>
        {travelAffiliatesConfigured ? (
          <aside className="lt-tickets lt-trip" aria-label="Plan your trip">
            <span className="lt-eyebrow">PLAN YOUR TRIP</span>
            <p>
              Some links may be affiliate links. CFB Apex may earn a commission if you buy or book through them. See the{" "}
              <a href="/affiliate-disclosure">affiliate disclosure</a>.
            </p>
            {[
              { category: "hotels" as const, label: "Hotels near the stadium", query: `hotels near ${stadium.name} ${stadium.address}` },
              { category: "cars" as const, label: "Rental cars", query: `${stadium.city} car rental` },
              { category: "flights" as const, label: "Flights", query: `flights to ${stadium.city}` },
            ].map((slot) =>
              travelLinksForQuery(slot.query, slot.category).map((link) => (
                <a
                  key={`${slot.category}-${link.partner}`}
                  href={link.url}
                  target="_blank"
                  rel="sponsored nofollow noreferrer noopener"
                >
                  <strong>{slot.label}</strong>
                  <span>{link.partner}{link.tracked ? "" : " · pending"}</span>
                </a>
              )),
            )}
          </aside>
        ) : null}
        <aside className="lt-tickets" aria-label="Ticket partner links">
          <span className="lt-eyebrow">TICKETS</span>
          <p>
            Some links may be affiliate links. CFB Apex may earn a commission if you buy through them. See the{" "}
            <a href="/affiliate-disclosure">affiliate disclosure</a>.
          </p>
          {ticketLinksForTeam(team.name).map((link) => (
            <a
              key={link.partner}
              href={link.url}
              target="_blank"
              rel="sponsored nofollow noreferrer noopener"
            >
              <strong>{link.partner}</strong>
              <span>{link.tracked ? "Affiliate link" : "Direct link"}</span>
            </a>
          ))}
        </aside>
        </div>
      </header>

      <section className="lt-section" aria-labelledby="venue-guide-title">
        <div className="lt-section-heading">
          <div>
            <span className="lt-eyebrow">PLAN YOUR SATURDAY</span>
            <h2 id="venue-guide-title" className="font-display">
              Gameday guide
            </h2>
          </div>
          <span className="lt-verified-badge">
            <BadgeCheck aria-hidden="true" />
            Verified {formatVerifiedDate(stadium.lastVerified)}
          </span>
        </div>

        <div className="lt-guide-grid">
          {guideItems.map(({ title, copy, icon: Icon }) => (
            <article className="lt-guide-card" key={title}>
              <div className="lt-guide-card__icon">
                <Icon aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-display">{title}</h3>
                <p>{copy}</p>
              </div>
            </article>
          ))}
        </div>

        {stadium.notes ? (
          <aside className="lt-venue-note" aria-labelledby="venue-note-title">
            <span className="lt-eyebrow">VENUE NOTE</span>
            <p id="venue-note-title">{stadium.notes}</p>
          </aside>
        ) : null}

        {stadium.sources?.length ? (
          <nav className="lt-source-strip" aria-label={`${stadium.name} guide sources`}>
            <span>Guide sources</span>
            <div>
              {stadium.sources.map((source) => (
                <a href={source} key={source} rel="nofollow noreferrer noopener" target="_blank">
                  {hostnameFor(source)}
                  <ExternalLink aria-hidden="true" />
                </a>
              ))}
            </div>
          </nav>
        ) : null}

        <div className="lt-correction-row">
          <p>Policies can change between verification and kickoff. Confirm time-sensitive details with the venue.</p>
          <a href={`/corrections?record=stadium-${stadium.slug}`}>
            Report a guide issue
          </a>
        </div>
      </section>
    </div>
  );
}
