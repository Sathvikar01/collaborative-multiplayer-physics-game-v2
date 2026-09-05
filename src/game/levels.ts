export type V3 = [number, number, number];

export interface StaticDef {
  pos: V3; // center
  size: V3; // full extents
  rot?: V3; // euler xyz
  color?: string;
  top?: string;
  kind?: "ground" | "block" | "wall" | "bridge" | "pillar" | "ramp" | "hurdle" | "pedestal" | "ferry" | "gate";
  grab?: boolean;
  /** kinematic sliding platform / timing blocker: oscillates along axis */
  slide?: { axis: "x" | "z"; dist: number; speed: number; phase?: number };
}

export interface PropDef {
  kind: "ball" | "crate" | "egg";
  pos: V3;
  radius?: number;
  size?: V3;
  mass: number;
  color: string;
  fragile?: boolean;
  scoring?: boolean;
  deliverable?: boolean;
}

export interface ZoneDef {
  pos: V3;
  size: V3;
  spawn?: V3;
}

export interface LevelDef {
  id: string;
  spawn: V3;
  spawnYaw: number;
  statics: StaticDef[];
  props: PropDef[];
  checkpoints: ZoneDef[];
  finish?: ZoneDef;
  deliver?: ZoneDef;
  hoop?: { pos: V3; radius: number; zone: ZoneDef };
  targetScore?: number;
  killY: number;
  fragileForce?: number;
  objective: string;
  /** when true, finish gate only counts after a deliverable has been placed */
  requireDeliverThenFinish?: boolean;
  sky?: { top: string; mid: string; bot: string; fog: string };
  water?: string;
}

const GRASS = "#7dd36a";
const GRASS_SIDE = "#4f8f43";
const STONE = "#c9c2b6";
const STONE_SIDE = "#8d857a";
const WOOD = "#d9a066";
const WOOD_SIDE = "#a06a3a";

function ground(pos: V3, size: V3, extra: Partial<StaticDef> = {}): StaticDef {
  return { pos, size, color: GRASS_SIDE, top: GRASS, kind: "ground", grab: false, ...extra };
}
function stone(pos: V3, size: V3, extra: Partial<StaticDef> = {}): StaticDef {
  return { pos, size, color: STONE_SIDE, top: STONE, kind: "block", grab: true, ...extra };
}
function wood(pos: V3, size: V3, extra: Partial<StaticDef> = {}): StaticDef {
  return { pos, size, color: WOOD_SIDE, top: WOOD, kind: "bridge", grab: true, ...extra };
}

const wobbleRun: LevelDef = {
  id: "wobble-run",
  spawn: [0, 0, 3],
  spawnYaw: 0,
  killY: -2.5,
  objective: "Reach the finish gate",
  statics: [
    ground([0, -0.5, 2], [12, 1, 12]),
    // hurdles field
    ground([0, -0.5, -10], [9, 1, 14]),
    stone([0, 0.18, -6.5], [6, 0.36, 0.3], { kind: "hurdle", color: "#e8564f", top: "#ff7a72" }),
    stone([0, 0.18, -9.5], [6, 0.36, 0.3], { kind: "hurdle", color: "#e8564f", top: "#ff7a72" }),
    stone([0, 0.18, -12.5], [6, 0.36, 0.3], { kind: "hurdle", color: "#e8564f", top: "#ff7a72" }),
    stone([-3.2, 0.5, -10], [0.4, 1, 14], { kind: "wall", color: "#f0e7d8", top: "#fff8ea" }),
    stone([3.2, 0.5, -10], [0.4, 1, 14], { kind: "wall", color: "#f0e7d8", top: "#fff8ea" }),
    // bridge over water
    wood([0, -0.15, -22], [1.5, 0.3, 11]),
    ground([0, -0.5, -30.5], [9, 1, 6]),
    // ramp up 2m over 6.2m
    { pos: [0, 0.98, -36.5], size: [4.5, 0.3, 6.6], rot: [0.313, 0, 0], color: WOOD_SIDE, top: WOOD, kind: "ramp", grab: false },
    stone([0, 1, -42], [7, 2, 6.2]),
    // climbing wall (1.3m above plateau)
    stone([0, 1.575, -49], [7, 3.15, 8], { color: "#7a8fb5", top: "#b7c6e6" }),
    // stairs down
    stone([0, 1.05, -54], [7, 2.1, 2]),
    stone([0, 0.525, -56], [7, 1.05, 2]),
    ground([0, -0.5, -62], [10, 1, 10]),
  ],
  props: [
    { kind: "crate", pos: [-1.2, 3.7, -47], size: [0.7, 0.7, 0.7], mass: 5, color: "#e3b04b" },
    { kind: "ball", pos: [1.3, 3.7, -50], radius: 0.45, mass: 3, color: "#8a5cff" },
    { kind: "crate", pos: [0.6, 3.7, -51.5], size: [0.6, 0.6, 0.6], mass: 4, color: "#e3b04b" },
  ],
  checkpoints: [
    { pos: [0, 1, -30.5], size: [9, 4, 6], spawn: [0, 0, -30] },
    { pos: [0, 3, -42], size: [7, 4, 6], spawn: [0, 2, -42] },
    { pos: [0, 5, -49], size: [7, 4, 8], spawn: [0, 3.15, -49] },
  ],
  finish: { pos: [0, 1.5, -64], size: [8, 4, 2] },
};

