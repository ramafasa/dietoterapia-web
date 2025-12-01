## API Endpoint Implementation Plan: POST /api/auth/signup

### 1. Przegląd punktu końcowego

Rejestruje nowe konto pacjenta na podstawie ważnego tokena zaproszenia. Tworzy użytkownika, zapisuje zgody, unieważnia zaproszenie, zakłada sesję w Lucia v3 i zwraca minimalne dane użytkownika wraz z danymi sesji. Zgodne z SSR Astro (output: server) i stackiem: Drizzle ORM + Neon Postgres, Lucia v3, react-email/nodemailer.


### 2. Szczegóły żądania

- Metoda HTTP: POST
- Struktura URL: /api/auth/signup
- Parametry:
  - Wymagane (body JSON):
    - invitationToken: string
    - email: string (format e-mail)
    - password: string (min. 8 znaków)
    - firstName: string
    - lastName: string
    - consents: Array<{ type: string; text: string; accepted: boolean }>, wymagane co najmniej wymagane prawnie zgody zaakceptowane
  - Opcjonalne (body JSON):
    - age?: number
    - gender?: 'male' | 'female' | 'other'
- Request Body (przykład zgodny ze specyfikacją):

```json
{
  "invitationToken": "abc123...",
  "email": "patient@example.com",
  "password": "SecurePass123",
  "firstName": "Jan",
  "lastName": "Kowalski",
  "age": 35,
  "gender": "male",
  "consents": [
    { "type": "data_processing", "text": "Zgadzam się...", "accepted": true },
    { "type": "health_data", "text": "Zgadzam się...", "accepted": true }
  ]
}
```


### 3. Wykorzystywane typy

- DTO (src/types.ts):
  - SignupRequest
  - SignupResponse
  - ApiError (dla błędów)
- Command Models (src/types.ts):
  - CreateUserCommand
- Tabele/encje (src/db/schema.ts): users, invitations, consents, sessions (wg Drizzle + Lucia adapter)


### 4. Szczegóły odpowiedzi

- 201 Created (sukces):

```json
{
  "user": {
    "id": "uuid",
    "email": "patient@example.com",
    "role": "patient",
    "firstName": "Jan",
    "lastName": "Kowalski",
    "age": 35,
    "gender": "male",
    "status": "active"
  },
  "session": {
    "id": "session_token",
    "expiresAt": "2025-11-29T12:00:00Z"
  }
}
```

- Kody błędów:
  - 400 Bad Request: nieważny/zużyty/wygaśnięty invitationToken, zbyt krótkie hasło, brak wymaganych zgód
  - 409 Conflict: email już zarejestrowany
  - 422 Unprocessable Entity: walidacja pól (np. niepoprawny e-mail)
  - 500 Internal Server Error: błąd serwera/DB/zewnętrznych zależności


### 5. Przepływ danych

1) Walidacja wejścia (Zod) do `SignupRequest`:
   - Format e-mail, min długość hasła (>= 8), niepuste firstName/lastName
   - Sprawdzenie, że wymagane prawnie zgody mają accepted = true
2) Sprawdzenie `invitationToken` w DB:
   - Istnieje, nie wygasł, nie został użyty, pasuje do e-maila (jeśli zaproszenie powiązane z e-mailem)
3) Sprawdzenie konfliktu e-maila:
   - Czy `users.email` istnieje → jeśli tak, 409
4) Hash hasła (bcrypt)
5) Transakcja DB:
   - Utwórz `users` (CreateUserCommand, rola patient, status active)
   - Zapisz `consents` (własna tabela lub kolumna JSON wg schematu)
   - Oznacz zaproszenie jako „used” (timestamp, powiązanie z userId)
   - Utwórz wpis audit (create)
6) Utwórz sesję przez Lucia v3:
   - `lucia.createSession(userId, attributes)`
   - Ustaw cookie sesyjne (SSR Astro endpoint)
7) Zwróć 201 z `SignupResponse` (user + session)
8) Tracking (opcjonalnie, async best-effort):
   - Zdarzenie `signup` w tabeli `events`


### 6. Względy bezpieczeństwa

- Hasła: bcrypt (salt rounds 10–12), nigdy nie logować haseł ani hashy
- Zaproszenia: weryfikacja ważności, nieużyte, powiązanie z e-mailem (jeśli przewidziane)
- Sesje: Lucia v3, HttpOnly, Secure, SameSite=strict, maxAge 30 dni (zgodnie z PRD)
- Walidacja i sanitizacja danych wejściowych (Zod)
- RBAC: po rejestracji rola `patient`
- CSRF: POST JSON + HttpOnly cookie (wystarczające w tym przepływie; opcjonalnie CSRF token, jeśli wymagają reguły)
- SQLi: Drizzle parametryzowane zapytania
- Brak rate limiting w MVP (świadomie) – można dodać później
- Logowanie audytowe create user i użycia zaproszenia


