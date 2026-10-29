# OnboardAI

An AI-powered employee onboarding platform. HR administrators manage employees, assign onboarding workflows, upload company policy documents, and query an AI assistant grounded in those policies. Employees track their onboarding checklists and ask the same AI assistant questions.

---

## Features

### Phase 1 — Core Platform
- **Google OAuth 2.0** authentication (server-side token verification, HttpOnly JWT cookie)
- **Two-role RBAC** — `hr_admin` and `employee`
- **Organization-scoped data isolation** — every record is tagged to an org; cross-org access is impossible
- **Employee management** — create, update, status transitions (onboarding → active → inactive)
- **Reusable onboarding templates** — define task lists with due-day offsets
- **Employee onboarding journeys** — generate per-employee task snapshots from templates
- **Task progress tracking** — employees mark tasks complete; HR watches overall progress
- **HR dashboard** — live stats (headcount, task completion %, overdue tasks, department breakdown, recent activity)
- **Responsive Midnight Navy UI** built with React + Tailwind CSS

### Phase 2 — AI Policy Assistant & Notifications
- **Policy PDF upload** — multer multipart upload, PDF magic-bytes validation, 20 MB limit
- **Async PDF processing pipeline** — text extraction (pdf-parse) → chunking → Gemini embeddings → MongoDB storage
- **Processing status tracking** — `pending → processing → ready / failed`
- **Grounded AI chat** — RAG using cosine similarity on stored embeddings; answers cite source documents and page numbers
- **Insufficient-evidence detection** — honest "I couldn't find enough information" when similarity threshold (0.70) is not met
- **In-app notifications** — persisted, recipient-scoped; bell icon with unread count badge; mark individual / all read
- **Notification types** — `onboarding_assigned`, `task_completed`, `policy_ready`, `policy_failed`, `task_overdue`
- **AI chat page** — session history, source citation cards, rate-limit and "not configured" error states
- **Policy management page** — upload, status polling (5 s auto-refresh), delete with confirmation modal

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, React Router v6, Axios, Recharts, Lucide React |
| Backend | Node.js 20+, Express 5, ES Modules |
| Database | MongoDB Atlas via Mongoose |
| Authentication | Google Identity Services (CDN), JWT in HttpOnly cookie |
| AI | Google Gemini (`gemini-1.5-flash` chat, `text-embedding-004` embeddings) |
| PDF processing | pdf-parse |
| File upload | multer (memoryStorage) |
| File storage | Local adapter (dev) / GCS adapter (prod) |
| Testing | Node.js built-in `node:test` runner |

---

## Project Structure

```
OnboardAI/
├── client/                  # React + Vite frontend
│   ├── src/
│   │   ├── components/ui/   # Badge, EmptyState, ErrorMessage, Modal, LoadingSpinner, Pagination, ProgressBar
│   │   ├── components/      # NotificationDrawer, ProtectedRoute
│   │   ├── contexts/        # AuthContext
│   │   ├── hooks/           # useApi
│   │   ├── layouts/         # AppLayout (sidebar + notification bell)
│   │   ├── pages/           # All page components
│   │   └── services/        # api.js (Axios instance + all API namespaces)
│   └── .env.example
├── server/                  # Express API
│   ├── src/
│   │   ├── config/          # env.js, database.js, storage.js
│   │   ├── middleware/       # auth.js, errorHandler.js, validate.js
│   │   ├── models/          # Mongoose schemas
│   │   ├── modules/
│   │   │   ├── auth/        # Google login, JWT
│   │   │   ├── employees/   # Employee CRUD
│   │   │   ├── onboarding/  # Templates, tasks, dashboard
│   │   │   ├── policy/      # Upload, processing, embeddings
│   │   │   ├── notifications/ # In-app notifications
│   │   │   └── ai/          # RAG chat endpoint
│   │   ├── scripts/         # seedTemplates.js
│   │   └── utils/           # AppError, response helpers
│   ├── tests/
│   │   ├── auth.test.js     # Phase 1 — 14 tests
│   │   └── phase2.test.js   # Phase 2 — 23 tests
│   └── .env.example
└── docs/
    ├── ARCHITECTURE.md
    ├── API_CONTRACTS.md
    ├── DATABASE_SCHEMA.md
    └── SECURITY.md
```

---

## Local Setup

### Prerequisites
- Node.js 20+
- A MongoDB Atlas cluster (free tier works)
- A Google Cloud project with OAuth 2.0 credentials
- A Google AI Studio API key (for Phase 2 AI features)

### 1. Clone and install

```bash
git clone <your-repo-url>
cd OnboardAI

# Install server dependencies
npm install --prefix server

# Install client dependencies
npm install --prefix client
```

### 2. Configure environment

```bash
# Copy example files — never commit the real .env
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Edit `server/.env` with your real values (see **Environment Variables** below).

### 3. Seed the database

```bash
node server/src/scripts/seedTemplates.js
```

This creates starter onboarding templates and ensures the `ADMIN_SEED_EMAIL` user gets the `hr_admin` role on first login.

### 4. Run locally

```bash
# Terminal 1 — backend (port 5000)
npm run dev --prefix server

