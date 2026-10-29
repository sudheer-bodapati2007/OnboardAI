# Database Schema — OnboardAI

Database: MongoDB Atlas. ODM: Mongoose. All IDs are MongoDB ObjectId unless noted.

---

## User

```
Collection: users
```

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | |
| `googleId` | String | Google sub claim (unique) |
| `email` | String | Google email (unique) |
| `name` | String | Display name |
| `picture` | String | Avatar URL |
| `role` | String enum | `hr_admin` \| `employee` |
| `organizationId` | ObjectId → Organization | Org membership |
| `createdAt` | Date | |
| `updatedAt` | Date | |

**Indexes:** `googleId` (unique), `email` (unique), `organizationId`

---

## Organization

```
Collection: organizations
```

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | |
| `domain` | String | Email domain (unique) |
| `name` | String | Human-readable name |
| `createdAt` | Date | |

**Indexes:** `domain` (unique)

---

## Employee

```
Collection: employees
```

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | |
| `organizationId` | ObjectId → Organization | |
| `userId` | ObjectId → User | Linked user account (optional) |
| `fullName` | String | |
| `email` | String | |
| `department` | String | |
| `position` | String | |
| `startDate` | Date | |
| `status` | String enum | `onboarding` \| `active` \| `inactive` |
| `createdAt` | Date | |
| `updatedAt` | Date | |

**Indexes:** `{ organizationId, status }`, `{ organizationId, email }` (unique), `userId`

---

## OnboardingTemplate

```
Collection: onboardingtemplates
```

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | |
| `organizationId` | ObjectId | |
| `name` | String | Template display name |
| `role` | String | Target role / job title |
| `isActive` | Boolean | Soft-delete flag |
| `tasks` | Array | Embedded task definitions |
| `tasks[].title` | String | |
| `tasks[].description` | String | |
| `tasks[].category` | String | e.g. `IT`, `HR`, `Legal` |
| `tasks[].dueDayOffset` | Number | Days from `startDate` |
| `tasks[].order` | Number | Display order |
| `createdAt` | Date | |

**Indexes:** `{ organizationId, isActive }`

---

## OnboardingTask

Employee-specific task snapshots (immutable after creation — template edits don't affect in-progress tasks).

```
Collection: onboardingtasks
```

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | |
| `organizationId` | ObjectId | |
| `employeeId` | ObjectId → Employee | |
| `templateId` | ObjectId → OnboardingTemplate | Source template |
| `title` | String | Snapshot from template |
| `description` | String | |
| `category` | String | |
| `dueDate` | Date | Computed from `startDate + dueDayOffset` |
| `order` | Number | |
| `status` | String enum | `pending` \| `in_progress` \| `completed` |
| `completedAt` | Date | Set when `status = completed` |
| `createdAt` | Date | |

**Indexes:** `{ organizationId, employeeId }`, `{ organizationId, status }`, `{ organizationId, dueDate }`

---

## Notification

```
Collection: notifications
```

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | |
| `organizationId` | ObjectId | |
| `userId` | ObjectId → User | Recipient |
| `type` | String enum | See notification types |
| `title` | String | Short heading |
| `body` | String | Full message |
| `isRead` | Boolean | Default `false` |
| `relatedEmployeeId` | ObjectId | Optional reference |
| `relatedTaskId` | ObjectId | Optional reference |
| `relatedPolicyId` | ObjectId | Optional reference |
| `createdAt` | Date | |

**Notification types:** `onboarding_assigned`, `task_completed`, `onboarding_completed`, `policy_ready`, `policy_failed`, `task_overdue`

**Indexes:** `{ userId, isRead }`, `{ userId, createdAt: -1 }`

**Duplicate guard:** `createNotification` checks for an identical `{userId, type, relatedEmployeeId, relatedTaskId}` record within the last 60 seconds before inserting.

---

## PolicyDocument

```
Collection: policydocuments
```

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | |
| `organizationId` | ObjectId | |
| `uploadedBy` | ObjectId → User | |
| `originalName` | String | Original filename (display only) |
| `storageKey` | String | Server-generated UUID path, never client-supplied |
| `storageProvider` | String | `local` \| `gcs` |
| `mimeType` | String | Validated MIME type |
| `sizeBytes` | Number | |
| `status` | String enum | `pending` \| `processing` \| `ready` \| `failed` |
| `errorMessage` | String | Set on `failed` |
| `pageCount` | Number | From pdf-parse |
| `chunkCount` | Number | Number of stored chunks |
| `createdAt` | Date | |
| `updatedAt` | Date | |

**Indexes:** `{ organizationId, status }`, `{ organizationId, createdAt: -1 }`

**Note:** `storageKey` is never returned to the client — only `originalName`, `status`, and metadata fields are exposed.

---

## PolicyChunk

Stores extracted text segments with their embeddings for RAG retrieval.

```
Collection: policychunks
```

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | |
| `organizationId` | ObjectId | Duplicated from document for query efficiency |
| `documentId` | ObjectId → PolicyDocument | |
| `text` | String | Raw chunk text (800 chars) |
| `pageNumber` | Number | From pdf-parse page map |
| `chunkIndex` | Number | Chunk sequence within document |
| `embedding` | [Number] | 768-float vector (Gemini text-embedding-004) |
| `createdAt` | Date | |

**Indexes:** `{ organizationId, documentId }`

**Retrieval:** Cosine similarity computed application-side. Threshold: 0.70. Top-5 results used as context.

**Cleanup:** All chunks for a `documentId` are deleted when the parent `PolicyDocument` is deleted.
