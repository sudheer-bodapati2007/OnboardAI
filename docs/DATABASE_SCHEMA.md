# Database Schema — OnboardAI Phase 1

## Models

### Organization
```
_id           ObjectId  PK
name          String    required, max 200
createdAt     Date
updatedAt     Date
```

### User
```
_id           ObjectId  PK
googleId      String    unique, indexed
email         String    lowercase, trimmed
name          String    required
picture       String    nullable
role          String    enum: hr_admin | employee, default: employee
organizationId ObjectId ref: Organization, indexed
isActive      Boolean   default: true
createdAt     Date
updatedAt     Date
```
Compound unique index: `{ email, organizationId }`

### Employee
```
_id           ObjectId  PK
organizationId ObjectId ref: Organization, indexed
userId        ObjectId  ref: User, nullable
fullName      String    required, max 200
email         String    required, lowercase
jobTitle      String    required, max 150
department    String    required, max 150
manager       String    nullable
startDate     Date      required
status        String    enum: active | inactive | onboarding
createdAt     Date
updatedAt     Date
```
Indexes:
- `{ email, organizationId }` unique
- `{ organizationId, status }`
- `{ organizationId, department }`

### OnboardingTemplate
```
_id           ObjectId  PK
organizationId ObjectId ref: Organization, indexed
name          String    required, max 200
description   String    default: ''
roleTarget    String    default: 'General'
isActive      Boolean   default: true
tasks         []        embedded sub-documents:
  _id         ObjectId
  title       String    required
  description String
  category    String    default: 'General'
  dueDayOffset Number  days after startDate (min 0)
  order       Number    sort order
createdAt     Date
updatedAt     Date
```
Index: `{ organizationId, isActive }`

### OnboardingTask
```
_id           ObjectId  PK
organizationId ObjectId ref: Organization, indexed
employeeId    ObjectId  ref: Employee, indexed
templateId    ObjectId  ref: OnboardingTemplate, nullable
title         String    snapshot from template
description   String    snapshot from template
category      String    snapshot from template
dueDate       Date      startDate + dueDayOffset
status        String    enum: pending | in_progress | completed
completedAt   Date      set server-side, nullable
order         Number
createdAt     Date
updatedAt     Date
```
Indexes:
- `{ employeeId, status }`
- `{ organizationId, status }`
- `{ dueDate }`

## Relationships

```
Organization 1──* User
Organization 1──* Employee
Organization 1──* OnboardingTemplate
Organization 1──* OnboardingTask
Employee     1──* OnboardingTask
OnboardingTemplate (referenced) ──* OnboardingTask
User (optional link) ──1 Employee
```

## Organization Isolation

- Every model except Organization carries `organizationId`.
- All service-layer queries include `{ organizationId: req.user.organizationId }`.
- The `organizationId` is **never** accepted from the client request body or query params.
- Compound unique indexes on `{ email, organizationId }` allow the same email across organizations.

## Snapshots vs. References

`OnboardingTask` stores a **snapshot** of each template task's `title`, `description`, and `category` at the time of task generation. This means:
- Future edits to a template do not alter already-assigned tasks.
- Historical records remain accurate even after template updates.
- `templateId` is kept as a soft reference for reporting but is not relied upon for task content.

