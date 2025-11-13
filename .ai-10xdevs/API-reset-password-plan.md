## API Endpoint Implementation Plan: POST /api/auth/forgot-password (Password Reset Request)

### 1. Przegląd punktu końcowego
Punkt końcowy przetwarza żądanie wygenerowania linku do resetu hasła. Zawsze zwraca odpowiedź 200, aby zapobiec enumeracji adresów e‑mail. Jeżeli konto istnieje, generuje jednorazowy token, zapisuje go w bazie, wysyła wiadomość e‑mail z linkiem resetu, a następnie rejestruje zdarzenie analityczne.

Zakładany routing:
- Publiczny endpoint: `POST /api/auth/forgot-password` (nazwa specyfikacyjna)
- W projekcie obecnie dostępny: `POST /api/auth/password-reset-request` (`src/pages/api/auth/password-reset-request.ts`)
- Rekomendacja: utrzymać istniejącą ścieżkę i (opcjonalnie) dodać alias `forgot-password` jako cienką delegację dla zgodności ze specyfikacją.

### 2. Szczegóły żądania
- **Metoda HTTP**: POST
- **URL**: ` /api/auth/forgot-password` (alias do istniejącego ` /api/auth/password-reset-request`)
- **Parametry**:
  - **Wymagane**: brak parametrów ścieżki/query
  - **Opcjonalne**: brak
- **Nagłówki**:
  - `Content-Type: application/json`
- **Request Body**:
  - Struktura (patrz `src/types.ts` → `ForgotPasswordRequest`):
  ```json
  {
    "email": "patient@example.com"
  }
  ```
  - Walidacja wejścia: Zod schema `passwordResetRequestSchema` (email jako poprawny adres).

### 3. Wykorzystywane typy
- **DTOs** (z `src/types.ts`):
  - `ForgotPasswordRequest` { email: string }
  - `ForgotPasswordResponse` { message: string }
- **Model bazy danych** (z `src/db/schema.ts`):
  - `users` (lookup po `email`)
  - `passwordResetTokens` (zapis tokenu)
  - `events` (rejestracja zdarzenia `password_reset_requested`)
- **Logika wspierająca**:
  - `generatePasswordResetToken(userId: string)` z `src/lib/tokens.ts`
  - `sendPasswordResetEmail(to, resetLink, firstName)` z `src/lib/email.ts`
  - Zod: `passwordResetRequestSchema` z `src/schemas/auth.ts`
- **Command modele** (jeśli standaryzujemy warstwę usług):
  - `CreateEventCommand` (z `src/types.ts`) – opcjonalnie do spójnego logowania zdarzeń.

### 4. Szczegóły odpowiedzi
- **Sukces (zawsze)**:
  - Status: `200 OK`
  - Body (patrz `ForgotPasswordResponse`):
  ```json
  {
    "message": "If an account exists with this email, a password reset link has been sent."
  }
  ```
  - Uwaga: treść komunikatu może być po polsku w UI; API może standaryzować angielską wersję lub polską, byle bez ujawniania istnienia konta.
- **Błędy walidacji**:
  - Status: `400 Bad Request` (zgodnie z wytycznymi globalnymi)
  - Body: `{ "error": "Invalid email format" }`
- **Błąd serwera**:
  - Status: `500 Internal Server Error`
  - Body: `{ "error": "Internal server error" }`

### 5. Przepływ danych
1. API przyjmuje `POST` z JSON `{ email }`.
2. Walidacja wejścia przez `passwordResetRequestSchema`.
3. Normalizacja: `email.toLowerCase()`.
4. Zapytanie do `users` po email:
   - Jeśli brak użytkownika → kontynuuj bez generowania tokenu; zakończ odpowiedzią 200 (eliminuje enumerację).
5. Dla istniejącego użytkownika:
   - Wygeneruj token: `generatePasswordResetToken(user.id)`:
     - Usuwa poprzednie tokeny dla użytkownika (unieważnienie).
     - Tworzy nowy rekord w `passwordResetTokens` (ważność 60 min).
   - Złóż link resetu: `${process.env.SITE_URL}/reset-hasla/${token}`.
   - Wyślij e‑mail: `sendPasswordResetEmail(email, resetLink, firstName || 'Użytkowniku')`.
   - Zarejestruj event: insert do `events` z `eventType: 'password_reset_requested'`.
6. Zwróć `200 OK` z neutralnym komunikatem.

### 6. Względy bezpieczeństwa
- **Brak enumeracji e‑maili**: zawsze `200 OK` i neutralny komunikat.
- **Tokeny jednorazowe i z wygasaniem**:
  - Inwalidacja poprzednich tokenów przed wygenerowaniem nowego.
  - Długi losowy token (`crypto.randomBytes(32).toString('hex')`).
  - Krótka ważność (60 min w `tokens.ts`).
