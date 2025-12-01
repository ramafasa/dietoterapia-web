## API Endpoint Implementation Plan: POST /api/auth/reset-password

### 1. Przegląd punktu końcowego

Punkt końcowy resetuje hasło użytkownika na podstawie jednorazowego tokena przesłanego w mailu resetującym. Po pomyślnym ustawieniu nowego hasła unieważnia wszystkie istniejące sesje użytkownika. Endpoint jest dostępny bez uwierzytelnienia (publiczny), chroniony przez ważność i jednorazowość tokena.

### 2. Szczegóły żądania

- Metoda HTTP: POST
- Struktura URL: `/api/auth/reset-password`
- Nagłówki:
  - `Content-Type: application/json`
- Parametry:
  - Wymagane (body):
    - `token` (string): jednorazowy token resetu hasła (ważny przez 60 minut).
    - `newPassword` (string): nowe hasło użytkownika.
  - Opcjonalne: brak
- Body (JSON):
```json
{
  "token": "reset_token_abc123",
  "newPassword": "NewSecurePass456"
}
```

### 3. Wykorzystywane typy

- DTO:
  - `ResetPasswordRequest` (`{ token: string; newPassword: string }`)
  - `ResetPasswordResponse` (`{ message: string }`)
  - `ApiError` (`{ error: string; message: string; statusCode: number }`)
- Modele DB:
  - `users` (pola: `id`, `passwordHash`, `updatedAt`)
  - `passwordResetTokens` (pola: `userId`, `token`, `expiresAt`, `usedAt`)
- Command modele (wewnętrzne, opcjonalne):
  - `CreateEventCommand` (do analityki zdarzeń, jeśli rejestrujemy eventy)
  - `CreateAuditLogCommand` (do audytu zmian, jeśli chcemy odnotować aktualizację hasła bez ujawniania treści)

### 4. Szczegóły odpowiedzi

- 200 OK
  - Body:
  ```json
  {
    "message": "Password reset successfully. Please log in with your new password."
  }
  ```
- Kody błędów:
  - 400 Bad Request
    - `Invalid or expired token`
    - `Password too short (<8 characters)`
  - 422 Unprocessable Entity
    - Błędy walidacji schematu (np. brak pól, zły typ)
  - 500 Internal Server Error
    - Nieoczekiwany błąd serwera/bazy

### 5. Przepływ danych

1. Odbierz żądanie i sparsuj JSON.
2. Walidacja Zod:
   - `token`: non-empty string
   - `newPassword`: string, minimalnie 8 znaków; (opcjonalnie) dodatkowe reguły złożoności.
3. Sprawdź token:
   - Użyj `validatePasswordResetToken(token)`:
     - token istnieje,
     - `expiresAt >= now`,
     - `usedAt IS NULL`.
   - W przypadku nieważnego/zużytego tokena → 400.
4. Hashuj hasło: `hashPassword(newPassword)`.
5. Transakcja DB:
   - Zaktualizuj `users.passwordHash` oraz `users.updatedAt` dla `userId` z tokena.
   - Oznacz token jako użyty: `markTokenAsUsed(token)`.
6. Unieważnij wszystkie sesje użytkownika: `lucia.invalidateUserSessions(userId)`.
7. (Opcjonalnie) Zarejestruj event analityczny `password_reset_completed` z minimalnymi właściwościami (bez PII hasła).
8. Zwróć 200 OK z komunikatem sukcesu.

Uwaga: Endpoint nie wymaga aktywnej sesji; opiera się w pełni na ważności tokena.

### 6. Względy bezpieczeństwa

- Token resetu:
  - Jednorazowy i czasowy (60 min).
  - Przed wygenerowaniem nowego tokena unieważniaj poprzednie (już zaimplementowane).
- Unieważnienie sesji:
  - Po ustawieniu nowego hasła wykonaj `lucia.invalidateUserSessions(userId)` (ochrona w przypadku wcześniejszych wycieków).
- Brak wycieku informacji:
  - Zwracaj ogólny komunikat przy błędach tokena (`Invalid or expired token`), bez ujawniania, czy dany token istnieje.
- Hasło:
  - Hashuj `bcrypt` (SALT_ROUNDS=10).
  - Nie loguj i nie zapisuj w żadnym miejscu hasła w postaci jawnej.
- CSRF:
  - Żądanie typu POST z JSON; ponieważ to endpoint bez sesji, ryzyko CSRF jest ograniczone.
- Rate limiting:
  - Wyłączony w MVP (zgodnie z decyzją stackową); można dodać post‑MVP.
