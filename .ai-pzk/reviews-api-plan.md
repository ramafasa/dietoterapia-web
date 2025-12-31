## API Endpoint Implementation Plan: PZK Reviews (`/api/pzk/reviews*`)

## 1. Przegląd punktu końcowego

Endpointy **PZK Reviews** dostarczają recenzje programu PZK jako “social proof” w strefie PZK oraz pozwalają pacjentowi zarządzać **jedną** własną recenzją (create/update/delete).

- **Zasada dostępu (twarda)**: użytkownik musi być zalogowanym pacjentem i mieć **co najmniej jeden aktywny dostęp** do modułu PZK.
- **Źródło danych**: `pzk_reviews` (1 recenzja na user) + `users.first_name` (dla `author.firstName`).
- **Konwencje projektu**: PZK endpoints używają `ApiResponse<T>` z `src/types/pzk-dto.ts` oraz `ErrorResponses` z `src/lib/pzk/api.ts`.

## 2. Szczegóły żądania

### GET `/api/pzk/reviews`

- **Metoda HTTP**: `GET`
- **Struktura URL**: `/api/pzk/reviews`
- **AuthN**: cookie session (Lucia) → `locals.user`
- **AuthZ**: `role === 'patient'` + `hasAnyActiveAccess === true`
- **Parametry (query)**:
  - **opcjonalne**:
    - `cursor`: string (opaque)
    - `limit`: int, default `20`, max `50`
    - `sort`: `createdAtDesc` (default) | `updatedAtDesc`
- **Walidacja query**:
  - `limit`: parseInt; jeśli NaN/<=0 → 400; jeśli >50 → 400 lub clamp (rekomendacja: 400 żeby kontrakt był jednoznaczny)
  - `sort`: enum, fallback `createdAtDesc`
  - `cursor`: jeśli jest podane, musi dać się zdekodować i pasować do wybranego `sort` (w przeciwnym razie 400)

### GET `/api/pzk/reviews/me`

- **Metoda HTTP**: `GET`
- **Struktura URL**: `/api/pzk/reviews/me`
- **AuthZ**: patient-only + any active access
- **Parametry**: brak

### PUT `/api/pzk/reviews/me`

- **Metoda HTTP**: `PUT`
- **Struktura URL**: `/api/pzk/reviews/me`
- **AuthZ**: patient-only + any active access
- **Request body (JSON)**:

```json
{ "rating": 1, "content": "string" }
```

- **Walidacja body (Zod)**:
  - `rating`: `z.number().int().min(1).max(6)`
  - `content`: `z.string().transform(s => s.trim()).min(1)`
  - (zalecane) limit długości: np. max 2000–5000 znaków (ochrona przed payload abuse)

### DELETE `/api/pzk/reviews/me`

- **Metoda HTTP**: `DELETE`
- **Struktura URL**: `/api/pzk/reviews/me`
- **AuthZ**: patient-only + any active access
- **Parametry**: brak

## 3. Szczegóły odpowiedzi

### Envelope i nagłówki

- Dla endpointów zwracających JSON:
  - `Content-Type: application/json`
  - `Cache-Control: no-store` (dane per-user, brak cachowania)
  - Body: `ApiResponse<T>` z `src/types/pzk-dto.ts`
- Dla `DELETE /api/pzk/reviews/me`:
  - **204 No Content** (bez body), nadal `Cache-Control: no-store`

### GET `/api/pzk/reviews` — Response 200

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

### GET `/api/pzk/reviews/me` — Response 200

- Jeśli istnieje recenzja:

```json
{
  "data": { "id": "uuid", "rating": 5, "content": "string", "createdAt": "...", "updatedAt": "..." },
  "error": null
}
```

- Jeśli nie istnieje recenzja:

```json
{ "data": null, "error": null }
```

### PUT `/api/pzk/reviews/me` — Response 200

```json
{ "data": { "id": "uuid", "rating": 4, "content": "string", "createdAt": "...", "updatedAt": "..." }, "error": null }
```

> Uwaga: mimo że to może tworzyć rekord, spec wymaga **200**, nie 201.

### DELETE `/api/pzk/reviews/me` — Response 204

- Bez body (`No Content`)

## 4. Przepływ danych

