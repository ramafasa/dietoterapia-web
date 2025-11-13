## Plan implementacji widoku Reset Hasła

## 1. Przegląd

Widok służy do ustawienia nowego hasła przez użytkownika po kliknięciu w link z e‑maila resetującego hasło. Link zawiera jednorazowy token ważny przez 60 minut. Po pomyślnej zmianie hasła wszystkie aktywne sesje użytkownika mają zostać unieważnione, a użytkownik powinien zostać przekierowany do ekranu logowania z komunikatem sukcesu.


## 2. Routing widoku

- Ścieżka: `/reset-hasla?token={reset_token}`
- Dostęp: publiczny (z ważnym tokenem w query param)
- SSR: strona renderowana jako Astro page z wyspą React dla formularza


## 3. Struktura komponentów

- `src/pages/reset-hasla/index.astro` (lub `src/pages/reset-hasla.astro` jeśli preferowana płaska struktura)
  - `PasswordResetConfirmForm` (React Island; istniejąca lub nowa implementacja)
    - `PasswordStrengthIndicator` (nowy komponent)
    - `Alert` (UI na błędy/ostrzeżenia; można użyć istniejącego wzorca)
    - `Button`, `Input` (istniejące style Tailwind)

Drzewo (wysoki poziom):

```
Page (/reset-hasla)
└─ Layout.astro
   └─ Section
      └─ PasswordResetConfirmForm (React)
         ├─ Input (New Password)
         ├─ Input (Confirm Password)
         ├─ PasswordStrengthIndicator
         ├─ Alert (token error / validation)
         └─ Button (Ustaw nowe hasło)
```


## 4. Szczegóły komponentów

### PasswordResetConfirmForm

- Opis: Formularz ustawienia nowego hasła. Odczytuje `token` z query params, waliduje dane wejściowe, wywołuje `POST /api/auth/reset-password`, obsługuje błędy i sukces (redirect do logowania).
- Główne elementy:
  - `Input` typu `password` dla „Nowe hasło”
  - `Input` typu `password` dla „Potwierdź hasło”
  - `PasswordStrengthIndicator` z checklistą reguł
  - `Alert` na błędy (invalid/expired token, 422 walidacja, 500)
  - `Button` „Ustaw nowe hasło” (disabled podczas submit)
- Obsługiwane interakcje:
  - OnChange na polach hasła i potwierdzenia
  - Submit (kliknięcie przycisku / Enter)
  - Po sukcesie: redirect do `/logowanie` i toast sukcesu
- Obsługiwana walidacja (client-side, zgodnie z API):
  - `newPassword`: min. 8 znaków; co najmniej jedna wielka litera, mała litera i cyfra (spójnie z serwerem)
  - `confirmPassword`: musi być identyczne z `newPassword`
  - `token`: wymagany param w URL; jeśli brak → blokada submitu i komunikat z linkiem do `/reset-hasla` (żądanie nowego linku)
- Typy:
  - DTO: `ResetPasswordRequest`, `ResetPasswordResponse` z `src/types.ts`
  - ViewModel: `ResetPasswordFormData`, `ResetPasswordFormErrors` (opis w sekcji Typy)
- Propsy (od rodzica – zazwyczaj brak, poza opcjonalnym `onSuccess`):
  - `onSuccess?: () => void` (opcjonalne, do testów/e2e lub dalszych akcji)

### PasswordStrengthIndicator

- Opis: Prezentuje siłę hasła w oparciu o spełnione reguły oraz prosty score (0–4).
- Główne elementy:
  - Lista reguł z checkami: min. 8 znaków, wielka litera, mała litera, cyfra, (opcjonalnie) znak specjalny
  - Pasek/etykieta siły (np. „Słabe / Średnie / Mocne”)
- Obsługiwane interakcje:
  - Re-render na zmianę `password`
- Walidacja:
  - Brak walidacji własnej – wskazówka UX; walidacja formalnie w formularzu i na backendzie
