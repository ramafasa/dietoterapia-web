## API Endpoint Implementation Plan: GET `/api/pzk/access` (PZK Access Summary)

## 1. Przegląd punktu końcowego

- **Cel**: dostarczyć UI (SSR + React islands) jedno, lekkie źródło prawdy o tym, czy zalogowany pacjent ma **jakikolwiek aktywny dostęp** do PZK oraz **które moduły (1/2/3)** są aktywne.
- **Use-case**: nawigacja/menu gating (np. pozycja “Przestrzeń Zdrowej Kobiety” widoczna tylko, jeśli użytkownik ma dostęp do ≥1 modułu) + wstępne warunkowanie UI.
- **Reguła biznesowa aktywności** (zgodnie ze specyfikacją):
  - aktywny rekord dostępu: `revoked_at IS NULL AND start_at <= now() AND now() < expires_at`

## 2. Szczegóły żądania

- **Metoda HTTP**: `GET`
- **URL**: `/api/pzk/access`
- **Parametry**:
  - **Wymagane**: brak
  - **Opcjonalne**: brak
- **Query string**: brak
- **Request body**: brak (ignorować/nie odczytywać body; endpoint ma być idempotentny i tylko do odczytu).
- **Wymagane nagłówki**:
  - brak specyficznych; autoryzacja oparta o **cookie session** (Lucia) obsługiwana przez middleware `src/middleware/auth.ts` (wypełnia `locals.user`).

## 3. Wykorzystywane typy

### DTO (publiczne kontrakty)

Z `src/types/pzk-dto.ts` (re-eksportowane przez `src/types/index.ts`):
- **`ApiResponse<T>`**: koperta odpowiedzi `{ data, error }`.
- **`ApiError`**: `{ code, message, details? }`.
- **`PzkAccessSummary`**: payload dla `data`.
- **`PzkAccessRecord`**: element listy `access`.
- **`PzkModuleNumber`**: `1 | 2 | 3`.

> Uwaga: repo ma też starszy typ `ApiError` w `src/types.ts` (`{ error, message, statusCode }`). Dla endpointów PZK trzymamy się specyfikacji PZK i typów z `src/types/pzk-dto.ts` (koperta `ApiResponse` + `ApiError{code,message}`), nawet jeśli inne endpointy w repo używają innego formatu.

### Modele DB (wejście do mapowania)

Z `src/db/schema.ts`:
- **`pzkModuleAccess`** (tabela): `userId`, `module`, `startAt`, `expiresAt`, `revokedAt`, `createdAt`, `updatedAt`.
- TypeScript: **`PzkModuleAccess`** (inferSelect).

### Command modele

- **Brak**: endpoint jest read-only, nie wykonuje mutacji.

## 4. Przepływ danych

### 4.1. High-level flow (request → response)

1. **Middleware auth** (`src/middleware/auth.ts`) ustawia:
   - `locals.user` (lub `null`)
   - `locals.session` (lub `null`)
2. Handler `GET /api/pzk/access`:
   - sprawdza uwierzytelnienie (`locals.user`)
   - sprawdza autoryzację roli (`locals.user.role === 'patient'`)
   - pobiera z DB rekordy aktywnego dostępu z `pzk_module_access` (tylko dla `user.id`)
   - mapuje wynik do DTO `PzkAccessSummary`
   - zwraca `ApiResponse<PzkAccessSummary>` z kodem `200`

### 4.2. Warstwa serwisowa i repozytoryjna (rekomendowany podział)

Żeby logika “co znaczy aktywny dostęp” była spójna i re-używalna (UI gating, inne endpointy PZK), wydzielamy:

- **Repozytorium**: `src/lib/repositories/pzkAccessRepository.ts`
  - odpowiedzialność: *jednoznaczna, zoptymalizowana kwerenda DB*
  - przykładowa sygnatura:
    - `listActiveAccessByUserId(userId: string, now: Date): Promise<Array<{ module: 1|2|3; startAt: Date; expiresAt: Date }>>`
