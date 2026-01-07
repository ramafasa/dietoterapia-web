## API Endpoint Implementation Plan: PZK Notes (private per user per material)

## 1. Przegląd punktu końcowego

Celem jest wdrożenie zestawu endpointów do zarządzania **prywatną notatką pacjenta** przypisaną do konkretnego materiału PZK (maks. 1 notatka na parę `(userId, materialId)`), zgodnie ze specyfikacją:

- **GET** `/api/pzk/materials/:materialId/note` — zwraca notatkę użytkownika lub `null`
- **PUT** `/api/pzk/materials/:materialId/note` — idempotentny upsert (create/replace)
- **DELETE** `/api/pzk/materials/:materialId/note` — usuwa notatkę użytkownika dla materiału

Kontrakt odpowiedzi dla GET/PUT jest w **PZK envelope** (`{ data, error }`) zgodnym z istniejącymi endpointami PZK (`src/pages/api/pzk/access.ts`, `src/pages/api/pzk/catalog.ts`) i helperami `ok()` / `ErrorResponses` z `src/lib/pzk/api.ts`.

### Kluczowe zasady biznesowe i autoryzacja (AuthZ)

- **Uwierzytelnienie**: wymagane (sesja Lucia w cookies → `Astro.locals.user`).
- **Rola**: `patient` (jak w pozostałych endpointach PZK).
- **Dostęp do modułu**: wymagany aktywny dostęp do modułu materiału (`pzk_module_access`).
- **Status materiału**: materiał musi być **`published`**.
- **Brak wycieku metadanych**: dla `draft`/`archived` (oraz rekomendacyjnie także `publish_soon`, bo “notatki tylko dla published”) zwracamy `404`.

## 2. Szczegóły żądania

### 2.1. Wspólne elementy (dla GET/PUT/DELETE)

- **Struktura URL**: `/api/pzk/materials/:materialId/note`
- **Parametry URL**:
  - **Wymagane**:
    - `materialId` (path) — UUID materiału
  - **Opcjonalne**: brak
- **Nagłówki**:
  - **Response** zawsze ustawiamy: `Content-Type: application/json` (dla 200/400/401/403/404/409/500)
  - **Cache**: `Cache-Control: no-store` (dane per-user)

### 2.2. GET `/api/pzk/materials/:materialId/note`

- **Body**: brak
- **Walidacja**:
  - `materialId` jest poprawnym UUID

### 2.3. PUT `/api/pzk/materials/:materialId/note`

- **Body**:

```json
{ "content": "string" }
```

- **Walidacja**:
  - `materialId` jest poprawnym UUID
  - `content`:
    - typ: string
    - wymagany
    - po trim: min. 1 znak (nie pozwalamy na “pustą notatkę”)
    - rekomendowany limit długości: **max 10 000 znaków** (spójnie z komentarzem w `PzkNoteUpsertRequest` w `src/types/pzk-dto.ts`)

### 2.4. DELETE `/api/pzk/materials/:materialId/note`

- **Body**: brak
- **Walidacja**:
  - `materialId` jest poprawnym UUID

## 3. Wykorzystywane typy (DTO i Command modele)

### 3.1. DTO (publiczne, już zdefiniowane)

Zgodnie z `src/types/pzk-dto.ts`:

- `ApiResponse<T>`
- `ApiError`
- `PzkNoteDto`
- `PzkNoteUpsertRequest`

### 3.2. Command modele (wewnętrzne, rekomendowane)

W celu separacji logiki serwisowej od transportu HTTP:

- `GetPzkNoteQuery`:
  - `userId: string`
  - `materialId: string`
  - `now?: Date` (opcjonalnie, dla spójności “single now” jak w `PzkAccessService`)
- `UpsertPzkNoteCommand`:
  - `userId: string`
  - `materialId: string`
  - `content: string`
  - `now?: Date`
- `DeletePzkNoteCommand`:
  - `userId: string`
  - `materialId: string`
  - `now?: Date` (opcjonalnie, jeśli kiedyś dodamy soft delete / logi)

## 4. Szczegóły odpowiedzi

### 4.1. GET — 200 OK

- **Jeśli notatka istnieje**:

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

- **Jeśli notatka nie istnieje**:

```json
{ "data": null, "error": null }
```

### 4.2. PUT — 200 OK

Zawsze zwracamy 200 (upsert idempotentny), zgodnie z route spec:

```json
{
  "data": {
    "materialId": "uuid",
    "content": "string",
    "updatedAt": "2025-12-19T10:00:00Z"
  },
  "error": null
}
```

### 4.3. DELETE — 204 No Content

- **Body**: puste (brak envelope), `Cache-Control: no-store`.
- **Zachowanie idempotentne** (rekomendacja): jeśli notatka nie istnieje, nadal zwracamy `204`.

## 5. Przepływ danych

### 5.1. Warstwa HTTP (Astro API route)

Docelowe pliki (zgodnie z routingiem Astro):

- `src/pages/api/pzk/materials/[materialId]/note.ts`
  - eksporty: `export const GET`, `export const PUT`, `export const DELETE`
  - `export const prerender = false`

