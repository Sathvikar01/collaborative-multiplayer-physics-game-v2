import type RAPIER_T from "@dimforge/rapier3d-compat";
import {
  makeInputs,
  type BodyEvent,
  type BodyInputs,
  type RagdollBody,
} from "./body";
import { PHYS_ROLES, type RoleInput } from "./types";

type Rapier = typeof RAPIER_T;

/** The only Rapier-facing part of the reactor's construction contract. */
export interface PhysicsReactorConfig {
  rapier: Rapier;
  world: RAPIER_T.World;
  body: RagdollBody;
  /** Optional queue supplied by a host that already owns a queue. */
  eventQueue?: RAPIER_T.EventQueue;
  stepHz?: number;
  maxSubsteps?: number;
  /** Maximum simulation debt retained when a frame takes too long. */
  maxDebtSeconds?: number;
  /** Map a serialized logical grip ID to a body handle in a rebuilt world. */
  resolveGripTargetHandle?: (grip: GripDescriptor) => number | undefined;
}

export interface ReactorStepContext {
  readonly dt: number;
  readonly tick: number;
}

export interface PhysicsReactorHooks {
  /** Called immediately before the controller and world are stepped. */
  beforeStep?: (context: ReactorStepContext) => void;
  /** Called after contact events have been drained for this fixed step. */
  afterStep?: (context: ReactorStepContext, result: ReactorStepResult) => void;
}

export interface ContactForceEvent {
  readonly collider1: number;
  readonly collider2: number;
  readonly totalForce: readonly [number, number, number];
  readonly totalForceMagnitude: number;
  readonly maxForceDirection: readonly [number, number, number];
  readonly maxForceMagnitude: number;
  readonly position?: readonly [number, number, number];
  readonly involvesBody: boolean;
}

export interface PhysicsDiagnostics {
  readonly tick: number;
  readonly simulatedTime: number;
  readonly accumulatorSeconds: number;
  readonly debtSeconds: number;
  readonly fixedStepSeconds: number;
  readonly maxSubsteps: number;
  readonly balance: number;
  readonly grounded: boolean;
  readonly fallen: boolean;
  readonly speed: number;
  readonly groundDistance: number;
  readonly brace: number;
  readonly supportContacts: number;
  readonly heldObjects: number;
  readonly heldMass: number;
  /** Optional values supplied by the active body-realism controller. */
  readonly stabilityMargin?: number;
  readonly gripLoad?: number;
  readonly gripStress?: readonly [number, number];
  readonly centreOfMass?: readonly [number, number, number];
  readonly capturePoint?: readonly [number, number, number];
  readonly fallReason?: string | null;
}

export interface ReactorStepResult {
  readonly tick: number;
  readonly simulatedSteps: number;
  readonly interpolationAlpha: number;
  readonly bodyEvents: readonly BodyEvent[];
  readonly contactForceEvents: readonly ContactForceEvent[];
  readonly diagnostics: PhysicsDiagnostics;
}

export interface PhysicsReactorAdvanceResult extends ReactorStepResult {}

export interface GripDescriptor {
  readonly hand: 0 | 1;
  readonly id: number;
  readonly isStatic: boolean;
  readonly mass: number;
  readonly targetHandle?: number;
  readonly localAnchor: readonly [number, number, number];
  readonly snapFrom?: readonly [number, number, number];
  readonly snapTo?: readonly [number, number, number];
  readonly snapT?: number;
  readonly load?: number;
  readonly stress?: number;
  readonly slipT?: number;
  readonly slipping?: boolean;
  /** Included in full local checkpoints; compact network state restores props separately. */
  readonly targetState?: PartPhysicsState;
}

export interface PartPhysicsState {
  readonly translation: readonly [number, number, number];
  readonly rotation: readonly [number, number, number, number];
  readonly linearVelocity: readonly [number, number, number];
  readonly angularVelocity: readonly [number, number, number];
}

export interface BodyControllerState {
  readonly heading: number;
  readonly headPitch: number;
  readonly pelvisYaw: number;
  readonly armRaise: number;
  readonly armYaw: number;
  readonly throwT: number;
  readonly crouch: number;
  readonly brace: number;
  readonly braceStamina: number;
  readonly fallen: boolean;
  readonly fallT: number;
  readonly recoverT: number;
  readonly balance: number;
  readonly grounded: boolean;
  readonly groundDist: number;
  readonly airT: number;
  readonly jumpCooldown: number;
  readonly shoutCooldown: number;
  readonly speed: number;
  readonly hangT: number;
  readonly grabLock: number;
  readonly time: number;
  readonly lastStrideLeg: number;
  readonly inputs: BodyInputs;
  readonly previousInputs: BodyInputs;
  readonly legs: readonly LegControllerState[];
  /** Optional active-ragdoll state added by the body-realism controller. */
  readonly armRaiseSide?: readonly [number, number];
  readonly armYawSide?: readonly [number, number];
  readonly supportFeet?: readonly [boolean, boolean];
  readonly stabilityMargin?: number;
  readonly gripLoads?: readonly [number, number];
  readonly gripStress?: readonly [number, number];
  readonly gripStates?: readonly ["clear" | "slipping", "clear" | "slipping"];
  readonly gripBlocked?: readonly [boolean, boolean];
  readonly fallReason?: string | null;
  readonly unsupportedT?: number;
  readonly unstableT?: number;
  readonly previousCom?: readonly [number, number, number];
  readonly previousComReady?: boolean;
}

