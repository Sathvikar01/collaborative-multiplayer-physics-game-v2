import { CHALLENGES, TEAM_COLORS, squadRoles, type Phase, type Role, type RoleInput, type RoomSnapshot, type SquadSize } from "@/game/types";
import { isCommentaryCue, isCommentarySnapshot } from "@/game/commentary";

type Send = (event: string, data: unknown) => void;
type Timer = ReturnType<typeof setTimeout>;

export const DISCONNECT_GRACE_MS = 15_000;
export const CONNECTION_LEASE_MS = 15_000;
const ROOM_CODE_RE = /^[A-HJ-NP-Z2-9]{4}$/;
const ID_RE = /^[A-Za-z0-9_-]{4,96}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,256}$/;
const NAME_RE = /^[^\u0000-\u001f\u007f]{1,16}$/;
const MAX_STATE_BYTES = 24_000;
const MAX_EVENT_BYTES = 4_000;
const SNAP_PARTS = 11 * 7;
const SNAP_VELOCITIES = 11 * 3;

interface Player {
  id: string; name: string; teamId: number; roles: Role[]; ready: boolean; send: Send | null;
  sessionToken: string; connectionId: string; connected: boolean; lastSeenAt: number;
  leaseTimer: Timer | null; disconnectTimer: Timer | null; lastInputSeq: number; lastStateSeq: number; closeConnection: (() => void) | null;
  recentCommandIds: string[];
  connectionEpoch: number;
}
interface Team { id: number; name: string; color: string; hostId: string | null; finishMs: number | null; }
interface Room {
  code: string; phase: Phase; challengeId: string; squadSize: SquadSize; players: Player[]; teams: Team[];
  startAt: number | null; startedAt: number | null; round: number; version: number; nextTeamId: number;
  timers: Timer[]; createdAt: number; leaderId: string | null;
}

const g = globalThis as typeof globalThis & { __manyHandsRooms?: Map<string, Room>; __manyHandsServerId?: string };
const rooms: Map<string, Room> = g.__manyHandsRooms ?? new Map();
g.__manyHandsRooms = rooms;
g.__manyHandsServerId ??= typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

export function getServerId() { return g.__manyHandsServerId!; }

export function normalizeCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return ROOM_CODE_RE.test(code) ? code : null;
}
export function validPlayerId(value: unknown): value is string { return typeof value === "string" && ID_RE.test(value); }
export function validSessionToken(value: unknown): value is string { return typeof value === "string" && TOKEN_RE.test(value); }
export function validConnectionId(value: unknown): value is string { return typeof value === "string" && ID_RE.test(value); }
export function sanitizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return NAME_RE.test(name) ? name : null;
}

export function makeCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do { code = ""; for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)]; } while (rooms.has(code));
  return code;
}

export function getRoom(code: string, create = true): Room | null {
  const normalized = normalizeCode(code) ?? code.trim().toUpperCase();
  let room = rooms.get(normalized) ?? null;
  if (!room && create) {
    room = { code: normalized, phase: "lobby", challengeId: CHALLENGES[0].id, squadSize: 5, players: [], teams: [], startAt: null, startedAt: null, round: 0, version: 0, nextTeamId: 1, timers: [], createdAt: Date.now(), leaderId: null };
    rooms.set(normalized, room);
  }
  return room;
}

export function snapshot(room: Room): RoomSnapshot {
  return {
    code: room.code, phase: room.phase, challengeId: room.challengeId, squadSize: room.squadSize,
    players: room.players.map((p) => ({ id: p.id, name: p.name, teamId: p.teamId, roles: [...p.roles], ready: p.ready, connected: p.connected })),
    teams: room.teams.map((t) => ({ ...t })), startAt: room.startAt, round: room.round, version: room.version, now: Date.now(),
    leaderId: room.leaderId,
  };
}

export function broadcast(room: Room, event: string, data: unknown, exceptId?: string) {
  for (const p of room.players) if (p.id !== exceptId && p.connected) p.send?.(event, data);
}
export function sendTo(room: Room, playerId: string, event: string, data: unknown) {
  const p = room.players.find((x) => x.id === playerId);
  if (p?.connected) p.send?.(event, data);
}
function changed(room: Room) { room.version++; broadcast(room, "room", snapshot(room)); }

