# Many Hands

Many Hands is a browser-based cooperative physics game for three- or five-player teams. Every player controls part of one shared ragdoll body: hands grab, legs walk, and the torso balances and steers.

The game is intentionally client-authoritative for physics: one browser is the team host, while the server coordinates rooms, relays inputs/snapshots, handles leases, and elects a replacement host when necessary.

## Contents

- [Quick start](#quick-start)
- [Architecture](#architecture)
- [Multiplayer lifecycle](#multiplayer-lifecycle)
- [Disconnect and host failover](#disconnect-and-host-failover)
- [Repository map](#repository-map)
- [HTTP and SSE protocol](#http-and-sse-protocol)
- [Persistence](#persistence)
- [Testing and verification](#testing-and-verification)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

## Quick start

Requirements:

- Node.js 20+
- npm
- PostgreSQL only if persistent leaderboard scores are needed

```bash
npm install
npm run dev
```

Open the URL printed by Next.js, normally `http://localhost:3000`. Choose **Create room**, or enter a four-character room code to join an existing room.

Production-style local run:

```bash
npm run build
npm run start
```

Available checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Architecture

```mermaid
flowchart LR
  subgraph Browser[Each browser]
    UI[GameClient React UI]
    NET[Net transport\nSSE + bounded HTTP queues]
    PHYS[PhysicsReactor + Rapier\n120 Hz authoritative simulation]
    INPUT[InputManager]
    UI --> NET
    UI --> PHYS
    INPUT --> UI
    PHYS --> UI
  end

  subgraph Next[Next.js process]
    SSE[GET /api/room/:code/events]
    API[POST /api/room/:code]
    ROOMS[rooms.ts\nroom registry + leases + authority]
    LEADER[GET /api/leaderboard]
    DB[(PostgreSQL\noptional scores)]
    SSE --> ROOMS
    API --> ROOMS
    ROOMS --> SSE
    LEADER --> DB
  end

  NET <-->|EventSource| SSE
  NET -->|commands, input, state, heartbeat| API
  PHYS -->|host snapshots| NET
  NET -->|teammate inputs| PHYS
```

### Authority model

```mermaid
flowchart TD
  PLAYER[Player session]
  SESSION[sessionToken + connectionId]
  ROOM[Room registry]
  LEADER[Room leader]
  HOST[Team physics host]
  GUEST[Team guests]
  SNAP[Sequenced state snapshot]

  PLAYER --> SESSION
  SESSION -->|authenticated commands| ROOM
  ROOM --> LEADER
  ROOM --> HOST
  GUEST -->|role input| ROOM
  ROOM -->|validated input relay| HOST
  HOST -->|15 Hz snapshot| SNAP
  SNAP --> GUEST
  ROOM -->|host disconnect| HOST
  ROOM -->|host disconnect| LEADER
```

Each team has one physics host. The host runs Rapier locally and sends body/prop snapshots. Guests never send authoritative state. The room leader controls lobby-wide actions such as challenge selection, squad size, and starting a round.

## Multiplayer lifecycle

```mermaid
sequenceDiagram
  participant B as Browser
  participant E as SSE route
  participant R as Room registry
  participant P as Room POST route
  participant H as Team host

  B->>E: Open EventSource with playerId, sessionToken, connectionId
  E-->>B: hello(serverId, now)
  E->>R: join or reconnect session
  R-->>B: room snapshot(version)
  B->>P: input/heartbeat/command
  P->>R: authenticate and validate
  R-->>H: input relay (guest only)
  H->>P: sequenced state snapshot
  P->>R: accept host snapshot
  R-->>B: state broadcast to teammates/other teams
```

Room snapshots carry a monotonically increasing `version`. State messages carry a team host authority epoch and sequence number. Clients ignore stale room or state messages rather than allowing delayed packets to rewind the UI or physics display.

## Disconnect and host failover

```mermaid
sequenceDiagram
  participant A as Dropped player
  participant S as Server room
  participant B as Connected teammate
  participant G as Game instance

  A--xS: SSE closes or heartbeat stops
  S->>S: mark player offline
  S->>S: immediately elect connected host/leader
  S-->>B: room snapshot(connected=false, new host)
  B->>G: setHost(true)
  G->>G: restore latest buffered body/prop snapshot
  G->>G: clear old remote input leases
  Note over G: missing remote input becomes neutral after ~500 ms
  A-->>S: reconnect within 15 s grace
  S->>S: restore membership and roles
  S-->>A: fresh room snapshot
  Note over S: reconnecting player does not reclaim replacement authority
  S->>S: remove player after grace expires
```

Important timings:

| Mechanism | Timing | Effect |
| --- | ---: | --- |
| Input lease | ~500 ms | Stops held movement/grab/throw input from sticking on the host |
| Client heartbeat | ~5 s | Refreshes the server connection lease |
| Server lease | 15 s | Detects a half-open/hung connection |
| Disconnect grace | 15 s | Preserves team, role, and session membership for reconnect |
| Command retry window | 60 s | Retries lost control-command responses with idempotency keys |

Host takeover snapshots include body transforms/velocities, prop motion, mover phase, objective state, and a versioned reactor continuation containing limb-controller and logical grip state. A replacement host reconstructs compatible grips instead of unconditionally dropping the carried object.

### Cooperative physics

Five-player hand and leg channels remain independent through the solver. Bilateral grabs attach both hands to the same target, share the load, and accumulate grip strain when the players pull in conflicting directions. Heavy one-hand loads slip and drop. Balance uses foot contact manifolds, whole-body/carried-load center of mass, a predicted capture point, and a support margin; moving both legs without torso correction removes support, while bracing increases limited recovery authority.

## Repository map

```text
src/
├─ app/
│  ├─ page.tsx                         Landing page and room entry
│  ├─ play/[code]/page.tsx             Game route
│  └─ api/
│     ├─ room/[code]/route.ts           Authenticated room commands
│     ├─ room/[code]/events/route.ts    SSE connection lifecycle
│     ├─ leaderboard/route.ts            Read-only leaderboard API
│     └─ health/route.ts                 Database health check
├─ components/GameClient.tsx            React session/UI coordinator
├─ game/
│  ├─ game.ts                            Three.js rendering and game flow
│  ├─ physicsReactor.ts                  Fixed-step seam, diagnostics, takeover state
│  ├─ body.ts                            Ragdoll and physics controller
│  ├─ squad.ts                           3P/5P input mixer
│  ├─ remoteInput.ts                     Expiring remote-input leases
│  ├─ net.ts                             SSE and bounded HTTP transport
│  ├─ levels.ts                          Course definitions
│  └─ types.ts                           Shared protocol/domain types
├─ lib/rooms.ts                          In-memory room authority/state
└─ db/                                   Drizzle schema and lazy PostgreSQL pool

scripts/
├─ resilience-test.ts                    Test entry point
├─ rooms-resilience-test.ts              Room/authority tests
├─ route-integration-test.ts             Next route + SSE tests
├─ nettest.ts                            Mocked transport/retry tests
├─ remoteinputtest.ts                    Input lease/fuzz tests
├─ physics-reactor-test.ts               Deterministic coordination/physics assertions
└─ simtest.ts, leveltest.ts, ...         Physics smoke simulations
```

## HTTP and SSE protocol

### `GET /api/room/:code/events`

Opens the long-lived event stream. Query parameters include:

- `playerId`: stable browser session identity
- `sessionToken`: secret session credential stored in `sessionStorage`
- `connectionId`: fresh identity for the current SSE connection
- `name`: display name, capped at 16 characters
- `solo=1`: optional solo-practice mode

Events currently include `hello`, `room`, `input`, `state`, `gev`, and `finished`. SSE cleanup is idempotent and guarded by the connection identity, so an old stream cannot remove a newer reconnect.

### `POST /api/room/:code`

Every request carries `playerId`, `sessionToken`, and `connectionId`. Realtime requests also carry a sequence number; control commands carry a unique `commandId`.

| Command | Purpose | Authority |
| --- | --- | --- |
| `heartbeat` | Refresh connection lease | Authenticated player |
| `input` | Send assigned-role input to team host | Connected guest |
| `state` | Broadcast authoritative team snapshot | Current team host |
| `setRole`, `setTeam`, `ready` | Lobby setup | Connected player, lobby only |
| `setChallenge`, `setSquad`, `start`, `lobby` | Room controls | Room leader |
| `finish` | Finish current team round | Current team host, current round |
| `endRound` | End active round | Room leader |
| `leave` | Explicit departure | Current authenticated session |

Payloads are size-limited and sanitized before relay. Numeric input is finite and clamped; state snapshots require the expected transform/event structure; stale sequence numbers are rejected.

### Other routes

- `GET /api/room/:code`: public read-only room snapshot.
- `GET /api/leaderboard?challenge=...&squad=3|5&limit=...`: validated leaderboard read.
- `POST /api/leaderboard`: intentionally disabled; scores are recorded from a validated room finish.
- `GET /api/health`: checks PostgreSQL availability.

## Persistence

Set `DATABASE_URL` when persistent scores are wanted:

```powershell
$env:DATABASE_URL = "postgres://user:password@localhost:5432/many_hands"
npm run dev
```

The `scores` table is described in [src/db/schema.ts](C:/Users/arsat/Downloads/collaborative-multiplayer-physics-game/src/db/schema.ts). This repository does not currently include a migration script. Without `DATABASE_URL`, the game still runs, but leaderboard reads are unavailable and score writes are skipped safely.

## Testing and verification

The resilience suite is intentionally layered:

```mermaid
flowchart LR
  UNIT[Remote input + physics normalization] --> ROOM[Room authority tests]
  ROOM --> ROUTE[Next route/SSE integration]
  ROUTE --> NET[Mocked EventSource/fetch transport]
  NET --> BUILD[Typecheck + lint + production build]
```

Run the focused suite:

```bash
npm test
```

It covers stale SSE cleanup, reconnect role preservation, immediate host takeover, authenticated route commands, command idempotency, malformed input/state rejection, input expiry, realtime coalescing, fixed-step equivalence, contact-derived support, bilateral load sharing, grip failure, balance failure, and reactor snapshot restoration.

For a complete pre-merge check:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm audit --omit=dev
```

The standalone physics scripts can be run with `npx tsx`, for example:

```bash
npx tsx scripts/simtest.ts
npx tsx scripts/leveltest.ts
npx tsx scripts/grabtest.ts
npx tsx scripts/throwtest.ts
```

## Deployment

> **Important:** room state, player leases, timers, and SSE connection callbacks are held in process memory.

The current implementation is safe for one long-lived Node.js process with sticky routing. It is **not** safe to deploy as an unmodified horizontally scaled or serverless system, including multiple Vercel function instances:

- different instances can see different room maps;
- SSE clients and HTTP commands can land on different processes;
- a process restart loses active rooms and rounds;
- in-memory host migration state disappears with the process.

For horizontal/serverless production, replace the process-local room layer with shared state and fan-out, for example:

```mermaid
flowchart LR
  C[Browsers] <--> RT[Dedicated realtime gateway]
  RT <--> PUB[(Redis / durable pub-sub)]
  RT <--> STATE[(Shared room state)]
  API[Next.js API] <--> STATE
  API --> DB[(PostgreSQL scores)]
```

Do not write 15 Hz physics snapshots to PostgreSQL as the realtime transport. Use a stateful realtime gateway plus Redis, a durable-object platform, PartyKit, Ably, or an equivalent service, and keep PostgreSQL for durable scores/analytics.

SSE also requires infrastructure that supports long-lived streaming responses and suitable proxy/function timeouts.

## Troubleshooting

### Everyone sees a different room

Confirm that all requests are reaching the same Node process. This is the expected failure mode when process-local rooms are used behind non-sticky horizontal routing.

### A player appears as “reconnecting”

The server has detected a closed SSE or missed heartbeat. The player's role is retained during the grace window. Check browser console/network errors and verify that the SSE route is not being buffered or terminated by a proxy.

### The leaderboard is empty

Set `DATABASE_URL`, create the `scores` table, and check `/api/health`. The game itself does not require PostgreSQL.

### Build fails without database credentials

That should not happen: database initialization is lazy. Run `npm run typecheck` and `npm run build` from the repository root, and verify that `DATABASE_URL` is not required by a custom build hook.

## License

No license file is currently included in this repository.
