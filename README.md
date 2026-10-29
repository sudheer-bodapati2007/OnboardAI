# OnboardAI

An AI-powered employee onboarding platform built as a portfolio project. Phase 1 implements the full-stack core: Google authentication, HR admin and employee roles, employee management, reusable onboarding templates, task tracking, and a real-time dashboard.

## Features

- **Google Sign-In** — server-side token verification using `google-auth-library`
- **Role-based access** — HR admins and employees with separate interfaces
- **Organization isolation** — all records scoped to the user's organization server-side
- **Employee management** — full CRUD with search, filter, pagination, and status management
- **Onboarding templates** — reusable task sets per role (Software Engineer, HR Executive, Sales Associate)
- **Task tracking** — persisted employee-specific tasks with progress and overdue detection
- **HR dashboard** — real MongoDB aggregations for metrics, charts, and activity feeds

## Prerequisites

- Node.js 20+
- npm 9+
- MongoDB Atlas cluster (or local MongoDB)
- Google Cloud project with an OAuth 2.0 Web Client ID

## Quick Start

### 1. Clone and configure

```bash
git clone <repo-url>
cd OnboardAI

# Server configuration
cp server/.env.example server/.env
# Edit server/.env with your values

# Client configuration
cp client/.env.example client/.env
# Edit client/.env with your values
```

### 2. Install dependencies

```bash
npm install --prefix server
npm install --prefix client
```

### 3. Start development servers

```bash
# Terminal 1 – API server (port 5000)
npm run dev --prefix server

# Terminal 2 – Vite dev server (port 5173)
npm run dev --prefix client
```

Open http://localhost:5173

## Environment Variables

### Server (`server/.env`)

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | API port (default 5000) |
| `NODE_ENV` | No | `development` or `production` |
| `MONGODB_URI` | **Yes** | MongoDB Atlas connection string |
| `GOOGLE_CLIENT_ID` | **Yes** | Google OAuth 2.0 client ID |
| `JWT_SECRET` | **Yes** | Long random string for JWT signing |
| `CLIENT_URL` | **Yes** | Frontend origin for CORS |
| `ADMIN_SEED_EMAIL` | No | First HR admin bootstrap email |

### Client (`client/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | **Yes** | Backend URL (e.g. `http://localhost:5000`) |
| `VITE_GOOGLE_CLIENT_ID` | **Yes** | Same Google client ID as server |

> **Security:** Never put private keys in `VITE_*` variables — they are embedded in the browser bundle.

## Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project → **APIs & Services** → **Credentials**
3. Create **OAuth 2.0 Client ID** (type: Web application)
4. Add authorised JavaScript origins:
   - `http://localhost:5173` (development)
   - Your production domain
5. Add authorised redirect URIs: same origins
6. Copy the **Client ID** to both `GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID`

## First Admin Bootstrap

Set `ADMIN_SEED_EMAIL` in `server/.env` to your Google account email **before first login**. The first user to sign in with that email will be granted `hr_admin` role automatically. After that, the seed email has no special effect.

## Running Tests

```bash
# Backend unit tests (no database required)
npm test --prefix server
```

## Production Build

```bash
npm run build --prefix client
```

## Project Structure

```
OnboardAI/
├── client/               # React + Vite frontend
│   └── src/
│       ├── pages/        # Route-level page components
│       ├── components/   # Reusable UI components
│       ├── layouts/      # Shared layout wrappers
│       ├── contexts/     # React Context (auth)
│       ├── hooks/        # Custom hooks
│       └── services/     # API client (Axios)
├── server/               # Express.js backend
│   └── src/
│       ├── config/       # DB + env configuration
│       ├── models/       # Mongoose schemas
│       ├── middleware/   # Auth, validation, error handling
│       ├── modules/      # Feature modules (auth, employees, onboarding)
│       └── utils/        # Shared utilities
└── docs/                 # Architecture and API documentation
```

## API Base URL

`http://localhost:5000/api/v1`

Health check: `GET /api/v1/health`

See [docs/API_CONTRACTS.md](docs/API_CONTRACTS.md) for full endpoint documentation.

## Deployment

> Do not deploy without reviewing [docs/SECURITY.md](docs/SECURITY.md).

Set `NODE_ENV=production`, `VITE_API_URL` to your production API URL, and serve the `client/dist` folder via a static host or CDN. Ensure cookies have `Secure` and `SameSite=Strict` settings (enforced automatically when `NODE_ENV=production`).

## Phase 2 (Planned)

- AI policy assistant (Gemini API integration)
- Email/Slack notification integration
- Bulk employee import
- Audit logging

