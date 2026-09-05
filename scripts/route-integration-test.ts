import assert from "node:assert/strict";
import { GET as openEvents } from "../src/app/api/room/[code]/events/route";
import { POST as postCommand } from "../src/app/api/room/[code]/route";
import * as rooms from "../src/lib/rooms";

async function main() {
  const code = "CDEF";
  const playerId = "route-player-0001";
  const sessionToken = "route-session-token-000000000000";
  const oldConnection = "route-old-connection-0001";
  const newConnection = "route-new-connection-0001";
  const oldAbort = new AbortController();
  const newAbort = new AbortController();
  const context = { params: Promise.resolve({ code }) };
  const eventUrl = (connectionId: string) =>
    `http://localhost/api/room/${code}/events?playerId=${playerId}&sessionToken=${sessionToken}&connectionId=${connectionId}&name=RoutePlayer`;

  try {
    const oldResponse = await openEvents(new Request(eventUrl(oldConnection), { signal: oldAbort.signal }), context);
    assert.equal(oldResponse.status, 200);
    const room = rooms.getRoom(code, false)!;
    const original = rooms.snapshot(room).players[0];

    const newResponse = await openEvents(new Request(eventUrl(newConnection), { signal: newAbort.signal }), context);
    assert.equal(newResponse.status, 200);
    oldAbort.abort();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const reconnected = rooms.snapshot(room).players[0];
    assert.equal(reconnected.connected, true, "stale SSE cleanup must not detach the replacement stream");
    assert.equal(reconnected.teamId, original.teamId);
    assert.deepEqual(reconnected.roles, original.roles, "reconnect must preserve role ownership");

    const commandBody = {
      type: "ready",
      playerId,
      sessionToken,
      connectionId: newConnection,
      commandId: "route-command-0001",
      ready: true,
    };
    const command = () =>
      postCommand(
        new Request(`http://localhost/api/room/${code}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(commandBody),
        }),
        context,
      );
    assert.equal((await command()).status, 200);
    const appliedVersion = rooms.snapshot(room).version;
    assert.equal(rooms.snapshot(room).players[0].ready, true);
    assert.equal((await command()).status, 200, "a lost-response retry should be acknowledged");
    assert.equal(rooms.snapshot(room).version, appliedVersion, "a retried command must not apply twice");

    const unauthorized = await postCommand(
      new Request(`http://localhost/api/room/${code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...commandBody, commandId: "route-command-0002", sessionToken: "wrong-session-token-000000000" }),
      }),
      context,
    );
    assert.equal(unauthorized.status, 401);

    newAbort.abort();
    rooms.leave(room, playerId, sessionToken, newConnection);
    console.log("route/SSE integration resilience checks passed");
  } finally {
    oldAbort.abort();
    newAbort.abort();
    const room = rooms.getRoom(code, false);
    if (room) rooms.leave(room, playerId, sessionToken, newConnection);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
