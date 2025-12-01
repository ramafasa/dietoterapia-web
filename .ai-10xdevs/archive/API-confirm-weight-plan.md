## API Endpoint Implementation Plan: POST /api/weight/:id/confirm

### 1. Przegląd punktu końcowego

- Cel: Potwierdzenie lub odrzucenie anomalii (outlier) dla istniejącego wpisu wagi.
- Scenariusz: Pacjent (własny wpis) lub dietetyk (wpis pacjenta) potwierdza, że wykryta nietypowa zmiana wagi jest prawidłowa bądź ją odrzuca.
- Zwraca: Zaktualizowany wpis wagi (DTO) z aktualnym stanem `outlierConfirmed`.


### 2. Szczegóły żądania

- Metoda HTTP: POST
- Struktura URL: `/api/weight/:id/confirm`
  - Parametry ścieżki:
    - id (UUID) – wymagany. Identyfikator wpisu wagi.
- Nagłówki:
  - `Content-Type: application/json`
  - Cookie sesyjne ustawiane przez Lucia (SSR Astro)
- Request Body (JSON):
  - Wymagane:
    - `confirmed: boolean` – true (potwierdź anomalię) lub false (odrzuć anomalię)
  - Walidacja: `confirmOutlierSchema` (Zod)


### 3. Wykorzystywane typy

- DTO (z `src/types.ts`):
  - `ConfirmOutlierRequest` (request body)
  - `ConfirmOutlierResponse` (response body)
- Komendy (Command Models, z `src/types.ts` – już istniejące i wykorzystywane pośrednio przez serwis):
  - `UpdateWeightEntryCommand` (poziom serwisu/repo dla aktualizacji rekordu)
- Schematy walidacji (z `src/schemas/weight.ts`):
  - `confirmOutlierSchema` (Zod) – walidacja request body
- Warstwa serwisu:
  - `weightEntryService.confirmOutlier(...)` – core logika biznesowa (już istnieje)


### 4. Szczegóły odpowiedzi

- 200 OK – operacja idempotentna i/lub aktualizacja wykonana pomyślnie
  - Body: `ConfirmOutlierResponse`
    - `entry`: obiekt wpisu zawierający m.in. pola:
      - `id`, `userId`, `weight` (number), `measurementDate` (Date), `source`, `isBackfill`, `isOutlier`, `outlierConfirmed`, `note`, `createdAt`, `updatedAt`
- Kody błędów:
  - 400 Bad Request – wpis nie jest oznaczony jako outlier (walidacja domenowa)
  - 401 Unauthorized – brak ważnej sesji
  - 403 Forbidden – użytkownik nie ma uprawnień do potwierdzenia tego wpisu (IDOR/RBAC)
  - 404 Not Found – wpis o podanym `id` nie istnieje
  - 422 Unprocessable Entity – nieprawidłowe dane wejściowe (walidacja Zod)
  - 500 Internal Server Error – nieoczekiwany błąd serwera


### 5. Przepływ danych

1. Handler API (Astro API Route) odbiera `POST /api/weight/:id/confirm`.
2. Autentykacja: sprawdzenie `locals.user` (Lucia middleware). Brak → 401.
3. Parsowanie `id` z paramów ścieżki i `confirmed` z JSON body.
4. Walidacja body przez `confirmOutlierSchema` (Zod). Błąd → 422.
5. Wywołanie `weightEntryService.confirmOutlier({ id, confirmed, sessionUserId: user.id, sessionUserRole: user.role })`.
6. Serwis:
   - Pobiera wpis przez repo (`findById`).
   - 404 jeśli brak.
   - RBAC:
     - Pacjent: `entry.userId === sessionUserId` (inaczej 403).
     - Dietetyk: (MVP) akceptujemy; produkcyjnie weryfikacja relacji dietetyk–pacjent.
   - 400 jeśli `entry.isOutlier !== true`.
   - Idempotencja: jeśli `entry.outlierConfirmed === confirmed`, zwróć bieżący stan (200).
   - Aktualizacja przez repo: `updateOutlierConfirmation(id, confirmed, sessionUserId)`.
   - (Docelowo w transakcji) Audit Log + Event (`confirm_outlier`).
7. Mapowanie encji do DTO i zwrot 200 OK.


### 6. Względy bezpieczeństwa

- Autentykacja: Lucia v3, SSR Astro – użycie `locals.user` w handlerze.
- Autoryzacja/RBAC i IDOR:
  - Pacjent może potwierdzać TYLKO własne wpisy.
  - Dietetyk może potwierdzać wpisy pacjentów (MVP: domyślnie true; produkcyjnie dodać relację i helper `canAccessPatientEntry`).
- Walidacja danych: Zod schema dla body; sanity check typu UUID dla `id` (opcjonalny refine).
- Ograniczenie informacji o błędach: zwracać kody i komunikaty biznesowe, nie stack trace.
- Audit trail: zapis w `audit_log` (async, nie blokuje odpowiedzi; najlepiej w transakcji z aktualizacją).
- Zgodność z RODO: minimalny zakres danych w odpowiedzi, brak PII poza niezbędnymi polami DTO. Brak cache’owania odpowiedzi (`Cache-Control: no-store`).
- Rate limiting (poza MVP): rozważyć dodanie jeżeli pojawią się nadużycia.


### 7. Obsługa błędów

- 401 Unauthorized – brak `locals.user` (brak sesji).
- 403 Forbidden – brak uprawnień (np. pacjent próbuje potwierdzić cudzy wpis; nieprawidłowa rola).
- 404 Not Found – brak wpisu o wskazanym `id`.
- 400 Bad Request – wpis nie jest oznaczony jako `isOutlier=true`.
- 422 Unprocessable Entity – walidacja Zod body (`confirmed`).
- 500 Internal Server Error – pozostałe, nieprzewidziane błędy.

