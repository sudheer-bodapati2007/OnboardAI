# OnboardAI — Task List (by Priority)

Generated from the user's request. Each task includes a description, the files to modify, and the expected outcome.

---

## Priority 1 — Vercel 404 on refresh + session persistence

**Description**
The React SPA is deployed on Vercel. Refreshing the browser on a client-side route (e.g. `/dashboard`, `/employees/:id`) returns a 404 because Vercel looks for a physical file at that path instead of falling back to `index.html`. Also verify the auth session survives a page refresh (the HttpOnly session cookie + `/auth/me` check in `AuthContext` should restore the user without redirecting to `/login`).

**Files to modify**
- `vercel.json` — new file; add SPA rewrite rules so all client routes serve `client/dist/index.html`
- `client/vite.config.js` — confirm the dev proxy `/api` -> `http://localhost:5000` and that the build output goes to `client/dist`
- `client/src/contexts/AuthContext.jsx` — ensure `checkSession()` runs on mount and restores `user` from the HttpOnly cookie; avoid flash-to-login on refresh
- `client/src/services/api.js` — confirm `withCredentials: true` so the session cookie is sent on `/auth/me`
- `server/src/modules/auth/auth.controller.js` & `auth.routes.js` — confirm `/auth/me` validates the cookie and returns the user

**Expected outcome**
- Refreshing on any client route loads the SPA (no 404) on both localhost dev and production Vercel
- After a refresh, the user remains logged in (session restored from cookie) instead of being kicked to `/login`

---

## Priority 2 — HR task assignment updates without repeated refreshing

**Description**
When an HR admin assigns/starts onboarding for an employee (or updates a task status), the HR dashboard / employee detail view should reflect the change immediately without the HR user having to manually refresh the page. Currently data is only fetched on mount and after the triggering action.

**Files to modify**
- `client/src/pages/EmployeeDetailPage.jsx` — re-fetch tasks/overview after `startOnboarding` and after any status change; optionally poll or refetch on focus
- `client/src/pages/DashboardPage.jsx` — refresh the onboarding overview stats after mutations so HR sees live counts
- `client/src/services/api.js` — confirm `employeesApi.startOnboarding`, `updateStatus`, and `getOverview` endpoints exist and return updated data
- `server/src/modules/onboarding/onboarding.controller.js` & `onboarding.routes.js` — confirm the status-update and start-onboarding routes return the updated employee/task payload

**Expected outcome**
- HR sees newly generated tasks and status changes on the employee detail / dashboard immediately after saving, with no manual browser refresh required

---

## Priority 3 — Employee task-completion notifications reaching HR

**Description**
When an employee marks an onboarding task complete, HR should receive a notification. Currently `updateTaskStatus` in `onboarding.service.js` creates a `task_completed` notification addressed to `requestingUser._id` (the employee themselves) instead of notifying HR admins in the organization.

**Files to modify**
- `server/src/modules/onboarding/onboarding.service.js` — in `updateTaskStatus`, when `status === 'completed'`, look up HR admin users in the same organization and create a `task_completed` notification for each (or at least one HR recipient), scoped to the organization
- `server/src/modules/notifications/notifications.service.js` — keep `createNotification` idempotent duplicate guard; ensure it supports notifying multiple recipients
- `client/src/pages/MyOnboardingPage.jsx` — employee completes task; no UI change strictly needed, but confirm the completion call succeeds
- `client/src/components/NotificationDrawer.jsx` — ensure HR can see and mark task-completion notifications as read

**Expected outcome**
- An employee completing a task generates a notification visible to HR (not to the employee), so HR is informed of task completion without polling

---

## Priority 4 — Verify Gemini API configuration

**Description**
The AI chat feature uses Google Gemini via `@google/generative-ai`. `GEMINI_API_KEY` is currently treated as optional at startup (validated only when AI routes are called). Need to verify the key is present, the model names are valid, and the chat/retrieval paths work end to end.

**Files to modify**
- `server/src/config/env.js` — review `GEMINI_API_KEY`, `GEMINI_CHAT_MODEL`, `GEMINI_EMBED_MODEL`, timeout/retry env vars; consider making `GEMINI_API_KEY` required if AI is a core feature
- `server/src/modules/ai/ai.chat.js` — confirm it reads `env.geminiApiKey` and throws a clear 503 when missing; verify model name and retry/backoff logic
- `server/src/modules/ai/ai.retrieval.js` — confirm embedding + vector search work with the configured embed model
- `server/.env.example` (create if missing) — document `GEMINI_API_KEY`, `GEMINI_CHAT_MODEL`, `GEMINI_EMBED_MODEL`
- `README.md` — add a "Verify Gemini API configuration" step

