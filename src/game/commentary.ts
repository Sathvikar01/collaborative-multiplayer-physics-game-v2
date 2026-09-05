import type { BodyEvent } from "./body";
import type { PhysRole, Role, RoleInput } from "./types";

export const COMMENTARY_STEP_HZ = 120 as const;

const NEVER = -1_000_000_000;
const STABILITY_ENTER_TICKS = 12;
const STABILITY_EXIT_TICKS = 18;
const GRIP_ENTER_TICKS = 12;
const GRIP_EXIT_TICKS = 18;
const COORDINATION_TICKS = 18;
const GLOBAL_COOLDOWN_TICKS = Math.round(COMMENTARY_STEP_HZ * 2.2);
const MIN_CUE_SPACING_TICKS = Math.ceil(COMMENTARY_STEP_HZ / 15);
const MAX_WIRE_TEXT = 180;

export type CommentaryCueKind =
  | "start"
  | "failure"
  | "near-fail"
  | "coordination"
  | "recovery"
  | "checkpoint"
  | "score"
  | "finish";

export type CommentaryTone = "info" | "warning" | "good" | "bad";

export interface CommentaryCue {
  readonly id: string;
  readonly tick: number;
  readonly kind: CommentaryCueKind;
  readonly tone: CommentaryTone;
  readonly reason: string;
  readonly text: string;
}

export interface CommentaryDiagnostics {
  readonly balance: number;
  readonly grounded: boolean;
  readonly fallen: boolean;
  readonly stabilityMargin?: number;
  readonly gripStress?: readonly [number, number];
  readonly supportContacts: number;
  readonly heldObjects: number;
  readonly hanging?: boolean;
  readonly fallReason?: string | null;
}

export type CommentaryInput = Pick<RoleInput, "f" | "s" | "a" | "b" | "q" | "e">;
export type CommentaryResolvedInputs = Readonly<Partial<Record<PhysRole, CommentaryInput>>>;
export type CommentaryRoleInputs = Readonly<Partial<Record<Role, CommentaryInput>>>;

export type CommentaryEvent =
  | Pick<BodyEvent, "type" | "reason" | "hand" | "propId">
  | {
      readonly type: "start" | "retry" | "checkpoint" | "score" | "finish" | "splash" | "crack";
      readonly value?: number;
      readonly source?: "body" | "prop";
      readonly propId?: number;
    };

export interface CommentaryObjectiveState {
  readonly running: boolean;
  readonly finished: boolean;
  readonly checkpoint: number;
  readonly score: number;
  readonly scoreTarget: number;
}

/** One observation from the authoritative 120 Hz simulation. */
export interface CommentaryObservation {
  readonly tick: number;
  readonly diagnostics: CommentaryDiagnostics;
  readonly challengeId?: string;
  readonly events?: readonly CommentaryEvent[];
  /** Authoritative, physics-facing inputs after seat resolution. */
  readonly inputs?: CommentaryResolvedInputs;
  /** Optional pre-resolution seat actions, useful for strict-role replays. */
  readonly roleInputs?: CommentaryRoleInputs;
  readonly objective?: CommentaryObjectiveState;
}

interface DetectorState {
  stabilityDangerTicks: number;
  stabilitySafeTicks: number;
  stabilityActive: boolean;
  stabilityAnnounced: boolean;
  gripDangerTicks: number;
  gripSafeTicks: number;
  gripActive: boolean;
  gripAnnounced: boolean;
  handConflictTicks: number;
  handsEarlyTicks: number;
  feetTogetherTicks: number;
  torsoLeanTicks: number;
  handConflictLatched: boolean;
  handsEarlyLatched: boolean;
  feetTogetherLatched: boolean;
}

export interface CommentarySnapshot {
  readonly version: 1;
  readonly stepHz: typeof COMMENTARY_STEP_HZ;
  readonly lastTick: number;
  readonly emittedCount: number;
  readonly lastCueTick: number;
  readonly lastText: string | null;
  readonly lastFallTick: number;
  readonly previousFallen: boolean;
  readonly detector: Readonly<DetectorState>;
  readonly objective: CommentaryObjectiveState | null;
  readonly lastByKind: Readonly<Record<CommentaryCueKind, number>>;
  readonly lastByReason: readonly (readonly [string, number])[];
  readonly variantCursors: readonly (readonly [string, number])[];
}

interface Candidate {
  kind: CommentaryCueKind;
  tone: CommentaryTone;
  priority: number;
  reason: string;
  phraseKey: string;
  phrases: readonly string[];
  humor?: readonly string[];
  mark?:
    | "stability-announced"
    | "stability-cleared"
    | "grip-announced"
    | "grip-cleared"
    | "hand-conflict-latched"
    | "hands-early-latched"
    | "feet-together-latched";
}