export interface LegControllerState {
  readonly lifted: boolean;
  readonly t: number;
  readonly dir: readonly [number, number];
  readonly kickT: number;
  readonly lastPressed: number;
  readonly wasDown: boolean;
  readonly pressTime: number;
}

export interface PhysicsReactorSnapshot {
  readonly version: 1;
  readonly stepHz: number;
  readonly fixedStepSeconds: number;
  readonly tick: number;
  readonly accumulatorSeconds: number;
  readonly controller: BodyControllerState;
  readonly parts: readonly PartPhysicsState[];
  readonly grips: readonly GripDescriptor[];
}

const SNAPSHOT_VERSION = 1 as const;
const DEFAULT_STEP_HZ = 120;
const DEFAULT_MAX_SUBSTEPS = 12;
const DEFAULT_MAX_DEBT_SECONDS = 0.25;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const finiteNonNegative = (v: unknown): v is number => finite(v) && v >= 0;
const bool = (v: unknown): v is boolean => typeof v === "boolean";

function tuple3(v: unknown): v is [number, number, number] {
  return Array.isArray(v) && v.length === 3 && v.every(finite);
}

function tuple4(v: unknown): v is [number, number, number, number] {
  return Array.isArray(v) && v.length === 4 && v.every(finite);
}

function tuple2(v: unknown): v is [number, number] {
  return Array.isArray(v) && v.length === 2 && v.every(finite);
}

function booleanTuple2(v: unknown): v is [boolean, boolean] {
  return Array.isArray(v) && v.length === 2 && v.every(bool);
}

function stringTuple2(v: unknown): v is ["clear" | "slipping", "clear" | "slipping"] {
  return Array.isArray(v) && v.length === 2 && v.every((entry) => entry === "clear" || entry === "slipping");
}

function copyRoleInput(input: RoleInput): RoleInput {
  return {
    f: input.f,
    s: input.s,
    a: input.a,
    b: input.b,
    q: input.q,
    e: input.e,
    lx: input.lx,
    ly: input.ly,
  };
}

function copyInputs(source: BodyInputs): BodyInputs {
  const output = makeInputs();
  for (const role of PHYS_ROLES) output[role] = copyRoleInput(source[role]);
  return output;
}

function assignInputs(target: BodyInputs, source: BodyInputs) {
  for (const role of PHYS_ROLES) Object.assign(target[role], source[role]);
}

function freezeTuple<T extends readonly unknown[]>(tuple: T): T {
  return Object.freeze(tuple.slice() as unknown as T);
}

function freezeInputs(inputs: BodyInputs): BodyInputs {
  for (const role of PHYS_ROLES) Object.freeze(inputs[role]);
  return Object.freeze(inputs);
}

function freezeSnapshot(snapshot: PhysicsReactorSnapshot): PhysicsReactorSnapshot {
  for (const part of snapshot.parts) {
    Object.freeze(part.translation);
    Object.freeze(part.rotation);
    Object.freeze(part.linearVelocity);
    Object.freeze(part.angularVelocity);
    Object.freeze(part);
  }
  for (const grip of snapshot.grips) {
    Object.freeze(grip.localAnchor);
    if (grip.snapFrom) Object.freeze(grip.snapFrom);
    if (grip.snapTo) Object.freeze(grip.snapTo);
    if (grip.targetState) {
      Object.freeze(grip.targetState.translation);
      Object.freeze(grip.targetState.rotation);
      Object.freeze(grip.targetState.linearVelocity);
      Object.freeze(grip.targetState.angularVelocity);
      Object.freeze(grip.targetState);
    }
    Object.freeze(grip);
  }
  for (const leg of snapshot.controller.legs) {
    Object.freeze(leg.dir);
    Object.freeze(leg);
  }
  if (snapshot.controller.armRaiseSide) Object.freeze(snapshot.controller.armRaiseSide);
  if (snapshot.controller.armYawSide) Object.freeze(snapshot.controller.armYawSide);
  if (snapshot.controller.supportFeet) Object.freeze(snapshot.controller.supportFeet);
  if (snapshot.controller.gripLoads) Object.freeze(snapshot.controller.gripLoads);
  if (snapshot.controller.gripStress) Object.freeze(snapshot.controller.gripStress);
  if (snapshot.controller.gripStates) Object.freeze(snapshot.controller.gripStates);
  if (snapshot.controller.gripBlocked) Object.freeze(snapshot.controller.gripBlocked);
  if (snapshot.controller.previousCom) Object.freeze(snapshot.controller.previousCom);
  freezeInputs(snapshot.controller.inputs);
  freezeInputs(snapshot.controller.previousInputs);
  Object.freeze(snapshot.controller.legs);
  Object.freeze(snapshot.controller);
  Object.freeze(snapshot.parts);
  Object.freeze(snapshot.grips);
  return Object.freeze(snapshot);
}

