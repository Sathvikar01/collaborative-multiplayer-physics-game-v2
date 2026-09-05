import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { RagdollBody, groups, GROUP_ENV } from "../src/game/body";
import { getLevel } from "../src/game/levels";
async function main() {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const dt = 1 / 120; world.timestep = dt;
  const L = getLevel(process.env.LEVEL ?? "wobble-run");
  for (const s of L.statics) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(s.rot?.[0] ?? 0, s.rot?.[1] ?? 0, s.rot?.[2] ?? 0));
    const rb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...s.pos).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
    world.createCollider(RAPIER.ColliderDesc.cuboid(s.size[0] / 2, s.size[1] / 2, s.size[2] / 2).setFriction(0.9).setCollisionGroups(groups(GROUP_ENV, 0xffff)), rb);
  }
  const body = new RagdollBody(RAPIER, world, new THREE.Vector3(...L.spawn), L.spawnYaw);
  const period = 0.42; let t0 = 0;
  const walk = (sec: number) => { const n = Math.round(sec / dt); for (let i = 0; i < n; i++) { const t = body.time - t0; const ph = (t % (period * 2)) / period; const leg = ph < 1 ? 0 : 1; const pr = (ph % 1) < 0.6; body.inputs.lleg.f = leg === 0 && pr ? 1 : 0; body.inputs.rleg.f = leg === 1 && pr ? 1 : 0; body.update(dt); world.step(); if (body.pelvisPos().y < L.killY) { console.log("  FELL in water at z=", body.pelvisPos().z.toFixed(1)); return false; } } return true; };
  const rep = (l: string) => { const p = body.pelvisPos(); console.log(l.padEnd(10), `pelvis=(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}) fallen=${body.fallen} gd=${body.groundDist.toFixed(2)}`); };
  for (let s = 0; s < 8; s++) { if (!walk(3)) break; rep(`t=${(s+1)*3}s`); }
}
main();