- Typy:
  - ViewModel: `PasswordStrength`, `PasswordStrengthRule`
- Propsy:
  - `password: string`

### Alert (błędy i stany)

- Opis: Komponent informujący o błędach tokenu, walidacji, błędach sieci oraz sukcesach (opcjonalnie toast).
- Główne elementy:
  - Obszar tekstowy + stylowanie statusów (`error`, `info`, `success`)
- Obsługiwane interakcje:
  - Zamknięcie (opcjonalnie)
- Walidacja:
  - Prezentacyjna – wyświetla treść błędu otrzymaną z formularza/serwera
- Propsy:
  - `variant: 'error' | 'info' | 'success'`
  - `message: string`


## 5. Typy

Istniejące DTO (z `src/types.ts`):

- `ResetPasswordRequest`:
  - `token: string`
  - `newPassword: string`
- `ResetPasswordResponse`:
  - `message: string`

Nowe typy ViewModel (lokalne dla widoku/komponentów):

```ts
// Dane formularza resetu
type ResetPasswordFormData = {
  newPassword: string
  confirmPassword: string
  token: string // z query param
}

// Błędy formularza resetu
type ResetPasswordFormErrors = {
  newPassword?: string
  confirmPassword?: string
  token?: string
  submit?: string // błąd ogólny/API
}

// Reguła siły hasła
type PasswordStrengthRule = {
  id: 'minLength' | 'hasUpper' | 'hasLower' | 'hasDigit' | 'hasSpecial'
  label: string
  satisfied: boolean
}

// Siła hasła (do wskaźnika)
type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4
  rules: PasswordStrengthRule[]
  label: 'Bardzo słabe' | 'Słabe' | 'Średnie' | 'Dobre' | 'Mocne'
}
```


## 6. Zarządzanie stanem

- Lokalny stan w `PasswordResetConfirmForm`:
  - `formData: ResetPasswordFormData`
  - `errors: ResetPasswordFormErrors`
  - `isSubmitting: boolean`
  - `strength: PasswordStrength`
- Custom hooki:
  - `usePasswordStrength(password: string) => PasswordStrength` (oblicza reguły i score)
  - `useQueryParam(name: string) => string | null` (bezpośrednio z `location.search`/`URLSearchParams`)
  - `useAsyncSubmit` (opcjonalnie: zarządzanie stanami pending/success/error w jednym miejscu)


## 7. Integracja API

- Endpoint: `POST /api/auth/reset-password`
- Request (typ): `ResetPasswordRequest`
  - Body: `{ token, newPassword }`
- Response (200): `ResetPasswordResponse`
  - Body: `{ message: string }`
- Błędy:
  - 400: `invalid_token` lub „weak password” (po stronie serwera może być 400; w implementacji mamy 400 dla tokenu i 422 dla walidacji Zod)
  - 422: `validation_error` (np. brak pól, błędne typy; z `ZodError`)
  - 500: `server_error`
- Frontendowe mapowanie odpowiedzi:
  - 200 → toast sukcesu, redirect do `/logowanie`
  - 400 (`invalid_token`) → komunikat błędu i link do `/reset-hasla` (ponowienie procesu)
  - 422 → wyświetlenie pierwszego błędu walidacji
  - 500 → ogólny komunikat o błędzie, spróbuj ponownie


## 8. Interakcje użytkownika

- Użytkownik wchodzi na `/reset-hasla?token=...`
  - Jeśli brak `token` w URL → widoczny alert z prośbą o ponowne rozpoczęcie procesu (`/reset-hasla`), przycisk „Wyślij ponownie link” (link do formularza żądania resetu)
- Wpisywanie `newPassword`:
  - Live feedback w `PasswordStrengthIndicator`
  - Jeśli nie spełnia reguł → przycisk submit może być aktywny, ale po submit pojawi się błąd (soft block lub twarda blokada – rekomendowany twardy warunek: disabled dopóki minimalne reguły nie są spełnione)
- Wpisywanie `confirmPassword`:
  - Natychmiastowa walidacja dopasowania do `newPassword`
