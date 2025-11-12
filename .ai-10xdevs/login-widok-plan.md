## Plan implementacji widoku Logowanie


## 1. Przegląd

- Celem widoku jest umożliwienie użytkownikom (pacjent, dietetyk) zalogowania się za pomocą adresu e‑mail i hasła, utworzenia sesji na 30 dni oraz bezpiecznego zarządzania błędami i stanem blokady po 5 nieudanych próbach w 15 minut.
- Widok korzysta z SSR (Astro) i komponentu wyspowego React dla formularza, integruje się z endpointem `POST /api/auth/login`, waliduje dane po stronie klienta (Zod) i prezentuje komunikaty o błędach (toast + pola formularza).
- Po zalogowaniu przekierowuje na odpowiednie ścieżki w zależności od roli użytkownika zgodnie z PRD i planem UX.


## 2. Routing widoku

- Ścieżka widoku: `/logowanie` (pliki istniejące: `src/pages/logowanie.astro`, `src/components/LoginForm.tsx`).
- Docelowe przekierowania po zalogowaniu:
  - Pacjent: `/waga` (w projekcie aktualnie `/pacjent/waga`; dopuszczalne jest zachowanie aktualnej ścieżki do czasu ujednolicenia routingu).
  - Dietetyk: `/dietetyk/dashboard` (w projekcie aktualnie `/dietetyk/pacjenci`; można utrzymać jako fallback do czasu wdrożenia dashboardu).


## 3. Struktura komponentów

```
Logowanie (Astro page) — `src/pages/logowanie.astro`
└─ Card/Container (HTML + Tailwind)
   └─ LoginForm (React island) — `src/components/LoginForm.tsx`
      ├─ EmailInput (HTML input[type=email])
      ├─ PasswordInput (HTML input[type=password] + toggle show/hide)
      ├─ SubmitButton (HTML button[type=submit] + loading)
      ├─ ForgotPasswordLink (HTML a → `/reset-hasla`)
      └─ Alert/Toast (ToastProvider globalnie, wywołania w komponencie)
```


## 4. Szczegóły komponentów

### Logowanie (Astro page)
- Opis: Strona SSR opakowująca `LoginForm` w spójny layout, tytuł i SEO.
- Główne elementy: `Layout.astro`, kontener, nagłówek, montaż `LoginForm` (`client:load`).
- Interakcje: Brak własnych; delegacja do komponentu React.
- Walidacja: Brak lokalnej walidacji; odpowiedzialność po stronie `LoginForm`.
- Typy: Brak dedykowanych; używa standardowego interfejsu dzieci.
- Propsy: Brak (statyczna strona).

### LoginForm (React)
- Opis: Formularz logowania z walidacją kliencką (Zod), wywołaniem API i obsługą stanów błędów/ładowania/lockoutu.
- Główne elementy:
  - `input[type=email]` z etykietą i błędem pola.
  - `input[type=password]` z etykietą, błędem pola oraz przełącznikiem show/hide.
  - `button[type=submit]` ze stanem `loading`.
  - Link „Zapomniałeś hasła?” → `/reset-hasla`.
  - Toasty dla błędów i sukcesu.
- Obsługiwane interakcje:
  - `onChange` pól formularza (aktualizacja stanu).
  - `onSubmit` formularza (walidacja Zod → wywołanie `POST /api/auth/login` → redirect).
  - Toggle show/hide password (zmiana typu pola, a11y).
  - Klawisz Enter (submit), nawigacja klawiaturą (Tab).
- Obsługiwana walidacja (klient):
  - `email`: format e‑mail (Zod: `z.string().email()`).
  - `password`: wymagane (Zod: `min(1)`).
  - Błędy serwera mapowane do toastów i ewentualnie komunikatu globalnego.
- Typy:
  - `LoginInput` (z `src/schemas/auth.ts`).
  - `LoginRequest`, `LoginResponse`, `ApiError` (z `src/types.ts`).
  - ViewModel (nowe, lokalne): `LoginFormState`, `LoginFormErrors` (poniżej w sekcji Typy).