function readOptionalNumber(source: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (finite(value)) return value;
  }
  return undefined;
}

function readOptionalTuple3(value: unknown): readonly [number, number, number] | undefined {
  if (tuple3(value)) return freezeTuple([value[0], value[1], value[2]] as [number, number, number]);
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (finite(v.x) && finite(v.y) && finite(v.z)) return freezeTuple([v.x, v.y, v.z] as [number, number, number]);
  }
  return undefined;
}

function readNumberTuple2(value: unknown): readonly [number, number] | undefined {
  if (!tuple2(value)) return undefined;
  return [value[0], value[1]];
}

function readBooleanTuple2(value: unknown): readonly [boolean, boolean] | undefined {
  if (!booleanTuple2(value)) return undefined;
  return [value[0], value[1]];
}

function readGripStateTuple(value: unknown): readonly ["clear" | "slipping", "clear" | "slipping"] | undefined {
  if (!stringTuple2(value)) return undefined;
  return [value[0], value[1]];
}

function validateRoleInput(value: unknown): value is RoleInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  return (
    finite(input.f) && Math.abs(input.f) <= 1 &&
    finite(input.s) && Math.abs(input.s) <= 1 &&
    bool(input.a) &&
    bool(input.b) &&
    bool(input.q) &&
    bool(input.e) &&
    finite(input.lx) && Math.abs(input.lx) <= Math.PI * 2 &&
    finite(input.ly) && input.ly >= -0.9 && input.ly <= 0.7
  );
}

function validateInputs(value: unknown): value is BodyInputs {
  if (!value || typeof value !== "object") return false;
  const inputs = value as Record<string, unknown>;
  return PHYS_ROLES.every((role) => validateRoleInput(inputs[role]));
}

