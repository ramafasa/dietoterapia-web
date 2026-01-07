# REST API Plan

> Scope: MVP REST API for **PZK (Przestrzeń Zdrowej Kobiety)**, designed for an **Astro 5 SSR** app on **Vercel** using **Astro API routes** (`src/pages/api/**`), **Lucia sessions** (cookie-based), and **PostgreSQL + Drizzle ORM**.  
> Naming: paths use `/api/pzk/...`; DB uses `snake_case`; JSON uses `camelCase`.

---

## 1. Resources

- **Categories** → `pzk_categories`
- **Materials** → `pzk_materials`
- **Material PDFs** → `pzk_material_pdfs`
- **Material Videos** → `pzk_material_videos`
- **Module Access (per user)** → `pzk_module_access`
- **Notes (per user per material)** → `pzk_notes`
- **Reviews (one per user)** → `pzk_reviews`
- **Operational Events (logging only; not exposed publicly)** → existing `events`

---

## 2. Endpoints

### Conventions (applies to all endpoints)

- **Auth**: cookie session; server reads `Astro.locals.user` (Lucia).  
- **Roles**: endpoints below assume **patient-only** unless stated.
- **Response envelope** (recommended for consistency):

```json
{
  "data": null,
  "error": {
    "code": "string",
    "message": "string",
    "details": {}
  }
}
```

- **Error mapping**: use the existing `mapErrorToApiError()` pattern (domain errors → HTTP + `code`).
- **Pagination**: cursor-based where list may grow (reviews), otherwise “structured list” endpoints.
- **Security principle**: do not leak metadata for `draft`/`archived` materials (respond as if not found).

---

### 2.1. Access Summary (for navigation/menu + UI gating)

#### GET `/api/pzk/access`
- **Description**: returns whether the logged-in patient has any active PZK module access and which modules are active.
- **Query**: none
- **Request body**: none
- **Response 200**:

```json
{
  "data": {
    "hasAnyActiveAccess": true,
    "activeModules": [1, 3],
    "access": [
      { "module": 1, "startAt": "2025-01-10T12:00:00Z", "expiresAt": "2026-01-10T12:00:00Z" },
      { "module": 3, "startAt": "2025-06-01T00:00:00Z", "expiresAt": "2026-06-01T00:00:00Z" }
    ],
    "serverTime": "2025-12-19T10:00:00Z"
  },
  "error": null
}
```

- **Errors**:
  - `401 Unauthorized`: not logged in
  - `403 Forbidden`: logged in but not `patient`

**Notes**
- Active means: `revoked_at IS NULL AND start_at <= now() AND now() < expires_at`.
- This endpoint enables the PRD rule: show menu entry only if user has access to ≥1 module.

---

### 2.2. Catalog (modules → categories → materials) for the patient UI

#### GET `/api/pzk/catalog`
- **Description**: returns the PZK catalog grouped as **modules → categories → materials**. Includes locked state and CTA URL for locked items.
- **AuthZ**: patient-only; **does not require** active access (catalog is visible even when some modules are locked).
- **Query parameters**:
  - `modules`: comma-separated list (`1,2,3`) to limit modules (optional)
  - `includeStatuses`: comma-separated (`published,publish_soon`) (optional; default to both)
  - `locale`: e.g. `pl` (optional; currently labels are in DB as `label`)
- **Request body**: none
- **Response 200**:

```json
{
  "data": {
    "purchaseCta": {
      "baseUrl": "https://example.com/pzk",
      "paramName": "module"
    },
    "modules": [
      {
        "module": 1,
        "isActive": true,
        "categories": [
          {
            "id": "uuid",
            "slug": "start",
            "label": "Start",
            "description": null,
            "displayOrder": 1,
            "materials": [
              {
                "id": "uuid",
                "title": "Material title",
                "description": "Short description",
                "status": "published",
                "order": 1,
                "isLocked": false,
                "isActionable": true,
                "ctaUrl": null,
                "hasPdf": true,
                "hasVideos": true
              }
            ]
          }
        ]
      }
    ]
  },
  "error": null
}
```

- **Success codes**: `200 OK`
- **Errors**:
  - `401 Unauthorized`
  - `403 Forbidden` (non-patient)

**Business rules encoded**
- Include only materials with `status IN ('published','publish_soon')`.
- `published`:
  - if user lacks active access to the material’s module → `isLocked: true`, `isActionable: false`, `ctaUrl: <purchaseUrl>?module=<n>`
  - if user has access → `isLocked: false`, `isActionable: true`
