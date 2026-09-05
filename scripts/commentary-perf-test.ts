import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { CommentaryDirector } from "../src/game/commentary";

const director = new CommentaryDirector();
const diagnostics = {
  balance: 1,
  grounded: true,
  fallen: false,
  supportContacts: 2,
  heldObjects: 0,
  stabilityMargin: 0.2,
  gripStress: [0, 0] as const,
};
const neutralInput = { f: 0, s: 0, a: false, b: false, q: false, e: false } as const;
const roleInputs = { lhand: neutralInput, rhand: neutralInput, torso: neutralInput, lleg: neutralInput, rleg: neutralInput } as const;
const inputs = { head: neutralInput, lhand: neutralInput, rhand: neutralInput, torso: neutralInput, lleg: neutralInput, rleg: neutralInput } as const;
const iterations = 50_000;
const started = performance.now();
for (let tick = 0; tick < iterations; tick++) {
  director.step({ tick, challengeId: "wobble-run", diagnostics, roleInputs, inputs });
}
const elapsed = performance.now() - started;
const perStepMs = elapsed / iterations;

console.log(`commentary director: ${perStepMs.toFixed(4)} ms/fixed-step (${elapsed.toFixed(1)} ms for ${iterations})`);
assert.ok(perStepMs < 0.1, `commentary director used ${perStepMs.toFixed(4)} ms/step; expected <0.1 ms`);
