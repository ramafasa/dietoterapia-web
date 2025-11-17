## API Endpoint Implementation Plan: GET /api/dietitian/patients/:patientId

### 1. Przegląd punktu końcowego

Endpoint dla dietetyka zwracający szczegóły pacjenta oraz zagregowane statystyki jego wpisów wagi. Przeznaczony do widoku szczegółowego w panelu dietetyka. Wymaga aktywnej sesji (Lucia) i roli `dietitian`.

### 2. Szczegóły żądania

- Metoda HTTP: GET
- Struktura URL: `/api/dietitian/patients/:patientId`
- Parametry:
  - Wymagane (path):
    - `patientId` (UUID v4)
  - Opcjonalne: brak
- Request Body: brak

Walidacja wejścia:
- `patientId` walidowany jako UUID (Zod).

Autoryzacja:
- Sprawdzenie `locals.user` (middleware Lucia) i roli `dietitian`.

### 3. Wykorzystywane typy

- DTO:
  - `GetPatientDetailsResponse` (z `src/types.ts`)
  - `PatientStatistics` (z `src/types.ts`)
  - `ApiError` (z `src/types.ts`)
- Modele domenowe:
  - `User`, `WeightEntry` (z `src/db/schema.ts`)
- Błędy domenowe (mapowanie do HTTP, `src/lib/errors.ts`):
  - `AuthorizationError` → 403
  - `NotFoundError` → 404
  - (Walidacja path param) → 400
- Command Models (opcjonalnie, analytics):
  - `CreateEventCommand` (event: `view_patient_details`)

### 4. Szczegóły odpowiedzi

- 200 OK
  - `Content-Type: application/json`
  - `Cache-Control: no-store`
  - Body: `GetPatientDetailsResponse`
    - `patient`: `Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'age' | 'gender' | 'status' | 'createdAt' | 'updatedAt'>`
    - `statistics`: `PatientStatistics`
      - `totalEntries: number`
      - `weeklyComplianceRate: number` (0..1)
      - `currentStreak: number` (tygodnie)
      - `longestStreak: number` (tygodnie)
      - `lastEntry: Date | null`

Kody błędów:
- 400 Bad Request — nieprawidłowy `patientId` (nie-UUID).
- 401 Unauthorized — brak sesji.
- 403 Forbidden — użytkownik nie ma roli `dietitian`.
- 404 Not Found — pacjent nie istnieje lub nie jest rolą `patient`.
- 500 Internal Server Error — błąd serwera/DB.

### 5. Przepływ danych

1) API Handler (`GET /api/dietitian/patients/:patientId`):
   - Odczyt `locals.user`; jeśli brak → 401.
   - Weryfikacja roli `dietitian`; jeśli nie → 403.
   - Walidacja `params.patientId` (Zod UUID); jeśli nie → 400.
   - Wywołanie `patientService.getPatientDetails(patientId, requesterId)`.
   - Zwrócenie 200 z `GetPatientDetailsResponse` + nagłówki.

2) Service (`src/lib/services/patientService.ts`):
   - `getPatientDetails(patientId: string, dietitianId?: string)`:
     - `userRepository.findById(patientId)` → jeśli brak lub `role !== 'patient'` → 404.
     - `weightEntryRepository` — agregacje:
       - `totalEntries`: `COUNT(*) WHERE user_id = :patientId`
       - `lastEntry`: `MAX(measurement_date) WHERE user_id = :patientId`
       - Tygodniowe wejścia (ostatnie N tygodni, np. 12 lub 52):
         - `SELECT date_trunc('week', measurement_date AT TIME ZONE 'Europe/Warsaw') AS week_start, COUNT(*) FROM weight_entries WHERE user_id = :patientId GROUP BY week_start ORDER BY week_start DESC`
       - Na podstawie listy tygodni:
         - `weeklyComplianceRate = weeksWithEntry / totalWeeksConsidered`
         - `currentStreak`: liczba kolejnych tygodni od bieżącego tygodnia (lub poprzedniego, jeśli bieżący pusty) z >=1 wpisem
         - `longestStreak`: maksimum kolejnych tygodni z >=1 wpisem
     - Złożenie DTO: `GetPatientDetailsResponse`.
     - Best-effort analytics: `eventRepository.create({ userId: dietitianId, eventType: 'view_patient_details', properties: { patientId } })` (bez blokowania odpowiedzi).

