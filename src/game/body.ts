import * as THREE from "three";
import type RAPIER_T from "@dimforge/rapier3d-compat";
import { PHYS_ROLES, emptyInput, type PhysRole, type RoleInput } from "./types";

type R = typeof RAPIER_T;
type World = RAPIER_T.World;
type RigidBody = RAPIER_T.RigidBody;

export type BodyInputs = Record<PhysRole, RoleInput>;
/** The squad mixer expands external roles into these six physical channels. */
export const makeInputs = (): BodyInputs => ({
  head: emptyInput(),
  lhand: emptyInput(),
  rhand: emptyInput(),
  torso: emptyInput(),
  lleg: emptyInput(),
  rleg: emptyInput(),
});

type ReactorInputs = BodyInputs & { lhand: RoleInput; rhand: RoleInput; arms?: RoleInput };

export const GROUP_ENV = 0b001;
export const GROUP_BODY = 0b010;
export const GROUP_PROP = 0b100;
export const groups = (mem: number, filt: number) => (((mem & 0xffff) << 16) | (filt & 0xffff)) >>> 0;

export const PELVIS = 0, CHEST = 1, HEAD = 2, LUA = 3, LFA = 4, RUA = 5, RFA = 6, LTH = 7, LSH = 8, RTH = 9, RSH = 10;
export const PART_COUNT = 11;

export interface PartSpec {
  name: string;
  parent: number;
  shape: "capsule" | "box" | "ball";
  size: [number, number, number]; // capsule: [halfHeight, radius]; box: half extents; ball: [radius]
  pos: [number, number, number]; // rest position (standing, pelvis at y=1)
  anchorParent: [number, number, number];
  anchorSelf: [number, number, number];
  mass: number;
  kp: number;
  kd: number;
  maxT: number;
  inertia: number;
  extra?: { shape: "box" | "ball"; size: [number, number, number]; offset: [number, number, number] }[];
}

const PELVIS_H = 1.0;
export const PARTS: PartSpec[] = [
  { name: "pelvis", parent: -1, shape: "box", size: [0.17, 0.1, 0.11], pos: [0, PELVIS_H, 0], anchorParent: [0, 0, 0], anchorSelf: [0, 0, 0], mass: 9, kp: 0, kd: 0, inertia: 0.7, maxT: 0 },
  { name: "chest", parent: PELVIS, shape: "box", size: [0.2, 0.22, 0.12], pos: [0, PELVIS_H + 0.37, 0], anchorParent: [0, 0.15, 0], anchorSelf: [0, -0.22, 0], mass: 11, kp: 260, kd: 22, inertia: 0.3, maxT: 260 },
  { name: "head", parent: CHEST, shape: "ball", size: [0.2, 0, 0], pos: [0, PELVIS_H + 0.84, 0], anchorParent: [0, 0.27, 0], anchorSelf: [0, -0.2, 0], mass: 2.2, kp: 18, kd: 2.2, inertia: 0.05, maxT: 30 },
  { name: "lUpperArm", parent: CHEST, shape: "capsule", size: [0.13, 0.06, 0], pos: [-0.28, PELVIS_H + 0.34, 0], anchorParent: [-0.28, 0.16, 0], anchorSelf: [0, 0.19, 0], mass: 1.5, kp: 46, kd: 3.4, inertia: 0.035, maxT: 60 },
  { name: "lForearm", parent: LUA, shape: "capsule", size: [0.12, 0.055, 0], pos: [-0.28, PELVIS_H - 0.02, 0], anchorParent: [0, -0.19, 0], anchorSelf: [0, 0.17, 0], mass: 1.2, kp: 24, kd: 2.0, inertia: 0.03, maxT: 32, extra: [{ shape: "ball", size: [0.075, 0, 0], offset: [0, -0.2, 0] }] },
  { name: "rUpperArm", parent: CHEST, shape: "capsule", size: [0.13, 0.06, 0], pos: [0.28, PELVIS_H + 0.34, 0], anchorParent: [0.28, 0.16, 0], anchorSelf: [0, 0.19, 0], mass: 1.5, kp: 46, kd: 3.4, inertia: 0.035, maxT: 60 },
  { name: "rForearm", parent: RUA, shape: "capsule", size: [0.12, 0.055, 0], pos: [0.28, PELVIS_H - 0.02, 0], anchorParent: [0, -0.19, 0], anchorSelf: [0, 0.17, 0], mass: 1.2, kp: 24, kd: 2.0, inertia: 0.03, maxT: 32, extra: [{ shape: "ball", size: [0.075, 0, 0], offset: [0, -0.2, 0] }] },
  { name: "lThigh", parent: PELVIS, shape: "capsule", size: [0.14, 0.08, 0], pos: [-0.1, PELVIS_H - 0.3, 0], anchorParent: [-0.1, -0.08, 0], anchorSelf: [0, 0.22, 0], mass: 4.5, kp: 70, kd: 6, inertia: 0.09, maxT: 110 },
  { name: "lShin", parent: LTH, shape: "capsule", size: [0.14, 0.07, 0], pos: [-0.1, PELVIS_H - 0.73, 0], anchorParent: [0, -0.22, 0], anchorSelf: [0, 0.21, 0], mass: 3, kp: 48, kd: 4.2, inertia: 0.07, maxT: 70, extra: [{ shape: "box", size: [0.06, 0.03, 0.11], offset: [0, -0.24, -0.04] }] },
  { name: "rThigh", parent: PELVIS, shape: "capsule", size: [0.14, 0.08, 0], pos: [0.1, PELVIS_H - 0.3, 0], anchorParent: [0.1, -0.08, 0], anchorSelf: [0, 0.22, 0], mass: 4.5, kp: 70, kd: 6, inertia: 0.09, maxT: 110 },
  { name: "rShin", parent: RTH, shape: "capsule", size: [0.14, 0.07, 0], pos: [0.1, PELVIS_H - 0.73, 0], anchorParent: [0, -0.22, 0], anchorSelf: [0, 0.21, 0], mass: 3, kp: 48, kd: 4.2, inertia: 0.07, maxT: 70, extra: [{ shape: "box", size: [0.06, 0.03, 0.11], offset: [0, -0.24, -0.04] }] },
];

export const HAND_LOCAL = new THREE.Vector3(0, -0.22, 0);
export const FOOT_LOCAL = new THREE.Vector3(0, -0.26, -0.04);

export interface GrabTarget {
  body: RigidBody;
  localAnchor: THREE.Vector3;
  isStatic: boolean;
  mass: number;
  id: number;
  snapFrom?: THREE.Vector3; // start anchor (local) to slide from, for smooth ledge snapping
}

export interface BodyEvent {
  type: "step" | "land" | "grab" | "release" | "throw" | "fall" | "getup" | "jump" | "kick" | "shout" | "climb" | "slip" | "drop";
  pos: [number, number, number];
  hand?: number;
  propId?: number;
  reason?: string;
}

export interface Hold {
  hand: 0 | 1;
  joint: RAPIER_T.ImpulseJoint;
  target: RigidBody;
  isStatic: boolean;
  mass: number;
  id: number;
  localAnchor?: THREE.Vector3;
  snapFrom?: THREE.Vector3;
  snapTo?: THREE.Vector3;
  snapT: number;
  load?: number;
  stress?: number;
  slipT?: number;
  slipping?: boolean;
}

interface LegState {
  lifted: boolean;
  t: number;
  dir: THREE.Vector2;
  kickT: number;
  lastPressed: number;
  wasDown: boolean;
  pressTime: number;
}

