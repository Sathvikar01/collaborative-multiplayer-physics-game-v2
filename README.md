# Many Hands

Many Hands is a browser-based cooperative physics game for 3- or 5-player teams. Each player controls part of one shared body while the team navigates a course together.

## Requirements

- Node.js 20+
- npm
- PostgreSQL is optional (only needed for the persistent leaderboard)

## Setup and local run

```bash
npm install
npm run dev
```

Open the local URL printed by Next.js (normally `http://localhost:3000`). Use **Create room** to start a room, or enter a room code to join one.

Useful checks and production commands:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run start
```

`npm run start` serves the last successful production build, so run `npm run build` first.

## Optional leaderboard database

Set `DATABASE_URL` to a PostgreSQL connection string when persistent scores are wanted. The live room and physics game do not require a database; without `DATABASE_URL`, leaderboard reads degrade to an empty/unavailable result and score writes are skipped or reported as unavailable. The health endpoint will also report the database as unhealthy.

Example PowerShell setup:

```powershell
$env:DATABASE_URL = "postgres://user:password@localhost:5432/many_hands"
npm run dev
```

The database must contain the `scores` table described in `src/db/schema.ts`; this repository does not currently provide a database migration script.

## Connection recovery and dropped players

The realtime client uses an SSE connection plus ordered, bounded HTTP commands. It automatically reconnects with a stable player session and a fresh connection ID. Heartbeats refresh the 15-second server-side lease approximately every 5 seconds. When a connection is lost, room leadership and physics hosting move immediately to a connected teammate while the disconnected player's membership and roles are retained for a 15-second reconnect grace period. Rejoining during that grace period cancels removal without taking authority back from the replacement host.

Remote input is treated as a short lease as well. The host stops applying a teammate's last input after roughly 500 ms without a fresh packet, so a dropped connection cannot leave movement, grabbing, or another key permanently held. Input/state payloads are sanitized, sequenced, and coalesced to avoid an unbounded request backlog. Control commands carry idempotency keys and retry for a bounded window, so a lost response cannot double-toggle a role or silently lose a finish. Reconnecting clients rejoin using their session credentials and receive a fresh room snapshot.

## Deployment constraint

> **Important:** Room state, player leases, timers, and SSE connection callbacks are currently held in process memory. The current implementation requires one long-lived Node.js process with sticky routing so a room's SSE and HTTP requests reach the same process.
>
> Do **not** treat a default serverless or horizontally scaled deployment (including multiple Vercel function instances) as production-safe. A process restart loses active rooms, and different instances do not share room state. Production horizontal/serverless deployment requires moving room state and realtime fan-out to an external stateful realtime backend/pub-sub layer (for example Redis plus a realtime service, PartyKit, Ably, or a dedicated WebSocket server) before scaling out.

SSE connections also depend on infrastructure that supports long-lived streaming responses. Configure proxy/function timeouts accordingly, or use a dedicated realtime service for production traffic.