function newTeam(room: Room): Team {
  const id = room.nextTeamId++; const idx = room.teams.length;
  const t: Team = { id, name: `Team ${id}`, color: TEAM_COLORS[idx % TEAM_COLORS.length], hostId: null, finishMs: null };
  room.teams.push(t); return t;
}
function fixHosts(room: Room) {
  for (const t of room.teams) {
    const members = room.players.filter((p) => p.teamId === t.id);
    if (!t.hostId || !members.some((m) => m.id === t.hostId && m.connected)) t.hostId = members.find((m) => m.connected)?.id ?? null;
  }
  room.teams = room.teams.filter((t) => room.players.some((p) => p.teamId === t.id));
}
function fixLeader(room: Room) {
  if (room.players.some((p) => p.id === room.leaderId && p.connected)) return;
  room.leaderId = room.players.find((p) => p.connected)?.id ?? null;
}
function clearPlayerTimers(p: Player) {
  if (p.leaseTimer) clearTimeout(p.leaseTimer); if (p.disconnectTimer) clearTimeout(p.disconnectTimer);
  p.leaseTimer = null; p.disconnectTimer = null;
}
function auth(room: Room, playerId: string, sessionToken: string, connectionId?: string) {
  const p = room.players.find((x) => x.id === playerId);
  return p && p.sessionToken === sessionToken && (connectionId === undefined || p.connectionId === connectionId) ? p : null;
}
export function authenticate(room: Room, playerId: string, sessionToken: string, connectionId: string) {
  const p = auth(room, playerId, sessionToken, connectionId); return p?.connected ? p : null;
}

function armLease(room: Room, p: Player) {
  if (p.leaseTimer) clearTimeout(p.leaseTimer);
  const connectionId = p.connectionId;
  p.leaseTimer = setTimeout(() => {
    if (!p.connected || p.connectionId !== connectionId) return;
    if (Date.now() - p.lastSeenAt >= CONNECTION_LEASE_MS) {
      const close = p.closeConnection;
      disconnect(room, p.id, p.sessionToken, connectionId);
      // Force EventSource to reconnect after lease expiry. Without this the
      // server can mark a player offline while the browser keeps a dead SSE.
      close?.();
    } else armLease(room, p);
  }, CONNECTION_LEASE_MS + 25);
}
function clearTimers(room: Room) { for (const t of room.timers) clearTimeout(t); room.timers = []; }
function removePlayer(room: Room, playerId: string) {
  const idx = room.players.findIndex((x) => x.id === playerId); if (idx < 0) return false;
  clearPlayerTimers(room.players[idx]); room.players.splice(idx, 1); fixHosts(room); fixLeader(room);
  if (!room.players.length) { clearTimers(room); if (rooms.get(room.code) === room) rooms.delete(room.code); return true; }
  if (room.phase === "playing") checkAllFinished(room); changed(room); return true;
}
function markOffline(room: Room, p: Player) {
  if (!p.connected) return false;
  p.connected = false; p.send = null; p.closeConnection = null; if (p.leaseTimer) clearTimeout(p.leaseTimer); p.leaseTimer = null;
  p.disconnectTimer = setTimeout(() => { if (!p.connected && room.players.includes(p)) removePlayer(room, p.id); }, DISCONNECT_GRACE_MS);
  fixHosts(room); fixLeader(room);
  changed(room); return true;
}

