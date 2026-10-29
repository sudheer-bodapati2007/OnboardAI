# Architecture — OnboardAI

## Overview

OnboardAI is a **modular monolith** — a single Express API with feature-based modules, and a Vite/React SPA. No microservices, no message queues, no Redis in Phase 1–2.

```
┌─────────────────────────────────┐
│        React SPA (Vite)         │  ← client/
│  Tailwind · React Router · Axios│
└────────────┬────────────────────┘
             │ HTTPS / JSON API
             │ HttpOnly JWT cookie
┌────────────▼────────────────────┐
│       Express API (Node.js)     │  ← server/
│  Helmet · CORS · Rate limiting  │
│  Zod validation · JWT auth      │
│                                 │
│  ┌──────────┐  ┌─────────────┐  │
│  │   Auth   │  │  Employees  │  │
│  ├──────────┤  ├─────────────┤  │
│  │Onboarding│  │  Templates  │  │
│  ├──────────┤  ├─────────────┤  │
│  │  Policy  │  │     AI      │  │
│  ├──────────┤  ├─────────────┤  │
│  │Notifs    │  │   Tasks     │  │
│  └──────────┘  └─────────────┘  │
└────────────┬────────────────────┘
             │
    ┌────────┴──────────┐
    │    MongoDB Atlas   │
    │  Mongoose ODM      │
    └────────────────────┘
```

---

## Authentication Flow

```
Browser                    Server                  Google
  │                          │                       │
  │── Sign in with Google ──►│                       │
  │                          │── verify idToken ────►│
  │                          │◄─ tokenInfo ──────────│
  │                          │
  │                          │  findOrCreate User
  │                          │  findOrCreate Org
  │                          │  assign role
  │                          │
  │◄── Set-Cookie: jwt ──────│   (HttpOnly, Secure, SameSite=Lax)
  │
  │── All API requests ──────►  (cookie sent automatically)
  │                          │  JWT verified → req.user + req.org
```

1. The browser loads Google Identity Services from the CDN.
2. After sign-in, GIS calls `google.accounts.id.initialize` callback with an `idToken`.
3. The client POSTs the `idToken` to `POST /api/v1/auth/google`.
4. The server verifies the token with Google's tokeninfo endpoint.
5. A MongoDB `User` and `Organization` are created if they don't exist.
6. A JWT (1 day expiry) is set as an HttpOnly cookie.
7. All subsequent requests carry the cookie automatically.

---

## Module Map

```
server/src/
├── config/
│   ├── env.js           Typed env variable access + validation
│   ├── database.js      Mongoose connect/disconnect
│   └── storage.js       Storage adapter factory (local / GCS)
│
├── middleware/
│   ├── auth.js          authenticate (JWT), requireHrAdmin, requireRole
│   ├── validate.js      Zod schema → next(AppError) on failure
│   └── errorHandler.js  Centralised error → JSON response
│
├── models/
│   ├── User.js           googleId, email, name, picture, role, organizationId
│   ├── Organization.js   domain, name
│   ├── Employee.js       fullName, department, startDate, status, userId
│   ├── OnboardingTemplate.js  name, role, tasks[]
│   ├── OnboardingTask.js      snapshot of template task for one employee
│   ├── Notification.js        userId, type, title, body, isRead
│   ├── PolicyDocument.js      organizationId, storageKey, status, chunkCount…
│   └── PolicyChunk.js         organizationId, documentId, text, embedding[]
│
└── modules/
    ├── auth/            Google login, /me, logout
    ├── employees/       CRUD + status + pagination
    ├── onboarding/      Templates CRUD, task generation, task status, overview
    ├── tasks/           Individual task status update (employee self-service)
    ├── policy/          Upload, list, delete, async processing pipeline
    ├── notifications/   Create, list (paginated), mark read, mark all read
    └── ai/              Embed query → retrieve chunks → Gemini chat → answer
```

---

## Phase 2: Policy RAG Pipeline

```
  HTTP POST /api/v1/policies (multipart/form-data)
       │
       ▼
  multer (memoryStorage)
  • MIME check (application/pdf only)
  • Magic bytes check (%PDF header)
  • Size check (≤ MAX_UPLOAD_MB)
       │
       ▼
  policy.service.uploadPolicy()
  • Generate UUID-based storageKey (never from client filename)
  • storage.put(storageKey, buffer)   ← local or GCS adapter
  • PolicyDocument.create({ status: 'pending' })
  • Fire-and-forget processDocument()
  • Return document to client immediately
       │
       ▼ (async)
  policy.processor.processDocument()
  • Load buffer from storage
  • pdf-parse → text + page count
  • Chunk text (800 chars, 150 char overlap)
  • For each chunk: Gemini text-embedding-004 → [768 floats]
  • PolicyChunk.insertMany()
  • PolicyDocument.status = 'ready'
  • createNotification(type: 'policy_ready')
```

