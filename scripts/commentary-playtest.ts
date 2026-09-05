import assert from "node:assert/strict";
import {
  CommentaryDirector,
  type CommentaryCue,
  type CommentaryDiagnostics,
  type CommentaryEvent,
  type CommentaryInput,
  type CommentaryObjectiveState,
  type CommentaryObservation,
  type CommentaryResolvedInputs,
  type CommentaryRoleInputs,
} from "../src/game/commentary";
import {
  CHALLENGES,
  ROLES_3,
  ROLES_5,
  emptyInput,
  type Role,
  type RoleInput,
  type SquadSize,
} from "../src/game/types";
import { makeSquadMixState, resolvePhysInputs } from "../src/game/squad";

const MAX_CUE_LENGTH = 180;
const TRACE_LAST_TICK = 920;

const neutralInput = (): CommentaryInput => ({
  f: 0,
  s: 0,
  a: false,
  b: false,
  q: false,
  e: false,
});

const stableDiagnostics = (): CommentaryDiagnostics => ({
  balance: 1,
  grounded: true,
  fallen: false,
  stabilityMargin: 0.18,
  gripStress: [0, 0],
  supportContacts: 2,
  heldObjects: 0,
  fallReason: null,
});

const objective = (overrides: Partial<CommentaryObjectiveState> = {}): CommentaryObjectiveState => ({
  running: true,
  finished: false,
  checkpoint: -1,
  score: 0,
  scoreTarget: 0,
  ...overrides,
});

function pulseFor(role: Role): CommentaryInput {
  if (role === "arms") return { ...neutralInput(), q: true };
  if (role === "lhand") return { ...neutralInput(), q: true };
  if (role === "rhand") return { ...neutralInput(), e: true };
  if (role === "head") return { ...neutralInput(), a: true };
  return { ...neutralInput(), f: 0.3 };
}

/**
 * A test-only resolved sample. The matrix verifies that authenticated seat
 * provenance reaches the director; it deliberately does not assert mixer
 * behavior or make this mapping part of the gameplay contract.
 */
function resolvedSample(role: Role, input: CommentaryInput, squad: SquadSize): CommentaryResolvedInputs {
  const roleInput: RoleInput = { ...emptyInput(), ...input };
  return resolvePhysInputs({ [role]: roleInput }, squad, 1 / 120, makeSquadMixState());
}

function assertCue(cue: CommentaryCue | null, context: string): asserts cue is CommentaryCue {
  assert.ok(cue, `${context}: expected a cue`);
  assert.ok(cue.text.length > 0, `${context}: cue text must not be empty`);
  assert.ok(cue.text.length <= MAX_CUE_LENGTH, `${context}: cue is too long (${cue.text.length})`);
  assert.ok(!/undefined|null|NaN/.test(cue.text), `${context}: cue leaked invalid state`);
}

function assertCueStream(cues: readonly CommentaryCue[], context: string) {
  const ticks = new Set<number>();
  for (const cue of cues) {
    assertCue(cue, context);
    assert.equal(ticks.has(cue.tick), false, `${context}: more than one cue was emitted at tick ${cue.tick}`);
    ticks.add(cue.tick);
  }
}

const challengeWords: Record<string, RegExp> = {
  "wobble-run": /bridge|rhythm|obstacle/i,
  "ferry-job": /ferr|cargo|load/i,
  "summit-sync": /climb|summit|mountain|plant/i,
  "egg-express": /egg|gentle|landing/i,
  "slam-dunk": /body|hand|release|balance|throw|feet/i,
};

function seatStartObservation(challengeId: string, role: Role, squad: SquadSize): CommentaryObservation {
  const input = pulseFor(role);
  const roleInputs: CommentaryRoleInputs = { [role]: input };
  return {
    tick: 0,
    challengeId,
    diagnostics: stableDiagnostics(),
    roleInputs,
    inputs: resolvedSample(role, input, squad),
    events: [{ type: "start" }],
    objective: objective({ scoreTarget: challengeId === "slam-dunk" ? 3 : 0 }),
  };
}

