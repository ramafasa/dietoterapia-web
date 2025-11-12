### API Endpoint Implementation Plan: POST /api/auth/logout

## 1. Przegląd punktu końcowego

- Cel: Wylogowanie użytkownika poprzez unieważnienie aktualnej sesji w Lucia oraz wyczyszczenie ciasteczka sesyjnego. Endpoint ma zwracać 204 No Content przy sukcesie oraz 401 Unauthorized, gdy nie ma ważnej sesji.
- Zgodność ze specyfikacją: POST /api/auth/logout, brak body, 204 No Content (bez treści), 401 gdy brak ważnej sesji.

## 2. Szczegóły żądania

- Metoda HTTP: POST
- Struktura URL: `/api/auth/logout`
- Parametry:
  - Wymagane: brak
  - Opcjonalne: brak
- Nagłówki: standardowe (CORS wg globalnej konfiguracji); brak content-type wymaganych
- Cookies (wejście): `auth_session` (HttpOnly, Secure w produkcji, SameSite=Lax) – nazwa zgodna z `lucia.sessionCookieName`
- Request Body: brak

## 3. Wykorzystywane typy

- DTOs (z `src/types.ts`):
  - `ApiError` – spójny format odpowiedzi błędów
- Command Modele (z `src/types.ts` – opcjonalne, jeśli logujemy zdarzenia/audit):
  - `CreateEventCommand` – ewentualne logowanie zdarzenia `logout`
  - `CreateAuditLogCommand` – ewentualny wpis audytowy „session delete” (post-MVP)

## 3. Szczegóły odpowiedzi

- Sukces (`204 No Content`):
  - Treść: brak (puste body)
  - Działania uboczne: invalidacja sesji w bazie + ustawienie pustego cookie sesyjnego (`createBlankSessionCookie`)
- Błędy:
  - `401 Unauthorized` – brak ciasteczka sesyjnego lub sesja nieważna (wygasła/nieistniejąca)
  - `500 Internal Server Error` – błąd po stronie serwera (np. błąd DB podczas invalidacji)
- Format błędu (JSON, `ApiError`):
  - `{ "error": "Unauthorized" | "Internal Server Error", "message": string, "statusCode": 401 | 500 }`

## 4. Przepływ danych

1. Odczytaj `sessionId` z ciasteczka: `cookies.get(lucia.sessionCookieName)?.value`.
2. Jeśli brak `sessionId` → zwróć `401 Unauthorized` (zgodnie ze specyfikacją).
3. Zweryfikuj sesję (opcjonalnie, bezpośrednio invalidacja też jest ok):
   - Preferowane: `lucia.validateSession(sessionId)` – jeśli `session == null` → `401 Unauthorized`.
4. Unieważnij sesję: `await lucia.invalidateSession(sessionId)` – usunięcie rekordu z tabeli `sessions` (Drizzle + Lucia adapter).
5. Ustaw puste ciasteczko: `cookies.set(blank.name, blank.value, blank.attributes)` gdzie `blank = lucia.createBlankSessionCookie()`.
6. (Opcjonalnie) Zaloguj event `logout` do `events` (własna analityka) z minimalnymi properties (np. `userAgent`, `ip` jeśli dostępne).
7. Zwróć `204 No Content`.

Źródła danych/usługi:
- DB: tabela `sessions` (Neon Postgres) – operacja delete/invalidate poprzez Lucia.
- Middleware: `src/middleware/auth.ts` automatycznie odświeża/zeruje cookie; endpoint musi jawnie wyczyścić cookie po invalidacji.

## 5. Względy bezpieczeństwa

- Uwierzytelnianie: endpoint używa cookie sesyjnego (HttpOnly). Brak body minimalizuje powierzchnię ataku.
- CSRF: dla POST na logout ryzyko jest niskie (operacja „bezpieczna” w kontekście utraty sesji), jednak:
  - SameSite=Lax ogranicza CSRF.
  - Dodatkowo można rozważyć weryfikację nagłówka `Origin`/`Referer` (ta sama domena) – opcjonalnie post-MVP.
- CORS: stosować globalne ustawienia projektu; endpoint nie powinien być dostępny cross-site bez kontroli.
- Cookies: użyć `createBlankSessionCookie()` aby zagwarantować poprawne atrybuty (`Path=/`, `HttpOnly`, `Secure` w prod).
- Brak treści w odpowiedzi (204) – zapobiega przypadkowemu ujawnianiu informacji.
- Brak enumeracji kont – odpowiedzi 401 nie ujawniają szczegółów o istnieniu konta/sesji (tylko „Unauthorized”).