export interface GripDiagnostic {
  hand: 0 | 1;
  propId: number;
  load: number;
  stress: number;
  slipping: boolean;
}

const _qP = new THREE.Quaternion();
const _qC = new THREE.Quaternion();
const _qT = new THREE.Quaternion();
const _qE = new THREE.Quaternion();
const _qInv = new THREE.Quaternion();
const _qL = new THREE.Quaternion();
const _err = new THREE.Vector3();
const _torque = new THREE.Vector3();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

function angleWrap(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class RagdollBody {
  parts: RigidBody[] = [];
  articulationJoints: RAPIER_T.ImpulseJoint[] = [];
  colliderHandles = new Set<number>();
  inputs: BodyInputs = makeInputs();
  prev: BodyInputs = makeInputs();
  heading = 0;
  headPitch = 0;
  pelvisYaw = 0;
  armRaise = 0.1;
  armYaw = 0;
  /** Per-hand targets are intentionally public for renderers/replays. */
  armRaiseSide: [number, number] = [0.1, 0.1];
  armYawSide: [number, number] = [0, 0];
  throwT = 0;
  crouch = 0;
  brace = 0;
  braceStamina = 1;
  legs: LegState[] = [
    { lifted: false, t: 9, dir: new THREE.Vector2(), kickT: 0, lastPressed: -9, wasDown: false, pressTime: -9 },
    { lifted: false, t: 9, dir: new THREE.Vector2(), kickT: 0, lastPressed: -9, wasDown: false, pressTime: -9 },
  ];
  lastStrideLeg = -1;
  fallen = false;
  fallT = 0;
  recoverT = 0;
  balance = 1;
  grounded = true;
  groundDist = 1;
  airT = 0;
  jumpCooldown = 0;
  holds: Hold[] = [];
  frozen = false;
  time = 0;
  totalMass = 0;
  events: BodyEvent[] = [];
  shoutCooldown = 0;
  speed = 0;
  hangT = 0;
  grabLock = 0;
  findGrab: ((handPos: THREE.Vector3, excludeIds: number[]) => GrabTarget | null) | null = null;
  footColliderHandles: [Set<number>, Set<number>] = [new Set(), new Set()];
  supportFeet: [boolean, boolean] = [false, false];
  supportPoints: [THREE.Vector3 | null, THREE.Vector3 | null] = [null, null];
  centerOfMass = new THREE.Vector3();
  centerOfMassVelocity = new THREE.Vector3();
  capturePoint = new THREE.Vector3();
  stabilityMargin = -1;
  gripLoads: [number, number] = [0, 0];
  gripStress: [number, number] = [0, 0];
  gripStates: ["clear" | "slipping", "clear" | "slipping"] = ["clear", "clear"];
  gripBlocked: [boolean, boolean] = [false, false];
  fallReason: string | null = null;
  private unsupportedT = 0;
  private unstableT = 0;
  private previousCom = new THREE.Vector3();
  private previousComReady = false;
  private heldTargetVelocity = new Map<number, THREE.Vector3>();
  private skipSupportSampleOnce = false;

  /** Compatibility aliases consumed by the fixed-step reactor diagnostics. */
  get centreOfMass() {
    return this.centerOfMass;
  }
  get supportContacts() {
    return this.supportFeet.filter(Boolean).length;
  }
  get gripLoad() {
    return Math.max(this.gripLoads[0], this.gripLoads[1]);
  }

  constructor(public R: R, public world: World, spawn: THREE.Vector3, yaw: number) {
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    for (let i = 0; i < PARTS.length; i++) {
      const p = PARTS[i];
      const local = new THREE.Vector3(p.pos[0], p.pos[1] - PELVIS_H, p.pos[2]).applyQuaternion(q);
      const pos = local.add(spawn).add(new THREE.Vector3(0, PELVIS_H, 0));
      const desc = R.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinearDamping(i === PELVIS ? 0.2 : 0.4)
        .setAngularDamping(i === PELVIS ? 3 : 2)
        .setAdditionalMassProperties(0, { x: 0, y: 0, z: 0 }, { x: p.inertia, y: p.inertia, z: p.inertia }, { x: 0, y: 0, z: 0, w: 1 })
        .setCcdEnabled(true);
      const rb = world.createRigidBody(desc);
      let cd: RAPIER_T.ColliderDesc;
      if (p.shape === "capsule") cd = R.ColliderDesc.capsule(p.size[0], p.size[1]);
      else if (p.shape === "box") cd = R.ColliderDesc.cuboid(p.size[0], p.size[1], p.size[2]);
      else cd = R.ColliderDesc.ball(p.size[0]);
      cd.setMass(p.mass).setFriction(i === LSH || i === RSH ? 0.7 : 0.25).setRestitution(0.05).setCollisionGroups(groups(GROUP_BODY, GROUP_ENV | GROUP_PROP));
      cd.setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(450);
      const col = world.createCollider(cd, rb);
      this.colliderHandles.add(col.handle);
      if (i === LSH) this.footColliderHandles[0].add(col.handle);
      else if (i === RSH) this.footColliderHandles[1].add(col.handle);
      if (p.extra) {
        for (const ex of p.extra) {
          const ecd = ex.shape === "ball" ? R.ColliderDesc.ball(ex.size[0]) : R.ColliderDesc.cuboid(ex.size[0], ex.size[1], ex.size[2]);
          ecd.setTranslation(ex.offset[0], ex.offset[1], ex.offset[2]).setMass(0.3).setFriction(ex.shape === "ball" ? 0.4 : 0.9).setCollisionGroups(groups(GROUP_BODY, GROUP_ENV | GROUP_PROP));
          const ec = world.createCollider(ecd, rb);
          this.colliderHandles.add(ec.handle);
          if (i === LSH) this.footColliderHandles[0].add(ec.handle);
          else if (i === RSH) this.footColliderHandles[1].add(ec.handle);
        }
      }
      this.parts.push(rb);
      this.totalMass += p.mass + (p.extra?.length ?? 0) * 0.3;
    }
    this.createArticulationJoints();
    this.heading = yaw;
    this.pelvisYaw = yaw;
    this.inputs.head.lx = yaw;
    this.centerOfMass.copy(spawn).add(new THREE.Vector3(0, PELVIS_H + 0.2, 0));
    this.previousCom.copy(this.centerOfMass);
    this.previousComReady = true;
  }

  private createArticulationJoints() {
    const R = this.R;
    for (let i = 1; i < PARTS.length; i++) {
      const p = PARTS[i];
      const parentAnchor = { x: p.anchorParent[0], y: p.anchorParent[1], z: p.anchorParent[2] };
      const childAnchor = { x: p.anchorSelf[0], y: p.anchorSelf[1], z: p.anchorSelf[2] };
      if (i === LFA || i === RFA || i === LSH || i === RSH) {
        // Elbows and knees are hinge joints, not unrestricted ball sockets.
        // The active controller still supplies muscle torque, while Rapier
        // enforces the anatomical range under impacts and carried loads.
        const joint = this.world.createImpulseJoint(
          R.JointData.revolute(parentAnchor, childAnchor, { x: 1, y: 0, z: 0 }),
          this.parts[p.parent],
          this.parts[i],
          true
        ) as RAPIER_T.RevoluteImpulseJoint;
        joint.setLimits(i === LFA || i === RFA ? -0.08 : -2.35, i === LFA || i === RFA ? 1.9 : 0.08);
        this.articulationJoints.push(joint);
      } else {
        const jd = R.JointData.spherical(parentAnchor, childAnchor);
        this.articulationJoints.push(this.world.createImpulseJoint(jd, this.parts[p.parent], this.parts[i], true));
      }
    }
  }

  /** Reset solver warm-start state after a checkpoint restore. */
  rebuildArticulationJoints() {
    for (const joint of this.articulationJoints) if (joint.isValid()) this.world.removeImpulseJoint(joint, true);
    this.articulationJoints = [];
    this.createArticulationJoints();
  }

  dispose() {
    this.releaseAll(false);
    for (const p of this.parts) this.world.removeRigidBody(p);
    this.parts = [];
    this.articulationJoints = [];
  }

  pos(i: number, out = new THREE.Vector3()) {
    const t = this.parts[i].translation();
    return out.set(t.x, t.y, t.z);
  }
  quat(i: number, out = new THREE.Quaternion()) {
    const r = this.parts[i].rotation();
    return out.set(r.x, r.y, r.z, r.w);
  }
  handPos(hand: 0 | 1, out = new THREE.Vector3()) {
    const i = hand === 0 ? LFA : RFA;
    return out.copy(HAND_LOCAL).applyQuaternion(this.quat(i, _qC)).add(this.pos(i, _v2));
  }
  footPos(leg: 0 | 1, out = new THREE.Vector3()) {
    const i = leg === 0 ? LSH : RSH;
    return out.copy(FOOT_LOCAL).applyQuaternion(this.quat(i, _qC)).add(this.pos(i, _v2));
  }
  pelvisPos(out = new THREE.Vector3()) {
    return this.pos(PELVIS, out);
  }

  teleport(spawn: THREE.Vector3, yaw: number) {
    this.releaseAll(false);
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    for (let i = 0; i < PARTS.length; i++) {
      const p = PARTS[i];
      const local = new THREE.Vector3(p.pos[0], p.pos[1] - PELVIS_H, p.pos[2]).applyQuaternion(q);
      const pos = local.add(spawn).add(new THREE.Vector3(0, PELVIS_H, 0));
      const rb = this.parts[i];
      rb.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
      rb.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    this.rebuildArticulationJoints();
    this.heading = yaw;
    this.pelvisYaw = yaw;
    this.headPitch = 0;
    this.inputs.head.lx = yaw;
    this.inputs.head.ly = 0;
    this.fallen = false;
    this.fallReason = null;
    this.balance = 1;
    this.recoverT = 0;
    this.fallT = 0;
    this.armRaise = 0.1;
    this.armRaiseSide = [0.1, 0.1];
    this.armYawSide = [0, 0];
    this.crouch = 0;
    for (const l of this.legs) {
      l.lifted = false;
      l.t = 9;
      l.kickT = 0;
    }
    this.supportFeet = [false, false];
    this.supportPoints = [null, null];
    this.gripBlocked = [false, false];
    this.unsupportedT = 0;
    this.unstableT = 0;
    this.previousComReady = false;
    this.heldTargetVelocity.clear();
    this.skipSupportSampleOnce = false;
  }

  private emit(type: BodyEvent["type"], p: THREE.Vector3, extra?: Partial<BodyEvent>) {
    this.events.push({ type, pos: [p.x, p.y, p.z], ...extra });
  }

  private drive(child: number, parent: number, localTarget: THREE.Quaternion, gain = 1) {
    const spec = PARTS[child];
    const c = this.parts[child];
    const p = this.parts[parent];
    const rp = p.rotation();
    const rc = c.rotation();
    _qP.set(rp.x, rp.y, rp.z, rp.w);
    _qC.set(rc.x, rc.y, rc.z, rc.w);
    _qT.copy(_qP).multiply(localTarget);
    _qInv.copy(_qC).invert();
    _qE.copy(_qT).multiply(_qInv);
    if (_qE.w < 0) _qE.set(-_qE.x, -_qE.y, -_qE.z, -_qE.w);
    const w = clamp(_qE.w, -1, 1);
    const ang = 2 * Math.acos(w);
    const s = Math.sqrt(Math.max(0, 1 - w * w));
    if (s < 1e-5) _err.set(0, 0, 0);
    else _err.set(_qE.x / s, _qE.y / s, _qE.z / s).multiplyScalar(ang);
    const wc = c.angvel();
    const wp = p.angvel();
    const kp = spec.kp * gain;
    const kd = spec.kd * Math.min(1.15, Math.sqrt(Math.max(gain, 0.05)));
    _torque.set(kp * _err.x - kd * (wc.x - wp.x), kp * _err.y - kd * (wc.y - wp.y), kp * _err.z - kd * (wc.z - wp.z));
    const maxT = spec.maxT * Math.max(gain, 0.3);
    if (_torque.lengthSq() > maxT * maxT) _torque.setLength(maxT);
    c.addTorque({ x: _torque.x, y: _torque.y, z: _torque.z }, true);
    p.addTorque({ x: -_torque.x, y: -_torque.y, z: -_torque.z }, true);
  }

  /** Read last-step solver contacts. Support is contact-derived, never key-derived. */
  private sampleFootSupport() {
    this.supportFeet = [false, false];
    this.supportPoints = [null, null];
    const heldHandles = new Set(this.holds.map((hold) => hold.target.handle));
    for (let leg = 0; leg < 2; leg++) {
      let bestImpulse = -1;
      for (const handle of this.footColliderHandles[leg]) {
        let collider: RAPIER_T.Collider;
        try {
          collider = this.world.getCollider(handle);
        } catch {
          continue;
        }
        this.world.contactPairsWith(collider, (other) => {
          if (this.colliderHandles.has(other.handle)) return;
          const supportBody = other.parent();
          if (supportBody && heldHandles.has(supportBody.handle)) return;
          if (supportBody?.isDynamic()) {
            const velocity = supportBody.linvel();
            const angular = supportBody.angvel();
            if (Math.hypot(velocity.x, velocity.y, velocity.z) > 0.6 || Math.hypot(angular.x, angular.y, angular.z) > 1.5) return;
          }
          this.world.contactPair(collider, other, (manifold) => {
            const n = manifold.normal();
            let manifoldImpulse = 0;
            for (let i = 0; i < manifold.numContacts(); i++) manifoldImpulse += Math.abs(manifold.contactImpulse(i));
            // A foot must have a mostly vertical solver contact below it. This
            // rejects brushing a wall and makes a lifted leg genuinely unsupported.
            const foot = this.footPos(leg as 0 | 1, _v2);
            for (let i = 0; i < manifold.numSolverContacts(); i++) {
              const point = manifold.solverContactPoint(i);
              if (!point || point.y > foot.y + 0.12 || Math.abs(n.y) < 0.55) continue;
              if (manifoldImpulse >= bestImpulse) {
                bestImpulse = manifoldImpulse;
                this.supportFeet[leg as 0 | 1] = true;
                this.supportPoints[leg as 0 | 1] = new THREE.Vector3(point.x, point.y, point.z);
              }
            }
          });
        });
      }
    }
  }

  /** Seed one fixed step after an atomic reactor restore. */
  prepareAfterRestore() {
    this.supportPoints = [
      this.supportFeet[0] ? this.footPos(0, new THREE.Vector3()) : null,
      this.supportFeet[1] ? this.footPos(1, new THREE.Vector3()) : null,
    ];
    this.skipSupportSampleOnce = true;
  }

  private updateMassDiagnostics(dt: number) {
    const sum = new THREE.Vector3();
    let mass = 0;
    for (const rb of this.parts) {
      const m = rb.mass();
      const c = rb.worldCom();
      sum.addScaledVector(new THREE.Vector3(c.x, c.y, c.z), m);
      mass += m;
    }
    const seen = new Set<number>();
    for (const h of this.holds) {
      if (h.isStatic || seen.has(h.target.handle)) continue;
      seen.add(h.target.handle);
      const m = Math.max(0, h.target.mass());
      const c = h.target.worldCom();
      sum.addScaledVector(new THREE.Vector3(c.x, c.y, c.z), m);
      mass += m;
    }
    if (mass > 0) this.centerOfMass.copy(sum).multiplyScalar(1 / mass);
    if (this.previousComReady && dt > 0) this.centerOfMassVelocity.copy(this.centerOfMass).sub(this.previousCom).multiplyScalar(1 / dt);
    else this.centerOfMassVelocity.set(0, 0, 0);
    this.previousCom.copy(this.centerOfMass);
    this.previousComReady = true;

    const support = this.supportPoints.filter((p): p is THREE.Vector3 => p !== null);
    const supportY = support.length ? support.reduce((v, p) => v + p.y, 0) / support.length : this.centerOfMass.y - 0.8;
    const h = Math.max(0.25, this.centerOfMass.y - supportY);
    const omega = Math.sqrt(9.81 / h);
    this.capturePoint.copy(this.centerOfMass).addScaledVector(this.centerOfMassVelocity, 1 / omega);
    if (support.length === 0) {
      this.stabilityMargin = -1;
    } else if (support.length === 1) {
      this.stabilityMargin = 0.16 - Math.hypot(this.capturePoint.x - support[0].x, this.capturePoint.z - support[0].z);
    } else {
      const a = support[0], b = support[1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len2 = dx * dx + dz * dz;
      const u = len2 > 1e-6 ? clamp(((this.capturePoint.x - a.x) * dx + (this.capturePoint.z - a.z) * dz) / len2, 0, 1) : 0;
      const px = a.x + dx * u, pz = a.z + dz * u;
      // Two planted feet form a capsule-shaped approximation of the true
      // support polygon. Include the toe/heel depth, not merely the line
      // between ankle contact points.
      this.stabilityMargin = 0.28 - Math.hypot(this.capturePoint.x - px, this.capturePoint.z - pz);
    }
  }

  private updateGripDiagnostics(dt: number) {
    this.gripLoads = [0, 0];
    this.gripStress = [0, 0];
    this.gripStates = ["clear", "clear"];
    const groups = new Map<number, Hold[]>();
    for (const h of this.holds) {
      const list = groups.get(h.target.handle) ?? [];
      list.push(h);
      groups.set(h.target.handle, list);
    }
    for (const handle of this.heldTargetVelocity.keys()) if (!groups.has(handle)) this.heldTargetVelocity.delete(handle);
    for (const list of groups.values()) {
      const target = list[0].target;
      const targetMass = Math.max(0, list[0].mass || target.mass());
      const targetVel = target.linvel();
      const velocity = new THREE.Vector3(targetVel.x, targetVel.y, targetVel.z);
      const previousVelocity = this.heldTargetVelocity.get(target.handle);
      const acceleration = previousVelocity && dt > 0 ? velocity.clone().sub(previousVelocity).multiplyScalar(1 / dt).length() : 0;
      this.heldTargetVelocity.set(target.handle, velocity);
      const mismatch = list.length > 1
        ? Math.hypot(this.armRaiseSide[0] - this.armRaiseSide[1], this.armYawSide[0] - this.armYawSide[1])
        : 0;
      // Acceleration, not velocity, creates additional grip demand. Filter the
      // solver's single-tick contact spikes so resting jitter cannot drop an
      // otherwise well-coordinated load.
      const totalDemand = targetMass * 9.81 + targetMass * Math.min(5, acceleration * 0.15);
      for (const h of list) {
        const hand = this.handPos(h.hand, _v);
        const targetPos = h.target.translation();
        const targetRot = h.target.rotation();
        const anchorLocal = h.localAnchor ?? new THREE.Vector3();
        const anchor = new THREE.Vector3(anchorLocal.x, anchorLocal.y, anchorLocal.z)
          .applyQuaternion(_qT.set(targetRot.x, targetRot.y, targetRot.z, targetRot.w))
          .add(new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z));
        const error = Math.hypot(hand.x - anchor.x, hand.y - anchor.y, hand.z - anchor.z);
        const load = totalDemand / list.length + error * 140 + mismatch * 22;
        // A single hand can manage the light sports props, but the 4-6 kg
        // cargo requires two players to share its weight.  Static ledges get
        // a higher limit because both arms and the fingers can brace on them.
        const capacity = (h.isStatic ? 400 : 36) * (list.length > 1 ? 1.75 : 1) * (targetMass > 10 ? 0.72 : 1);
        const stress = load / Math.max(1, capacity);
        h.load = load;
        h.stress = stress;
        h.slipping = stress > 0.82;
        h.slipT = Math.max(0, (h.slipT ?? 0) + (stress > 0.82 ? dt * (stress - 0.7) : -dt * 1.5));
        this.gripLoads[h.hand] = load;
        this.gripStress[h.hand] = stress;
        this.gripStates[h.hand] = h.slipping ? "slipping" : "clear";
        if (h.slipping && h.slipT > 0.16) {
          const p = this.handPos(h.hand, new THREE.Vector3());
          this.emit("slip", p, { hand: h.hand, propId: h.id, reason: "grip-overload" });
          this.gripBlocked[h.hand] = true;
          this.release(h, false);
          this.emit("drop", p, { hand: h.hand, propId: h.id, reason: "grip-overload" });
        }
      }
    }
  }

  /** Called once per physics step (dt = step size). */
  update(dt: number) {
    const R = this.R;
    this.time += dt;
    this.events.length = 0;
    const inp = (this.frozen ? makeInputs() : this.inputs) as ReactorInputs;
    if (this.frozen) inp.head.lx = this.heading;
    for (const rb of this.parts) {
      rb.resetForces(true);
      rb.resetTorques(true);
    }
    // Manifolds describe the previous solver step, which is exactly the
    // stable support information available while applying this step's forces.
    if (this.skipSupportSampleOnce) this.skipSupportSampleOnce = false;
    else this.sampleFootSupport();

    // ---- Head / heading ----
    this.heading = inp.head.lx;
    this.headPitch = clamp(inp.head.ly, -0.9, 0.7);
    if (inp.head.a && !this.prev.head.a && this.shoutCooldown <= 0) {
      this.shoutCooldown = 1.2;
      this.emit("shout", this.pos(HEAD, _v));
    }
    this.shoutCooldown -= dt;

    // ---- Ground probe ----
    const pp = this.pelvisPos(_v);
    const ray = new R.Ray({ x: pp.x, y: pp.y, z: pp.z }, { x: 0, y: -1, z: 0 });
    const heldHandles = new Set(this.holds.map((h) => h.target.handle));
    const hit = this.world.castRay(ray, 3, false, undefined, groups(0xffff, GROUP_ENV | GROUP_PROP), undefined, undefined, (c) => {
      const parent = c.parent();
      return !parent || !heldHandles.has(parent.handle);
    });
    const mainDist = hit ? hit.timeOfImpact : 99;
    this.groundDist = mainDist;
    let mantling = false;
    if (this.holds.some((h) => h.isStatic)) {
      if (mainDist < 0.75) {
        // we made it over the ledge: let go so the hover can finish standing up
        for (const h of [...this.holds]) if (h.isStatic) this.release(h, false);
        this.emit("climb", pp);
      } else {
        const fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
        const probe = new R.Ray({ x: pp.x + fx * 0.45, y: pp.y + 0.05, z: pp.z + fz * 0.45 }, { x: 0, y: -1, z: 0 });
        const ph = this.world.castRay(probe, 3, false, undefined, groups(0xffff, GROUP_ENV));
        if (ph && ph.timeOfImpact < PELVIS_H - 0.05 && ph.timeOfImpact < mainDist - 0.05) {
          this.groundDist = ph.timeOfImpact;
          mantling = true;
        }
      }
    }
    const pelvisQ = this.quat(PELVIS, _qP);
    _v2.copy(UP).applyQuaternion(pelvisQ);
    const tilt = Math.acos(clamp(_v2.y, -1, 1));
    _e.setFromQuaternion(pelvisQ, "YXZ");
    this.pelvisYaw = _e.y;
    const lin = this.parts[PELVIS].linvel();
    this.speed = Math.hypot(lin.x, lin.z);

    // ---- Torso ----
    const wantCrouch = inp.torso.b ? 1 : 0;
    this.crouch = lerp(this.crouch, wantCrouch, 1 - Math.exp(-dt * 8));
    if (inp.torso.a && !this.fallen && this.braceStamina > 0) {
      this.brace = 1;
      this.braceStamina = Math.max(0, this.braceStamina - dt / 2.5);
    } else {
      this.brace = 0;
      this.braceStamina = Math.min(1, this.braceStamina + dt / 4);
    }
    const leanF = inp.torso.f;
    const leanS = inp.torso.s;

    // ---- Legs: strides, kicks, jumps ----
    const legInputs = [inp.lleg, inp.rleg];
    let bothKick = false;
    for (let i = 0; i < 2; i++) {
      const L = this.legs[i];
      const li = legInputs[i];
      const down = Math.abs(li.f) > 0.3 || Math.abs(li.s) > 0.3;
      if (down && !L.wasDown && !this.fallen) {
        L.lifted = true;
        L.t = 0;
        L.dir.set(li.s, li.f).normalize();
        L.pressTime = this.time;
      } else if (down && L.wasDown) {
        L.dir.set(li.s, li.f).normalize();
      }
      if (!down && L.wasDown) {
        L.lifted = false;
        if (this.grounded && !this.fallen) {
          this.emit("step", this.footPos(i as 0 | 1, _v2));
        }
      }
      L.wasDown = down;
      L.t += dt;
      // kick
      if (li.a && !(i === 0 ? this.prev.lleg.a : this.prev.rleg.a) && !this.fallen) {
        L.kickT = 0.32;
        L.lastPressed = this.time;
        const other = this.legs[1 - i];
        if (this.time - other.lastPressed < 0.22 && this.grounded && this.jumpCooldown <= 0 && !this.fallen) bothKick = true;
        else this.emit("kick", this.footPos(i as 0 | 1, _v2));
      }
      L.kickT = Math.max(0, L.kickT - dt);
    }
    const hanging = this.holds.some((h) => h.isStatic);
    const climbing = hanging && (inp.lhand.f + inp.rhand.f) * 0.5 < -0.3 && !mantling;
    const supportedFeet = this.supportFeet.filter(Boolean).length;
    const support = this.fallen || climbing ? 0 : mantling ? 1 : supportedFeet === 2 ? 1 : supportedFeet === 1 ? 0.72 : 0;
    const targetH = mantling ? 0.6 : PELVIS_H + 0.03 - this.crouch * 0.38;
    const wasGrounded = this.grounded;
    this.grounded = supportedFeet > 0 || mantling || (this.fallen && this.groundDist < targetH + 0.35);
    if (this.grounded && !wasGrounded && this.airT > 0.25) this.emit("land", pp);
    this.airT = this.grounded ? 0 : this.airT + dt;
    this.jumpCooldown -= dt;
    this.updateMassDiagnostics(dt);

    // ---- Falling / recovery ----
    const intentionalAirborne = this.jumpCooldown > 0.15;
    if (supportedFeet === 0 && !hanging && !bothKick && !intentionalAirborne && !mantling && !this.fallen) this.unsupportedT += dt;
    else if (supportedFeet > 0 || hanging || bothKick || intentionalAirborne) this.unsupportedT = 0;
    if (supportedFeet > 0 && this.stabilityMargin < -0.12 && !hanging && !this.fallen) {
      const braceScale = inp.torso.a ? 0.25 : 1;
      this.unstableT += dt * braceScale * clamp((-this.stabilityMargin - 0.08) * 4, 0.35, 2);
    } else {
      this.unstableT = Math.max(0, this.unstableT - dt * 1.5);
    }
    const unsupportedLimit = inp.torso.a ? 0.4 : 0.22;
    if (!this.fallen && !hanging && ((!intentionalAirborne && tilt > 1.08) || this.unsupportedT > unsupportedLimit || this.unstableT > 0.42)) {
      this.fallen = true;
      this.fallReason = supportedFeet === 0 ? "no-foot-support" : this.unstableT > 0.42 ? "capture-point-outside-support" : "excessive-tilt";
      this.fallT = 0;
      this.recoverT = 0;
      this.releaseAll(true);
      this.emit("fall", pp, { reason: this.fallReason });
    }
    if (this.fallen) {
      this.fallT += dt;
      const wantsUp = inp.torso.a;
      if (wantsUp) this.recoverT += dt;
      else this.recoverT = Math.max(0, this.recoverT - dt * 0.5);
      this.balance = clamp(this.recoverT / 0.7, 0, 1) * 0.75 + (this.fallT < 0.15 ? 0.4 : 0);
      if (this.recoverT > 0.5 && tilt < 0.55) {
        this.fallen = false;
        this.fallReason = null;
        this.unsupportedT = 0;
        this.unstableT = 0;
        this.balance = 1;
        this.emit("getup", pp);
      }
    } else {
      this.balance = lerp(this.balance, 1, 1 - Math.exp(-dt * 6));
    }
    const bal = this.balance;
    const limbGain = this.fallen ? lerp(0.12, 0.88, clamp(this.recoverT / 1.2, 0, 1)) : 1;

    // ---- Hover / support ----
    const pelvis = this.parts[PELVIS];
    const m = this.totalMass;
    const g = 9.81;
    if (support > 0 && this.grounded && !this.fallen) {
      const err = targetH - this.groundDist;
      const vy = lin.y;
      // Feet and contact impulses carry most of the weight. This is only a
      // bounded compliance term, so balance cannot be faked by a hover spring.
      let f = m * (46 * err - 8 * vy) * support * bal + m * g * 0.62 * support * bal;
      if (err < -0.25) f = Math.max(Math.min(f, 0), -m * g * 0.35);
      f -= m * g * 0.28 * this.crouch;
      f = clamp(f, -m * g * 0.45, m * g * 0.9);
      if (bothKick) f = 0;
      pelvis.addForce({ x: 0, y: f, z: 0 }, true);
    } else if (this.fallen && this.recoverT > 0.05) {
      const err = targetH - this.groundDist;
      const f = m * g * 0.95 * clamp(this.recoverT / 0.7, 0, 1) + m * 30 * Math.max(err, 0);
      pelvis.addForce({ x: 0, y: f, z: 0 }, true);
    }
    if (bothKick) {
      this.jumpCooldown = 1.0;
      const fwd = _v2.set(-Math.sin(this.heading), 0, -Math.cos(this.heading));
      pelvis.applyImpulse({ x: fwd.x * m * 1.5, y: m * 4.7, z: fwd.z * m * 1.5 }, true);
      this.emit("jump", pp);
    }

    // ---- Locomotion forces ----
    const fwd = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
    const right = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
    let pushing = false;
    if (!this.fallen && this.grounded) {
      for (let i = 0; i < 2; i++) {
        const L = this.legs[i];
        const other = this.legs[1 - i];
        if (L.lifted && L.t < 0.42 && !other.lifted) {
          pushing = true;
          const strength = this.lastStrideLeg === i && L.t < 0.02 ? 0.55 : 1;
          if (L.t < 0.02) this.lastStrideLeg = i;
          const same = this.lastStrideLeg === i;
          const k = (same ? strength : 1) * (1 - L.t / 0.42);
          const speedMax = 3.4 - this.crouch * 1.2;
          const desired = _v2.copy(fwd).multiplyScalar(L.dir.y * speedMax).addScaledVector(right, L.dir.x * speedMax * 0.8);
          const requested = new THREE.Vector3(m * (desired.x - lin.x) * 6.5 * k, 0, m * (desired.z - lin.z) * 6.5 * k);
          const maxTraction = m * g * 1.15;
          if (requested.lengthSq() > maxTraction * maxTraction) requested.setLength(maxTraction);
          const stanceIndex = 1 - i;
          if (this.supportFeet[stanceIndex]) {
            const footBody = this.parts[stanceIndex === 0 ? LSH : RSH];
            const stance = this.supportPoints[stanceIndex] ?? this.footPos(stanceIndex as 0 | 1, _v);
            footBody.addForceAtPoint({ x: requested.x, y: 0, z: requested.z }, { x: stance.x, y: stance.y, z: stance.z }, true);
          }
        }
      }
      // leaning forward drifts you
      if (Math.abs(leanF) > 0.2 && supportedFeet > 0) {
        for (let i = 0; i < 2; i++) {
          if (!this.supportFeet[i]) continue;
          const stance = this.supportPoints[i] ?? this.footPos(i as 0 | 1, _v);
          this.parts[i === 0 ? LSH : RSH].addForceAtPoint(
            { x: fwd.x * m * leanF * 1.1 / supportedFeet, y: 0, z: fwd.z * m * leanF * 1.1 / supportedFeet },
            { x: stance.x, y: stance.y, z: stance.z },
            true
          );
        }
      }
      if (!pushing && supportedFeet > 0) {
        const brake = supportedFeet === 2 ? 5.5 : 2.2;
        for (let i = 0; i < 2; i++) {
          if (!this.supportFeet[i]) continue;
          const stance = this.supportPoints[i] ?? this.footPos(i as 0 | 1, _v);
          this.parts[i === 0 ? LSH : RSH].addForceAtPoint(
            { x: -lin.x * m * brake / supportedFeet, y: 0, z: -lin.z * m * brake / supportedFeet },
            { x: stance.x, y: stance.y, z: stance.z },
            true
          );
        }
      }
    }

    // ---- Climb assist while hanging ----
    if (hanging) {
      this.hangT += dt;
      if (mantling) {
        pelvis.addForce({ x: fwd.x * m * 3.5, y: 0, z: fwd.z * m * 3.5 }, true);
      } else if (climbing) {
        const vy = lin.y;
        pelvis.addForce({ x: fwd.x * m * 2.0, y: m * g * 1.75 - m * vy * 4, z: fwd.z * m * 2.0 }, true);
        if (this.hangT > 0.3 && Math.floor(this.time * 3) !== Math.floor((this.time - dt) * 3)) this.emit("climb", pp);
      } else if (!this.grounded) {
        pelvis.addForce({ x: 0, y: m * g * 0.5, z: 0 }, true);
      }
    } else this.hangT = 0;

    // ---- Upright controller on pelvis ----
    {
      const targetPitch = -leanF * 0.28;
      const captureDx = this.capturePoint.x - this.centerOfMass.x;
      const captureDz = this.capturePoint.z - this.centerOfMass.z;
      const rightX = Math.cos(this.heading);
      const rightZ = -Math.sin(this.heading);
      const lateralCaptureError = captureDx * rightX + captureDz * rightZ;
      const targetRoll = clamp(-leanS * 0.3 - lateralCaptureError * 0.18, -0.42, 0.42)
        + (supportedFeet === 1 ? (this.supportFeet[0] ? -0.06 : 0.06) : 0);
      _e.set(targetPitch, this.heading, targetRoll, "YXZ");
      _qT.setFromEuler(_e);
      _qInv.copy(pelvisQ).invert();
      _qE.copy(_qT).multiply(_qInv);
      if (_qE.w < 0) _qE.set(-_qE.x, -_qE.y, -_qE.z, -_qE.w);
      const w = clamp(_qE.w, -1, 1);
      const ang = 2 * Math.acos(w);
      const s = Math.sqrt(Math.max(0, 1 - w * w));
      if (s < 1e-5) _err.set(0, 0, 0);
      else _err.set(_qE.x / s, _qE.y / s, _qE.z / s).multiplyScalar(ang);
      const yawE = _err.y;
      const tiltEx = _err.x;
      const tiltEz = _err.z;
      const av = pelvis.angvel();
      const supportAuthority = this.fallen && this.recoverT > 0.05 ? 0.8 : supportedFeet > 0 ? 1 : 0.18;
      const kU = (this.fallen ? 260 : 235) * bal * (1 + this.brace * 0.7) * supportAuthority;
      const dU = 42 * Math.sqrt(bal) * (1 + this.brace * 0.45);
      const kY = 160 * bal;
      const dY = 30;
      _torque.set(kU * tiltEx - dU * av.x, kY * yawE - dY * av.y, kU * tiltEz - dU * av.z);
      const maxT = (this.fallen ? 190 : 175) * (1 + this.brace * 0.55);
      if (_torque.lengthSq() > maxT * maxT) _torque.setLength(maxT);
      pelvis.addTorque({ x: _torque.x, y: _torque.y, z: _torque.z }, true);
    }

    // ---- Joint targets ----
    // chest
    _e.set(-leanF * 0.55 + this.crouch * 0.35, 0, -leanS * 0.4, "YXZ");
    this.drive(CHEST, PELVIS, _qL.setFromEuler(_e), limbGain * (1 + this.brace * 0.5));
    // head
    const headYaw = clamp(angleWrap(this.heading - this.pelvisYaw), -1.3, 1.3);
    _e.set(this.headPitch + leanF * 0.3, headYaw, 0, "YXZ");
    this.drive(HEAD, CHEST, _qL.setFromEuler(_e), limbGain);

    // arms
    const leftHandInput = inp.lhand ?? inp.arms ?? emptyInput();
    const rightHandInput = inp.rhand ?? inp.arms ?? emptyInput();
    this.armRaiseSide[0] = clamp(this.armRaiseSide[0] + leftHandInput.f * dt * 1.6, 0, 1);
    this.armRaiseSide[1] = clamp(this.armRaiseSide[1] + rightHandInput.f * dt * 1.6, 0, 1);
    this.armYawSide[0] = lerp(this.armYawSide[0], -leftHandInput.s * 0.9, 1 - Math.exp(-dt * 6));
    this.armYawSide[1] = lerp(this.armYawSide[1], -rightHandInput.s * 0.9, 1 - Math.exp(-dt * 6));
    this.armRaise = (this.armRaiseSide[0] + this.armRaiseSide[1]) * 0.5;
    this.armYaw = (this.armYawSide[0] + this.armYawSide[1]) * 0.5;
    const leftPrev = (this.prev as ReactorInputs).lhand ?? (this.prev as ReactorInputs).arms ?? emptyInput();
    const rightPrev = (this.prev as ReactorInputs).rhand ?? (this.prev as ReactorInputs).arms ?? emptyInput();
    const throwLeft = leftHandInput.b && !leftPrev.b;
    const throwRight = rightHandInput.b && !rightPrev.b;
    const bilateralTarget = this.holds.some((h) => this.holds.some((o) => o !== h && o.target.handle === h.target.handle));
    if (this.holds.length > 0 && (bilateralTarget ? throwLeft && throwRight : throwLeft || throwRight)) this.throw();
    this.throwT = Math.max(0, this.throwT - dt);
    const throwSwing = this.throwT > 0 ? Math.sin((this.throwT / 0.35) * Math.PI) : 0;
    const holdingAny = this.holds.length > 0;
    for (let side = 0; side < 2; side++) {
      const sgn = side === 0 ? -1 : 1;
      const holding = this.holds.some((h) => h.hand === side);
      const raise = holding ? Math.max(0.12 + this.armRaiseSide[side] * 2.5, 0.9) : 0.12 + this.armRaiseSide[side] * 2.5 + throwSwing * 1.2 + (this.fallen ? 0.5 : 0);
      const spread = holding ? 0.05 : 0.18 + (this.armRaise > 0.2 ? 0 : 0);
      _e.set(clamp(raise, 0.05, 2.75), this.armYawSide[side], sgn * spread, "YXZ");
      this.drive(side === 0 ? LUA : RUA, CHEST, _qL.setFromEuler(_e), limbGain * (holding ? 1.6 : 1) * (this.throwT > 0 ? 2 : 1));
      const elbow = clamp(holdingAny ? 0.5 : 0.25 + this.armRaiseSide[side] * 0.5 + throwSwing * 0.8, 0.12, 1.65);
      _e.set(elbow, 0, sgn * 0.15, "YXZ");
      this.drive(side === 0 ? LFA : RFA, side === 0 ? LUA : RUA, _qL.setFromEuler(_e), limbGain);
    }

    // legs
    for (let i = 0; i < 2; i++) {
      const L = this.legs[i];
      const sgn = i === 0 ? -1 : 1;
      let pitch = 0.04 + this.crouch * 1.25;
      let knee = -0.08 - this.crouch * 1.9;
      let roll = sgn * 0.04;
      let gain = 1 - this.crouch * 0.45;
      if (L.lifted && !this.fallen) {
        const sw = clamp(L.t / 0.18, 0, 1);
        pitch = L.dir.y * (0.95 - sw * 0.3) + 0.15;
        knee = -(0.95 + Math.abs(L.dir.y) * 0.85) * (1 - sw * 0.3);
        roll = L.dir.x * 0.65 + sgn * 0.05;
        gain = 1.3;
      }
      if (L.kickT > 0) {
        pitch = 1.6;
        knee = -0.15;
        gain = 2.4;
      }
      if (!this.grounded && this.airT > 0.1 && !hanging) {
        pitch += 0.6;
        knee -= 0.8;
      }
      if (hanging) {
        pitch = 0.35;
        knee = -0.9;
      }
      // Rapier spherical joints remain useful for the active ragdoll, but
      // these manual anatomical limits prevent hyperextension at high gain.
      pitch = clamp(pitch, -1.35, 1.8);
      knee = clamp(knee, -2.35, 0.08);
      _e.set(pitch, 0, roll, "YXZ");
      this.drive(i === 0 ? LTH : RTH, PELVIS, _qL.setFromEuler(_e), limbGain * gain);
      _e.set(knee, 0, 0, "YXZ");
      this.drive(i === 0 ? LSH : RSH, i === 0 ? LTH : RTH, _qL.setFromEuler(_e), limbGain * gain);
    }

    // ---- Grabbing ----
    const wantL = leftHandInput.a || leftHandInput.q;
    const wantR = rightHandInput.a || rightHandInput.e;
    const coordinatedGrip = leftHandInput.a && rightHandInput.a && !leftHandInput.q && !rightHandInput.e;
    this.grabLock = Math.max(0, this.grabLock - dt);
    if (!this.fallen) {
      if (coordinatedGrip && this.findGrab && this.grabLock <= 0) {
        const heldL = this.holds.find((h) => h.hand === 0);
        const heldR = this.holds.find((h) => h.hand === 1);
        if (heldL && heldR) {
          // Existing bilateral grips stay independent, but Space may not bind
          // the two hands to two unrelated objects.
          if (heldL.target.handle !== heldR.target.handle) this.release(heldR, true);
        } else {
          const leftTarget = heldL ? null : this.findGrab(this.handPos(0, new THREE.Vector3()), []);
          const rightTarget = heldR ? null : this.findGrab(this.handPos(1, new THREE.Vector3()), []);
          const targetHandle = heldL?.target.handle ?? heldR?.target.handle ?? leftTarget?.body.handle ?? rightTarget?.body.handle;
          const leftCompatible = heldL ? heldL.target.handle === targetHandle : leftTarget?.body.handle === targetHandle;
          const rightCompatible = heldR ? heldR.target.handle === targetHandle : rightTarget?.body.handle === targetHandle;
          if (targetHandle !== undefined && leftCompatible && rightCompatible) {
            if (!heldL && leftTarget) this.updateHand(0, true, leftTarget);
            if (!heldR && rightTarget) this.updateHand(1, true, rightTarget);
          }
        }
      } else {
        this.updateHand(0, wantL);
        this.updateHand(1, wantR);
      }
    }
    // slide ledge-snap anchors smoothly
    for (const h of this.holds) {
      if (h.snapFrom && h.snapTo && h.snapT < 1) {
        h.snapT = Math.min(1, h.snapT + dt / 0.3);
        const k = h.snapT * h.snapT * (3 - 2 * h.snapT);
        h.joint.setAnchor2({ x: lerp(h.snapFrom.x, h.snapTo.x, k), y: lerp(h.snapFrom.y, h.snapTo.y, k), z: lerp(h.snapFrom.z, h.snapTo.z, k) });
      }
    }
    // Held props retain their full mass. The only support they receive is
    // through the two independent hand constraints and the player's body.
    this.updateGripDiagnostics(dt);

    // copy prev
    for (const r of PHYS_ROLES) Object.assign(this.prev[r], inp[r]);
  }

  private updateHand(hand: 0 | 1, want: boolean, candidate?: GrabTarget) {
    const held = this.holds.find((h) => h.hand === hand);
    if (!want) {
      this.gripBlocked[hand] = false;
      if (held) this.release(held, true);
      return;
    }
    if (this.gripBlocked[hand]) return;
    if (!held && this.findGrab && this.grabLock <= 0) {
      const hp = this.handPos(hand, new THREE.Vector3());
      const t = candidate ?? this.findGrab(hp, []);
      if (t) {
        const fa = this.parts[hand === 0 ? LFA : RFA];
        const a2 = t.snapFrom ?? t.localAnchor;
        const jd = this.R.JointData.spherical({ x: HAND_LOCAL.x, y: HAND_LOCAL.y, z: HAND_LOCAL.z }, { x: a2.x, y: a2.y, z: a2.z });
        const joint = this.world.createImpulseJoint(jd, fa, t.body, true);
        this.holds.push({ hand, joint, target: t.body, isStatic: t.isStatic, mass: t.mass, id: t.id, localAnchor: t.localAnchor.clone(), snapFrom: t.snapFrom, snapTo: t.snapFrom ? t.localAnchor : undefined, snapT: 0 });
        this.emit("grab", hp, { hand, propId: t.id });
      }
    }
  }

  /** Recreate a serialized grip when the reactor restores a checkpoint. */
  restoreGrip(descriptor: {
    hand: 0 | 1;
    id: number;
    isStatic: boolean;
    mass: number;
    targetHandle?: number;
    localAnchor: readonly [number, number, number];
    snapFrom?: readonly [number, number, number];
    snapTo?: readonly [number, number, number];
    snapT?: number;
    load?: number;
    stress?: number;
    slipT?: number;
    slipping?: boolean;
    targetState?: {
      translation: readonly [number, number, number];
      rotation: readonly [number, number, number, number];
      linearVelocity: readonly [number, number, number];
      angularVelocity: readonly [number, number, number];
    };
  }) {
    if (this.holds.some((h) => h.hand === descriptor.hand) || descriptor.targetHandle == null) return false;
    let target: RigidBody;
    try {
      target = this.world.getRigidBody(descriptor.targetHandle);
    } catch {
      return false;
    }
    if (descriptor.targetState && !descriptor.isStatic) {
      const state = descriptor.targetState;
      target.setTranslation({ x: state.translation[0], y: state.translation[1], z: state.translation[2] }, true);
      target.setRotation({ x: state.rotation[0], y: state.rotation[1], z: state.rotation[2], w: state.rotation[3] }, true);
      target.setLinvel({ x: state.linearVelocity[0], y: state.linearVelocity[1], z: state.linearVelocity[2] }, true);
      target.setAngvel({ x: state.angularVelocity[0], y: state.angularVelocity[1], z: state.angularVelocity[2] }, true);
      target.resetForces(true);
      target.resetTorques(true);
    }
    const a2 = descriptor.localAnchor;
    const fa = this.parts[descriptor.hand === 0 ? LFA : RFA];
    const joint = this.world.createImpulseJoint(
      this.R.JointData.spherical({ x: HAND_LOCAL.x, y: HAND_LOCAL.y, z: HAND_LOCAL.z }, { x: a2[0], y: a2[1], z: a2[2] }),
      fa,
      target,
      true
    );
    this.holds.push({
      hand: descriptor.hand,
      joint,
      target,
      isStatic: descriptor.isStatic,
      mass: descriptor.mass,
      id: descriptor.id,
      localAnchor: new THREE.Vector3(a2[0], a2[1], a2[2]),
      snapFrom: descriptor.snapFrom ? new THREE.Vector3(...descriptor.snapFrom) : undefined,
      snapTo: descriptor.snapTo ? new THREE.Vector3(...descriptor.snapTo) : undefined,
      snapT: descriptor.snapT ?? 1,
      load: descriptor.load,
      stress: descriptor.stress,
      slipT: descriptor.slipT,
      slipping: descriptor.slipping,
    });
    const velocity = descriptor.targetState?.linearVelocity ?? (() => {
      const value = target.linvel();
      return [value.x, value.y, value.z] as const;
    })();
    this.heldTargetVelocity.set(target.handle, new THREE.Vector3(velocity[0], velocity[1], velocity[2]));
    return true;
  }

  private release(h: Hold, emit: boolean) {
    this.world.removeImpulseJoint(h.joint, true);
    this.holds = this.holds.filter((x) => x !== h);
    if (!this.holds.some((other) => other.target.handle === h.target.handle)) this.heldTargetVelocity.delete(h.target.handle);
    if (emit) this.emit("release", this.handPos(h.hand, new THREE.Vector3()), { hand: h.hand, propId: h.id });
  }

  releaseAll(emit: boolean) {
    for (const h of [...this.holds]) this.release(h, emit);
    this.heldTargetVelocity.clear();
  }

  isHolding(id: number) {
    return this.holds.some((h) => h.id === id);
  }

  private throw() {
    const fwd = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
    const upAmt = 0.22 + this.armRaise * 0.55 + Math.max(0, this.headPitch) * 0.5;
    const dir = fwd.clone().multiplyScalar(Math.cos(upAmt)).add(new THREE.Vector3(0, Math.sin(upAmt), 0)).normalize();
    const thrown = new Set<RigidBody>();
    for (const h of [...this.holds]) {
      const target = h.target;
      const isStatic = h.isStatic;
      const mass = h.mass;
      this.release(h, false);
      if (isStatic || thrown.has(target)) continue;
      thrown.add(target);
      const mag = Math.min(mass, 8) * 8.5 + 3;
      target.applyImpulse({ x: dir.x * mag, y: dir.y * mag, z: dir.z * mag }, true);
      this.emit("throw", this.pos(CHEST, new THREE.Vector3()), { propId: h.id });
    }
    this.throwT = 0.35;
    this.grabLock = 0.7;
    // recoil
    const m = this.totalMass;
    this.parts[CHEST].applyImpulse({ x: -dir.x * m * 0.25, y: 0, z: -dir.z * m * 0.25 }, true);
  }

  /** Flat transforms for rendering / networking: 7 numbers per part */
  writeTransforms(out: number[], offset = 0) {
    for (let i = 0; i < PART_COUNT; i++) {
      const t = this.parts[i].translation();
      const r = this.parts[i].rotation();
      const o = offset + i * 7;
      out[o] = t.x;
      out[o + 1] = t.y;
      out[o + 2] = t.z;
      out[o + 3] = r.x;
      out[o + 4] = r.y;
      out[o + 5] = r.z;
      out[o + 6] = r.w;
    }
    return out;
  }
}


/** Static-geometry grab with ledge snapping: prefers a walkable top surface near the hand. */
export function findStaticGrab(
  R: R,
  world: World,
  hp: THREE.Vector3,
  heading: number,
  grabbable: (handle: number) => boolean,
  stableId?: (handle: number) => number | undefined,
): GrabTarget | null {
  const fx = -Math.sin(heading);
  const fz = -Math.cos(heading);
  const filter = groups(0xffff, GROUP_ENV);
  // 1) ledge probe: look for a top surface slightly ahead/above the hand
  for (const ahead of [0.2, 0.08]) {
    const origin = { x: hp.x + fx * ahead, y: hp.y + 0.3, z: hp.z + fz * ahead };
    const ray = new R.Ray(origin, { x: 0, y: -1, z: 0 });
    const hit = world.castRayAndGetNormal(ray, 0.6, false, undefined, filter);
    if (hit && hit.normal.y > 0.7 && grabbable(hit.collider.handle)) {
      const py = origin.y - hit.timeOfImpact;
      if (py > hp.y - 0.22 && py < hp.y + 0.25) {
        const rb = hit.collider.parent();
        if (rb) {
          const t = rb.translation();
          const r = rb.rotation();
          const q = new THREE.Quaternion(r.x, r.y, r.z, r.w).invert();
          const local = new THREE.Vector3(origin.x - t.x, py + 0.02 - t.y, origin.z - t.z).applyQuaternion(q);
          const from = new THREE.Vector3(hp.x - t.x, hp.y - t.y, hp.z - t.z).applyQuaternion(q);
          return { body: rb, localAnchor: local, isStatic: true, mass: 0, id: stableId?.(hit.collider.handle) ?? -1, snapFrom: from };
        }
      }
    }
  }
  // 2) any nearby surface
  const proj = world.projectPoint({ x: hp.x, y: hp.y, z: hp.z }, true, undefined, filter);
  if (proj) {
    const d = Math.hypot(proj.point.x - hp.x, proj.point.y - hp.y, proj.point.z - hp.z);
    if (d < 0.2 && grabbable(proj.collider.handle)) {
      const rb = proj.collider.parent();
      if (rb) {
        const t = rb.translation();
        const r = rb.rotation();
        const q = new THREE.Quaternion(r.x, r.y, r.z, r.w).invert();
        const local = new THREE.Vector3(proj.point.x - t.x, proj.point.y - t.y, proj.point.z - t.z).applyQuaternion(q);
        return { body: rb, localAnchor: local, isStatic: true, mass: 0, id: stableId?.(proj.collider.handle) ?? -1 };
      }
    }
  }
  return null;
}
