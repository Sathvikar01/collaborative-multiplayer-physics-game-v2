import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import {
  GROUP_ENV,
  GROUP_PROP,
  RagdollBody,
  groups,
  makeInputs,
  type BodyInputs,
} from "../src/game/body";
import { PhysicsReactor, type PhysicsReactorSnapshot } from "../src/game/physicsReactor";
import { makeSquadMixState, resolvePhysInputs } from "../src/game/squad";
import { emptyInput, type RoleInput } from "../src/game/types";

const DT = 1 / 120;
const SETTLE_SECONDS = 1.5;

type Rig = {
  world: RAPIER.World;
  body: RagdollBody;
  reactor: PhysicsReactor;
};

type EventRecord = { type: string; reason?: string };

const input = (patch: Partial<RoleInput> = {}): RoleInput => ({ ...emptyInput(), ...patch });

function createRig(): Rig {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(50, 0.5, 50)
      .setCollisionGroups(groups(GROUP_ENV, 0xffff))
      .setFriction(0.9),
    ground,
  );
  const body = new RagdollBody(RAPIER, world, new THREE.Vector3(0, 0, 0), 0);
  const reactor = new PhysicsReactor({ rapier: RAPIER, world, body });
  return { world, body, reactor };
}

function disposeRig(rig: Rig) {
  rig.reactor.dispose();
  rig.body.dispose();
  rig.world.free();
}

function replaceReactor(rig: Rig, resolveGripTargetHandle: (grip: PhysicsReactorSnapshot["grips"][number]) => number | undefined) {
  rig.reactor.dispose();
  rig.reactor = new PhysicsReactor({ rapier: RAPIER, world: rig.world, body: rig.body, resolveGripTargetHandle });
}

function advance(rig: Rig, seconds: number, inputs: BodyInputs, events: EventRecord[] = []) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    const result = rig.reactor.advance(DT, inputs);
    events.push(...result.bodyEvents);
  }
}

function settle(rig: Rig) {
  advance(rig, SETTLE_SECONDS, makeInputs());
}

function assertClose(actual: number, expected: number, tolerance: number, message: string) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
}

function installPropGrab(rig: Rig, mass: number, id: number, center?: THREE.Vector3) {
  const { world, body } = rig;
  const left = body.handPos(0, new THREE.Vector3());
  const right = body.handPos(1, new THREE.Vector3());
  const position = center ?? left.clone().add(right).multiplyScalar(0.5);
  const prop = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(position.x, position.y, position.z));
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.65, 0.12, 0.18)
      .setMass(mass)
      .setFriction(0.7)
      .setCollisionGroups(groups(GROUP_PROP, 0xffff)),
    prop,
  );
  body.findGrab = (handPosition) => {
    const t = prop.translation();
    const distance = Math.hypot(handPosition.x - t.x, handPosition.y - t.y, handPosition.z - t.z);
    if (distance > 0.72) return null;
    return {
      body: prop,
      localAnchor: handPosition.clone().sub(new THREE.Vector3(t.x, t.y, t.z)),
      isStatic: false,
      mass,
      id,
    };
  };
  return prop;
}

function installStaticGrab(rig: Rig, id: number) {
  const midpoint = rig.body.handPos(0, new THREE.Vector3()).add(rig.body.handPos(1, new THREE.Vector3())).multiplyScalar(0.5);
  const target = rig.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(midpoint.x, midpoint.y, midpoint.z));
  rig.world.createCollider(RAPIER.ColliderDesc.cuboid(0.8, 0.1, 0.2).setCollisionGroups(groups(GROUP_ENV, 0xffff)), target);
  rig.body.findGrab = (handPosition) => {
    const translation = target.translation();
    return {
      body: target,
      localAnchor: handPosition.clone().sub(new THREE.Vector3(translation.x, translation.y, translation.z)),
      isStatic: true,
      mass: 0,
      id,
    };
  };
  return target;
}

function grabBoth(): BodyInputs {
  const inputs = makeInputs();
  inputs.lhand.a = true;
  inputs.rhand.a = true;
  return inputs;
}

function snapshotMaxDifference(a: PhysicsReactorSnapshot, b: PhysicsReactorSnapshot) {
  let max = 0;
  for (let i = 0; i < a.parts.length; i++) {
    for (const key of ["translation", "rotation", "linearVelocity", "angularVelocity"] as const) {
      for (let j = 0; j < a.parts[i][key].length; j++) {
        max = Math.max(max, Math.abs(a.parts[i][key][j] - b.parts[i][key][j]));
      }
    }
  }
  return max;
}

