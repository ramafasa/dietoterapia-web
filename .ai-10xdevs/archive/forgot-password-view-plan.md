## Plan implementacji widoku „Zapomniałem hasła”

## 1. Przegląd

Widok umożliwia użytkownikowi zainicjowanie procesu resetu hasła poprzez podanie adresu email. Po poprawnym złożeniu żądania UI wyświetla neutralny komunikat sukcesu, niezależnie od tego, czy konto o danym adresie istnieje. Widok jest publiczny, prosty, dostępny i bezpieczny (brak ujawniania istnienia konta).


## 2. Routing widoku

- Ścieżka docelowa: `/reset-hasla` (publiczna) — już istnieje w `src/pages/reset-hasla.astro`
- Alias (opcjonalny): `/auth/forgot-password` (przekierowanie 301 lub strona-redirect)
- Endpoint API (kanoniczny): `POST /api/auth/forgot-password` (alias istniejący: `POST /api/auth/password-reset-request`)


## 3. Struktura komponentów

```
ResetHaslaPage (Astro)
└─ Layout (Astro)
   └─ Card / Container (HTML + Tailwind)
      ├─ Heading + Intro (HTML)
      └─ PasswordResetRequestForm (React, client:load)
         ├─ EmailInput (HTML <input type="email">)
         ├─ SubmitButton
         ├─ FieldErrors (inline)
         └─ SuccessMessage (conditional)

ToastProvider (global, już w projekcie)
```


## 4. Szczegóły komponentów

### ResetHaslaPage (Astro, `src/pages/reset-hasla.astro`)
- Opis: Strona SSR z layoutem, nagłówkiem, opisem i osadzonym formularzem resetu hasła.
- Główne elementy: `Layout`, kontener z kartą, `PasswordResetRequestForm client:load`
- Obsługiwane interakcje: Brak (delegowane do formularza)
- Walidacja: Brak (delegowane do formularza)
- Typy: Brak własnych
- Propsy: Brak

### PasswordResetRequestForm (React, `src/components/PasswordResetRequestForm.tsx`)
- Opis: Formularz z jednym polem email, walidacją Zod i wysyłką żądania do API. Po sukcesie wyświetla komunikat neutralny i link do logowania.
- Główne elementy:
  - Pole email z walidacją i inline błędami
  - Przycisk „Wyślij link do resetu”
  - Komunikat sukcesu po złożeniu żądania (zastępuje formularz)
  - Link pomocniczy „Wróć do logowania”
- Obsługiwane interakcje:
  - onChange(email) — aktualizacja stanu formularza
  - onSubmit — walidacja Zod → wywołanie API → prezentacja komunikatu
  - Disabled stanu podczas `loading`
- Walidacja (szczegółowa):
  - Email: wymagany, poprawny format (Zod: `z.string().email()`)
  - Neutralny komunikat sukcesu niezależnie od istnienia konta
  - Rate limiting: poza MVP (wg Tech Stack); UI nie egzekwuje, backend opcjonalnie (później)
- Typy:
  - DTO: `ForgotPasswordRequest`, `ForgotPasswordResponse` (z `src/types.ts`)
  - ViewModel (lokalne):
    - `PasswordResetRequestInput` (Zod infer) — `{ email: string }`
    - `ForgotPasswordFormState` — `{ loading: boolean; success: boolean; errors: { email?: string } }`
    - `SubmitResult` — `{ ok: boolean; message: string }`
- Propsy: Brak (komponent samowystarczalny)

### SuccessMessage (część formularza)
- Opis: Sekcja prezentowana po wysłaniu żądania: nagłówek sukcesu, neutralny opis, link do logowania.
- Elementy: `div`, `p`, `a[href="/logowanie"]`
- Zdarzenia: Kliknięcie „Wróć do logowania” (nawigacja)
- Walidacja/Typy/Propsy: Brak


## 5. Typy

- DTO (z `src/types.ts`):
  - `ForgotPasswordRequest`: `{ email: string }`
  - `ForgotPasswordResponse`: `{ message: string }`

- ViewModel (dla widoku/formularza) — nowe lub istniejące infery z Zod:
  - `PasswordResetRequestInput` (infer z `passwordResetRequestSchema`): `{ email: string }`
  - `ForgotPasswordFormState`:
    - `loading: boolean`
    - `success: boolean`
    - `errors: { email?: string }`
  - `SubmitResult`:
    - `ok: boolean`
    - `message: string`


## 6. Zarządzanie stanem

- Lokalny stan w komponencie React:
  - `loading` — blokuje UI i przycisk podczas żądania
  - `success` — przełącza widok formularz ⇄ komunikat sukcesu
  - `formData.email` — kontrolowana wartość pola
  - `errors.email` — wynik walidacji Zod