### 7. Obsługa błędów

- Kształt błędu: ApiError { error, message, statusCode }
- Mapowanie błędów:
  - ValidationError (Zod) → 422
  - InvalidInvitation / Expired / Used → 400
  - MissingRequiredConsents → 400
  - EmailConflict → 409
  - DB/Unknown → 500
- Audyt błędów krytycznych (create audit z action=‘create’, tableName=‘users’, before/after ograniczone, bez PII nadmiarowego)
- Logi serwerowe (console.error) z bezpiecznymi metadanymi


### 8. Rozważania dotyczące wydajności

- Indeksy: unique index na users.email, index na invitations.token, invitations.expires_at
- Jedna transakcja DB dla całego przepływu tworzenia (spójność)
- Minimalne selecty (sprawdzanie tokenu i e-maila)
- Odkładanie działań niekrytycznych (event tracking, e-mail powitalny) do try/catch best-effort po odpowiedzi lub w tle


### 9. Kroki implementacji

1) Typy i walidacja
   - Utwórz schema Zod: `signupSchema` odpowiadająca `SignupRequest` (min. 8 znaków hasła, e-mail, wymagane zgody zaakceptowane)
2) Warstwa repozytoriów (jeśli brak/uzupełnić):
   - `lib/repositories/userRepository.ts`
     - findByEmail(email)
     - createUser(command: CreateUserCommand)
   - `lib/repositories/invitationRepository.ts`
     - findByToken(token)
     - markUsed(id, userId)
   - `lib/repositories/consentRepository.ts` (jeśli oddzielna tabela)
     - createMany(userId, consents)
3) Warstwa serwisu
   - `lib/services/authService.ts` (nowy)
     - `signup(request: SignupRequest): Promise<SignupResponse>`
     - Implementuje kroki 1–6 z sekcji Przepływ danych w jednej transakcji (Drizzle `db.transaction`)
     - Rzuca dedykowane błędy domenowe (InvalidInvitationError, EmailConflictError, ValidationError)
4) Sesje (Lucia v3)
   - Konfiguracja Lucia (jeśli nie gotowa) w `src/lib/auth.ts`
   - W serwisie po utworzeniu usera: `createSession(userId)`
5) Endpoint API
   - Plik: `src/pages/api/auth/signup.ts`
   - POST handler:
     - parse JSON → walidacja Zod
     - wywołaj `authService.signup(...)`
     - ustaw cookie sesyjne (Lucia: `setCookie` helper z `auth.ts`)
     - zwróć 201 + `SignupResponse`
     - błędy mapuj do ApiError z właściwym status code
6) Audyt i zdarzenia
   - Po sukcesie: audit log `create users`, `use invitation`
   - Best-effort event `signup`
7) Testy ręczne i smoke
   - Ścieżki: happy path, token invalid/expired/used, email conflict, brak zgód, słabe hasło
8) Dokumentacja
   - Opis endpointu (ten dokument) + przykłady request/response


### 10. Mapowanie błędów → kody

- 400 Bad Request:
  - invalid_invitation_token
  - invitation_expired
  - invitation_used
  - required_consents_missing
- 409 Conflict:
  - email_already_registered
- 422 Unprocessable Entity:
  - validation_failed (szczegóły z Zod)
- 500 Internal Server Error:
  - internal_server_error


### 11. Interfejsy funkcji (propozycja)

```ts
// lib/services/authService.ts
export async function signup(input: SignupRequest): Promise<SignupResponse> {}
```

```ts
// lib/repositories/userRepository.ts
export async function findByEmail(email: string): Promise<User | null> {}
export async function createUser(command: CreateUserCommand): Promise<User> {}
```

```ts
// lib/repositories/invitationRepository.ts
export async function findByToken(token: string): Promise<Invitation | null> {}
export async function markUsed(id: string, userId: string): Promise<void> {}
```

```ts
// lib/repositories/consentRepository.ts
export async function createMany(userId: string, consents: Array<{ type: string; text: string; accepted: boolean }>): Promise<void> {}
```

```ts
// src/pages/api/auth/signup.ts
export async function POST(context: APIContext) { /* parse → validate → service.signup → set session cookie → 201 */ }
```


### 12. Zgodność z regułami implementacji

- Astro SSR endpoint w `src/pages/api/...` zgodnie z obecnym projektem
- Drizzle ORM + Neon, transakcje przy tworzeniu usera i użyciu zaproszenia
- Lucia v3 do sesji (30 dni), cookie HttpOnly/Secure/SameSite=strict
- Brak rate limiting w MVP (świadomie wg decyzji)
- Reużycie istniejących modułów (`src/lib/auth.ts`, `lib/repositories/*`) i konwencji projektu


