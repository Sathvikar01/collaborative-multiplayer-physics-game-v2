import assert from "node:assert/strict";
import { claimCommand, getRoom, join, disconnect, leave, relayInput, relayState, setSquadSize, snapshot } from "../src/lib/rooms";
import { CommentaryDirector } from "../src/game/commentary";

const room = getRoom("ABCD", true)!;
const token = "0123456789abcdef0123456789abcdef";
const oldConnection = "old-connection-0001";
const newConnection = "new-connection-0001";

assert.equal(join(room, "player-1", "Alice", () => {}, token, oldConnection), true);
assert.equal(snapshot(room).players[0].connected, true);
const beforeReconnect = snapshot(room).version;

// A reconnect supersedes the old SSE connection. Cleanup from that old stream
// must not remove the active membership.
assert.equal(join(room, "player-1", "Alice", () => {}, token, newConnection), true);
assert.equal(join(room, "player-1", "Mallory", () => {}, "different-session-token-000000000", "attacker-connection"), false);
assert.equal(disconnect(room, "player-1", token, oldConnection), false);
assert.equal(snapshot(room).players.length, 1);
assert.equal(snapshot(room).players[0].connected, true);
assert.ok(snapshot(room).version > beforeReconnect);

// The current stream can be disconnected and then reconnected during grace.
assert.equal(disconnect(room, "player-1", token, newConnection), true);
assert.equal(snapshot(room).players[0].connected, false);
assert.equal(join(room, "player-1", "Alice", () => {}, token, oldConnection), true);
assert.equal(snapshot(room).players[0].connected, true);
assert.equal(leave(room, "player-1", token, oldConnection), true);
assert.equal(snapshot(room).players.length, 0);

type SeenEvent = { event: string; data: unknown };
const relayRoom = getRoom("BCDE", true)!;
const hostEvents: SeenEvent[] = [];
const guestEvents: SeenEvent[] = [];
const hostToken = "host-session-token-000000000000";
const guestToken = "guest-session-token-00000000000";
const hostConnection = "host-connection-0001";
const guestConnection = "guest-connection-0001";
assert.equal(join(relayRoom, "host-player", "Host", (event, data) => hostEvents.push({ event, data }), hostToken, hostConnection), true);
assert.equal(join(relayRoom, "guest-player", "Guest", (event, data) => guestEvents.push({ event, data }), guestToken, guestConnection), true);
assert.equal(claimCommand(relayRoom, "guest-player", guestToken, guestConnection, "command-id-00000001"), "new");
assert.equal(claimCommand(relayRoom, "guest-player", guestToken, guestConnection, "command-id-00000001"), "duplicate");

const guestRole = snapshot(relayRoom).players.find((player) => player.id === "guest-player")!.roles[0];
assert.equal(
  relayInput(
    relayRoom,
    "guest-player",
    guestToken,
    guestConnection,
    {
      [guestRole]: { f: 99, s: -99, a: true, b: 1, q: false, e: false, lx: Infinity, ly: -99 },
      torso: { f: 1 },
    },
    1,
  ),
  true,
);
const relayedInput = hostEvents.findLast((item) => item.event === "input")!.data as { playerId: string; inputs: Record<string, Record<string, unknown>> };
assert.equal(relayedInput.playerId, "guest-player");
assert.deepEqual(Object.keys(relayedInput.inputs), [guestRole], "players may send only their assigned role");
assert.equal(relayedInput.inputs[guestRole].f, 1);
assert.equal(relayedInput.inputs[guestRole].s, -1);
assert.equal(relayedInput.inputs[guestRole].lx, 0);
assert.equal(relayedInput.inputs[guestRole].b, false);
assert.equal(relayInput(relayRoom, "guest-player", guestToken, guestConnection, {}, 1), false, "stale input sequence must be rejected");

