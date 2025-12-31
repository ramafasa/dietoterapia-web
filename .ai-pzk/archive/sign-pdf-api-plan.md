### API Endpoint Implementation Plan: POST `/api/pzk/materials/:materialId/pdfs/:pdfId/presign`

## 1. Przegląd punktu końcowego

Celem endpointu jest **wygenerowanie presigned URL (GET) do pobrania konkretnego PDF** przypiętego do materiału PZK. URL ma być generowany **„na klik”** z **TTL = 60s**, tylko dla użytkownika spełniającego warunki autoryzacji. Dodatkowo wymagane jest **best-effort logowanie operacyjne** do tabeli `events`.

- **Metoda HTTP**: `POST`
- **Ścieżka**: `/api/pzk/materials/:materialId/pdfs/:pdfId/presign`
- **Charakter**: business action (tworzy podpisany URL), dlatego wymaga **ostrzejszego rate limitu** niż endpointy read-only.
- **Kontrakt odpowiedzi**: `ApiResponse<T>` (koperta `{ data, error }`) zgodnie z `src/types/pzk-dto.ts` oraz istniejącymi endpointami PZK (`/api/pzk/access`, `/api/pzk/catalog`).

## 2. Szczegóły żądania

- **Path params (wymagane)**:
  - **`materialId`**: `uuid`
  - **`pdfId`**: `uuid`

- **Request body (opcjonalne)**:
  - **`ttlSeconds?: number`**
    - rekomendacja MVP: **wspieraj tylko `ttlSeconds === 60`** (lub całkowicie ignoruj override i zawsze ustawiaj 60).
    - jeśli body jest podane, ale `ttlSeconds` jest nieprawidłowe → **400**.

- **Nagłówki istotne operacyjnie**:
  - **`x-forwarded-for` / `x-real-ip`**: do rate limitu per-IP (Vercel/proxy).

## 3. Szczegóły odpowiedzi

### 3.1. Sukces (200)

Zwróć `ApiResponse<PzkPresignResponse>`:

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

- **`expiresAt`**: ISO 8601, wyliczane jako `now + ttlSeconds`.
- **`url`**: presigned GET URL do storage (S3/R2).

### 3.2. Błędy (kody i semantyka)

Zwracaj w kopercie PZK: `{ data: null, error: { code, message, details? } }`.

- **401 Unauthorized**:
  - użytkownik niezalogowany (`locals.user` brak)
- **403 Forbidden**:
  - brak aktywnego dostępu do modułu materiału
  - materiał ma status `publish_soon` (materiał nie jest „actionable”)
- **404 Not Found**:
  - materiał nie istnieje **lub** ma status `draft`/`archived` (bez wycieku metadanych)
  - PDF nie istnieje **w ramach danego materiału**
- **429 Too Many Requests**:
  - rate limit zadziałał (per-user i per-IP)
- **500 Internal Server Error**:
  - błąd generowania presign / błąd integracji storage; bez wrażliwych szczegółów

## 4. Wykorzystywane typy (DTO/Command)

### 4.1. DTO (istniejące)

- **`ApiResponse<T>`**, **`ApiError`**: `src/types/pzk-dto.ts`
- **`PzkPresignRequest`**: `src/types/pzk-dto.ts`
- **`PzkPresignResponse`**: `src/types/pzk-dto.ts`

### 4.2. DB entities (istniejące, Drizzle)

Z `src/db/schema.ts`:
- **`pzkMaterials`**
- **`pzkMaterialPdfs`**
- **`pzkModuleAccess`**
- (logi) **`events`** (repo: `src/lib/repositories/eventRepository.ts`)

### 4.3. Command modele

Do logowania zdarzeń:
- **`CreateEventCommand`**: `src/types.ts` (używany przez `eventRepository.create(...)`).

Rekomendacja (opcjonalnie) dla czytelności serwisu:
- **`PzkPresignPdfCommand`** (nowy, wewnętrzny):
  - `userId: string`
  - `materialId: string`
  - `pdfId: string`
  - `ttlSeconds: number`
  - `ip?: string`

## 5. Przepływ danych

### 5.1. Warstwa routingu (Astro API route)

Utwórz plik:
- `src/pages/api/pzk/materials/[materialId]/pdfs/[pdfId]/presign.ts`

