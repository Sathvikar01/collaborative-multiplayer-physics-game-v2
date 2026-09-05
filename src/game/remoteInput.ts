import { emptyInput, ROLES, type Role, type RoleInput } from "./types";

/** The longest a host keeps applying a remote input after packets stop arriving. */
export const REMOTE_INPUT_TIMEOUT_MS = 500;

const finite = (value: unknown, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const axis = (value: unknown) => Math.max(-1, Math.min(1, finite(value)));
const angle = (value: unknown) => {
  const n = finite(value);
  if (!Number.isFinite(n)) return 0;
  let a = n;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

/**
 * Make an input safe to hand to the physics controller.
 *
 * Network input is intentionally treated as untrusted. In particular, a string,
 * Infinity, or NaN must never reach Rapier (or angleWrap, whose loop assumes a
 * finite value). Missing values are replaced with the neutral input.
 */
export function normalizeRoleInput(value: unknown): RoleInput {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    f: axis(input.f),
    s: axis(input.s),
    a: input.a === true,
    b: input.b === true,
    q: input.q === true,
    e: input.e === true,
    lx: angle(input.lx),
    ly: Math.max(-0.9, Math.min(0.7, finite(input.ly))),
  };
}

export type RemoteInputMap = Partial<Record<Role, RoleInput>>;

/** Normalize only known roles; unknown keys are ignored. */
export function normalizeRemoteInputs(value: unknown): RemoteInputMap {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  const result: RemoteInputMap = {};
  for (const role of ROLES) {
    if (Object.prototype.hasOwnProperty.call(source, role)) result[role] = normalizeRoleInput(source[role]);
  }
  return result;
}

interface Entry {
  inputs: RemoteInputMap;
  receivedAt: number;
}

/**
 * Pure, clock-injected input lease store used by the host simulation.
 *
 * Each player gets an independent lease. A dropped connection therefore stops
 * affecting the body after the timeout instead of leaving the last held key
 * latched forever. `getMerged` returns fresh input objects, so callers cannot
 * mutate the stored lease accidentally.
 */
export class RemoteInputBuffer {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly timeoutMs = REMOTE_INPUT_TIMEOUT_MS, private readonly now: () => number = () => performance.now()) {}

  set(playerId: string, inputs: unknown, receivedAt = this.now()) {
    if (!playerId || !Number.isFinite(receivedAt)) return;
    this.entries.set(playerId, { inputs: normalizeRemoteInputs(inputs), receivedAt });
  }

  clear(playerId?: string) {
    if (playerId === undefined) this.entries.clear();
    else this.entries.delete(playerId);
  }

  /** Remove expired leases and merge currently live player inputs by role. */
  getMerged(at = this.now()): RemoteInputMap {
    const merged: RemoteInputMap = {};
    for (const [playerId, entry] of this.entries) {
      if (!Number.isFinite(at) || at - entry.receivedAt > this.timeoutMs) {
        this.entries.delete(playerId);
        continue;
      }
      for (const role of ROLES) {
        const input = entry.inputs[role];
        if (input) merged[role] = { ...emptyInput(), ...input };
      }
    }
    return merged;
  }

  get size() {
    return this.entries.size;
  }
}
