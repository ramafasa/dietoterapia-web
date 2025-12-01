## API Endpoint Implementation Plan: PATCH /api/dietitian/patients/:patientId/status

### 1. Przegląd punktu końcowego

Aktualizacja statusu pacjenta przez dietetyka. Zmiana pola `users.status` na `active | paused | ended` z konsekwentną aktualizacją pól czasowych (`updatedAt`, ewentualnie `endedAt`, `scheduledDeletionAt`) oraz zapis śladu audytowego i zdarzenia analitycznego. Endpoint dostępny wyłącznie dla użytkowników z rolą `dietitian`.

### 2. Szczegóły żądania

- Metoda HTTP: PATCH
- Struktura URL: `/api/dietitian/patients/:patientId/status`
- Parametry:
  - Wymagane (path):
    - `patientId`: UUID v4
  - Opcjonalne: brak parametrów query
- Request Body (JSON):
  - `status` (wymagane): `'active' | 'paused' | 'ended'`
  - `note` (opcjonalne): `string` (≤ 500 znaków); nie jest utrwalana w DB, trafia do audit log jako kontekst operacji
- Nagłówki:
  - `Content-Type: application/json`
  - Sesja Lucia przez cookie (ustawiana przez middleware)

Walidacja:
- Path params: `getPatientDetailsParamsSchema` (`src/schemas/patient.ts`)
- Body: `updatePatientStatusSchema` (`src/utils/validation.ts`)

Autoryzacja:
- Wymagana aktywna sesja (`locals.user`) → 401 jeśli brak
- Rola `dietitian` → 403 jeśli inna rola

### 3. Wykorzystywane typy

- DTO:
  - `UpdatePatientStatusRequest`
  - `UpdatePatientStatusResponse`
  - `ApiError`
- Command Models:
  - `UpdatePatientStatusCommand`
  - `CreateAuditLogCommand`
  - `CreateEventCommand`

Pliki z typami: `src/types.ts`

### 4. Szczegóły odpowiedzi

- Status: 200 OK
- Body:
  - `patient`: `{ id, firstName, lastName, status, updatedAt }`
  - `message`: `string` (komunikat zależny od nowego statusu, np. dla `paused`: „Patient status updated. Reminders will be paused.”)

Przykład (200 OK):
```json
{
  "patient": {
    "id": "patient_uuid",
    "firstName": "Jan",
    "lastName": "Kowalski",
    "status": "paused",
    "updatedAt": "2025-10-30T12:00:00Z"
  },
  "message": "Patient status updated. Reminders will be paused."
}
```

Kody błędów:
- 400: Nieprawidłowe dane wejściowe (path/body) lub błąd logiki
- 401: Brak autoryzacji (brak sesji)
- 403: Brak uprawnień (rola inna niż `dietitian`)
- 404: Pacjent nie istnieje lub nie ma roli `patient`
- 500: Błąd serwera

### 5. Przepływ danych

1) Request trafia do handlera `PATCH` w `src/pages/api/dietitian/patients/[patientId]/status.ts`.  
2) Middleware `auth` (Lucia) ustawia `locals.user`; RBAC na poziomie stron obsługuje redirecty, natomiast endpoint wykonuje własne sprawdzenia uprawnień.  
3) Walidacja:
   - `patientId` przez `getPatientDetailsParamsSchema`
   - body przez `updatePatientStatusSchema`  
4) Wywołanie `patientService.updatePatientStatus(command: UpdatePatientStatusCommand)`:
   - Pobierz obecny stan pacjenta (z `userRepository.findById`) i zweryfikuj `role='patient'`
   - Przygotuj pola do aktualizacji:
     - `status`: z requestu
     - `updatedAt`: `now`
     - `endedAt`: 
       - jeśli `status==='ended'` → `now`
       - jeśli `status!=='ended'` → `null`
     - `scheduledDeletionAt`:
       - jeśli `status==='ended'` → `endedAt + 24 months`
       - jeśli `status!=='ended'` → `null`
   - Wykonaj aktualizację użytkownika (nowa metoda w `userRepository`)
   - Zbuduj `before/after` snapshot do audytu (co najmniej `status`, `endedAt`, `scheduledDeletionAt`; dołącz `note` w `after` jako metadane operacji)
   - `auditLogRepository.create(...)` (best-effort, async)
   - `eventRepository.create({ eventType: 'update_patient_status', properties: { from, to } })` (best-effort, async)
   - Zwróć wybrane pola zaktualizowanego pacjenta do API
