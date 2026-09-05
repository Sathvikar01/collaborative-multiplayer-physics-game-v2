import { CHALLENGES, TEAM_COLORS, squadRoles, type Phase, type Role, type RoomSnapshot, type SquadSize } from "@/game/types";

type Send = (event: string, data: unknown) => void;

interface Player {
  id: string;
  name: string;
  teamId: number;
  roles: Role[];
  ready: boolean;
  send: Send | null;
}

interface Team {
  id: number;
  name: string;
  color: string;
  hostId: string | null;
  finishMs: number | null;
}

interface Room {
  code: string;
  phase: Phase;
  challengeId: string;
  squadSize: SquadSize;
  players: Player[];
  teams: Team[];
  startAt: number | null;
  round: number;
  nextTeamId: number;
  timers: ReturnType<typeof setTimeout>[];
  createdAt: number;
}

const g = globalThis as typeof globalThis & { __manyHandsRooms?: Map<string, Room> };
const rooms: Map<string, Room> = g.__manyHandsRooms ?? new Map();
g.__manyHandsRooms = rooms;

export function makeCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = "";
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

export function getRoom(code: string, create = true): Room | null {
  code = code.toUpperCase();
  let room = rooms.get(code) ?? null;
  if (!room && create) {
    room = {
      code,
      phase: "lobby",
      challengeId: CHALLENGES[0].id,
      squadSize: 5,
      players: [],
      teams: [],
      startAt: null,
      round: 0,
      nextTeamId: 1,
      timers: [],
      createdAt: Date.now(),
    };
    rooms.set(code, room);
  }
  return room;
}

export function snapshot(room: Room): RoomSnapshot {
  return {
    code: room.code,
    phase: room.phase,
    challengeId: room.challengeId,
    squadSize: room.squadSize,
    players: room.players.map((p) => ({ id: p.id, name: p.name, teamId: p.teamId, roles: [...p.roles], ready: p.ready })),
    teams: room.teams.map((t) => ({ ...t })),
    startAt: room.startAt,
    round: room.round,
    now: Date.now(),
    leaderId: room.players[0]?.id ?? null,
  };
}

export function broadcast(room: Room, event: string, data: unknown, exceptId?: string) {
  for (const p of room.players) {
    if (p.id === exceptId) continue;
    p.send?.(event, data);
  }
}

export function sendTo(room: Room, playerId: string, event: string, data: unknown) {
  room.players.find((p) => p.id === playerId)?.send?.(event, data);
}

function pushState(room: Room) {
  broadcast(room, "room", snapshot(room));
}

function newTeam(room: Room): Team {
  const id = room.nextTeamId++;
  const idx = room.teams.length;
  const t: Team = { id, name: `Team ${id}`, color: TEAM_COLORS[idx % TEAM_COLORS.length], hostId: null, finishMs: null };
  room.teams.push(t);
  return t;
}

function fixHosts(room: Room) {
  for (const t of room.teams) {
    const members = room.players.filter((p) => p.teamId === t.id);
    if (members.length === 0) continue;
    if (!t.hostId || !members.some((m) => m.id === t.hostId)) t.hostId = members[0].id;
  }
  room.teams = room.teams.filter((t) => room.players.some((p) => p.teamId === t.id));
}

export function join(room: Room, playerId: string, name: string, send: Send, opts?: { solo?: boolean }) {
  let p = room.players.find((x) => x.id === playerId);
  if (p) {
    p.send = send;
    p.name = name || p.name;
  } else {
    const cap = room.squadSize;
    // pick team with most free slots but at least one person, else new
    let team = room.teams
      .map((t) => ({ t, n: room.players.filter((p) => p.teamId === t.id).length }))
      .filter((x) => x.n < cap)
      .sort((a, b) => a.n - b.n)
      .pop()?.t;
    if (opts?.solo || !team) team = newTeam(room);
    p = { id: playerId, name: name || "Player", teamId: team.id, roles: [], ready: false, send };
    room.players.push(p);
    // auto-assign first free role
    const taken = new Set(room.players.filter((x) => x.teamId === team.id).flatMap((x) => x.roles));
    const free = squadRoles(room.squadSize).find((r) => !taken.has(r));
    if (opts?.solo) {
      p.roles = [...squadRoles(room.squadSize)];
      p.ready = true;
    } else if (free) p.roles = [free];
  }
  fixHosts(room);
  pushState(room);
}

export function leave(room: Room, playerId: string) {
  const idx = room.players.findIndex((p) => p.id === playerId);
  if (idx < 0) return;
  room.players.splice(idx, 1);
  fixHosts(room);
  if (room.players.length === 0) {
    for (const t of room.timers) clearTimeout(t);
    rooms.delete(room.code);
    return;
  }
  if (room.phase === "playing") checkAllFinished(room);
  pushState(room);
}

export function setRole(room: Room, playerId: string, role: Role) {
  const p = room.players.find((x) => x.id === playerId);
  if (!p) return;
  // only current squad's roles (plus legacy head which maps to torso-cam)
  if (!squadRoles(room.squadSize).includes(role) && role !== "head" && role !== "arms") return;
  if (p.roles.includes(role)) {
    p.roles = p.roles.filter((r) => r !== role);
  } else {
    // steal from teammate if taken
    for (const other of room.players) if (other.teamId === p.teamId) other.roles = other.roles.filter((r) => r !== role);
    p.roles.push(role);
  }
  pushState(room);
}