function validSnapshot(value: unknown, expectedParts: number): value is PhysicsReactorSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Record<string, unknown>;
  if (snapshot.version !== SNAPSHOT_VERSION) return false;
  if (!finite(snapshot.stepHz) || snapshot.stepHz <= 0) return false;
  if (!finite(snapshot.fixedStepSeconds) || snapshot.fixedStepSeconds <= 0) return false;
  if (!finiteNonNegative(snapshot.tick) || !Number.isSafeInteger(snapshot.tick)) return false;
  if (!finiteNonNegative(snapshot.accumulatorSeconds)) return false;
  if (!Array.isArray(snapshot.parts) || (snapshot.parts.length !== 0 && snapshot.parts.length !== expectedParts)) return false;
  if (!Array.isArray(snapshot.grips) || snapshot.grips.length > 2) return false;
  const controller = snapshot.controller as Record<string, unknown> | undefined;
  if (!controller || typeof controller !== "object") return false;
  const numberFields = [
    "heading",
    "headPitch",
    "pelvisYaw",
    "armRaise",
    "armYaw",
    "throwT",
    "crouch",
    "brace",
    "braceStamina",
    "fallT",
    "recoverT",
    "balance",
    "groundDist",
    "airT",
    "jumpCooldown",
    "shoutCooldown",
    "speed",
    "hangT",
    "grabLock",
    "time",
    "lastStrideLeg",
  ];
  if (!numberFields.every((field) => finite(controller[field]) && Math.abs(controller[field] as number) <= 1e6)) return false;
  if (Math.abs(controller.heading as number) > Math.PI * 2 || Math.abs(controller.pelvisYaw as number) > Math.PI * 2 || Math.abs(controller.headPitch as number) > 1.5) return false;
  if (!bool(controller.fallen) || !bool(controller.grounded)) return false;
  if (!validateInputs(controller.inputs) || !validateInputs(controller.previousInputs)) return false;
  if (!Array.isArray(controller.legs) || controller.legs.length !== 2) return false;
  if (controller.armRaiseSide !== undefined && !tuple2(controller.armRaiseSide)) return false;
  if (controller.armYawSide !== undefined && !tuple2(controller.armYawSide)) return false;
  if (controller.supportFeet !== undefined && !booleanTuple2(controller.supportFeet)) return false;
  if (controller.stabilityMargin !== undefined && !finite(controller.stabilityMargin)) return false;
  if (controller.gripLoads !== undefined && !tuple2(controller.gripLoads)) return false;
  if (controller.gripStress !== undefined && !tuple2(controller.gripStress)) return false;
  if (controller.gripStates !== undefined && !stringTuple2(controller.gripStates)) return false;
  if (controller.gripBlocked !== undefined && !booleanTuple2(controller.gripBlocked)) return false;
  if (controller.fallReason !== undefined && controller.fallReason !== null && (typeof controller.fallReason !== "string" || controller.fallReason.length > 64)) return false;
  if (controller.unsupportedT !== undefined && !finiteNonNegative(controller.unsupportedT)) return false;
  if (controller.unstableT !== undefined && !finiteNonNegative(controller.unstableT)) return false;
  if (controller.previousCom !== undefined && !tuple3(controller.previousCom)) return false;
  if (controller.previousComReady !== undefined && !bool(controller.previousComReady)) return false;
  for (const leg of controller.legs) {
    if (!leg || typeof leg !== "object") return false;
    const l = leg as Record<string, unknown>;
    if (!bool(l.lifted) || !finite(l.t) || !tuple2(l.dir) || !finite(l.kickT) || !finite(l.lastPressed) || !bool(l.wasDown) || !finite(l.pressTime)) return false;
  }
  for (const part of snapshot.parts) {
    if (!part || typeof part !== "object") return false;
    const p = part as Record<string, unknown>;
    if (!tuple3(p.translation) || !tuple4(p.rotation) || !tuple3(p.linearVelocity) || !tuple3(p.angularVelocity)) return false;
    if ((p.translation as number[]).some((n) => Math.abs(n) > 1e6) || (p.linearVelocity as number[]).some((n) => Math.abs(n) > 1e5) || (p.angularVelocity as number[]).some((n) => Math.abs(n) > 1e5)) return false;
    const q = p.rotation as number[];
    const qNorm = Math.hypot(q[0], q[1], q[2], q[3]);
    if (qNorm < 1e-6 || qNorm > 1e3) return false;
  }
  const gripHands = new Set<number>();
  for (const grip of snapshot.grips) {
    if (!grip || typeof grip !== "object") return false;
    const g = grip as Record<string, unknown>;
    if (!(g.hand === 0 || g.hand === 1) || !finite(g.id) || !bool(g.isStatic) || !finiteNonNegative(g.mass) || !tuple3(g.localAnchor)) return false;
    if (gripHands.has(g.hand)) return false;
    gripHands.add(g.hand);
    // Rapier encodes generational handles in a JavaScript number; valid
    // handles are not necessarily integer-looking values (e.g. subnormals).
    if (g.targetHandle !== undefined && (!finiteNonNegative(g.targetHandle))) return false;
    if (g.snapFrom !== undefined && !tuple3(g.snapFrom)) return false;
    if (g.snapTo !== undefined && !tuple3(g.snapTo)) return false;
    if (g.snapT !== undefined && !finite(g.snapT)) return false;
    if (g.load !== undefined && !finiteNonNegative(g.load)) return false;
    if (g.stress !== undefined && !finiteNonNegative(g.stress)) return false;
    if (g.slipT !== undefined && !finiteNonNegative(g.slipT)) return false;
    if (g.slipping !== undefined && !bool(g.slipping)) return false;
    if (g.targetState !== undefined) {
      if (!g.targetState || typeof g.targetState !== "object") return false;
      const target = g.targetState as Record<string, unknown>;
      if (!tuple3(target.translation) || !tuple4(target.rotation) || !tuple3(target.linearVelocity) || !tuple3(target.angularVelocity)) return false;
    }
  }
  return true;
}

/** Validate an untrusted network/takeover checkpoint without mutating it. */
export function isPhysicsReactorSnapshot(value: unknown, expectedParts = 11): value is PhysicsReactorSnapshot {
  return validSnapshot(value, expectedParts);
}

/**
 * Owns the fixed-step physics clock and the boundary between game input and
 * the Rapier-backed active-ragdoll controller.  Rendering/network code only
 * sees plain immutable values from this module.
 */
export class PhysicsReactor {
  readonly stepHz: number;
  readonly fixedStepSeconds: number;
  readonly maxSubsteps: number;
  readonly maxDebtSeconds: number;

  private readonly queue: RAPIER_T.EventQueue;
  private readonly ownsQueue: boolean;
  private accumulatorSeconds = 0;
  private tick = 0;
  private disposed = false;

  constructor(private readonly config: PhysicsReactorConfig) {
    this.stepHz = finite(config.stepHz) && config.stepHz > 0 ? config.stepHz : DEFAULT_STEP_HZ;
    this.fixedStepSeconds = 1 / this.stepHz;
    this.maxSubsteps = finite(config.maxSubsteps) && config.maxSubsteps > 0 ? Math.floor(config.maxSubsteps) : DEFAULT_MAX_SUBSTEPS;
    this.maxDebtSeconds = finite(config.maxDebtSeconds) && config.maxDebtSeconds >= this.fixedStepSeconds ? config.maxDebtSeconds : DEFAULT_MAX_DEBT_SECONDS;
    this.queue = config.eventQueue ?? new config.rapier.EventQueue(true);
    this.ownsQueue = !config.eventQueue;
    config.world.timestep = this.fixedStepSeconds;
    // Extra constraint iterations materially improve an articulated body and
    // bilateral grips while remaining inexpensive for one authoritative body.
    config.world.numSolverIterations = Math.max(config.world.numSolverIterations, 8);
    config.world.numInternalPgsIterations = Math.max(config.world.numInternalPgsIterations, 2);
    config.world.maxCcdSubsteps = Math.max(config.world.maxCcdSubsteps, 2);
  }

