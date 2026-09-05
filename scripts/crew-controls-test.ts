import assert from "node:assert/strict";
import { makeSquadMixState, resolvePhysInputs } from "../src/game/squad";
import { ROLES_3, ROLES_5, emptyInput, type Role, type RoleInput, type SquadSize } from "../src/game/types";

const input = (patch: Partial<RoleInput> = {}): RoleInput => ({ ...emptyInput(), ...patch });

function from(role: Role, patch: Partial<RoleInput>, squad: SquadSize) {
  return resolvePhysInputs({ [role]: input(patch) }, squad, 1 / 60, makeSquadMixState());
}

for (const [squad, roles] of [[3, ROLES_3], [5, ROLES_5]] as const) {
  for (const role of roles) {
    const movement = from(role, { f: 1 }, squad);
    assert.ok(movement.lleg.f > 0 || movement.rleg.f > 0, `${role} must be able to move the shared body`);

    const jump = from(role, { a: true }, squad);
    assert.equal(jump.lleg.a && jump.rleg.a, true, `${role} must be able to trigger the shared hop`);
    assert.equal(jump.torso.a, true, `${role} must be able to help recovery`);

    const quackBoost = from(role, { b: true }, squad);
    assert.equal(quackBoost.head.a, true, `${role} must be able to quack`);
    assert.equal(quackBoost.lleg.b && quackBoost.rleg.b, true, `${role} must be able to boost`);
    assert.equal(quackBoost.torso.b, true, `${role} must be able to duck under low obstacles`);
  }
}

{
  const mixed = resolvePhysInputs(
    {
      arms: input({ f: 1 }),
      torso: input({ f: -1 }),
    },
    3,
    1 / 60,
    makeSquadMixState(),
  );
  assert.equal(mixed.lleg.f, 0, "opposed movement votes should cancel");
  assert.equal(mixed.rleg.f, 0, "opposed movement votes should cancel");
}

{
  const left = resolvePhysInputs(
    {
      arms: input({ f: 1, s: -0.5, q: true }),
      torso: input({ f: 1 }),
    },
    3,
    1 / 60,
    makeSquadMixState(),
  );
  assert.equal(left.lhand.a, true, "Q should grab the left hand");
  assert.equal(left.lhand.f, 1, "Q + WASD should aim the left hand");
  assert.equal(left.rhand.a, false, "left-hand mode must not grab the right hand");
  assert.ok(left.lleg.f > 0 || left.rleg.f > 0, "another crewmate should still be able to drive while a hand is active");
}

{
  const onePlayerBothHands = resolvePhysInputs(
    {
      arms: input({ q: true, e: true }),
      torso: input(),
    },
    3,
    1 / 60,
    makeSquadMixState(),
  );
  assert.equal(onePlayerBothHands.lhand.a && onePlayerBothHands.rhand.a, false, "a multiplayer two-hand grab needs two distinct crewmates");

  const collaborated = resolvePhysInputs(
    {
      arms: input({ q: true, b: true }),
      torso: input({ e: true, b: true }),
    },
    3,
    1 / 60,
    makeSquadMixState(),
  );
  assert.equal(collaborated.lhand.a && collaborated.rhand.a, true, "distinct crewmates should coordinate both hands");
  assert.equal(collaborated.lhand.b && collaborated.rhand.b, true, "a shared yeet needs two Shift votes");
}

console.log("shared crew control checks passed");
