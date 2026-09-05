import assert from "node:assert/strict";
import {
  COMMENTARY_STEP_HZ,
  CommentaryDirector,
  isCommentaryCue,
  isCommentarySnapshot,
  type CommentaryDiagnostics,
  type CommentaryObservation,
  type CommentaryObjectiveState,
  type CommentaryResolvedInputs,
  type CommentaryRoleInputs,
} from "../src/game/commentary";

const neutralInput = () => ({ f: 0, s: 0, a: false, b: false, q: false, e: false });
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
  scoreTarget: 3,
  ...overrides,
});

function observation(
  tick: number,
  diagnostics: CommentaryDiagnostics = stableDiagnostics(),
  overrides: Partial<CommentaryObservation> = {},
): CommentaryObservation {
  return { tick, diagnostics, ...overrides };
}

// Strict seat actions are accepted before resolution, while challenge starts
// establish a concrete anticipation cue for every selectable level.
{
  const starts = ["wobble-run", "ferry-job", "summit-sync", "egg-express", "slam-dunk"];
  for (const challengeId of starts) {
    const director = new CommentaryDirector();
    const cue = director.step(observation(0, stableDiagnostics(), { challengeId, events: [{ type: "start" }] }));
    assert.equal(cue?.kind, "start");
    assert.ok((cue?.text.length ?? 0) > 20);
  }
  const director = new CommentaryDirector();
  const roleInputs: CommentaryRoleInputs = {
    lhand: { ...neutralInput(), f: 1 },
    rhand: { ...neutralInput(), f: -1 },
  };
  const cue = stepRange(director, 0, 18, (tick) => observation(tick, {
    ...stableDiagnostics(), heldObjects: 1,
  }, { roleInputs })).at(-1);
  assert.equal(cue?.reason, "hands-opposed");
}

function stepRange(
  director: CommentaryDirector,
  from: number,
  count: number,
  make: (tick: number) => CommentaryObservation,
) {
  const cues = [];
  for (let tick = from; tick < from + count; tick++) {
    const cue = director.step(make(tick));
    if (cue) cues.push(cue);
  }
  return cues;
}

// Event priority is deterministic and one cue is emitted at most per tick.
{
  const director = new CommentaryDirector();
  const cue = director.step(observation(0, {
    ...stableDiagnostics(), fallen: true, grounded: false, supportContacts: 0, fallReason: "no-foot-support",
  }, { events: [{ type: "score" }, { type: "fall", reason: "no-foot-support" }] }));
  assert.equal(cue?.kind, "failure");
  assert.match(cue?.text ?? "", /foot|feet|floor/);
  assert.equal(director.capture().emittedCount, 1);
}

// Stability and grip warnings use hysteresis, then recognize a clutch save.
{
  const director = new CommentaryDirector();
  const dangerous = { ...stableDiagnostics(), stabilityMargin: -0.1 };
  assert.equal(stepRange(director, 0, 11, (tick) => observation(tick, dangerous)).length, 0);
  const warning = director.step(observation(11, dangerous));
  assert.equal(warning?.kind, "near-fail");
  assert.equal(warning?.reason, "stability-low");
  assert.equal(stepRange(director, 12, 17, (tick) => observation(tick)).length, 0);
  const recovery = director.step(observation(29));
  assert.equal(recovery?.kind, "recovery");
  assert.equal(recovery?.reason, "stability-recovered");

  director.reset();
  const strained = { ...stableDiagnostics(), heldObjects: 1, gripStress: [0.78, 0.74] as const };
  const gripCues = stepRange(director, 0, 12, (tick) => observation(tick, strained));
  assert.equal(gripCues.at(-1)?.reason, "grip-strained");
  const safeGrip = { ...stableDiagnostics(), heldObjects: 1, gripStress: [0.2, 0.2] as const };
  const save = stepRange(director, 12, 18, (tick) => observation(tick, safeGrip)).at(-1);
  assert.equal(save?.reason, "grip-recovered");
}

// Distinct danger causes keep independent cooldowns.
{
  const director = new CommentaryDirector();
  const unstable = { ...stableDiagnostics(), stabilityMargin: -0.1 };
  assert.equal(stepRange(director, 0, 12, (tick) => observation(tick, unstable)).at(-1)?.reason, "stability-low");
  const strained = { ...stableDiagnostics(), heldObjects: 1, gripStress: [0.78, 0.75] as const };
  const grip = stepRange(director, 12, 12, (tick) => observation(tick, strained)).at(-1);
  assert.equal(grip?.reason, "grip-strained", "stability coaching must not suppress a different grip danger");
}

// Resolved input history identifies coordination mistakes without assigning blame.
{
  const director = new CommentaryDirector();
  const inputs: CommentaryResolvedInputs = {
    lhand: { ...neutralInput(), f: 1, s: 1 },
    rhand: { ...neutralInput(), f: -1, s: -1 },
  };
  const carrying = { ...stableDiagnostics(), heldObjects: 1 };
  const cue = stepRange(director, 0, 18, (tick) => observation(tick, carrying, { inputs })).at(-1);
  assert.equal(cue?.kind, "coordination");
  assert.equal(cue?.reason, "hands-opposed");
  assert.doesNotMatch(cue?.text ?? "", /\byou\b/i);
}

