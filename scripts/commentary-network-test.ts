import assert from "node:assert/strict";
import { PARTS, PART_COUNT } from "../src/game/body";
import { CommentaryDirector, type CommentaryCue } from "../src/game/commentary";
import { Game, type GameEvent, type Snap } from "../src/game/game";

type GuestHarness = {
  ownBuffer: { recv: number; snap: Snap }[];
  timer: number;
  score: number;
  displayYaw: number;
  displayPitch: number;
  displayFallen: boolean;
  displayHolding: number;
  movers: never[];
  onEvent: (event: GameEvent) => void;
  lastReceivedCommentaryId: string | null;
};

const transforms = PARTS.flatMap((part) => [part.pos[0], part.pos[1], part.pos[2], 0, 0, 0, 1]);
assert.equal(transforms.length, PART_COUNT * 7);

function makeSnapshot(cue: CommentaryCue, commentaryState: ReturnType<CommentaryDirector["capture"]>): Snap {
  return {
    t: cue.tick,
    p: [...transforms],
    props: [],
    yaw: 0,
    pitch: 0,
    timer: 0,
    fallen: 0,
    score: 0,
    ev: [],
    running: true,
    finished: false,
    commentary: cue,
    commentaryState,
  };
}

const director = new CommentaryDirector();
const first = director.step({
  tick: 0,
  challengeId: "wobble-run",
  diagnostics: { balance: 1, grounded: true, fallen: false, supportContacts: 2, heldObjects: 0 },
  events: [{ type: "start" }],
  objective: { running: true, finished: false, checkpoint: -1, score: 0, scoreTarget: 0 },
})!;

const seen: GameEvent[] = [];
const guest: GuestHarness = {
  ownBuffer: [],
  timer: 0,
  score: 0,
  displayYaw: 0,
  displayPitch: 0,
  displayFallen: false,
  displayHolding: 0,
  movers: [],
  onEvent: (event) => seen.push(event),
  lastReceivedCommentaryId: null,
};
const applyOwnSnapshot = Game.prototype.applyOwnSnapshot as unknown as (this: GuestHarness, snapshot: Snap) => boolean;

const firstSnapshot = makeSnapshot(first, director.capture());
assert.equal(applyOwnSnapshot.call(guest, firstSnapshot), true);
assert.equal(applyOwnSnapshot.call(guest, firstSnapshot), true);
assert.equal(seen.filter((event) => event.type === "commentary").length, 1, "repeated 15 Hz cue copies must render once");

for (let tick = 1; tick < 8; tick++) {
  director.step({
    tick,
    challengeId: "wobble-run",
    diagnostics: { balance: 1, grounded: true, fallen: false, supportContacts: 2, heldObjects: 0 },
    objective: { running: true, finished: false, checkpoint: -1, score: 0, scoreTarget: 0 },
  });
}
const second = director.step({
  tick: 8,
  challengeId: "wobble-run",
  diagnostics: { balance: 1, grounded: true, fallen: false, supportContacts: 2, heldObjects: 0 },
  events: [{ type: "checkpoint" }],
  objective: { running: true, finished: false, checkpoint: 0, score: 0, scoreTarget: 0 },
})!;
assert.equal(applyOwnSnapshot.call(guest, makeSnapshot(second, director.capture())), true);
assert.equal(seen.filter((event) => event.type === "commentary").length, 2, "a new cue must render once");

const invalid = { ...makeSnapshot(second, director.capture()), commentary: { ...second, tone: "loud" } } as unknown as Snap;
assert.equal(applyOwnSnapshot.call(guest, invalid), false, "malformed commentary must be rejected before presentation");

console.log("commentary snapshot delivery checks passed");