const eggExpress: LevelDef = {
  id: "egg-express",
  spawn: [0, 0, 3],
  spawnYaw: 0,
  killY: -2.5,
  objective: "Deliver the egg to the glowing pad",
  fragileForce: 950,
  statics: [
    ground([0, -0.5, 2], [12, 1, 12]),
    stone([0, 0.3, 0], [0.7, 0.6, 0.7], { kind: "pedestal", color: "#b98cff", top: "#e5d4ff", grab: false }),
    ground([0, -0.5, -10], [9, 1, 14]),
    stone([0, 0.15, -7], [6, 0.3, 0.3], { kind: "hurdle", color: "#e8564f", top: "#ff7a72" }),
    stone([0, 0.15, -11], [6, 0.3, 0.3], { kind: "hurdle", color: "#e8564f", top: "#ff7a72" }),
    stone([-3.2, 0.5, -10], [0.4, 1, 14], { kind: "wall", color: "#f0e7d8", top: "#fff8ea" }),
    stone([3.2, 0.5, -10], [0.4, 1, 14], { kind: "wall", color: "#f0e7d8", top: "#fff8ea" }),
    // bumpy stepping blocks over water
    wood([0, -0.15, -19], [2.6, 0.3, 4.2]),
    wood([-1.0, -0.15, -23], [2.6, 0.3, 4.2]),
    wood([0.8, -0.15, -27], [2.6, 0.3, 4.2]),
    ground([0, -0.5, -33], [10, 1, 8]),
    stone([0, 0.35, -34], [2.4, 0.7, 2.4], { kind: "pedestal", color: "#3dc9c0", top: "#a4fff8", grab: false }),
  ],
  props: [{ kind: "egg", pos: [0, 0.95, 0], radius: 0.28, mass: 1.4, color: "#fff4d6", fragile: true, deliverable: true }],
  checkpoints: [{ pos: [0, 1, -10], size: [9, 4, 14], spawn: [0, 0, -4] }],
  deliver: { pos: [0, 1.2, -34], size: [2.4, 1.6, 2.4] },
};

const slamDunk: LevelDef = {
  id: "slam-dunk",
  spawn: [0, 0, 4],
  spawnYaw: 0,
  killY: -2.5,
  objective: "Throw 3 balls through the hoop",
  targetScore: 3,
  statics: [
    ground([0, -0.5, -3], [18, 1, 20]),
    stone([0, 0.5, -10.5], [1.6, 1, 1.6], { color: "#7a8fb5", top: "#b7c6e6" }),
    stone([-5, 0.25, -5], [1.5, 0.5, 1.5], { color: "#ffb347", top: "#ffd27f" }),
    stone([5, 0.25, -5], [1.5, 0.5, 1.5], { color: "#ffb347", top: "#ffd27f" }),
    { pos: [0, 2.2, -12.9], size: [0.25, 4.4, 0.25], color: "#555b6e", top: "#555b6e", kind: "pillar", grab: true },
    { pos: [0, 3.4, -12.75], size: [2.6, 1.6, 0.12], color: "#f4f4f8", top: "#f4f4f8", kind: "wall", grab: true },
  ],
  props: [
    { kind: "ball", pos: [-1.2, 0.5, 2], radius: 0.3, mass: 1.1, color: "#ff8a3d", scoring: true },
    { kind: "ball", pos: [0, 0.5, 1.5], radius: 0.3, mass: 1.1, color: "#ff8a3d", scoring: true },
    { kind: "ball", pos: [1.2, 0.5, 2], radius: 0.3, mass: 1.1, color: "#ff8a3d", scoring: true },
    { kind: "ball", pos: [-2.5, 0.5, 0], radius: 0.3, mass: 1.1, color: "#ff8a3d", scoring: true },
    { kind: "ball", pos: [2.5, 0.5, 0], radius: 0.3, mass: 1.1, color: "#ff8a3d", scoring: true },
  ],
  checkpoints: [],
  hoop: { pos: [0, 2.7, -12], radius: 0.62, zone: { pos: [0, 2.35, -12], size: [1.0, 0.5, 1.0] } },
};

const CANYON_TOP = "#c96f2e";
const CANYON_SIDE = "#7a3f16";
const CANYON_GROUND = "#e8a75c";
const CANYON_GROUND_SIDE = "#8a5a26";
const FERRY = "#4fd1c5";
const FERRY_SIDE = "#237a74";

