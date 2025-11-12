## API Endpoint Implementation Plan: PATCH /api/weight/:id

## 1. Przegląd punktu końcowego

Edycja istniejącego wpisu wagi przez pacjenta w ograniczonym oknie czasowym. Pacjent może zaktualizować masę ciała i opcjonalną notatkę dla już istniejącego rekordu, o ile:
- jest właścicielem wpisu (IDOR-safe),
- wpis został dodany przez pacjenta (nie przez dietetyka),
- nie minęła granica edycji: do końca następnego dnia po `measurementDate` (strefa czasowa: Europe/Warsaw).

Zgodność z API spec (api-plan.md 410–455) i typami w `src/types.ts`.


## 2. Szczegóły żądania

- Metoda HTTP: PATCH
- Struktura URL: `/api/weight/:id`
  - Przykład: `/api/weight/9a7c6b4e-2e31-4a51-a3b0-6b0e5a2ab3c9`

- Parametry:
  - Wymagane (path):
    - `id` (UUID) – identyfikator wpisu wagi do edycji
  - Opcjonalne (query): brak
  - Nagłówki:
    - `Content-Type: application/json`
    - Sesja (cookie) zarządzana przez Lucia (SSR/Edge zgodnie z projektem)

- Request Body (JSON) – zgodnie z `UpdateWeightEntryRequest`:
  ```json
  {
    "weight": 75.8,
    "note": "Updated note"
  }
  ```
  - Zasady:
    - Co najmniej jedno pole musi wystąpić: `weight` lub `note`
    - `weight`: liczba w zakresie 30–250 (kg), max 1–2 miejsca po przecinku (walidacja)
    - `note`: string opcjonalny, długość ≤ 200 znaków


## 3. Wykorzystywane typy

- DTO (z `src/types.ts`):
  - `UpdateWeightEntryRequest`
  - `UpdateWeightEntryResponse`
  - `WeightEntryDTO`
- Command modele (z `src/types.ts`):
  - `UpdateWeightEntryCommand`
  - `CreateAuditLogCommand`
  - `CreateEventCommand`


## 4. Szczegóły odpowiedzi

- 200 OK – sukces
  ```json
  {
    "entry": {
      "id": "uuid",
      "userId": "patient_uuid",
      "weight": 75.8,
      "measurementDate": "2025-10-29T08:00:00+02:00",
      "source": "patient",
      "isBackfill": false,
      "isOutlier": false,
      "outlierConfirmed": null,
      "note": "Updated note",
      "createdAt": "2025-10-29T08:30:00Z",
      "updatedAt": "2025-10-30T12:00:00Z",
      "updatedBy": "patient_uuid"
    }
  }
  ```

- Kody błędów:
  - 400 Bad Request – dane niepoprawne (poza zakresem, zbyt długa notatka, okno edycji minęło)
  - 401 Unauthorized – brak ważnej sesji
  - 403 Forbidden – brak uprawnień (nie właściciel, wpis nieutworzony przez pacjenta)
  - 404 Not Found – wpis nie istnieje lub nie należy do użytkownika
  - 422 Unprocessable Entity – walidacja schematu JSON nie powiodła się
  - 500 Internal Server Error – nieoczekiwany błąd serwera


## 5. Przepływ danych

1) Klient (SPA/SSR) wysyła PATCH do `/api/weight/:id` z JSON body.
2) Warstwa API (Astro route handler):
   - Weryfikuje sesję (Lucia) i pobiera `userId`, `role`.
   - Parsuje i waliduje body (Zod).
   - Wywołuje serwis `weightService.updatePatientEntry(command)`.
3) Serwis `weightService`:
   - Pobiera wpis po `id` (repository).
   - Weryfikuje reguły biznesowe: właścicielstwo, `source === 'patient'`, okno edycji.
   - Normalizuje wartości (np. zaokrąglenie wagi do 0.1 kg, trim notatki).
   - Aktualizuje rekord (repository) z `updatedBy`, `updatedAt` i flagami (np. `isOutlier` re-eval, `outlierConfirmed = null` przy zmianie wagi).
   - Zapisuje Audit Log (`CreateAuditLogCommand`).
   - Wysyła event `edit_weight` (`CreateEventCommand`).
   - Zwraca DTO do handlera.
4) Handler mapuje wynik do `UpdateWeightEntryResponse` i zwraca 200 OK.


## 6. Względy bezpieczeństwa