Wzorzec (taki jak w istniejących PZK endpointach):

- **AuthN**: `if (!locals.user) → 401` (PZK envelope)
- **AuthZ (rola)**: `if (locals.user.role !== 'patient') → 403`
- **Walidacja wejścia**: Zod / walidacja paramów
- **Wywołanie serwisu**: `PzkNotesService`
- **Response**:
  - 200 → `ok(data)` / `ok(null)` (dla GET)
  - 204 → pusty body
  - błędy → `ErrorResponses.*` lub dedykowane helpery (np. `FORBIDDEN_NO_MODULE_ACCESS`)

### 5.2. Warstwa serwisowa (business logic)

Zalecane nowe artefakty:

- `src/lib/services/pzkNotesService.ts`
  - `getNote(userId, materialId, now?)`
  - `upsertNote(userId, materialId, content, now?)`
  - `deleteNote(userId, materialId, now?)`

**Asercje dostępu** (wspólne dla wszystkich metod):

1. Pobierz materiał `pzk_materials` po `materialId`.
2. Jeśli brak lub `status !== 'published'` → traktuj jako **NOT FOUND** (404) bez ujawniania metadanych.
3. Sprawdź aktywny dostęp do modułu materiału w `pzk_module_access`:
   - aktywny = `revoked_at IS NULL AND start_at <= now AND now < expires_at`
4. Jeśli brak aktywnego dostępu → **FORBIDDEN** (403).

### 5.3. Warstwa repozytoriów (DB access)

Zalecane nowe repozytoria (spójnie z `PzkAccessRepository` / `PzkCatalogRepository`):

- `src/lib/repositories/pzkMaterialsRepository.ts`
  - `getById(materialId)` → minimalny rekord: `id`, `module`, `status`
- `src/lib/repositories/pzkNotesRepository.ts`
  - `getByUserAndMaterial(userId, materialId)`
  - `upsertByUserAndMaterial(userId, materialId, content, now)`
  - `deleteByUserAndMaterial(userId, materialId)`

Implementacja upsert (Postgres):

- Preferowane: `INSERT ... ON CONFLICT (user_id, material_id) DO UPDATE ...`
- Drizzle: `db.insert(pzkNotes).values(...).onConflictDoUpdate({ target: [pzkNotes.userId, pzkNotes.materialId], set: { content, updatedAt: now } })`

To praktycznie eliminuje ryzyko `409` (race na unikalności), ale plan powinien zakładać:

- jeśli DB/ORM nie pozwala na stabilny upsert → fallback: transakcja + retry albo jawna obsługa konfliktu i `409`.

## 6. Względy bezpieczeństwa

### 6.1. IDOR (Insecure Direct Object Reference)

- `materialId` jest dostarczany przez klienta; musimy **zawsze** wiązać notatkę z `locals.user.id`, nigdy z `userId` z requestu.
- Zapytania DB do `pzk_notes` zawsze filtrują po `(userId, materialId)`; brak endpointu, który przyjmowałby `userId`.

### 6.2. Ochrona materiałów w stanach niepublicznych

- Dla `draft`/`archived` (oraz rekomendacyjnie `publish_soon` dla notatek) zwracamy `404`, bez informacji “czy materiał istnieje”.

### 6.3. CSRF (ważne dla PUT/DELETE)

Auth jest cookie-based, więc PUT/DELETE są potencjalnie podatne na CSRF.

Minimalny wymóg MVP (rekomendacja do ujednolicenia dla całego `/api/pzk/*`):

- Sprawdzenie `Origin`/`Referer` dla metod mutujących (PUT/DELETE) i odrzucanie żądań spoza `SITE_URL`.
- Alternatywnie (docelowo lepiej): token CSRF (double-submit cookie + header).

W planie implementacji należy ustalić, czy repo ma już globalną ochronę CSRF dla `/api/*` (obecne PZK endpointy jej nie implementują w plikach rout).

### 6.4. Walidacja i XSS w notatkach

- Notatka jest prywatna, ale nadal może być renderowana w UI: należy traktować `content` jako **plain text**.
- UI powinno renderować przez escaping (domyślnie React ucieka HTML). Nie renderować jako HTML bez sanitizacji.

### 6.5. Rate limiting (opcjonalne)

- Notatki mogą być spamowane przez automaty: rozważyć lekkie limity per-user (np. 30/min) dla PUT/DELETE.
- Repo ma rate limitery dla innych obszarów (`src/lib/rate-limit-public.ts`, `src/lib/rate-limit.ts`), ale brak jeszcze dedykowanego dla PZK — decyzja projektowa.

## 7. Obsługa błędów

### 7.1. Scenariusze błędów i statusy

- **400 Bad Request**
  - `materialId` nie jest UUID
  - brak body / niepoprawny JSON
  - `content` brak / nie jest string / po trim jest puste / przekracza limit
- **401 Unauthorized**
  - brak `locals.user`
- **403 Forbidden**
  - `locals.user.role !== 'patient'`
  - brak aktywnego dostępu do modułu materiału