Mapowanie wyjątków z serwisu:
- `NotFoundError` → 404
- `ForbiddenError` → 403
- Błąd reguły domenowej „entry is not outlier” → 400
- Błędy Zod → 422
- Pozostałe → 500


### 8. Rozważania dotyczące wydajności

- Operacja dotyczy pojedynczego rekordu (O(1)); indeksy już istnieją dla innych scenariuszy.
- Unikać dodatkowych zapytań poza niezbędnymi (findById + update).
- Audit/event zapisywać async; dla spójności najlepiej w jednej transakcji DB (docelowo).


### 9. Kroki implementacji

1) API Route
- Dodaj nowy plik: `src/pages/api/weight/[id]/confirm.ts`
- Wzorzec handlera wg istniejących endpointów (`src/pages/api/weight.ts`):
  - Autentykacja z `locals.user`
  - Walidacja body poprzez `confirmOutlierSchema`
  - Wywołanie `weightEntryService.confirmOutlier(...)`
  - Mapowanie odpowiedzi na `ConfirmOutlierResponse`
  - Ustawienie nagłówków: `Content-Type: application/json`, `Cache-Control: no-store`
  - Obsługa wyjątków z odpowiednim mapowaniem kodów

2) Walidacja
- Upewnij się, że `confirmOutlierSchema` istnieje w `src/schemas/weight.ts` (jest).
- Opcjonalnie dodaj walidację `id` jako UUID (refine lub w serwisie jako wczesny check).

3) Serwis
- Wykorzystaj istniejące: `weightEntryService.confirmOutlier` (już zaimplementowane).
- Dostosuj komunikat dla błędu „not outlier” do spójnego ApiError (400).
- Docelowo (poza MVP): otocz update + audit + event transakcją.

4) Repository
- Wykorzystaj istniejące: `weightEntryRepository.findById` i `updateOutlierConfirmation`.

5) Audit i Events (asynchronicznie)
- Audit: `auditLogRepository.create` z before/after snapshot (entry.outlierConfirmed → confirmed).
- Event: `eventRepository.create({ eventType: 'confirm_outlier', properties: { entryId, confirmed } })`.
- Wersja MVP może pozostać bez transakcji; dodaj transakcję w iteracji hardeningu.

6) Testy
- Unit/integration:
  - 200 OK: dla pacjenta własny wpis z `isOutlier=true`, togglowanie confirmed (idempotencja).
  - 400: wpis z `isOutlier=false`.
  - 401: brak sesji.
  - 403: pacjent próbuje potwierdzić cudzy wpis.
  - 404: nieistniejący `id`.
  - 422: body bez `confirmed`/złym typem.

7) Dokumentacja
- Zaktualizuj wewnętrzny API list (README lub `.ai-10xdevs/api-plan.md`) o nowy endpoint.
- Dodaj przykłady curl/Insomnia.


### 10. Przykładowy szkic handlera (wzorzec)

```ts
// src/pages/api/weight/[id]/confirm.ts
import type { APIRoute } from 'astro'
import { confirmOutlierSchema } from '@/schemas/weight'
import { weightEntryService } from '@/lib/services/weightEntryService'
import type { ApiError, ConfirmOutlierResponse } from '@/types'

export const prerender = false

export const POST: APIRoute = async ({ params, request, locals }) => {
  try {
    const user = locals.user
    if (!user) {
      const err: ApiError = { error: 'unauthorized', message: 'Authentication required.', statusCode: 401 }
      return new Response(JSON.stringify(err), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }

    const id = params.id as string
    const body = await request.json()
    const { confirmed } = confirmOutlierSchema.parse(body)

    const entry = await weightEntryService.confirmOutlier({
      id,
      confirmed,
      sessionUserId: user.id,
      sessionUserRole: user.role,
    })

    const response: ConfirmOutlierResponse = { entry }
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  } catch (error: any) {
    // Map known errors
    const toApiError = (error: any): { status: number; body: ApiError } => {
      if (error?.name === 'NotFoundError') return { status: 404, body: { error: 'not_found', message: error.message, statusCode: 404 } }
      if (error?.name === 'ForbiddenError') return { status: 403, body: { error: 'forbidden', message: error.message, statusCode: 403 } }
      if (error?.errors && Array.isArray(error.errors)) return { status: 422, body: { error: 'validation_error', message: 'Invalid input', statusCode: 422 } }
      if (error?.message?.includes('anomalia') || error?.message?.includes('not outlier')) {
        return { status: 400, body: { error: 'bad_request', message: error.message, statusCode: 400 } }
      }
      return { status: 500, body: { error: 'internal_server_error', message: 'Unexpected server error.', statusCode: 500 } }
    }

    const { status, body } = toApiError(error)
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  }
}
```


### 11. Zgodność ze stackiem

- Astro SSR (`output: 'server'`) – endpoint jako Astro API Route.
- Drizzle ORM + Neon – używane w repozytoriach.
- Lucia v3 – sesje i `locals.user`.
- RODO – audit log + minimalizacja danych, brak cache.


### 12. Statusy HTTP – podsumowanie

- 200 OK – sukces/idempotencja
- 400 Bad Request – wpis nie jest outlier
- 401 Unauthorized – brak sesji
- 403 Forbidden – brak uprawnień
- 404 Not Found – wpis nie istnieje
- 422 Unprocessable Entity – nieprawidłowe body
- 500 Internal Server Error – błąd serwera