- `publish_soon`:
  - always `isLocked: true`, `isActionable: false` (visible but disabled)

**Sorting**
- Categories: `display_order ASC`
- Materials: `order ASC` within `(module, category)`

**Performance**
- Serve with a single query (or a small, bounded number) using joins and in-memory grouping.
- Index used: `pzk_materials (status, module, category_id, order)` plus `pzk_categories(display_order)` / uniqueness.

---

### 2.3. Material details (locked vs unlocked, and non-leaking draft/archived)

#### GET `/api/pzk/materials/:materialId`
- **Description**: returns a single material view.
- **AuthZ**: patient-only.
- **Path params**:
  - `materialId`: UUID
- **Query params**:
  - `include`: comma-separated (`pdfs,videos,note`) (optional; default: `pdfs,videos,note`)
- **Request body**: none

##### Response 200 (unlocked, `published` + access)

```json
{
  "data": {
    "id": "uuid",
    "module": 1,
    "category": { "id": "uuid", "slug": "start", "label": "Start", "displayOrder": 1 },
    "status": "published",
    "order": 1,
    "title": "Material title",
    "description": "Optional description",
    "contentMd": "## Optional author content",
    "pdfs": [
      { "id": "uuid", "fileName": "file.pdf", "displayOrder": 1 }
    ],
    "videos": [
      { "id": "uuid", "youtubeVideoId": "dQw4w9WgXcQ", "title": "Optional", "displayOrder": 1 }
    ],
    "note": { "content": "My private note", "updatedAt": "2025-12-19T10:00:00Z" },
    "access": { "isLocked": false, "ctaUrl": null }
  },
  "error": null
}
```

##### Response 200 (locked, `published` but no access)

```json
{
  "data": {
    "id": "uuid",
    "module": 2,
    "status": "published",
    "order": 3,
    "title": "Material title",
    "description": "Optional description",
    "contentMd": null,
    "pdfs": [],
    "videos": [],
    "note": null,
    "access": {
      "isLocked": true,
      "reason": "no_module_access",
      "ctaUrl": "https://example.com/pzk?module=2"
    }
  },
  "error": null
}
```

##### Responses for restricted states
- **`draft` / `archived`**: `404 Not Found` (no metadata leak)
- **`publish_soon`**:
  - either `200` with `access.isLocked=true` and without actionable content (recommended to match catalog)
  - or `404` if you want “not yet available” to appear as missing (not recommended because PRD requires visibility)

- **Errors**:
  - `401 Unauthorized`
  - `403 Forbidden` (non-patient)
  - `404 Not Found` (non-existent / `draft` / `archived`)

---

### 2.4. Presigned PDF download (business action)

> Goal: presign is created *on click*, TTL=60s, only for authorized users. Best-effort logging in `events`.

#### POST `/api/pzk/materials/:materialId/pdfs/:pdfId/presign`
- **Description**: generates a presigned GET URL for a specific PDF attached to a material.
- **AuthZ**:
  - material must be `published`
  - user must have active module access for `material.module`
- **Path params**:
  - `materialId`: UUID
  - `pdfId`: UUID
- **Request body** (optional overrides; keep minimal for security):

```json
{
  "ttlSeconds": 60
}
```

- **Response 200**:

```json
{
  "data": {
    "url": "https://storage.example.com/...signature...",
    "expiresAt": "2025-12-19T10:01:00Z",
    "ttlSeconds": 60
  },
  "error": null
}
```

- **Errors**:
  - `401 Unauthorized`
  - `403 Forbidden`:
    - no module access
    - `publish_soon` (not actionable)
  - `404 Not Found`:
    - material missing / `draft` / `archived`
    - pdf not found under that material
  - `429 Too Many Requests`: rate limit triggered
  - `500 Internal Server Error`: storage/presign failure (no sensitive details)

**Operational logging (events table)**
- On success: `event_type = 'pzk_pdf_presign_success'`
- On forbidden: `event_type = 'pzk_pdf_presign_forbidden'`
- On error: `event_type = 'pzk_pdf_presign_error'`
- `properties` (JSONB):
  - `materialId`, `pdfId`, `module`, `ttlSeconds`
  - `reason`: `no_access | material_not_found | pdf_not_found | invalid_state | storage_error`
  - optional `storageProvider`: `r2 | s3`

**Rate limiting**
- Apply a stricter limit here than for reads (e.g., per-user and per-IP), because it creates signed URLs.

---

### 2.5. Notes (private per user per material)