- **404 Not Found**
  - materiał nie istnieje
  - materiał istnieje, ale `status !== 'published'` (w szczególności `draft` / `archived`; rekomendacyjnie też `publish_soon`)
- **409 Conflict** (zgodnie ze specyfikacją; rzadkie)
  - konflikt unikalności `(user_id, material_id)` przy równoległych zapisach, jeśli upsert nie zadziałał (fallback)
- **500 Internal Server Error**
  - błąd DB, błąd runtime, błąd nieobsłużony

### 7.2. Kształt błędów (PZK envelope)

Stosujemy `ErrorResponses` z `src/lib/pzk/api.ts` (lub rozszerzamy o nowe warianty), np.:

- `ErrorResponses.UNAUTHORIZED` → `{ data: null, error: { code: 'unauthorized', message: 'Authentication required' } }`
- `ErrorResponses.FORBIDDEN_PATIENT_ROLE`
- `ErrorResponses.BAD_REQUEST(message)`
- `ErrorResponses.NOT_FOUND(message?)`
- `ErrorResponses.INTERNAL_SERVER_ERROR`

Dla `403` “brak dostępu do modułu” warto dodać dedykowany kod (rekomendacja):

- `code: 'forbidden'`, `message: 'Brak aktywnego dostępu do modułu'`, `details: { reason: 'no_module_access' }`

### 7.3. Logowanie błędów / observability

- Dla niespodziewanych błędów: `console.error('[METHOD /api/pzk/materials/:materialId/note] Error:', error)` (tak jak w `access.ts` i `catalog.ts`).
- Specyfikacja PZK logów (`events`) dotyczy głównie presign PDF; dla notatek nie ma wymagania logowania do DB.
- Opcjonalnie (jeśli chcecie wzmocnić obserwowalność): event typu `pzk_note_error` z `properties: { materialId, userId, method }` (bez treści notatki).

## 8. Wydajność

- Zapytania są O(1) per request (pojedynczy materiał):
  - 1x select materiału (module + status)
  - 1x check dostępu do modułu (najlepiej przez warunek WHERE z indeksem `idx_pzk_module_access_user_expires`)
  - 1x select/upsert/delete notatki (indeks unikalny `idx_pzk_notes_user_material`)
- **Brak cache** (`no-store`) — celowo, bo dane per-user.
- Upsert powinien być pojedynczym statementem `INSERT ... ON CONFLICT DO UPDATE`.

## 9. Kroki implementacji

1. **Routing (Astro)**
   - Utworzyć plik `src/pages/api/pzk/materials/[materialId]/note.ts`.
   - Ustawić `export const prerender = false`.
   - Zaimplementować `GET`, `PUT`, `DELETE` jako `APIRoute`.

2. **Walidacja wejścia**
   - Zdefiniować Zod schema dla:
     - `materialId`: `z.string().uuid()`
     - `PUT body`: `z.object({ content: z.string().trim().min(1).max(10000) })`
   - Obsłużyć błędy walidacji jako `400` z `ErrorResponses.BAD_REQUEST(...)`.

3. **Warstwa repozytoriów**
   - Dodać `PzkMaterialsRepository` (minimalny select po `id`).
   - Dodać `PzkNotesRepository` z metodami get/upsert/delete.
   - W repozytorium notatek użyć `ON CONFLICT` na `(user_id, material_id)`.

4. **Warstwa serwisowa**
   - Dodać `PzkNotesService`:
     - wspólny “guard” `assertCanAccessPublishedMaterial(userId, materialId, now)`:
       - 404 jeśli materiał nie istnieje lub nie `published`
       - 403 jeśli brak aktywnego dostępu do modułu
     - `getNote` zwraca `PzkNoteDto | null`
     - `upsertNote` zwraca `PzkNoteDto`
     - `deleteNote` wykonuje delete (idempotentnie)

5. **Spójność kontraktu odpowiedzi**
   - GET/PUT: envelope `ApiResponse<PzkNoteDto>` i `ok(data)` / `ok(null)`.
   - DELETE: `204 No Content` bez body.
   - Nagłówki: `Content-Type` (dla JSON) oraz `Cache-Control: no-store`.

6. **Obsługa błędów**
   - 401/403/404: zwracać zgodnie z PZK envelope (jak w `access.ts` / `catalog.ts`).
   - 500: `ErrorResponses.INTERNAL_SERVER_ERROR` + `console.error`.
   - 409: tylko jeśli faktycznie wystąpi konflikt unikalności (fallback).

7. **Testy (rekomendacja, jeśli scope obejmuje)**
   - Unit (Vitest):
     - `PzkNotesService`:
       - 404 dla materiału `draft/archived/nonexistent`
       - 403 dla braku dostępu
       - GET zwraca `null` gdy brak notatki
       - PUT upsert aktualizuje `updatedAt`
       - DELETE jest idempotentny
   - Integration:
     - sprawdzenie `ON CONFLICT` przy równoległych upsert (opcjonalnie)
   - E2E (Playwright):
     - pacjent z dostępem: zapis/odczyt/usunięcie notatki
     - pacjent bez dostępu: 403
     - materiał niepublished: 404


