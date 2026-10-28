import { playoffUnavailable } from "@/lib/module-coverage";
import { scenarioGames } from "@/lib/cfb-dataset";

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 20_000) {
    return Response.json({ error: "Payload too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 20_000) {
      return Response.json({ error: "Payload too large" }, { status: 413 });
    }
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const forcedInput =
    record.forced && typeof record.forced === "object"
      ? Object.entries(record.forced as Record<string, unknown>)
      : [];
  const forced: Record<string, string> = {};

  for (const [gameId, teamId] of forcedInput) {
    const game = scenarioGames.find((candidate) => candidate.id === gameId);
    if (
      !game ||
      typeof teamId !== "string" ||
      (teamId !== game.awayTeamId && teamId !== game.homeTeamId)
    ) {
      return Response.json({ error: "Invalid forced outcome" }, { status: 400 });
    }
    forced[gameId] = teamId;
  }

  return Response.json({ status: "unavailable", reason: playoffUnavailable }, {
    status: 503,
    headers: { "Cache-Control": "private, no-store" },
  });
}