# Terminal 2 — frontend (port 5173)
npm run dev --prefix client
```

Open [http://localhost:5173](http://localhost:5173) and sign in with the Google account matching `ADMIN_SEED_EMAIL` to get HR admin access. Any other Google account gets the `employee` role.

---

## Running Tests

```bash
# All tests (Phase 1 + Phase 2) — requires Node 20+
node --test server/tests/auth.test.js server/tests/phase2.test.js

# Phase 1 only
node --test server/tests/auth.test.js

# Phase 2 only (no DB or API key required)
node --test server/tests/phase2.test.js
```

**Latest results:** 14/14 Phase 1 pass, 23/23 Phase 2 pass.

## Production Build

```bash
npm run build --prefix client
# Output in client/dist/
```

---

## Environment Variables

### `server/.env`

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `5000` | Server port |
| `NODE_ENV` | No | `development` | `development` or `production` |
| `MONGODB_URI` | **Yes** | — | MongoDB Atlas connection string |
| `GOOGLE_CLIENT_ID` | **Yes** | — | Google OAuth 2.0 client ID |
| `JWT_SECRET` | **Yes** | — | Long random string for JWT signing |
| `CLIENT_URL` | **Yes** | — | Frontend origin (`http://localhost:5173` locally) |
| `ADMIN_SEED_EMAIL` | **Yes** | — | Email bootstrapped as `hr_admin` |
| `GEMINI_API_KEY` | Phase 2 | — | Google AI Studio API key |
| `GEMINI_CHAT_MODEL` | No | `gemini-1.5-flash` | Gemini model for chat |
| `GEMINI_EMBED_MODEL` | No | `text-embedding-004` | Gemini model for embeddings |
| `STORAGE_PROVIDER` | No | `local` | `local` (dev) or `gcs` (production) |
| `STORAGE_LOCAL_DIR` | No | `uploads` | Local upload directory |
| `GCS_BUCKET` | prod only | — | GCS bucket name (when `STORAGE_PROVIDER=gcs`) |
| `MAX_UPLOAD_MB` | No | `20` | Max PDF upload size |

### `client/.env`

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_URL` | No | `http://localhost:5000` | Backend API base URL |
| `VITE_GOOGLE_CLIENT_ID` | **Yes** | — | Same Google OAuth client ID (public) |

---

## Required External Setup

### Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Create an OAuth 2.0 Client ID (Web application)
3. Add `http://localhost:5173` to **Authorized JavaScript origins**
4. Add your production frontend URL to **Authorized JavaScript origins**
5. Copy the client ID to `GOOGLE_CLIENT_ID` (server) and `VITE_GOOGLE_CLIENT_ID` (client)

### MongoDB Atlas
1. Create a free cluster at [MongoDB Atlas](https://cloud.mongodb.com/)
2. Create a database user with read/write access
3. Allow your IP (or `0.0.0.0/0` for development)
4. Copy the connection string to `MONGODB_URI`

### Google AI (Phase 2)
1. Get a free API key at [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Copy to `GEMINI_API_KEY` in `server/.env`
3. Upload a policy PDF to test — the AI will only answer questions from uploaded documents

### File Storage (Production)
- **Development:** set `STORAGE_PROVIDER=local` — files saved to `server/uploads/`. **Not persistent on Render free tier.**
- **Production:** set `STORAGE_PROVIDER=gcs`, create a GCS bucket, grant your service account `roles/storage.objectAdmin`, set `GCS_BUCKET`.

---

## Deployment Checklist

### Backend (Render)
- [ ] Create a new Web Service; connect your repo; set root to `server/`
- [ ] Build command: `npm install`
- [ ] Start command: `node src/server.js`
- [ ] Set all required environment variables in Render dashboard
- [ ] Set `NODE_ENV=production`
- [ ] Set `CLIENT_URL` to your Vercel frontend URL
- [ ] Set `STORAGE_PROVIDER=gcs` and `GCS_BUCKET`
- [ ] Add the GCS service account key as `GOOGLE_APPLICATION_CREDENTIALS` or mount as a secret file
- [ ] Verify health check endpoint: `GET /api/v1/health`

### Frontend (Vercel)
- [ ] Import the repo; set root to `client/`
- [ ] Build command: `npm run build`
- [ ] Output: `dist/`
- [ ] Set `VITE_API_URL` to your Render backend URL
- [ ] Set `VITE_GOOGLE_CLIENT_ID`
- [ ] Add your Vercel URL to Google OAuth **Authorized JavaScript origins**

### Post-deploy
- [ ] Run `node server/src/scripts/seedTemplates.js` against production DB once
- [ ] Test login → dashboard → employee creation → onboarding start → AI chat

---

## Known Limitations

- **Local storage is ephemeral on Render free tier** — configure GCS for production PDF persistence
- **Embeddings stored as plain arrays in MongoDB** — cosine similarity computed in-process. Suitable for hundreds of chunks; a vector DB (Pinecone, Weaviate) should be added if chunk count grows to tens of thousands
- **AI chat history is session-only** — not persisted across page reloads
- **No real-time notifications** — bell polls every 60 seconds; no WebSocket push
- **GCS adapter** is a documented stub — install `@google-cloud/storage` and wire credentials before using
- **PDF text extraction** may miss scanned/image-only PDFs — pdf-parse only reads embedded text
- **multer v1** deprecation warning — safe to use but can be upgraded to multer v2 when their API stabilises