- **Brak ujawniania PII w odpowiedzi/logach**: nie zwracać istnienia konta ani szczegółów błędów SMTP.
- **Transport e‑mail**: prawidłowa konfiguracja `nodemailer` na SMTPS (port 465, `secure: true`), credentials w `env`.
- **Rate limiting / anti‑abuse**:
  - MVP: zgodnie z decyzją stackową – pominięte.
  - Rekomendacja post‑MVP: per‑IP / per‑email ograniczenia (np. Upstash).
- **Audit/analytics**:
  - Zdarzenie `password_reset_requested` bez danych wrażliwych.
- **Konsekwencja ze zmianą hasła** (po stronie confirm endpointu): unieważnienie sesji użytkownika (już zaimplementowane w `password-reset-confirm.ts` przez Lucia).

### 7. Obsługa błędów
- **Niepoprawny JSON / brak `Content-Type`** → `400 Bad Request`.
- **Walidacja e‑mail** (niepoprawny format) → `400 Bad Request`.
- **Błąd DB podczas lookup/insert** → `500 Internal Server Error`.
- **Błąd generowania tokenu** → `500 Internal Server Error`.
- **Błąd SMTP podczas wysyłki e‑mail** → mimo błędu zwracamy `200 OK` (aby nie ujawniać istnienia konta). Błąd należy zalogować do logów serwera; opcjonalnie dodać event `password_reset_email_failed` z minimalnymi danymi (bez PII).
- **Zasoby**: Endpoint publiczny – `401` nie dotyczy.

Strategia logowania:
- Konsola/telemetria platformy (Vercel logs) z kontekstowym prefixem (np. `Password reset request error:`).
- Opcjonalnie wpis do `events` o niepowodzeniu (bez PII), aby operator miał obserwowalność.

### 8. Rozważania dotyczące wydajności
- **Indeks dla lookup po email**: w tabeli `users.email` jest `unique()` – lookup O(log n).
- **Zewnętrzny SMTP**: wysyłka e‑mail jest blokująca; w MVP akceptowalne. Post‑MVP można:
  - delegować do kolejki (np. Upstash/QStash) lub
  - uruchamiać wysyłkę w tle, zwracając odpowiedź wcześniej (z zachowaniem ostrożności w środowisku serverless).
- **Cold starts (Neon/SMTP)**: akceptowalne w MVP, monitorować.

### 9. Kroki implementacji
1. Schemat walidacji
   - Upewnić się, że `passwordResetRequestSchema` (Zod) ma poprawne komunikaty i restrykcje (już istnieje).
2. Endpoint API
   - Lokalizacja: `src/pages/api/auth/password-reset-request.ts` (już istnieje).
   - Jeśli wymagany alias zgodny z nazwą specyfikacji:
     - Dodać `src/pages/api/auth/forgot-password.ts` jako cienką delegację (re-export) do istniejącej implementacji.
3. Generowanie tokenu
   - Wykorzystać `generatePasswordResetToken` (już istnieje), który inwaliduje poprzednie tokeny i ustawia ważność.
4. Wysyłka e‑mail
   - Użyć `sendPasswordResetEmail` (już istnieje) z React Email (`src/emails/PasswordReset.tsx`) i prawidłową konfiguracją SMTP z env.
   - Zawartość maila: CTA z linkiem `${SITE_URL}/reset-hasla/${token}`.
5. Logging/analityka
   - Dodać insert do `events` (`password_reset_requested`) – już obecny.
   - Błędy rejestrować w logach serwera; opcjonalnie `password_reset_email_failed` w `events`.
6. Odpowiedzi HTTP
   - Sukces: `200` z neutralnym komunikatem (`ForgotPasswordResponse`).
   - Walidacja: `400` dla błędnego formatu e‑mail.
   - Serwer: `500` dla przypadków wyjątków niewychwyconych.
7. Konfiguracja środowiska
   - `SITE_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` – wymagane.
8. Testy
   - Test walidacji: błędny e‑mail → `400`.
   - Brak użytkownika → `200` (bez generowania tokenu).
   - Istniejący użytkownik → zapis tokenu, próba wysyłki e‑mail, event.
   - Token rotacja: poprzednie tokeny kasowane przed utworzeniem nowego.
9. Frontend/UX (po stronie formularza)
   - Formularz `PasswordResetRequestForm.tsx` już istnieje – zapewnić spójny komunikat sukcesu i obsługę błędów `400`.

### 10. Kryteria akceptacji
- Zawsze `200 OK` na poprawny JSON i poprawny/niepoprawny (format) e‑mail? Nie – dla niepoprawnego formatu zwracamy `400`, zgodnie z zasadami globalnymi.
- Dla istniejącego konta: token utworzony i zapisany, wysłany e‑mail (lub zalogowany błąd), event `password_reset_requested`.
- Dla nieistniejącego konta: brak zmian w DB, brak wysyłki, ale odpowiedź `200` z takim samym komunikatem.
- Brak ujawniania istnienia konta w odpowiedzi.
- Brak PII w logach i eventach.