### Wspólny “request guard” (dla wszystkich 4 tras)

- **Krok 1 — AuthN**: sprawdź `locals.user`; jeśli brak → 401 `ErrorResponses.UNAUTHORIZED`.
- **Krok 2 — AuthZ rola**: `locals.user.role === 'patient'`; inaczej → 403 `ErrorResponses.FORBIDDEN_PATIENT_ROLE`.
- **Krok 3 — AuthZ dostęp do PZK**:
  - użyj `PzkAccessService.getAccessSummary(userId)` i sprawdź `hasAnyActiveAccess`
  - jeśli `false` → 403 (nowy error response, np. `fail('forbidden', 'Active PZK access required')`)

### GET `/api/pzk/reviews` (list)

- Waliduj query (`cursor/limit/sort`) → 400 w razie błędu.
- `PzkReviewService.listReviews({ userId, sort, limit, cursor })`:
  - buduje zapytanie z keyset pagination:
    - sort `createdAtDesc`: orderBy `(created_at DESC, id DESC)`
    - sort `updatedAtDesc`: orderBy `(updated_at DESC, id DESC)`
  - join z `users` po `user_id`, select `users.first_name`
  - zwraca `items` i `nextCursor`
- Zwróć `ok({ items, nextCursor })`.

### GET `/api/pzk/reviews/me`

- `PzkReviewService.getMyReview(userId)`:
  - select z `pzk_reviews` po `user_id`
  - jeśli brak → `ok(null)`
  - jeśli jest → map do `PzkMyReviewDto` (ISO timestamps)

### PUT `/api/pzk/reviews/me` (upsert)

- Waliduj body Zod:
  - rating 1..6 int
  - content trim != ''
- `PzkReviewService.upsertMyReview(userId, { rating, content })`:
  - repo: `insert ... on conflict(user_id) do update ... returning ...`
  - ustaw `updated_at = now()` (po stronie DB) lub w kodzie (spójnie z resztą schematu)
  - zwróć rekord jako DTO
- Edge: jeśli mimo upsert wystąpi unique violation (np. brak onConflict w danym kod-path) → 409.

### DELETE `/api/pzk/reviews/me`

- `PzkReviewService.deleteMyReview(userId)`:
  - delete po `user_id`
  - jeśli `rowCount === 0` → 404
  - inaczej → 204

## 5. Względy bezpieczeństwa

- **Autoryzacja “any active access”**: obowiązkowa dla wszystkich tras reviews; implementować przed jakimkolwiek odczytem/zapisem danych.
- **CSRF (ważne dla PUT/DELETE)**:
  - Minimalnie: sprawdzaj `Origin`/`Referer` dla non-GET i odrzucaj jeśli niezgodne z `SITE_URL`.
  - Docelowo: token CSRF (double-submit cookie lub token w sesji + header `X-CSRF-Token`).
- **XSS / sanitizacja**:
  - Serwer zapisuje `content` jako plain text.
  - UI renderuje tekst z escapowaniem; nie interpretować HTML.
- **Rate limiting**:
  - PUT/DELETE: niższy limit per user + per IP (ochrona przed spamem / DoS).
- **Brak cache**: `Cache-Control: no-store` na wszystkich odpowiedziach (również 4xx/5xx) — zgodnie z istniejącymi endpointami PZK.

## 6. Obsługa błędów

### Standard odpowiedzi błędów (PZK envelope)

Zwracaj:

- `401` → `ErrorResponses.UNAUTHORIZED`
- `403` → `ErrorResponses.FORBIDDEN_PATIENT_ROLE` lub dedykowany błąd “no active access”
- `400` → `ErrorResponses.BAD_REQUEST(message, details?)`
- `404` → `ErrorResponses.NOT_FOUND(...)`
- `500` → `ErrorResponses.INTERNAL_SERVER_ERROR`

### Zalecane kody/komunikaty błędów dla Reviews

- **403 (no access)**:
  - code: `forbidden`
  - message: np. `Active PZK access required`
  - (opcjonalnie) details: `{ reason: 'no_active_access' }`
- **400 (validation_error)**:
  - dla `limit/sort/cursor` oraz `rating/content`
  - details: `{ field, reason }` (w miarę możliwości)