## 6. Obsługa błędów

- Scenariusze błędów:
  - Brak cookie sesyjnego → `401 Unauthorized` z `ApiError`.
  - Sesja nieznaleziona/nieważna → `401 Unauthorized` z `ApiError`.
  - Błąd DB przy `invalidateSession` → `500 Internal Server Error` z `ApiError`.
- Rejestrowanie błędów:
  - Minimum: `console.error` z kontekstem (bez PII).
  - (Opcjonalnie) Zapis do `events` jako `logout_error` lub do audit log, jeśli istnieje stabilny pipeline.
- Nie ujawniać detali technicznych klientowi; message ogólne (np. „Nieautoryzowany”, „Wewnętrzny błąd serwera”).

## 7. Rozważania dotyczące wydajności

- Operacja O(1) po stronie DB (pojedyncza invalidacja sesji) – bardzo lekka.
- Lucia + Drizzle mają indeksy po kluczu sesji – brak potrzeby dodatkowych optymalizacji.
- Idempotencja: wielokrotne wywołania po wylogowaniu zwrócą `401` (brak sesji) – zgodnie ze specyfikacją.

## 8. Etapy wdrożenia

1. Analiza obecnej implementacji:
   - Plik: `src/pages/api/auth/logout.ts`
   - Aktualnie: zwraca `200 OK` i `{ success: true }` nawet gdy brak sesji.
2. Aktualizacja endpointu do zgodności ze specyfikacją:
   - Wymuś obecność i ważność sesji: jeśli brak `sessionId` lub walidacja zwróci `null` → `401 Unauthorized` z `ApiError` i `Content-Type: application/json`.
   - Przy ważnej sesji: `await lucia.invalidateSession(sessionId)`.
   - Ustaw puste cookie: `lucia.createBlankSessionCookie()` + `cookies.set(...)`.
   - Zwróć `204 No Content` (bez body); nie ustawiaj `Content-Type`.
3. (Opcjonalnie) Logowanie zdarzeń:
   - W przypadku sukcesu: dodać event `logout` (tabela `events`), jeśli analityka jest aktywna.
   - W przypadku błędu: `logout_error` (bez PII) – opcjonalnie.
4. Testy manualne i automatyczne:
   - Scenariusz 1: aktywna sesja → 204, cookie wyczyszczone, sesja usunięta w DB.
   - Scenariusz 2: brak cookie → 401.
   - Scenariusz 3: nieprawidłowy/expired sessionId → 401.
   - Scenariusz 4: błąd DB (symulacja) → 500.
5. Przegląd bezpieczeństwa:
   - Potwierdzić atrybuty cookie, brak treści w 204, brak zbędnych nagłówków.
   - (Opcjonalnie) Sprawdzić `Origin`/`Referer` dla POST.
6. Dokumentacja:
   - Uaktualnij `.ai-10xdevs/api-plan.md` (sekcję logout) oraz README/API docs, jeśli używane.
7. Deploy:
   - Standardowa ścieżka CI/CD; brak migracji DB.

## 9. Proponowana szkicowa zmiana (dla referencji implementacyjnej)

Poglądowy szkic zgodny ze specyfikacją (nie jest to finalny kod – referencja dla implementującego):

```ts
// src/pages/api/auth/logout.ts
import type { APIRoute } from 'astro'
import { lucia } from '@/lib/auth'
import type { ApiError } from '@/types'

export const POST: APIRoute = async ({ cookies }) => {
  try {
    const sessionId = cookies.get(lucia.sessionCookieName)?.value ?? null
    if (!sessionId) {
      const apiError: ApiError = {
        error: 'Unauthorized',
        message: 'Brak ważnej sesji',
        statusCode: 401
      }
      return new Response(JSON.stringify(apiError), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const { session } = await lucia.validateSession(sessionId)
    if (!session) {
      const apiError: ApiError = {
        error: 'Unauthorized',
        message: 'Brak ważnej sesji',
        statusCode: 401
      }
      return new Response(JSON.stringify(apiError), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    await lucia.invalidateSession(sessionId)

    const blank = lucia.createBlankSessionCookie()
    cookies.set(blank.name, blank.value, blank.attributes)

    return new Response(null, { status: 204 })
  } catch (err) {
    console.error('Logout error', err)
    const apiError: ApiError = {
      error: 'Internal Server Error',
      message: 'Wewnętrzny błąd serwera',
      statusCode: 500
    }
    return new Response(JSON.stringify(apiError), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
```


