import { NextResponse } from "next/server";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { scores } from "@/db/schema";
import { CHALLENGES } from "@/game/types";

export const dynamic = "force-dynamic";

function parseChallenge(v: string | null): string | null {
  if (v == null) return CHALLENGES[0].id;
  return CHALLENGES.some((challenge) => challenge.id === v) ? v : null;
}

function parseSquad(v: string | null): 3 | 5 | null {
  if (v == null || v === "5") return 5;
  if (v === "3") return 3;
  return null;
}

function parseLimit(v: string | null): number | null {
  if (v == null) return 10;
  // Do not let Number() silently accept decimals, signs, whitespace, NaN, or
  // infinities. A bounded positive integer is the only valid limit.
  if (!/^[1-9]\d*$/.test(v)) return null;
  const limit = Number(v);
  return Number.isSafeInteger(limit) && limit <= 50 ? limit : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const challengeId = parseChallenge(url.searchParams.get("challenge"));
  const squad = parseSquad(url.searchParams.get("squad"));
  const limit = parseLimit(url.searchParams.get("limit"));
  if (!challengeId) return NextResponse.json({ error: "unsupported challenge" }, { status: 400 });
  if (!squad) return NextResponse.json({ error: "squad must be 3 or 5" }, { status: 400 });
  if (!limit) return NextResponse.json({ error: "limit must be an integer between 1 and 50" }, { status: 400 });

  try {
    // Legacy rows predate squad_size (NULL) — count them as 5P.
    const squadFilter = squad === 3 ? eq(scores.squadSize, 3) : or(eq(scores.squadSize, 5), isNull(scores.squadSize));
    const rows = await db
      .select()
      .from(scores)
      .where(and(eq(scores.challengeId, challengeId), squadFilter))
      .orderBy(asc(scores.timeMs), asc(scores.createdAt))
      .limit(limit);
    return NextResponse.json({ challengeId, squad, rows });
  } catch {
    // Do not expose connection details, SQL, or schema information to clients.
    return NextResponse.json({ error: "leaderboard unavailable" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  void req;
  return NextResponse.json(
    { error: "direct leaderboard writes are disabled; scores are recorded when a room finishes" },
    { status: 405, headers: { Allow: "GET" } },
  );
}
