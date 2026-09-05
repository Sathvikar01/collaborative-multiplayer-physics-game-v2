import { emptyInput, type Role, type RoleInput, type SquadSize } from "./types";
import type { BodyInputs } from "./body";
import { normalizeRemoteInputs } from "./remoteInput";

export interface SquadMixState {
  legT: number;
}

/** Fresh per-run mixer state (3P auto-alternate legs). */
export const makeSquadMixState = (): SquadMixState => ({ legT: 0 });

const get = (ext: Partial<Record<Role, RoleInput>>, role: Role): RoleInput => ext[role] ?? emptyInput();

/**
 * Match singularity2's role controls while retaining separate internal hand
 * channels for this repo's grip diagnostics and takeover state.
 * - Camera/heading follows Torso's mouse (legacy Head falls back).
 * - 5P hand raise/swing is averaged; Space/Shift require both players.
 * - Q/E still grab one hand alone.
 * - 3P Legs auto-alternates while a direction is held.
 */
export function resolvePhysInputs(
  ext: Partial<Record<Role, RoleInput>>,
  squad: SquadSize,
  dt: number,
  state: SquadMixState,
): BodyInputs {
  const safe = normalizeRemoteInputs(ext);
  const frameDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const torso = get(safe, "torso");
  const legacyHead = get(safe, "head");
  const yaw = safe.torso?.lx ?? legacyHead.lx ?? 0;
  const pitch = safe.torso?.ly ?? legacyHead.ly ?? 0;

  const head: RoleInput = { ...emptyInput(), lx: yaw, ly: pitch, a: torso.q || legacyHead.a };

  let sharedArms: RoleInput;
  if (squad === 3) {
    sharedArms = { ...get(safe, "arms"), lx: yaw, ly: pitch };
  } else {
    const left = safe.lhand;
    const right = safe.rhand;
    if (!left && !right) {
      sharedArms = { ...get(safe, "arms"), lx: yaw, ly: pitch };
    } else {
      sharedArms = {
        f: ((left?.f ?? 0) + (right?.f ?? 0)) / 2,
        s: ((left?.s ?? 0) + (right?.s ?? 0)) / 2,
        a: Boolean(left?.a && right?.a),
        b: Boolean(left?.b && right?.b),
        q: Boolean(left?.q),
        e: Boolean(right?.e),
        lx: yaw,
        ly: pitch,
      };
    }
  }

  const lhand: RoleInput = { ...sharedArms, e: false };
  const rhand: RoleInput = { ...sharedArms, q: false };

  let lleg: RoleInput;
  let rleg: RoleInput;
  if (squad === 3) {
    const legs = safe.legs ?? (safe.lleg ?? safe.rleg);
    if (!legs || (Math.abs(legs.f) < 0.2 && Math.abs(legs.s) < 0.2)) {
      lleg = { ...emptyInput(), lx: yaw, ly: pitch, a: Boolean(legs?.a) };
      rleg = { ...emptyInput(), lx: yaw, ly: pitch, a: Boolean(legs?.a) };
    } else {
      state.legT += frameDt;
      const phase = Math.floor(state.legT / 0.3) % 2;
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

  return { head, lhand, rhand, torso: { ...torso, lx: yaw, ly: pitch }, lleg, rleg };
}