#### GET `/api/pzk/materials/:materialId/note`
- **Description**: returns the current user’s note for a material (or null).
- **AuthZ**: requires active access to the module and material `published`.
- **Response 200**:

```json
{
  "data": {
    "materialId": "uuid",
    "content": "My note",
    "updatedAt": "2025-12-19T10:00:00Z"
  },
  "error": null
}
```

- If none exists, return:

```json
{ "data": null, "error": null }
```

- **Errors**: `401`, `403`, `404` (material missing / draft / archived)

#### PUT `/api/pzk/materials/:materialId/note`
- **Description**: creates or replaces the note (idempotent upsert).
- **AuthZ**: same as GET note.
- **Request body**:

```json
{ "content": "string" }
```

- **Response 200**:

```json
{
  "data": { "materialId": "uuid", "content": "string", "updatedAt": "2025-12-19T10:00:00Z" },
  "error": null
}
```

- **Errors**:
  - `400 Bad Request` (missing/invalid content)
  - `401`, `403`, `404`
  - `409 Conflict` (rare; unique constraint race on `(userId, materialId)`—handle via transaction/upsert)

#### DELETE `/api/pzk/materials/:materialId/note`
- **Description**: deletes user’s note for that material.
- **AuthZ**: same as GET note.
- **Response 204 No Content**
- **Errors**: `401`, `403`, `404`

---

### 2.6. Reviews (PZK-only; visible only to users with any active access)

> Access rule: user must have **at least one active module access** to view and manage reviews.

#### GET `/api/pzk/reviews`
- **Description**: lists PZK reviews (for social proof inside PZK).
- **AuthZ**: patient-only + `hasAnyActiveAccess === true`.
- **Query params**:
  - `cursor`: opaque cursor (optional)
  - `limit`: integer (optional; default 20; max 50)
  - `sort`: `createdAtDesc` (default) | `updatedAtDesc` (optional)
- **Response 200**:

```json
{
  "data": {
    "items": [
      {
        "id": "uuid",
        "author": { "firstName": "Anna" },
        "rating": 6,
        "content": "Great program",
        "createdAt": "2025-12-01T10:00:00Z",
        "updatedAt": "2025-12-02T10:00:00Z"
      }
    ],
    "nextCursor": "opaque-or-null"
  },
  "error": null
}
```

- **Errors**: `401`, `403` (no access or non-patient)

#### GET `/api/pzk/reviews/me`
- **Description**: returns the logged-in user’s review (or null).
- **AuthZ**: patient-only + any active access.
- **Response 200**:

```json
{
  "data": { "id": "uuid", "rating": 5, "content": "string", "createdAt": "...", "updatedAt": "..." },
  "error": null
}
```

or `{ "data": null, "error": null }`

- **Errors**: `401`, `403`

#### PUT `/api/pzk/reviews/me`
- **Description**: creates or updates the user’s single review (upsert).
- **AuthZ**: patient-only + any active access.
- **Request body**:

```json
{ "rating": 1, "content": "string" }
```

- **Response 200**:

```json
{ "data": { "id": "uuid", "rating": 4, "content": "string", "createdAt": "...", "updatedAt": "..." }, "error": null }
```

- **Errors**:
  - `400 Bad Request` (rating not integer 1–6, empty content)
  - `401`, `403`
  - `409 Conflict` (unique constraint on `user_id` if concurrent insert; implement with upsert)

#### DELETE `/api/pzk/reviews/me`
- **Description**: hard-deletes the user’s review.
- **AuthZ**: patient-only + any active access.
- **Response 204 No Content**
- **Errors**: `401`, `403`, `404` (if no review exists)

---


## 3. Authentication and Authorization

### 3.1. Authentication
- **Mechanism**: Lucia sessions stored in cookies; SSR and API routes read session via middleware (`Astro.locals.user/session`).
- **API behavior**:
  - If not logged in: return `401` with `error.code = 'unauthorized'`.

### 3.2. Authorization

#### Role gating
- All `/api/pzk/**` endpoints require:
  - logged-in user
  - `role === 'patient'`

#### Module access gating (per PRD)
- For content actions (material details content, notes, presign):
  - `material.status` must be `published`
  - user must have an **active** `pzk_module_access` row for `material.module`
- For catalog listing:
  - user can see all `published` and `publish_soon` materials (but locked states vary)
- For reviews:
  - user must have active access to **any** module

#### Non-leak behavior
- For `draft` / `archived` materials: respond `404` even for authenticated users (unless you later add admin endpoints).