- Opcjonalnie (refaktor po MVP): wydzielenie `useForgotPasswordRequest()`
  - API: `{ submit(email): Promise<SubmitResult>, status, error }`
  - Ułatwia testy, spójność logiczną i ewentualne reuse


## 7. Integracja API

- Endpoint: `POST /api/auth/forgot-password`
  - Alias już dostępny: `POST /api/auth/password-reset-request`
- Request (JSON, `ForgotPasswordRequest`):
  - Body: `{ "email": string }`
- Response (200, `ForgotPasswordResponse`):
  - Body: `{ "message": string }`
- Zachowanie UI (bezpieczeństwo anty-enumeracyjne):
  - Po poprawnej walidacji front powinien prezentować neutralny sukces niezależnie od treści odpowiedzi i statusu, o ile żądanie dotarło do backendu.
  - W przypadku twardej awarii sieci można również pokazać neutralny sukces, albo zademonstrować nieinwazyjny komunikat techniczny (bez sugerowania, że adres nie istnieje).


## 8. Interakcje użytkownika

- Wprowadzenie adresu email → walidacja onChange (opcjonalna) i onSubmit (wymagana)
- Kliknięcie „Wyślij link do resetu” → blokada przycisku, request do API
- Po submit: neutralny komunikat o wysłaniu linka + link do logowania
- Dodatkowo: toast sukcesu (krótki) po pozytywnym submit


## 9. Warunki i walidacja

- Email: wymagany i poprawny format (Zod `.email()`)
- Brak walidacji po stronie UI dotyczącej istnienia użytkownika (security)
- Przy błędach walidacji: czerwone obramowanie pola + komunikat pod polem
- Przy loading: disabled input i button, zamiana label przycisku na „Wysyłanie...”


## 10. Obsługa błędów

- Błędy walidacji Zod: mapowanie do `errors.email`
- Błędy sieci/serwera: UI może nadal prezentować neutralny sukces (nie ujawnia istnienia konta). Dodatkowo:
  - Opcja 1 (zalecana): zawsze `success = true` po poprawnej walidacji na froncie; ewentualnie log do konsoli i dyskretny toast techniczny.
  - Opcja 2 (aktualny stan): przy `!res.ok` — toast błędu. Do rozważenia zmiana na Opcję 1.
- Ewentualny rate limit (post‑MVP): prezentować neutralny sukces; techniczny komunikat w logach/toaście bez wskazania istnienia konta.


## 11. Kroki implementacji

1) Routing i strona
- Upewnij się, że strona `src/pages/reset-hasla.astro` istnieje i importuje `PasswordResetRequestForm` (jest).
- (Opcjonalnie) Dodaj alias `/auth/forgot-password` jako stronę-redirect lub redirect w warstwie hostingu.

2) Formularz i UX
- Pozostaw `PasswordResetRequestForm` jako główny komponent formularza. Sprawdź, czy prezentuje neutralny sukces po submit (obecnie tak — widok success zastępuje formularz).
- Zaktualizuj zachowanie submit (opcjonalnie) tak, aby po poprawnej walidacji zawsze ustawiał `success = true` niezależnie od `res.ok`, a błędy serwera obsługiwać nieinwazyjnie (log/łagodny toast). To zapewni pełną spójność z wymogiem anty-enumeracyjnym.

3) Integracja API
- Ustal endpoint kanoniczny w froncie: preferuj `POST /api/auth/forgot-password` (zgodny z dokumentacją API). Zachowaj kompatybilność z aliasem `POST /api/auth/password-reset-request` (obecnie używany).
- Request: `{ email }` po walidacji Zod; Response: `{ message }` (ignorujemy treść w UI poza tostem).

4) Walidacja i stany
- Walidacja: Zod `passwordResetRequestSchema` (już jest). Błędy mapuj do inline komunikatów.
- Stany: `loading`, `success`, `errors`, `formData.email`. Przycisk i input disabled przy `loading`.

5) Dostępność i UI
- Etykiety `label for="email"`, a11y dla przycisku i linków.
- Klawisz Enter uruchamia submit (domyślne zachowanie form).
- Responsywność: kontener `max-w-md`, przyjazne odstępy i kontrast.

6) Telemetria (opcjonalnie, po MVP)
- Zdarzenie `password_reset_request_submit` (bez PII) — zapis w event trackerze, jeśli dostępny.

7) Testy ręczne
- Scenariusze: poprawny email (200), nieistniejący email (neutralny sukces), błędny format (inline error), sieć offline (neutralny sukces lub łagodny toast), wielokrotne submity (button disabled).


---

Powyższy plan jest zgodny z PRD, dokumentacją API i aktualnym stackiem (Astro SSR, React, Tailwind, Zod). Uwzględnia istniejące komponenty i pliki w repozytorium, minimalizując prace implementacyjne i ryzyko.