Zasady zgodne z `astro.mdc`:
- **`export const prerender = false`**
- handler **`export const POST: APIRoute = ...`**
- walidacja wejścia przez **Zod**
- logikę biznesową przenieś do **`src/lib/services`**

### 5.2. Proponowana orkiestracja (kolejność kroków)

1. **AuthN**: sprawdź `locals.user`, w przeciwnym razie **401**.
2. **AuthZ roli**: `locals.user.role === 'patient'`, w przeciwnym razie **403**.
3. **Rate limit**:
   - zidentyfikuj IP (`x-forwarded-for` / `x-real-ip`)
   - sprawdź limit per-user i per-IP
   - jeśli przekroczony → **429**, opcjonalnie `Retry-After` + `details.retryAfterSeconds`
4. **Walidacja wejścia**:
   - `materialId` i `pdfId` jako `uuid`
   - `ttlSeconds` jako `int` i (MVP) tylko `60`
   - jeśli błąd → **400**
5. **Business logic (service)**:
   - pobierz materiał (bez wycieku: tylko statusy `published` i `publish_soon`)
   - jeśli brak / draft / archived → **404**
   - jeśli `publish_soon` → **403**
   - sprawdź aktywny dostęp do `material.module` → jeśli brak → **403**
   - pobierz PDF **po `(materialId, pdfId)`** → jeśli brak → **404**
   - wygeneruj presigned URL → jeśli błąd → **500**
6. **Logowanie `events` (best-effort)**:
   - sukces: `pzk_pdf_presign_success`
   - forbidden: `pzk_pdf_presign_forbidden`
   - error (w tym 404 / storage): `pzk_pdf_presign_error`
7. **Zwróć odpowiedź**:
   - 200 + `ok({ url, expiresAt, ttlSeconds })`
   - nagłówki: `Content-Type: application/json`, `Cache-Control: no-store`

## 6. Wyodrębnienie logiki do serwisów i repozytoriów

### 6.1. Serwis (nowy)

Dodaj serwis np.:
- `src/lib/services/pzkPdfPresignService.ts` (lub `pzkDownloadService.ts` jeśli planujesz więcej akcji download)

**Odpowiedzialności serwisu**:
- spójna implementacja reguł statusów materiału (`published`/`publish_soon`/`draft`/`archived`)
- weryfikacja dostępu modułowego (przez `PzkAccessRepository`)
- pobranie PDF i presign (bez ujawniania `object_key`)
- generacja metadanych odpowiedzi (`expiresAt`)
- best-effort logowanie eventów przez `eventRepository`

### 6.2. Repozytoria (nowe / istniejące)

- **Istniejące**:
  - `PzkAccessRepository` (`listActiveAccessByUserId(userId, now)`)

- **Nowe (rekomendowane)**:
  - `PzkMaterialRepository`
    - `findForPresign(materialId): { id, module, status } | null`
    - implementacja: select z `pzkMaterials` po `id` i `status IN ('published','publish_soon')`
  - `PzkMaterialPdfRepository`
    - `findByMaterialIdAndPdfId(materialId, pdfId): { id, objectKey, fileName, contentType } | null`
    - implementacja: select z `pzkMaterialPdfs` z warunkiem `material_id = :materialId AND id = :pdfId`

Uwaga: kluczowe jest **łączenie po `materialId` + `pdfId`** aby uniknąć IDOR i „przepinania” PDF między materiałami.

## 7. Walidacja danych wejściowych

### 7.1. Path params

Zod schema (w warstwie route):
- `materialId`: `z.string().uuid()`
- `pdfId`: `z.string().uuid()`

### 7.2. Body

Zod schema:
- body opcjonalne (brak body = domyślnie TTL=60)
- `ttlSeconds`:
  - `z.number().int().optional()`
  - reguła MVP: `ttlSeconds === 60` (jeśli przekazane)

### 7.3. Walidacja domenowa (w serwisie)

- materiał musi mieć **status `published`** (dla presign)
- `publish_soon` → forbidden (nieactionable)
- użytkownik musi mieć **aktywny dostęp do modułu materiału** w `pzk_module_access`:
  - `revoked_at IS NULL`
  - `start_at <= now`
  - `now < expires_at`

