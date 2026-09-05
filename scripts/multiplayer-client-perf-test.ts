import assert from "node:assert/strict";
import { performance as nodePerformance } from "node:perf_hooks";
import { PARTS, PART_COUNT, makeInputs } from "../src/game/body";
import { Game, GUEST_INTERPOLATION_DELAY_MS, type Snap } from "../src/game/game";

const RENDER_INTERVAL_MS = 1000 / 60;
const HEALTHY_SNAPSHOT_INTERVAL_MS = 1000 / 15;
const DELAYED_SNAPSHOT_INTERVAL_MS = 140;
const FRAME_BUDGET_MS = RENDER_INTERVAL_MS;
const MIN_SMOOTH_FRAME_COVERAGE = 0.95;
const MIN_JITTERED_FRAME_COVERAGE = 0.985;

let simulatedNow = 0;
const originalPerformance = globalThis.performance;
Object.defineProperty(globalThis, "performance", {
  configurable: true,
  value: { now: () => simulatedNow },
});

type GuestHarness = {
  ownBuffer: { recv: number; snap: Snap }[];
  timer: number;
  score: number;
  displayYaw: number;
  displayPitch: number;
  displayFallen: boolean;
  displayHolding: number;
  movers: never[];
  props: never[];
  onEvent: () => void;
};

type Interpolator = (
  this: GuestHarness,
  buffer: GuestHarness["ownBuffer"],
  out: number[],
  withProps: boolean,
) => boolean;

const applyOwnSnapshot = Game.prototype.applyOwnSnapshot as unknown as (
  this: GuestHarness,
  snapshot: Snap,
) => boolean;
const applyInterpolated = (
  Game.prototype as unknown as { applyInterpolated: Interpolator }
).applyInterpolated;

function makeHarness(): GuestHarness {
  return {
    ownBuffer: [],
    timer: 0,
    score: 0,
    displayYaw: 0,
    displayPitch: 0,
    displayFallen: false,
    displayHolding: 0,
    movers: [],
    props: [],
    onEvent: () => {},
  };
}

function transformsAt(x: number) {
  const transforms: number[] = [];
  for (const part of PARTS) {
    transforms.push(part.pos[0] + x, part.pos[1], part.pos[2], 0, 0, 0, 1);
  }
  return transforms;
}

function snapshotAt(timeMs: number): Snap {
  const inputs = makeInputs();
  return {
    t: timeMs,
    p: transformsAt(timeMs / 1000),
    v: new Array(PART_COUNT * 3).fill(0),
    av: new Array(PART_COUNT * 3).fill(0),
    props: [],
    propMotion: [],
    moverT: 0,
    checkpointIdx: -1,
    delivered: false,
    running: true,
    finished: false,
    yaw: 0,
    pitch: 0,
    timer: timeMs / 1000,
    fallen: 0,
    score: 0,
    ev: [],
    reactor: {
      version: 1,
      stepHz: 120,
      fixedStepSeconds: 1 / 120,
      tick: Math.round((timeMs / 1000) * 120),
      accumulatorSeconds: 0,
      controller: {
        heading: 0,
        headPitch: 0,
        pelvisYaw: 0,
        armRaise: 0,
        armYaw: 0,
        throwT: 0,
        crouch: 0,
        brace: 0,
        braceStamina: 1,
        fallen: false,
        fallT: 0,
        recoverT: 0,
        balance: 1,
        grounded: true,
        groundDist: 0,
        airT: 0,
        jumpCooldown: 0,
        shoutCooldown: 0,
        speed: 1,
        hangT: 0,
        grabLock: 0,
        time: timeMs / 1000,
        lastStrideLeg: 0,
        inputs,
        previousInputs: makeInputs(),
        legs: [
          { lifted: false, t: 0, dir: [0, 0], kickT: 0, lastPressed: 0, wasDown: false, pressTime: 0 },
          { lifted: false, t: 0, dir: [0, 0], kickT: 0, lastPressed: 0, wasDown: false, pressTime: 0 },
        ],
        supportFeet: [true, true],
        stabilityMargin: 0.2,
        gripLoads: [0, 0],
        gripStress: [0, 0],
        gripStates: ["clear", "clear"],
        gripBlocked: [false, false],
        fallReason: null,
        unsupportedT: 0,
        unstableT: 0,
        previousCom: [0, 1, 0],
        previousComReady: true,
      },
      parts: [],
      grips: [],
    },
  };
}

function measureGuestCpu(iterations = 2_000) {
  const guest = makeHarness();
  const out = new Array(PART_COUNT * 7).fill(0);
  const started = nodePerformance.now();
  for (let i = 0; i < iterations; i++) {
    simulatedNow = i * HEALTHY_SNAPSHOT_INTERVAL_MS;
    assert.equal(applyOwnSnapshot.call(guest, snapshotAt(simulatedNow)), true);
    applyInterpolated.call(guest, guest.ownBuffer, out, true);
  }
  const elapsedMs = nodePerformance.now() - started;
  return elapsedMs / iterations;
}