// Every currently selectable seat is exercised in every challenge. Torso is
// intentionally tested in both squad contracts: 5 * (3 + 5) = 40 cases.
let selectableCases = 0;
for (const challenge of CHALLENGES) {
  const challengeTexts = new Set<string>();
  for (const [squad, roles] of [[3, ROLES_3], [5, ROLES_5]] as const) {
    for (const role of roles) {
      const observation = seatStartObservation(challenge.id, role, squad);
      const first = new CommentaryDirector().step(observation);
      const second = new CommentaryDirector().step(observation);
      const context = `${challenge.id}/${squad}P/${role}`;
      assertCue(first, context);
      assert.deepEqual(second, first, `${context}: identical input must be deterministic`);
      assert.equal(first.kind, "start", `${context}: neutral seat pulse must not be blamed for a failure`);
      assert.equal(first.reason, "start", `${context}: expected anticipation rather than invented causality`);
      assert.match(first.text, challengeWords[challenge.id], `${context}: start cue must fit the challenge`);
      challengeTexts.add(first.text);
      selectableCases++;
    }
  }
  assert.equal(challengeTexts.size, 1, `${challenge.id}: challenge copy must not vary by seat identity`);
}
assert.equal(selectableCases, 40);

// Legacy head remains accepted for replay/room compatibility, but a head-only
// pulse must never create a fabricated limb mistake.
let legacyHeadCases = 0;
for (const challenge of CHALLENGES) {
  const director = new CommentaryDirector();
  const cues: CommentaryCue[] = [];
  for (let tick = 0; tick < 24; tick++) {
    const start = seatStartObservation(challenge.id, "head", 5);
    const cue = director.step({
      ...start,
      tick,
      events: tick === 0 ? start.events : [],
    });
    if (cue) cues.push(cue);
  }
  assertCueStream(cues, `${challenge.id}/legacy-head`);
  assert.deepEqual(cues.map((cue) => cue.kind), ["start"]);
  assert.match(cues[0].text, challengeWords[challenge.id]);
  legacyHeadCases++;
}
assert.equal(legacyHeadCases, 5);

type TraceKind = "wobble" | "ferry" | "summit" | "egg" | "slam";

interface TraceDefinition {
  challengeId: string;
  kind: TraceKind;
  expected: readonly string[];
}

const traces: readonly TraceDefinition[] = [
  {
    challengeId: "wobble-run",
    kind: "wobble",
    expected: ["start", "checkpoint", "stability-low", "stability-recovered", "clutch-finish"],
  },
  {
    challengeId: "ferry-job",
    kind: "ferry",
    expected: ["start", "grip-strained", "grip-recovered", "checkpoint", "finish"],
  },
  {
    challengeId: "summit-sync",
    kind: "summit",
    expected: ["start", "checkpoint", "core-placed", "finish"],
  },
  {
    challengeId: "egg-express",
    kind: "egg",
    expected: ["start", "egg-cracked", "retry", "finish"],
  },
  {
    challengeId: "slam-dunk",
    kind: "slam",
    expected: ["start", "score", "score", "finish"],
  },
];