## 8. Rejestrowanie zdarzeń i błędów (observability)

### 8.1. Tabela `events` (best-effort)

Użyj `eventRepository.create(...)` z:
- **`userId`**: `locals.user.id` (lub `null` tylko jeśli endpoint kiedyś stanie się publiczny; obecnie nie)
- **`eventType`**:
  - `pzk_pdf_presign_success`
  - `pzk_pdf_presign_forbidden`
  - `pzk_pdf_presign_error`
- **`properties`** (JSONB):
  - `materialId`, `pdfId`, `module`, `ttlSeconds`
  - `reason`: `no_access | material_not_found | pdf_not_found | invalid_state | storage_error`
  - opcjonalnie: `storageProvider`: `r2 | s3`
  - opcjonalnie (do debug): `ip` (rozważ anonimizację / skrót, jeśli traktujesz jako dane osobowe)

### 8.2. „Tabela błędów”

W obecnym stacku **nie ma dedykowanej tabeli błędów**. Zgodnie ze specyfikacją endpointu rolę „operational logging” pełni `events`. Dodatkowo:
- loguj serwerowe wyjątki przez `console.error(...)` (Vercel logs),
- **nie dołączaj** do odpowiedzi szczegółów błędów storage (stack trace, endpoint, bucket, object_key).

## 9. Względy bezpieczeństwa

- **Brak wycieku `object_key`**:
  - `object_key` jest prywatny i nigdy nie może trafić do klienta.
- **IDOR / enumeracja**:
  - zawsze pobieraj PDF warunkiem `(materialId, pdfId)` aby nie dało się odpytać PDF z innego materiału.
- **„No metadata leak” dla `draft/archived`**:
  - w przypadku `draft`/`archived` zwracaj **404** jakby zasób nie istniał.
- **`publish_soon`**:
  - presign jest biznesowo „akcją” → zwracaj **403** (nieactionable).
- **TTL i eskalacja**:
  - nie pozwól klientowi wygenerować długiego TTL; MVP: tylko 60 sekund.
- **CORS**:
  - jeśli presigned URL jest pobierany z przeglądarki, bucket musi mieć odpowiedni CORS (GET).
- **Content-Disposition**:
  - ustaw w presign `ResponseContentDisposition` na `attachment; filename="..."` (sanityzuj nazwę pliku).
- **Rate limit**:
  - endpoint generuje podpisane URL → musi być chroniony przed spamem/DoS i „farmieniem” URL.

## 10. Obsługa błędów (scenariusze → statusy)

- **401**:
  - `locals.user` brak
  - response: `ErrorResponses.UNAUTHORIZED` (lub `fail('unauthorized', ...)`), `Cache-Control: no-store`

- **403**:
  - rola != `patient`
  - brak aktywnego dostępu do modułu
  - status materiału `publish_soon`
  - response: `fail('forbidden', '...', { reason: 'no_access' | 'invalid_state' })`
  - log event: `pzk_pdf_presign_forbidden`

- **404**:
  - materiał nie istnieje **lub** ma status `draft/archived`
  - pdf nie istnieje dla tego materiału
  - response: `fail('not_found', 'Zasób nie został znaleziony')` (bez wskazywania czy to materiał czy pdf)
  - log event: `pzk_pdf_presign_error` z `reason: material_not_found | pdf_not_found`

- **429**:
  - rate limit triggered
  - response: `fail('rate_limited', 'Za dużo prób. Spróbuj ponownie później.', { retryAfterSeconds })`
  - nagłówek: `Retry-After: <seconds>` (rekomendowane)

- **500**:
  - błąd generowania presign / błąd storage client
  - response: `ErrorResponses.INTERNAL_SERVER_ERROR`
  - log event: `pzk_pdf_presign_error` z `reason: storage_error`

## 11. Wydajność

- **Zapytania DB**: docelowo 2–3 krótkie zapytania:
  - materiał (id+status+module)
  - dostęp do modułu (czy aktywny)
  - pdf po (materialId, pdfId)
- **Brak N+1**: endpoint dotyczy jednego PDF, więc zawsze pracuje na pojedynczych rekordach.
- **Cache-Control**: zawsze `no-store` (user-specific i security).
- **Presign**: TTL 60 sekund minimalizuje ryzyko i koszty „krążenia linków”.