/** Medium: longer carry course — crouch grab, low squeeze, sliding ferries + narrow beam. */
const ferryJob: LevelDef = {
  id: "ferry-job",
  spawn: [0, 0, 3],
  spawnYaw: 0,
  killY: -2.5,
  objective: "Carry the cargo across the ferries to the glowing pad",
  sky: { top: "#7a3fa0", mid: "#e8955a", bot: "#ffe3c2", fog: "#e8b07e" },
  water: "#2a9db8",
  statics: [
    { pos: [0, -0.5, 2], size: [12, 1, 12], color: CANYON_GROUND_SIDE, top: CANYON_GROUND, kind: "ground", grab: false },
    { pos: [0, 0.3, 0], size: [0.8, 0.6, 0.8], color: "#b98cff", top: "#e5d4ff", kind: "pedestal", grab: false },
    { pos: [0, -0.5, -10], size: [9, 1, 14], color: CANYON_GROUND_SIDE, top: CANYON_GROUND, kind: "ground", grab: false },
    stone([0, 0.15, -7], [6, 0.3, 0.3], { kind: "hurdle", color: "#e8564f", top: "#ff7a72" }),
    // low squeeze bar: Torso must crouch, Arms must lower the cargo (bottom edge y=1.45)
    stone([0, 1.6, -11.5], [6, 0.3, 1.6], { kind: "wall", color: CANYON_SIDE, top: CANYON_TOP, grab: true }),
    stone([-3.2, 0.5, -10], [0.4, 1, 14], { kind: "wall", color: "#f0e7d8", top: "#fff8ea" }),
    stone([3.2, 0.5, -10], [0.4, 1, 14], { kind: "wall", color: "#f0e7d8", top: "#fff8ea" }),
    // dock + two sliding ferries over a long water gap (no floor from -17 to -32.5)
    wood([0, -0.15, -17.5], [3.2, 0.3, 3.6]),
    { pos: [0, -0.15, -21], size: [2.6, 0.3, 2.6], color: FERRY_SIDE, top: FERRY, kind: "ferry", grab: true, slide: { axis: "x", dist: 2.2, speed: 0.9 } },
    { pos: [0, -0.15, -24.5], size: [2.6, 0.3, 2.6], color: FERRY_SIDE, top: FERRY, kind: "ferry", grab: true, slide: { axis: "x", dist: 2.2, speed: 1.15, phase: Math.PI } },
    // narrow exit beam while still carrying
    wood([0, -0.15, -29], [1.2, 0.3, 6]),
    { pos: [0, -0.5, -36.5], size: [10, 1, 8], color: CANYON_GROUND_SIDE, top: CANYON_GROUND, kind: "ground", grab: false },
    stone([0, 0.35, -37.5], [2.4, 0.7, 2.4], { kind: "pedestal", color: "#3dc9c0", top: "#a4fff8", grab: false }),
  ],
  props: [{ kind: "crate", pos: [0, 0.95, 0], size: [0.55, 0.55, 0.55], mass: 4, color: "#e3b04b", deliverable: true }],
  checkpoints: [
    { pos: [0, 1, -10], size: [9, 4, 14], spawn: [0, 0, -4] },
    { pos: [0, 1, -17.5], size: [4, 4, 4], spawn: [0, 0, -16.5] },
    { pos: [0, 1, -36.5], size: [10, 4, 8], spawn: [0, 0, -34.5] },
  ],
  deliver: { pos: [0, 1.2, -37.5], size: [2.4, 1.6, 2.4] },
};

const SLATE_TOP = "#8ea2d8";
const SLATE_SIDE = "#3d4a73";
const SNOW = "#dfe8ff";
const SNOW_SIDE = "#6b7ba6";
const ICE = "#7ef0e2";
const ICE_SIDE = "#2b8a80";