### AI Chat RAG Flow

```
  POST /api/v1/ai/chat  { question, history[] }
       │
       ▼
  Zod validation (question ≤ 1000 chars)
       │
       ▼
  ai.retrieval.embedQuery(question)
  → Gemini text-embedding-004 → [768 floats]
       │
       ▼
  PolicyChunk.find({ organizationId, documentId: ready docs })
  cosine_similarity(queryEmbed, chunkEmbed) for each chunk
  filter ≥ 0.70 → sort desc → top 5
       │
       ▼
  If no chunks: return { insufficient: true }
       │
       ▼
  Build grounded system prompt:
    "Answer ONLY from the evidence. Do not fabricate policies."
    + chunk texts + page refs
       │
       ▼
  Gemini generateContent (gemini-1.5-flash)
       │
       ▼
  Return { answer, sources[{ documentName, pageNumber, excerpt }], insufficient }
```

---

## Storage Adapters

Both adapters expose the same interface: `save(key, buffer)`, `getBuffer(key)`, `delete(key)`.

| Provider | Config | Production ready | Notes |
|---|---|---|---|
| `LocalStorageAdapter` | `STORAGE_PROVIDER=local` | ❌ Ephemeral on Render free tier | Path-traversal guarded via `_safeResolve()` |
| `GCSStorageAdapter` | `STORAGE_PROVIDER=gcs` + `GCS_BUCKET` | ✅ | Real implementation using `@google-cloud/storage`; lazy-loaded; objects stored `private` |

### GCS setup
```
npm install @google-cloud/storage        # in server/
export STORAGE_PROVIDER=gcs
export GCS_BUCKET=my-bucket
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json   # or use Workload Identity
```

Service account needs: `roles/storage.objectAdmin` on the bucket (not project-wide).  
Bucket must be **private** (uniform bucket-level access, no public principals).

> **Live GCS integration status:** Adapter logic is verified with mocks (35/35 audit tests pass). Live end-to-end with real GCS credentials has not been executed — no credentials available in the test environment. Verify manually before production deployment.

---

## Org Isolation

Every database model that stores user data has an `organizationId` field. The authenticated user's `organizationId` is injected from the JWT payload — it is never trusted from the request body.

| Model | Scope |
|---|---|
| Employee | `organizationId` filter on all queries |
| OnboardingTemplate | `organizationId` |
| OnboardingTask | `organizationId` + employee ownership check for employees |
| PolicyDocument | `organizationId` |
| PolicyChunk | `organizationId` — AI retrieval only searches own org |
| Notification | `organizationId` + `userId` — mark-read requires both |

---

## Rate Limits

| Endpoint | Window | Max |
|---|---|---|
| Global `/api/` | 15 min | 200 |
| `/api/v1/auth/*` | 15 min | 20 |
| `POST /api/v1/policies` | 1 hour | 20 |
| `POST /api/v1/ai/chat` | 1 hour | 50 |

---

## Frontend Architecture

```
client/src/
├── contexts/AuthContext.jsx    Global auth state (user, org, role, logout)
├── layouts/AppLayout.jsx       Sidebar nav + notification bell + Outlet
├── components/
│   ├── ProtectedRoute.jsx      Role-gated React Router wrapper
│   ├── NotificationDrawer.jsx  Bell + dropdown panel
│   └── ui/                     Badge, EmptyState, ErrorMessage, Modal, …
├── pages/
│   ├── LoginPage.jsx           Google One Tap / Sign-in button
│   ├── DashboardPage.jsx       HR stats + charts
│   ├── EmployeesPage.jsx       Paginated employee list
│   ├── EmployeeDetailPage.jsx  Profile + onboarding task list
│   ├── EmployeeFormPage.jsx    Create / edit employee
│   ├── TemplatesPage.jsx       Onboarding templates CRUD
│   ├── MyOnboardingPage.jsx    Employee task checklist
│   ├── PolicyPage.jsx          HR: upload / list / delete PDFs
│   └── AIChatPage.jsx          AI assistant with source citations
└── services/api.js             Axios instance + authApi, employeesApi,
                                onboardingApi, tasksApi, notificationsApi,
                                policiesApi, aiApi
```
