# Security — OnboardAI

## Authentication

- **Provider:** Google Identity Services (GIS) — server-side ID token verification
- **Session:** HttpOnly, Secure (production), SameSite=Lax JWT cookie (1-day expiry)
- **No passwords stored** — authentication is fully delegated to Google
- **Token verification:** Server calls Google's tokeninfo endpoint; tokens are never trusted without verification
- **Audience check:** JWT payload `organizationId` is resolved at login from the verified Google email domain — it cannot be injected by the client

## Authorization

```
authenticate          → Verifies JWT cookie → populates req.user, req.org
requireHrAdmin        → Rejects non-hr_admin with 403
requireRole('x')      → Generic role check
```

All private routes require `authenticate`. HR-only mutations additionally require `requireHrAdmin`.

Organization scope is always derived from `req.user.organizationId` — never from `req.body`, `req.query`, or `req.params`.

## Organization Isolation

Every database query on tenant data includes `{ organizationId: req.user.organizationId }`. Cross-organization access is structurally impossible:

- Employees: `Employee.find({ organizationId, _id })` — HR in org A cannot see org B employees
- Templates: scoped to `organizationId`
- Tasks: scoped to `organizationId`; employees additionally checked against their own `employeeId`
- PolicyDocuments: `{ organizationId }` on all queries; `storageKey` never exposed to client
- PolicyChunks: `{ organizationId }` on retrieval — AI cannot access another org's policy text
- Notifications: `{ userId, organizationId }` — mark-read requires both fields to match

## File Upload Security

- **MIME type checked** by multer filter — rejects non-`application/pdf` at the Express layer
- **Magic bytes validation** — first 4 bytes must be `%PDF` (0x25 0x50 0x44 0x46)
- **Size limit** — `MAX_UPLOAD_MB` (default 20 MB) enforced by multer before memory allocation
- **Storage key generation** — always a server-generated UUID path (`policies/<uuid>.pdf`); the original filename is stored only for display, never used as an identifier or path component
- **memoryStorage** — files never touch the filesystem temporarily; the buffer goes directly to the storage adapter
- **Rate limit** — 20 uploads per hour per IP to prevent abuse

## AI Safety

### Prompt injection prevention
- Policy document text is inserted into the prompt as quoted evidence, not as instructions
- The system prompt explicitly states the assistant must answer ONLY from the provided evidence
- The system prompt forbids the assistant from performing administrative actions or making employment decisions
- Policy text is labelled as untrusted data in the prompt structure

### Source citation integrity
- Source document names are taken from `PolicyDocument.originalName` in the database — not from the LLM output
- The LLM cannot fabricate source names; only chunk metadata is returned as citation
- `insufficient: true` is set when the similarity threshold is not met — the LLM is not called without evidence

### API key protection
- `GEMINI_API_KEY` lives server-side only — never in `VITE_*` environment variables
- The key is accessed via `env.geminiApiKey` in `config/env.js` and never logged or returned in responses
- When the key is absent, the endpoint returns `503` with a generic message — no key details exposed

### Rate limiting
- AI chat: 50 requests per hour per IP
- Upload: 20 per hour per IP
- Global API: 200 per 15 minutes per IP
- Auth: 20 per 15 minutes per IP

## Notification Isolation

- `GET /notifications` filters by `{ userId: req.user._id, organizationId }`
- `PATCH /notifications/:id/read` uses `findOne({ _id, userId, organizationId })` — returns 404 if the notification doesn't belong to the requesting user
- Notification content never includes another user's private data

## Error Handling

- Centralised `errorHandler` middleware — all unhandled errors are caught
- `AppError` operational errors return structured JSON without stack traces in production
- `NODE_ENV=production` suppresses error stack traces in responses
- Mongoose duplicate key errors → `409 Conflict` (not `500`)
- Validation errors → `400` with field-level messages from Zod
- Unknown routes → `404` (not a default Express 404 with HTML)
- No secrets, connection strings, or internal paths are included in error responses

## HTTP Security Headers

`helmet` is applied globally:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `X-XSS-Protection` (legacy browsers)
- `Strict-Transport-Security` (HSTS) in production
- `Referrer-Policy: strict-origin-when-cross-origin`
- `crossOriginEmbedderPolicy: false` — required for Google Identity Services CDN
- `contentSecurityPolicy: false` — CSP managed separately (to be tightened in production)

## CORS

```js
cors({
  origin: env.clientUrl,   // exact match — no wildcards in production
  credentials: true,        // required for cookie-based auth
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
})
```

## Cookie Security

```js
cookie: {
  httpOnly: true,     // inaccessible to document.cookie
  secure: production, // HTTPS only in production
  sameSite: 'lax',    // CSRF protection for cross-site navigation
  maxAge: 86400000,   // 1 day
}
```

## Input Validation

- All request bodies validated with Zod schemas before reaching controllers
- Query parameters coerced and bounded (page ≥ 1, limit ≤ 100)
- AI question: max 1000 characters (Zod)
- Template task arrays: validated for required fields

## Known Limitations / Future Work

- **CSP headers** are disabled — enable and configure with nonces or hashes before production
- **GCS service account credentials** — use Workload Identity or a mounted secret file; never commit key JSON
- **multer v1 deprecation** — safe but should be upgraded to multer v2 when the API stabilises
- **No refresh token / sliding session** — JWTs expire after 1 day; users must re-authenticate
- **Embedding dimension mismatch** — if `GEMINI_EMBED_MODEL` is changed after documents are embedded, existing chunks will have wrong dimensions and similarity scores will be meaningless; re-process all documents after model changes
- **PDF text extraction** — pdf-parse cannot extract text from scanned/image-only PDFs; OCR integration would be needed for those
