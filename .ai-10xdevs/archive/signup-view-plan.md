## Plan implementacji widoku Rejestracja (Signup)


### 1. Przegląd
Widok rejestracji pacjenta na podstawie zaproszenia e‑mailowego. Użytkownik wprowadza dane profilu, hasło oraz wymagane zgody RODO. Po pomyślnej rejestracji otrzymuje sesję (30 dni) i zostaje automatycznie zalogowany oraz przekierowany do widoku powitalnego w module „Waga”.


### 2. Routing widoku
- Ścieżka: `/auth/signup?token={invitation_token}`
- Dostęp: publiczny, ale tylko z ważnym tokenem zaproszenia (walidacja po stronie UI + SSR)
- SSR: `prerender = false` (zgodnie z projektem; sesje i cookies są istotne)
- Wejście na widok powinno najpierw sprawdzić ważność tokenu:
  - Jeśli token jest nieważny/wyczerpany → przekierowanie do strony błędu/komunikatu (np. `/auth/invitation-invalid`), lub wyświetlenie pełnoekranowego komunikatu błędu z CTA „Poproś o nowe zaproszenie”.


### 3. Struktura komponentów
- `pages/auth/signup.astro` (SSR, kontener strony)
  - `SignupForm` (React, główny formularz)
    - `Alert` (komunikaty błędów globalnych)
    - Pola formularza (kontrolowane):
      - `Input` (email – readonly)
      - `Input` (firstName)
      - `Input` (lastName)
      - `Input[type=number]` (age – opcjonalne)
      - `Select` (gender – opcjonalne: male/female/other)
      - `Input[type=password]` (password) + `PasswordStrengthIndicator`
    - `ConsentAccordion` (lista zgód z treścią i checkboxami)
    - `Button` „Utwórz konto” (disabled do spełnienia wymogów)


### 4. Szczegóły komponentów
#### SignupForm
- Opis: Formularz rejestracji z walidacją i integracją z API. Wyświetla email z zaproszenia jako readonly. Blokuje wysyłkę dopóki wymagane zgody nie są zaakceptowane i walidacja nie przejdzie.
- Główne elementy:
  - Header z tytułem (np. „Załóż konto”)
  - `Alert` do błędów globalnych (np. 400/409/500)
  - Sekcja danych osobowych: firstName, lastName, age, gender
  - Sekcja bezpieczeństwa: password + `PasswordStrengthIndicator`
  - Sekcja zgód: `ConsentAccordion` z checkboxami
  - Stopka formularza: przycisk „Utwórz konto”
- Obsługiwane interakcje:
  - Wpisywanie/zmiana wartości pól
  - Rozwijanie treści zgód
  - Zaznaczanie/odznaczanie zgód
  - Submit (Enter/kliknięcie)
- Obsługiwana walidacja (zgodna z API i PRD):
  - Email: readonly, pochodzi z walidacji zaproszenia
  - Password: min. 8 znaków
  - FirstName/LastName: wymagane, niepuste (trymowanie spacji)
  - Age: opcjonalne; jeśli podane → liczba dodatnia, rozsądny zakres (np. 10–120) – UI soft-validate
  - Gender: opcjonalne; jeśli podane → jeden z: `male | female | other`
  - Consents: wymagane checkboksy dla `data_processing` oraz `health_data` (akceptacja true). Brak akceptacji → disabled submit + inline error.
- Typy (DTO i VM):
  - DTO request/response: `SignupRequest`, `SignupResponse`, `ApiError`
  - VM formularza: `SignupFormVM`, `SignupFormErrors`, `ConsentItemVM`, `SignupUIState` (sekcja 5)
- Propsy:
  - `token: string` — z query string
  - `email: string` — z `GET /api/invitations/:token`
  - `expiresAt?: string | null` — do komunikatu (np. „Zaproszenie ważne do ...”)

#### ConsentAccordion
- Opis: Lista wymaganych i opcjonalnych zgód z możliwością rozwinięcia treści. Zawiera checkboxy, zarządza zmianami stanu.
- Główne elementy:
  - Tytuł sekcji (np. „Zgody RODO”)
  - Elementy akordeonu: każdy z tytułem, rozwijaną treścią i checkboxem