async function main() {
  await RAPIER.init();

  // 5P must preserve separate hand intent. A shared grab requires both Space
  // inputs, while Q/E still address one hand independently.
  {
    const state = makeSquadMixState();
    const mixed = resolvePhysInputs(
      {
        lhand: input({ f: 1, s: 1, a: true }),
        rhand: input({ f: -1, s: -1, a: true }),
      },
      5,
      DT,
      state,
    );
    assert.equal(mixed.lhand.f, 1);
    assert.equal(mixed.rhand.f, -1);
    assert.equal(mixed.lhand.s, 1);
    assert.equal(mixed.rhand.s, -1);
    assert.equal(mixed.lhand.a, true);
    assert.equal(mixed.rhand.a, true);

    const oneHand = resolvePhysInputs(
      { lhand: input({ q: true }), rhand: input() },
      5,
      DT,
      makeSquadMixState(),
    );
    assert.equal(oneHand.lhand.a, true);
    assert.equal(oneHand.rhand.a, false);

    const skewState = makeSquadMixState();
    const leftArrivesFirst = resolvePhysInputs(
      { lhand: input({ a: true }), rhand: input() },
      5,
      0.05,
      skewState,
    );
    assert.equal(leftArrivesFirst.lhand.a, false);
    const rightArrivesWithinGrace = resolvePhysInputs(
      { lhand: input(), rhand: input({ a: true }) },
      5,
      0.05,
      skewState,
    );
    assert.equal(rightArrivesWithinGrace.lhand.a, true);
    assert.equal(rightArrivesWithinGrace.rhand.a, true);
  }

  // The fixed-step clock must produce the same state for equivalent elapsed
  // time, whether the caller supplies 60 Hz or 120 Hz frame deltas.
  {
    const a = createRig();
    const b = createRig();
    try {
      const inputs = makeInputs();
      inputs.lhand.f = 0.5;
      inputs.rhand.s = -0.4;
      inputs.torso.f = 0.2;
      for (let i = 0; i < 60; i++) a.reactor.advance(1 / 60, inputs);
      for (let i = 0; i < 120; i++) b.reactor.advance(DT, inputs);
      assert.equal(a.reactor.currentTick, 120);
      assert.equal(b.reactor.currentTick, 120);
      assertClose(a.reactor.accumulator, 0, 1e-12, "60 Hz accumulator");
      assertClose(b.reactor.accumulator, 0, 1e-12, "120 Hz accumulator");
      assert.ok(snapshotMaxDifference(a.reactor.capture(), b.reactor.capture()) < 1e-5);
    } finally {
      disposeRig(a);
      disposeRig(b);
    }
  }

  // Contact support is measured from Rapier manifolds after settling, not from
  // whether the leg key is currently held.
  {
    const rig = createRig();
    try {
      settle(rig);
      assert.deepEqual(rig.body.supportFeet, [true, true]);
      assert.ok(rig.reactor.capture().controller.grounded);
      assert.ok(rig.body.stabilityMargin > -0.2);
    } finally {
      disposeRig(rig);
    }
  }

  // A checkpoint teleport clears joint/contact warm-start impulses rather
  // than leaking the previous collision into the new spawn.
  {
    const rig = createRig();
    try {
      settle(rig);
      rig.body.parts[0].applyImpulse({ x: 20, y: 5, z: -15 }, true);
      advance(rig, 0.15, makeInputs());
      rig.body.teleport(new THREE.Vector3(0, 0, 0), 0);
      rig.reactor.resetClock(true);
      advance(rig, 0.25, makeInputs());
      const pelvis = rig.body.pelvisPos(new THREE.Vector3());
      assert.equal(rig.body.fallen, false);
      assert.ok(Math.hypot(pelvis.x, pelvis.z) < 0.25, "teleport must not inherit a lateral solver shove");
    } finally {
      disposeRig(rig);
    }
  }

  // Both hands should acquire the same target and share its load.
  {
    const rig = createRig();
    try {
      settle(rig);
      const prop = installPropGrab(rig, 6, 11);
      const start = prop.translation();
      const events: EventRecord[] = [];
      advance(rig, 0.5, grabBoth(), events);
      assert.equal(rig.body.holds.length, 2);
      assert.equal(rig.body.holds[0].target.handle, rig.body.holds[1].target.handle);
      assert.ok(rig.body.gripLoads[0] > 0 && rig.body.gripLoads[1] > 0);
      assert.ok(Math.abs(rig.body.gripLoads[0] - rig.body.gripLoads[1]) < 2.5);
      assert.equal(events.filter((event) => event.type === "grab").length, 2);
      const lift = grabBoth();
      lift.lhand.f = 0.45;
      lift.rhand.f = 0.45;
      advance(rig, 0.35, lift, events);
      const end = prop.translation();
      assert.equal(rig.body.fallen, false, "coordinated heavy lift must not topple the body");
      assert.equal(rig.body.holds.length, 2);
      assert.ok(end.y > start.y - 0.2, "coordinated hands must keep the heavy prop supported");
      assert.ok(Math.hypot(end.x - start.x, end.z - start.z) < 0.75, "coordinated lift must bound lateral drift");
    } finally {
      disposeRig(rig);
    }
  }

  // Shared Space may not weld the two hands to two unrelated objects.
  {
    const rig = createRig();
    try {
      settle(rig);
      const leftPos = rig.body.handPos(0, new THREE.Vector3());
      const rightPos = rig.body.handPos(1, new THREE.Vector3());
      const leftProp = rig.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(leftPos.x, leftPos.y, leftPos.z));
      const rightProp = rig.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(rightPos.x, rightPos.y, rightPos.z));
      rig.world.createCollider(RAPIER.ColliderDesc.ball(0.1).setMass(1).setCollisionGroups(groups(GROUP_PROP, 0xffff)), leftProp);
      rig.world.createCollider(RAPIER.ColliderDesc.ball(0.1).setMass(1).setCollisionGroups(groups(GROUP_PROP, 0xffff)), rightProp);
      rig.body.findGrab = (handPosition) => {
        const isLeft = handPosition.x < 0;
        const target = isLeft ? leftProp : rightProp;
        const t = target.translation();
        return { body: target, localAnchor: handPosition.clone().sub(new THREE.Vector3(t.x, t.y, t.z)), isStatic: false, mass: 1, id: isLeft ? 70 : 71 };
      };
      advance(rig, 0.2, grabBoth());
      assert.equal(rig.body.holds.length, 0);
    } finally {
      disposeRig(rig);
    }
  }

  // Opposed hand motion must create strain and eventually slip/drop or produce
  // a clearly moving/rotating prop; it must not be averaged away.
  {
    const rig = createRig();
    try {
      settle(rig);
      const prop = installPropGrab(rig, 1.1, 12);
      advance(rig, 0.35, grabBoth());
      assert.equal(rig.body.holds.length, 2);
      const before = prop.translation();
      const inputs = grabBoth();
      inputs.lhand.f = 1;
      inputs.rhand.f = -1;
      inputs.lhand.s = 1;
      inputs.rhand.s = -1;
      const events: EventRecord[] = [];
      advance(rig, 1.25, inputs, events);
      const after = prop.translation();
      const velocity = prop.linvel();
      const angular = prop.angvel();
      const lateralMotion = Math.hypot(after.x - before.x, after.z - before.z);
      const slipped = events.some((event) => event.type === "slip" || event.type === "drop");
      const asymmetric = lateralMotion > 0.12 || Math.hypot(velocity.x, 0, velocity.z) > 0.8 || Math.hypot(angular.x, angular.y, angular.z) > 0.6;
      assert.equal(rig.body.fallen, false, "hand disagreement must be measured before a generic body fall");
      assert.ok(slipped || rig.body.holds.length < 2 || asymmetric, "opposed hands must slip, drop, or move the prop");
    } finally {
      disposeRig(rig);
    }
  }

  // A one-hand 6 kg or 12 kg load exceeds the configured grip capacity and
  // must not remain welded to the hand indefinitely.
  for (const mass of [6, 12]) {
    const rig = createRig();
    try {
      settle(rig);
      installPropGrab(rig, mass, 20 + mass);
      const inputs = makeInputs();
      inputs.lhand.q = true;
      const events: EventRecord[] = [];
      advance(rig, 0.75, inputs, events);
      const released = rig.body.holds.length === 0 || events.some((event) => event.type === "slip" || event.type === "drop");
      assert.ok(released, `${mass} kg one-hand load must release`);
      const grabsAtFailure = events.filter((event) => event.type === "grab").length;
      advance(rig, 0.4, inputs, events);
      assert.equal(rig.body.holds.length, 0, `${mass} kg load must not auto-regrab while Q remains held`);
      assert.equal(events.filter((event) => event.type === "grab").length, grabsAtFailure);
    } finally {
      disposeRig(rig);
    }
  }

  // Repeated simultaneous leg commands with a neutral torso remove support and
  // should eventually trigger the no-support/capture-point fall path.
  {
    const rig = createRig();
    try {
      settle(rig);
      const events: EventRecord[] = [];
      const inputs = makeInputs();
      let lostBothSupports = false;
      for (let cycle = 0; cycle < 5 && !rig.body.fallen; cycle++) {
        inputs.lleg.f = 1;
        inputs.rleg.f = 1;
        advance(rig, 0.3, inputs, events);
        lostBothSupports ||= rig.body.supportFeet.every((supported) => !supported);
        inputs.lleg.f = 0;
        inputs.rleg.f = 0;
        advance(rig, 0.3, inputs, events);
      }
      assert.equal(rig.body.fallen, true);
      assert.equal(lostBothSupports, true);
      const fall = events.find((event) => event.type === "fall");
      assert.equal(fall?.reason ?? rig.body.fallReason, "no-foot-support");
    } finally {
      disposeRig(rig);
    }
  }

  // The same braced gait must remain valid after a ninety-degree turn; balance
  // correction is expressed in the character's local frame, not world X/Z.
  {
    const rig = createRig();
    try {
      settle(rig);
      const inputs = makeInputs();
      inputs.torso.a = true;
      inputs.head.lx = Math.PI / 2;
      advance(rig, 1.2, inputs);
      const start = rig.body.pelvisPos(new THREE.Vector3()).clone();
      const period = 0.42;
      for (let i = 0; i < Math.round(4 / DT); i++) {
        const phase = ((i * DT) % (period * 2)) / period;
        const active = phase < 1 ? 0 : 1;
        const pressed = (phase % 1) < 0.6;
        inputs.lleg.f = active === 0 && pressed ? 1 : 0;
        inputs.rleg.f = active === 1 && pressed ? 1 : 0;
        rig.reactor.advance(DT, inputs);
      }
      const end = rig.body.pelvisPos(new THREE.Vector3());
      assert.equal(rig.body.fallen, false, `turned gait fell: ${rig.body.fallReason}, margin=${rig.body.stabilityMargin}`);
      assert.ok(Math.abs(end.x - start.x) > 0.25, "turned coordinated gait should travel along world X");
    } finally {
      disposeRig(rig);
    }
  }

  // A coordinated alternating gait with a torso brace should travel without
  // requiring an exact trajectory.
  {
    const rig = createRig();
    try {
      settle(rig);
      const inputs = makeInputs();
      inputs.torso.a = true;
      const start = rig.body.pelvisPos(new THREE.Vector3()).clone();
      const period = 0.42;
      const steps = Math.round(6 / DT);
      for (let i = 0; i < steps; i++) {
        const t = i * DT;
        const phase = (t % (period * 2)) / period;
        const active = phase < 1 ? 0 : 1;
        const pressed = (phase % 1) < 0.6;
        inputs.lleg.f = active === 0 && pressed ? 1 : 0;
        inputs.rleg.f = active === 1 && pressed ? 1 : 0;
        rig.reactor.advance(DT, inputs);
      }
      const end = rig.body.pelvisPos(new THREE.Vector3());
      assert.equal(rig.body.fallen, false);
      assert.ok(Number.isFinite(end.z));
      assert.ok(end.distanceTo(start) > 0.35, "coordinated gait should travel");
    } finally {
      disposeRig(rig);
    }
  }

  // Capture/restore must round-trip state, and malformed snapshots must be
  // rejected before any part/controller mutation occurs.
  {
    const rig = createRig();
    try {
      settle(rig);
      const inputs = makeInputs();
      inputs.lhand.f = 0.4;
      inputs.rhand.s = -0.3;
      advance(rig, 0.4, inputs);
      installPropGrab(rig, 1.1, 40);
      advance(rig, 0.35, grabBoth());
      assert.equal(rig.body.holds.length, 2);
      const checkpoint = rig.reactor.capture();
      const expected = rig.reactor.capture();
      rig.body.releaseAll(false);
      advance(rig, 0.2, makeInputs());
      assert.equal(rig.reactor.restore(checkpoint), true);
      const restored = rig.reactor.capture();
      assert.equal(restored.tick, expected.tick);
      assert.ok(snapshotMaxDifference(restored, expected) < 1e-5);
      assert.equal(restored.grips.length, expected.grips.length);
      assert.equal(rig.body.holds.length, expected.grips.length);

      const replayInputs = grabBoth();
      replayInputs.lhand.f = 0.25;
      replayInputs.rhand.f = 0.25;
      const firstEvents: EventRecord[] = [];
      advance(rig, 0.3, replayInputs, firstEvents);
      const firstFuture = rig.reactor.capture();
      assert.equal(rig.reactor.restore(checkpoint), true);
      const secondEvents: EventRecord[] = [];
      advance(rig, 0.3, replayInputs, secondEvents);
      const secondFuture = rig.reactor.capture();
      const replayDifference = snapshotMaxDifference(firstFuture, secondFuture);
      assert.ok(replayDifference < 1e-4, `restored input replay must remain deterministic (${replayDifference})`);
      assert.deepEqual(firstEvents.map((event) => event.type), secondEvents.map((event) => event.type));
      assert.deepEqual(firstFuture.controller.gripStates, secondFuture.controller.gripStates);

      const malformed = { ...checkpoint, tick: Number.NaN } as unknown as PhysicsReactorSnapshot;
      const before = rig.reactor.capture();
      assert.equal(rig.reactor.restore(malformed), false);
      const after = rig.reactor.capture();
      assert.equal(after.tick, before.tick);
      assert.ok(snapshotMaxDifference(after, before) < 1e-12);
    } finally {
      disposeRig(rig);
    }
  }

  // Compact network continuations omit world-local Rapier handles. A new host
  // remaps the stable prop ID into its rebuilt world before restoring grips.
  {
    const source = createRig();
    const destination = createRig();
    try {
      settle(source);
      settle(destination);
      installPropGrab(source, 1.1, 60);
      advance(source, 0.35, grabBoth());
      const full = source.reactor.capture();
      const compact = source.reactor.capture(false);
      assert.equal(compact.parts.length, 0);
      assert.ok(compact.grips.every((grip) => grip.targetHandle === undefined));
      assert.ok(JSON.stringify(compact).length < 12_000);

      const destinationProp = installPropGrab(destination, 1.1, 60);
      const propState = full.grips[0].targetState!;
      destinationProp.setTranslation({ x: propState.translation[0], y: propState.translation[1], z: propState.translation[2] }, true);
      destinationProp.setRotation({ x: propState.rotation[0], y: propState.rotation[1], z: propState.rotation[2], w: propState.rotation[3] }, true);
      destinationProp.setLinvel({ x: propState.linearVelocity[0], y: propState.linearVelocity[1], z: propState.linearVelocity[2] }, true);
      destinationProp.setAngvel({ x: propState.angularVelocity[0], y: propState.angularVelocity[1], z: propState.angularVelocity[2] }, true);
      replaceReactor(destination, (grip) => grip.id === 60 ? destinationProp.handle : undefined);
      const takeover = { ...compact, parts: full.parts } as PhysicsReactorSnapshot;
      assert.equal(destination.reactor.restore(takeover), true);
      assert.equal(destination.body.holds.length, 2);
      assert.ok(destination.body.holds.every((hold) => hold.target.handle === destinationProp.handle));
    } finally {
      disposeRig(source);
      disposeRig(destination);
    }
  }

  // Stable level IDs also remap static ledges, so a host migration while
  // hanging does not silently release both hands.
  {
    const source = createRig();
    const destination = createRig();
    try {
      settle(source);
      settle(destination);
      installStaticGrab(source, -7);
      advance(source, 0.15, grabBoth());
      assert.equal(source.body.holds.length, 2);
      const full = source.reactor.capture();
      const compact = source.reactor.capture(false);
      const destinationLedge = installStaticGrab(destination, -7);
      replaceReactor(destination, (grip) => grip.id === -7 ? destinationLedge.handle : undefined);
      assert.equal(destination.reactor.restore({ ...compact, parts: full.parts }), true);
      assert.equal(destination.body.holds.length, 2);
      assert.ok(destination.body.holds.every((hold) => hold.isStatic && hold.target.handle === destinationLedge.handle));
    } finally {
      disposeRig(source);
      disposeRig(destination);
    }
  }

  console.log("physics reactor deterministic checks passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
