## API Endpoint Implementation Plan: POST /api/weight/:id/confirm

### 1. Przegląd punktu końcowego

Endpoint umożliwia potwierdzenie lub odrzucenie anomalii (outlier) dla konkretnego wpisu wagi. Służy do ustawienia pola `outlierConfirmed` dla wpisu, który ma `isOutlier = true`. Dostępny dla zalogowanego pacjenta (tylko dla własnych wpisów) oraz dietetyka (dla pacjentów, z którymi ma relację/rolę zgodną z RBAC).

Cele:
- Oznaczenie podejrzanego wpisu jako potwierdzony bądź odrzucony.
- Zachowanie pełnego audytu operacji (audit log + event tracking).
- Bezpieczna autoryzacja i spójność danych.


### 2. Szczegóły żądania

- Metoda HTTP: POST
- Struktura URL: `/api/weight/:id/confirm`
- Parametry:
  - Wymagane (path): `id` (UUID wpisu wagi)
  - Opcjonalne: brak
- Request Body (JSON):
  - Wymagane:
    - `confirmed: boolean`

Walidacja wejścia:
- `id` musi być poprawnym UUID
- body musi zawierać `confirmed: boolean`

Autoryzacja:
- Wymagana sesja (Lucia v3)
- RBAC:
  - Pacjent: może potwierdzać wyłącznie własne wpisy (`entry.userId === session.user.id`)
  - Dietetyk: może potwierdzać wpisy pacjentów zgodnie z polityką w `middleware/rbac.ts` (np. rola `dietitian`)


### 3. Wykorzystywane typy

- DTO (z `src/types.ts`):
  - `ConfirmOutlierRequest`:
    - `{ confirmed: boolean }`
  - `ConfirmOutlierResponse`:
    - `{ entry: Pick<WeightEntry, 'id' | 'userId' | 'weight' | 'measurementDate' | 'source' | 'isBackfill' | 'isOutlier' | 'outlierConfirmed' | 'note' | 'createdAt' | 'updatedAt'> }`

- Modele Command (istniejące/nowe):
  - Nowy (zalecany dla czytelności): `ConfirmOutlierCommand`:
    - `{ id: string; confirmed: boolean; updatedBy: string }`
  - Alternatywa: rozszerzyć repo o dedykowaną metodę aktualizacji bez wprowadzania nowego Command; nie używać `UpdateWeightEntryCommand`, bo nie zawiera `outlierConfirmed`


### 4. Szczegóły odpowiedzi

Sukces (200 OK):
```
{
  "entry": {
    "id": "uuid",
    "userId": "patient_uuid",
    "weight": 78.8,
    "measurementDate": "2025-10-30T08:00:00.000Z",
    "source": "patient",
    "isBackfill": false,
    "isOutlier": true,
    "outlierConfirmed": true,
    "note": null,
    "createdAt": "2025-10-30T12:00:00.000Z",
    "updatedAt": "2025-10-30T12:05:00.000Z"
  }
}
```

Kody statusu:
- 200 OK – wpis zaktualizowany lub idempotentny (już ustawione na tę samą wartość)
- 400 Bad Request – niepoprawne dane wejściowe, wpis nie jest oznaczony jako outlier
- 401 Unauthorized – brak sesji
- 403 Forbidden – brak uprawnień do modyfikacji tego wpisu
- 404 Not Found – wpis nie istnieje lub niewidoczny dla użytkownika
- 500 Internal Server Error – błąd serwera/DB


### 5. Przepływ danych

1) Klient wywołuje `POST /api/weight/:id/confirm` z body `{ confirmed: boolean }`.
2) Endpoint:
   - Parsuje param `id` (UUID) i waliduje body (`confirmed` jako boolean) przez Zod.
   - Weryfikuje sesję (Lucia v3) i pobiera `session.user.id` i `role`.
3) Serwis `weightEntryService.confirmOutlier(...)`:
   - Pobiera wpis przez repo: `weightEntryRepository.findById(id)`.
   - Sprawdza istnienie i widoczność wpisu dla użytkownika (owner lub dietetyk wg RBAC).
   - Sprawdza `entry.isOutlier === true`. Jeśli nie – zwraca 400.
   - Jeśli `entry.outlierConfirmed` już równe żądanej wartości – zwraca aktualny stan (idempotencja).
   - W transakcji:
     - Aktualizuje `outlierConfirmed`, `updatedAt`, `updatedBy` (repo: `updateOutlierConfirmation`).
     - Zapisuje audit log (`auditLogRepository.create` – action: `update`, table: `weight_entries`, recordId: entry.id, before/after).
     - Zapisuje event (`eventRepository.create`) z `eventType: 'confirm_outlier'`, properties: `{ confirmed, source: entry.source }`.
   - Zwraca świeżo odczytany DTO z repo (lub wynik aktualizacji uzupełniony o pola DTO).