- Propsy (rozszerzalność — opcjonalne):
  - `roleRedirects?: { patient: string; dietitian: string }` — nadpisanie domyślnych redirectów.
  - `onSuccessNavigate?: (url: string) => void` — hook nawigacji (ułatwia testy/e2e).


## 5. Typy

- Istniejące DTO:
  - `LoginRequest`:
    - `email: string`
    - `password: string`
  - `LoginResponse`:
    - `user: { id, email, role, firstName, lastName, status }`
    - `session: { id, expiresAt }`
  - `ApiError`:
    - `error: string`, `message: string`, `statusCode: number`
- Istniejące typy walidacji (Zod):
  - `LoginInput` — zgodny z `LoginRequest` (email, password).
- Nowe typy ViewModel (frontend, lokalne dla widoku):
  - `LoginFormState`:
    - `email: string`
    - `password: string`
    - `showPassword: boolean`
    - `loading: boolean`
  - `LoginFormErrors`:
    - `email?: string`
    - `password?: string`
    - `submit?: string` (globalny błąd API)
  - `RateLimitInfo` (opcjonalnie, jeśli chcemy wyświetlać precyzyjną informację o blokadzie; parsowane z `ApiError.message`):
    - `lockedUntil?: Date`
    - `remainingAttempts?: number`


## 6. Zarządzanie stanem

- Lokalny stan w `LoginForm` przez `useState`:
  - `formData` (`LoginFormState` bez flag): e‑mail, hasło.
  - `errors` (`LoginFormErrors`): błędy Zod i globalne błędy API.
  - `loading` (bool): blokuje pola i przycisk, pokazuje stan „Logowanie...”
  - `showPassword` (bool): przełącznik widoczności hasła.
- Autofocus na polu e‑mail (po montażu) — a11y i UX.
- Brak wymogu globalnego store (widok jest prosty, izolowany).


## 7. Integracja API

- Endpoint: `POST /api/auth/login`
- Request (JSON): `LoginRequest` (`email`, `password`).
- Response (200): `LoginResponse` (ustawia httpOnly cookie z sesją — realizowane na backendzie przez Lucia).
- Errors:
  - 401 Unauthorized — generuj komunikat ogólny „Nieprawidłowy email lub hasło” (bez ujawniania, co jest niepoprawne).
  - 429 Too Many Requests — blokada po 5 nieudanych próbach/15 min; komunikat z `lockedUntil` w `ApiError.message` (już implementowane w backendzie).
  - 422 Unprocessable Entity — błąd walidacji wejścia; mapowanie błędów z Zod po stronie klienta (kluczowo e‑mail i password).
  - 500 Internal Server Error — „Wystąpił błąd. Spróbuj ponownie.”
- Frontendowe akcje:
  - On success: toast sukcesu + redirect wg roli.
  - On error: toast błędu + ewentualne przypięcie błędów do pól.


## 8. Interakcje użytkownika

- Wpisywanie e‑mail/hasło → walidacja natychmiastowa przy submit.
- Kliknięcie „Zaloguj się” lub Enter → submit, blokada UI w trakcie żądania.
- Toggle „pokaż/ukryj hasło” → zmiana typu inputu `password/text` z kontrolką dostępną klawiaturą.
- Kliknięcie „Zapomniałeś hasła?” → nawigacja do `/reset-hasla`.
- Po sukcesie: przekierowanie wg roli; pacjent → `/waga`, dietetyk → `/dietetyk/dashboard` (z fallbackiem do istniejących ścieżek).


## 9. Warunki i walidacja

- Klient (Zod):
  - `email`: poprawny format e‑mail.
  - `password`: wymagane.