export function join(room: Room, playerId: string, name: string, send: Send, sessionToken: string, connectionId: string, opts?: { solo?: boolean }, closeConnection?: () => void) {
  if (!validPlayerId(playerId) || !validSessionToken(sessionToken) || !validConnectionId(connectionId)) return false;
  const safeName = sanitizeName(name) ?? "Player"; let p = room.players.find((x) => x.id === playerId);
  if (p) {
    if (p.sessionToken !== sessionToken) return false;
    const newConnection = p.connectionId !== connectionId;
    const supersededConnection = newConnection ? p.closeConnection : null;
    clearPlayerTimers(p); p.connectionId = connectionId; p.connected = true; p.lastSeenAt = Date.now(); p.send = send; p.closeConnection = closeConnection ?? null; p.name = safeName || p.name;
    if (newConnection) { p.lastInputSeq = -1; p.lastStateSeq = -1; p.connectionEpoch++; }
    armLease(room, p); fixHosts(room); fixLeader(room); changed(room);
    // Close the superseded response after installing the new identity. Its
    // cleanup is token-scoped, so it cannot detach this replacement stream.
    supersededConnection?.();
    return true;
  }
  const cap = room.squadSize;
  let team = room.teams.map((t) => ({ t, n: room.players.filter((x) => x.teamId === t.id).length })).filter((x) => x.n < cap).sort((a, b) => a.n - b.n).pop()?.t;
  if (opts?.solo || !team) team = newTeam(room);
  p = { id: playerId, name: safeName, teamId: team.id, roles: [], ready: false, send, sessionToken, connectionId, connected: true, lastSeenAt: Date.now(), leaseTimer: null, disconnectTimer: null, lastInputSeq: -1, lastStateSeq: -1, closeConnection: closeConnection ?? null, recentCommandIds: [], connectionEpoch: 1 };
  room.players.push(p);
  const taken = new Set(room.players.filter((x) => x.teamId === team.id).flatMap((x) => x.roles)); const free = squadRoles(room.squadSize).find((r) => !taken.has(r));
  if (opts?.solo) { p.roles = [...squadRoles(room.squadSize)]; p.ready = true; } else if (free) p.roles = [free];
  armLease(room, p); fixHosts(room); fixLeader(room); changed(room); return true;
}

export function heartbeat(room: Room, playerId: string, sessionToken: string, connectionId: string) {
  const p = auth(room, playerId, sessionToken, connectionId); if (!p) return false;
  if (!p.connected) return false;
  p.lastSeenAt = Date.now();
  armLease(room, p); return true;
}

/** Reserve a command id once so retrying after a lost response is idempotent. */
export function claimCommand(room: Room, playerId: string, sessionToken: string, connectionId: string, commandId: string): "new" | "duplicate" | "invalid" {
  const p = authenticate(room, playerId, sessionToken, connectionId);
  if (!p || !validConnectionId(commandId)) return "invalid";
  if (p.recentCommandIds.includes(commandId)) return "duplicate";
  p.recentCommandIds.push(commandId);
  if (p.recentCommandIds.length > 64) p.recentCommandIds.shift();
  return "new";
}
/** Mark an SSE connection offline. A stale connection cannot disconnect a newer one. */
export function disconnect(room: Room, playerId: string, sessionToken: string, connectionId: string) {
  const p = auth(room, playerId, sessionToken, connectionId); return p ? markOffline(room, p) : false;
}
/** Explicit user departure removes immediately; SSE/network cleanup uses disconnect(). */
export function leave(room: Room, playerId: string, sessionToken: string, connectionId: string) {
  if (!auth(room, playerId, sessionToken, connectionId)) return false; return removePlayer(room, playerId);
}

export function setRole(room: Room, playerId: string, role: Role) {
  if (room.phase !== "lobby") return false; const p = room.players.find((x) => x.id === playerId && x.connected); if (!p || !squadRoles(room.squadSize).includes(role)) return false;
  if (p.roles.includes(role)) p.roles = p.roles.filter((r) => r !== role); else { for (const other of room.players) if (other.teamId === p.teamId) other.roles = other.roles.filter((r) => r !== role); p.roles.push(role); }
  changed(room); return true;
}
export function setSquadSize(room: Room, squad: SquadSize) {
  if (room.phase !== "lobby" || (squad !== 3 && squad !== 5) || room.squadSize === squad) return false;
  if (room.teams.some((team) => room.players.filter((player) => player.teamId === team.id).length > squad)) return false;
  room.squadSize = squad;
  for (const pl of room.players) { pl.roles = []; pl.ready = false; }
  for (const t of room.teams) {
    const members = room.players.filter((x) => x.teamId === t.id);
    const seats = squadRoles(squad);
    members.forEach((member, index) => { member.roles = seats[index] ? [seats[index]] : []; });
  }
  changed(room); return true;
}
export function setTeam(room: Room, playerId: string, teamId: number | "new") {
  if (room.phase !== "lobby") return false; const p = room.players.find((x) => x.id === playerId && x.connected); if (!p) return false;
  let team = teamId === "new" ? newTeam(room) : room.teams.find((t) => t.id === teamId); if (!team) return false;
  if (team.id !== p.teamId && room.players.filter((x) => x.teamId === team.id).length >= room.squadSize) return false; p.teamId = team.id;
  const taken = new Set(room.players.filter((x) => x.teamId === team.id && x.id !== p.id).flatMap((x) => x.roles)); p.roles = p.roles.filter((r) => !taken.has(r));
  if (!p.roles.length) { const free = squadRoles(room.squadSize).find((r) => !taken.has(r)); if (free) p.roles = [free]; } p.ready = false; fixHosts(room); changed(room); return true;
}
export function setReady(room: Room, playerId: string, ready: boolean) {
  if (room.phase !== "lobby") return false; const p = room.players.find((x) => x.id === playerId && x.connected); if (!p) return false; p.ready = ready; changed(room); return true;
}
export function setChallenge(room: Room, challengeId: string) {
  if (room.phase !== "lobby" || !CHALLENGES.some((c) => c.id === challengeId)) return false; room.challengeId = challengeId; for (const p of room.players) p.ready = false; changed(room); return true;
}