const KINDS: readonly CommentaryCueKind[] = [
  "start", "failure", "near-fail", "coordination", "recovery", "checkpoint", "score", "finish",
];
const TONES: readonly CommentaryTone[] = ["info", "warning", "good", "bad"];

const KIND_COOLDOWN: Record<CommentaryCueKind, number> = {
  start: 120,
  failure: 120,
  "near-fail": 600,
  coordination: 480,
  recovery: 90,
  checkpoint: 90,
  score: 45,
  finish: 1_000_000_000,
};

function emptyLastByKind(): Record<CommentaryCueKind, number> {
  return {
    start: NEVER,
    failure: NEVER,
    "near-fail": NEVER,
    coordination: NEVER,
    recovery: NEVER,
    checkpoint: NEVER,
    score: NEVER,
    finish: NEVER,
  };
}

function emptyDetector(): DetectorState {
  return {
    stabilityDangerTicks: 0,
    stabilitySafeTicks: 0,
    stabilityActive: false,
    stabilityAnnounced: false,
    gripDangerTicks: 0,
    gripSafeTicks: 0,
    gripActive: false,
    gripAnnounced: false,
    handConflictTicks: 0,
    handsEarlyTicks: 0,
    feetTogetherTicks: 0,
    torsoLeanTicks: 0,
    handConflictLatched: false,
    handsEarlyLatched: false,
    feetTogetherLatched: false,
  };
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const integer = (value: unknown): value is number => finite(value) && Number.isSafeInteger(value);
const bool = (value: unknown): value is boolean => typeof value === "boolean";
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

function validObjective(value: unknown): value is CommentaryObjectiveState {
  if (!record(value)) return false;
  return bool(value.running) && bool(value.finished)
    && integer(value.checkpoint) && value.checkpoint >= -1 && value.checkpoint <= 100
    && integer(value.score) && value.score >= 0 && value.score <= 10_000
    && integer(value.scoreTarget) && value.scoreTarget >= 0 && value.scoreTarget <= 10_000;
}

function validDetector(value: unknown): value is DetectorState {
  if (!record(value)) return false;
  const counters = [
    "stabilityDangerTicks", "stabilitySafeTicks", "gripDangerTicks", "gripSafeTicks",
    "handConflictTicks", "handsEarlyTicks", "feetTogetherTicks", "torsoLeanTicks",
  ];
  const flags = [
    "stabilityActive", "stabilityAnnounced", "gripActive", "gripAnnounced",
    "handConflictLatched", "handsEarlyLatched", "feetTogetherLatched",
  ];
  if (!counters.every((key) => integer(value[key]) && (value[key] as number) >= 0 && (value[key] as number) <= COMMENTARY_STEP_HZ * 60)
    || !flags.every((key) => bool(value[key]))) return false;
  if (!value.stabilityActive && (value.stabilityAnnounced || (value.stabilityDangerTicks as number) >= STABILITY_ENTER_TICKS)) return false;
  if (!value.gripActive && (value.gripAnnounced || (value.gripDangerTicks as number) >= GRIP_ENTER_TICKS)) return false;
  if (value.stabilityAnnounced && !value.stabilityActive) return false;
  if (value.gripAnnounced && !value.gripActive) return false;
  return true;
}

const validTimelineTick = (value: unknown, lastTick: number): value is number =>
  integer(value) && (value === NEVER || (value >= 0 && value <= lastTick));

/** Strict wire validator shared by browser and server snapshot adapters. */
export function isCommentaryCue(value: unknown): value is CommentaryCue {
  if (!record(value)) return false;
  return typeof value.id === "string" && value.id.length > 0 && value.id.length <= 96
    && integer(value.tick) && value.tick >= 0
    && KINDS.includes(value.kind as CommentaryCueKind)
    && TONES.includes(value.tone as CommentaryTone)
    && typeof value.reason === "string" && value.reason.length > 0 && value.reason.length <= 80
    && typeof value.text === "string" && value.text.length > 0 && value.text.length <= MAX_WIRE_TEXT;
}

/** Fast boundary check for host-migration/replay state. */
export function isCommentarySnapshot(value: unknown): value is CommentarySnapshot {
  if (!record(value) || value.version !== 1 || value.stepHz !== COMMENTARY_STEP_HZ) return false;
  if (!integer(value.lastTick) || (value.lastTick as number) < -1) return false;
  if (!integer(value.emittedCount) || (value.emittedCount as number) < 0 || (value.emittedCount as number) > 1_000_000_000) return false;
  if (!validTimelineTick(value.lastCueTick, value.lastTick as number) || !validTimelineTick(value.lastFallTick, value.lastTick as number)) return false;
  if (!(value.lastText === null || (typeof value.lastText === "string" && value.lastText.length <= MAX_WIRE_TEXT))) return false;
  if (!bool(value.previousFallen) || !validDetector(value.detector)) return false;
  if (!(value.objective === null || validObjective(value.objective))) return false;
  const lastByKind = value.lastByKind;
  if (!record(lastByKind) || !KINDS.every((kind) => validTimelineTick(lastByKind[kind], value.lastTick as number))) return false;
  if (!Array.isArray(value.lastByReason) || value.lastByReason.length > 64) return false;
  if (!value.lastByReason.every((entry) => Array.isArray(entry) && entry.length === 2
    && typeof entry[0] === "string" && entry[0].length > 0 && entry[0].length <= 80
    && validTimelineTick(entry[1], value.lastTick as number))) return false;
  if (!Array.isArray(value.variantCursors) || value.variantCursors.length > 64) return false;
  const valid = value.variantCursors.every((entry) => Array.isArray(entry) && entry.length === 2
    && typeof entry[0] === "string" && entry[0].length <= 96
    && integer(entry[1]) && entry[1] >= 0 && entry[1] <= 1_000_000_000);
  if (!valid) return false;
  try { return JSON.stringify(value).length <= 8_192; } catch { return false; }
}

function validInput(value: unknown): value is CommentaryInput {
  if (!record(value)) return false;
  return finite(value.f) && Math.abs(value.f) <= 1
    && finite(value.s) && Math.abs(value.s) <= 1
    && bool(value.a) && bool(value.b) && bool(value.q) && bool(value.e);
}

function assertObservation(observation: CommentaryObservation) {
  if (!record(observation) || !integer(observation.tick) || observation.tick < 0) throw new TypeError("Invalid commentary tick");
  const d = observation.diagnostics;
  if (!record(d) || !finite(d.balance) || !bool(d.grounded) || !bool(d.fallen)
    || !integer(d.supportContacts) || d.supportContacts < 0 || d.supportContacts > 8
    || !integer(d.heldObjects) || d.heldObjects < 0 || d.heldObjects > 16
    || (d.hanging !== undefined && !bool(d.hanging))
    || (d.stabilityMargin !== undefined && !finite(d.stabilityMargin))
    || (d.fallReason !== undefined && d.fallReason !== null && typeof d.fallReason !== "string")
    || (d.gripStress !== undefined && (!Array.isArray(d.gripStress) || d.gripStress.length !== 2 || !d.gripStress.every(finite)))) {
    throw new TypeError("Invalid commentary diagnostics");
  }
  if (observation.objective !== undefined && !validObjective(observation.objective)) throw new TypeError("Invalid commentary objective");
  if (observation.challengeId !== undefined
    && (typeof observation.challengeId !== "string" || observation.challengeId.length === 0 || observation.challengeId.length > 64)) {
    throw new TypeError("Invalid commentary challenge");
  }
  validateInputRecord(observation.inputs, ["head", "lhand", "rhand", "torso", "lleg", "rleg"]);
  validateInputRecord(observation.roleInputs, ["arms", "torso", "legs", "lhand", "rhand", "lleg", "rleg", "head"]);
}

function validateInputRecord(value: unknown, allowed: readonly string[]) {
  if (value === undefined) return;
  if (!record(value)) throw new TypeError("Invalid commentary inputs");
  for (const role of Object.keys(value)) {
    if (!allowed.includes(role) || !validInput(value[role])) throw new TypeError("Invalid commentary inputs");
  }
}

function axisMagnitude(input: CommentaryInput | undefined): number {
  return input ? Math.hypot(input.f, input.s) : 0;
}

function updateCounter(current: number, condition: boolean, maximum = COMMENTARY_STEP_HZ * 4): number {
  return condition ? Math.min(maximum, current + 1) : Math.max(0, current - 2);
}

function hasEvent(events: readonly CommentaryEvent[], type: CommentaryEvent["type"]): boolean {
  return events.some((event) => event.type === type);
}

function eventOf(events: readonly CommentaryEvent[], type: CommentaryEvent["type"]): CommentaryEvent | undefined {
  return events.find((event) => event.type === type);
}

function failureCopy(reason: string, detector: DetectorState): Pick<Candidate, "reason" | "phraseKey" | "phrases" | "humor"> {
  if (reason === "no-foot-support") {
    const coordinatedCause = detector.feetTogetherTicks >= 8;
    return {
      reason,
      phraseKey: coordinatedCause ? "fall-feet-together" : "fall-no-support",
      phrases: coordinatedCause
        ? ["The body fell because both feet left support together.", "Both feet moved at once, so the body ran out of floor."]
        : ["The body fell after losing all foot support.", "No planted foot was left to catch the body."],
      humor: ["Both feet took the same day off."],
    };
  }
  if (reason === "capture-point-outside-support") {
    if (detector.handsEarlyTicks >= 8) {
      return {
        reason,
        phraseKey: "fall-hands-before-stable",
        phrases: ["The hands moved before the body was stable.", "The hands were moving while support was already unstable."],
        humor: ["The hands filed the plan before the feet approved it."],
      };
    }
    if (detector.torsoLeanTicks >= 8) {
      return {
        reason,
        phraseKey: "fall-torso-lean",
        phrases: ["The body fell because the torso leaned beyond the feet.", "The torso moved outside the planted support."],
        humor: ["The torso arrived before the feet did."],
      };
    }
    return {
      reason,
      phraseKey: "fall-capture-point",
      phrases: ["Momentum carried the body beyond its planted feet.", "The balance point moved outside the available support."],
      humor: ["Momentum submitted a plan without consulting the feet."],
    };
  }
  if (reason === "excessive-tilt") {
    return {
      reason,
      phraseKey: "fall-tilt",
      phrases: ["The body tipped too far to recover.", "The torso leaned past the recoverable angle."],
      humor: ["Gravity won that very brief committee meeting."],
    };
  }
  return {
    reason: reason || "fall",
    phraseKey: "fall-generic",
    phrases: ["The body lost balance and went down.", "That wobble crossed the point of recovery."],
    humor: ["Gravity collected its tiny membership fee."],
  };
}

/**
 * Deterministic, host-side commentary policy. It observes the game; it never
 * owns physics, scoring, controls, networking, or wall-clock time.
 */
export class CommentaryDirector {
  private lastTick = -1;
  private emittedCount = 0;
  private lastCueTick = NEVER;
  private lastText: string | null = null;
  private lastFallTick = NEVER;
  private previousFallen = false;
  private detector = emptyDetector();
  private objective: CommentaryObjectiveState | null = null;
  private lastByKind = emptyLastByKind();
  private lastByReason = new Map<string, number>();
  private variantCursors = new Map<string, number>();

  reset(options: { preservePhrases?: boolean } = {}): void {
    const preservePhrases = options.preservePhrases === true;
    const emittedCount = this.emittedCount;
    const lastText = this.lastText;
    const variantCursors = this.variantCursors;
    this.lastTick = -1;
    this.emittedCount = preservePhrases ? emittedCount : 0;
    this.lastCueTick = NEVER;
    this.lastText = preservePhrases ? lastText : null;
    this.lastFallTick = NEVER;
    this.previousFallen = false;
    this.detector = emptyDetector();
    this.objective = null;
    this.lastByKind = emptyLastByKind();
    this.lastByReason = new Map();
    this.variantCursors = preservePhrases ? variantCursors : new Map();
  }

  capture(): CommentarySnapshot {
    const snapshot: CommentarySnapshot = {
      version: 1,
      stepHz: COMMENTARY_STEP_HZ,
      lastTick: this.lastTick,
      emittedCount: this.emittedCount,
      lastCueTick: this.lastCueTick,
      lastText: this.lastText,
      lastFallTick: this.lastFallTick,
      previousFallen: this.previousFallen,
      detector: { ...this.detector },
      objective: this.objective ? { ...this.objective } : null,
      lastByKind: { ...this.lastByKind },
      lastByReason: [...this.lastByReason.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
      variantCursors: [...this.variantCursors.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
    };
    Object.freeze(snapshot.detector);
    if (snapshot.objective) Object.freeze(snapshot.objective);
    Object.freeze(snapshot.lastByKind);
    for (const entry of snapshot.lastByReason) Object.freeze(entry);
    Object.freeze(snapshot.lastByReason);
    for (const entry of snapshot.variantCursors) Object.freeze(entry);
    Object.freeze(snapshot.variantCursors);
    return Object.freeze(snapshot);
  }

  restore(value: unknown): boolean {
    if (!isCommentarySnapshot(value)) return false;
    this.lastTick = value.lastTick;
    this.emittedCount = value.emittedCount;
    this.lastCueTick = value.lastCueTick;
    this.lastText = value.lastText;
    this.lastFallTick = value.lastFallTick;
    this.previousFallen = value.previousFallen;
    this.detector = { ...value.detector };
    this.objective = value.objective ? { ...value.objective } : null;
    this.lastByKind = { ...value.lastByKind };
    this.lastByReason = new Map(value.lastByReason);
    this.variantCursors = new Map(value.variantCursors);
    return true;
  }

  step(observation: CommentaryObservation): CommentaryCue | null {
    assertObservation(observation);
    if (this.lastTick >= 0 && observation.tick !== this.lastTick + 1) {
      throw new RangeError(`Commentary ticks must be contiguous at ${COMMENTARY_STEP_HZ} Hz`);
    }
    this.lastTick = observation.tick;

    const events = observation.events ?? [];
    const d = observation.diagnostics;
    const candidates: Candidate[] = [];
    this.updateRecentActions(observation);
    this.updateDangerEpisodes(d);

    const fallEvent = eventOf(events, "fall");
    const fellNow = !!fallEvent || (d.fallen && !this.previousFallen);
    const gotUpNow = hasEvent(events, "getup") || (!d.fallen && this.previousFallen);
    if (fellNow) {
      this.lastFallTick = observation.tick;
      const eventReason = fallEvent && "reason" in fallEvent ? fallEvent.reason : undefined;
      const copy = failureCopy(eventReason ?? d.fallReason ?? "fall", this.detector);
      candidates.push({ kind: "failure", tone: "bad", priority: 100, ...copy });
      // A fall terminates the near-fall episode. The explicit get-up event is
      // the only recovery signal while the body is down.
      this.detector.stabilityActive = false;
      this.detector.stabilityAnnounced = false;
      this.detector.stabilityDangerTicks = 0;
      this.detector.stabilitySafeTicks = 0;
    }

    if (hasEvent(events, "drop") || hasEvent(events, "slip")) {
      candidates.push({
        kind: "coordination", tone: "warning", priority: 82, reason: "grip-lost", phraseKey: "grip-lost",
        phrases: ["The grip gave way under the load.", "The load slipped after grip stress peaked."],
        humor: ["The cargo has briefly chosen independence."],
      });
      // Losing the object is not a successful grip recovery and must not be
      // followed by a stale strain warning on the next tick.
      this.clearGripEpisode();
    }

    if (hasEvent(events, "splash")) {
      const splash = eventOf(events, "splash");
      const source = splash && "source" in splash ? splash.source : undefined;
      const propCopy = observation.challengeId === "egg-express"
        ? ["The egg hit the water — it reset to the start.", "The egg splashed down; steady the next carry from spawn."]
        : observation.challengeId === "slam-dunk"
          ? ["The ball dropped out — it reset to its spawn.", "Ball reset. Set the body before the next throw."]
          : ["The cargo hit the water — it reset to the start.", "The load splashed down; secure the next carry from spawn."];
      candidates.push({
        kind: "failure", tone: "bad", priority: 102, reason: "splash", phraseKey: `splash-${source ?? "generic"}`,
        phrases: source === "body" ? ["The body hit the water — recover from the last checkpoint.", "The platform was missed; reset and go again."] : source === "prop" ? propCopy : ["Splash — recover from the last checkpoint.", "The water claimed that attempt; reset and go again."],
        humor: ["The water has accepted another volunteer."],
      });
    }
    if (hasEvent(events, "crack")) {
      candidates.push({
        kind: "failure", tone: "bad", priority: 103, reason: "egg-cracked", phraseKey: "egg-cracked",
        phrases: ["The egg cracked under the impact.", "Too much impact — the egg did not survive that landing."],
        humor: ["The omelette route was not the objective."],
      });
    }

    if (gotUpNow) {
      const clutch = observation.tick - this.lastFallTick <= COMMENTARY_STEP_HZ * 4;
      candidates.push({
        kind: "recovery", tone: "good", priority: 88, reason: clutch ? "clutch-getup" : "getup",
        phraseKey: clutch ? "clutch-getup" : "getup",
        phrases: clutch ? ["Great recovery.", "Clutch recovery — the body is upright again."] : ["Back upright.", "Balance restored."],
        humor: clutch ? ["The wobble has been professionally denied."] : undefined,
      });
    }

    this.addObjectiveCandidates(observation, events, candidates);
    this.addDangerCandidates(d, candidates);
    this.addCoordinationCandidates(d, candidates);

    this.previousFallen = d.fallen;
    if (observation.objective) this.objective = { ...observation.objective };

    const available = candidates
      .filter((candidate) => observation.tick - (this.lastByReason.get(candidate.reason) ?? NEVER) >= KIND_COOLDOWN[candidate.kind])
      .filter((candidate) => {
        const firstSafetyCue = (candidate.kind === "near-fail" || candidate.kind === "coordination")
          && !this.lastByReason.has(candidate.reason);
        return candidate.priority >= 74 || firstSafetyCue || observation.tick - this.lastCueTick >= GLOBAL_COOLDOWN_TICKS;
      })
      .filter((candidate) => candidate.priority >= 100 || observation.tick - this.lastCueTick >= MIN_CUE_SPACING_TICKS)
      .sort((a, b) => b.priority - a.priority || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind));
    const chosen = available[0];
    if (!chosen) return null;

    const text = this.pickPhrase(chosen);
    this.lastByKind[chosen.kind] = observation.tick;
    this.lastByReason.set(chosen.reason, observation.tick);
    this.lastCueTick = observation.tick;
    this.lastText = text;
    this.emittedCount++;
    this.applyMark(chosen.mark);
    return Object.freeze({
      id: `${observation.tick}:${chosen.kind}:${this.emittedCount}`,
      tick: observation.tick,
      kind: chosen.kind,
      tone: chosen.tone,
      reason: chosen.reason,
      text,
    });
  }

  private updateRecentActions(observation: CommentaryObservation) {
    const inputs = observation.inputs;
    const roles = observation.roleInputs;
    const d = observation.diagnostics;
    const leftHand = inputs?.lhand ?? roles?.lhand ?? roles?.arms;
    const rightHand = inputs?.rhand ?? roles?.rhand ?? roles?.arms;
    const leftLeg = inputs?.lleg ?? roles?.lleg ?? roles?.legs;
    const rightLeg = inputs?.rleg ?? roles?.rleg ?? roles?.legs;
    const torso = inputs?.torso ?? roles?.torso;
    const handMismatch = leftHand && rightHand
      ? Math.hypot(leftHand.f - rightHand.f, leftHand.s - rightHand.s)
      : 0;
    const handMotion = Math.max(axisMagnitude(leftHand), axisMagnitude(rightHand));
    const feetTogether = !!leftLeg && !!rightLeg
      && axisMagnitude(leftLeg) > 0.65 && axisMagnitude(rightLeg) > 0.65
      && Math.hypot(leftLeg.f - rightLeg.f, leftLeg.s - rightLeg.s) < 0.3;
    const unstable = d.hanging !== true && d.grounded && (d.stabilityMargin ?? 1) < -0.04;

    this.detector.handConflictTicks = updateCounter(this.detector.handConflictTicks, d.heldObjects > 0 && handMismatch > 1.15);
    this.detector.handsEarlyTicks = updateCounter(this.detector.handsEarlyTicks, handMotion > 0.65 && unstable && !d.fallen, Math.round(COMMENTARY_STEP_HZ * 1.4));
    this.detector.feetTogetherTicks = updateCounter(this.detector.feetTogetherTicks, feetTogether && !d.fallen);
    this.detector.torsoLeanTicks = updateCounter(this.detector.torsoLeanTicks, axisMagnitude(torso) > 0.65 && !d.fallen);

    if (this.detector.handConflictTicks === 0) this.detector.handConflictLatched = false;
    if (this.detector.handsEarlyTicks === 0) this.detector.handsEarlyLatched = false;
    if (this.detector.feetTogetherTicks === 0) this.detector.feetTogetherLatched = false;
  }

  private updateDangerEpisodes(d: CommentaryDiagnostics) {
    const margin = d.stabilityMargin ?? 1;
    const stabilityDanger = d.hanging !== true && !d.fallen && d.grounded && margin <= -0.08;
    const stabilitySafe = d.hanging !== true && !d.fallen && d.grounded && margin >= 0.04;
    this.detector.stabilityDangerTicks = stabilityDanger ? Math.min(COMMENTARY_STEP_HZ * 60, this.detector.stabilityDangerTicks + 1) : Math.max(0, this.detector.stabilityDangerTicks - 2);
    this.detector.stabilitySafeTicks = stabilitySafe ? Math.min(STABILITY_EXIT_TICKS, this.detector.stabilitySafeTicks + 1) : 0;
    if (d.hanging) {
      this.detector.stabilityActive = false;
      this.detector.stabilityAnnounced = false;
      this.detector.stabilityDangerTicks = 0;
      this.detector.stabilitySafeTicks = 0;
    } else {
      if (!this.detector.stabilityActive && this.detector.stabilityDangerTicks >= STABILITY_ENTER_TICKS) {
        this.detector.stabilityActive = true;
        this.detector.stabilityAnnounced = false;
        this.detector.stabilitySafeTicks = 0;
      }
      if (this.detector.stabilityActive && !this.detector.stabilityAnnounced && this.detector.stabilitySafeTicks >= STABILITY_EXIT_TICKS) {
        this.detector.stabilityActive = false;
        this.detector.stabilityDangerTicks = 0;
        this.detector.stabilitySafeTicks = 0;
      }
    }

    if (d.heldObjects === 0) {
      this.clearGripEpisode();
      return;
    }
    const grip = d.gripStress ? Math.max(d.gripStress[0], d.gripStress[1]) : 0;
    const gripDanger = d.heldObjects > 0 && grip >= 0.72;
    const gripSafe = d.heldObjects === 0 || grip <= 0.52;
    this.detector.gripDangerTicks = gripDanger ? Math.min(COMMENTARY_STEP_HZ * 60, this.detector.gripDangerTicks + 1) : Math.max(0, this.detector.gripDangerTicks - 2);
    this.detector.gripSafeTicks = gripSafe ? Math.min(GRIP_EXIT_TICKS, this.detector.gripSafeTicks + 1) : 0;
    if (!this.detector.gripActive && this.detector.gripDangerTicks >= GRIP_ENTER_TICKS) {
      this.detector.gripActive = true;
      this.detector.gripAnnounced = false;
      this.detector.gripSafeTicks = 0;
    }
    if (this.detector.gripActive && !this.detector.gripAnnounced && this.detector.gripSafeTicks >= GRIP_EXIT_TICKS) {
      this.clearGripEpisode();
    }
  }

  private addDangerCandidates(d: CommentaryDiagnostics, candidates: Candidate[]) {
    const currentlyUnstable = d.hanging !== true && !d.fallen && d.grounded && (d.stabilityMargin ?? 1) <= -0.08;
    if (this.detector.stabilityActive && !this.detector.stabilityAnnounced && currentlyUnstable) {
      candidates.push({
        kind: "near-fail", tone: "warning", priority: 66, reason: "stability-low", phraseKey: "stability-low",
        phrases: ["The body is outside its stable base — steady it.", "Balance is nearly gone; plant before the next move."],
        humor: ["The wobble meter is making ambitious career choices."], mark: "stability-announced",
      });
    } else if (this.detector.stabilityActive && this.detector.stabilitySafeTicks >= STABILITY_EXIT_TICKS && this.detector.stabilityAnnounced) {
      candidates.push({
        kind: "recovery", tone: "good", priority: 74, reason: "stability-recovered", phraseKey: "stability-recovered",
        phrases: ["Great recovery.", "The body is stable again — keep the rhythm."],
        humor: ["That wobble has been returned to sender."], mark: "stability-cleared",
      });
    }

    const grip = d.gripStress ? Math.max(d.gripStress[0], d.gripStress[1]) : 0;
    const currentlyStrained = d.heldObjects > 0 && grip >= 0.72;
    if (this.detector.gripActive && !this.detector.gripAnnounced && currentlyStrained) {
      candidates.push({
        kind: "near-fail", tone: "warning", priority: 70, reason: "grip-strained", phraseKey: "grip-strained",
        phrases: ["The grip is close to slipping — steady the load.", "Grip strain is rising; share the load evenly."],
        humor: ["The cargo is considering an escape route."], mark: "grip-announced",
      });
    } else if (this.detector.gripActive && this.detector.gripSafeTicks >= GRIP_EXIT_TICKS && this.detector.gripAnnounced) {
      candidates.push({
        kind: "recovery", tone: "good", priority: 76, reason: "grip-recovered", phraseKey: "grip-recovered",
        phrases: ["Nice save — the grip is secure again.", "The hands settled and the load is stable."],
        humor: ["Cargo escape attempt: cancelled."], mark: "grip-cleared",
      });
    }
  }

  private clearGripEpisode() {
    this.detector.gripActive = false;
    this.detector.gripAnnounced = false;
    this.detector.gripDangerTicks = 0;
    this.detector.gripSafeTicks = 0;
  }

  private addCoordinationCandidates(d: CommentaryDiagnostics, candidates: Candidate[]) {
    if (this.detector.handConflictTicks >= COORDINATION_TICKS && !this.detector.handConflictLatched) {
      candidates.push({
        kind: "coordination", tone: "warning", priority: 72, reason: "hands-opposed", phraseKey: "hands-opposed",
        phrases: ["The hands are pulling against each other.", "The hands disagree on direction; align before lifting."],
        humor: ["The left and right hands have opened negotiations."],
        mark: "hand-conflict-latched",
      });
    }
    if (this.detector.handsEarlyTicks >= COORDINATION_TICKS && !this.detector.handsEarlyLatched) {
      candidates.push({
        kind: "coordination", tone: "warning", priority: 69, reason: "hands-before-stable", phraseKey: "hands-before-stable",
        phrases: ["The hands moved before the body was stable.", "Set the feet, then commit the hands."],
        humor: ["The hands skipped ahead in the choreography."],
        mark: "hands-early-latched",
      });
    }
    if (this.detector.feetTogetherTicks >= COORDINATION_TICKS && !this.detector.feetTogetherLatched && d.supportContacts < 2) {
      candidates.push({
        kind: "coordination", tone: "warning", priority: 68, reason: "feet-together", phraseKey: "feet-together",
        phrases: ["Both feet committed at once; alternate to keep support.", "One foot needs to stay planted while the other moves."],
        humor: ["The feet synchronized the one move they should not."],
        mark: "feet-together-latched",
      });
    }
  }

  private addObjectiveCandidates(observation: CommentaryObservation, events: readonly CommentaryEvent[], candidates: Candidate[]) {
    const next = observation.objective;
    const previous = this.objective;
    const started = hasEvent(events, "start") || hasEvent(events, "retry") || (!!previous && !!next && !previous.running && next.running);
    const checkpoint = hasEvent(events, "checkpoint") || (!!previous && !!next && next.checkpoint > previous.checkpoint);
    const scored = hasEvent(events, "score") || (!!previous && !!next && next.score > previous.score);
    const finished = hasEvent(events, "finish") || (!!previous && !!next && !previous.finished && next.finished);
    if (started) {
      const startCopy = this.challengeStartCopy(observation.challengeId);
      candidates.push({
        kind: "start", tone: "info", priority: 55, reason: hasEvent(events, "retry") ? "retry" : "start",
        phraseKey: `start-${observation.challengeId ?? "generic"}`, ...startCopy,
      });
    }
    if (checkpoint) candidates.push({
      kind: "checkpoint", tone: "good", priority: 84, reason: "checkpoint", phraseKey: "checkpoint",
      phrases: ["Checkpoint secured.", "Progress locked in — next challenge."],
      humor: ["Checkpoint acquired. Gravity may file an appeal."],
    });
    if (scored) {
      const score = next?.score;
      const target = next?.scoreTarget;
      const summit = observation.challengeId === "summit-sync";
      const slam = observation.challengeId === "slam-dunk" && score !== undefined && target;
      candidates.push({
        kind: "score", tone: "good", priority: 90, reason: summit ? "core-placed" : "score", phraseKey: summit ? "core-placed" : "score",
        phrases: summit
          ? ["Core locked. The timing gate is next.", "The core is settled — now beat the gate."]
          : slam
            ? [`Clean basket — ${Math.max(0, target - score)} left.`, `Score ${score}/${target}. Reset for the next throw.`]
            : score !== undefined && target
              ? [`Clean payoff — ${score} of ${target}.`, `Score ${score}/${target}. Keep the sequence.`]
              : ["That counted — clean finish.", "Score secured."],
        humor: summit ? ["Core accepted. Mountain paperwork complete."] : ["Physics has reluctantly awarded the point."],
      });
    }
    if (finished) {
      const clutch = observation.tick - this.lastByKind.recovery <= COMMENTARY_STEP_HZ * 3;
      candidates.push({
        kind: "finish", tone: "good", priority: 110, reason: clutch ? "clutch-finish" : "finish", phraseKey: clutch ? "clutch-finish" : "finish",
        phrases: clutch ? ["Clutch finish — the recovery held.", "Saved it, then finished the job."] : ["Challenge complete — coordinated chaos, converted.", "Finished. The recovery and timing paid off."],
        humor: clutch ? ["Recovery into victory. Completely according to plan."] : ["Victory achieved with the normal amount of structural dignity."],
      });
    }
  }

  private challengeStartCopy(challengeId: string | undefined): Pick<Candidate, "phrases" | "humor"> {
    switch (challengeId) {
      case "wobble-run":
        return { phrases: ["Bridge ahead — settle the body before each narrow step.", "Find the rhythm before the first obstacle."], humor: ["The bridge is narrow; confidence may remain unnecessarily wide."] };
      case "ferry-job":
        return { phrases: ["Ferries move fast — secure the cargo before committing.", "Share the load, then move with the ferry."], humor: ["The cargo has not purchased swimming lessons."] };
      case "summit-sync":
        return { phrases: ["Climb in sequence: plant, reach, then pull.", "The summit rewards patient coordination first."], humor: ["The mountain has reviewed the plan and remains skeptical."] };
      case "egg-express":
        return { phrases: ["Gentle hands — stabilize before moving the egg.", "Protect the egg: smooth starts, softer landings."], humor: ["The egg requests a strictly omelette-free journey."] };
      case "slam-dunk":
        return { phrases: ["Set the body, align the hands, then release.", "Balance first; the throw starts from stable feet."], humor: ["The hoop accepts style, but only after points."] };
      default:
        return { phrases: ["Ready — find the rhythm, then commit.", "Steady first. Fast comes after."], humor: ["Coordination is mandatory; dignity remains optional."] };
    }
  }

  private pickPhrase(candidate: Candidate): string {
    const useHumor = !!candidate.humor?.length && (this.emittedCount + 1) % 5 === 0;
    const pool = useHumor ? candidate.humor! : candidate.phrases;
    const key = `${candidate.phraseKey}:${useHumor ? "humor" : "normal"}`;
    let cursor = this.variantCursors.get(key) ?? 0;
    let text = pool[cursor % pool.length];
    if (text === this.lastText && pool.length > 1) {
      cursor++;
      text = pool[cursor % pool.length];
    }
    this.variantCursors.set(key, cursor + 1);
    return text;
  }

  private applyMark(mark: Candidate["mark"]) {
    if (mark === "stability-announced") this.detector.stabilityAnnounced = true;
    if (mark === "stability-cleared") {
      this.detector.stabilityActive = false;
      this.detector.stabilityAnnounced = false;
      this.detector.stabilityDangerTicks = 0;
      this.detector.stabilitySafeTicks = 0;
    }
    if (mark === "grip-announced") this.detector.gripAnnounced = true;
    if (mark === "grip-cleared") {
      this.clearGripEpisode();
    }
    if (mark === "hand-conflict-latched") this.detector.handConflictLatched = true;
    if (mark === "hands-early-latched") this.detector.handsEarlyLatched = true;
    if (mark === "feet-together-latched") this.detector.feetTogetherLatched = true;
  }
}