- Uwierzytelnianie: wymagane (Lucia v3); brak sesji → 401.
- Autoryzacja: pacjent może edytować wyłącznie własne wpisy; wpis musi mieć `source='patient'` → w przeciwnym razie 403.
- IDOR: filtrować po `id` + `userId` przy odczycie/aktualizacji; nie wyciekać informacji o cudzych rekordach (404 zamiast ujawniania).
- Walidacja wejścia: Zod dla typów i zakresów, odrzuca nadmiarowe pola (strip).
- Mass assignment: whitelist pól (`weight`, `note`) – ignorować inne.
- CSRF: żądanie jest API-call z cookie sesyjnym; dla samego API przyjmujemy same-origin fetch + session cookie; ewentualnie rozważyć `SameSite=Lax/Strict` dla cookies (konfiguracja auth).
- Concurrency: optymistyczne – użycie `updatedAt` w `WHERE` (opcjonalnie) lub akceptacja ostatniej zmiany (MVP); plan zawiera wariant optymistyczny w krokach.
- Logowanie: audit trail dla zmian danych zdrowotnych; unikać logowania PII w plain logs.


## 7. Obsługa błędów

- Mapowanie błędów domenowych na HTTP:
  - `ValidationError` (Zod) → 422
  - `EditWindowExpiredError` → 400
  - `UnauthorizedError` (brak sesji) → 401
  - `ForbiddenError` (nie właściciel / niewłaściwe źródło) → 403
  - `NotFoundError` (brak wpisu dla usera) → 404
  - Inne błędy → 500 (z generowanym `requestId`)

- Rejestrowanie błędów:
  - Serwer: Vercel logs (structured: level, requestId, userId, entryId, cause).
  - Brak dedykowanej tabeli błędów w MVP – dla krytycznych błędów można wysłać `CreateEventCommand` z `event_type='error'` i minimalnym `properties` (bez PII).
  - Audit log tylko dla operacji, nie dla nieudanych prób (opcjonalnie: wpis `action='update'` tylko przy sukcesie).


## 8. Rozważania dotyczące wydajności

- Operacja dotyczy jednego rekordu po PK (`id`) – O(1).
- Indeksy: PK na `id` wystarczy; jeśli dodatkowa ochrona, zapytanie z `WHERE id=? AND user_id=?` – warto mieć index po `user_id` (najpewniej już istnieje).
- Koszt CPU minimalny (walidacje + kilka zapytań).
- Brak potrzeby cache.


## 9. Etapy wdrożenia

1) Routing API
   - Utwórz nową trasę: `src/pages/api/weight/[id].ts`.
   - Eksportuj handler `PATCH` (Astro API Route). Ustal format zwrotek JSON.

2) Walidacja requestu
   - Zdefiniuj schemat Zod dla `UpdateWeightEntryRequest`:
     - `weight`: `z.number().min(30).max(250).refine(… opcjonalna precyzja …)` – opcjonalne
     - `note`: `z.string().trim().max(200)` – opcjonalne
     - `.refine` aby wymusić, że co najmniej jedno z pól jest obecne.
   - Odrzucaj nieznane pola (`strip`).

3) Autentykacja i autoryzacja
   - Pobierz sesję z Lucia (`getSession`); brak → 401.
   - Wymuś `role === 'patient'`; inne role → 403.

4) Serwis `weightService.updatePatientEntry`
   - Wejście: `UpdateWeightEntryCommand`:
     ```ts
     {
       id: string;                // entry id
       weight?: number;
       note?: string;
       updatedBy: string;         // userId z sesji
     }
     ```
   - Kroki:
     1. `entry = repository.getByIdForUser(id, userId)`; jeśli brak → 404.
     2. Weryfikuj `entry.source === 'patient'`; jeśli nie → 403.
     3. Sprawdź okno edycji:
        - `deadline = endOfDay(zonedTimeToUtc(addDays(entry.measurementDate, 1), 'Europe/Warsaw'))`
        - jeśli `nowUtc > deadline` → `EditWindowExpiredError` (400).
     4. Normalizacja:
        - jeśli `weight` – zaokrąglij do 0.1 kg (np. `Math.round(w*10)/10`).
        - jeśli `note` – `trim()`.
     5. Re-ewaluacja outlier (jeśli `weight` zmienione):
        - policz różnicę vs ostatnia poprzednia waga użytkownika (np. >3 kg w 1 dzień → `isOutlier=true`); logika spójna z POST.
        - jeśli outlier status zmienia się → `outlierConfirmed = null`.
     6. Aktualizacja w DB z `updatedAt=now()`, `updatedBy=userId`.
        - Opcja A (MVP): bez warunku `updatedAt`.
        - Opcja B: optymistycznie – `WHERE id=? AND user_id=? AND updated_at=?` (gdy klient dostarczy etag lub poprzedni `updatedAt`).
     7. Audit log (`CreateAuditLogCommand`): `action='update'`, `table='weight_entries'`, `recordId=id`, `before`/`after` (diff minimalny).
     8. Event: `CreateEventCommand` z `eventType='edit_weight'`, `properties={source:'patient'}`.
     9. Mapowanie do `UpdateWeightEntryResponse.entry` (typy liczbowe vs decimal – zwracaj `number` dla `weight`).