- Audit:
  - Jeśli rejestrujemy w `audit_log`, nie zapisuj `before/after` pełnych hashy; zamiast tego przechowuj znacznik typu `passwordHashUpdated: true`.

### 7. Obsługa błędów

- 400 Bad Request:
  - Token nieprawidłowy, wygasły lub użyty.
  - Zbyt krótkie hasło.
- 422 Unprocessable Entity:
  - Nieprawidłowa struktura body (np. brak pól, zły typ).
- 500 Internal Server Error:
  - Wyjątki DB, błąd transakcji, błąd kryptograficzny.
- Rejestrowanie:
  - `console.error` z `requestId`/`timestamp` (bez PII).
  - (Opcjonalnie) `events` z `eventType: 'password_reset_failed'` i minimalnymi danymi technicznymi (bez email/hasła).

### 8. Rozważania dotyczące wydajności

- Indeksy:
  - `passwordResetTokens.token` ma `unique()`, szybkie lookupy po tokenie.
- Transakcja:
  - Zmiana hasła + oznaczenie tokena jako użytego wykonaj w jednej transakcji.
- Połączenia:
  - Operacje są krótkie; brak długich zapytań. Koszt głównie w hashowaniu `bcrypt` (akceptowalne dla pojedynczych wywołań).

### 9. Etapy wdrożenia

1. Schemat walidacji
   - Dodaj nowy schemat w `src/schemas/auth.ts`:
     - `resetPasswordSchema = z.object({ token: z.string().min(1), newPassword: z.string().min(8) })`
     - Eksportuj typ: `type ResetPasswordInput = z.infer<typeof resetPasswordSchema>`
   - Alternatywnie: zaktualizuj istniejący `passwordResetConfirmSchema`, aby używał pól `token` i `newPassword`, a starsze użycie zmapuj w UI.
2. Endpoint API
   - Utwórz `src/pages/api/auth/reset-password.ts` z `export const POST: APIRoute = async (...) => { ... }`.
   - Kroki w handlerze:
     - Parsuj i waliduj `resetPasswordSchema`.
     - `validatePasswordResetToken(token)` → jeśli fail: 400.
     - `hashPassword(newPassword)`.
     - Transakcja:
       - Update `users.passwordHash`, `users.updatedAt`.
       - `markTokenAsUsed(token)`.
     - `lucia.invalidateUserSessions(userId)`.
     - (Opcjonalnie) `events.insert({ eventType: 'password_reset_completed', userId })`.
     - Zwróć 200 z `ResetPasswordResponse`.
3. Spójność z istniejącym kodem
   - Mamy `src/pages/api/auth/password-reset-confirm.ts`. Zdecyduj:
     - Albo zastępujemy go nowym `reset-password.ts` i deprecjonujemy stary endpoint w UI,
     - Albo utrzymujemy oba (mapując pola), ale preferujemy `/api/auth/reset-password` zgodnie ze specyfikacją DTO.
4. Frontend
   - Komponent `PasswordResetConfirmForm.tsx`:
     - Wysyłaj do `/api/auth/reset-password` i body `{ token, newPassword }`.
     - Zaktualizuj schemat po stronie klienta, by wspierał `newPassword` (spójnie z backend).
5. Testy ręczne (smoke)
   - Generacja tokena (poprzez `/api/auth/forgot-password` flow).
   - Próba z poprawnym tokenem (sukces 200).
   - Próba z zużytym/wygasłym tokenem (400).
   - Próba z za krótkim hasłem (400 lub 422 zgodnie z walidacją).
   - Weryfikacja, że wcześniejsza sesja została unieważniona (wymuszone wylogowanie).
6. Monitoring i logi
   - Upewnij się, że błędy są logowane z kontekstem, bez PII.
   - (Opcjonalnie) zdarzenia `password_reset_completed` / `password_reset_failed`.
7. Dokumentacja
   - Zaktualizuj wewnętrzne README/API docs o nowy endpoint i przykładowe wywołania.

### 10. Przykładowe odpowiedzi błędów

- 400 Invalid token:
```json
{
  "error": "invalid_token",
  "message": "Invalid or expired token",
  "statusCode": 400
}
```

- 400 Weak password:
```json
{
  "error": "weak_password",
  "message": "Password too short (<8 characters)",
  "statusCode": 400
}
```

- 422 Validation error:
```json
{
  "error": "validation_error",
  "message": "Invalid request body",
  "statusCode": 422
}
```

- 500 Server error:
```json
{
  "error": "server_error",
  "message": "Unexpected server error",
  "statusCode": 500
}
```