export function setSquadSize(room: Room, squad: SquadSize) {
  if (room.phase !== "lobby") return;
  if (squad !== 3 && squad !== 5) return;
  if (room.squadSize === squad) return;
  room.squadSize = squad;
  // clear role picks — different role sets per squad; everyone re-picks (keeps teams)
  for (const pl of room.players) {
    pl.roles = [];
    pl.ready = false;
  }
  // auto-assign first player of each team a role so lobby never looks empty
  for (const t of room.teams) {
    const first = room.players.find((x) => x.teamId === t.id);
    if (first) first.roles = [squadRoles(squad)[0]];
  }
  pushState(room);
}

export function setTeam(room: Room, playerId: string, teamId: number | "new") {
  const p = room.players.find((x) => x.id === playerId);
  if (!p) return;
  let team = teamId === "new" ? newTeam(room) : room.teams.find((t) => t.id === teamId);
  if (!team) return;
  if (team.id !== p.teamId && room.players.filter((x) => x.teamId === team.id).length >= room.squadSize) return;
  p.teamId = team.id;
  const taken = new Set(room.players.filter((x) => x.teamId === team.id && x.id !== p.id).flatMap((x) => x.roles));
  p.roles = p.roles.filter((r) => !taken.has(r));
  if (p.roles.length === 0) {
    const free = squadRoles(room.squadSize).find((r) => !taken.has(r));
    if (free) p.roles = [free];
  }
  p.ready = false;
  fixHosts(room);
  pushState(room);
}

export function setReady(room: Room, playerId: string, ready: boolean) {
  const p = room.players.find((x) => x.id === playerId);
  if (!p) return;
  p.ready = ready;
  pushState(room);
}

export function setChallenge(room: Room, challengeId: string) {
  if (!CHALLENGES.some((c) => c.id === challengeId)) return;
  room.challengeId = challengeId;
  for (const p of room.players) p.ready = false;
  pushState(room);
}

function clearTimers(room: Room) {
  for (const t of room.timers) clearTimeout(t);
  room.timers = [];
}

export function start(room: Room, force = false) {
  if (room.phase === "countdown" || room.phase === "playing") return;
  if (!force && room.players.some((p) => !p.ready)) return;
  // auto-assign uncovered roles per team round-robin
  for (const t of room.teams) {
    const members = room.players.filter((p) => p.teamId === t.id);
    if (members.length === 0) continue;
    const taken = new Set(members.flatMap((m) => m.roles));
    let i = 0;
    for (const r of squadRoles(room.squadSize)) {
      if (taken.has(r)) continue;
      // prefer players with the fewest roles
      const target = [...members].sort((a, b) => a.roles.length - b.roles.length)[0] ?? members[i % members.length];
      target.roles.push(r);
      i++;
    }
    t.finishMs = null;
  }
  clearTimers(room);
  room.round++;
  room.phase = "countdown";
  room.startAt = Date.now() + 4200;
  pushState(room);
  room.timers.push(
    setTimeout(() => {
      if (room.phase === "countdown") {
        room.phase = "playing";
        pushState(room);
      }
    }, 4200)
  );
}

function checkAllFinished(room: Room) {
  const active = room.teams.filter((t) => room.players.some((p) => p.teamId === t.id));
  if (active.length > 0 && active.every((t) => t.finishMs != null)) endRound(room);
}

export function finish(room: Room, playerId: string, timeMs: number) {
  if (room.phase !== "playing") return;
  const p = room.players.find((x) => x.id === playerId);
  if (!p) return;
  const t = room.teams.find((x) => x.id === p.teamId);
  if (!t || t.hostId !== playerId || t.finishMs != null) return;
  t.finishMs = Math.round(timeMs);
  broadcast(room, "finished", { teamId: t.id, timeMs: t.finishMs, teamName: t.name });
  const anyUnfinished = room.teams.some((x) => x.finishMs == null);
  if (!anyUnfinished) endRound(room);
  else {
    pushState(room);
    // grace period for other teams
    room.timers.push(setTimeout(() => endRound(room), 45000));
  }
}

export function endRound(room: Room) {
  if (room.phase !== "playing") return;
  clearTimers(room);
  room.phase = "results";
  pushState(room);
}

export function backToLobby(room: Room) {
  clearTimers(room);
  room.phase = "lobby";
  room.startAt = null;
  for (const p of room.players) p.ready = false;
  for (const t of room.teams) t.finishMs = null;
  pushState(room);
}

export function relayInput(room: Room, playerId: string, inputs: unknown) {
  const p = room.players.find((x) => x.id === playerId);
  if (!p) return;
  const t = room.teams.find((x) => x.id === p.teamId);
  if (!t?.hostId || t.hostId === playerId) return;
  sendTo(room, t.hostId, "input", { playerId, inputs });
}

export function relayState(room: Room, playerId: string, state: unknown) {
  const p = room.players.find((x) => x.id === playerId);
  if (!p) return;
  broadcast(room, "state", { teamId: p.teamId, state }, playerId);
}

export function relayEvent(room: Room, playerId: string, ev: unknown) {
  const p = room.players.find((x) => x.id === playerId);
  if (!p) return;
  broadcast(room, "gev", { playerId, teamId: p.teamId, ev }, playerId);
}

export type { Room };