  get currentTick() {
    return this.tick;
  }

  get accumulator() {
    return this.accumulatorSeconds;
  }

  /** Clear stale render-frame debt when teleporting or beginning a new run. */
  resetClock(resetTick = false) {
    if (this.disposed) return;
    this.accumulatorSeconds = 0;
    if (resetTick) this.tick = 0;
    this.flushSolverCaches();
  }

  advance(realDt: number, inputs: BodyInputs, hooks?: PhysicsReactorHooks): PhysicsReactorAdvanceResult {
    if (this.disposed) throw new Error("PhysicsReactor has been disposed");
    const dt = finiteNonNegative(realDt) ? realDt : 0;
    assignInputs(this.config.body.inputs, inputs);
    // Keep debt for a later frame, but cap pathological tab-suspension debt.
    this.accumulatorSeconds = Math.min(this.maxDebtSeconds, this.accumulatorSeconds + dt);
    const bodyEvents: BodyEvent[] = [];
    const contactForceEvents: ContactForceEvent[] = [];
    let simulatedSteps = 0;
    while (this.accumulatorSeconds >= this.fixedStepSeconds && simulatedSteps < this.maxSubsteps) {
      const context: ReactorStepContext = Object.freeze({ dt: this.fixedStepSeconds, tick: this.tick + 1 });
      hooks?.beforeStep?.(context);
      this.config.body.update(this.fixedStepSeconds);
      this.config.world.step(this.queue);

      const stepBodyEvents: BodyEvent[] = [];
      const stepContactForceEvents: ContactForceEvent[] = [];
      for (const event of this.config.body.events) {
        const copied = { ...event, pos: [event.pos[0], event.pos[1], event.pos[2]] } as BodyEvent;
        bodyEvents.push(copied);
        stepBodyEvents.push(copied);
      }
      this.queue.drainContactForceEvents((event) => {
        const collider1 = event.collider1();
        const collider2 = event.collider2();
        const c1 = this.config.world.getCollider(collider1);
        const c2 = this.config.world.getCollider(collider2);
        const bodyPart1 = this.config.body.colliderHandles.has(collider1);
        const bodyPart2 = this.config.body.colliderHandles.has(collider2);
        const pointCollider = bodyPart1 ? c1 : c2;
        const point = pointCollider?.translation();
        const force = event.totalForce();
        const direction = event.maxForceDirection();
        const copied: ContactForceEvent = {
          collider1,
          collider2,
          totalForce: [force.x, force.y, force.z],
          totalForceMagnitude: event.totalForceMagnitude(),
          maxForceDirection: [direction.x, direction.y, direction.z],
          maxForceMagnitude: event.maxForceMagnitude(),
          position: point ? [point.x, point.y, point.z] : undefined,
          involvesBody: bodyPart1 || bodyPart2,
        };
        contactForceEvents.push(copied);
        stepContactForceEvents.push(copied);
      });
      this.queue.drainCollisionEvents(() => {});
      this.accumulatorSeconds -= this.fixedStepSeconds;
      this.tick++;
      simulatedSteps++;
      if (hooks?.afterStep) {
        const stepResult = this.makeResult(1, 0, stepBodyEvents, stepContactForceEvents);
        hooks.afterStep(context, stepResult);
      }
    }

    const result = this.makeResult(simulatedSteps, clamp(this.accumulatorSeconds / this.fixedStepSeconds, 0, 1), bodyEvents, contactForceEvents);
    return result;
  }

