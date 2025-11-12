### API Endpoint Implementation Plan: POST /api/auth/login

## 1. Przegląd punktu końcowego

- Cel: Uwierzytelnienie użytkownika przy użyciu adresu email i hasła, utworzenie sesji (Lucia, 30 dni), ustawienie ciasteczka sesyjnego oraz zwrócenie danych użytkownika i informacji o sesji zgodnych z DTO.
- Zgodność ze specyfikacją: `POST /api/auth/login` zwraca `200 OK` i obiekt `LoginResponse` zawierający `user` i `session` (z `id` i `expiresAt`). Dodatkowo, po stronie HTTP ustawiane jest cookie sesyjne (HttpOnly).

## 2. Szczegóły żądania

- Metoda HTTP: POST
- Struktura URL: `/api/auth/login`
- Nagłówki:
  - `Content-Type: application/json`
- Parametry:
  - Wymagane w treści żądania:
    - `email: string` (format email)
    - `password: string`
  - Opcjonalne: brak
- Request Body (zgodny z `LoginRequest` z `src/types.ts`):
  - `{ "email": string, "password": string }`

## 3. Wykorzystywane typy

- DTOs (z `src/types.ts`):
  - `LoginRequest`
  - `LoginResponse`
  - `ApiError` (dla spójnych odpowiedzi błędów)
- Zod schemas (z `src/schemas/auth.ts`):
  - `loginSchema` (walidacja `email`, `password`)
- Command Modele (z `src/types.ts`):
  - `CreateEventCommand` (tracking `login_success`, `login_failed`)
  - `CreateAuditLogCommand` (opcjonalne audytowanie zmian sesji/logowania)

## 4. Szczegóły odpowiedzi

- Sukces (`200 OK`):
  - Treść: `LoginResponse`:
    - `user`: `Pick<User, 'id' | 'email' | 'role' | 'firstName' | 'lastName' | 'status'>`
    - `session`: `{ id: string; expiresAt: string }`
  - Dodatkowo: ustawione ciasteczko sesji (`Set-Cookie`) przez Lucia (`HttpOnly`, `Secure` w produkcji, `SameSite=Lax`).
- Błędy:
  - `422 Unprocessable Entity` — walidacja Zod (np. niepoprawny email, brak hasła)
  - `401 Unauthorized` — nieprawidłowy email lub hasło; także konto nieaktywne (ujednolicone komunikaty, bez enumeracji użytkowników)
  - `429 Too Many Requests` — przekroczony limit nieudanych prób (5/15 min)
  - `500 Internal Server Error` — błąd serwera/bazy danych

## 5. Przepływ danych

1. API Route (`src/pages/api/auth/login.ts`) odbiera żądanie JSON.
2. Walidacja wejścia przez `loginSchema.parse(body)`.
3. Rate limiting: `checkRateLimit(email)` bazujący na tabeli `login_attempts`:
   - Jeśli przekroczone limity: zwróć `429` z informacją o czasie odblokowania.
4. Pobranie użytkownika z DB: `users` po `email` (lowercase) z `limit(1)`.
5. Jeżeli nie znaleziono użytkownika: `recordLoginAttempt(email, false, ip, ua)` i `401 Unauthorized` (bez ujawnienia, czy konto istnieje).
6. Weryfikacja hasła: `verifyPassword(password, user.passwordHash)` (bcrypt).
7. Jeżeli hasło błędne: `recordLoginAttempt(..., false, ...)`, zapisz event `login_failed` i `401`.
8. Sprawdzenie statusu konta (`user.status`):
   - Jeśli inny niż `active`: traktuj jako nieautoryzowane i zwróć `401` (ujednolicenie kodów – bez `403`).
9. Utworzenie sesji: `lucia.createSession(user.id, {})` i cookie: `lucia.createSessionCookie(session.id)`; `cookies.set(...)`.
10. Zapis eventu `login_success` (`events`).
11. Odpowiedź `200 OK` z `LoginResponse` zgodnym z DTO:
    - `user`: minimalny bezpieczny zestaw pól
    - `session`: `{ id, expiresAt }` (pobierz `expiresAt` z tabeli `sessions` po utworzeniu lub z Lucia, jeśli dostępne)

## 6. Względy bezpieczeństwa

- Brak enumeracji użytkowników: identyczny komunikat i kod `401` dla braku konta i złego hasła.
- Rate limiting: 5 nieudanych prób w 15 minutach (tabela `login_attempts` + `checkRateLimit`/`recordLoginAttempt`).
- Ciasteczko sesji: `HttpOnly`, `Secure` w produkcji, `SameSite=Lax`; 30 dni (wg konfiguracji Lucia).
- Hasła: przechowywane wyłącznie jako hash (bcrypt, `verifyPassword`), brak logowania haseł w logach.
- Ochrona danych: zwracaj tylko minimalne pole użytkownika określone przez DTO.
- Rejestrowanie eventów analitycznych (`events`) bez wrażliwych danych (np. przy `login_failed` nie logować hasła).
- CORS/CSRF: endpoint przyjmujący JSON i ustawiający cookie HttpOnly – stosować standardowe zabezpieczenia platformy; UI korzysta z tej samej domeny, więc `SameSite=Lax` wystarcza.