function measureMotionCoverage(snapshotIntervalsMs: number | readonly number[], durationMs = 4_000) {
  const guest = makeHarness();
  const out = new Array(PART_COUNT * 7).fill(0);
  let nextSnapshotAt = 0;
  let intervalIndex = 0;
  let previousX: number | null = null;
  let observedFrames = 0;
  let movingFrames = 0;
  let longestFreezeFrames = 0;
  let currentFreezeFrames = 0;

  for (simulatedNow = 0; simulatedNow <= durationMs; simulatedNow += RENDER_INTERVAL_MS) {
    while (nextSnapshotAt <= simulatedNow + 1e-6) {
      assert.equal(applyOwnSnapshot.call(guest, snapshotAt(nextSnapshotAt)), true);
      const interval = typeof snapshotIntervalsMs === "number"
        ? snapshotIntervalsMs
        : snapshotIntervalsMs[intervalIndex++ % snapshotIntervalsMs.length];
      nextSnapshotAt += interval;
    }
    assert.equal(applyInterpolated.call(guest, guest.ownBuffer, out, true), true);
    const warmupInterval = typeof snapshotIntervalsMs === "number" ? snapshotIntervalsMs : Math.max(...snapshotIntervalsMs);
    if (simulatedNow < GUEST_INTERPOLATION_DELAY_MS + warmupInterval * 2) {
      previousX = out[0];
      continue;
    }
    observedFrames++;
    if (previousX !== null && Math.abs(out[0] - previousX) > 1e-7) {
      movingFrames++;
      currentFreezeFrames = 0;
    } else {
      currentFreezeFrames++;
      longestFreezeFrames = Math.max(longestFreezeFrames, currentFreezeFrames);
    }
    previousX = out[0];
  }

  return {
    coverage: movingFrames / observedFrames,
    longestFreezeFrames,
    effectiveMotionFps: (movingFrames / observedFrames) * 60,
  };
}

function assertTeleportDoesNotExtrapolate() {
  const guest = makeHarness();
  const out = new Array(PART_COUNT * 7).fill(0);
  simulatedNow = 0;
  assert.equal(applyOwnSnapshot.call(guest, snapshotAt(0)), true);
  const teleported = snapshotAt(70);
  for (let part = 0; part < PART_COUNT; part++) teleported.p[part * 7] += 10;
  simulatedNow = 70;
  assert.equal(applyOwnSnapshot.call(guest, teleported), true);
  simulatedNow = 70 + GUEST_INTERPOLATION_DELAY_MS + 120;
  assert.equal(applyInterpolated.call(guest, guest.ownBuffer, out, true), true);
  assert.equal(out[0], teleported.p[0], "checkpoint-sized jumps must snap instead of extrapolating past the destination");
}

try {
  const cpuMs = measureGuestCpu();
  const healthy = measureMotionCoverage(HEALTHY_SNAPSHOT_INTERVAL_MS);
  const delayed = measureMotionCoverage(DELAYED_SNAPSHOT_INTERVAL_MS);
  const jittered = measureMotionCoverage([70, 210], 6_000);
  assertTeleportDoesNotExtrapolate();

  console.log(`guest snapshot+interpolation CPU: ${cpuMs.toFixed(3)} ms/update (${((cpuMs / FRAME_BUDGET_MS) * 100).toFixed(1)}% of one 60 Hz frame)`);
  console.log(`healthy 15 Hz delivery: ${(healthy.coverage * 100).toFixed(1)}% moving frames, ${healthy.effectiveMotionFps.toFixed(1)} effective motion FPS, longest freeze ${healthy.longestFreezeFrames} frame(s)`);
  console.log(`delayed/coalesced 140 ms delivery: ${(delayed.coverage * 100).toFixed(1)}% moving frames, ${delayed.effectiveMotionFps.toFixed(1)} effective motion FPS, longest freeze ${delayed.longestFreezeFrames} frame(s)`);
  console.log(`jittered 70/210 ms delivery: ${(jittered.coverage * 100).toFixed(1)}% moving frames, ${jittered.effectiveMotionFps.toFixed(1)} effective motion FPS, longest freeze ${jittered.longestFreezeFrames} frame(s)`);

  assert.ok(cpuMs < FRAME_BUDGET_MS * 0.25, `guest snapshot work consumed ${cpuMs.toFixed(3)} ms; expected less than 25% of a 60 Hz frame`);
  assert.ok(healthy.coverage >= MIN_SMOOTH_FRAME_COVERAGE, `healthy 15 Hz snapshots only updated ${(healthy.coverage * 100).toFixed(1)}% of presentation frames`);
  assert.ok(
    delayed.coverage >= MIN_SMOOTH_FRAME_COVERAGE,
    `guest interpolation only updated ${(delayed.coverage * 100).toFixed(1)}% of presentation frames when coalesced requests delivered every ${DELAYED_SNAPSHOT_INTERVAL_MS} ms; host-equivalent local motion updates 100%`,
  );
  assert.ok(
    jittered.coverage >= MIN_JITTERED_FRAME_COVERAGE && jittered.longestFreezeFrames <= 1,
    `jittered guest delivery fell to ${(jittered.coverage * 100).toFixed(1)}% moving frames with a ${jittered.longestFreezeFrames}-frame freeze`,
  );

  console.log("multiplayer client performance regression checks passed");
} finally {
  Object.defineProperty(globalThis, "performance", {
    configurable: true,
    value: originalPerformance,
  });
}
