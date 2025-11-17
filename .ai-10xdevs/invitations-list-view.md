# Plan implementacji widoku Lista zaproszeń (Dietetyk)

## 1. Przegląd

Widok pozwala dietetykowi zarządzać zaproszeniami wysyłanymi do pacjentów: wysłanie nowego zaproszenia, podgląd historii wysłanych zaproszeń (email, status pending/used/expired, daty utworzenia i wygaśnięcia), oraz akcję „Wyślij ponownie” (unieważnia poprzednie, generuje nowe). Widok jest zgodny z PRD (US-001) i wykorzystuje istniejący `InvitationForm` oraz nową listę zaproszeń.

## 2. Routing widoku

- Ścieżka: `/dietetyk/zaproszenia`
- Dostęp: wyłącznie rola `dietitian` (RBAC). Ochrona przez istniejące middleware `auth` + `rbac`.
- SSR: tak (strona w obszarze aplikacji). Inicjalne dane listy mogą być renderowane po stronie serwera, z dalszą paginacją/filtrowaniem po stronie klienta.

## 3. Struktura komponentów

- `pages/dietetyk/zaproszenia.astro`
  - layout aplikacji + guardy
  - render: `InvitationForm` (istnieje) + `InvitationsList` (nowy)
- `components/InvitationForm.tsx` (istniejący)
- `components/InvitationsList.tsx` (nowy)
  - `InvitationsToolbar` (filtry/akcje; opcjonalnie)
  - `InvitationsTable`
    - `InvitationRow`
      - `InvitationStatusBadge` (nowy, rozdzielony od statusów pacjenta)
      - `ResendInvitationButton` (nowy) + `ConfirmModal` (istnieje w `components/ui/ConfirmModal.tsx`)
- `components/Pagination.tsx` (istniejący)
- Toasty: `ToastProvider` (istniejący) do komunikatów sukces/błąd

## 4. Szczegóły komponentów

### InvitationsList
- Opis: Sekcja historii zaproszeń z tabelą, paginacją, (ew. filtr statusem w przyszłości).
- Główne elementy:
  - Nagłówek sekcji
  - `InvitationsToolbar` (opcjonalny selektor statusu: all/pending/used/expired)
  - `InvitationsTable` (kolumny: Email, Status, Created, Expires, Actions)
  - `Pagination`
- Obsługiwane interakcje:
  - Zmiana strony (paginacja offsetowa)
  - Akcja „Wyślij ponownie”
- Walidacja:
  - Brak walidacji formularzowej; walidacja po stronie API na akcjach
- Typy:
  - DTO: `InvitationListItemDTO`, `GetInvitationsResponse`
  - VM: `InvitationsListVM`
- Propsy:
  - `initialData: GetInvitationsResponse` (SSR)
  - `pageSize?: number` (domyślnie 50)
  - `initialStatusFilter?: 'all'|'pending'|'used'|'expired'`

### InvitationStatusBadge
- Opis: Odznaka ze statusem zaproszenia (pending/used/expired).
- Główne elementy: semantyczny znacznik/`span` ze stylem statusu; aria-label.
- Interakcje: brak
- Walidacja: gwarancja jednego z 3 statusów
- Typy: `InvitationStatus = 'pending'|'used'|'expired'`
- Propsy: `status: InvitationStatus`

### ResendInvitationButton
- Opis: Przycisk do ponownego wysłania zaproszenia; wymaga potwierdzenia.
- Główne elementy:
  - `button` z ikoną (opcjonalnie)
  - `ConfirmModal` przed wykonaniem akcji
- Interakcje:
  - onClick → otwórz modal → potwierdzenie → `POST /api/dietitian/invitations/:id/resend`
  - Po sukcesie: toast + odśwież rekord w tabeli (status/expiry)
- Walidacja:
  - Brak lokalnej; obsługa stanów disabled podczas ładowania
- Typy:
  - `ResendInvitationResponse`
- Propsy:
  - `invitationId: string`
  - `onSuccess: (updated: InvitationListItemDTO) => void`

### InvitationsToolbar (opcjonalnie)
- Opis: Filtry listy (np. status).
- Główne elementy: `select` statusu, licznik wyników.
- Interakcje:
  - Zmiana filtra → odśwież listę (GET z query `status`)
- Walidacja: status ∈ {all, pending, used, expired}
- Typy: `InvitationStatusFilter = 'all'|'pending'|'used'|'expired'`
- Propsy:
  - `value: InvitationStatusFilter`
  - `onChange: (next: InvitationStatusFilter) => void`

## 5. Typy

- DTO (do `src/types.ts`):
  - `export type InvitationListItemDTO = { id: string; email: string; status: 'pending'|'used'|'expired'; createdAt: Date; expiresAt: Date; createdBy: string }`
  - `export type GetInvitationsResponse = { invitations: InvitationListItemDTO[]; pagination: OffsetPagination }`
  - `export type ResendInvitationResponse = { invitation: InvitationListItemDTO; message: string }`
- ViewModel (komponenty):
  - `InvitationsListVM = { items: InvitationListItemDTO[]; pagination: { page: number; pageSize: number; total: number; hasMore: boolean }; statusFilter: 'all'|'pending'|'used'|'expired'; isLoading: boolean; error: string | null }`
  - `ResendState = { isOpen: boolean; isSubmitting: boolean; error: string | null }`

Uwagi:
- Wykorzystujemy istniejący `OffsetPagination` z `src/types.ts`.
- Daty w DTO jako `Date` (SSR) lub ISO string w JSON – w UI konwersja i formatowanie (np. `toLocaleString('pl-PL')`).

## 6. Zarządzanie stanem