// Hanging and ordinary one-foot motion are not misclassified as unstable hand timing.
{
  const director = new CommentaryDirector();
  const handMotion: CommentaryResolvedInputs = { lhand: { ...neutralInput(), f: 1 } };
  const hanging = { ...stableDiagnostics(), hanging: true, grounded: true, supportContacts: 0, stabilityMargin: -0.3 };
  const cues = stepRange(director, 0, 30, (tick) => observation(tick, hanging, { inputs: handMotion }));
  assert.equal(cues.some((cue) => cue.reason === "hands-before-stable" || cue.reason === "stability-low"), false);
}

// Actual fall reasons and recent inputs produce natural causal explanations.
{
  const director = new CommentaryDirector();
  const leanInputs: CommentaryResolvedInputs = { torso: { ...neutralInput(), f: 1 } };
  stepRange(director, 0, 10, (tick) => observation(tick, stableDiagnostics(), { inputs: leanInputs }));
  const cue = director.step(observation(10, {
    ...stableDiagnostics(), fallen: true, stabilityMargin: -0.5, fallReason: "capture-point-outside-support",
  }, { events: [{ type: "fall", reason: "capture-point-outside-support" }], inputs: leanInputs }));
  assert.equal(cue?.kind, "failure");
  assert.match(cue?.text ?? "", /torso|momentum/);

  stepRange(director, 11, 30, (tick) => observation(tick, { ...stableDiagnostics(), fallen: true }));
  const recovered = director.step(observation(41, stableDiagnostics(), { events: [{ type: "getup" }] }));
  assert.equal(recovered?.reason, "clutch-getup");
}

// Old hand motion expires and cannot be blamed for a later unrelated fall.
{
  const director = new CommentaryDirector();
  const hands: CommentaryResolvedInputs = { lhand: { ...neutralInput(), f: 1 } };
  const unstable = { ...stableDiagnostics(), stabilityMargin: -0.1 };
  stepRange(director, 0, 10, (tick) => observation(tick, unstable, { inputs: hands }));
  stepRange(director, 10, 90, (tick) => observation(tick));
  const fall = director.step(observation(100, {
    ...stableDiagnostics(), fallen: true, stabilityMargin: -0.4, fallReason: "capture-point-outside-support",
  }, { events: [{ type: "fall", reason: "capture-point-outside-support" }] }));
  assert.doesNotMatch(fall?.text ?? "", /hands|reach/i);
}

// A terminal fall/drop cancels stale near-fail episodes instead of narrating
// danger or a fake recovery after the outcome is already known.
{
  const director = new CommentaryDirector();
  const danger = { ...stableDiagnostics(), stabilityMargin: -0.1 };
  stepRange(director, 0, 11, (tick) => observation(tick, danger));
  const fall = director.step(observation(11, {
    ...danger, fallen: true, grounded: false, supportContacts: 0, fallReason: "excessive-tilt",
  }, { events: [{ type: "fall", reason: "excessive-tilt" }] }));
  assert.equal(fall?.kind, "failure");
  assert.equal(stepRange(director, 12, 24, (tick) => observation(tick, {
    ...danger, fallen: true, grounded: false, supportContacts: 0,
  })).length, 0);

  director.reset();
  const strained = { ...stableDiagnostics(), heldObjects: 1, gripStress: [0.78, 0.78] as const };
  stepRange(director, 0, 11, (tick) => observation(tick, strained));
  const drop = director.step(observation(11, stableDiagnostics(), { events: [{ type: "drop", reason: "grip-overload" }] }));
  assert.equal(drop?.reason, "grip-lost");
  assert.equal(stepRange(director, 12, 24, (tick) => observation(tick)).length, 0);
}

// Level-specific failure events explain the immediate outcome.
{
  const splashDirector = new CommentaryDirector();
  const propSplash = splashDirector.step(observation(0, stableDiagnostics(), { challengeId: "egg-express", events: [{ type: "splash", source: "prop" }] }));
  assert.equal(propSplash?.reason, "splash");
  assert.match(propSplash?.text ?? "", /egg/i);
  const bodySplashDirector = new CommentaryDirector();
  assert.match(bodySplashDirector.step(observation(0, stableDiagnostics(), { events: [{ type: "splash", source: "body" }] }))?.text ?? "", /body|platform/i);
  const crackDirector = new CommentaryDirector();
  assert.equal(crackDirector.step(observation(0, stableDiagnostics(), { events: [{ type: "crack" }] }))?.reason, "egg-cracked");
}