- **Serwis**: `src/lib/services/pzkAccessService.ts`
  - odpowiedzialność: *logika biznesowa i mapowanie do DTO*
  - przykładowa sygnatura:
    - `getAccessSummary(userId: string, now?: Date): Promise<PzkAccessSummary>`
  - w serwisie:
    - `now` jako single-source-of-truth do porównań i `serverTime`
    - `activeModules` jako unikalna lista `module` posortowana rosnąco
    - `access` jako lista `PzkAccessRecord` (posortowana np. po `module`, potem `startAt`)

### 4.3. Kwerenda DB (logika aktywności)

- Warunki (Drizzle):
  - `pzkModuleAccess.userId = userId`
  - `pzkModuleAccess.revokedAt IS NULL`
  - `pzkModuleAccess.startAt <= now`
  - `pzkModuleAccess.expiresAt > now`
- Wybór kolumn:
  - `module`, `startAt`, `expiresAt` (pozostałe nie są potrzebne do response)
- Sortowanie:
  - `module ASC`, `startAt ASC` (ułatwia deterministyczne odpowiedzi)

### 4.4. Mapowanie do DTO

- `serverTime`: `now.toISOString()`
- `access`: mapujemy `Date` → ISO string
- `activeModules`: `Array.from(new Set(access.map(a => a.module)))`
- `hasAnyActiveAccess`: `activeModules.length > 0`

## 5. Względy bezpieczeństwa

- **Uwierzytelnienie (401)**:
  - oparte o Lucia session cookie; handler musi wymagać `locals.user != null`.
- **Autoryzacja (403)**:
  - endpoint przeznaczony tylko dla roli `patient` (`locals.user.role !== 'patient'` → 403).
- **Zasada minimalizacji danych**:
  - nie zwracamy `userId`, `id` rekordu dostępu, `createdAt`, `updatedAt`, `revokedAt`.
  - zwracamy wyłącznie `module`, `startAt`, `expiresAt` + computed.
- **CORS / data exfiltration**:
  - nie dodawać szerokich nagłówków CORS; domyślna polityka same-origin chroni przed odczytem przez obce originy.
- **Cache**:
  - odpowiedź zależy od zalogowanego użytkownika → ustawić `Cache-Control: no-store` (jak w innych endpointach z danymi wrażliwymi).
- **Timing / brute-force**:
  - brak wejścia użytkownika i brak identyfikatorów w URL → niskie ryzyko; mimo to 401/403 powinny być szybkie i bez ujawniania szczegółów.

## 6. Obsługa błędów

### 6.1. Format błędu (PZK)

Zgodnie ze specyfikacją PZK endpoint zwraca kopertę:

- `data: null`
- `error: { code: string, message: string, details?: object }`

### 6.2. Scenariusze błędów i kody HTTP

- **401 Unauthorized**: użytkownik niezalogowany (`locals.user === null`)
  - `error.code`: `unauthorized`
  - `error.message`: np. `Authentication required`
- **403 Forbidden**: użytkownik zalogowany, ale rola != `patient`
  - `error.code`: `forbidden`
  - `error.message`: np. `Patient role required`
- **500 Internal Server Error**: błąd nieoczekiwany (DB, runtime)
  - `error.code`: `internal_server_error`
  - `error.message`: np. `Wystąpił nieoczekiwany błąd serwera`

> Specyfikacja wymienia tylko 401/403, ale 500 jest wymagane operacyjnie i spójne z resztą API.

### 6.3. Rejestrowanie błędów (tabela błędów)

- W obecnym schemacie nie ma dedykowanej “tabeli błędów”. Dla tego endpointu:
  - **minimum**: `console.error('[GET /api/pzk/access] Error:', error)` (jak w innych endpointach).
  - **opcjonalnie (best-effort)**: log do `events` (tabela `events`) tylko dla przypadków 500, np. `eventType: 'pzk_access_summary_error'` z `properties: { reason }`.
    - Nie logować PII ani całych exception payloadów; tylko bezpieczne metadane.

## 7. Wydajność

- **Koszt DB**: jedno proste zapytanie po indeksie użytkownika.
  - `pzk_module_access` ma indeks `idx_pzk_module_access_user_expires (user_id, expires_at)` — pomaga filtrować po użytkowniku i dacie wygaśnięcia.
