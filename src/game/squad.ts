import { emptyInput, type PhysRole, type Role, type RoleInput, type SquadSize } from "./types";
import type { BodyInputs } from "./body";
import { normalizeRemoteInputs } from "./remoteInput";

export interface SquadMixState {
  legT: number;
  /** Remaining bilateral coordination windows for the two hand actions. */
  lSpaceGrace: number;
  rSpaceGrace: number;
  lShiftGrace: number;
  rShiftGrace: number;
}

const BILATERAL_GRACE_SECONDS = 0.12;

/** fresh per-run mixer state (3P auto-alternate legs) */
export const makeSquadMixState = (): SquadMixState => ({
  legT: 0,
  lSpaceGrace: 0,
  rSpaceGrace: 0,
  lShiftGrace: 0,
  rShiftGrace: 0,
});

const updateGrace = (remaining: number, pressed: boolean, dt: number): number =>
  pressed ? BILATERAL_GRACE_SECONDS : Math.max(0, remaining - dt);

const clearHandGrace = (st: SquadMixState) => {
  st.lSpaceGrace = 0;
  st.rSpaceGrace = 0;
  st.lShiftGrace = 0;
  st.rShiftGrace = 0;
};

const get = (ext: Partial<Record<Role, RoleInput>>, r: Role): RoleInput => ext[r] ?? emptyInput();

/**
 * Merge squad-sized player inputs into the internal physics channels.
 * - Camera/heading always follows Torso's mouse (legacy Head falls back).
 * - 5P hands remain independent: two-hand grab + throw require BOTH players
 *   (Space / Shift), while Q/E can grab a single hand alone.
 * - 3P arms expand into two identical hand channels.
 * - 3P legs: hold a direction to auto-alternate steps; Space jumps.
 */
export function resolvePhysInputs(
  ext: Partial<Record<Role, RoleInput>>,
  squad: SquadSize,
  dt: number,
  st: SquadMixState
): BodyInputs {
  // Keep this boundary defensive as it is also used by callers other than the
  // network buffer (e.g. replay tools and local simulations).
  const safe = normalizeRemoteInputs(ext);
  const frameDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const torso = get(safe, "torso");
  const headLeg = get(safe, "head");
  const yaw = safe.torso?.lx ?? headLeg.lx ?? 0;
  const pitch = safe.torso?.ly ?? headLeg.ly ?? 0;

  const head: RoleInput = { ...emptyInput(), lx: yaw, ly: pitch, a: torso.q || headLeg.a };

  let lhand: RoleInput;
  let rhand: RoleInput;
  if (squad === 3) {
    // In three-player mode the arms player controls both hands together, but
    // expose them as separate physics channels so the reactor can apply the
    // correct force/reaction at each grip point.
    const arms = get(safe, "arms");
    const twoHandGrab = Boolean(arms.a);
    const sharedThrow = Boolean(arms.b);
    lhand = { ...arms, a: twoHandGrab || arms.q, b: sharedThrow, lx: yaw, ly: pitch };
    rhand = { ...arms, a: twoHandGrab || arms.e, b: sharedThrow, lx: yaw, ly: pitch };
  } else {
    const l = safe.lhand;
    const r = safe.rhand;
    if (!l && !r) {
      // Solo / legacy fallback: a shared arms role drives both hands.
      clearHandGrace(st);
      const arms = get(safe, "arms");
      const twoHandGrab = Boolean(arms.a);
      const sharedThrow = Boolean(arms.b);
      lhand = { ...arms, a: twoHandGrab || arms.q, b: sharedThrow, lx: yaw, ly: pitch };
      rhand = { ...arms, a: twoHandGrab || arms.e, b: sharedThrow, lx: yaw, ly: pitch };
    } else {
      // Never average the hand axes: disagreement must produce a real
      // lateral force/torque in the reactor. A missing hand remains neutral.
      const left = l ?? emptyInput();
      const right = r ?? emptyInput();
      // A packet can arrive slightly before its partner. Keep each button's
      // intent alive for a short, bounded window so a two-hand action does not
      // fail solely because of network skew.
      st.lSpaceGrace = updateGrace(st.lSpaceGrace, Boolean(l?.a), frameDt);
      st.rSpaceGrace = updateGrace(st.rSpaceGrace, Boolean(r?.a), frameDt);
      st.lShiftGrace = updateGrace(st.lShiftGrace, Boolean(l?.b), frameDt);
      st.rShiftGrace = updateGrace(st.rShiftGrace, Boolean(r?.b), frameDt);
      const twoHandGrab = st.lSpaceGrace > 0 && st.rSpaceGrace > 0;
      const sharedThrow = st.lShiftGrace > 0 && st.rShiftGrace > 0;
      lhand = { ...left, a: twoHandGrab || left.q, b: sharedThrow, lx: yaw, ly: pitch };
      rhand = { ...right, a: twoHandGrab || right.e, b: sharedThrow, lx: yaw, ly: pitch };
    }
  }

  let lleg: RoleInput;
  let rleg: RoleInput;
  if (squad === 3) {
    const legs = safe.legs ?? (safe.lleg ?? safe.rleg);
    if (!legs || (Math.abs(legs.f) < 0.2 && Math.abs(legs.s) < 0.2)) {
      lleg = { ...emptyInput(), lx: yaw, ly: pitch, a: Boolean(legs?.a) };
      rleg = { ...emptyInput(), lx: yaw, ly: pitch, a: Boolean(legs?.a) };
    } else {
      st.legT += frameDt;
      const phase = Math.floor(st.legT / 0.3) % 2;
      const active: RoleInput = { ...legs, lx: yaw, ly: pitch };
      const idle: RoleInput = { ...emptyInput(), lx: yaw, ly: pitch, a: legs.a };
      lleg = phase === 0 ? active : idle;
      rleg = phase === 1 ? active : idle;
      lleg.a = Boolean(legs.a);
      rleg.a = Boolean(legs.a);
    }
  } else {
    lleg = { ...get(safe, "lleg"), lx: yaw, ly: pitch };
    rleg = { ...get(safe, "rleg"), lx: yaw, ly: pitch };
    if (safe.legs && !safe.lleg && !safe.rleg) {
      lleg = { ...safe.legs, lx: yaw, ly: pitch };
      rleg = { ...safe.legs, lx: yaw, ly: pitch };
    }
  }

  const out = { head, lhand, rhand, torso: { ...torso, lx: yaw, ly: pitch }, lleg, rleg } satisfies Record<PhysRole, RoleInput>;
  return out as BodyInputs;
}
