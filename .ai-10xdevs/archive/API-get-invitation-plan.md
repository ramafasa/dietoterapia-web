## API Endpoint Implementation Plan: GET /api/invitations/:token

### 1. Przegląd punktu końcowego

- Cel: Walidacja tokenu zaproszenia przekazanego w URL. Punkt końcowy jest publiczny i wykorzystywany w flow rejestracji pacjenta. Zwraca informację, czy token jest poprawny i nieprzeterminowany oraz e‑mail powiązany z zaproszeniem.
- Zgodność ze specyfikacją:
  - 200 OK: token poprawny → { valid, email, expiresAt }
  - 400 Bad Request: token wygasł lub został już użyty
  - 404 Not Found: zaproszenie o podanym tokenie nie istnieje

### 2. Szczegóły żądania

- Metoda HTTP: GET
- Struktura URL: `/api/invitations/:token`
- Parametry:
  - Wymagane:
    - `token` (URL param): string, 1..255, niesekretny identyfikator zaproszenia
  - Opcjonalne:
    - Brak
- Nagłówki:
  - `Accept: application/json`
- Uwierzytelnianie: Brak (publiczny endpoint do weryfikacji zaproszenia)
- Treść żądania: Brak

### 3. Wykorzystywane typy

- DTO:
  - `ValidateInvitationResponse` (src/types.ts)
    - { valid: boolean; email: string; expiresAt: Date | null }
  - `ApiError` (src/types.ts)
    - { error: string; message: string; statusCode: number }
- Modele DB (src/db/schema.ts):
  - `invitations`: { id, email, token, createdBy, expiresAt, usedAt, createdAt }
- Modele/komendy: Brak komend mutujących (tylko odczyt/walidacja)

Uwaga o serializacji: W odpowiedzi JSON pole `expiresAt` będzie serializowane jako ISO 8601 string (np. `"2025-10-31T12:00:00.000Z"`), mimo że w TypeScript DTO jest typowane jako `Date | null`.

### 4. Szczegóły odpowiedzi

- 200 OK (token prawidłowy i niewykorzystany, przed datą wygaśnięcia)
  ```json
  {
    "valid": true,
    "email": "newpatient@example.com",
    "expiresAt": "2025-10-31T12:00:00.000Z"
  }
  ```
- 400 Bad Request (token wygasły lub użyty)
  ```json
  {
    "error": "invalid_token",
    "message": "Invitation token has expired or has already been used.",
    "statusCode": 400
  }
  ```
- 404 Not Found (token nie istnieje)
  ```json
  {
    "error": "not_found",
    "message": "Invitation not found.",
    "statusCode": 404
  }
  ```
- 500 Internal Server Error (nieoczekiwany błąd)
  ```json
  {
    "error": "server_error",
    "message": "Unexpected error.",
    "statusCode": 500
  }
  ```

### 5. Przepływ danych

1. Request trafia do handlera Astro API: `src/pages/api/invitations/[token].ts` (metoda `GET`).
2. Walidacja parametru `token` (obecność, długość/max 255).
3. Service `invitationService.validateToken(token)`:
   - Repozytorium `invitationRepository.getByToken(token)` (Drizzle) → SELECT z tabeli `invitations` po indeksie unikalnym `token`.
   - Jeśli brak rekordu → zwróć `null` (404).
   - Jeśli `usedAt` nie jest `null` lub `expiresAt` < now → stan „nieważny” (400).
   - W przeciwnym razie → stan „ważny” → zwróć e‑mail i `expiresAt`.
4. Handler mapuje wynik na odpowiedni kod HTTP i body JSON (DTO lub ApiError).
5. Zdarzenia/metryki (opcjonalnie, nie blokujące): zapis `events` z `eventType: 'invitation_validate'` i prostymi właściwościami (bez zapisywania surowego tokenu).

### 6. Względy bezpieczeństwa

