# Plan implementacji widoku Zaproszenia

## 1. Przegląd

Widok służy dietetykowi do wysyłania zaproszeń e‑mail do nowych pacjentów, co rozpoczyna ich proces rejestracji. W MVP skupiamy się na formularzu wysyłki pojedynczego zaproszenia i spójnym UX (walidacje, stany ładowania, komunikaty o błędach, toasty). Lista historii zaproszeń oraz akcja „Wyślij ponownie” są zarysowane jako rozszerzenie (post‑MVP), z miejscem w strukturze komponentów.

## 2. Routing widoku

- Ścieżka: `/dietetyk/zaproszenia`
- Dostęp: wyłącznie rola `dietitian` (autoryzacja po stronie middleware/SSR)
- SSR: strona Astro z komponentami React (islands)

## 3. Struktura komponentów

- `pages/dietetyk/zaproszenia.astro` (SSR, wrapper strony)
  - `PageHeader` (opcjonalny, nagłówek z tytułem i opisem)
  - `InvitationForm` (React)
  - `InvitationsList` (React, post‑MVP, placeholder/feature‑flag)
  - globalny `ToastProvider` (już istnieje w projekcie – używany do powiadomień)

Diagram drzewa (wysoki poziom):

- ZaproszeniaPage (.astro)
  - PageHeader
  - Section
    - InvitationForm
  - Section (post‑MVP)
    - InvitationsList

## 4. Szczegóły komponentów

### InvitationForm

- Opis: Formularz do wysyłania zaproszenia e‑mail. Waliduje dane wejściowe (Zod), wysyła żądanie `POST /api/dietitian/invitations`, pokazuje wynik (toast/alert), dezaktywuje UI w trakcie zapisu.
- Główne elementy:
  - `<form>` z polem `email` (type="email"), przyciskiem „Wyślij zaproszenie”
  - Miejsce na `Alert` błędu/ostrzeżenia (komponent istnieje)
  - Subtekst o ważności i działaniu linku
- Obsługiwane interakcje:
  - `onSubmit`: walidacja + wywołanie API
  - `onChange`: aktualizacja stanu formularza, czyszczenie błędów
  - `onKeyDown Enter`: submit z poszanowaniem walidacji
- Obsługiwana walidacja:
  - Email wymagany, poprawny format (Zod: `string().email()`)
  - Trimowanie whitespace, lowercasing UIDN (opcjonalnie)
  - Blokada wielokrotnego wysłania podczas `isSubmitting`
- Typy:
  - DTO: `CreateInvitationRequest`, `CreateInvitationResponse` (z `src/types.ts`)
  - VM: `InvitationFormData`, `InvitationFormErrors` (sekcja 5)
- Propsy:
  - Brak wymaganych; opcjonalnie `onSuccess?: (invitation) => void` do powiadomienia rodzica (np. odświeżenie listy)

### InvitationsList (post‑MVP)

- Opis: Tabela z historią zaproszeń (email, status, utworzone, wygaśnięcie, akcje). W MVP można dodać placeholder z informacją „Wkrótce”.
- Główne elementy:
  - Tabela/Lista elementów
  - Kolumny: Email, Status (`pending/used/expired`), Created, Expires, Actions
  - Akcja „Wyślij ponownie” (post‑MVP)
- Obsługiwane interakcje:
  - Klik „Wyślij ponownie” → potwierdzenie (modal), request do API (przyszły endpoint)
- Obsługiwana walidacja:
  - Brak w MVP (read‑only)
- Typy:
  - `InvitationListItemVM` (sekcja 5, opcjonalnie)
- Propsy:
  - `items?: InvitationListItemVM[]` (później: dane z API)
  - `onResend?: (email: string) => void` (post‑MVP)

### PageHeader (opcjonalny)

- Opis: Nagłówek strony z tytułem, krótkim opisem i ewentualną ikoną.
- Elementy: `<h1>`, `<p>` z opisem, breadcrumbs (opcjonalnie)
- Propsy: `title?: string`, `subtitle?: string`

## 5. Typy

Wykorzystujemy istniejące typy DTO oraz dodajemy lekkie ViewModel do formularza.

Nowe typy ViewModel:

```ts
// VM: formularz zaproszenia (dane wejściowe w UI)
export type InvitationFormData = {
  email: string
}

// VM: błędy walidacji formularza
export type InvitationFormErrors = {
  email?: string
  submit?: string // ogólny błąd API
}

// VM: element listy zaproszeń (post‑MVP)
export type InvitationListItemVM = {
  id: string
  email: string
  status: 'pending' | 'used' | 'expired'
  createdAt: string // ISO
  expiresAt: string // ISO
}
```

Istniejące typy DTO (z `src/types.ts`):
- `CreateInvitationRequest`: `{ email: string }`
- `CreateInvitationResponse`: `{ invitation: { id, email, token, expiresAt, createdBy }, message: string }`

Uwagi:
- `expiresAt` z API jest serializowane jako ISO string.
- `ValidateInvitationResponse` jest używane w flow rejestracji (out‑of‑scope dla widoku), ale link z maila kieruje do `/rejestracja?invitation=...`.

## 6. Zarządzanie stanem

- Lokalne stany komponentu `InvitationForm`:
  - `formData: InvitationFormData`
  - `errors: InvitationFormErrors`
  - `isSubmitting: boolean`
  - `serverMessage: string | null` (opcjonalnie, jeżeli chcemy pokazać inline)
