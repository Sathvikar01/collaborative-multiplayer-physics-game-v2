import assert from "node:assert/strict";
import { Net } from "../src/game/net";

type FetchCall = { type: string; body: Record<string, unknown> };
const calls: FetchCall[] = [];
let finishFirstInput: ((response: Response) => void) | null = null;
let inputAttempts = 0;
let readyAttempts = 0;
const finishStateRequests: ((response: Response) => void)[] = [];

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  listeners = new Map<string, ((event: MessageEvent) => void)[]>();

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const fn = listener as (event: MessageEvent) => void;
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }

  close() {
    this.closed = true;
  }
}

const originalEventSource = globalThis.EventSource;
const originalFetch = globalThis.fetch;
Object.assign(globalThis, { EventSource: FakeEventSource });
globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
  calls.push({ type: String(body.type), body });
  if (body.type === "input" && ++inputAttempts === 1) {
    return await new Promise<Response>((resolve) => {
      finishFirstInput = resolve;
    });
  }
  if (body.type === "state") {
    return await new Promise<Response>((resolve) => {
      finishStateRequests.push(resolve);
    });
  }
  if (body.type === "ready" && ++readyAttempts === 1) throw new TypeError("simulated network outage");
  return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const waitFor = async (predicate: () => boolean, timeoutMs = 2_000) => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("timed out waiting for mocked transport");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

async function main() {
try {
  const net = new Net("ABCD", "player-1234", "session-token-0000000000000000", "Alice", false);
  net.connect();
  net.connect();
  assert.equal(FakeEventSource.instances.length, 1, "connect must be idempotent");
  assert.match(FakeEventSource.instances[0].url, /sessionToken=session-token-0000000000000000/);
  FakeEventSource.instances[0].onopen?.();
  await tick();

  net.send("input", { inputs: { torso: { f: 1 } } });
  net.send("input", { inputs: { torso: { f: 0 } } });
  net.send("input", { inputs: { torso: { f: -1 } } });
  await tick();
  assert.equal(calls.filter((call) => call.type === "input").length, 1, "only one realtime request may be in flight");
  finishFirstInput!(new Response("{}", { status: 200 }));
  await waitFor(() => calls.filter((call) => call.type === "input").length === 2);
  const inputCalls = calls.filter((call) => call.type === "input");
  assert.deepEqual(inputCalls.map((call) => call.body.seq), [1, 3], "intermediate realtime input must be coalesced");

  net.send("ready", { ready: true });
  await waitFor(() => calls.filter((call) => call.type === "ready").length === 2);
  const readyCalls = calls.filter((call) => call.type === "ready");
  assert.equal(readyCalls[0].body.commandId, readyCalls[1].body.commandId, "a retried command must keep its idempotency key");
  assert.equal(readyCalls[1].body.sessionToken, "session-token-0000000000000000");
  assert.equal(typeof readyCalls[1].body.connectionId, "string");

  // Host snapshots are latency-sensitive but latest-wins. Keep a tiny bounded
  // pipeline so one 140 ms POST cannot collapse a 15 Hz stream to ~7 Hz.
  for (let seq = 0; seq < 5; seq++) net.send("state", { state: { frame: seq } });
  await waitFor(() => calls.filter((call) => call.type === "state").length >= 3);
  const startedStates = calls.filter((call) => call.type === "state");
  assert.deepEqual(startedStates.slice(0, 3).map((call) => call.body.seq), [1, 2, 3], "state channel should pipeline three snapshots");
  assert.equal(startedStates.length, 3, "state upload concurrency must stay bounded");
  finishStateRequests.splice(1, 1)[0](new Response("{}", { status: 200 }));
  await waitFor(() => calls.filter((call) => call.type === "state").length === 4);
  assert.equal(calls.filter((call) => call.type === "state")[3].body.seq, 5, "backpressure should retain only the newest waiting snapshot");
  assert.equal(finishStateRequests.length, 3, "out-of-order completion must keep state concurrency bounded");
  for (const finish of finishStateRequests.splice(0)) finish(new Response("{}", { status: 200 }));

  net.close();
  assert.equal(FakeEventSource.instances[0].closed, true);
  console.log("network transport resilience checks passed");
} finally {
  Object.assign(globalThis, { EventSource: originalEventSource, fetch: originalFetch });
}
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