- **409 (conflict)**:
  - code: `conflict`
  - message: np. `Konflikt podczas zapisu recenzji, spróbuj ponownie`

### Logowanie

- Na poziomie endpointu: `console.error('[<METHOD> <route>] Error:', error)` (jak w `src/pages/api/pzk/access.ts`).
- Opcjonalnie: eventy w `events` dla 500 (MVP+), jeśli chcecie śledzić awarie PZK w DB.

## 7. Wydajność

- **Pagination**:
  - Stosować keyset/cursor pagination (stabilne orderBy + cursor na `(timestamp, id)`).
  - `limit` domyślnie 20, max 50.
- **Indeksy**:
  - Już istnieje index `idx_pzk_reviews_created_at (created_at DESC)`.
  - Jeśli wspieramy `sort=updatedAtDesc` i będzie używany w produkcji → rozważyć dodanie:
    - `idx_pzk_reviews_updated_at (updated_at DESC)`
  - Dla stałej wydajności keyset: rozważyć index z `(created_at DESC, id DESC)` / `(updated_at DESC, id DESC)` (MVP: opcjonalnie).
- **Join users**:
  - Select tylko `users.first_name` (nie pobierać innych pól).
- **No-store**:
  - Wymusza brak cache, ale minimalizuje ryzyko wycieku danych. Wydajność listy utrzymujemy przez indeksy i limit.

## 8. Kroki implementacji

1. **Weryfikacja schematu DB**:
   - Potwierdzić w migracjach, że `pzk_reviews` ma:
     - `UNIQUE(user_id)`
     - `CHECK (rating BETWEEN 1 AND 6)`
     - `content NOT NULL`
   - Jeśli brakuje `idx_pzk_reviews_updated_at` a planujecie `updatedAtDesc` → dodać migrację.

2. **Nowe repozytorium**: `src/lib/repositories/pzkReviewRepository.ts`
   - `listReviews({ limit, cursor, sort })` z joinem `users.firstName`
   - `getByUserId(userId)`
   - `upsertByUserId(userId, rating, content)` (Postgres `ON CONFLICT (user_id) DO UPDATE`)
   - `deleteByUserId(userId)` zwracające `rowCount`

3. **Nowy serwis**: `src/lib/services/pzkReviewService.ts`
   - Metody:
     - `listReviews(userId, params)`
     - `getMyReview(userId)`
     - `upsertMyReview(userId, request)`
     - `deleteMyReview(userId)`
   - Użycie `PzkAccessService` (lub `PzkAccessRepository`) do wymuszenia `hasAnyActiveAccess`.
   - Implementacja cursorów (opaque base64url) dla `(createdAt/id)` i `(updatedAt/id)`.

4. **API routes**:
   - `src/pages/api/pzk/reviews/index.ts` → `GET`
   - `src/pages/api/pzk/reviews/me.ts` → `GET`, `PUT`, `DELETE`
   - Konwencje:
     - `export const prerender = false`
     - nagłówki `Content-Type` + `Cache-Control: no-store`
     - walidacja Zod query/body
     - błędy przez `ErrorResponses` + ewentualne nowe helpery

5. **Rozszerzenie `ErrorResponses` (jeśli potrzebne)**:
   - Dodać w `src/lib/pzk/api.ts` stały błąd dla “brak aktywnego dostępu” albo używać `fail('forbidden', ...)` inline w endpointach (zalecane: stała dla spójności).

6. **Testy**
   - **Unit/Integration (Vitest)**:
     - walidacja: `rating`, `content`, `limit/sort/cursor`
     - autoryzacja: brak sesji (401), zła rola (403), brak dostępu (403)
     - upsert: create → update; równoległe upserty (best-effort) bez duplikatów
     - delete: 404 gdy brak
   - **E2E (Playwright)**:
     - pacjent z aktywnym dostępem: widzi listę i może dodać/edytować/usunąć recenzję
     - pacjent bez dostępu: 403 na wszystkie 4 trasy

7. **Dokumentacja i kontrakt**
   - Upewnić się, że kontrakt odpowiedzi jest spójny z `src/types/pzk-dto.ts` oraz specyfikacją (200/204/400/401/403/404/409/500).

