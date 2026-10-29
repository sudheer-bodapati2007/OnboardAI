# Security — OnboardAI Phase 1

## Authentication

### Google Identity Services
- The frontend uses the official Google Identity Services JavaScript library (loaded from `https://accounts.google.com/gsi/client`) to obtain a signed ID token.
- The ID token is sent to `POST /api/v1/auth/google` as a JSON body field — **never** via a URL parameter or header.
- The server verifies the token using `google-auth-library`'s `OAuth2Client.verifyIdToken()`, which:
  1. Validates the token signature against Google's public keys.
  2. Checks the `aud` (audience) claim against the configured `GOOGLE_CLIENT_ID`.
  3. Checks the `exp` (expiry) claim.
- The user is identified by the `sub` (subject) field — Google's stable, per-user identifier. Email is **not** used as a primary identifier.

### Session Cookies
- After successful login, the server issues a signed application JWT stored in an **HttpOnly cookie**.
- Cookie attributes:
  - `HttpOnly: true` — prevents JavaScript access, mitigating XSS token theft.
  - `Secure: true` — enforced in production (`NODE_ENV=production`), HTTPS only.
  - `SameSite: Strict` — in production; `Lax` in development for cross-origin dev proxying.
  - `maxAge: 8 hours` — short-lived sessions reduce exposure window.
- JWT payload contains only `{ userId, role }` — the full user record is always loaded from MongoDB on each authenticated request.
- **No credentials are stored in localStorage or sessionStorage.**

### CSRF
- The `SameSite=Strict` cookie attribute provides the primary CSRF protection in production, preventing cross-site requests from carrying the session cookie.
- In development, `SameSite=Lax` is used; the Vite proxy routes all `/api` requests to the backend, so no cross-origin cookie issues arise.
- The application does not currently implement a separate CSRF token header (double-submit pattern). This is acceptable given `SameSite=Strict` in production, but should be added if the application is served from a different subdomain than the API.

## Authorization

### Role-Based Access Control (RBAC)
- Two roles: `hr_admin` and `employee`.
- Roles are stored in MongoDB and loaded server-side on every request — **roles are never trusted from the client**.
- The `requireHrAdmin` middleware enforces HR-only routes.
- Employees can only access `/onboarding/me` and `PATCH /tasks/:id/status` for their own tasks.

### Role Assignment
- New users default to `employee` role.
- The **only** way to bootstrap the first HR admin is via `ADMIN_SEED_EMAIL` environment variable:
  - It only applies if the email matches **and** no `hr_admin` already exists in the organization.
  - After the first admin is created, this env var has no further effect.
- HR admins **cannot** promote themselves or others through the API (no role update endpoint in Phase 1).

### Organization Isolation
- Every authenticated request provides `req.user.organizationId` (from the DB-loaded user record).
- All database queries for organization-owned resources include `{ organizationId: req.user.organizationId }`.
- The client **never** sends an `organizationId` — the server derives it from the session.
- MongoDB compound unique indexes prevent data leakage across organizations.

### Resource Ownership
- Employees can only update tasks assigned to their own employee record (`employeeId` matches the user's linked employee).
- HR admins can update any task within their organization.
- All employee routes enforce org-scoping: a valid employee ID from another organization returns 404, not 403, to avoid information disclosure.

## Input Validation
- All request bodies, query parameters, and route parameters are validated with **Zod schemas** before reaching controllers.
- The `validate` middleware returns 422 with field-level error details on failure.
- Mongoose schema validation provides a secondary defense layer.
- Pagination parameters are coerced and bounded (max 100 per page) to prevent abuse.

## Secure HTTP Headers
- `helmet` applies the following headers:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-XSS-Protection: 0` (CSP is preferred)
  - `Strict-Transport-Security` (HSTS in production)
  - `Referrer-Policy: no-referrer`
- `Content-Security-Policy` is not configured yet (it requires knowing all CDN/font origins) — this should be added before production.

## Rate Limiting
- All `/api/` routes: **200 requests per 15 minutes** per IP.
- Auth routes (`/api/v1/auth`): **20 requests per 15 minutes** per IP (brute-force protection).

## Error Handling
- Stack traces are **never** returned in production responses.
- MongoDB error details (including field names) are mapped to user-friendly messages.
- Duplicate key errors return 409 with a generic message — they do not disclose which field caused the conflict beyond the field name.
- Environment variable validation errors list missing variable **names** only — never values.

## Known Limitations (Phase 1)

1. **CSP not configured** — a strict Content-Security-Policy header should be added before production.
2. **No email verification** — users are created based on Google's verified email; no secondary verification is performed.
3. **Single-organization model** — there is no invitation flow; all new Google users join the default organization.
4. **No audit logging** — admin actions are not logged to a separate audit trail.
5. **No token rotation** — the JWT is not rotated on privilege changes (e.g. role changes require a re-login to take effect).
6. **`csurf` package removed** — the deprecated `csurf` package was listed in dependencies but not applied. `SameSite` cookies are used instead.

## Secrets Management
- All secrets are stored in environment variables, never hardcoded.
- `.env` files are excluded from git via `.gitignore`.
- `.env.example` files contain placeholder values only.
- `JWT_SECRET` should be a cryptographically random string of at least 64 characters.
- `MONGODB_URI` contains credentials and must be treated as a secret.

