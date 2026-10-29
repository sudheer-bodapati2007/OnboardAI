# API Contracts — OnboardAI

All endpoints are prefixed with `/api/v1`.  
All requests/responses use `Content-Type: application/json` unless noted.  
Authentication is via HttpOnly JWT cookie set during login.

## Response envelope

```json
// Success
{ "success": true, "data": { ... } }

// Paginated
{ "success": true, "data": { ... }, "meta": { "total": 0, "page": 1, "limit": 20, "pages": 1 } }

// Error
{ "success": false, "error": { "code": "ERROR_CODE", "message": "Human readable" } }
```

---

## Auth

### POST /auth/google
Sign in with Google ID token.

**Body:** `{ "idToken": "string" }`  
**Response:** Sets `jwt` cookie. Returns user + org.

```json
{
  "data": {
    "user": { "_id": "...", "name": "...", "email": "...", "role": "hr_admin" },
    "organization": { "_id": "...", "name": "example.com" }
  }
}
```

### GET /auth/me
Returns the currently authenticated user (cookie required).

### POST /auth/logout
Clears the `jwt` cookie.

---

## Employees (HR admin only)

### GET /employees
List employees with pagination and search.

**Query params:** `page`, `limit`, `search`, `status`, `department`

### POST /employees
Create a new employee.

```json
{
  "fullName": "Alice Smith",
  "email": "alice@example.com",
  "department": "Engineering",
  "position": "Software Engineer",
  "startDate": "2025-01-15"
}
```

### GET /employees/:id
Get employee by ID.

### PATCH /employees/:id
Update employee fields.

### PATCH /employees/:id/status
Update employee status.

**Body:** `{ "status": "active" | "inactive" | "onboarding" }`

### POST /employees/:employeeId/onboarding
Start onboarding for an employee from a template.

**Body:** `{ "templateId": "..." }`

### GET /employees/:id/tasks
Get all onboarding tasks for an employee (HR view).

---

## Onboarding Templates (HR admin)

### GET /onboarding/templates
List all active templates for the org.

### POST /onboarding/templates
Create a template.

```json
{
  "name": "Engineering Onboarding",
  "role": "Software Engineer",
  "tasks": [
    { "title": "Set up laptop", "description": "...", "category": "IT", "dueDayOffset": 1, "order": 1 }
  ]
}
```

### PATCH /onboarding/templates/:id
Update a template (name, role, tasks).

### GET /onboarding/overview
HR dashboard statistics.

```json
{
  "data": {
    "employees": { "total": 24, "active": 18, "onboarding": 4, "completedOnboarding": 2 },
    "tasks": { "total": 120, "completed": 80, "pending": 30, "overdue": 10, "avgCompletionPercent": 67 },
    "recentActivity": [...],
    "departmentBreakdown": [{ "department": "Engineering", "count": 10 }]
  }
}
```

---

## Tasks

### GET /onboarding/me
Get the authenticated employee's own tasks + employee record.

### PATCH /tasks/:id/status
Update task status. Employees may only update their own tasks.

**Body:** `{ "status": "pending" | "in_progress" | "completed" }`

---

## Policy Documents (HR admin)

### POST /policies
Upload a policy PDF. `Content-Type: multipart/form-data`.  
Field name: `file`.  
Max size: `MAX_UPLOAD_MB` (default 20 MB).

**Response (202 Accepted):**
```json
{
  "data": {
    "document": {
      "_id": "...",
      "originalName": "employee-handbook.pdf",
      "status": "pending",
      "sizeBytes": 204800,
      "createdAt": "2025-01-15T10:00:00Z"
    }
  }
}
```

Processing is async — poll `GET /policies` to check `status`.

**Rate limit:** 20 uploads per hour.

### GET /policies
List all policy documents for the org.

```json
{
  "data": {
    "documents": [
      {
        "_id": "...",
        "originalName": "employee-handbook.pdf",
        "status": "ready",
        "sizeBytes": 204800,
        "pageCount": 42,
        "chunkCount": 87,
        "createdAt": "..."
      }
    ]
  }
}
```

Statuses: `pending` → `processing` → `ready` | `failed`

### DELETE /policies/:id
Delete a policy document, its chunks, and its stored file.

---

## AI Chat

### POST /ai/chat
Ask a question grounded in the org's policy documents.  
Available to all authenticated users.

**Body:**
```json
{
  "question": "What is the remote work policy?",
  "history": [
    { "role": "user", "parts": [{ "text": "..." }] },
    { "role": "model", "parts": [{ "text": "..." }] }
  ]
}
```

**Response (200):**
```json
{
  "data": {
    "answer": "According to the Remote Work Policy (p. 12)...",
    "sources": [
      {
        "documentName": "employee-handbook.pdf",
        "pageNumber": 12,
        "excerpt": "Employees may work remotely up to 3 days per week..."
      }
    ],
    "insufficient": false
  }
}
```

When no relevant chunks are found:
```json
{
  "data": {
    "answer": "I could not find sufficient information in the policy documents...",
    "sources": [],
    "insufficient": true
  }
}
```

**Error responses:**
- `503` — `GEMINI_API_KEY` not configured
- `429` — rate limit (50 per hour)
- `400` — question missing or > 1000 chars
- `502` — Gemini API unavailable

---

## Notifications

### GET /notifications
List notifications for the authenticated user.

**Query params:** `page`, `limit` (default 30)

```json
{
  "data": {
    "notifications": [
      {
        "_id": "...",
        "type": "onboarding_assigned",
        "title": "Your onboarding plan is ready",
        "body": "Your checklist 'Engineering Onboarding' has been assigned.",
        "isRead": false,
        "createdAt": "..."
      }
    ],
    "unreadCount": 3
  }
}
```

**Notification types:**

| Type | Trigger |
|---|---|
| `onboarding_assigned` | HR starts onboarding for an employee |
| `task_completed` | Employee marks a task complete |
| `policy_ready` | Policy PDF processed successfully |
| `policy_failed` | Policy PDF processing failed |
| `task_overdue` | (reserved for future scheduler) |
| `onboarding_completed` | (reserved for future trigger) |

### PATCH /notifications/:id/read
Mark a single notification as read. User must own the notification.

**Response:** `{ "data": { "notification": { ... } } }`

### PATCH /notifications/read-all
Mark all of the authenticated user's unread notifications as read.

---

## Health

### GET /health
```json
{ "success": true, "data": { "status": "ok", "environment": "production", "timestamp": "..." } }
```