- Submit:
  - Disabled podczas przetwarzania
  - Po 200 → toast sukcesu i redirect do `/logowanie`
  - Po 400/422/500 → odpowiedni `Alert`


## 9. Warunki i walidacja

- Warunki w UI (client-side):
  - `token` obecny w query param (wymagany do submitu)
  - `newPassword` spełnia reguły: min. 8, mała litera, wielka litera, cyfra (opcjonalnie znak specjalny – wskazówka UX, ale nie wymagane jeśli serwer tego nie wymusza)
  - `confirmPassword` identyczne z `newPassword`
- Walidacja server-side (źródło prawdy):
  - Token ważny, niezużyty, nieprzedawniony
  - `newPassword` zgodne ze schematem (`resetPasswordSchema`)
- Wpływ na UI:
  - Niespełnione reguły → błędy formularza, disable submit, czerwone komunikaty przy polach
  - Brak tokenu → alert blokujący (z call‑to‑action do `/reset-hasla`)


## 10. Obsługa błędów

- Brak `token` w URL → Alert „Brak tokenu resetu. Poproś o nowy link.” + link do `/reset-hasla`
- `400 invalid_token` → Alert „Token nieprawidłowy lub wygasł. Poproś o nowy link.” + link CTA
- `422 validation_error` → Pokaż pierwszy błąd ze schematu (np. „Hasło jest za krótkie”)
- `500 server_error` lub błąd sieci → Alert „Nieoczekiwany błąd. Spróbuj ponownie.”
- Dostępność:
  - ARIA dla alertów i komunikatów błędów
  - Klawisz Enter uruchamia submit


## 11. Kroki implementacji

1) Routing i strona
   - Upewnij się, że istnieje strona `src/pages/reset-hasla/index.astro` (lub analogiczna) obsługująca query param `token`.
   - Osadź w niej wyspę React: `PasswordResetConfirmForm`.

2) Formularz
   - Zaimplementuj/wykorzystaj istniejący `PasswordResetConfirmForm.tsx` w `src/components`.
   - Wczytaj `token` z `URLSearchParams`; ustaw w stanie `formData.token`.
   - Dodaj pola: `newPassword`, `confirmPassword`, maskowanie, ewentualnie toggle widoczności.

3) Wskaźnik siły hasła
   - Dodaj `PasswordStrengthIndicator.tsx` z checklistą reguł i labelką siły.
   - Stwórz `usePasswordStrength(password)`.

4) Walidacja client-side
   - Reguły: min. 8, mała, wielka, cyfra, confirm match.
   - Blokuj submit, gdy warunki nie są spełnione lub brak tokenu.

5) Integracja API
   - `fetch('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword }) })`
   - Mapowanie odpowiedzi wg sekcji 7.

6) UX sukcesu i przekierowanie
   - Po 200 → toast „Hasło zmienione. Zaloguj się nowym hasłem.”
   - Redirect do `/logowanie`.

7) UX błędów
   - `invalid_token` → CTA do `/reset-hasla` (ponowne żądanie linku).
   - `validation_error` → przypisz komunikat do odpowiedniego pola (np. newPassword).

8) Instrumentacja (opcjonalnie)
   - Po sukcesie można wysłać event UI (serwer i tak zapisuje `password_reset_completed`).

9) Dostępność i responsywność
   - Focus states, aria‑label na przycisku.
   - Mobile‑first, min. 360px szerokości.

10) Testy manualne
   - Scenariusze: brak tokenu, wygasły token, słabe hasło, sukces, błąd 500.
   - Sprawdź redirect i toasty.


## Załączniki referencyjne (krytyczne powiązania)

- Endpoint: `POST /api/auth/reset-password` (serwer unieważnia sesje i loguje event)
- DTO: `ResetPasswordRequest` / `ResetPasswordResponse` (`src/types.ts`)
- PRD – US‑005: Reset hasła (60 min ważność tokenu, unieważnienie sesji, eventy)