- Hooki:
  - Custom hook nie jest wymagany w MVP. Ewentualnie `useInvitationForm` (post‑MVP) przy rozbudowie logiki o debounce, telemetry, itp.
- Globalny kontekst:
  - `ToastProvider` do sukcesów/błędów
  - Brak konieczności globalnego store (np. Zustand) na MVP

## 7. Integracja API

- Endpoint: `POST /api/dietitian/invitations`
- Request:

```ts
type CreateInvitationRequest = { email: string }
```

- Response (201):

```ts
type CreateInvitationResponse = {
  invitation: {
    id: string
    email: string
    token: string
    expiresAt: string // ISO
    createdBy: string
  }
  message: string
}
```

- Błędy:
  - 401 `unauthorized` – brak sesji
  - 403 `forbidden` – rola inna niż `dietitian`
  - 400 `validation_error` – nieprawidłowe dane wejściowe (Zod)
  - 409 `email_already_exists` – użytkownik już istnieje
  - 500 `email_send_failed` – zaproszenie utworzone, ale e‑mail nie wysłany
  - 500 `internal_server_error` – nieoczekiwany błąd

Integracja w `InvitationForm`:
1. Waliduj Zod i zablokuj submit przy błędach.
2. `fetch('/api/dietitian/invitations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })`
3. Obsłuż kody statusu i mapuj na UX (toasty, inline errors).
4. Po sukcesie: toast „Zaproszenie wysłane na {email}”, wyczyść formularz, opcjonalnie `onSuccess(invitation)`.

## 8. Interakcje użytkownika

- Uzupełnienie pola `email` → walidacja onBlur/onSubmit
- Klik „Wyślij zaproszenie” → submit, blokada przycisku, spinner/aria‑busy
- Sukces → toast sukcesu + reset formularza
- Błąd walidacji → komunikat pod polem `email`
- Błąd API → `Alert` inline oraz/lub toast błędu
- Dostępność:
  - Focus states, `aria-invalid`, `aria-describedby` dla błędów
  - Enter w polu e‑mail wywołuje submit

## 9. Warunki i walidacja

- Email (UI):
  - wymagany, `string().email('Podaj poprawny adres e‑mail')`
  - trim + lowerCase (opcjonalnie)
- Blokada wielokrotnego submitu:
  - `isSubmitting === true` dezaktywuje inputy i przycisk
- Mapowanie błędów API:
  - 400 `validation_error` → komunikat: „Nieprawidłowe dane wejściowe”
  - 409 `email_already_exists` → „Ten adres e‑mail jest już zarejestrowany”
  - 401/403 → przekierowanie do logowania/komunikat „Brak uprawnień”
  - 500 `email_send_failed` → „Zaproszenie utworzono, ale nie udało się wysłać e‑maila” (pokaż wskazówkę: sprawdź konfigurację SMTP / spróbuj ponownie)

## 10. Obsługa błędów

- Network error / fetch throw → toast błędu + `errors.submit`
- 500 `email_send_failed` → wyświetl jako osobny alert; akcja „Spróbuj ponownie”
- Brak sesji (401) / brak uprawnień (403) → SSR i/lub middleware powinny zatrzymać dostęp; jeśli jednak UI je zobaczy: pokaż pełnoekranowy komunikat i link do logowania
- Nieoczekiwany JSON shape → fallback komunikat: „Wystąpił nieoczekiwany błąd serwera”

## 11. Kroki implementacji

1. Routing i strona:
   - Utwórz `src/pages/dietetyk/zaproszenia.astro`
   - Zapewnij, że globalny `ToastProvider` jest dostępny (np. w layout)
   - Dodaj tytuł i krótkie wprowadzenie do strony
2. Komponent `InvitationForm`:
   - Stwórz `src/components/InvitationForm.tsx`
   - Stan: `formData`, `errors`, `isSubmitting`
   - Walidacja Zod (email)
   - Submit: wywołanie endpointu, mapowanie statusów, toasty
   - UX: focus management, aria‑atrybuty, blokada przycisku
3. Integracja na stronie:
   - Zaimportuj i wyrenderuj `InvitationForm` w `zaproszenia.astro`
   - Przekaż `onSuccess` (opcjonalnie) do logowania eventu/odświeżania listy
4. Telemetria (opcjonalnie, jeśli dostępny tracking):
   - Wyślij event `signup_invite_sent` po 201 (z właściwościami: email, createdBy)
5. Stylowanie:
   - Użyj istniejących klas Tailwind i design systemu komponentów (np. `Alert`)
   - Zadbaj o stany hover/focus/disabled
6. Testy manualne:
   - Scenariusze: sukces, 409, 400, 500 email_send_failed, offline
   - Dostępność: nawigacja klawiaturą, screen reader labels
7. (Post‑MVP) `InvitationsList`:
   - Placeholder UI lub feature‑flag (ukryty do czasu wdrożenia endpointu GET)
   - Zdefiniuj `InvitationListItemVM` i UI tabeli

--- 

Uwagi zgodności z PRD i user stories:
- US‑001: wysyłka zaproszenia z unikalnym linkiem; link jednokrotnego użycia i ważność (po stronie backendu istnieje logika tokenu; UI komunikuje sukces i czas ważności w opisie).
- Tracking `signup_invite_sent` (opcjonalnie) i audit log załatwiane głównie po stronie backendu; UI może dodać wywołanie eventu, jeśli istnieje mechanizm.