- Obsługiwane interakcje:
  - Rozwiń/zwiń poszczególne zgody
  - Zaznacz checkbox → aktualizacja stanu `consents`
- Walidacja:
  - Wymagane: `data_processing`, `health_data` muszą mieć `accepted: true`
- Typy: `ConsentItemVM`
- Propsy:
  - `items: ConsentItemVM[]`
  - `onChange(items: ConsentItemVM[]): void`


### 5. Typy

#### DTO (z `src/types.ts`)
- `SignupRequest`:
  - `invitationToken: string`
  - `email: string`
  - `password: string`
  - `firstName: string`
  - `lastName: string`
  - `age?: number`
  - `gender?: 'male' | 'female' | 'other'`
  - `consents: Array<{ type: string; text: string; accepted: boolean }>`
- `SignupResponse`:
  - `user: { id, email, role, firstName, lastName, age, gender, status }`
  - `session: { id: string; expiresAt: string }`
- `ApiError`:
  - `{ error: string; message: string; statusCode: number }`
- `ValidateInvitationResponse`:
  - `{ valid: boolean; email: string; expiresAt: Date | null }`

#### ViewModel (nowe, na potrzeby widoku)
- `SignupFormVM`:
  - `email: string` — readonly
  - `firstName: string`
  - `lastName: string`
  - `age?: string` — trzymane jako string w input (konwersja przed submit)
  - `gender?: 'male' | 'female' | 'other' | ''`
  - `password: string`
  - `consents: ConsentItemVM[]`
- `ConsentItemVM`:
  - `type: 'data_processing' | 'health_data' | string`
  - `text: string`
  - `accepted: boolean`
  - `required: boolean`
  - `expanded?: boolean`
- `SignupFormErrors`:
  - `email?: string`
  - `firstName?: string`
  - `lastName?: string`
  - `age?: string`
  - `gender?: string`
  - `password?: string`
  - `consents?: string`
  - `submit?: string` — błąd globalny (np. z API)
- `SignupUIState`:
  - `isLoading: boolean`
  - `isSubmitDisabled: boolean`
  - `serverError: string | null`


### 6. Zarządzanie stanem
- W `SignupForm` lokalny stan kontrolowany przez `useState`:
  - `form: SignupFormVM`
  - `errors: SignupFormErrors`
  - `ui: SignupUIState`
- Hooki:
  - `usePasswordStrength(password)` — istniejący hook do wskazania siły hasła (wizualizacja i drobne hinty)
  - `useEffect` do:
    - inicjalizacji formularza po walidacji tokenu (ustawienie email, domyślnych zgód)
    - aktualizacji `isSubmitDisabled` na bazie warunków (wymagane zgody, min. długość hasła, wypełnione wymagane pola)
- Brak globalnego store potrzebnego dla tego widoku; dane są specyficzne dla formularza.


### 7. Integracja API
- Walidacja tokenu (on-load):
  - `GET /api/invitations/:token` → `ValidateInvitationResponse`
  - Po sukcesie: wypełnij `email` i wyświetl ewentualnie informację o `expiresAt`
  - Po błędzie/invalid: pokaż komunikat i CTA do ponownego zaproszenia / przekieruj
- Rejestracja (on-submit):
  - `POST /api/auth/signup` z `SignupRequest`
  - Body:
    - `invitationToken` — z query param
    - `email` — z walidacji zaproszenia
    - `password`, `firstName`, `lastName`, `age? (number)`, `gender?`
    - `consents` — dwa wymagane typy muszą mieć `accepted: true`
  - Odpowiedź `201`:
    - Backend tworzy sesję (Lucia) i ustawia cookie przez `setSessionCookie` — UI nie musi nic robić z tokenem sesji
    - Redirect do `/waga/welcome` (lub do `/waga` jeśli strona powitalna jest inaczej nazwana)
  - Odpowiedzi błędów:
    - `400` invalid/expired invitation lub brak wymaganych zgód → komunikat inline
    - `409` email już zarejestrowany → komunikat pod polem/alert
    - `422` walidacja Zod → rozbicie błędów na pola
    - `500` błąd ogólny → `Alert` + retry CTA