  capture(includePartState = true): PhysicsReactorSnapshot {
    if (this.disposed) throw new Error("PhysicsReactor has been disposed");
    const body = this.config.body;
    const parts: PartPhysicsState[] = includePartState ? body.parts.map((part) => {
      const t = part.translation();
      const r = part.rotation();
      const v = part.linvel();
      const av = part.angvel();
      return {
        translation: [t.x, t.y, t.z],
        rotation: [r.x, r.y, r.z, r.w],
        linearVelocity: [v.x, v.y, v.z],
        angularVelocity: [av.x, av.y, av.z],
      };
    }) : [];
    const bodyWithState = body as unknown as Record<string, unknown>;
    const legs = Array.isArray(bodyWithState.legs)
      ? (bodyWithState.legs as Array<Record<string, unknown>>).map((leg) => ({
          lifted: Boolean(leg.lifted),
          t: Number(leg.t),
          dir: [Number((leg.dir as Record<string, unknown>)?.x), Number((leg.dir as Record<string, unknown>)?.y)] as [number, number],
          kickT: Number(leg.kickT),
          lastPressed: Number(leg.lastPressed),
          wasDown: Boolean(leg.wasDown),
          pressTime: Number(leg.pressTime),
        }))
      : [];
    const scalar = (key: string) => Number(bodyWithState[key]);
    const armRaiseSide = readNumberTuple2(bodyWithState.armRaiseSide);
    const armYawSide = readNumberTuple2(bodyWithState.armYawSide);
    const supportFeet = readBooleanTuple2(bodyWithState.supportFeet);
    const stabilityMargin = finite(bodyWithState.stabilityMargin) ? bodyWithState.stabilityMargin : undefined;
    const gripLoads = readNumberTuple2(bodyWithState.gripLoads);
    const gripStress = readNumberTuple2(bodyWithState.gripStress);
    const gripStates = readGripStateTuple(bodyWithState.gripStates);
    const gripBlocked = readBooleanTuple2(bodyWithState.gripBlocked);
    const fallReason = typeof bodyWithState.fallReason === "string" ? bodyWithState.fallReason : bodyWithState.fallReason === null ? null : undefined;
    const unsupportedT = finite(bodyWithState.unsupportedT) ? bodyWithState.unsupportedT : undefined;
    const unstableT = finite(bodyWithState.unstableT) ? bodyWithState.unstableT : undefined;
    const previousCom = readOptionalTuple3(bodyWithState.previousCom);
    const previousComReady = bool(bodyWithState.previousComReady) ? bodyWithState.previousComReady : undefined;
    const controller: BodyControllerState = {
      heading: scalar("heading"),
      headPitch: scalar("headPitch"),
      pelvisYaw: scalar("pelvisYaw"),
      armRaise: scalar("armRaise"),
      armYaw: scalar("armYaw"),
      throwT: scalar("throwT"),
      crouch: scalar("crouch"),
      brace: scalar("brace"),
      braceStamina: scalar("braceStamina"),
      fallen: Boolean(bodyWithState.fallen),
      fallT: scalar("fallT"),
      recoverT: scalar("recoverT"),
      balance: scalar("balance"),
      grounded: Boolean(bodyWithState.grounded),
      groundDist: scalar("groundDist"),
      airT: scalar("airT"),
      jumpCooldown: scalar("jumpCooldown"),
      shoutCooldown: scalar("shoutCooldown"),
      speed: scalar("speed"),
      hangT: scalar("hangT"),
      grabLock: scalar("grabLock"),
      time: scalar("time"),
      lastStrideLeg: scalar("lastStrideLeg"),
      inputs: copyInputs(body.inputs),
      previousInputs: copyInputs(body.prev),
      legs,
      armRaiseSide,
      armYawSide,
      supportFeet,
      stabilityMargin,
      gripLoads,
      gripStress,
      gripStates,
      gripBlocked,
      fallReason,
      unsupportedT,
      unstableT,
      previousCom,
      previousComReady,
    };
    const grips: GripDescriptor[] = body.holds.map((hold) => ({
      hand: hold.hand,
      id: hold.id,
      isStatic: hold.isStatic,
      mass: hold.mass,
      // Runtime handles are useful for an in-place save/restore, but are not
      // stable across a rebuilt host world and are omitted from compact wire
      // continuations. Those are resolved from the logical prop ID instead.
      targetHandle: includePartState ? hold.target.handle : undefined,
      localAnchor: (() => {
        const holdState = hold as unknown as Record<string, unknown>;
        const localAnchor = holdState.localAnchor;
        if (localAnchor && typeof localAnchor === "object") {
          const a = localAnchor as Record<string, unknown>;
          if (finite(a.x) && finite(a.y) && finite(a.z)) return [a.x, a.y, a.z] as [number, number, number];
        }
        const anchor = hold.joint.anchor2();
        return [anchor.x, anchor.y, anchor.z] as [number, number, number];
      })(),
      snapFrom: hold.snapFrom ? [hold.snapFrom.x, hold.snapFrom.y, hold.snapFrom.z] : undefined,
      snapTo: hold.snapTo ? [hold.snapTo.x, hold.snapTo.y, hold.snapTo.z] : undefined,
      snapT: hold.snapT,
      load: hold.load,
      stress: hold.stress,
      slipT: hold.slipT,
      slipping: hold.slipping,
      targetState: includePartState && !hold.isStatic ? (() => {
        const translation = hold.target.translation();
        const rotation = hold.target.rotation();
        const linearVelocity = hold.target.linvel();
        const angularVelocity = hold.target.angvel();
        return {
          translation: [translation.x, translation.y, translation.z],
          rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
          linearVelocity: [linearVelocity.x, linearVelocity.y, linearVelocity.z],
          angularVelocity: [angularVelocity.x, angularVelocity.y, angularVelocity.z],
        } as PartPhysicsState;
      })() : undefined,
    }));
    return freezeSnapshot({
      version: SNAPSHOT_VERSION,
      stepHz: this.stepHz,
      fixedStepSeconds: this.fixedStepSeconds,
      tick: this.tick,
      accumulatorSeconds: this.accumulatorSeconds,
      controller,
      parts,
      grips,
    });
  }