5) Repository (`lib/repositories/weightRepository.ts` – jeśli brak, utwórz)
   - `getByIdForUser(id: string, userId: string)`
   - `updateEntry(id: string, patch: { weight?, note?, isOutlier?, outlierConfirmed?, updatedBy })`
   - W Drizzle: upewnij się, że decimal `weight` jest rzutowany do `number` w DTO.

6) Format odpowiedzi
   - Zwracaj dokładnie pola z `UpdateWeightEntryResponse`.
   - `measurementDate`, `createdAt`, `updatedAt` w ISO 8601 (UTC).

7) Obsługa błędów w handlerze
   - `try/catch` mapujący błędy domenowe i walidacyjne na kody z sekcji 7.
   - Zwracany JSON błędu zgodny z `ApiError`:
     ```json
     { "error": "validation_error", "message": "Weight must be between 30 and 250", "statusCode": 422 }
     ```

8) Testy (minimalne, manual/e2e w MVP)
   - Scenariusze: brak sesji (401), nie właściciel (403), poza oknem (400), walidacja (422), sukces (200), nieistniejący wpis (404).

9) Observability
   - Loguj `requestId`, `userId`, `entryId`, `outcome` (success/failure) do Vercel logs.
   - Audit log + event `edit_weight` przy sukcesie.

10) Dokumentacja
   - Zaktualizuj `.ai-10xdevs/api-plan.md` (sekcja PATCH) o ewentualne doprecyzowania techniczne (np. reguła outlier, precyzja wagi).


### Pseudokod handlera (wysoki poziom)

```ts
// src/pages/api/weight/[id].ts
export async function PATCH(context) {
  const session = await auth.validateRequest(context.request);
  if (!session) return json({ error: 'unauthorized', message: 'Unauthorized', statusCode: 401 }, { status: 401 });
  if (session.user.role !== 'patient') return json({ error: 'forbidden', message: 'Forbidden', statusCode: 403 }, { status: 403 });

  const id = context.params.id;
  const body = await context.request.json();
  const parse = updateWeightSchema.safeParse(body);
  if (!parse.success) return json({ error: 'validation_error', message: zodMessage(parse.error), statusCode: 422 }, { status: 422 });

  try {
    const entry = await weightService.updatePatientEntry({
      id,
      weight: parse.data.weight,
      note: parse.data.note,
      updatedBy: session.user.id
    });
    return json({ entry }, { status: 200 });
  } catch (err) {
    return mapErrorToHttpResponse(err);
  }
}
```


### Pseudokod serwisu

```ts
// lib/weight.ts (rozszerzenie istniejącego serwisu)
export async function updatePatientEntry(cmd: UpdateWeightEntryCommand): Promise<UpdateWeightEntryResponse['entry']> {
  const entry = await repo.getByIdForUser(cmd.id, cmd.updatedBy);
  if (!entry) throw new NotFoundError();
  if (entry.source !== 'patient') throw new ForbiddenError('Only patient-origin entries can be edited');

  if (nowUtc() > editDeadline(entry.measurementDate, 'Europe/Warsaw'))
    throw new EditWindowExpiredError();

  const next = computePatchedEntry(entry, cmd); // weight rounding, note trim, outlier re-eval
  const updated = await repo.updateEntry(entry.id, {
    weight: next.weight,
    note: next.note,
    isOutlier: next.isOutlier,
    outlierConfirmed: next.outlierConfirmed,
    updatedBy: cmd.updatedBy
  });

  await auditLog.create({ action: 'update', tableName: 'weight_entries', recordId: entry.id, userId: cmd.updatedBy, before: pickDiffBefore(entry, next), after: pickDiffAfter(entry, next) });
  await events.create({ userId: cmd.updatedBy, eventType: 'edit_weight', properties: { source: 'patient' } });

  return toUpdateResponseDTO(updated);
}
```


## Założenia i decyzje implementacyjne

- Strefa czasowa reguł biznesowych: Europe/Warsaw (zgodnie z PRD). Wszystkie daty w API – ISO 8601 (UTC).
- `weight` przechowywany w DB jako decimal → w API zwracany jako `number`.
- Brak rate limiting w MVP (zgodnie z `tech-stack-waga.md`).
- Re-ewaluacja outlier zgodna z logiką POST `/api/weight` już w projekcie (spójność).


## Potencjalne ryzyka

- Niejednoznaczność okna edycji przy zmianie czasu (CET/CEST): użycie `Europe/Warsaw` z `date-fns-tz` minimalizuje ryzyko.
- IDOR: konieczna weryfikacja `userId` przy SELECT/UPDATE.
- Concurrency: możliwość wyścigów przy równoległych PATCH – akceptacja ostatniej zmiany w MVP lub wdrożenie opcji B (optymistyczne blokowanie).


## Zależności (biblioteki)

- `zod` – walidacja wejścia
- `date-fns` + `date-fns-tz` – obliczenie `endOfDay` w `Europe/Warsaw`
- Drizzle ORM – dostęp do DB
- Lucia v3 – sesje i role


