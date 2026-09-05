import assert from "node:assert/strict";
import { RemoteInputBuffer, normalizeRoleInput } from "../src/game/remoteInput";
import { makeSquadMixState, resolvePhysInputs } from "../src/game/squad";

let now = 0;
const buffer = new RemoteInputBuffer(500, () => now);
buffer.set("p1", { legs: { f: 9, s: -9, lx: Infinity, ly: -9, a: true } });
let merged = buffer.getMerged();
assert.equal(merged.legs?.f, 1);
assert.equal(merged.legs?.s, -1);
assert.equal(merged.legs?.lx, 0);
assert.equal(merged.legs?.ly, -0.9);
assert.equal(merged.legs?.a, true);
assert.equal(buffer.size, 1);

now = 499;
assert.equal(buffer.getMerged().legs?.f, 1, "lease should survive until timeout");
now = 501;
assert.equal(buffer.getMerged().legs, undefined, "dropped player must become neutral");
assert.equal(buffer.size, 0);

now = 0;
buffer.set("p1", { legs: { f: 1 } });
buffer.set("p2", { torso: { f: -1 } });
buffer.clear("p1");
assert.equal(buffer.getMerged().legs, undefined, "individual player leases can be cleared");
assert.equal(buffer.getMerged().torso?.f, -1);

const normalized = normalizeRoleInput({ f: "1", s: NaN, lx: "Infinity", ly: Infinity, a: 1 });
assert.deepEqual(normalized, { f: 0, s: 0, a: false, b: false, q: false, e: false, lx: 0, ly: 0 });
const physics = resolvePhysInputs({ torso: { f: NaN, lx: Infinity } as never, legs: { f: "bad" } as never }, 3, 1 / 120, makeSquadMixState());
for (const input of Object.values(physics)) {
  for (const value of Object.values(input)) if (typeof value === "number") assert.equal(Number.isFinite(value), true);
}

console.log("remote input resilience checks passed");
