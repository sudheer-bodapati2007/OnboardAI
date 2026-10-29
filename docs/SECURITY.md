# Security — OnboardAI

## Authentication

- **Provider:** Google Identity Services (GIS) — server-side ID token verification via `google-auth-library`
- **Audience check:** `verifyIdToken({ audience: env.googleClientId })` — tokens issued for a different client ID are rejected
- **Session:** HttpOnly, Secure (production), SameSite=Strict (production) / Lax (development) JWT cookie
- **JWT expiry:** 8 hours (not days) — users re-authenticate daily
- **No passwords stored** — authentication fully delegated to Google
- **Organization resolution:** derived server-side from the verified Google email domain — cannot be injected via any client-controlled parameter

## Cookie Security

| Setting | Development | Production |
|---|---|---|
| `httpOnly` | `true` | `true` |
| `secure` | `false` | `true` (HTTPS only) |
| `sameSite` | `lax` | `strict` |
| `maxAge` | 8 h | 8 h |
| `path` | `/` | `/` |

`SameSite=Strict` in production provides CSRF protection for cookie-authenticated state-changing requests. Cross-origin form submissions or fetch calls cannot carry the cookie.

## Authorization

```
authenticate          → Verifies JWT cookie → populates req.user (with organizationId)
requireHrAdmin        → Rejects non-hr_admin with 403
requireRole('x')      → Generic role check
```

- All private routes require `authenticate`
- HR-only mutations additionally require `requireHrAdmin`
- Organization scope is always `req.user.organizationId` from the verified JWT — never from request body, query, or params
- Employees can only update their own tasks (checked against Employee record linked to `userId`)

## Organization Isolation

Every database query on tenant data includes `{ organizationId: req.user.organizationId }`. Cross-organization access is structurally impossible:

| Resource | Scope fields |
|---|---|
| Employees | `organizationId` |
| OnboardingTemplates | `organizationId` |
| OnboardingTasks | `organizationId` + employee ownership for PATCH |
| PolicyDocuments | `organizationId` — `storageKey` never exposed to client |
| PolicyChunks | `organizationId` — AI retrieval double-scoped: only `ready` docs from own org |
| Notifications | `{ userId, organizationId }` — both required on list and mark-read |

**Audit note (fixed in audit pass):** `listNotifications` was previously scoped only to `userId`. It now also filters by `organizationId` for defence-in-depth.

## File Upload Security

- **MIME type checked** by multer filter — rejects non-`application/pdf` immediately
- **Magic bytes validation** — first 4 bytes must be `%PDF` (0x25 0x50 0x44 0x46), validated after multer so the buffer is available
- **Size limit** — `MAX_UPLOAD_MB` (default 20 MB) enforced by multer before memory allocation
- **Storage key generation** — always `{organizationId}/{uuid}.pdf` — server-generated, never from client input
  - `storageKey` is never returned in API responses (`-storageKey` in Mongoose `.select()`)
- **Path traversal prevention** — `LocalStorageAdapter._safeResolve()` validates the resolved path stays within `baseDir` using `relative()` and `isAbsolute()` checks
- **memoryStorage** — multer never writes temp files; the buffer goes directly to the storage adapter
- **Rate limit** — 20 uploads per hour per IP

## GCS Storage Security

- Files uploaded with `predefinedAcl: 'private'` — objects are never publicly accessible even if the bucket has a mixed policy
- The bucket itself must have **uniform bucket-level access** enabled with no public principals
- Service account needs only `roles/storage.objectAdmin` on the target bucket (not project-level)
- Credentials: use Workload Identity (GKE/Cloud Run) or `GOOGLE_APPLICATION_CREDENTIALS` pointing to a service account key file
- Key files should be stored as platform secrets (Render Secret Files, GCP Secret Manager), never committed to git
- `@google-cloud/storage` is lazy-loaded at first use — the server starts cleanly without it when using `local` provider

## AI Safety

### Prompt injection prevention
- Policy document text is inserted into the prompt inside `<evidence>...</evidence>` XML tags as quoted data, not as instructions
- System prompt rule 6 explicitly forbids following instructions embedded in policy text
- The LLM is instructed to answer ONLY from the evidence block
- The assistant is forbidden from performing administrative actions or employment decisions

### Source citation integrity
- Source document names are taken from `PolicyDocument.originalName` in MongoDB — not from LLM output
- The LLM cannot fabricate source names; chunk metadata (not LLM-generated text) populates citation objects
- `insufficient: true` is set application-side when no chunks meet the 0.70 similarity threshold — the LLM response is still included in case it provides a general disclaimer, but the flag tells the client to display the warning banner