export function start(room: Room, force = false) {
  if (room.phase === "countdown" || room.phase === "playing") return false;
  if (!force && room.players.some((p) => !p.connected || !p.ready)) return false;
  if (force) for (const p of [...room.players]) if (!p.connected) removePlayer(room, p.id);
  if (!room.players.length) return false;
  for (const t of room.teams) { const members = room.players.filter((p) => p.teamId === t.id && p.connected); if (!members.length) continue; const taken = new Set(members.flatMap((m) => m.roles)); let i = 0;
    for (const r of squadRoles(room.squadSize)) { if (taken.has(r)) continue; const target = [...members].sort((a, b) => a.roles.length - b.roles.length)[0] ?? members[i % members.length]; target.roles.push(r); i++; } t.finishMs = null; }
  clearTimers(room); room.round++; room.phase = "countdown"; room.startAt = Date.now() + 4200; room.startedAt = null; changed(room); const round = room.round;
  room.timers.push(setTimeout(() => { if (room.phase === "countdown" && room.round === round) { room.phase = "playing"; room.startedAt = room.startAt; changed(room); } }, 4200)); return true;
}
function checkAllFinished(room: Room) { const active = room.teams.filter((t) => room.players.some((p) => p.teamId === t.id)); if (active.length > 0 && active.every((t) => t.finishMs != null)) endRound(room); }

export interface FinishAccepted { roomCode: string; challengeId: string; squadSize: SquadSize; round: number; teamId: number; teamName: string; players: string[]; timeMs: number; }
export function finish(room: Room, playerId: string, clientTimeMs?: number, round = room.round): FinishAccepted | null {
  if (room.phase !== "playing" || round !== room.round) return null; const p = room.players.find((x) => x.id === playerId && x.connected); if (!p) return null; const t = room.teams.find((x) => x.id === p.teamId);
  if (!t || t.hostId !== playerId || t.finishMs != null || room.startedAt == null) return null; void clientTimeMs;
  t.finishMs = Math.round(Math.max(0, Math.min(3_600_000, Date.now() - room.startedAt)));
  const accepted: FinishAccepted = { roomCode: room.code, challengeId: room.challengeId, squadSize: room.squadSize, round: room.round, teamId: t.id, teamName: t.name, players: room.players.filter((x) => x.teamId === t.id).map((x) => x.name), timeMs: t.finishMs };
  broadcast(room, "finished", { teamId: t.id, timeMs: t.finishMs, teamName: t.name, round: room.round }); const active = room.teams.filter((team) => room.players.some((x) => x.teamId === team.id));
  if (active.length > 0 && active.every((team) => team.finishMs != null)) endRound(room); else { changed(room); const roundAtFinish = room.round; room.timers.push(setTimeout(() => { if (room.phase === "playing" && room.round === roundAtFinish) endRound(room); }, 45_000)); }
  return accepted;
}
export function endRound(room: Room) { if (room.phase !== "playing") return false; clearTimers(room); room.phase = "results"; changed(room); return true; }
export function backToLobby(room: Room) { clearTimers(room); room.phase = "lobby"; room.startAt = null; room.startedAt = null; for (const p of room.players) p.ready = false; for (const t of room.teams) t.finishMs = null; changed(room); return true; }

