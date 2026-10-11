import type { Metadata } from "next";
import { HubApp } from "@/components/HubApp";
import { boardWeeks } from "@/lib/cfb-dataset";
import { environment } from "@/lib/config";
import { selectBoardWeek } from "@/lib/week-cutover";

// The board week follows the request's server clock, so the page is never
// cached: a response rendered before a cutover must not outlive it.
export const dynamic = "force-dynamic";

// The homepage declares its canonical like every catch-all page does. It is
// absolute and built from the configured production origin, not the request
// host, so a preview or alternate host never self-canonicalises.
export const metadata: Metadata = {
  alternates: { canonical: `${environment.siteUrl.replace(/\/$/, "")}/` },
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { week } = await searchParams;
  return <HubApp path="/" boardWeek={selectBoardWeek(boardWeeks, Date.now(), week)} />;
}
