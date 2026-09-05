import assert from "node:assert/strict";
import { makeSquadMixState, resolvePhysInputs } from "../src/game/squad";
import { emptyInput, type RoleInput } from "../src/game/types";

const input = (patch: Partial<RoleInput> = {}): RoleInput => ({ ...emptyInput(), ...patch });

// 3P: Arms owns both hands. Space and Shift affect both; Q/E isolate one grab.
{
  const both = resolvePhysInputs(
    { arms: input({ f: 1, s: -0.5, a: true, b: true }) },
    3,
    1 / 60,
    makeSquadMixState(),
  );
  assert.equal(both.lhand.f, 1);
  assert.equal(both.rhand.f, 1);
  assert.equal(both.lhand.s, -0.5);
  assert.equal(both.rhand.s, -0.5);
  assert.equal(both.lhand.a && both.rhand.a, true);
  assert.equal(both.lhand.b && both.rhand.b, true);

  const singles = resolvePhysInputs(
    { arms: input({ q: true, e: true }) },
    3,
    1 / 60,
    makeSquadMixState(),
  );
  assert.equal(singles.lhand.q, true);
  assert.equal(singles.lhand.e, false);
  assert.equal(singles.rhand.q, false);
  assert.equal(singles.rhand.e, true);
}

// 3P: Legs auto-alternates every 0.3 seconds and Space reaches both legs.
{
  const state = makeSquadMixState();
  const first = resolvePhysInputs({ legs: input({ f: 1, a: true }) }, 3, 0.1, state);
  assert.equal(first.lleg.f, 1);
  assert.equal(first.rleg.f, 0);
  assert.equal(first.lleg.a && first.rleg.a, true);

  const second = resolvePhysInputs({ legs: input({ f: 1 }) }, 3, 0.2, state);
  assert.equal(second.lleg.f, 0);
  assert.equal(second.rleg.f, 1);
}

// 5P: hand movement is averaged. Two-hand Space/Shift requires both players,
// while Q and E still grab the player's own hand independently.
{
  const mixed = resolvePhysInputs(
    {
      lhand: input({ f: 1, s: 1, a: true, b: true, q: true }),
      rhand: input({ f: -0.5, s: -1, a: true, b: false, e: true }),
    },
    5,
    1 / 60,
    makeSquadMixState(),
  );
  assert.equal(mixed.lhand.f, 0.25);
  assert.equal(mixed.rhand.f, 0.25);
  assert.equal(mixed.lhand.s, 0);
  assert.equal(mixed.rhand.s, 0);
  assert.equal(mixed.lhand.a && mixed.rhand.a, true);
  assert.equal(mixed.lhand.b || mixed.rhand.b, false);
  assert.equal(mixed.lhand.q, true);
  assert.equal(mixed.rhand.e, true);

  const oneSpace = resolvePhysInputs(
    { lhand: input({ a: true }), rhand: input() },
    5,
    1 / 60,
    makeSquadMixState(),
  );
  assert.equal(oneSpace.lhand.a || oneSpace.rhand.a, false);
}

// 5P: legs are independent, and Torso exclusively owns balance/camera/shout.
{
  const mixed = resolvePhysInputs(
    {
      torso: input({ f: 0.75, s: -1, a: true, b: true, q: true, lx: 1.2, ly: -0.4 }),
      lleg: input({ f: 1, s: -1, a: true }),
      rleg: input({ f: -1, s: 1 }),
    },
    5,
    1 / 60,
    makeSquadMixState(),
  );
  assert.equal(mixed.torso.f, 0.75);
  assert.equal(mixed.torso.s, -1);
  assert.equal(mixed.head.a, true);
  assert.equal(mixed.head.lx, 1.2);
  assert.equal(mixed.head.ly, -0.4);
  assert.equal(mixed.lleg.f, 1);
  assert.equal(mixed.rleg.f, -1);
  assert.equal(mixed.lleg.a, true);
  assert.equal(mixed.rleg.a, false);
  assert.equal(mixed.lhand.f, 0);
  assert.equal(mixed.rhand.f, 0);
}

console.log("singularity2 character-control contract checks passed");