- Brak uwierzytelniania (publiczny endpoint), minimalizować ujawnianie informacji:
  - 404 tylko gdy brak rekordu; 400 dla „expired/used” bez rozróżniania przyczyny.
  - Dlaważnego tokenu zwracamy tylko `email` i `expiresAt`. Nie ujawniamy `createdBy`, `createdAt`, itp.
- Nie logować surowych tokenów w systemie logów ani w tabeli `events`. Jeśli konieczny ślad, to skrót (np. sha256(token) bez soli użytkownika).
- Ochrona przed enumeration via timing: wykonywać prostą ścieżkę bez kosztownych operacji; różnice czasowe i tak są minimalne, akceptowalne dla MVP.
- Wstawki HTML/JS w danych nie występują, ale po stronie klienta zawsze renderować wartości w kontekście tekstowym.
- Rate limiting: zgodnie z decyzją MVP „wyłączone”; można łatwo dodać per-IP/per-token w przyszłości (Upstash Ratelimit).

### 7. Obsługa błędów

- Mapowanie błędów na statusy:
  - Brak tokenu / token pusty → 400 Bad Request
  - Zaproszenie nie znalezione → 404 Not Found
  - Zaproszenie wygasłe → 400 Bad Request
  - Zaproszenie użyte (`usedAt` != null) → 400 Bad Request
  - Inne błędy (DB/nieoczekiwane) → 500 Internal Server Error
- Format błędu: `ApiError` z `error` (stały kod), `message` (bez wrażliwych szczegółów), `statusCode`.
- Rejestrowanie:
  - Zdarzenie `events` (opcjonalnie): `invitation_validate` z `result` ∈ { "valid", "expired_or_used", "not_found", "bad_request" } i `ipHash` (opcjonalnie) — bez tokenu.
  - Audit log: nie dotyczy (brak mutacji).

### 8. Rozważania dotyczące wydajności

- Tabela `invitations` ma unikalny indeks po `token` → O(1) lookup.
- Zapytanie pojedyncze, brak joinów — minimalny koszt.
- Brak cache’owania koniecznego na tym etapie. W razie potrzeby: krótki in-memory TTL cache na warstwie serwisu.
- Neon serverless: pojedyncze krótkie połączenie; akceptowalne dla MVP.

### 9. Kroki implementacji

1) Routing i plik endpointu
- Utwórz `src/pages/api/invitations/[token].ts`.
- Eksportuj `GET: APIRoute`.
- Parsuj `params.token`, zwróć 400 jeśli brak/pusty/za długi.

2) Walidacja danych wejściowych
- Użyj lekko zdefiniowanej walidacji (np. zod lub własny guard): token string, length 1..255.
- Brak ciała żądania; brak cookies/sesji.

3) Warstwa serwisu
- Plik: `src/lib/services/invitationService.ts` (jeśli nie istnieje, utworzyć).
- Funkcja: `validateToken(token: string): Promise<{ valid: true; email: string; expiresAt: Date } | { valid: false; reason: 'not_found' | 'expired_or_used' }>`
- Logika:
  - Pobierz rekord przez repozytorium.
  - Jeśli brak → `{ valid: false, reason: 'not_found' }`.
  - Jeśli `usedAt` != null lub `expiresAt` < now → `{ valid: false, reason: 'expired_or_used' }`.
  - Inaczej → `{ valid: true, email, expiresAt }`.

4) Warstwa repozytorium
- Plik: `src/lib/repositories/invitationRepository.ts` (jeśli nie istnieje, utworzyć).
- Funkcja: `getByToken(token: string): Promise<Invitation | null>`
- Implementacja Drizzle:
  - `db.query.invitations.findFirst({ where: eq(invitations.token, token) })`

5) Handler odpowiedzi (DTO)
- Sukces (200): zwróć `{ valid: true, email, expiresAt: expiresAt.toISOString() }` (zgodne z JSON; w TS typ `Date | null`).
- Błędy:
  - `reason === 'not_found'` → 404 + `ApiError`.
  - `reason === 'expired_or_used'` → 400 + `ApiError`.
  - Walidacja parametru → 400 + `ApiError`.
  - Nieoczekiwany błąd → 500 + `ApiError`.