4) Endpoint formatuje odpowiedź wg `ConfirmOutlierResponse` i odsyła `200 OK`.


### 6. Względy bezpieczeństwa

- Autentykacja: Lucia v3 – wymagane aktywne `session` na żądaniu (SSR/endpointy Astro).
- Autoryzacja (RBAC):
  - Pacjent: tylko własne wpisy.
  - Dietetyk: tylko pacjenci, do których ma uprawnienia (zależnie od implementacji w `middleware/rbac.ts`).
  - Ochrona przed IDOR: sprawdzenie `entry.userId` vs `session.user.id` (pacjent) lub relacji (dietetyk).
- Walidacja wejścia (Zod): twarde sprawdzanie `id` i `confirmed`.
- Brak mass assignment: repo aktualizuje wyłącznie `outlierConfirmed`, `updatedAt`, `updatedBy`.
- Poufność błędów: komunikaty dla klienta bez szczegółów wewnętrznych; szczegóły do logów serwera.


### 7. Obsługa błędów

- 400:
  - Niepoprawny UUID `id`.
  - Brak pola `confirmed` lub nie-boolean.
  - Wpis nie ma `isOutlier = true`.
  - Format odpowiedzi błędu wg `ApiError` (`error`, `message`, `statusCode`).
- 401:
  - Brak sesji (cookie session nieprawidłowe/przedawnione).
- 403:
  - Użytkownik nie ma uprawnień do danego wpisu.
- 404:
  - Brak wpisu o danym `id` lub niedostępny dla użytkownika.
- 500:
  - Wyjątki bazy danych/transakcji, inne nieoczekiwane błędy.

Logowanie błędów:
- `console.error` z kontekstem: path, userId, entryId, errorName.
- (Opcjonalnie) Wydarzenie w `events` o `eventType: 'error'` z `properties: { path: '/api/weight/:id/confirm', reason }` – jeśli zgodne z polityką zbierania błędów.


### 8. Rozważania dotyczące wydajności

- Pojedynczy wpis i update – operacja O(1), bez ryzyka N+1.
- Indeks po `id` w tabeli `weight_entries` zakładany przez PK – szybki odczyt/aktualizacja.
- Transakcja obejmująca update + wpis do audit/events – krótka i lokalna; minimalne ryzyko blokad.
- Ograniczyć payload odpowiedzi do pól wymaganych przez `ConfirmOutlierResponse`.


### 9. Kroki implementacji

1) Schemat walidacji (Zod)
   - Dodać do `src/schemas/weight.ts` (lub inline w handlerze) schemat:
     ```ts
     import { z } from 'zod'

     export const ConfirmOutlierSchema = z.object({
       confirmed: z.boolean()
     })
     ```
   - Walidacja `id` jako UUID (np. `z.string().uuid()` albo util).

2) Repozytorium `weightEntryRepository` (pliki: `src/lib/repositories/weightEntryRepository.ts`)
   - Zapewnić metody:
     - `findById(id: string)` – zwraca pełny wpis (łącznie z `isOutlier`, `outlierConfirmed`, `userId`, ...).
     - `updateOutlierConfirmation(id: string, confirmed: boolean, updatedBy: string)` – update tylko pól: `outlierConfirmed`, `updatedAt`, `updatedBy`.
   - Zwraca rekord po aktualizacji.

3) Serwis `weightEntryService` (pliki: `src/lib/services/weightEntryService.ts`)
   - Dodać metodę:
     ```ts
     async function confirmOutlier(params: { 
       id: string; 
       confirmed: boolean; 
       sessionUserId: string; 
       sessionUserRole: 'patient' | 'dietitian' | string;
     }): Promise<ConfirmOutlierResponse['entry']>
     ```
   - Kroki w metodzie:
     - Odczyt wpisu przez repo.
     - 404, jeśli nie istnieje.
     - Autoryzacja:
       - Jeśli `role === 'patient'`: `entry.userId` musi być równe `sessionUserId`.
       - Jeśli `role === 'dietitian'`: zweryfikować wg `middleware/rbac.ts` (np. helper `canAccessPatientEntry(sessionUserId, entry.userId)`).
       - W innym wypadku: 403.
     - Jeśli `entry.isOutlier !== true`: 400.
     - Idempotencja: jeśli `entry.outlierConfirmed === confirmed` → zwróć bieżący stan (200).
     - Transakcja:
       - `updateOutlierConfirmation(...)` w repo.
       - `auditLogRepository.create({...})` – action: `update`, table: `weight_entries`, recordId: entry.id, before/after.
       - `eventRepository.create({ userId: sessionUserId, eventType: 'confirm_outlier', properties: { confirmed, source: entry.source } })`.
     - Zwróć ustandaryzowane DTO (zgodnie z `ConfirmOutlierResponse.entry`).