- **Ruch**: endpoint może być odpytywany przy renderze layoutu/headera lub przy starcie aplikacji.
  - Zalecenie: UI powinien cache’ować wynik w pamięci (client) na czas sesji i odświeżać np. po przejściu do PZK.
- **Cache HTTP**: `no-store` (bez cache CDN/przeglądarki) ze względu na dane per-user.
- **Stabilność czasowa**:
  - używać jednego `now` w ramach requestu (do filtracji + `serverTime`) — unikamy niespójności przy granicach `expiresAt`.

## 8. Kroki implementacji

### 8.1. API route

1. Utworzyć plik: `src/pages/api/pzk/access.ts`
2. Dodać:
   - `export const prerender = false`
   - `export const GET: APIRoute = async ({ locals }) => { ... }`
3. Implementacja flow:
   - jeśli `!locals.user` → `401` + `ApiResponse<null>` z błędem PZK
   - jeśli `locals.user.role !== 'patient'` → `403`
   - w przeciwnym razie:
     - `const summary = await pzkAccessService.getAccessSummary(locals.user.id)`
     - `return 200` z `{ data: summary, error: null }`
4. Nagłówki:
   - `Content-Type: application/json`
   - `Cache-Control: no-store`

### 8.2. Repozytorium

1. Utworzyć `src/lib/repositories/pzkAccessRepository.ts`
2. Zaimplementować funkcję, która:
   - przyjmuje `userId`, `now`
   - wykonuje Drizzle select na `pzkModuleAccess`
   - zwraca minimalny zestaw pól (`module`, `startAt`, `expiresAt`)
3. Zastosować deterministyczne sortowanie w DB (`orderBy`).

### 8.3. Serwis

1. Utworzyć `src/lib/services/pzkAccessService.ts`
2. Zaimplementować `getAccessSummary(userId, now = new Date())`:
   - pobrać aktywne rekordy z repo
   - zmapować do `PzkAccessSummary`:
     - `hasAnyActiveAccess`
     - `activeModules`
     - `access`
     - `serverTime`
3. Wymusić typy modułów:
   - podczas mapowania upewnić się, że `module` jest `1 | 2 | 3`
   - jeśli dane w DB są niepoprawne (teoretycznie nie powinny przez CHECK), traktować jako 500 (integrity issue).

### 8.4. Spójność formatowania błędów PZK

1. (Opcjonalnie, ale zalecane) dodać helper w `src/lib/pzk/api.ts` lub podobnym:
   - `ok<T>(data: T): ApiResponse<T>`
   - `fail<T>(code: string, message: string, details?): ApiResponse<T>`
2. (Opcjonalnie) jeśli zespół chce używać istniejących `DomainError` (`src/lib/errors.ts`), dodać osobny mapper do formatu PZK:
   - np. `mapErrorToPzkApiError(error: unknown): { status: number; body: ApiResponse<null> }`
   - na potrzeby tego endpointu wystarczą jednak proste 401/403/500 “inline”.

### 8.5. Testy (rekomendowane)

- **Unit (Vitest)**:
  - `pzkAccessService.getAccessSummary`:
    - brak rekordów → `hasAnyActiveAccess=false`, `activeModules=[]`, `access=[]`
    - rekord aktywny → poprawne ISO + moduł w `activeModules`
    - rekord `revokedAt != null` → ignorowany
    - rekord `startAt > now` → ignorowany
    - rekord `expiresAt <= now` → ignorowany
- **Integration** (z test DB / testcontainers, jeśli używane w projekcie):
  - insert przykładowych `pzk_module_access` i weryfikacja odpowiedzi handlera.

### 8.6. Checklist “Definition of Done”

- Endpoint zwraca **200** z kopertą `{ data, error: null }` i zgodnymi polami `PzkAccessSummary`.
- Dla niezalogowanego: **401** z `{ data: null, error: { code, message } }`.
- Dla roli != patient: **403** z `{ data: null, error: { code, message } }`.
- Nagłówek `Cache-Control: no-store` ustawiony.
- Kwerenda respektuje regułę aktywności (`revokedAt` + `startAt` + `expiresAt`).
- Brak wycieku danych (np. `userId`, `id` rekordu).


