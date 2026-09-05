import * as rooms from "@/lib/rooms";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ code: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { code: rawCode } = await params;
  const code = rooms.normalizeCode(rawCode);
  const url = new URL(req.url);
  const playerId = url.searchParams.get("playerId") ?? "";
  const sessionToken = url.searchParams.get("sessionToken") ?? "";
  const connectionId = url.searchParams.get("connectionId") ?? "";
  const name = url.searchParams.get("name") ?? "Player";
  const solo = url.searchParams.get("solo") === "1";
  if (!code) return new Response("invalid room code", { status: 400 });
  if (!rooms.validPlayerId(playerId) || !rooms.validSessionToken(sessionToken) || !rooms.validConnectionId(connectionId)) return new Response("invalid credentials", { status: 400 });
  const safeName = rooms.sanitizeName(name);
  if (!safeName) return new Response("invalid name", { status: 400 });

  const encoder = new TextEncoder();
  const room = rooms.getRoom(code, true)!;
  let hb: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let cleanup: () => void = () => {};
  const stream = new ReadableStream({
    start(controller) {
      cleanup = () => {
        if (closed) return;
        closed = true;
        if (hb) clearInterval(hb);
        rooms.disconnect(room, playerId, sessionToken, connectionId);
        try { controller.close(); } catch {}
      };
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          // A slow client must not create an unbounded per-connection queue.
          if (controller.desiredSize !== null && controller.desiredSize < -8) { cleanup(); return; }
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch { cleanup(); }
      };
      // Hello precedes the room snapshot so a client can reset version
      // watermarks after a process restart before it evaluates room.version.
      send("hello", { playerId, connectionId, serverId: rooms.getServerId(), now: Date.now() });
      if (!rooms.join(room, playerId, safeName, send, sessionToken, connectionId, { solo }, cleanup)) { cleanup(); return; }
      hb = setInterval(() => {
        if (closed) return;
        try {
          if (controller.desiredSize !== null && controller.desiredSize < -8) { cleanup(); return; }
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch { cleanup(); }
      }, 10_000);
      req.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
