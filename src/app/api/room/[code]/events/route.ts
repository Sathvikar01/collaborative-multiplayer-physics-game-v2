import * as rooms from "@/lib/rooms";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { code } = await params;
  const url = new URL(req.url);
  const playerId = url.searchParams.get("playerId") ?? "";
  const name = (url.searchParams.get("name") ?? "Player").slice(0, 16);
  const solo = url.searchParams.get("solo") === "1";
  if (!playerId) return new Response("playerId required", { status: 400 });

  const encoder = new TextEncoder();
  const room = rooms.getRoom(code, true)!;
  let hb: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      send("hello", { playerId, now: Date.now() });
      rooms.join(room, playerId, name, send, { solo });
      hb = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          closed = true;
        }
      }, 10000);
      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (hb) clearInterval(hb);
        rooms.leave(room, playerId);
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      if (!closed) {
        closed = true;
        if (hb) clearInterval(hb);
        rooms.leave(room, playerId);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