// Objective transitions cover anticipation, progress, payoff, and retry.
{
  const director = new CommentaryDirector();
  director.step(observation(0, stableDiagnostics(), { objective: objective({ running: false }) }));
  assert.equal(director.step(observation(1, stableDiagnostics(), { objective: objective() }))?.kind, "start");
  stepRange(director, 2, 7, (tick) => observation(tick, stableDiagnostics(), { objective: objective() }));
  assert.equal(director.step(observation(9, stableDiagnostics(), { objective: objective({ checkpoint: 0 }) }))?.kind, "checkpoint");
  stepRange(director, 10, 7, (tick) => observation(tick, stableDiagnostics(), { objective: objective({ checkpoint: 0 }) }));
  assert.equal(director.step(observation(17, stableDiagnostics(), { objective: objective({ checkpoint: 0, score: 1 }) }))?.kind, "score");
  stepRange(director, 18, 7, (tick) => observation(tick, stableDiagnostics(), { objective: objective({ checkpoint: 0, score: 1 }) }));
  assert.equal(director.step(observation(25, stableDiagnostics(), { objective: objective({ checkpoint: 0, score: 1, finished: true, running: false }) }))?.kind, "finish");
}

// A suppressed warning clears silently once safe, then must earn hysteresis again.
{
  const director = new CommentaryDirector();
  const danger = { ...stableDiagnostics(), stabilityMargin: -0.1 };
  stepRange(director, 0, 11, (tick) => observation(tick, danger));
  assert.equal(director.step(observation(11, danger, { events: [{ type: "checkpoint" }] }))?.kind, "checkpoint");
  stepRange(director, 12, 18, (tick) => observation(tick));
  assert.equal(director.step(observation(30, danger)), null, "one later danger tick must not reuse the old episode");
}

// Higher-priority feedback delays, but does not permanently consume, a live coordination cue.
{
  const director = new CommentaryDirector();
  const inputs: CommentaryResolvedInputs = {
    lhand: { ...neutralInput(), f: 1, s: 1 },
    rhand: { ...neutralInput(), f: -1, s: -1 },
  };
  const carrying = { ...stableDiagnostics(), heldObjects: 1 };
  stepRange(director, 0, 17, (tick) => observation(tick, carrying, { inputs }));
  assert.equal(director.step(observation(17, carrying, { inputs, events: [{ type: "checkpoint" }] }))?.kind, "checkpoint");
  const delayed = stepRange(director, 18, 8, (tick) => observation(tick, carrying, { inputs }));
  assert.equal(delayed.at(-1)?.reason, "hands-opposed");
}

// Capture/restore reproduces hysteresis, variant selection, IDs, and future cues.
{
  const director = new CommentaryDirector();
  const danger = { ...stableDiagnostics(), stabilityMargin: -0.11 };
  stepRange(director, 0, 7, (tick) => observation(tick, danger));
  const checkpoint = director.capture();
  assert.equal(isCommentarySnapshot(checkpoint), true);
  const first = stepRange(director, 7, 30, (tick) => observation(tick, tick < 12 ? danger : stableDiagnostics()));
  assert.equal(isCommentaryCue(first[0]), true);
  assert.equal(isCommentaryCue({ ...first[0], tone: "loud" }), false);
  assert.equal(director.restore(checkpoint), true);
  const second = stepRange(director, 7, 30, (tick) => observation(tick, tick < 12 ? danger : stableDiagnostics()));
  assert.deepEqual(second, first);

  const beforeBadRestore = director.capture();
  assert.equal(director.restore({ ...checkpoint, stepHz: 60 }), false);
  assert.equal(isCommentarySnapshot({ ...checkpoint, lastCueTick: checkpoint.lastTick + 1 }), false);
  assert.deepEqual(director.capture(), beforeBadRestore);
}

// Retry resets incidents while preserving phrase history.
{
  const director = new CommentaryDirector();
  const first = director.step(observation(0, stableDiagnostics(), { challengeId: "wobble-run", events: [{ type: "start" }] }))!;
  director.reset({ preservePhrases: true });
  const retry = director.step(observation(0, stableDiagnostics(), { challengeId: "wobble-run", events: [{ type: "retry" }] }))!;
  assert.notEqual(retry.text, first.text);
}

// Repeated situations rotate phrases deterministically and occasionally use humor.
{
  const director = new CommentaryDirector();
  const texts: string[] = [];
  for (let episode = 0; episode < 5; episode++) {
    const tick = episode * 121;
    const cue = director.step(observation(tick === 0 ? 0 : tick, {
      ...stableDiagnostics(), fallen: true, grounded: false, supportContacts: 0, fallReason: "no-foot-support",
    }, { events: [{ type: "fall", reason: "no-foot-support" }] }));
    if (cue) texts.push(cue.text);
    if (episode < 4) {
      for (let t = tick + 1; t <= tick + 120; t++) {
        director.step(observation(t, t === tick + 1 ? stableDiagnostics() : stableDiagnostics()));
      }
    }
  }
  assert.notEqual(texts[0], texts[1]);
  assert.match(texts[4], /day off|floor|foot|feet/);
}

// Invalid timing/state is rejected before it can corrupt deterministic history.
{
  const director = new CommentaryDirector();
  director.step(observation(0));
  assert.throws(() => director.step(observation(2)), /contiguous/);
  assert.throws(() => new CommentaryDirector().step(observation(0, { ...stableDiagnostics(), balance: Number.NaN })), /diagnostics/);
}

assert.equal(COMMENTARY_STEP_HZ, 120);
console.log("commentary director deterministic checks passed");
