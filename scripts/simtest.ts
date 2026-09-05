import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { RagdollBody, groups, GROUP_ENV, PELVIS } from "../src/game/body";

async function main() {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const dt = 1 / 120;
  world.timestep = dt;
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(50, 0.5, 50).setCollisionGroups(groups(GROUP_ENV, 0xffff)).setFriction(0.9), ground);
  // hurdle
  const hurdle = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0.175, -6));
  world.createCollider(RAPIER.ColliderDesc.cuboid(3, 0.175, 0.15).setCollisionGroups(groups(GROUP_ENV, 0xffff)), hurdle);

  const body = new RagdollBody(RAPIER, world, new THREE.Vector3(0, 0, 0), 0);
  const report = (label: string) => {
    const p = body.pelvisPos();
    const q = body.quat(PELVIS);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const tilt = (Math.acos(Math.max(-1, Math.min(1, up.y))) * 180) / Math.PI;
    const h = body.pos(2);
    console.log(`${label.padEnd(28)} pelvis=(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) tilt=${tilt.toFixed(1)}° head.y=${h.y.toFixed(2)} fallen=${body.fallen} speed=${body.speed.toFixed(2)} gd=${body.groundDist.toFixed(2)}`);
  };
  const run = (seconds: number, fn?: (t: number) => void) => {
    const steps = Math.round(seconds / dt);
    for (let i = 0; i < steps; i++) {
      fn?.(i * dt);
      body.update(dt);
      world.step();
    }
  };
  report("spawn");
  run(3);
  report("idle 3s");
  // walk: alternate legs at 2.4 Hz
  const period = 0.42;
  let t0 = body.time;
  run(6, () => {
    const t = body.time - t0;
    const phase = (t % (period * 2)) / period;
    const leg = phase < 1 ? 0 : 1;
    const inPress = (phase % 1) < 0.6;
    body.inputs.lleg.f = leg === 0 && inPress ? 1 : 0;
    body.inputs.rleg.f = leg === 1 && inPress ? 1 : 0;
  });
  body.inputs.lleg.f = 0;
  body.inputs.rleg.f = 0;
  report("walk 6s (expect -z)");
  run(1.5);
  report("stop 1.5s");
  // turn heading 90deg and walk
  body.inputs.head.lx = Math.PI / 2;
  run(1.5);
  report("turned");
  t0 = body.time;
  run(3, () => {
    const t = body.time - t0;
    const phase = (t % (period * 2)) / period;
    const leg = phase < 1 ? 0 : 1;
    const inPress = (phase % 1) < 0.6;
    body.inputs.lleg.f = leg === 0 && inPress ? 1 : 0;
    body.inputs.rleg.f = leg === 1 && inPress ? 1 : 0;
  });
  body.inputs.lleg.f = 0;
  body.inputs.rleg.f = 0;
  report("walk -x 3s (expect -x)");
  // crouch
  body.inputs.torso.b = true;
  run(1.5);
  report("crouch");
  console.log("hand height crouched", body.handPos(0).y.toFixed(2));
  body.inputs.torso.b = false;
  // lean forward hard
  body.inputs.torso.f = 1;
  run(2);
  report("lean fwd 2s");
  body.inputs.torso.f = 0;
  run(1);
  // both legs lifted
  body.inputs.lleg.f = 1;
  body.inputs.rleg.f = 1;
  run(2.5);
  report("both legs up 2.5s");
  body.inputs.lleg.f = 0;
  body.inputs.rleg.f = 0;
  run(4);
  report("after release 4s");
  // knock over
  body.parts[0].setAngvel({ x: -9, y: 0, z: 0 }, true);
  body.parts[2].applyImpulse({ x: 0, y: 0, z: -body.totalMass * 3 }, true);
  run(1.5);
  report("after shove 1.5s");
  run(1.5);
  report("after shove 3s");
  body.inputs.torso.a = true;
  run(3);
  report("recover 3s");
  body.parts[0].setAngvel({ x: 0, y: 0, z: 9 }, true);
  run(1.0);
  report("side knock 1s");
  run(4.5);
  report("auto recover 5.5s");
  body.inputs.torso.a = false;
  // jump
  body.inputs.lleg.a = true;
  body.inputs.rleg.a = true;
  let maxY = 0;
  run(1.2, () => {
    maxY = Math.max(maxY, body.pelvisPos().y);
  });
  body.inputs.lleg.a = false;
  body.inputs.rleg.a = false;
  console.log("jump maxY", maxY.toFixed(2));
  run(1);
  report("after jump");
  // hurdle walk: teleport to z=-4 heading 0 and walk 5s
  body.teleport(new THREE.Vector3(0, 0, -4), 0);
  run(1);
  t0 = body.time;
  run(5, () => {
    const t = body.time - t0;
    const phase = (t % (period * 2)) / period;
    const leg = phase < 1 ? 0 : 1;
    const inPress = (phase % 1) < 0.6;
    body.inputs.lleg.f = leg === 0 && inPress ? 1 : 0;
    body.inputs.rleg.f = leg === 1 && inPress ? 1 : 0;
  });
  body.inputs.lleg.f = 0;
  body.inputs.rleg.f = 0;
  report("hurdle walk (expect z<-6)");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
