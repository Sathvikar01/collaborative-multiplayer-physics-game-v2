import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { RagdollBody, groups, GROUP_ENV, GROUP_PROP } from "../src/game/body";
async function main() {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const dt = 1 / 120; world.timestep = dt;
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(50, 0.5, 50).setCollisionGroups(groups(GROUP_ENV, 0xffff)), ground);
  const ballBody = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(-0.45, 0.3, -0.8));
  world.createCollider(RAPIER.ColliderDesc.ball(0.3).setMass(1.1).setCollisionGroups(groups(GROUP_PROP, 0xffff)), ballBody);
  const body = new RagdollBody(RAPIER, world, new THREE.Vector3(0, 0, 0), 0);
  body.findGrab = (hp) => {
    const t = ballBody.translation();
    const d = Math.hypot(t.x - hp.x, t.y - hp.y, t.z - hp.z) - 0.3;
    if (d < 0.24) {
      const r = ballBody.rotation(); const q = new THREE.Quaternion(r.x, r.y, r.z, r.w).invert();
      const local = hp.clone().sub(new THREE.Vector3(t.x, t.y, t.z)).applyQuaternion(q); if (local.length() > 0.3) local.setLength(0.29);
      return { body: ballBody, localAnchor: local, isStatic: false, mass: 1.1, id: 0 };
    }
    return null;
  };
  const run = (sec: number) => { const n = Math.round(sec / dt); for (let i = 0; i < n; i++) { body.update(dt); world.step(); } };
  const rep = (l: string) => { const p = body.pelvisPos(); const b = ballBody.translation(); const v = ballBody.linvel(); console.log(l.padEnd(22), `pelvis=(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}) ball=(${b.x.toFixed(2)},${b.y.toFixed(2)},${b.z.toFixed(2)}) v=(${v.x.toFixed(1)},${v.y.toFixed(1)},${v.z.toFixed(1)}) holds=${body.holds.length} handL=${body.handPos(0).toArray().map(n=>n.toFixed(2))} fallen=${body.fallen}`); };
  run(1); rep("idle");
  body.inputs.lhand.f = 1; body.inputs.rhand.f = 1; run(0.12); body.inputs.lhand.f = 0; body.inputs.rhand.f = 0; body.inputs.torso.b = true; run(1.2); rep("crouch arms 0.3");
  body.inputs.lhand.q = true; run(0.5); rep("grab L");
  body.inputs.torso.b = false; run(1.0); rep("stand");
  body.inputs.lhand.f = 1; body.inputs.rhand.f = 1; run(0.5); body.inputs.lhand.f = 0; body.inputs.rhand.f = 0; run(0.5); rep("arms up w/ ball");
  body.inputs.lhand.b = true; body.inputs.rhand.b = true; run(0.02); body.inputs.lhand.b = false; body.inputs.rhand.b = false; rep("throw!");
  run(0.5); rep("0.5s later");
  run(1.5); rep("2s later");
}
main();
