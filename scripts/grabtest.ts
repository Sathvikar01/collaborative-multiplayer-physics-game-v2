import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { RagdollBody, groups, GROUP_ENV, GROUP_PROP, PELVIS, findStaticGrab } from "../src/game/body";
async function main() {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const dt = 1 / 120; world.timestep = dt;
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(50, 0.5, 50).setCollisionGroups(groups(GROUP_ENV, 0xffff)).setFriction(0.9), ground);
  // ball in front on the floor
  const ballBody = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0.3, -0.55));
  world.createCollider(RAPIER.ColliderDesc.ball(0.3).setMass(1.1).setCollisionGroups(groups(GROUP_PROP, 0xffff)), ballBody);
  // ledge wall at z=-3, top 1.3
  const WALL_H = Number(process.env.WALL_H ?? 1.3);
  const wall = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, WALL_H/2, -5));
  world.createCollider(RAPIER.ColliderDesc.cuboid(3, WALL_H/2, 3).setCollisionGroups(groups(GROUP_ENV, 0xffff)), wall);
  const body = new RagdollBody(RAPIER, world, new THREE.Vector3(0, 0, 0), 0);
  body.findGrab = (hp) => {
    const t = ballBody.translation();
    const d = Math.hypot(t.x - hp.x, t.y - hp.y, t.z - hp.z) - 0.3;
    if (d < 0.24) {
      const r = ballBody.rotation(); const q = new THREE.Quaternion(r.x, r.y, r.z, r.w).invert();
      const local = hp.clone().sub(new THREE.Vector3(t.x, t.y, t.z)).applyQuaternion(q); if (local.length() > 0.3) local.setLength(0.29);
      return { body: ballBody, localAnchor: local, isStatic: false, mass: 1.1, id: 0 };
    }
    return findStaticGrab(RAPIER, world, hp, body.heading, (h) => h !== undefined && world.getCollider(h)?.parent()?.handle === wall.handle);
    return null;
  };
  const run = (sec: number, fn?: (t: number) => void) => { const n = Math.round(sec / dt); for (let i = 0; i < n; i++) { fn?.(i * dt); body.update(dt); world.step(); } };
  const rep = (l: string) => { const p = body.pelvisPos(); const b = ballBody.translation(); console.log(l.padEnd(26), `pelvis=(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}) ball=(${b.x.toFixed(2)},${b.y.toFixed(2)},${b.z.toFixed(2)}) holds=${body.holds.length} hand=${body.handPos(0).y.toFixed(2)} fallen=${body.fallen} events=${body.events.map(e=>e.type).join(',')}`); };
  run(1); rep("idle");
  body.inputs.arms.f = 1; run(0.14); body.inputs.arms.f = 0; body.inputs.torso.b = true; run(1.0); rep("crouch, arms fwd");
  body.inputs.arms.a = true; run(0.5); rep("grab pressed");
  body.inputs.torso.b = false; body.inputs.arms.f = 1; run(1.0); body.inputs.arms.f = 0; run(1); rep("stand w/ ball, arms up");
  // walk with ball
  const period = 0.42; let t0 = body.time;
  run(2, () => { const t = body.time - t0; const ph = (t % (period * 2)) / period; const leg = ph < 1 ? 0 : 1; const pr = (ph % 1) < 0.6; body.inputs.lleg.f = leg === 0 && pr ? 1 : 0; body.inputs.rleg.f = leg === 1 && pr ? 1 : 0; });
  body.inputs.lleg.f = 0; body.inputs.rleg.f = 0; run(0.5); rep("walked w/ ball");
  body.inputs.arms.b = true; run(0.05); rep("throw"); body.inputs.arms.b = false; body.inputs.arms.a = false;
  const v = ballBody.linvel(); console.log("ball vel", v.x.toFixed(2), v.y.toFixed(2), v.z.toFixed(2));
  run(1.5); rep("after throw");
  // climbing: walk to wall at z=-2 (wall front face at z=-2)
  // scramble test: walk into wall for 3s
  body.teleport(new THREE.Vector3(0, 0, -0.8), 0); run(0.5);
  { const period = 0.42; const t1 = body.time; run(3, () => { const t = body.time - t1; const ph = (t % (period * 2)) / period; const leg = ph < 1 ? 0 : 1; const pr = (ph % 1) < 0.6; body.inputs.lleg.f = leg === 0 && pr ? 1 : 0; body.inputs.rleg.f = leg === 1 && pr ? 1 : 0; }); body.inputs.lleg.f = 0; body.inputs.rleg.f = 0; run(1); rep("scramble (want y~1.03)"); }
  body.teleport(new THREE.Vector3(0, 0, Number(process.env.APPROACH ?? -1.3)), 0); run(0.5);
  body.inputs.arms.f = 1; run(Number(process.env.RAISE ?? 0.4)); body.inputs.arms.f = 0; run(0.6); rep("arms up at wall");
  console.log("hand pos", body.handPos(0).toArray().map(n=>n.toFixed(2)).join(','), "wall top 1.3, wall front z=-2");
  body.inputs.arms.a = true; run(0.3); rep("grab ledge");
  body.inputs.arms.f = -1; run(1.0); rep("pull up 1.0s"); run(1.0); rep("pull up 2.0s");
  body.inputs.lleg.f = 1; run(0.4); body.inputs.lleg.f = 0; body.inputs.rleg.f = 1; run(0.4); body.inputs.rleg.f = 0; rep("stepping");
  body.inputs.torso.f = 1; run(1.0); rep("lean fwd"); run(1.5); rep("more");
  body.inputs.arms.a = false; body.inputs.arms.f = 0; body.inputs.torso.f = 0; run(1.5); rep("released (on top? y~2.3)");
}
main();