/** Hard: climb high, unstable ferries, precise place, then a timed sweeper gate. */
const summitSync: LevelDef = {
  id: "summit-sync",
  spawn: [0, 0, 3],
  spawnYaw: 0,
  killY: -3.5,
  objective: "Place the core on the peak pad, then sprint the timing gate",
  requireDeliverThenFinish: true,
  sky: { top: "#1b2452", mid: "#4a5aa8", bot: "#c9d4ff", fog: "#8d9bd6" },
  water: "#1f6f8b",
  statics: [
    { pos: [0, -0.5, 2], size: [12, 1, 12], color: SNOW_SIDE, top: SNOW, kind: "ground", grab: false },
    { pos: [0, -0.5, -10], size: [9, 1, 14], color: SNOW_SIDE, top: SNOW, kind: "ground", grab: false },
    stone([0, 0.15, -7], [6, 0.3, 0.3], { kind: "hurdle", color: "#e8564f", top: "#ff7a72" }),
    stone([0, 0.15, -11], [6, 0.3, 0.3], { kind: "hurdle", color: "#e8564f", top: "#ff7a72" }),
    stone([-3.2, 0.5, -10], [0.4, 1, 14], { kind: "wall", color: "#f0e7d8", top: "#fff8ea" }),
    stone([3.2, 0.5, -10], [0.4, 1, 14], { kind: "wall", color: "#f0e7d8", top: "#fff8ea" }),
    // stepped climb: two ~1m pulls onto the ridge (arms pull + legs + brace)
    { pos: [0, -0.5, -19], size: [7, 1, 6], color: SNOW_SIDE, top: SNOW, kind: "ground", grab: false },
    stone([0, 0.15, -22], [7, 1.3, 1.5], { color: SLATE_SIDE, top: SLATE_TOP }),
    stone([0, 0.65, -23.8], [7, 2.5, 1.2], { color: SLATE_SIDE, top: SLATE_TOP }),
    stone([0, 0.9, -26.8], [7, 2.0, 5], { color: SLATE_SIDE, top: SLATE_TOP }),
    { pos: [0, 2.2, -25.5], size: [0.8, 0.6, 0.8], color: "#b98cff", top: "#e5d4ff", kind: "pedestal", grab: false },
    // unstable crossing: dock + 3 small fast ferries + dock over a deep gap (-29.5 to -42)
    wood([0, -0.35, -30.2], [3, 0.3, 2]),
    { pos: [0, -0.35, -32.5], size: [2.2, 0.3, 2.2], color: ICE_SIDE, top: ICE, kind: "ferry", grab: true, slide: { axis: "x", dist: 2.4, speed: 1.3 } },
    { pos: [0, -0.35, -35.5], size: [2.2, 0.3, 2.2], color: ICE_SIDE, top: ICE, kind: "ferry", grab: true, slide: { axis: "x", dist: 2.4, speed: 1.6, phase: Math.PI / 2 } },
    { pos: [0, -0.35, -38.5], size: [2.2, 0.3, 2.2], color: ICE_SIDE, top: ICE, kind: "ferry", grab: true, slide: { axis: "x", dist: 2.4, speed: 1.9, phase: Math.PI } },
    wood([0, -0.35, -41], [3, 0.3, 2]),
    // peak with a SMALL precise pad
    { pos: [0, -0.5, -45.5], size: [8, 1, 7], color: SNOW_SIDE, top: SNOW, kind: "ground", grab: false },
    stone([0, 0.35, -46.5], [1.6, 0.7, 1.6], { kind: "pedestal", color: "#3dc9c0", top: "#a4fff8", grab: false }),
    // narrow ridge to the timing corridor
    wood([0, -0.15, -51], [1.1, 0.3, 5]),
    { pos: [0, -0.5, -57], size: [8, 1, 9], color: SNOW_SIDE, top: SNOW, kind: "ground", grab: false },
    stone([-2.6, 1, -57], [0.4, 2, 9], { kind: "wall", color: SLATE_SIDE, top: SLATE_TOP }),
    stone([2.6, 1, -57], [0.4, 2, 9], { kind: "wall", color: SLATE_SIDE, top: SLATE_TOP }),
    // timing sweeper: wide blocker oscillating across the corridor — mistime it and lose seconds
    { pos: [0, 0.4, -55.5], size: [3.6, 1.1, 0.5], color: "#e8564f", top: "#ff7a72", kind: "gate", grab: false, slide: { axis: "x", dist: 1.6, speed: 2.2 } },
  ],
  props: [{ kind: "crate", pos: [0, 2.8, -25.5], size: [0.5, 0.5, 0.5], mass: 6, color: "#8a5cff", deliverable: true }],
  checkpoints: [
    { pos: [0, 1, -10], size: [9, 4, 14], spawn: [0, 0, -4] },
    { pos: [0, 2.5, -26.8], size: [7, 4, 5], spawn: [0, 2.1, -26.8] },
    { pos: [0, 1, -45.5], size: [8, 4, 7], spawn: [0, 0, -44] },
    { pos: [0, 1, -57], size: [6, 4, 4], spawn: [0, 0, -54.5] },
  ],
  deliver: { pos: [0, 1.2, -46.5], size: [1.6, 1.4, 1.6] },
  finish: { pos: [0, 1.5, -60], size: [6, 4, 1.6] },
};

export const LEVELS: Record<string, LevelDef> = {
  [wobbleRun.id]: wobbleRun,
  [ferryJob.id]: ferryJob,
  [summitSync.id]: summitSync,
  [eggExpress.id]: eggExpress,
  [slamDunk.id]: slamDunk,
};

export function getLevel(id: string): LevelDef {
  return LEVELS[id] ?? wobbleRun;
}