const transforms = Array.from({ length: 11 }, () => [0, 1, 0, 0, 0, 0, 1]).flat();
const commentaryDirector = new CommentaryDirector();
const commentary = commentaryDirector.step({
  tick: 0,
  challengeId: "wobble-run",
  diagnostics: { balance: 1, grounded: true, fallen: false, supportContacts: 2, heldObjects: 0, stabilityMargin: 0.2, gripStress: [0, 0] },
  events: [{ type: "start" }],
  objective: { running: true, finished: false, checkpoint: -1, score: 0, scoreTarget: 0 },
})!;
const state = {
  t: 1,
  p: transforms,
  v: new Array(33).fill(0),
  av: new Array(33).fill(0),
  props: [],
  propMotion: [],
  moverT: 2,
  checkpointIdx: -1,
  delivered: false,
  running: false,
  finished: false,
  yaw: 0,
  pitch: 0,
  timer: 0,
  fallen: 0,
  score: 0,
  ev: [],
  commentary,
  commentaryState: commentaryDirector.capture(),
};
assert.equal(relayState(relayRoom, "host-player", hostToken, hostConnection, state, 1), true);
const relayedState = guestEvents.findLast((item) => item.event === "state")!.data as { hostId: string; epoch: number; state: typeof state; seq: number; round: number };
assert.equal(relayedState.state.v.length, 33, "takeover velocity state must survive validation");
assert.equal(relayedState.hostId, "host-player");
assert.equal(relayedState.epoch, 1);
assert.equal(relayedState.seq, 1);
assert.equal(relayedState.state.commentary.id, commentary.id, "validated commentary must survive the host snapshot relay");
assert.equal(relayState(relayRoom, "host-player", hostToken, hostConnection, state, 1), false, "stale state sequence must be rejected");
assert.equal(relayState(relayRoom, "guest-player", guestToken, guestConnection, state, 2), false, "non-host state must be rejected");
assert.equal(relayState(relayRoom, "host-player", hostToken, hostConnection, { ...state, commentary: { ...commentary, tone: "loud" } }, 2), false, "unknown commentary tones must be rejected");
assert.equal(relayState(relayRoom, "host-player", hostToken, hostConnection, { ...state, p: [0] }, 2), false, "malformed state must be rejected");

assert.equal(disconnect(relayRoom, "host-player", hostToken, hostConnection), true);
let takeover = snapshot(relayRoom);
assert.equal(takeover.teams[0].hostId, "guest-player", "an online teammate must take over immediately");
assert.equal(takeover.leaderId, "guest-player", "an online teammate must receive room leadership immediately");
assert.equal(join(relayRoom, "host-player", "Host", (event, data) => hostEvents.push({ event, data }), hostToken, hostConnection), true);
takeover = snapshot(relayRoom);
assert.equal(takeover.teams[0].hostId, "guest-player", "a reconnect must not steal authority back from the replacement host");
assert.equal(takeover.leaderId, "guest-player");

assert.equal(leave(relayRoom, "guest-player", guestToken, guestConnection), true);
assert.equal(leave(relayRoom, "host-player", hostToken, hostConnection), true);

const resizeRoom = getRoom("CDEF", true)!;
const resizeTokenA = "resize-session-token-a-0000000000";
const resizeTokenB = "resize-session-token-b-0000000000";
assert.equal(join(resizeRoom, "resize-a", "Resize A", () => {}, resizeTokenA, "resize-connection-a"), true);
assert.equal(join(resizeRoom, "resize-b", "Resize B", () => {}, resizeTokenB, "resize-connection-b"), true);
assert.equal(setSquadSize(resizeRoom, 3), true);
assert.ok(snapshot(resizeRoom).players.every((player) => player.roles.length === 1), "resizing must keep every crewmate on an input channel");
assert.equal(leave(resizeRoom, "resize-a", resizeTokenA, "resize-connection-a"), true);
assert.equal(leave(resizeRoom, "resize-b", resizeTokenB, "resize-connection-b"), true);

console.log("rooms resilience tests passed");
