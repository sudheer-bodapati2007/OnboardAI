# Real-Time Synchronisation (Socket.IO)

## Architecture

```
┌──────────────────────┐          HTTPS / WSS           ┌─────────────────────────┐
│  React SPA (Vercel)  │ ◄────────────────────────────► │  Express + Socket.IO    │
│  onboard-ai-theta    │   REST: /api/v1/* (axios)      │  (Render)               │
│  .vercel.app         │   Socket.IO (polling→WS)       │  onboardai-backend-9cnu │
└──────────────────────┘                                └─────────────────────────┘
                                                                │
                                                        ┌───────▼───────┐
                                                        │   MongoDB     │
                                                        │ (source of    │
                                                        │  truth)       │
                                                        └───────────────┘
```

- Socket.IO shares the **same HTTP server** as Express (same port, same TLS) — `server/src/server.js`.
- **MongoDB remains the source of truth.** Socket events only *announce* changes that are already
  persisted. Every emit happens **after** the database write succeeds.
- There is **no fallback to periodic polling** for the HR↔employee data sync. (The policies page
  keeps a short, self-terminating 5s poll **only** while a document is stuck in pending/processing
  as a belt-and-braces fallback; the `policy:updated` socket event normally resolves it instantly.)

## Authentication & authorisation

- The socket handshake reuses the **existing HttpOnly JWT session cookie** — the exact same
  credential as the REST API (`server/src/realtime/socket.js → verifyHandshakeUser`).
- The cookie travels automatically (`withCredentials: true` on the client). **No token is ever
  placed in a URL, query string, or log output.**
- The user, organisation and role are loaded **from the database** — client-supplied IDs are
  never trusted.
- Rooms are assigned **server-side only**:
  | Room | Members | Purpose |
  |------|---------|---------|
  | `org:<organizationId>` | every authenticated user of the org | lean `dashboard:update` signals |
  | `hr:<organizationId>` | `hr_admin` users only | task/employee/policy payloads |
  | `user:<userId>` | exactly one user | task events for *their own* plan, notifications |
- Clients **cannot** join arbitrary rooms — there is no `join` listener; attempts are rejected.

## Events

| Event | Emitted to | When | Payload |
|-------|-----------|------|---------|
| `task:created` | employee's `user:` room + `hr:` room | HR assigns an onboarding plan | `{ employeeId, tasks[] }` (sanitised) |
| `task:updated` | owner's `user:` room + `hr:` room | any task status change | `{ task, employeeId, employeeName }` |
| `onboarding:completed` | `hr:` room + owner's `user:` room | every task of an employee is completed | `{ employeeId, employeeName? }` |
| `employee:created` / `employee:updated` | `org:` room | HR creates/edits/deactivates an employee | `{ employee }` (sanitised) |
| `notification:new` | recipient's `user:` room **only** | after a notification is persisted | `{ notification }` |
| `dashboard:update` | `org:` room (lean signal, no payload) | employee created/updated/deactivated, task assigned/completed, onboarding completed | `{ reason }` |
| `policy:updated` | `hr:` room | background PDF processing reaches `ready`/`failed` | `{ documentId, status, … }` |

Duplicate prevention:
- **Server**: `createNotification` has a DB-level dedupe (identical unread notification within 60s
  returns the existing row and emits nothing).
- **Client**: the notification drawer keeps a known-IDs index — a duplicate delivery neither
  duplicates the row nor the unread counter. Task updates merge by `_id`, so re-delivery is
  naturally idempotent.

## Reconnection & offline behaviour

- The client reconnects automatically with capped exponential backoff (`1s → 10s`, unlimited).
- On every successful **reconnect**, affected views fetch their latest persisted state **once**
  from the REST API (`useRealtimeReconnect`). Nothing is refreshed on a timer.
- While disconnected the app keeps working; data is reconciled from MongoDB on reconnect.

## Frontend integration

- `client/src/contexts/RealtimeContext.jsx` — provider + three hooks:
  - `useSocketEvent(event, handler)` — exactly one listener per lifecycle (StrictMode-safe),
    removed on unmount; latest handler via ref, so no re-registration churn.
  - `useRealtimeReconnect(cb)` — fires once per genuine reconnect, never on initial connect.
  - `useRealtime()` — `{ socket, connected, reconnectCount }`.
- The provider connects **after** authentication and disconnects on logout.
- Pages (`DashboardPage`, `EmployeeDetailPage`, `MyOnboardingPage`, `EmployeesPage`, `PolicyPage`)
  update targeted state silently — no spinner, no page reload, no form/chat interruption.

## Environment variables

**No new required variables.** Reused:

| Variable | Service | Purpose |
|----------|---------|---------|
| `CLIENT_URL` | Render (server) | CORS origin for REST **and** Socket.IO. Must be exactly `https://onboard-ai-theta.vercel.app` (no trailing slash). |
| `VITE_API_URL` | Vercel (client) | Base URL for REST **and** the socket connection. Must be exactly `https://onboardai-backend-9cnu.onrender.com` (no trailing slash). |

Optional (both have sane defaults, set only if needed):

| Variable | Service | Default | Purpose |
|----------|---------|---------|---------|
| `NODE_ENV` | Render | `development` | `production` enables `SameSite=None; Secure` cookies — **required** for the cross-site session cookie to reach the socket handshake. |

## Render / Vercel deployment notes

- **Render** fully supports Socket.IO: HTTP long-polling always works through its proxy; the
  engine upgrades to WebSocket after the first polling exchange. The server listens with
  `transports: ['polling', 'websocket']`.
- **Vercel** hosts only static SPA assets — the browser connects to the backend origin directly,
  so no Vercel proxy involvement. Keep the Vite SPA rewrite (`vercel.json`) as is.
- The session cookie is issued with `SameSite=None; Secure` in production, which is what allows
  the cross-origin (Vercel → Render) handshake to carry it.
- CORS on the backend (REST and Socket.IO) is restricted to `CLIENT_URL` with `credentials: true`.

## Known limitations (Render free tier)

Be honest about these when verifying in production:

1. **Free-tier spin-down.** After ~15 minutes without inbound HTTP traffic the service sleeps.
   The first socket (re)connect wakes it (~30–60s cold start). While a user has an open socket,
   keep-alive pings (25s interval) count as traffic and typically keep the service awake.
2. **750 instance hours/month.** A single always-awake service fits the allowance; multiple
   simultaneously awake services (e.g. staging + prod) may not.
3. **Cold-start reconnect.** If the service spins down mid-session, sockets drop; the client
   keeps retrying and the UI reconciles once the backend is awake again.
4. **Single instance only.** Socket.IO uses the in-memory adapter — horizontal scaling
   (multiple Render instances) would require the Redis adapter. Free tier is single-instance,
   so this is not an issue today.

## Verification checklist for production

1. Log in as HR on one browser and as an employee on another (different device/network ideally).
2. HR assigns an onboarding template → the employee's *My Onboarding* page must show the new
   tasks within ~1s, without a reload.
3. The employee completes a task → the HR *Employee Detail* page updates; HR's bell badge
   increments; dashboard counters move.
4. HR edits/deactivates an employee → employees list and dashboard update automatically.
5. Mark the employee's browser tab offline (DevTools) for ~30s, complete a task as HR, restore
   connectivity → the employee page reconciles from MongoDB on reconnect.
6. Type in the AI assistant while events arrive → typing and chat history must not be disturbed.