### Error message sanitization (fixed in audit pass)
- Previously: `throw new AppError('AI service error: ${err.message}', 502)` — could leak Gemini error internals (API key fragments in PERMISSION_DENIED errors, model names, quota details)
- Fixed: all Gemini errors are caught, classified (rate limit / timeout / generic), and re-thrown with sanitized messages. The raw error is logged server-side only.

### API key protection
- `GEMINI_API_KEY` lives server-side only — never in `VITE_*` environment variables
- 503 is returned with a generic "not configured" message when the key is absent — no key details exposed

### Rate limiting
| Endpoint | Window | Max |
|---|---|---|
| Global `/api/` | 15 min | 200 |
| `/api/v1/auth/*` | 15 min | 20 |
| `POST /api/v1/policies` | 1 hour | 20 |
| `POST /api/v1/ai/chat` | 1 hour | 50 |

## Notification Isolation

- `GET /notifications` filters by `{ userId, organizationId }` — both required (fixed in audit pass from userId-only)
- `PATCH /notifications/:id/read` — `findOneAndUpdate({ _id, userId })` — returns 404 if not owned by requester
- Notification content never includes another user's private data

## HTTP Security Headers (helmet)

```js
helmet({
  crossOriginEmbedderPolicy: false,   // required for Google Identity Services CDN
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      styleSrc:    ["'self'", "'unsafe-inline'"],
      imgSrc:      ["'self'", "data:", "https://lh3.googleusercontent.com"],
      connectSrc:  ["'self'"],
      fontSrc:     ["'self'"],
      objectSrc:   ["'none'"],
      frameAncestors: ["'none'"],     // prevents clickjacking
      upgradeInsecureRequests: [],
    },
  },
})
```

**Audit note:** CSP was previously fully disabled (`contentSecurityPolicy: false`). It is now enabled with a restrictive policy. The frontend is a separate SPA that manages its own CSP independently.

## CORS

```js
cors({
  origin: env.clientUrl,    // exact match — never a wildcard
  credentials: true,         // required for cookie-based auth
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
})
```

## Error Handling

- Centralised `errorHandler` middleware catches all errors
- `AppError` operational errors return structured JSON without stack traces in production
- Stack traces included only in `NODE_ENV=development` for non-operational errors
- Mongoose duplicate key → `409 Conflict` (not `500`)
- Mongoose validation → `422` with field details from Zod
- Bad ObjectId → `400 INVALID_ID` (no internal Mongoose detail)
- Unknown routes → `404` JSON (not Express default HTML)
- No secrets, connection strings, or internal paths in error responses

## Remaining Known Limitations

| Item | Status | Notes |
|---|---|---|
| CSP `'unsafe-inline'` for styles | Accepted risk | Required for Tailwind's inline style output; can be tightened with nonces |
| GCS live integration | **Not verified** | Logic tested with mocks; no live GCS credentials available in test environment |
| No refresh tokens | Accepted | JWTs expire after 8 h; users re-authenticate. Good for MVP. |
| Scanned PDFs | Not supported | pdf-parse reads embedded text only; image-only PDFs fail processing with a clear error |
| Embedding dimension mismatch | Risk | Changing `GEMINI_EMBED_MODEL` after docs are embedded requires re-processing all chunks |
| multer v1 deprecation | Low risk | v1 is still maintained; v2 has a different API. Safe to upgrade later. |
| No API token auth | By design | Cookie-only auth; no bearer token support. Frontend and backend must share the same origin configuration. |
| No account deletion | Missing | Users cannot delete their account or data; no GDPR erasure endpoint |

## Manual Verification Checklist (Pre-Deployment)

Before going live, manually verify:

- [ ] Google OAuth: sign in with `ADMIN_SEED_EMAIL` account → role = `hr_admin`
- [ ] Google OAuth: sign in with a different Google account → role = `employee`
- [ ] HR: create an employee, assign onboarding template, verify notification appears
- [ ] Employee: mark a task complete, verify it appears in HR dashboard
- [ ] HR: upload a text-based policy PDF, wait for `ready` status
- [ ] AI: ask a question covered by the PDF → answer cites document name
- [ ] AI: ask an unrelated question → `insufficient` banner shown
- [ ] Cross-org: confirm user A cannot access user B's notifications or policy documents
- [ ] GCS: with `STORAGE_PROVIDER=gcs`, upload a PDF → verify it appears in the GCS bucket as a private object, not publicly accessible
- [ ] Cookie: verify `Secure` and `HttpOnly` flags are set in browser DevTools → Application → Cookies
- [ ] Rate limit: send > 50 AI chat requests in 1 hour → verify 429 response
