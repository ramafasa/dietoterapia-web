## API Endpoint Implementation Plan: GET /api/dietitian/patients/:patientId/weight

### 1. Przegląd punktu końcowego

Endpoint dla dietetyka do pobrania historii pomiarów wagi wybranego pacjenta z możliwością:
- filtrowania wg widoku: today | week | range,
- filtrowania po zakresie dat (ISO, timezone: Europe/Warsaw),
- stronicowania metodą keyset (cursor-based) po `measurementDate DESC`,
- zwrócenia metainformacji o pacjencie oraz statusu wywiązania się z obowiązku tygodniowego.

Zwraca strukturę zgodną z `GetPatientWeightEntriesResponse` z `src/types.ts`.


### 2. Szczegóły żądania

- Metoda HTTP: GET
- Struktura URL: `/api/dietitian/patients/:patientId/weight`
- Parametry:
  - Wymagane (path):
    - `patientId` (UUID v4): identyfikator pacjenta
  - Opcjonalne (query):
    - `view`: "today" | "week" | "range" (domyślnie: "week")
    - `startDate`: ISO date (YYYY-MM-DD), wymagane gdy `view=range`
    - `endDate`: ISO date (YYYY-MM-DD), wymagane gdy `view=range`
    - `limit`: 1..100 (domyślnie 30)
    - `cursor`: ISO 8601 timestamp; klucz do keyset pagination (measurementDate)
- Request Body: brak

Walidacja:
- `patientId`: Zod `uuid()` (patrz: `getPatientDetailsParamsSchema` w `src/schemas/patient.ts`).
- Query:
  - Dodamy nową Zod–schemę `getPatientWeightQuerySchema` (opis w Kroki implementacji), która:
    - waliduje `view` ∈ {"today","week","range"},
    - wymusza `startDate` i `endDate` jeśli `view=range`,
    - waliduje format dat (`YYYY-MM-DD`) i cursor (ISO timestamp),
    - konwertuje/ogranicza `limit` do 1..100.


### 3. Wykorzystywane typy

- DTO (z `src/types.ts`):
  - `PatientSummaryDTO` (id, firstName, lastName, status)
  - `WeightEntryDTO`
  - `CursorPagination`
  - `GetPatientWeightEntriesResponse`
- Modele komend: brak nowych (odczyt).


### 4. Szczegóły odpowiedzi

- Status: 200 OK
- Nagłówki: `Content-Type: application/json`, `Cache-Control: no-store`
- Body (zgodnie z `GetPatientWeightEntriesResponse`):

```json
{
  "patient": {
    "id": "patient_uuid",
    "firstName": "Jan",
    "lastName": "Kowalski",
    "status": "active"
  },
  "entries": [
    {
      "id": "uuid",
      "userId": "patient_uuid",
      "weight": 75.5,
      "measurementDate": "2025-10-30T08:00:00.000Z",
      "source": "patient",
      "isBackfill": false,
      "isOutlier": false,
      "outlierConfirmed": false,
      "note": "Morning weight",
      "createdAt": "2025-10-30T12:00:00.000Z",
      "updatedAt": "2025-10-30T12:00:00.000Z"
    }
  ],
  "weeklyObligationMet": true,
  "pagination": {
    "hasMore": false,
    "nextCursor": null
  }
}
```

Kody statusu błędów:
- 400 Bad Request — nieprawidłowa kombinacja parametrów (np. `view=range` bez dat), limit poza zakresem, `startDate > endDate`.
- 401 Unauthorized — brak sesji.
- 403 Forbidden — użytkownik nie jest dietetykiem.
- 404 Not Found — pacjent nie istnieje.
- 422 Unprocessable Entity — nieprawidłowy format daty/cursora (wg konwencji istniejących endpointów).
- 500 Internal Server Error — błąd serwera.


### 5. Przepływ danych

1) Authn: Pobierz sesję z `locals.user` (Lucia middleware). Jeśli brak — 401.
2) Authz: Sprawdź `user.role === 'dietitian'`. Jeśli nie — 403.
3) Walidacja:
   - `patientId` przez `getPatientDetailsParamsSchema`,
   - query przez nową `getPatientWeightQuerySchema`.
4) Normalizacja widoku → zakres dat (Europe/Warsaw):
   - `today`: `[dzisiaj 00:00, jutro 00:00)`,
   - `week`: ostatnie 7 dni (rolling window) LUB bieżący tydzień ISO — wybieramy rolling 7 dni dla spójności z historią pacjenta; (uwaga w sekcji Względy — można łatwo przełączyć na tydzień ISO)
   - `range`: `[startDate 00:00, endDate 23:59:59.999]` w Warsaw TZ (implementacja repo już obsługuje granice przez SQL `AT TIME ZONE`).
