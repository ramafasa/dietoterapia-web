## API Endpoint Implementation Plan: GET /api/dietitian/patients

### 1. Przegląd punktu końcowego

Endpoint zwraca listę pacjentów zarządzanych przez dietetyka wraz z informacjami operacyjnymi: datą ostatniego wpisu wagi oraz wskaźnikiem spełnienia tygodniowego obowiązku dodania wagi. Przeznaczony wyłącznie dla użytkowników z rolą `dietitian`. Paginacja oparta o `limit` i `offset`, filtrowanie po `status` pacjenta.


### 2. Szczegóły żądania

- **Metoda HTTP**: GET
- **Struktura URL**: `/api/dietitian/patients`
- **Parametry zapytania (query):**
  - **Wymagane**: brak
  - **Opcjonalne**:
    - `status`: `"active" | "paused" | "ended" | "all"` (domyślnie: `"active"`)
    - `limit`: liczba wyników (domyślnie: `50`, maks.: `100`)
    - `offset`: przesunięcie dla paginacji (domyślnie: `0`)
- **Nagłówki**:
  - `Cookie`: sesja Lucia (ustawiana przez middleware)


### 3. Wykorzystywane typy

- DTOs (z `src/types.ts`):
  - `PatientListItemDTO`: pojedynczy pacjent na liście
  - `OffsetPagination`: metadane paginacji offsetowej
  - `GetPatientsResponse`: struktura odpowiedzi endpointu
- Modele poleceń (Command Models): brak wymaganych dla odczytu listy


### 4. Szczegóły odpowiedzi

- **Statusy sukcesu**:
  - `200 OK`: lista pacjentów pobrana pomyślnie
- **Struktura (200)**: `GetPatientsResponse`
  - `patients: PatientListItemDTO[]`
    - `id` (UUID)
    - `firstName | lastName | email | age | gender | status`
    - `createdAt` (Date → serializowane do ISO)
    - `lastWeightEntry` (Date | null → ISO)
    - `weeklyObligationMet` (boolean)
  - `pagination: OffsetPagination`
    - `total, limit, offset, hasMore`

- **Błędy**:
  - `401 Unauthorized`: brak sesji
  - `403 Forbidden`: rola inna niż `dietitian`
  - `400 Bad Request`: nieprawidłowe parametry zapytania (walidacja)
  - `500 Internal Server Error`: błąd serwera


### 5. Przepływ danych

1. Middleware Lucia ustawia `locals.user` (id, email, role).
2. Handler GET:
   - Sprawdza obecność `locals.user`; w przeciwnym razie 401.
   - Sprawdza `locals.user.role === 'dietitian'`; w przeciwnym razie 403.
   - Parsuje i waliduje parametry (`status`, `limit`, `offset`) przez Zod.
3. Service Layer (nowy `patientService` lub `dietitianService`):
   - Deleguje do Repository po listę pacjentów z filtrem `status`, posortowaną:
     - rekomendacja: najpierw po `lastWeightEntry` DESC (nulls last), następnie po `createdAt` DESC.
   - Oblicza `weeklyObligationMet` na podstawie wpisów wagi w bieżącym tygodniu (strefa: Europe/Warsaw).
4. Repository Layer (nowy `patientRepository`):
   - Zapytanie bazowe: użytkownicy o roli `patient` + filtr `status` (chyba że `all`).
   - Paginacja: `limit`, `offset` oraz osobne `COUNT(*)` dla `total`.
   - Pola dodatkowe:
     - `lastWeightEntry`: `LEFT JOIN LATERAL` lub podzapytanie z indeksem `idx_weight_entries_user_date`
       - `SELECT measurement_date FROM weight_entries WHERE user_id = users.id ORDER BY measurement_date DESC LIMIT 1`
     - `weeklyObligationMet`: `EXISTS` wpis z zakresu bieżącego tygodnia w Europe/Warsaw
       - `EXISTS (SELECT 1 FROM weight_entries WHERE user_id = users.id AND measurement_date AT TIME ZONE 'Europe/Warsaw' >= startOfWeek AND < nextWeekStart)`
   - Zwraca rekordy użytkowników wraz z polami wyliczonymi.
5. Handler formatuje dane do `GetPatientsResponse` i zwraca JSON (Cache-Control: `no-store`).
6. Best-effort analytics (opcjonalnie): `eventRepository.create({ userId: dietitianId, eventType: 'view_patients_list' })`.


### 6. Względy bezpieczeństwa

- Uwierzytelnianie: Lucia v3; wymagane aktywne `session`.
- Autoryzacja (RBAC): tylko `role === 'dietitian'`.
- Brak IDOR (lista bez identyfikatora kontekstowego); wszelkie szczegóły pacjenta w osobnym endpoincie także z weryfikacją roli.
- Walidacja wejścia (Zod) z limitami (`limit` ≤ 100, `offset` ≥ 0, `status` w dozwolonym zbiorze).
- Brak wrażliwych danych (hashy haseł itp.) w odpowiedzi.
- Nagłówki odpowiedzi: `Content-Type: application/json`, `Cache-Control: no-store`.
- Rate limiting: poza MVP (zgodnie z tech stack), można dodać post-MVP.