- `InvitationsList`:
  - Lokalny stan dla: `vm: InvitationsListVM`
  - Inicjalizacja z `initialData` (SSR)
  - Akcje:
    - `loadPage(page, status?)` → GET `/api/dietitian/invitations?limit=X&offset=Y&status=...`
    - `handleResend(id)` → POST `/api/dietitian/invitations/:id/resend` → aktualizacja elementu
- Hooki:
  - (opcjonalnie) `useInvitationsList` kapsułkujący fetch, paginację, filtry, aktualizacje elementów
  - Reużycie `ToastProvider` do komunikatów

## 7. Integracja API

- Listowanie zaproszeń (nowy endpoint):
  - `GET /api/dietitian/invitations?limit={1..100}&offset={0..}&status={all|pending|used|expired}`
  - Response: `GetInvitationsResponse`
  - Uprawnienia: tylko `dietitian`
  - Sort: domyślnie `createdAt DESC`
  - Status:
    - `expired` jeśli `now > expiresAt`
    - `used` jeśli token użyty (pole w DB, np. `usedAt IS NOT NULL`)
    - `pending` w przeciwnym wypadku
- Ponowne wysłanie:
  - `POST /api/dietitian/invitations/:id/resend`
  - Efekt: unieważnienie poprzedniego tokena, utworzenie nowego zaproszenia (7 dni), wysyłka e-mail
  - Response: `ResendInvitationResponse`
  - Event: `signup_invite_sent`
- Tworzenie zaproszenia (już istnieje POST):
  - `POST /api/dietitian/invitations` → `CreateInvitationResponse`

## 8. Interakcje użytkownika

- „Wyślij zaproszenie” (formularz):
  - Walidacja email (Zod), błąd gdy email istnieje jako użytkownik
  - Sukces: toast „Zaproszenie wysłane” + odśwież lista (fetch page 1)
- Przegląd listy:
  - Tabela z wierszami; status `InvitationStatusBadge`
  - Paginacja: zmiana strony aktualizuje dane
- „Wyślij ponownie”:
  - Klik → modal potwierdzenia → POST → toast sukcesu → aktualizacja wiersza (nowe `expiresAt`, możliwe ID wiersza jeśli reinkarnacja – w MVP dopuszczamy „aktualizację wiersza” zwracaną przez API)
- Puste stany:
  - Brak zaproszeń → informacja z CTA „Wyślij zaproszenie”

## 9. Warunki i walidacja

- RBAC: tylko `dietitian` (middleware)
- Statusy:
  - `expired`: `now > expiresAt`
  - `used`: `usedAt != null`
  - `pending`: inaczej
- Paginacja:
  - `limit` 1..100, domyślnie 50
  - `offset` >= 0
- Resend:
  - Dopuszczalne tylko dla `pending` i `expired`; dla `used` dopuszczalne (generuje nowe i unieważnia poprzednie)
- Formularz email:
  - Format RFC + MX-agnostyczny (tylko syntaktyka)
  - Błąd gdy email już istnieje w `users`

## 10. Obsługa błędów

- 401/403: przekierowanie do logowania / komunikat o braku uprawnień
- 400: nieprawidłowe parametry (limit/offset/status) → toast z komunikatem i reset do domyślnych
- 409: konflikt (np. resend rate-limit – jeśli wprowadzimy) → toast z powodem
- 404: zaproszenie nie istnieje (resend) → toast, odśwież listę
- 500: ogólny błąd → toast „Wystąpił błąd. Spróbuj ponownie.”
- Puste stany i skeletony podczas ładowania

## 11. Kroki implementacji

1) Backend – endpoint listy zaproszeń:
   - Utwórz `src/pages/api/dietitian/invitations/index.ts` (GET)
   - Waliduj query (limit/offset/status)
   - Zapytanie Drizzle do tabeli `invitations` z sortowaniem i mapowaniem na `InvitationListItemDTO`
   - Oblicz `status` na backendzie (pending/used/expired)
   - Zwróć `GetInvitationsResponse`
2) Backend – endpoint resend:
   - Utwórz `src/pages/api/dietitian/invitations/[id]/resend.ts` (POST)
   - Transakcja: unieważnij stare, utwórz nowe (expiresAt = now + 7 dni), wyślij e-mail
   - Zwróć `ResendInvitationResponse` (uaktualniony rekord do odświeżenia UI)
   - Zaloguj event `signup_invite_sent`
3) Typy:
   - Dodaj `InvitationListItemDTO`, `GetInvitationsResponse`, `ResendInvitationResponse` do `src/types.ts`
4) UI – strona:
   - `pages/dietetyk/zaproszenia.astro`: SSR fetch pierwszej strony (server-side) i przekazanie `initialData` do `InvitationsList`
   - Wyrenderuj obok istniejącego `InvitationForm`
5) UI – komponenty:
   - `components/InvitationsList.tsx` (tabela + paginacja + logika przeładowania)
   - `components/InvitationStatusBadge.tsx`
   - `components/ResendInvitationButton.tsx` (z `ConfirmModal`)
   - Reużyj `Pagination.tsx` i `ToastProvider.tsx`
6) Integracja:
   - Po wysłaniu nowego zaproszenia: refetch listy (page 1)
   - Po „Wyślij ponownie”: aktualizacja wiersza danymi z response
7) Dostępność i i18n:
   - ARIA dla przycisków i odznak statusu
   - Teksty w języku polskim (MVP bez i18n)
8) Testy (MVP smoke):
   - Backend: poprawność statusów, paginacji, uprawnień
   - UI: render listy, paginacja, resend flow z potwierdzeniem
9) Telemetria:
   - Event `signup_invite_sent` (już), opcjonalnie `view_invitations_list`