  /** Restores only after validating every number and tuple in the snapshot. */
  restore(snapshot: PhysicsReactorSnapshot): boolean {
    if (this.disposed || !validSnapshot(snapshot, this.config.body.parts.length)) return false;
    const body = this.config.body;
    // All validation is complete before this first mutation.
    body.releaseAll(false);
    // Rapier retains warm-start/contact impulses outside rigid-body transforms.
    // Flush those caches with every body temporarily disabled so repeated
    // restore-and-replay runs begin from the same solver state without moving
    // props or kinematic level geometry.
    this.flushSolverCaches();
    for (let i = 0; i < snapshot.parts.length; i++) {
      const state = snapshot.parts[i];
      const part = body.parts[i];
      part.setTranslation({ x: state.translation[0], y: state.translation[1], z: state.translation[2] }, true);
      part.setRotation({ x: state.rotation[0], y: state.rotation[1], z: state.rotation[2], w: state.rotation[3] }, true);
      part.setLinvel({ x: state.linearVelocity[0], y: state.linearVelocity[1], z: state.linearVelocity[2] }, true);
      part.setAngvel({ x: state.angularVelocity[0], y: state.angularVelocity[1], z: state.angularVelocity[2] }, true);
      part.resetForces(true);
      part.resetTorques(true);
    }
    const target = body as unknown as Record<string, unknown>;
    const controller = snapshot.controller as unknown as Record<string, unknown>;
    for (const key of [
      "heading",
      "headPitch",
      "pelvisYaw",
      "armRaise",
      "armYaw",
      "throwT",
      "crouch",
      "brace",
      "braceStamina",
      "fallT",
      "recoverT",
      "balance",
      "groundDist",
      "airT",
      "jumpCooldown",
      "shoutCooldown",
      "speed",
      "hangT",
      "grabLock",
      "time",
      "lastStrideLeg",
    ]) target[key] = controller[key];
    target.fallen = snapshot.controller.fallen;
    target.grounded = snapshot.controller.grounded;
    if (snapshot.controller.armRaiseSide) target.armRaiseSide = [snapshot.controller.armRaiseSide[0], snapshot.controller.armRaiseSide[1]];
    if (snapshot.controller.armYawSide) target.armYawSide = [snapshot.controller.armYawSide[0], snapshot.controller.armYawSide[1]];
    if (snapshot.controller.supportFeet) target.supportFeet = [snapshot.controller.supportFeet[0], snapshot.controller.supportFeet[1]];
    if (snapshot.controller.stabilityMargin !== undefined) target.stabilityMargin = snapshot.controller.stabilityMargin;
    if (snapshot.controller.gripLoads) target.gripLoads = [snapshot.controller.gripLoads[0], snapshot.controller.gripLoads[1]];
    if (snapshot.controller.gripStress) target.gripStress = [snapshot.controller.gripStress[0], snapshot.controller.gripStress[1]];
    if (snapshot.controller.gripStates) target.gripStates = [snapshot.controller.gripStates[0], snapshot.controller.gripStates[1]];
    if (snapshot.controller.gripBlocked) target.gripBlocked = [snapshot.controller.gripBlocked[0], snapshot.controller.gripBlocked[1]];
    if (snapshot.controller.fallReason !== undefined) target.fallReason = snapshot.controller.fallReason;
    if (snapshot.controller.unsupportedT !== undefined) target.unsupportedT = snapshot.controller.unsupportedT;
    if (snapshot.controller.unstableT !== undefined) target.unstableT = snapshot.controller.unstableT;
    const previousCom = target.previousCom as { set?: (x: number, y: number, z: number) => void } | undefined;
    if (snapshot.controller.previousCom && typeof previousCom?.set === "function") {
      previousCom.set(snapshot.controller.previousCom[0], snapshot.controller.previousCom[1], snapshot.controller.previousCom[2]);
      target.previousComReady = snapshot.controller.previousComReady ?? true;
    } else {
      // A compact legacy checkpoint without COM history must seed velocity on
      // the first restored step instead of producing a false capture spike.
      target.previousComReady = false;
    }
    assignInputs(body.inputs, snapshot.controller.inputs);
    assignInputs(body.prev, snapshot.controller.previousInputs);
    const legs = target.legs as Array<Record<string, unknown>>;
    for (let i = 0; i < 2; i++) {
      const source = snapshot.controller.legs[i];
      const leg = legs[i];
      if (!leg) continue;
      leg.lifted = source.lifted;
      leg.t = source.t;
      const direction = leg.dir as { set?: (x: number, y: number) => void; x?: number; y?: number };
      if (typeof direction?.set === "function") direction.set(source.dir[0], source.dir[1]);
      else leg.dir = { x: source.dir[0], y: source.dir[1] };
      leg.kickT = source.kickT;
      leg.lastPressed = source.lastPressed;
      leg.wasDown = source.wasDown;
      leg.pressTime = source.pressTime;
    }
    this.tick = snapshot.tick;
    this.accumulatorSeconds = Math.min(this.maxDebtSeconds, snapshot.accumulatorSeconds);
    this.queue.clear();
    const articulatedBody = body as unknown as { rebuildArticulationJoints?: () => void };
    articulatedBody.rebuildArticulationJoints?.();
    // Rebuild logical grips only after the articulated joints and body state
    // are in place.
    this.restoreGrips(snapshot.grips);
    const restoredBody = body as unknown as { prepareAfterRestore?: () => void };
    restoredBody.prepareAfterRestore?.();
    this.config.world.propagateModifiedBodyPositionsToColliders();
    body.events.length = 0;
    return true;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.queue.clear();
    if (this.ownsQueue) this.queue.free();
  }

