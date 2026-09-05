import { NextResponse } from "next/server";
import * as rooms from "@/lib/rooms";
import type { Role } from "@/game/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { code } = await params;
  const room = rooms.getRoom(code, false);
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  return NextResponse.json(rooms.snapshot(room));
}

export async function POST(req: Request, { params }: Ctx) {
  const { code } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const room = rooms.getRoom(code, body.type !== "leave");
  if (!room) return NextResponse.json({ ok: true });
  const playerId = String(body.playerId ?? "");
  const type = String(body.type ?? "");
  const isLeader = room.players[0]?.id === playerId;

  switch (type) {
    case "input":
      rooms.relayInput(room, playerId, body.inputs);
      break;
    case "state":
      rooms.relayState(room, playerId, body.state);
      break;
    case "gev":
      rooms.relayEvent(room, playerId, body.ev);
      break;
    case "setRole":
      rooms.setRole(room, playerId, body.role as Role);
      break;
    case "setTeam":
      rooms.setTeam(room, playerId, body.teamId === "new" ? "new" : Number(body.teamId));
      break;
    case "ready":
      rooms.setReady(room, playerId, Boolean(body.ready));
      break;
    case "setChallenge":
      if (isLeader) rooms.setChallenge(room, String(body.challengeId));
      break;
    case "setSquad":
      if (isLeader) rooms.setSquadSize(room, Number(body.squadSize) === 3 ? 3 : 5);
      break;
    case "start":
      if (isLeader) rooms.start(room, Boolean(body.force));
      break;
    case "finish":
      rooms.finish(room, playerId, Number(body.timeMs));
      break;
    case "endRound":
      if (isLeader) rooms.endRound(room);
      break;
    case "lobby":
      if (isLeader) rooms.backToLobby(room);
      break;
    case "leave":
      rooms.leave(room, playerId);
      break;
    default:
      return NextResponse.json({ error: "unknown type" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