3) Repositories:
   - `userRepository.findById(id)` — odczyt użytkownika.
   - `weightEntryRepository` — dodać metody pomocnicze/statystyczne (patrz Kroki implementacji) lub użyć istniejących poprzez własne zapytania w Service.

### 6. Względy bezpieczeństwa

- Uwierzytelnianie: Lucia v3 (middleware `auth.ts`) — `locals.user` i `locals.session`.
- Autoryzacja: sprawdzenie `user.role === 'dietitian'` w handlerze.
- IDOR:
  - Aktualny schemat nie wiąże pacjenta z konkretnym dietetykiem; każdy dietetyk mógłby odczytać dowolnego pacjenta znając `patientId`.
  - Mitigacja w MVP: ograniczenie dostępu rolą `dietitian` + nieujawnianie `patientId` poza kontekstem listy.
  - Rekomendacja post-MVP: dodać relację `patients.dietitian_id` lub tabelę powiązań i sprawdzać własność w service.
- Walidacja danych wejściowych: Zod dla UUID; odrzucenie błędnych identyfikatorów kodem 400.
- PII: Zwracamy minimalny profil pacjenta i metryki; brak wrażliwych danych zdrowotnych poza zagregowanymi statystykami liczbowymi.
- Brak cache'owania odpowiedzi: `Cache-Control: no-store`.

### 7. Obsługa błędów

- Walidacja UUID (Zod) → 400 Bad Request z `ApiError { error: 'validation_error', ... }`.
- Brak sesji (`locals.user` null) → 401 Unauthorized.
- Brak uprawnień (rola != `dietitian`) → 403 Forbidden.
- Nie znaleziono pacjenta lub rola != `patient` → 404 Not Found (`NotFoundError`).
- Błędy DB/nieoczekiwane → 500 Internal Server Error.
- Logowanie błędów: `console.error` w handlerze i repository; mapowanie przez istniejący mechanizm (`mapErrorToApiError`) lub ręczne jak w `GET /api/dietitian/patients`.

### 8. Rozważania dotyczące wydajności

- Indeksy:
  - `weight_entries`: istniejący `idx_weight_entries_user_date (user_id, measurement_date desc)` — wykorzystać w MAX/COUNT i grupowaniu po tygodniach.
  - `users`: `idx_users_role_status` — nie wpływa bezpośrednio na ten endpoint (po ID), ale jest ok.
- Zapytania agregujące:
  - Łączyć proste agregaty w jednym zapytaniu jeśli wygodne (np. `COUNT(*)`, `MAX()`).
  - Tygodnie: pobrać listę tygodni z wpisami (distinct week_start) i policzyć streaks w kodzie (mniej skomplikowane niż SQL gaps-and-islands).
  - Ograniczyć okno do ostatnich 52 tygodni (wystarczające do statystyk i szybkie).
- Brak N+1: wszystkie metryki liczone jednym/dwoma zapytaniami, nie per-wpis.
- Brak cache (dane dynamiczne, mała objętość).

### 9. Etapy wdrożenia

1) Schemat walidacji parametru:
   - W pliku `src/schemas/patient.ts` dodać:
     - `getPatientDetailsParamsSchema = z.object({ patientId: z.string().uuid() })`
     - Eksport typu.

2) Metody repository (jeśli nie chcemy pisać SQL w service):
   - W `weightEntryRepository` dodać:
     - `countByUser(userId: string): Promise<number>`
     - `getLastEntryDate(userId: string): Promise<Date | null>` (MAX)
     - `getWeeklyPresence(userId: string, weeksWindow = 52): Promise<Date[]>`
       - Zwraca listę poniedziałków (week_start) z >=1 wpisem w danym oknie.
       - Implementacja: `SELECT date_trunc('week', measurement_date AT TIME ZONE 'Europe/Warsaw') AS week_start ... GROUP BY 1 ORDER BY 1 DESC LIMIT :weeksWindow`
   - Alternatywnie: zaimplementować te zapytania bezpośrednio w service (szybciej na MVP).

