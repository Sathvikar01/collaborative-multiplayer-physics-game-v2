type Handler = (data: unknown) => void;

export class Net {
  private es: EventSource | null = null;
  private handlers = new Map<string, Set<Handler>>();
  serverOffset = 0; // serverNow - clientNow
  connected = false;

  constructor(public code: string, public playerId: string, public name: string, public solo: boolean) {}

  connect() {
    const url = `/api/room/${encodeURIComponent(this.code)}/events?playerId=${encodeURIComponent(this.playerId)}&name=${encodeURIComponent(this.name)}${this.solo ? "&solo=1" : ""}`;
    this.es = new EventSource(url);
    const forward = (ev: string) => {
      this.es!.addEventListener(ev, (e) => {
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
    this.es.onopen = () => {
      this.connected = true;
      this.emit("open", null);
    };
    this.es.onerror = () => {
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
    void fetch(`/api/room/${encodeURIComponent(this.code)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, playerId: this.playerId, ...data }),
      keepalive: true,
    }).catch(() => {});
  }

  serverNow() {
    return Date.now() + this.serverOffset;
  }

  close() {
    this.es?.close();
    this.es = null;
    this.send("leave");
  }
}
