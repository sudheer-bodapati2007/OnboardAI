# API Contracts — OnboardAI v1

Base URL: `http://localhost:5000/api/v1`

All responses follow:
```json
{ "success": true, "data": { ... } }
{ "success": false, "error": { "code": "...", "message": "..." } }
```

Paginated responses include:
```json
{ "success": true, "data": { ... }, "meta": { "page": 1, "limit": 20, "total": 55, "totalPages": 3 } }
```

---

## Health

### `GET /health`
Public. Returns server status.

---

## Auth

### `POST /auth/google`
**Public.** Rate limited (20/15 min).

Body: `{ "idToken": "<Google ID token>" }`

Response 200:
```json
{ "data": { "user": { "id", "email", "name", "picture", "role", "organizationId" } } }
```
Sets an HttpOnly session cookie.

Errors: 400 (missing idToken), 401 (invalid token), 403 (inactive account).

---

### `GET /auth/me`
**Authenticated.**

Response 200: Same user object as above.

Errors: 401 (no/expired session).

---

### `POST /auth/logout`
**Authenticated.**

Clears the session cookie.

Response 200: `{ "data": { "message": "Logged out successfully" } }`

---

## Employees

All employee routes require `hr_admin` role.

### `POST /employees`
Create employee.

Body:
```json
{
  "fullName": "Jane Smith",
  "email": "jane@company.com",
  "jobTitle": "Software Engineer",
  "department": "Engineering",
  "manager": "Bob Jones",
  "startDate": "2024-02-01",
  "status": "onboarding"
}
```
Response 201: `{ "data": { "employee": { ... } } }`

Errors: 409 (duplicate email in org), 422 (validation).

---

### `GET /employees`
List with pagination, search, filter.

Query params: `page`, `limit`, `search`, `department`, `status`

Response 200: Paginated list.

---

### `GET /employees/:id`
Get one employee. 404 if not in org.

---

### `PATCH /employees/:id`
Partial update. Same body fields as POST (all optional).

---

### `PATCH /employees/:id/status`
Body: `{ "status": "active" | "inactive" | "onboarding" }`

---

## Onboarding

### `GET /onboarding/templates`
**hr_admin.** List templates for the organization.

### `POST /onboarding/templates`
**hr_admin.** Create template.
```json
{
  "name": "Software Engineer Onboarding",
  "description": "...",
  "roleTarget": "Software Engineer",
  "tasks": [
    { "title": "Set up dev environment", "category": "IT Setup", "dueDayOffset": 1, "order": 0 }
  ]
}
```

### `PATCH /onboarding/templates/:id`
**hr_admin.** Update template (partial).

### `GET /onboarding/me`
**Any authenticated user.** Returns the calling user's employee record and their tasks.

### `GET /onboarding/overview`
**hr_admin.** Dashboard aggregation.

Response:
```json
{
  "data": {
    "employees": { "total", "active", "onboarding", "completedOnboarding" },
    "tasks": { "total", "completed", "pending", "overdue", "avgCompletionPercent" },
    "recentActivity": [ { "taskId", "title", "employeeName", "department", "completedAt" } ],
    "departmentBreakdown": [ { "department", "count" } ]
  }
}
```

---

### `POST /employees/:employeeId/onboarding`
**hr_admin.** Generate tasks from a template.

Body: `{ "templateId": "<id>" }`

Response 201: `{ "data": { "tasks": [...], "count": 6 } }`

Errors: 409 (onboarding already started), 422 (empty template).

---

### `GET /employees/:id/tasks`
**hr_admin.** Get all tasks for an employee.

---

### `PATCH /tasks/:id/status`
**Authenticated.** Employees: own tasks only. HR: any org task.

Body: `{ "status": "pending" | "in_progress" | "completed" }`

---

## Error Codes

| Code | HTTP | Description |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Zod validation failed |
| `DUPLICATE` | 409 | Unique constraint (email in org) |
| `NOT_FOUND` | 404 | Resource not found in org |
| `INVALID_ID` | 400 | Bad ObjectId format |
| `RATE_LIMIT` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