6) Logowanie zdarzeń (opcjonalne, nieblokujące)
- `src/lib/repositories/eventRepository.ts` już istnieje: dodać wywołanie w serwisie:
  - `eventType: 'invitation_validate'`
  - `properties: { result, ipHash? }` (bez tokenu, bez e‑maila).

7) Testy (lekki zakres)
- Testy jednostkowe serwisu:
  - not_found → reason not_found
  - expired → reason expired_or_used
  - used → reason expired_or_used
  - valid → valid true + email + expiresAt
- Testy integracyjne handlera (dev): szybkie sprawdzenie kodów 200/400/404.

8) Spójność typów i formatów
- Upewnij się, że `expiresAt` zawsze serializowane do ISO string w JSON.
- `ValidateInvitationResponse` pozostaje bez zmian; konsument zakłada string przy transporcie JSON.

9) Błędy i obserwowalność
- Logi serwerowe: tylko wysokopoziomowe komunikaty bez tokenu/e‑maila.
- Brak Sentry w MVP (zgodnie z decyzją). Jeśli pojawią się problemy, dodać w późniejszym etapie.

### 10. Szkic implementacji (orientacyjny)

Handler (Astro):
```ts
// src/pages/api/invitations/[token].ts
import type { APIRoute } from 'astro'
import { invitationService } from '@/lib/services/invitationService'

export const GET: APIRoute = async ({ params }) => {
  const token = params.token ?? ''
  if (!token || token.length > 255) {
    return new Response(JSON.stringify({
      error: 'bad_request',
      message: 'Token is required.',
      statusCode: 400
    }), { status: 400, headers: { 'content-type': 'application/json' } })
  }

  try {
    const result = await invitationService.validateToken(token)
    if (!result.valid) {
      if (result.reason === 'not_found') {
        return new Response(JSON.stringify({
          error: 'not_found',
          message: 'Invitation not found.',
          statusCode: 404
        }), { status: 404, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({
        error: 'invalid_token',
        message: 'Invitation token has expired or has already been used.',
        statusCode: 400
      }), { status: 400, headers: { 'content-type': 'application/json' } })
    }

    return new Response(JSON.stringify({
      valid: true,
      email: result.email,
      expiresAt: result.expiresAt.toISOString()
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  } catch {
    return new Response(JSON.stringify({
      error: 'server_error',
      message: 'Unexpected error.',
      statusCode: 500
    }), { status: 500, headers: { 'content-type': 'application/json' } })
  }
}
```

Serwis (zarys):
```ts
// src/lib/services/invitationService.ts
import { invitationRepository } from '@/lib/repositories/invitationRepository'

export const invitationService = {
  async validateToken(token: string) {
    const invite = await invitationRepository.getByToken(token)
    if (!invite) return { valid: false as const, reason: 'not_found' as const }
    const now = new Date()
    if (invite.usedAt || invite.expiresAt < now) {
      return { valid: false as const, reason: 'expired_or_used' as const }
    }
    return { valid: true as const, email: invite.email, expiresAt: invite.expiresAt }
  }
}
```

Repozytorium (zarys):
```ts
// src/lib/repositories/invitationRepository.ts
import { db } from '@/db'
import { invitations } from '@/db/schema'
import { eq } from 'drizzle-orm'

export const invitationRepository = {
  async getByToken(token: string) {
    return db.query.invitations.findFirst({
      where: eq(invitations.token, token)
    })
  }
}
```

### 11. Zgodność z zasadami implementacji

- Astro SSR, endpoint jako plik w `src/pages/api/...`, eksport `GET`.
- Warstwa serwisowa i repozytoryjna oddzielone od handlera.
- Poprawne kody statusu: 200, 400, 404, 500 zgodnie ze specyfikacją.
- Brak wycieków informacji i danych wrażliwych w błędach/logach.
- Prosty, deterministyczny flow bez zbędnych wyjątków i bez catch-all poza warstwą handlera.


