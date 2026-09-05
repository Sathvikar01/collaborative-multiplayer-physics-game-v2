import { NextResponse } from "next/server";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { scores } from "@/db/schema";
import { CHALLENGES } from "@/game/types";

export const dynamic = "force-dynamic";

function squadOf(v: string | null): 3 | 5 {
  return v === "3" ? 3 : 5;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const challengeId = url.searchParams.get("challenge") ?? CHALLENGES[0].id;
  const squad = squadOf(url.searchParams.get("squad"));
  const limit = Math.min(50, Number(url.searchParams.get("limit") ?? 10));
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
  } catch (e) {
    // tolerant fallback if the squad_size column hasn't been migrated yet
    try {
      const rows = await db
        .select()
        .from(scores)
        .where(eq(scores.challengeId, challengeId))
        .orderBy(asc(scores.timeMs), asc(scores.createdAt))
        .limit(limit);
      return NextResponse.json({ challengeId, squad, rows });
    } catch (e2) {
      return NextResponse.json({ challengeId, squad, rows: [], error: String(e2 ?? e) }, { status: 200 });
    }
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { challengeId?: string; teamName?: string; players?: string[]; timeMs?: number; roomCode?: string; squadSize?: number };
    if (!body.challengeId || !CHALLENGES.some((c) => c.id === body.challengeId)) return NextResponse.json({ error: "bad challenge" }, { status: 400 });
    const timeMs = Math.round(Number(body.timeMs));
    if (!Number.isFinite(timeMs) || timeMs < 1000 || timeMs > 3_600_000) return NextResponse.json({ error: "bad time" }, { status: 400 });
    const squadSize = body.squadSize === 3 ? 3 : 5;
    const players = Array.isArray(body.players) ? body.players.map((p) => String(p).slice(0, 16)).slice(0, 5) : [];
    const values = {
      challengeId: body.challengeId,
      teamName: String(body.teamName ?? "Team").slice(0, 24),
      players,
      timeMs,
      roomCode: body.roomCode ? String(body.roomCode).slice(0, 8) : null,
      squadSize,
    };
    let row;
    try {
      [row] = await db.insert(scores).values(values).returning();
    } catch {
      // column missing pre-migration: insert without squadSize
      const { squadSize: _drop, ...legacy } = values;
      [row] = await db.insert(scores).values(legacy).returning();
    }
    // compute rank
    const better = await db.select({ id: scores.id }).from(scores).where(eq(scores.challengeId, body.challengeId));
    const rank = better.length; // placeholder; refined client side
    return NextResponse.json({ row, rank });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