5) Odczyt pacjenta (summary):
   - Pobierz `id, firstName, lastName, status` z tabeli `users` (rola pacjent).
   - Jeśli brak — 404.
6) Odczyt wpisów z repozytorium:
   - `weightEntryRepository.findByUserWithFilters({ userId: patientId, startDate, endDate, limit, cursor })` (zwraca `limit+1` rekordów).
   - Konwersja na `WeightEntryDTO` (weight string→number).
   - `hasMore = results.length > limit`; `nextCursor = last(measurementDate)`, jeśli `hasMore`.
7) Obliczenie `weeklyObligationMet`:
   - Bieżący tydzień w Europe/Warsaw: `DATE_TRUNC('week', now() AT TIME ZONE 'Europe/Warsaw')` do `+1 week` (exclusive).
   - SQL EXISTS na `weight_entries` pacjenta w ww. oknie (analogicznie do `patientRepository.findPatients`).
8) Złożenie `GetPatientWeightEntriesResponse` i zwrot 200.
9) Analytics (opcjonalne, best-effort):
   - `eventRepository.create({ userId: dietitianId, eventType: 'view_patient_weight_history', properties: { patientId, view, limit, hasMore } })` — nie wpływa na wynik.


### 6. Względy bezpieczeństwa

- RBAC: Dostęp tylko dla `role='dietitian'` (401/403 zgodnie z auth).
- IDOR: Odczyt dotyczy pacjenta wskazanego w ścieżce. Na MVP zakładamy, że dietetyk ma dostęp do swoich pacjentów; w przyszłości dodać weryfikację relacji dietetyk–pacjent (owner/assignment check) przed zwrotem danych.
- Walidacja wejścia: ścisła Zod walidacja `uuid`, dat i zakresów, limitu, cursora.
- SQL Injection: użycie Drizzle ORM oraz parametryzowanych wyrażeń `sql``...``.
- Dane wrażliwe: `Cache-Control: no-store`, brak logowania payloadów z PII w errorach.
- CORS: endpoint używany przez tę samą aplikację; nie wymaga dodatkowych nagłówków.
- DoS: limit 100 wpisów i keyset pagination ograniczają koszt zapytania. (Opcjonalnie: rate limiting post-MVP).


### 7. Obsługa błędów

Mapowanie (spójne z istniejącymi handlerami w `src/pages/api/weight.ts` i `src/pages/api/dietitian/patients.ts`):
- Brak sesji → 401 z `ApiError { error: 'unauthorized' }`.
- Rola ≠ dietitian → 403 z `ApiError { error: 'forbidden' }`.
- `patientId` nieprawidłowe → 400/422 (prefer 400 gdy ścieżka; jednak użyjemy 400 jeżeli nie przejdzie `uuid()` z path).
- Zod błędy query:
  - Błędy formatu dat/cursora → 422 `unprocessable_entity`,
  - Błędy logiki (np. `startDate > endDate`, brak dat przy `range`) → 400 `bad_request`.
- Pacjent nie istnieje → 404 `not_found`.
- Inne błędy → 500 `internal_server_error`.

Logowanie:
- `console.error` w bloku `catch` (jak w istniejących endpointach).
- Brak tabeli błędów w MVP — audyt nie dotyczy odczytu, analytics event opcjonalny (best-effort).


### 8. Rozważania dotyczące wydajności

- Keyset pagination po `measurement_date DESC` (już zaimplementowane w repo).
- Indeksy: wymagany indeks złożony na `weight_entries(user_id, measurement_date DESC)` — sprawdzić w schemacie/migracjach (dodać jeśli brak).
- Unikać `COUNT(*)` — nie jest potrzebny (używamy `limit+1`).
- Ogranicz `limit` do 100; walidacja po stronie API.
- SQL warunki dat działają w `AT TIME ZONE 'Europe/Warsaw'` — bez dodatkowych transformacji po stronie aplikacji.


### 9. Kroki implementacji

1) Schematy walidacji (Zod):
   - Plik: `src/schemas/patient.ts` lub nowy plik `src/schemas/dietitian.ts`
   - Dodać:
     - `export const getPatientWeightParamsSchema = z.object({ patientId: z.string().uuid() })`
     - `export const getPatientWeightQuerySchema = z.object({`
       - `view: z.enum(['today','week','range']).default('week'),`
       - `startDate: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional(),`
       - `endDate: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional(),`
       - `limit: z.coerce.number().int().min(1).max(100).default(30),`
       - `cursor: z.string().optional().refine(isISODateOrEmpty, 'cursor musi być w formacie ISO 8601'),`
     - `}).refine( requiresDatesWhenRange, { message: 'startDate i endDate są wymagane dla view=range' } )`
       i dodatkowe `.refine(start <= end)` dla `range`.

2) Service Layer:
   - Plik: `src/lib/services/weightEntryService.ts`
   - Dodać metodę:
     - `listEntriesForDietitian(params: { patientId: string, startDate?: string, endDate?: string, limit?: number, cursor?: string }): Promise<GetPatientWeightEntriesResponse>`
       - Pobiera patient summary (z tabeli `users` — preferencja: dodać helper do `patientRepository`, np. `getPatientSummary(patientId)` zwracający `PatientSummaryDTO | null`).
       - Wywołuje `weightEntryRepository.findByUserWithFilters(...)`.
       - Oblicza `hasMore/nextCursor`, mapuje do `WeightEntryDTO` (konwersja wagi string→number).
       - Oblicza `weeklyObligationMet` poprzez EXISTS w oknie tygodnia Warsaw TZ (można dodać helper w `weightEntryRepository` lub wykonać krótkie zapytanie w service; zachować spójność z `patientRepository.findPatients`).
       - Zwraca `GetPatientWeightEntriesResponse`.

3) Normalizacja widoku → zakres dat:
   - W handlerze API, po walidacji query, przekształć `view` na `(startDate,endDate)`:
     - `today`: `startDate = YYYY-MM-DD (dzisiaj)`, `endDate = ten sam dzień`
     - `week`: przedział „ostatnie 7 dni” (rolling window): `startDate = today - 6 dni`
     - `range`: użyj z query
   - Uwaga: repo interpretuje `startDate` jako `>= startDate::date` i `endDate` jako `< endDate + 1 day` (exclusive) w Warsaw TZ — nie zmieniaj.

4) API Handler:
   - Plik: `src/pages/api/dietitian/patients/[patientId]/weight.ts` (nowy)
   - Wzorzec implementacyjny jak w `src/pages/api/weight.ts` i `src/pages/api/dietitian/patients.ts`:
     - `export const prerender = false`
     - Authn (401), Authz (403),
     - Walidacja `patientId` (path) i query (Zod),
     - Normalizacja widoku → `(startDate,endDate)`,
     - Wywołanie `weightEntryService.listEntriesForDietitian(...)`,
     - Zwrot 200 z `GetPatientWeightEntriesResponse` i nagłówkami JSON + `no-store`,
     - Obsługa błędów: 400/401/403/404/422/500 (spójnie z istniejącymi).

5) Repository (opcjonalnie):
   - `patientRepository`: dodać `getPatientSummary(patientId): Promise<PatientSummaryDTO | null>`.
   - `weightEntryRepository`: jeśli brak indeksu — dopisać migrację z indeksem `(user_id, measurement_date DESC)`.

6) Analytics (opcjonalnie, best-effort):
   - W handlerze po sukcesie, asynchronicznie:
     - `eventRepository.create({ userId: dietitianId, eventType: 'view_patient_weight_history', properties: { patientId, view, limit, hasMore } })`

7) Testy (smoke / integracyjne):
   - 401 bez sesji,
   - 403 rola ≠ dietitian,
   - 404 nieistniejący `patientId`,
   - 400 `view=range` bez dat, `startDate > endDate`, `limit > 100`,
   - 422 błędny format daty/cursora,
   - 200 dla `today`, `week` i `range` (z `hasMore`/`nextCursor`),
   - Sprawdzenie konwersji `weight` (string→number), oraz `weeklyObligationMet`.


### 10. Przykładowe mapowania błędów (handler)

- Zod (format daty/cursor): 422
- Zod (logika zapytania): 400
- Brak sesji: 401
- Rola ≠ dietitian: 403
- Pacjent nie istnieje: 404
- Inne: 500


### 11. Uwagi implementacyjne (TZ i DTO)

- TZ: Repo już stosuje `AT TIME ZONE 'Europe/Warsaw'` dla zakresów; handler przekazuje tylko granice dni (`YYYY-MM-DD`).
- Konwersja typów: `weight` (decimal string) → `number` dla API (`WeightEntryDTO`).
- DTO: Używamy dokładnie pól z `types.ts` (`GetPatientWeightEntriesResponse`).