5) API formatuje `message` w zależności od `status`:
   - `active`: „Patient status updated. Reminders will resume.”
   - `paused`: „Patient status updated. Reminders will be paused.”
   - `ended`: „Patient status updated. Account scheduled for deletion in 24 months.”  
6) Zwróć `200 OK` z `UpdatePatientStatusResponse`.

Uwaga operacyjna: przypomnienia (CRON) są filtrowane po statusie pacjenta na etapie zapytań — zmiana statusu jest wystarczająca do wstrzymania/wznowienia przypomnień.

### 6. Względy bezpieczeństwa

- Uwierzytelnianie: Lucia v3; korzystamy z `locals.user` ustawionego przez middleware.
- Autoryzacja: twardy check `user.role === 'dietitian'` w handlerze.
- Walidacja wejścia: Zod na path i body; ograniczenia `note` (≤ 500 znaków).
- Ochrona przed HPP/over-posting: ignorujemy nieznane pola w body; przyjmujemy tylko `status`, `note`.
- Odporność na eskalację uprzywilejowania: sprawdzenie, że docelowy użytkownik istnieje i ma `role='patient'`.
- Logi: brak PII w `console.error`; audit log przechowuje minimalne before/after (bez wrażliwych danych niepotrzebnych do celu audytu).
- CSRF: endpoint używany przez SPA/SSR z sesją; w razie potrzeby można dodać CSRF token (post-MVP).

### 7. Obsługa błędów

Mapowanie błędów:
- Walidacja (path/body): 400 z payloadem `ApiError` + `details` (opcjonalne mapowanie z Zod)
- Brak sesji: 401
- Zła rola: 403
- Pacjent nie istnieje / nie `patient`: 404
- Niespodziewane wyjątki: 500

Konwencja `ApiError` (`src/types.ts`):
```json
{
  "error": "validation_error",
  "message": "Nieprawidłowe dane wejściowe",
  "statusCode": 400
}
```

Rejestrowanie błędów:
- `console.error` w handlerze i serwisie (best-effort)
- Brak dedykowanej „tabeli błędów” w MVP; audit log dotyczy udanych zmian danych

### 8. Rozważania dotyczące wydajności

- Operacja dotyczy pojedynczego wiersza w `users`; jedna aktualizacja + dwa asynchroniczne inserty (audit, event).
- Indeksy: istniejący indeks złożony `(role, status)` pomaga w panelu i CRON; ta operacja nie wymaga dodatkowych indeksów.
- Brak konieczności transakcji dla atomowej zmiany jednego rekordu; transakcja opcjonalna, jeśli chcemy ściśle powiązać zmianę i `audit_log` (w MVP: audit best-effort).
- Odpowiedź bez dodatkowych zapytań poza weryfikacją istnienia pacjenta.

### 9. Kroki implementacji

1) Schematy walidacji (re-use):
   - Upewnij się, że korzystamy z:
     - `getPatientDetailsParamsSchema` (`src/schemas/patient.ts`)
     - `updatePatientStatusSchema` (`src/utils/validation.ts`)

2) Repository: `userRepository`
   - Dodaj metodę:
     - `updateStatus(userId: string, input: { status: 'active' | 'paused' | 'ended'; endedAt: Date | null; scheduledDeletionAt: Date | null; updatedAt: Date }): Promise<User>`
   - Implementacja: `UPDATE users SET status=?, ended_at=?, scheduled_deletion_at=?, updated_at=? WHERE id=? AND role='patient' RETURNING *`
   - Zwracaj zaktualizowany rekord lub rzuć błąd, jeśli nie znaleziono (albo zwróć `null` i obsłuż w serwisie).