### 8. Interakcje użytkownika
- Wpisywanie danych w pola: natychmiastowa walidacja bazowa (required, min length, typ liczbowy)
- Zaznaczanie zgód: odblokowuje przycisk „Utwórz konto” dopiero po spełnieniu wymagań
- Klik „Utwórz konto”: pokazuje stan ładowania, wysyła request, blokuje ponowny submit
- Po sukcesie: komunikat sukcesu (opcjonalnie toast), przekierowanie do `/waga/welcome`
- Po błędach: komunikaty inline + focus na pierwszy błąd


### 9. Warunki i walidacja
- UI wymusza:
  - Wymagane pola: `firstName`, `lastName`, `password`
  - Hasło: min. 8 znaków; `PasswordStrengthIndicator` jako pomocniczy feedback
  - Zgody: `data_processing` i `health_data` muszą mieć `accepted: true`
  - Email: readonly; zgodny z walidacją zaproszenia
  - Age: jeśli podane, liczba w rozsądnym zakresie (np. 10–120) — przed wysyłką rzutowanie na `number`
- API dodatkowo waliduje (źródło prawdy) — UI mapuje błędy:
  - `422` (Zod): rozbicie na pola
  - `400` (consents/token): błąd globalny i/lub inline
  - `409` (email exists): błąd przy polu email (choć email jest readonly — wyświetlić jako alert globalny z informacją, że konto istnieje)


### 10. Obsługa błędów
- Token nieważny/expired:
  - Ekran błędu w widoku (full-width `Alert`) z informacją i CTA „Poproś o nowe zaproszenie”
  - Alternatywnie: redirect do dedykowanej podstrony błędu
- Brak wymaganych zgód (`400`):
  - Zaznaczenie sekcji zgód z błędem + komunikat nad przyciskiem
- Walidacja pól (`422`):
  - Błędy renderowane pod odpowiednimi polami + focus
- Email istnieje (`409`):
  - Alert globalny: „Konto z tym e‑mailem już istnieje. Zaloguj się.” + link do logowania
- Błąd serwera (`500`):
  - Alert globalny: „Wystąpił błąd. Spróbuj ponownie.” + retry


### 11. Kroki implementacji
1) Routing i skeleton strony
   - Utwórz `src/pages/auth/signup.astro` z `prerender = false` i pobieraniem `token` z query
   - SSR: na wejściu wywołaj `GET /api/invitations/:token`; na podstawie wyniku przekaż `email` i `expiresAt` do wyspy React (`SignupForm`), lub pokaż ekran błędu
2) Komponent `SignupForm`
   - Zainicjuj stan `SignupFormVM` (email z props, pozostałe puste), `SignupFormErrors`, `SignupUIState`
   - Zaimplementuj pola, walidacje inline i blokowanie `submit`
   - Podepnij `PasswordStrengthIndicator`
3) Komponent `ConsentAccordion`
   - Zdefiniuj listę zgód (min. `data_processing` i `health_data` jako required)
   - Zaimplementuj rozwijanie treści, zmiany `accepted`
4) Integracja API
   - `GET /api/invitations/:token` w SSR (`.astro`) i/lub w efekcie klientowym jako fallback
   - `POST /api/auth/signup` w `onSubmit`:
     - Zbuduj `SignupRequest` (konwersja `age` → number, filtr tylko `consents` z polami wymaganymi)
     - Obsłuż odpowiedzi: 201 → redirect `/waga/welcome`, błędy → mapowanie i render
5) Dostępność i UX
   - Focus management (po błędzie focus na pierwsze pole z błędem)
   - Klawisz Enter uruchamia submit
   - Opisy ARIA dla checkboxów zgód i przycisku
6) Testy i weryfikacja
   - Testy ręczne scenariuszy: token invalid, brak zgód, 422, 409, sukces
   - Smoke test redirectu po sukcesie (sesja założona przez backend cookie)