function traceObservation(
  definition: TraceDefinition,
  squad: SquadSize,
  tick: number,
  rolesSeen: Set<Role>,
): CommentaryObservation {
  const roles = squad === 3 ? ROLES_3 : ROLES_5;
  const roleIndex = tick - 5;
  let roleInputs: CommentaryRoleInputs | undefined;
  let inputs: CommentaryResolvedInputs | undefined;
  if (roleIndex >= 0 && roleIndex < roles.length) {
    const role = roles[roleIndex];
    const input = pulseFor(role);
    rolesSeen.add(role);
    roleInputs = { [role]: input };
    inputs = resolvedSample(role, input, squad);
  }

  let diagnostics = stableDiagnostics();
  let events: CommentaryEvent[] = [];
  let state = objective({ scoreTarget: definition.kind === "slam" ? 3 : 0 });

  if (tick === 0) events = [{ type: "start" }];

  if (definition.kind === "wobble") {
    if (tick >= 300) state = objective({ checkpoint: 0 });
    if (tick === 300) events = [{ type: "checkpoint" }];
    if (tick >= 600 && tick <= 611) diagnostics = { ...stableDiagnostics(), stabilityMargin: -0.1 };
    if (tick >= 900) state = objective({ checkpoint: 0, finished: true, running: false });
    if (tick === 900) events = [{ type: "finish" }];
  }

  if (definition.kind === "ferry") {
    if (tick >= 300 && tick <= 311) diagnostics = {
      ...stableDiagnostics(),
      heldObjects: 1,
      gripStress: [0.78, 0.76],
    };
    if (tick >= 312 && tick < 600) diagnostics = {
      ...stableDiagnostics(),
      heldObjects: 1,
      gripStress: [0.2, 0.18],
    };
    if (tick >= 600) state = objective({ checkpoint: 0 });
    if (tick === 600) events = [{ type: "checkpoint" }];
    if (tick >= 900) state = objective({ checkpoint: 0, finished: true, running: false });
    if (tick === 900) events = [{ type: "finish" }];
  }

  if (definition.kind === "summit") {
    if (tick >= 300) state = objective({ checkpoint: 0 });
    if (tick === 300) events = [{ type: "checkpoint" }];
    if (tick >= 600) state = objective({ checkpoint: 0, score: 1 });
    if (tick === 600) events = [{ type: "score", value: 1 }];
    if (tick >= 900) state = objective({ checkpoint: 0, score: 1, finished: true, running: false });
    if (tick === 900) events = [{ type: "finish" }];
  }

  if (definition.kind === "egg") {
    if (tick === 300) events = [{ type: "crack" }];
    if (tick === 600) events = [{ type: "retry" }];
    if (tick >= 900) state = objective({ finished: true, running: false });
    if (tick === 900) events = [{ type: "finish" }];
  }

  if (definition.kind === "slam") {
    const score = tick >= 900 ? 3 : tick >= 600 ? 2 : tick >= 300 ? 1 : 0;
    state = objective({ score, scoreTarget: 3, finished: tick >= 900, running: tick < 900 });
    if (tick === 300 || tick === 600) events = [{ type: "score", value: score }];
    if (tick === 900) events = [{ type: "score", value: 3 }, { type: "finish" }];
  }

  return {
    tick,
    challengeId: definition.challengeId,
    diagnostics,
    roleInputs,
    inputs,
    events,
    objective: state,
  };
}

function runTrace(definition: TraceDefinition, squad: SquadSize) {
  const director = new CommentaryDirector();
  const rolesSeen = new Set<Role>();
  const observations: CommentaryObservation[] = [];
  const cues: CommentaryCue[] = [];
  for (let tick = 0; tick <= TRACE_LAST_TICK; tick++) {
    const observation = traceObservation(definition, squad, tick, rolesSeen);
    observations.push(observation);
    const cue = director.step(observation);
    if (cue) cues.push(cue);
  }

  assert.deepEqual([...rolesSeen], [...(squad === 3 ? ROLES_3 : ROLES_5)], `${definition.challengeId}/${squad}P: not every seat contributed`);
  assertCueStream(cues, `${definition.challengeId}/${squad}P trace`);
  assert.deepEqual(cues.map((cue) => cue.reason), definition.expected, `${definition.challengeId}/${squad}P: flow cue sequence drifted`);

  const replay = new CommentaryDirector();
  const replayCues = observations.flatMap((observation) => {
    const cue = replay.step(observation);
    return cue ? [cue] : [];
  });
  assert.deepEqual(replayCues, cues, `${definition.challengeId}/${squad}P: replay must be deterministic`);

  // Causal safety: positive completion cannot be narrated as failure, and a
  // neutral, stable trace segment cannot invent a fall or blame a player.
  assert.equal(cues.at(-1)?.kind, "finish");
  assert.equal(cues.at(-1)?.tone, "good");
  assert.equal(cues.some((cue) => /\byou\b/i.test(cue.text)), false);
  return cues;
}

let fullTeamTraces = 0;
for (const definition of traces) {
  for (const squad of [3, 5] as const) {
    runTrace(definition, squad);
    fullTeamTraces++;
  }
}
assert.equal(fullTeamTraces, 10);

console.log(`commentary playtest passed: ${selectableCases} selectable seat/challenge cases, ${legacyHeadCases} legacy-head cases, ${fullTeamTraces} full-team traces`);