3) Service: `patientService`
   - Dodaj metodę:
     - `async updatePatientStatus(command: UpdatePatientStatusCommand): Promise<UpdatePatientStatusResponse['patient']>`
   - Kroki:
     - `findById(patientId)` → jeśli brak lub `role !== 'patient'` → `NotFoundError`
     - Wylicz `endedAt`/`scheduledDeletionAt` wg logiki z sekcji „Przepływ danych”
     - Zbuduj `beforeSnapshot` z kluczowych pól (`status`, `endedAt`, `scheduledDeletionAt`)
     - Wywołaj `userRepository.updateStatus(...)`
     - Zbuduj `afterSnapshot` (+ `note` jako kontekst)
     - `auditLogRepository.create({...})` (async, best-effort)
     - `eventRepository.create({ eventType: 'update_patient_status', properties: { from, to } })` (async)
     - Zwróć DTO wymagane przez `UpdatePatientStatusResponse['patient']`

4) API Route:
   - Plik: `src/pages/api/dietitian/patients/[patientId]/status.ts`
   - Eksport: `export const PATCH: APIRoute = async ({ params, request, locals }) => { ... }`
   - Flow:
     - Pobierz `locals.user`; jeśli brak → 401
     - Rola `dietitian`; jeśli nie → 403
     - Walidacja `params.patientId` przez `getPatientDetailsParamsSchema`
     - `await request.json()` + walidacja `updatePatientStatusSchema`
     - Złóż `UpdatePatientStatusCommand` i wywołaj `patientService.updatePatientStatus`
     - Na podstawie nowego statusu przygotuj `message`:
       - `active`: „Patient status updated. Reminders will resume.”
       - `paused`: „Patient status updated. Reminders will be paused.”
       - `ended`: „Patient status updated. Account scheduled for deletion in 24 months.”
     - `return new Response(JSON.stringify({ patient, message }), { status: 200, headers })`
   - Obsługa błędów:
     - Błędy Zod → `400` z `details`
     - Domain: `NotFoundError` → 404 (przez `mapErrorToApiError`)
     - Inne → 500

5) Testy/manualna weryfikacja:
   - Scenariusze:
     - 401: bez sesji
     - 403: sesja pacjenta
     - 404: nieistniejący `patientId` lub user z rolą ≠ `patient`
     - 400: nieprawidłowy `patientId`/`status`/zbyt długa `note`
     - 200: zmiana na `paused`, `active`, `ended` (sprawdź `endedAt`/`scheduledDeletionAt`)
   - Sprawdź wpis w `audit_log` i event `update_patient_status` (best-effort).

6) Komunikacja z CRON/push:
   - Brak integracji wymaganej na tym etapie — CRONy filtrują po `users.status`.

### 10. Artefakty do edycji/dodania (lista zmian w repo)

- `src/lib/repositories/userRepository.ts`:
  - [NEW] `updateStatus(...)`
- `src/lib/services/patientService.ts`:
  - [NEW] `updatePatientStatus(command: UpdatePatientStatusCommand)`
- `src/pages/api/dietitian/patients/[patientId]/status.ts`:
  - [NEW] Handler `PATCH` z walidacją, autoryzacją, mapowaniem błędów i odpowiedzią 200
- Re-use:
  - `src/schemas/patient.ts` → `getPatientDetailsParamsSchema`
  - `src/utils/validation.ts` → `updatePatientStatusSchema`
  - `src/lib/errors.ts` → `mapErrorToApiError`, `NotFoundError`
  - `src/lib/repositories/auditLogRepository.ts`, `src/lib/repositories/eventRepository.ts`

### 11. Przykładowe komunikaty `message`

- `active`: „Patient status updated. Reminders will resume.”
- `paused`: „Patient status updated. Reminders will be paused.”
- `ended`: „Patient status updated. Account scheduled for deletion in 24 months.”