3) Service:
   - W `src/lib/services/patientService.ts` dodać:
     - `async getPatientDetails(patientId: string, dietitianId?: string): Promise<GetPatientDetailsResponse>`
       - Pobiera pacjenta; 404 jeśli brak lub `role !== 'patient'`.
       - Liczy metryki (agregacje z repo).
       - Oblicza `weeklyComplianceRate`, `currentStreak`, `longestStreak`:
         - `weeklyComplianceRate = presentWeeks / consideredWeeks` (np. ostatnie 12 tygodni; `consideredWeeks >= 1`).
         - `currentStreak`: licz tygodnie wstecz od bieżącego tygodnia z obecnością.
         - `longestStreak`: przejście po posortowanej liście `week_start`, zliczanie sekwencji bez przerwy.
       - Składa `GetPatientDetailsResponse`.
       - Best-effort: `eventRepository.create({ userId: dietitianId, eventType: 'view_patient_details', properties: { patientId } })` (bez `await`).

4) API Route:
   - Utworzyć plik `src/pages/api/dietitian/patients/[patientId].ts`
   - Wzorzec jak w `src/pages/api/dietitian/patients.ts`:
     - `export const prerender = false`
     - `export const GET: APIRoute = async ({ params, locals }) => { ... }`
     - Sprawdzenia: 401/403.
     - Walidacja `params.patientId` (Zod) → 400 gdy nieprawidłowy.
     - Wywołanie `patientService.getPatientDetails(patientId, locals.user.id)`.
     - Zwrócenie 200 OK + `no-store`.
     - Obsługa błędów:
       - Zod → 400 z `details` (spójnie z listą pacjentów).
       - Domenowe (`NotFoundError`, `AuthorizationError`) → przez `mapErrorToApiError`.
       - Pozostałe → 500.

5) Testy (manualne przykłady):
   - 200: `curl -H "Cookie: auth_session=..." https://localhost:4321/api/dietitian/patients/<uuid>`
   - 400: `patientId=not-a-uuid`
   - 401: brak cookie sesji.
   - 403: zalogowany pacjent.
   - 404: `patientId` nieistniejący lub wskazuje użytkownika o roli innej niż `patient`.

6) Dokumentacja:
   - Upewnić się, że struktura odpowiedzi odpowiada `GetPatientDetailsResponse` w `src/types.ts`.
   - Dodać adnotację w `.ai-10xdevs/api-plan.md` (link do implementacji).

7) Uwagi przyszłe (post-MVP):
   - Wprowadzić relację przypisania pacjenta do dietetyka i autoryzację własności w service.
   - Ewentualne przeniesienie obliczeń streaków do SQL (CTE, gaps-and-islands) jeśli będzie to potrzebne wydajnościowo.

### 10. Przykładowe odpowiedzi

- 200 OK:
```json
{
  "patient": {
    "id": "patient_uuid",
    "firstName": "Jan",
    "lastName": "Kowalski",
    "email": "patient@example.com",
    "age": 35,
    "gender": "male",
    "status": "active",
    "createdAt": "2025-09-01T10:00:00Z",
    "updatedAt": "2025-10-30T12:00:00Z"
  },
  "statistics": {
    "totalEntries": 45,
    "weeklyComplianceRate": 0.85,
    "currentStreak": 12,
    "longestStreak": 28,
    "lastEntry": "2025-10-30T08:00:00+02:00"
  }
}
```

- 400 Bad Request:
```json
{
  "error": "validation_error",
  "message": "Nieprawidłowe parametry zapytania",
  "statusCode": 400,
  "details": [
    { "field": "patientId", "message": "Invalid uuid" }
  ]
}
```

- 401 Unauthorized:
```json
{
  "error": "unauthorized",
  "message": "Musisz być zalogowany, aby zobaczyć szczegóły pacjenta",
  "statusCode": 401
}
```

- 403 Forbidden:
```json
{
  "error": "forbidden",
  "message": "Tylko dietetycy mogą przeglądać szczegóły pacjentów",
  "statusCode": 403
}
```

- 404 Not Found:
```json
{
  "error": "resource_not_found",
  "message": "Pacjent nie został znaleziony",
  "statusCode": 404
}
```

- 500 Internal Server Error:
```json
{
  "error": "internal_server_error",
  "message": "Wystąpił nieoczekiwany błąd serwera",
  "statusCode": 500
}
```