  private restoreGrips(grips: readonly GripDescriptor[]) {
    if (grips.length === 0) return;
    const candidate = this.config.body as unknown as {
      restoreGrip?: (descriptor: GripDescriptor) => boolean | void;
      recreateGrip?: (descriptor: GripDescriptor) => boolean | void;
    };
    const helper = candidate.restoreGrip ?? candidate.recreateGrip;
    if (!helper) {
      this.config.body.releaseAll(false);
      return;
    }
    for (const grip of grips) {
      try {
        const targetHandle = this.config.resolveGripTargetHandle?.(grip) ?? grip.targetHandle;
        // An incompatible/missing target releases only this logical grip; it
        // must not erase other hands that were restored successfully.
        if (targetHandle === undefined) continue;
        helper.call(candidate, { ...grip, targetHandle });
      } catch {
        // Keep any other compatible hand grip restored by this checkpoint.
      }
    }
  }

  private flushSolverCaches() {
    const enabledBodies: RAPIER_T.RigidBody[] = [];
    this.config.world.forEachRigidBody((rigidBody) => {
      if (!rigidBody.isEnabled()) return;
      enabledBodies.push(rigidBody);
      rigidBody.setEnabled(false);
    });
    this.config.world.step(this.queue);
    this.queue.clear();
    for (const rigidBody of enabledBodies) rigidBody.setEnabled(true);
    this.config.world.propagateModifiedBodyPositionsToColliders();
  }

  private makeResult(simulatedSteps: number, interpolationAlpha: number, bodyEvents: BodyEvent[], contacts: ContactForceEvent[]): ReactorStepResult {
    const body = this.config.body as unknown as Record<string, unknown>;
    const legs = Array.isArray(body.legs) ? (body.legs as Array<Record<string, unknown>>) : [];
    const supportContacts = readOptionalNumber(body, "supportContacts") ?? (Boolean(body.grounded) ? legs.filter((leg) => !Boolean(leg.lifted)).length : 0);
    const heldTargets = new Set<number>();
    const heldMass = this.config.body.holds.reduce((sum, hold) => {
      if (heldTargets.has(hold.target.handle)) return sum;
      heldTargets.add(hold.target.handle);
      return sum + (finite(hold.mass) ? hold.mass : 0);
    }, 0);
    const realism = body.diagnostics && typeof body.diagnostics === "object" ? (body.diagnostics as Record<string, unknown>) : body;
    const diagnostics: PhysicsDiagnostics = {
      tick: this.tick,
      simulatedTime: this.tick * this.fixedStepSeconds,
      accumulatorSeconds: this.accumulatorSeconds,
      debtSeconds: Math.max(0, this.accumulatorSeconds - this.fixedStepSeconds),
      fixedStepSeconds: this.fixedStepSeconds,
      maxSubsteps: this.maxSubsteps,
      balance: finite(body.balance) ? body.balance : 0,
      grounded: Boolean(body.grounded),
      fallen: Boolean(body.fallen),
      speed: finite(body.speed) ? body.speed : 0,
      groundDistance: finite(body.groundDist) ? body.groundDist : Infinity,
      brace: finite(body.brace) ? body.brace : 0,
      supportContacts: Math.max(0, Math.round(supportContacts)),
      heldObjects: heldTargets.size,
      heldMass,
      stabilityMargin: readOptionalNumber(realism, "stabilityMargin", "balanceMargin"),
      gripLoad: readOptionalNumber(realism, "gripLoad", "gripStress"),
      gripStress: readNumberTuple2(realism.gripStress),
      centreOfMass: readOptionalTuple3(realism.centreOfMass ?? realism.com),
      capturePoint: readOptionalTuple3(realism.capturePoint),
      fallReason: typeof realism.fallReason === "string" ? realism.fallReason : realism.fallReason === null ? null : undefined,
    };
    Object.freeze(diagnostics);
    const frozenBodyEvents = Object.freeze(bodyEvents.map((event) => Object.freeze({ ...event, pos: freezeTuple(event.pos) })));
    const frozenContacts = Object.freeze(
      contacts.map((event) =>
        Object.freeze({
          ...event,
          totalForce: freezeTuple(event.totalForce),
          maxForceDirection: freezeTuple(event.maxForceDirection),
          position: event.position ? freezeTuple(event.position) : undefined,
        })
      )
    );
    return Object.freeze({ tick: this.tick, simulatedSteps, interpolationAlpha, bodyEvents: frozenBodyEvents, contactForceEvents: frozenContacts, diagnostics });
  }
}

export default PhysicsReactor;
