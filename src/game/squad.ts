import { emptyInput, ROLES, type Role, type RoleInput, type SquadSize } from "./types";
import type { BodyInputs } from "./body";
import { normalizeRemoteInputs } from "./remoteInput";

export interface SquadMixState {
  legT: number;
  /** Shared body heading. Game seeds this from the authoritative body. */
  heading: number;
}

const TURN_SPEED = 2.2;
const STEP_SECONDS = 0.28;

/** Fresh per-run state for the shared heading and automatic gait. */
export const makeSquadMixState = (): SquadMixState => ({
  legT: 0,
  heading: 0,
});

const averageAxes = (inputs: readonly RoleInput[]): [number, number] => {
  if (inputs.length === 0) return [0, 0];
  let f = 0;
  let s = 0;
  for (const input of inputs) {
    f += input.f;
    s += input.s;
  }
  return [f / inputs.length, s / inputs.length];
};

const wrapAngle = (angle: number): number => {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
};

/**
 * Merge transport-seat inputs into the six physical channels. Role names are
 * deliberately ignored here: every occupied seat has the same useful controls.
 * Q/E temporarily turn that player's WASD into left/right hand aim, while all
 * remaining non-neutral players vote on shared locomotion.
 */
export function resolvePhysInputs(
  ext: Partial<Record<Role, RoleInput>>,
  _squad: SquadSize,
  dt: number,
  st: SquadMixState,
): BodyInputs {
  const safe = normalizeRemoteInputs(ext);
  const frameDt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
  const seats = ROLES.flatMap((role) => safe[role] ? [safe[role]] : []);

  const movementSeats: RoleInput[] = [];
  const leftSeats: RoleInput[] = [];
  const rightSeats: RoleInput[] = [];
  let hop = false;
  let boost = false;
  let boostVotes = 0;
  let pitch = 0;

  for (const input of seats) {
    const handMode = input.q || input.e;
    if (input.q) leftSeats.push(input);
    if (input.e) rightSeats.push(input);
    if (!handMode && (input.f !== 0 || input.s !== 0)) {
      movementSeats.push(input);
    }
    hop ||= input.a;
    boost ||= input.b;
    if (input.b) boostVotes++;
    pitch += input.ly;
  }

  const [moveF, moveS] = averageAxes(movementSeats);
  const [leftF, leftS] = averageAxes(leftSeats);
  const [rightF, rightS] = averageAxes(rightSeats);
  const moving = moveF !== 0 || moveS !== 0;
  const lookPitch = seats.length > 0 ? pitch / seats.length : 0;
  const distinctHandCrew = seats.length <= 1 || leftSeats.some((left) => rightSeats.some((right) => right !== left));
  const leftGrab = leftSeats.length > 0;
  const rightGrab = rightSeats.length > 0 && (distinctHandCrew || !leftGrab);
  const sharedThrow = boost && (seats.length <= 1 || boostVotes >= 2);

  if (!Number.isFinite(st.heading)) st.heading = 0;
  st.heading = wrapAngle(st.heading - moveS * TURN_SPEED * frameDt);

  const head: RoleInput = {
    ...emptyInput(),
    a: boost,
    lx: st.heading,
    ly: lookPitch,
  };
  const lhand: RoleInput = {
    ...emptyInput(),
    f: leftF,
    s: leftS,
    a: leftGrab,
    b: sharedThrow,
    q: leftGrab,
    lx: st.heading,
    ly: lookPitch,
  };
  const rhand: RoleInput = {
    ...emptyInput(),
    f: rightF,
    s: rightS,
    a: rightGrab,
    b: sharedThrow,
    e: rightGrab,
    lx: st.heading,
    ly: lookPitch,
  };

  // A little physical side-step makes turning look planted rather than like a
  // spinning pawn. Most of A/D still goes into heading above.
  const gaitF = moveF;
  const gaitS = moveS * 0.35;
  let leftActive = false;
  if (moving) {
    st.legT += frameDt;
    leftActive = Math.floor(st.legT / STEP_SECONDS) % 2 === 0;
  }

  const makeLeg = (active: boolean): RoleInput => ({
    ...emptyInput(),
    f: active && moving ? gaitF : 0,
    s: active && moving ? gaitS : 0,
    a: hop,
    b: boost,
    lx: st.heading,
    ly: lookPitch,
  });
  const lleg = makeLeg(leftActive);
  const rleg = makeLeg(moving && !leftActive);

  // The active ragdoll supplies the balance skill automatically. It stays
  // modest enough to preserve the wobble instead of ironing out the comedy.
  const torso: RoleInput = {
    ...emptyInput(),
    f: moveF * 0.24,
    s: moveS * 0.12,
    a: hop,
    b: boost,
    lx: st.heading,
    ly: lookPitch,
  };

  return { head, lhand, rhand, torso, lleg, rleg };
}