**Expected outcome**
- `GEMINI_API_KEY` is validated and present; AI chat returns answers with citations; clear error (503) when misconfigured; no silent failures

---

## Priority 5 — Light/dark theme toggle

**Description**
The app is currently hard-coded to a dark theme (Tailwind `gray-900`/`bg-gray-900` throughout). Add a user-facing light/dark theme toggle that persists the preference (e.g. in `localStorage`) and applies a `dark` class to `<html>` / a Tailwind dark mode class strategy.

**Files to modify**
- `client/tailwind.config.js` — set `darkMode: 'class'` (or confirm it is already class-based)
- `client/src/index.css` — add Tailwind dark-mode CSS variables / `@layer` for light and dark palettes
- `client/src/layouts/AppLayout.jsx` or `client/src/App.jsx` — add a theme toggle button and a `ThemeContext` / `useTheme` hook that reads/writes `localStorage` and toggles a `dark` class on `document.documentElement`
- `client/src/pages/*` — review any hard-coded dark-only colors and convert them to dark-aware variants if needed

**Expected outcome**
- A toggle (e.g. in the header/layout) switches the app between light and dark themes
- The chosen theme persists across page reloads via `localStorage`
- No Flash of Unstyled Theme (theme applied before render)

---

## Priority 6 — Profile image upload

**Description**
Employees (and HR) should be able to upload a profile image. The server already has `multer` installed and a `storage.js` adapter (local filesystem or Google Cloud Storage), but there is no profile-image endpoint, no image field on the `Employee` model, and no upload UI.

**Files to modify**
- `server/src/models/Employee.js` — add an optional `profileImageUrl` / `profileImageKey` field
- `server/src/modules/employees/employees.controller.js`, `employees.routes.js`, `employees.service.js` — add a `PATCH /employees/:id/profile-image` route using `multer` (image-only, size limit) and `storage.save`
- `server/src/config/storage.js` — already exists; ensure image MIME types are allowed and stored under a `profile-images/` key prefix
- `client/src/services/api.js` — add `employeesApi.uploadProfileImage(id, formData)`
- `client/src/pages/EmployeeDetailPage.jsx` and `EmployeeFormPage.jsx` — add an image input/preview and upload button
- `README.md` / `docs/` — document `STORAGE_PROVIDER=local` vs `gcs` for production persistence

**Expected outcome**
- A user can upload a profile image from the employee form/detail page
- Image is stored (local in dev; GCS in prod) and the URL/key is saved on the employee record
- Image displays in the UI; non-image or oversized files are rejected

---

## Priority 7 — Testing, build, deployment instructions

**Description**
Consolidate how to run tests, build the client, and deploy both the server and the Vercel client. Add/verify scripts and a deployment guide (environment variables, build commands, Vercel project settings).

**Files to modify**
- `package.json` (root) — add/verify `test`, `build`, `dev:server`, `dev:client`, `install:all` scripts
- `server/package.json` — verify `start`, `dev`, `test` (`node --test tests/*.test.js`)
- `README.md` — add sections: Prerequisites, Install, Run locally (server + client), Run tests, Build client, Deploy to Vercel (client) + Render/other (server), Required environment variables
- `vercel.json` — required for Priority 1; also part of deployment
- `docs/` — confirm `ARCHITECTURE.md`, `API_CONTRACTS.md`, `DATABASE_SCHEMA.md`, `SECURITY.md` are up to date

**Expected outcome**
- `npm run install:all` installs server and client dependencies
- `npm test` runs the server test suite and passes
- `npm run build` produces `client/dist` ready for Vercel
- A contributor can deploy to Vercel (client) and a Node host (server) using the documented env vars without guessing

---

### Suggested working order
1. Priority 1 (unblocks reliable local + Vercel usage)
2. Priority 7 (ensures tests/build/deploy are repeatable)
3. Priority 4 (verify AI config before building on it)
4. Priority 3 (fix notification recipient bug)
5. Priority 2 (live HR updates)
6. Priority 6 (profile image upload)
7. Priority 5 (theme toggle)