- Serwer (już dostępne w `src/pages/api/auth/login.ts`):
  - 401 dla błędnych danych lub nieaktywnego statusu.
  - 429 przy przekroczeniu limitu (5/15min) — `lockedUntil` w komunikacie.
  - 422 dla błędów walidacji wejścia.
- UI reaguje:
  - Podkreślenie błędnych pól (czerwone obramowanie + opis błędu).
  - Toasty dla błędów globalnych (401/429/500).
  - Disabled controls podczas `loading`.


## 10. Obsługa błędów

- 401 Unauthorized: toast z komunikatem ogólnym, wyczyszczenie pola hasła.
- 429 Too Many Requests: toast z informacją o blokadzie do godziny wskazanej w `ApiError.message`; opcjonalnie lekki baner pod przyciskiem do odczytu.
- 422 Validation: mapowanie błędów Zod → pod polem e‑mail/hasło.
- 500 Internal: toast „Wystąpił błąd. Spróbuj ponownie.”
- Błędy sieciowe/JSON: fallback toast „Wystąpił błąd połączenia. Spróbuj ponownie.”
- A11y: role=alert dla komunikatów błędów powiązanych z polami + `aria-describedby`.


## 11. Kroki implementacji

1. Routing i layout
   - Potwierdź i pozostaw stronę pod `/logowanie` (`src/pages/logowanie.astro`).
   - Upewnij się, że `ToastProvider` jest zainicjalizowany globalnie (już jest w projekcie).
2. Formularz i a11y
   - W `LoginForm.tsx` dodaj:
     - Autofocus na polu e‑mail po montażu.
     - Przełącznik show/hide password (ikonowy lub tekstowy, z `aria-pressed` i etykietą).
     - `aria-invalid`, `aria-describedby` dla błędów pól.
3. Walidacja klienta
   - Upewnij się, że walidacja Zod (`loginSchema`) jest stosowana przed wywołaniem API i błędy są mapowane do `errors`.
4. Integracja API
   - Obsłuż statusy: 401/429/422/500 z mapowaniem do UI (toast + pola).
   - Dla 429 wyodrębnij godzinę z `ApiError.message` i wyświetl w user-friendly formacie (pl‑PL).
5. Przekierowania po zalogowaniu
   - Zgodnie z PRD: pacjent → `/waga`, dietetyk → `/dietetyk/dashboard`.
   - Do czasu istnienia docelowych tras utrzymaj fallback: pacjent → `/pacjent/waga`, dietetyk → `/dietetyk/pacjenci`.
   - Wyodrębnij redirecty do konfiguracji komponentu (props `roleRedirects`) dla łatwiejszej zmiany w przyszłości.
6. Stany i UX
   - Zablokuj pola i przycisk podczas `loading`.
   - Resetuj pole hasła po 401.
7. Testy ręczne (happy/edge paths)
   - Poprawne logowanie (obie role) → redirect + cookie sesji.
   - Błędne hasło 5x → 429 po 5. próbie; powrót do allowed po 15 min (lub skrócony czas na środowisku deweloperskim).
   - 422 (puste pola/nieprawidłowy e‑mail) → błędy przy polach.
   - 500 (symulacja) → toast ogólny.
8. Dostępność
   - Sprawdź focus order, Enter submit, role/aria, kontrasty, czytelność komunikatów.
9. Utrzymanie i rozszerzalność
   - Zadbaj o możliwość podmiany ścieżek redirectów bez zmian w logice.
   - Dodaj małe utilsy do formatowania daty `lockedUntil` (np. `toLocaleTimeString('pl-PL')`) jeśli będziemy ją prezentować w UI.


---

Wdrożenie powyższego planu zapewnia zgodność z PRD (sesja 30 dni, blokada po 5 próbach/15 min), user story US‑003 oraz integrację z istniejącym backendem i stackiem (Astro SSR, React, Zod, Lucia, Drizzle). *** End Patch***%  ?>" /> codeinput to=functions.apply_patch /Subthreshold to=functions.apply_patch code=*** Begin Patch

