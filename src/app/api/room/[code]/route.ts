import { after, NextResponse } from "next/server";
import * as rooms from "@/lib/rooms";
import { db } from "@/db";
import { scores } from "@/db/schema";
import type { Role } from "@/game/types";

export const dynamic = "force-dynamic";
const BODY_LIMIT = 64 * 1024;
type Ctx = { params: Promise<{ code: string }> };

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  const text = await req.text();
  if (text.length > BODY_LIMIT) return null;
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}
function credentials(body: Record<string, unknown>) {
  const playerId = body.playerId;
  const sessionToken = body.sessionToken;
  const connectionId = body.connectionId;
  if (!rooms.validPlayerId(playerId) || !rooms.validSessionToken(sessionToken) || !rooms.validConnectionId(connectionId)) return null;
  return { playerId, sessionToken, connectionId };
}
function bad(message: string, status = 400) { return NextResponse.json({ error: message }, { status }); }

export async function GET(_req: Request, { params }: Ctx) {
  const { code: rawCode } = await params;
  const code = rooms.normalizeCode(rawCode);
  if (!code) return bad("invalid room code");
  const room = rooms.getRoom(code, false);
  if (!room) return bad("Room not found", 404);
  return NextResponse.json(rooms.snapshot(room));
}

export async function POST(req: Request, { params }: Ctx) {
  const { code: rawCode } = await params;
  const code = rooms.normalizeCode(rawCode);
  if (!code) return bad("invalid room code");
  const body = await readBody(req);
  if (!body) return bad("bad json");
  const type = body.type;
  if (typeof type !== "string" || !["heartbeat", "input", "state", "gev", "setRole", "setTeam", "ready", "setChallenge", "setSquad", "start", "finish", "endRound", "lobby", "leave"].includes(type)) return bad("unknown type");
  const room = rooms.getRoom(code, false);
  if (!room) return type === "leave" ? NextResponse.json({ ok: true }) : bad("Room not found", 404);
  const c = credentials(body);
  if (!c) return bad("invalid credentials", 401);
  const player = rooms.authenticate(room, c.playerId, c.sessionToken, c.connectionId);
  if (!player && type !== "heartbeat" && type !== "leave") return bad("unauthorized", 401);
  if (type === "leave") {
    if (!player) return NextResponse.json({ ok: true });
    rooms.leave(room, c.playerId, c.sessionToken, c.connectionId);
    return NextResponse.json({ ok: true });
  }
  if (type === "heartbeat") return rooms.heartbeat(room, c.playerId, c.sessionToken, c.connectionId) ? NextResponse.json({ ok: true }) : bad("unauthorized", 401);

  if (type !== "input" && type !== "state") {
    if (typeof body.commandId !== "string") return bad("missing command id");
    const command = rooms.claimCommand(room, c.playerId, c.sessionToken, c.connectionId, body.commandId);
    if (command === "invalid") return bad("invalid command id", 401);
    if (command === "duplicate") return NextResponse.json({ ok: true, duplicate: true });
  }

  const isLeader = rooms.snapshot(room).leaderId === c.playerId;
  switch (type) {
    case "input": {
      const seq = body.seq;
      if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 0) return bad("invalid sequence");
      if (!rooms.relayInput(room, c.playerId, c.sessionToken, c.connectionId, body.inputs, seq)) return bad("input rejected", 409);
      break;
    }
    case "state": {
      const seq = body.seq;
      if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 0) return bad("invalid sequence");
      if (!rooms.relayState(room, c.playerId, c.sessionToken, c.connectionId, body.state, seq)) return bad("state rejected", 409);
      break;
    }
    case "gev":
      if (!rooms.relayEvent(room, c.playerId, c.sessionToken, c.connectionId, body.ev)) return bad("event rejected", 409);
      break;
    case "setRole":
      if (typeof body.role !== "string" || !rooms.setRole(room, c.playerId, body.role as Role)) return bad("role rejected", 409);
      break;
    case "setTeam": {
      const teamId = body.teamId === "new" ? "new" : (typeof body.teamId === "number" && Number.isSafeInteger(body.teamId) ? body.teamId : null);
      if (teamId === null || !rooms.setTeam(room, c.playerId, teamId)) return bad("team rejected", 409);
      break;
    }
    case "ready":
      if (typeof body.ready !== "boolean" || !rooms.setReady(room, c.playerId, body.ready)) return bad("ready rejected", 409);
      break;
    case "setChallenge":
      if (!isLeader || typeof body.challengeId !== "string" || !rooms.setChallenge(room, body.challengeId)) return bad("challenge rejected", 409);
      break;
    case "setSquad":
      if (!isLeader || (body.squadSize !== 3 && body.squadSize !== 5) || !rooms.setSquadSize(room, body.squadSize)) return bad("squad rejected", 409);
      break;
    case "start":
      if (!isLeader || typeof body.force !== "boolean" || !rooms.start(room, body.force)) return bad("start rejected", 409);
      break;
    case "finish": {
      if (typeof body.round !== "number" || !Number.isSafeInteger(body.round) || body.round < 1) return bad("invalid round");
      if (body.timeMs !== undefined && (typeof body.timeMs !== "number" || !Number.isFinite(body.timeMs))) return bad("invalid time");
      const accepted = rooms.finish(room, c.playerId, body.timeMs as number | undefined, body.round);
      if (!accepted) return bad("finish rejected", 409);
      after(async () => {
        try {
          await db.insert(scores).values({ challengeId: accepted.challengeId, squadSize: accepted.squadSize, teamName: accepted.teamName, players: accepted.players, timeMs: accepted.timeMs, roomCode: accepted.roomCode });
        } catch { /* DB outages must not break the live round. */ }
      });
      return NextResponse.json({ ok: true, finish: accepted });
    }
    case "endRound":
      if (!isLeader || !rooms.endRound(room)) return bad("end rejected", 409);
      break;
    case "lobby":
      if (!isLeader || !rooms.backToLobby(room)) return bad("lobby rejected", 409);
      break;
    default:
      return bad("unknown type");
  }
  return NextResponse.json({ ok: true });
}