### 7. Obsługa błędów

- `401 Unauthorized`: brak `locals.user` (brak sesji) → zwróć `ApiError`.
- `403 Forbidden`: `locals.user.role !== 'dietitian'` → `ApiError`.
- `400 Bad Request`: naruszenie schematu Zod (np. `limit > 100`, niedozwolony `status`).
- `500 Internal Server Error`: nieoczekiwane błędy DB/serwera.
- Rejestrowanie błędów:
  - `console.error` w handlerze oraz repozytoriach (jak w istniejących plikach).
  - (Opcjonalnie) `eventRepository.create({ userId: dietitianId, eventType: 'error_api', properties: { endpoint: 'GET /api/dietitian/patients', errorCode, details } })` — best‑effort, nie blokuje odpowiedzi.
  - Audit log nie jest wymagany dla odczytu; pozostaje dla mutacji.


### 8. Rozważania dotyczące wydajności

- Indeksy:
  - Już istnieje `idx_weight_entries_user_date (user_id, measurement_date DESC)` — wspiera `lastWeightEntry` i `EXISTS` z warunkiem zakresu.
  - Rekomendowane (opcjonalna migracja post-MVP, jeśli potrzebne): indeksy na `users(role)`, `users(status)`, albo łączony `(role, status)` dla częstych filtrów.
- Strategia pobierania:
  - `LEFT JOIN LATERAL` do wyznaczania ostatniego wpisu per użytkownik skaluje się dobrze dla stron do 100 rekordów dzięki istniejącemu indeksowi.
  - `EXISTS` dla tygodniowej zgodności wykorzystuje ten sam indeks oraz okno czasowe (startOfWeek → nextWeekStart).
- Paginacja offsetowa: `COUNT(*)` po przefiltrowanym zbiorze; `hasMore = offset + results.length < total`.
- Brak cache po stronie serwera (dane dynamiczne). Możliwy cache klienta krótkoterminowy (Etag) post‑MVP.


### 9. Kroki implementacji

1. Schemat Zod dla query
   - Plik: `src/schemas/patient.ts` (nowy) lub `src/schemas/dietitian.ts`
   - `getPatientsQuerySchema`:
     ```ts
     import { z } from 'zod'

     export const getPatientsQuerySchema = z.object({
       status: z.enum(['active', 'paused', 'ended', 'all']).default('active'),
       limit: z.coerce.number().int().min(1).max(100).default(50),
       offset: z.coerce.number().int().min(0).default(0),
     })
     ```

2. Repository: `patientRepository`
   - Plik: `src/lib/repositories/patientRepository.ts` (nowy)
   - Metody:
     - `countPatients({ status }): Promise<number>`
     - `findPatients({ status, limit, offset }): Promise<Array<{ user fields, lastWeightEntry: Date | null, weeklyObligationMet: boolean }>>`
   - Szkic zapytania (Drizzle + SQL helpers):
     ```ts
     // Pseudokod z użyciem sql`...` dla części TZ/tygodnia
     const startOfWeekSql = sql`DATE_TRUNC('week', NOW() AT TIME ZONE 'Europe/Warsaw')`
     const nextWeekSql = sql`(DATE_TRUNC('week', NOW() AT TIME ZONE 'Europe/Warsaw') + interval '1 week')`

     // lastWeightEntry (LATERAL)
     // EXISTS dla weeklyObligationMet w zakresie [startOfWeek, nextWeek)
     ```

3. Service: `patientService` (lub `dietitianService`)
   - Plik: `src/lib/services/patientService.ts` (nowy)
   - Metoda:
     - `getPatientsList({ status, limit, offset }): Promise<GetPatientsResponse>`
   - Odpowiada za mapowanie wyników repo → `PatientListItemDTO` oraz budowę `pagination`.
   - (Opcjonalnie) Best-effort event tracking `view_patients_list`.

4. Endpoint API
   - Plik: `src/pages/api/dietitian/patients.ts` (nowy)
   - Wzorzec zgodny ze stylem `invitations.ts`:
     - `export const prerender = false`
     - `export const GET: APIRoute = async ({ request, locals }) => { ... }`
     - Sprawdzanie `locals.user` i roli `dietitian` → odpowiednio 401/403.
     - Parsowanie query z `new URL(request.url).searchParams` → walidacja Zod → 400 przy błędach.
     - Wywołanie `patientService.getPatientsList(...)`.
     - Zwrócenie `200` z `GetPatientsResponse` i nagłówkami (`application/json`, `no-store`).