## 12. Rate limiting (zalecany wariant MVP i docelowy)

### 12.1. MVP (best-effort, szybkie wdrożenie)

- Dodaj `src/lib/rate-limit-pzk.ts` oparte o `Map` (jak `rate-limit-public.ts`), klucze:
  - `user:${userId}`
  - `ip:${ip}`
  - `userIp:${userId}:${ip}`
- Okno np. **1 minuta**:
  - limit per-user: np. 10/min
  - limit per-IP: np. 30/min
  - limit per user+ip: np. 10/min

Uwaga: w serverless/edge **pamięć jest nietrwała**, więc to jest „good enough” tylko jako MVP.

### 12.2. Docelowo (trwałe)

- przenieś rate limit do:
  - Redis (np. Upstash) albo
  - Postgres (tabela rate limit + TTL/cleanup) jeśli nie chcesz zewnętrznej zależności.

## 13. Integracja storage (S3/R2) – założenia implementacyjne

### 13.1. Zależności

Dodaj (jeśli nie ma):
- `@aws-sdk/client-s3`
- `@aws-sdk/s3-request-presigner`

### 13.2. Konfiguracja ENV (S3-compatible)

Zalecane zmienne:
- `OBJECT_STORAGE_BUCKET`
- `OBJECT_STORAGE_ACCESS_KEY_ID`
- `OBJECT_STORAGE_SECRET_ACCESS_KEY`
- `OBJECT_STORAGE_REGION` (AWS) / `auto` (dla R2; zależnie od klienta)
- `OBJECT_STORAGE_ENDPOINT` (wymagane dla R2 i innych S3-compatible)
- `OBJECT_STORAGE_FORCE_PATH_STYLE` (opcjonalne, gdy wymagane przez provider)
- `OBJECT_STORAGE_PROVIDER` = `r2 | s3` (do logów)

### 13.3. Parametry presign

Presign GET dla obiektu:
- `Bucket = OBJECT_STORAGE_BUCKET`
- `Key = object_key` z `pzk_material_pdfs.object_key`
- `Expires = ttlSeconds` (60)
- `ResponseContentDisposition`:
  - `attachment; filename="<safeName>.pdf"`
- `ResponseContentType`:
  - jeśli `content_type` w DB jest ustawione, użyj go; inaczej `application/pdf`

## 14. Kroki implementacji (checklista dla zespołu)

1. **Utwórz route** `src/pages/api/pzk/materials/[materialId]/pdfs/[pdfId]/presign.ts`:
   - `prerender = false`
   - `POST` handler
   - `Cache-Control: no-store`
2. **Walidacja wejścia** w route:
   - Zod: UUID dla `materialId`, `pdfId`
   - Zod: body opcjonalne; `ttlSeconds` tylko 60 (MVP)
3. **Rate limiting**:
   - dodaj helper `rate-limit-pzk.ts` (MVP) lub od razu trwały wariant
   - zwracaj 429 w kopercie PZK + `Retry-After`
4. **Dodaj serwis** `PzkPdfPresignService`:
   - wstrzyknij `db` i korzystaj z repozytoriów
5. **Dodaj repozytoria**:
   - `PzkMaterialRepository` (minimum pól pod presign)
   - `PzkMaterialPdfRepository` (pobranie objectKey + metadata po `(materialId,pdfId)`)
6. **Autoryzacja domenowa** w serwisie:
   - status materiału + moduł + aktywny dostęp
7. **Integracja storage**:
   - przygotuj klienta S3 (z `endpoint` dla R2)
   - generuj presigned URL i `expiresAt`
8. **Logowanie `events`**:
   - `success/forbidden/error` zgodnie ze specyfikacją
   - logowanie nie może blokować odpowiedzi (best-effort)
9. **Obsługa błędów**:
   - mapuj scenariusze do 401/403/404/429/500
   - bez ujawniania szczegółów storage
10. **Testy (zalecane)**:
   - unit test serwisu: statusy materiału (published/publish_soon/draft/archived), brak dostępu, brak pdf
   - test integracyjny endpointu: 401/403/404/429/200; mock presign (np. stub klienta S3)