### 3.3. CSRF
- Cookie-based auth implies CSRF risk for state-changing endpoints (`PUT/DELETE/POST`).
- Recommended MVP approach (pick one):
  - **Option A (recommended)**: enforce same-site cookies + double-submit CSRF token header (e.g., `X-CSRF-Token`) for non-GET.
  - **Option B**: require `Origin`/`Referer` checks for non-GET + same-site cookies (simpler but less flexible).

### 3.4. Rate limiting
- Reuse existing rate-limit utilities.
- Suggested limits (tune in config):
  - `GET /api/pzk/catalog`: moderate (e.g., 60/min/user)
  - `GET /api/pzk/materials/:id`: moderate (60/min/user)
  - `PUT /note` and `PUT /reviews/me`: lower (20/min/user)
  - `POST presign`: strict (10/min/user + 30/min/ip) with burst protection

---

## 4. Validation and Business Logic

### 4.1. Resource validation (mirrors DB constraints)

#### `pzk_categories`
- `slug`: required, unique, max length 80
- `label`: required, max length 160
- `displayOrder`: required, integer, `> 0`, unique

#### `pzk_materials`
- `module`: required, integer in `{1,2,3}`
- `categoryId`: required, FK to `pzk_categories`
- `status`: required, one of `draft | published | archived | publish_soon`
- `order`: required, integer `> 0`, unique within `(module, categoryId)`
- `title`: required, max length 200
- `description`: optional
- `contentMd`: optional (text)

#### `pzk_material_pdfs`
- `materialId`: required, FK to `pzk_materials`
- `objectKey`: required (text)
- `displayOrder`: required, integer `> 0`, unique per `materialId`
- Optional uniqueness: `(materialId, objectKey)` if enforced

#### `pzk_material_videos`
- `materialId`: required, FK to `pzk_materials`
- `youtubeVideoId`: required, max length 32 (store ID only)
- `displayOrder`: required, integer `> 0`, unique per `materialId`
- Optional uniqueness: `(materialId, youtubeVideoId)` if enforced

#### `pzk_module_access`
- `userId`: required, FK to `users`
- `module`: required, integer in `{1,2,3}`
- `startAt`: required
- `expiresAt`: required and must be `> startAt`
- `revokedAt`: optional
- Unique: `(userId, module, startAt)` (history allowed)

#### `pzk_notes`
- `userId`, `materialId`: required; unique pair `(userId, materialId)`
- `content`: required (text); validate max size in API (e.g., 10k chars)

#### `pzk_reviews`
- `userId`: required, unique (one review per user)
- `rating`: required integer 1–6
- `content`: required (text); validate max size in API (e.g., 5k chars)

---

### 4.2. Business rules from PRD (how implemented in API)

- **Catalog visibility**:
  - Only `published` and `publish_soon` are returned from `/catalog`.
  - `draft` and `archived` never appear in patient endpoints.
- **Locked state**:
  - For `published` without access: material remains visible, but non-actionable; returns CTA URL.
  - For `publish_soon`: visible but always non-actionable (greyed out in UI).
- **Access duration**:
  - Access is active based on `startAt`/`expiresAt` (12 months from start, written explicitly to DB as per schema recommendation).
- **Presign TTL**:
  - Default `60s`; optionally accept only whitelisted TTL values (e.g., fixed 60) to prevent misuse.
- **Observability**:
  - Presign endpoints emit `events` entries on success/forbidden/error with minimal safe metadata.

---

### 4.3. API design choices (key tradeoffs)

- **Catalog endpoint is denormalized** (`/catalog`) instead of separate CRUD reads for categories/materials:
  - minimizes client round-trips and avoids N+1 on SSR.
- **Presign endpoint is a “command”** (`POST .../presign`) rather than exposing `objectKey`:
  - prevents storage key leaks and centralizes authorization + logging.
- **Notes and “my review” use `/me`**:
  - removes need for passing `userId` and prevents IDOR classes of bugs.

---

### 4.4. Security & performance requirements checklist

- **No metadata leaks for draft/archived**: patient endpoints return `404`.
- **Short-lived presigned URLs**: TTL=60s.
- **Rate limiting** on presign and write endpoints.
- **Input validation** with Zod on all request bodies and key query params.
- **Indexes alignment**:
  - materials list queries should hit `INDEX (status, module, category_id, order)`
  - access checks should hit `INDEX (user_id, expires_at)` plus `revoked_at` filtering
- **Minimize DB round-trips**:
  - `/catalog` should be implemented with a single join and grouped response.
  - material details should load material + PDFs + videos + note with bounded queries.