5. Testy ręczne (wg. `.ai-10xdevs/api-plan.md` i stylu istniejących test-guides)
   - Scenariusze:
     - Brak sesji → 401
     - Rola `patient` → 403
     - Domyślne parametry (bez query) → 200, `status=active`, `limit=50`, `offset=0`
     - `status=all`, `limit=10`, `offset=10` → poprawna paginacja
     - Granice: `limit=101` → 400; `offset=-1` → 400
     - Poprawność `lastWeightEntry` i `weeklyObligationMet` dla pacjentów z/bez wpisów; strefa `Europe/Warsaw`

6. (Opcjonalnie, jeśli metryki wykażą potrzebę) Migracja indeksów
   - Dodaj indeksy `users(role)`, `users(status)` lub łączony `(role, status)`.
   - Drizzle migration: `drizzle/0003_add_user_role_status_indexes.sql`.


### 10. Mapowanie kodów statusu

- `200 OK` — pomyślny odczyt listy pacjentów
- `400 Bad Request` — wadliwe parametry zapytania (np. limit > 100, zły status)
- `401 Unauthorized` — brak sesji
- `403 Forbidden` — użytkownik nie jest dietetykiem
- `500 Internal Server Error` — błąd wewnętrzny


### 11. Uwagi implementacyjne (TZ/tydzień)

- Tydzień liczony przez Postgres `DATE_TRUNC('week', ...)` opiera się na standardzie ISO (start poniedziałek).
- Wszystkie warunki zakresu czasu operują w `Europe/Warsaw`:
  - `measurement_date AT TIME ZONE 'Europe/Warsaw' >= startOfWeek`
  - `measurement_date AT TIME ZONE 'Europe/Warsaw' < nextWeekStart`
- Serializacja dat do ISO w odpowiedzi JSON po stronie Node/Edge — zachowaj spójność z innymi endpointami.


### 12. Przykładowe fragmenty (szkice)

```ts
// src/pages/api/dietitian/patients.ts
import type { APIRoute } from 'astro'
import { getPatientsQuerySchema } from '../../../schemas/patient'
import type { ApiError, GetPatientsResponse } from '../../../types'
import { patientService } from '../../../lib/services/patientService'

export const prerender = false

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const user = locals.user
    if (!user) {
      const err: ApiError = { error: 'unauthorized', message: 'Zaloguj się.', statusCode: 401 }
      return new Response(JSON.stringify(err), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }
    if (user.role !== 'dietitian') {
      const err: ApiError = { error: 'forbidden', message: 'Tylko dla dietetyków.', statusCode: 403 }
      return new Response(JSON.stringify(err), { status: 403, headers: { 'Content-Type': 'application/json' } })
    }

    const url = new URL(request.url)
    const query = getPatientsQuerySchema.parse({
      status: url.searchParams.get('status') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      offset: url.searchParams.get('offset') ?? undefined,
    })

    const result: GetPatientsResponse = await patientService.getPatientsList(query)

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  } catch (error: any) {
    if (error?.errors && Array.isArray(error.errors)) {
      const err: ApiError = { error: 'validation_error', message: 'Nieprawidłowe parametry.', statusCode: 400 }
      return new Response(JSON.stringify({ ...err, details: error.errors }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    console.error('[GET /api/dietitian/patients] Error:', error)
    const err: ApiError = { error: 'internal_server_error', message: 'Błąd serwera.', statusCode: 500 }
    return new Response(JSON.stringify(err), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
```

```sql
-- Weekly window (Europe/Warsaw) helper (konceptualnie w SQL):
SELECT DATE_TRUNC('week', NOW() AT TIME ZONE 'Europe/Warsaw')       AS week_start,
       DATE_TRUNC('week', NOW() AT TIME ZONE 'Europe/Warsaw') + interval '1 week' AS next_week_start;

-- lastWeightEntry per user (koncept LATERAL):
SELECT u.*,
       w_last.measurement_date AS last_weight_entry,
       EXISTS (
         SELECT 1 FROM weight_entries we
         WHERE we.user_id = u.id
           AND (we.measurement_date AT TIME ZONE 'Europe/Warsaw') >= DATE_TRUNC('week', NOW() AT TIME ZONE 'Europe/Warsaw')
           AND (we.measurement_date AT TIME ZONE 'Europe/Warsaw') <  DATE_TRUNC('week', NOW() AT TIME ZONE 'Europe/Warsaw') + interval '1 week'
       ) AS weekly_obligation_met
FROM users u
LEFT JOIN LATERAL (
  SELECT measurement_date
  FROM weight_entries we
  WHERE we.user_id = u.id
  ORDER BY we.measurement_date DESC
  LIMIT 1
) w_last ON TRUE
WHERE u.role = 'patient' AND (u.status = $1 OR $1 = 'all')
ORDER BY w_last.measurement_date DESC NULLS LAST, u.created_at DESC
LIMIT $2 OFFSET $3;
```


### 13. Gotowe do implementacji

Plan jest zgodny ze stackiem (Astro SSR, Drizzle ORM, Lucia v3) oraz stylem istniejących endpointów (`invitations.ts`). Uwzględnia walidację, RBAC, strefę czasową, wydajność i standardowe kody statusu API.


