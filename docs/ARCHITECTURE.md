# Architecture — OnboardAI Phase 1

## Overview

OnboardAI is a **modular monolith** — a single deployable application with well-separated modules. There are no microservices, message queues, or external caches in Phase 1.

```
Browser (React SPA)
    │  HTTPS + HttpOnly cookie
    ▼
Express.js API Server (Node.js)
    │
    ├── Auth Module        ← Google token verification, JWT sessions
    ├── Employees Module   ← CRUD for HR admins
    ├── Onboarding Module  ← Templates + Task generation + Progress
    │
    └── MongoDB Atlas      ← Persistent storage
```

## Modules

### `server/src/modules/auth/`
Handles Google ID token verification, session cookie issuance, and user retrieval.

- **auth.service.js** — verifyGoogleToken (google-auth-library), findOrCreateUser, issueSessionCookie
- **auth.controller.js** — googleLogin, getMe, logout
- **auth.routes.js** — POST /auth/google, GET /auth/me, POST /auth/logout

### `server/src/modules/employees/`
Full employee CRUD with pagination, search, filtering, and status management.

- **employees.validation.js** — Zod schemas for all employee endpoints
- **employees.service.js** — DB operations with org-scoped queries
- **employees.controller.js** — Request/response handlers
- **employees.routes.js** — Protected routes (hr_admin only)

### `server/src/modules/onboarding/`
Reusable templates, task generation, and progress tracking.

- **onboarding.validation.js** — Zod schemas
- **onboarding.service.js** — Template CRUD, startOnboarding (task snapshot generation), overview aggregation
- **onboarding.controller.js** — Request handlers
- **onboarding.routes.js** — Template and employee-facing routes
- **tasks.routes.js** — PATCH /tasks/:id/status (shared by HR and employees)

## Authentication Flow

```
1. Browser loads Google Identity Services (CDN)
2. User clicks "Sign in with Google"
3. Google returns a signed ID token (JWT) to the browser
4. Browser POST /api/v1/auth/google { idToken }
5. Server: google-auth-library.verifyIdToken(idToken, audience=GOOGLE_CLIENT_ID)
6. Server: findOrCreateUser from Google payload (googleId, email, name, picture)
7. Server: issues a signed application JWT in an HttpOnly cookie
8. All subsequent requests carry the cookie automatically
9. authenticate middleware verifies JWT, loads User from DB, attaches to req.user
10. requireHrAdmin / requireRole enforces role on each route
```

## Data Flow — Employee Onboarding

```
HR Admin selects template → POST /employees/:id/onboarding
    ↓
onboarding.service.startOnboarding()
    ↓
Snapshot each template task → create OnboardingTask docs
(title, description, dueDate = startDate + dueDayOffset)
    ↓
Employee views GET /onboarding/me
    ↓
Employee updates PATCH /tasks/:id/status
    ↓
service enforces ownership (employee.userId === req.user._id)
    ↓
completedAt set server-side when status = 'completed'
    ↓
HR views GET /onboarding/overview
    ↓
MongoDB aggregation pipeline computes metrics
```

## Organization Isolation

Every request to a protected route has `req.user.organizationId` available (loaded from the JWT-validated DB user). All DB queries include `organizationId` as a filter. The client never sends an organization ID — the server derives it from the session.

## Security Boundaries

- JWT in HttpOnly cookie (not localStorage)
- Google token audience validation prevents cross-app token reuse
- Zod validates all input at the route boundary
- Mongoose unique indexes enforce data integrity
- CORS restricted to `CLIENT_URL`
- Helmet sets secure HTTP headers
- Rate limiting on all API and auth endpoints