function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function clamp(value: unknown, min: number, max: number, fallback: number) { return finite(value) ? Math.max(min, Math.min(max, value)) : fallback; }
function finiteTuple(value: unknown, length: number, limit = 1e6) { return Array.isArray(value) && value.length === length && value.every((entry) => finite(entry) && Math.abs(entry) <= limit); }
/** Bound and structurally validate the optional host-takeover controller state. */
function safeReactorState(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const reactor = value as Record<string, unknown>;
  if (reactor.version !== 1 || !finite(reactor.stepHz) || (reactor.stepHz as number) <= 0 || !finite(reactor.fixedStepSeconds) || (reactor.fixedStepSeconds as number) <= 0) return null;
  if (!Number.isSafeInteger(reactor.tick) || (reactor.tick as number) < 0 || !finite(reactor.accumulatorSeconds) || (reactor.accumulatorSeconds as number) < 0) return null;
  if (!Array.isArray(reactor.parts) || (reactor.parts.length !== 0 && reactor.parts.length !== 11) || !Array.isArray(reactor.grips) || reactor.grips.length > 2) return null;
  for (const part of reactor.parts) {
    if (!part || typeof part !== "object") return null;
    const p = part as Record<string, unknown>;
    if (!finiteTuple(p.translation, 3) || !finiteTuple(p.rotation, 4) || !finiteTuple(p.linearVelocity, 3, 1e5) || !finiteTuple(p.angularVelocity, 3, 1e5)) return null;
  }
  const gripHands = new Set<number>();
  for (const grip of reactor.grips) {
    if (!grip || typeof grip !== "object") return null;
    const g = grip as Record<string, unknown>;
    if ((g.hand !== 0 && g.hand !== 1) || gripHands.has(g.hand) || !finite(g.id) || typeof g.isStatic !== "boolean" || !finite(g.mass) || (g.mass as number) < 0 || !finiteTuple(g.localAnchor, 3)) return null;
    gripHands.add(g.hand);
  }
  if (!reactor.controller || typeof reactor.controller !== "object" || Array.isArray(reactor.controller)) return null;
  try {
    const encoded = JSON.stringify(reactor);
    if (encoded.length > 12_000) return null;
    return JSON.parse(encoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}
function sanitizeRoleInput(value: unknown): RoleInput { const x = value && typeof value === "object" ? value as Record<string, unknown> : {}; return { f: clamp(x.f, -1, 1, 0), s: clamp(x.s, -1, 1, 0), a: x.a === true, b: x.b === true, q: x.q === true, e: x.e === true, lx: clamp(x.lx, -Math.PI, Math.PI, 0), ly: clamp(x.ly, -0.9, 0.7, 0) }; }
function sanitizeInputs(player: Player, inputs: unknown) {
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) return null; const entries = Object.entries(inputs as Record<string, unknown>); if (entries.length > 8) return null;
  const result: Partial<Record<Role, RoleInput>> = {}; for (const [role, value] of entries) if (player.roles.includes(role as Role)) result[role as Role] = sanitizeRoleInput(value); return result;
}
export function relayInput(room: Room, playerId: string, sessionToken: string, connectionId: string, inputs: unknown, seq = 0) {
  const p = authenticate(room, playerId, sessionToken, connectionId); if (!p || !finite(seq) || seq <= p.lastInputSeq) return false;
  const safe = sanitizeInputs(p, inputs); const t = room.teams.find((x) => x.id === p.teamId); if (!safe || !t?.hostId || t.hostId === playerId) return false;
  p.lastInputSeq = seq; sendTo(room, t.hostId, "input", { playerId, inputs: safe, seq }); return true;
}
function safeSnapshot(state: unknown) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return null; const s = state as Record<string, unknown>;
  if (!finite(s.t) || !Array.isArray(s.p) || s.p.length !== SNAP_PARTS || !Array.isArray(s.props) || s.props.length > 256 || s.props.length % 8 !== 0 || !finite(s.yaw) || !finite(s.pitch) || !finite(s.timer) || !finite(s.fallen) || !finite(s.score) || !Array.isArray(s.ev) || s.ev.length > 32) return null;
  const nums = [...s.p, ...s.props, s.t, s.yaw, s.pitch, s.timer, s.fallen, s.score]; if (!nums.every(finite) || !s.ev.every((e) => {
    if (!e || typeof e !== "object") return false;
    const event = e as Record<string, unknown>;
    return typeof event.type === "string" && event.type.length <= 32 && finiteTuple(event.pos, 3);
  })) return null;
  const optionalArrays = [s.v, s.av, s.propMotion];
  if (s.v !== undefined && (!Array.isArray(s.v) || s.v.length !== SNAP_VELOCITIES)) return null;
  if (s.av !== undefined && (!Array.isArray(s.av) || s.av.length !== SNAP_VELOCITIES)) return null;
  if (s.propMotion !== undefined && (!Array.isArray(s.propMotion) || s.propMotion.length > 224 || s.propMotion.length % 7 !== 0)) return null;
  if (!optionalArrays.filter((x) => x !== undefined).every((x) => (x as unknown[]).every(finite))) return null;
  if (s.moverT !== undefined && !finite(s.moverT)) return null;
  if (s.checkpointIdx !== undefined && (!Number.isSafeInteger(s.checkpointIdx) || (s.checkpointIdx as number) < -1)) return null;
  if (s.delivered !== undefined && typeof s.delivered !== "boolean") return null;
  if (s.running !== undefined && typeof s.running !== "boolean") return null;
  if (s.finished !== undefined && typeof s.finished !== "boolean") return null;
  const commentary = s.commentary === undefined ? undefined : isCommentaryCue(s.commentary) ? { ...s.commentary } : null;
  if (commentary === null) return null;
  const commentaryState = s.commentaryState === undefined ? undefined : isCommentarySnapshot(s.commentaryState) ? s.commentaryState : null;
  if (commentaryState === null) return null;
  const reactor = s.reactor === undefined ? undefined : safeReactorState(s.reactor); if (s.reactor !== undefined && !reactor) return null;
  if (s.running === true && commentaryState && reactor && commentaryState.lastTick !== reactor.tick) return null;
  const clean = { t: s.t, p: (s.p as number[]).map(Number), v: s.v ? (s.v as number[]).map(Number) : undefined, av: s.av ? (s.av as number[]).map(Number) : undefined, props: (s.props as number[]).map(Number), propMotion: s.propMotion ? (s.propMotion as number[]).map(Number) : undefined, moverT: s.moverT, checkpointIdx: s.checkpointIdx, delivered: s.delivered, running: s.running, finished: s.finished, yaw: s.yaw, pitch: s.pitch, timer: Math.max(0, s.timer as number), fallen: s.fallen, score: s.score, ev: s.ev, msg: typeof s.msg === "string" ? s.msg.slice(0, 256) : undefined, commentary, commentaryState, reactor };
  return JSON.stringify(clean).length <= MAX_STATE_BYTES ? clean : null;
}
export function relayState(room: Room, playerId: string, sessionToken: string, connectionId: string, state: unknown, seq = 0) {
  const p = authenticate(room, playerId, sessionToken, connectionId); if (!p || room.phase === "results" || !finite(seq) || seq <= p.lastStateSeq) return false; const t = room.teams.find((x) => x.id === p.teamId); const safe = safeSnapshot(state);
  if (!t || t.hostId !== playerId || !safe) return false; p.lastStateSeq = seq; broadcast(room, "state", { teamId: p.teamId, hostId: p.id, epoch: p.connectionEpoch, state: safe, seq, round: room.round }, playerId); return true;
}
export function relayEvent(room: Room, playerId: string, sessionToken: string, connectionId: string, ev: unknown) {
  const p = authenticate(room, playerId, sessionToken, connectionId); if (!p || !ev || typeof ev !== "object") return false; let safe: unknown;
  try { const text = JSON.stringify(ev); if (text.length > MAX_EVENT_BYTES) return false; safe = JSON.parse(text); } catch { return false; }
  broadcast(room, "gev", { playerId, teamId: p.teamId, ev: safe }, playerId); return true;
}
export type { Room };