## 7. Obsługa błędów

- Konsekwentny `ApiError`:
  - Struktura: `{ error: string; message?: string; statusCode?: number }` (wg `src/types.ts` można rozszerzyć o `message` i `statusCode` w odpowiedzi).
- Mapowanie wyjątków na kody:
  - Walidacja Zod → `422 Unprocessable Entity` (z polskimi komunikatami z `schemas/auth.ts`)
  - Rate limit → `429 Too Many Requests`
  - Nieprawidłowe poświadczenia / konto nieaktywne → `401 Unauthorized`
  - Błędy DB/nieoczekiwane → `500 Internal Server Error`
- Logowanie błędów:
  - `console.error` z kontekstem (bez PII/hasła)
  - Eventy: `login_failed`, `login_success` (tabela `events`)
  - Audyt (opcjonalnie): wpis do `audit_log` dla anomalii (np. wielokrotne nieudane logowania z jednego IP)

## 8. Rozważania dotyczące wydajności

- Indeks na `users.email` — już istnieje (`unique()`), wykorzystywać `limit(1)`.
- Minimalny wybór kolumn (tylko potrzebne do DTO i weryfikacji hasła).
- Jedno odczytanie użytkownika, jedna weryfikacja hasła, jedno wstawienie sesji, jedno ustawienie cookie – koszt minimalny.
- Tabela `login_attempts`: zapisy lekkie, możliwość późniejszej archiwizacji/retencji.

## 9. Etapy wdrożenia

1. Walidacja i typy
   - Upewnij się, że `loginSchema` w `src/schemas/auth.ts` pokrywa `LoginRequest`.
   - Potwierdź `LoginResponse` w `src/types.ts` i planowane pola odpowiedzi.
2. Ekstrakcja logiki do serwisu
   - Utwórz `src/lib/services/authService.ts` z funkcją `loginUser(email, password, ctx)`:
     - Walidacja (przez caller lub wewnętrznie)
     - Rate limit (`checkRateLimit`/`recordLoginAttempt`)
     - Pobranie użytkownika, weryfikacja hasła
     - Sprawdzenie statusu
     - Utworzenie sesji + cookie
     - Tracking eventów
     - Zwrócenie obiektu zgodnego z `LoginResponse` (+ cookie via ctx)
3. Aktualizacja API Route
   - W `src/pages/api/auth/login.ts`:
     - Zastąp obecną implementację wywołaniem serwisu
     - Upewnij się, że odpowiedź HTTP to `200 OK` z `LoginResponse`
     - Nadal ustawiaj cookie sesyjne przez Lucia
     - Zmień zwrotną strukturę z `{ success, redirectUrl }` na DTO: `{ user, session }`
4. Spójna obsługa błędów
   - Ustandaryzuj zwracane błędy jako `ApiError` z właściwymi kodami (`422`, `401`, `429`, `500`)
   - Dodaj mapowanie ZodError → `422`
5. Testy (zalecane)
   - Jednostkowe: poprawny login, błędne hasło, brak konta, konto nieaktywne, rate limit
   - Integracyjne: ustawienie cookie, struktura `LoginResponse`
6. UI/klient
   - Jeżeli UI (`src/components/LoginForm.tsx`) oczekuje starej odpowiedzi (`success`, `redirectUrl`), dostosuj do nowego `LoginResponse` lub zapewnij w treści odpowiedzi dodatkowe pole `redirectUrl` (opcjonalnie) – zgodnie z ustaleniem zespołu.
7. Monitoring i logowanie
   - Zostaw `console.error` dla nieoczekiwanych wyjątków
   - Eventy `login_*` w `events` bez PII
8. Dokumentacja
   - Zaktualizuj README/API docs o kształt odpowiedzi i kody błędów

## 10. Akceptacja (Definition of Done)

- Endpoint zwraca `200 OK` z `LoginResponse` (`user`, `session`) i ustawia ciasteczko sesji.
- Błędy walidacji → `422`, błędne dane logowania/nieaktywne konto → `401`, rate limit → `429`, błędy serwera → `500`.
- Brak enumeracji użytkowników; eventy `login_success`/`login_failed` zapisywane.
- Testy przechodzą; UI działa z nowym formatem odpowiedzi lub uzgodnioną kompatybilnością.
- Kod zgodny z Astro SSR, Drizzle, Lucia, Zod i konwencjami projektu.


