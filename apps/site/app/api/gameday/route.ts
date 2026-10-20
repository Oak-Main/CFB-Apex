import { boardWeeks } from "@/lib/cfb-dataset";
import { gameDaySnapshot } from "@/lib/gameday-shared";
import { parseWeekParam } from "@/lib/week-cutover";

export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "X-Content-Type-Options": "nosniff",
};

export function GET(request: Request) {
  const week = new URL(request.url).searchParams.get("week");
  if (week != null && parseWeekParam(week, boardWeeks) == null) {
    return Response.json({ error: "Choose a reviewed week", weeks: boardWeeks.map(row => row.week) }, { status: 400, headers });
  }
  return Response.json(gameDaySnapshot(Date.now(), week), { headers });
}

export function OPTIONS() { return new Response(null, { status: 204, headers }); }