4) Endpoint API (plik: `src/pages/api/weight/[id]/confirm.ts`)
   - Handler `POST`:
     - Pobierz sesję (Lucia) przez `lib/auth.ts`/middleware.
     - Parsuj `id` z parametrów.
     - Parsuj i waliduj body przez `ConfirmOutlierSchema`.
     - Wywołaj `weightEntryService.confirmOutlier(...)`.
     - Zwróć `200 OK` z `{ entry }`.
   - Błędy mapować na kody statusów (400/401/403/404/500) z JSON wg `ApiError`.

5) Audit i Events
   - Upewnić się, że istnieją repozytoria:
     - `src/lib/repositories/auditLogRepository.ts`
     - `src/lib/repositories/eventRepository.ts`
   - Jeśli brak – dodać minimalistyczne implementacje zgodne z istniejącymi wzorcami Drizzle.

6) Testy i weryfikacja (manual/E2E – opcjonalnie na MVP)
   - Scenariusze:
     - Pacjent potwierdza własny wpis (200).
     - Pacjent próbuje potwierdzić cudzy wpis (403).
     - Dietetyk potwierdza wpis pacjenta (200, przy poprawnej relacji).
     - Wpis nieistniejący (404).
     - Wpis nie jest outlier (400).
     - Idempotencja (potwierdzony → potwierdzony) (200).
     - Brak sesji (401).

7) Deployment
   - Standardowy flow Vercel; brak dodatkowych env dla tego endpointu.
   - Obserwacja logów w celu weryfikacji błędów po wdrożeniu.


### 10. Mapowanie błędów na odpowiedzi (przykładowe)

- Walidacja Zod (body/id): `400 Bad Request`
  ```json
  { "error": "BadRequest", "message": "Invalid request payload", "statusCode": 400 }
  ```
- Brak sesji: `401 Unauthorized`
  ```json
  { "error": "Unauthorized", "message": "Authentication required", "statusCode": 401 }
  ```
- Brak uprawnień: `403 Forbidden`
  ```json
  { "error": "Forbidden", "message": "You are not allowed to confirm this entry", "statusCode": 403 }
  ```
- Nie znaleziono: `404 Not Found`
  ```json
  { "error": "NotFound", "message": "Weight entry not found", "statusCode": 404 }
  ```
- Nie jest outlier: `400 Bad Request`
  ```json
  { "error": "BadRequest", "message": "Entry is not marked as outlier", "statusCode": 400 }
  ```
- Błąd serwera: `500 Internal Server Error`
  ```json
  { "error": "InternalServerError", "message": "Unexpected server error", "statusCode": 500 }
  ```


### 11. Uwagi implementacyjne (Astro + SSR + Drizzle + Lucia)

- Routing plikowy Astro: dynamiczny segment `[id]` w `src/pages/api/weight/[id]/confirm.ts`.
- SSR już włączony (`output: 'server'`), endpointy mają dostęp do cookies/sesji.
- Sesje przez Lucia v3 – użyć istniejących helperów w `lib/auth.ts`/`middleware/auth.ts`.
- Drizzle ORM – repozytoria operują na tabeli `weight_entries`; transakcje przez `db.transaction`.
- Brak rate limiting w MVP – rozważyć post-MVP.
- Logika biznesowa w serwisie (`weightEntryService`) – endpoint pozostaje cienki.


### 12. Zmiany w kodzie – checklist

- [ ] `src/schemas/weight.ts`: dodać `ConfirmOutlierSchema` (lub inline w handlerze)
- [ ] `src/lib/repositories/weightEntryRepository.ts`: dodać `findById`, `updateOutlierConfirmation`
- [ ] `src/lib/services/weightEntryService.ts`: dodać metodę `confirmOutlier`
- [ ] `src/lib/repositories/auditLogRepository.ts`: upewnić się, że istnieje i wspiera `create`
- [ ] `src/lib/repositories/eventRepository.ts`: upewnić się, że istnieje i wspiera `create`
- [ ] `src/pages/api/weight/[id]/confirm.ts`: dodać handler `POST`
- [ ] Testy manualne scenariuszy błędów i sukcesu


