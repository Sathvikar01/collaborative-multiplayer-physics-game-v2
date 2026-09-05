type Handler = (data: unknown) => void;

type RequestItem = {
  type: string;
  data: Record<string, unknown>;
  expiresAt?: number;
};

type CoalescedChannel = {
  pending: RequestItem | null;
  running: boolean;
};

const COALESCED_TYPES = new Set(["input", "state", "heartbeat"]);
const MAX_COMMAND_QUEUE = 32;
const REQUEST_TIMEOUT_MS = 8_000;
const HEARTBEAT_INTERVAL_MS = 5_000;
const COMMAND_RETRY_WINDOW_MS = 60_000;
const COMMAND_RETRY_DELAY_MS = 750;

type Delivery = "ok" | "retry" | "reject";

export class Net {
  private es: EventSource | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private closed = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private commandQueue: RequestItem[] = [];
  private commandRunning = false;
  private channels = new Map<string, CoalescedChannel>();
  private controllers = new Set<AbortController>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private finishRetryWait: (() => void) | null = null;
  private sequences: Record<"input" | "state", number> = { input: 0, state: 0 };
  private readonly connectionId = makeConnectionId();
  serverOffset = 0; // serverNow - clientNow
  connected = false;

  constructor(public code: string, public playerId: string, public sessionToken: string, public name: string, public solo: boolean) {}

  connect() {
    if (this.closed || this.es) return;
    const url = `/api/room/${encodeURIComponent(this.code)}/events?playerId=${encodeURIComponent(this.playerId)}&sessionToken=${encodeURIComponent(this.sessionToken)}&connectionId=${encodeURIComponent(this.connectionId)}&name=${encodeURIComponent(this.name)}${this.solo ? "&solo=1" : ""}`;
    const source = new EventSource(url);
    this.es = source;
    const forward = (ev: string) => {
      source.addEventListener(ev, (e) => {
        if (this.closed || this.es !== source) return;
        let data: unknown = null;
        try {
          data = JSON.parse((e as MessageEvent).data);
        } catch {}
        if (ev === "hello" || ev === "room") {
          const d = data as { now?: number };
          if (d?.now) this.serverOffset = d.now - Date.now();
        }
        this.emit(ev, data);
      });
    };
    ["hello", "room", "input", "state", "gev", "finished"].forEach(forward);
    source.onopen = () => {
      if (this.closed || this.es !== source) return;
      this.connected = true;
      this.emit("open", null);
      this.startHeartbeat();
    };
    source.onerror = () => {
      if (this.closed || this.es !== source) return;
      this.connected = false;
      this.emit("error", null);
    };
  }

  on(ev: string, fn: Handler) {
    if (!this.handlers.has(ev)) this.handlers.set(ev, new Set());
    this.handlers.get(ev)!.add(fn);
    return () => this.handlers.get(ev)?.delete(fn);
  }

  private emit(ev: string, data: unknown) {
    this.handlers.get(ev)?.forEach((fn) => fn(data));
  }

  send(type: string, data: Record<string, unknown> = {}) {
    if (this.closed) return;
    const item: RequestItem = {
      type,
      data: type === "input" || type === "state" ? { ...data, seq: ++this.sequences[type] } : data,
    };
    if (COALESCED_TYPES.has(type)) {
      void this.queueCoalesced(item);
      return;
    }
    item.data = { ...item.data, commandId: makeConnectionId() };
    item.expiresAt = Date.now() + COMMAND_RETRY_WINDOW_MS;
    if (this.commandQueue.length >= MAX_COMMAND_QUEUE) {
      this.commandQueue.shift();
      this.emit("error", { kind: "queue-full", type });
    }
    this.commandQueue.push(item);
    void this.pumpCommands();
  }

  serverNow() {
    return Date.now() + this.serverOffset;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.connected = false;
    this.es?.close();
    this.es = null;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.commandQueue = [];
    for (const channel of this.channels.values()) channel.pending = null;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.finishRetryWait?.();
    this.finishRetryWait = null;
  }

  private async queueCoalesced(item: RequestItem) {
    if (this.closed) return;
    const channel = this.channels.get(item.type) ?? { pending: null, running: false };
    channel.pending = item;
    this.channels.set(item.type, channel);
    if (channel.running) return;
    channel.running = true;
    try {
      while (!this.closed && channel.pending) {
        const next = channel.pending;
        channel.pending = null;
        await this.post(next);
      }
    } finally {
      channel.running = false;
    }
  }

  private startHeartbeat() {
    if (this.heartbeatTimer || this.closed) return;
    void this.queueCoalesced({ type: "heartbeat", data: { clientNow: Date.now() } });
    this.heartbeatTimer = setInterval(() => {
      void this.queueCoalesced({ type: "heartbeat", data: { clientNow: Date.now() } });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private async pumpCommands() {
    if (this.commandRunning) return;
    this.commandRunning = true;
    try {
      while (!this.closed && this.commandQueue.length > 0) {
        const item = this.commandQueue.shift()!;
        const delivery = await this.post(item);
        if (delivery === "retry" && !this.closed && Date.now() < (item.expiresAt ?? 0)) {
          this.commandQueue.unshift(item);
          await this.waitBeforeRetry();
        } else if (delivery === "retry" && !this.closed) {
          this.emit("error", { kind: "delivery-expired", type: item.type });
        }
      }
    } finally {
      this.commandRunning = false;
    }
  }

  private waitBeforeRetry() {
    return new Promise<void>((resolve) => {
      this.finishRetryWait = resolve;
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.finishRetryWait = null;
        resolve();
      }, COMMAND_RETRY_DELAY_MS);
    });
  }

  private async post(item: RequestItem): Promise<Delivery> {
    if (this.closed) return "reject";
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`/api/room/${encodeURIComponent(this.code)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...item.data, type: item.type, playerId: this.playerId, sessionToken: this.sessionToken, connectionId: this.connectionId }),
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok && !this.closed) {
        this.emit("error", { kind: "http", type: item.type, status: response.status });
        return response.status === 401 || response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500 ? "retry" : "reject";
      } else if (!this.closed) {
        this.emit("request-ok", { type: item.type, status: response.status });
        return "ok";
      }
    } catch (error) {
      if (!this.closed) this.emit("error", { kind: "fetch", type: item.type, error });
      return this.closed ? "reject" : "retry";
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(controller);
    }
    return "reject";
  }
}

function makeConnectionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
