# Plan implementacji widoku Wylogowanie (przycisk w dolnym pasku)

## 1. Przegląd

Dodanie przycisku „Wyloguj” do dolnego paska nawigacyjnego pacjenta, po prawej stronie pozycji „Ustawienia”. Kliknięcie powinno:
- wykonać wylogowanie użytkownika (POST `/api/auth/logout`),
- po sukcesie przekierować do strony logowania (`/logowanie`).

W MVP brak potwierdzenia akcji (modal opcjonalny post-MVP).

## 2. Routing widoku

- Brak nowej trasy widoku. Przycisk jest częścią istniejącego komponentu `PatientBottomNav`.
- Po wylogowaniu: redirect do istniejącej trasy logowania `/logowanie`.

## 3. Struktura komponentów

- `PatientBottomNav` (React, `src/components/waga/PatientBottomNav.tsx`)
  - `NavButton` (istniejący, linki „Dashboard”, „Historia”, „Ustawienia”)
  - `LogoutButton` (nowy element akcji, nie link)
    - [opcjonalnie] `ConfirmModal` (istniejący, `src/components/ui/ConfirmModal.tsx`) – nie w MVP

Hierarchia (wysoki poziom):
- Layout.astro
  - Widok (np. `WeightDashboard` / `WeightHistoryView`)
  - PatientBottomNav
    - NavButton(x3)
    - LogoutButton

## 4. Szczegóły komponentów

### PatientBottomNav

- Opis: Dolny pasek nawigacyjny widoku pacjenta. Dodajemy nowy przycisk „Wyloguj” po prawej stronie.
- Główne elementy:
  - Kontener `<nav>` fixed bottom
  - `NavButton` (🏠 „Dashboard”), `NavButton` (📈 „Historia”), `NavButton` (⚙️ „Ustawienia”)
  - `LogoutButton` (🚪 „Wyloguj”) – nowy
- Obsługiwane interakcje:
  - Kliknięcia w przyciski nawigacyjne (istniejące)
  - Kliknięcie „Wyloguj” wywołuje akcję API i redirect
- Walidacja:
  - Brak dodatkowych walidacji formularzowych; walidujemy odpowiedź API (kody statusu)
- Typy:
  - Istniejące: `PatientBottomNavProps`
  - Nowe: `LogoutButtonProps` (opcjonalnie), `LogoutState` (lokalny)
  - API: `ApiError` (z `src/types.ts`)
- Propsy:
  - `activePage?: 'dashboard' | 'historia' | 'settings'` (istniejące)
  - Brak dodatkowych propsów dla `LogoutButton` w MVP (obsługa wewnętrzna)

### LogoutButton

- Opis: Przycisk akcji wylogowania; renderowany jako `<button>` z ikoną i etykietą „Wyloguj”.
- Główne elementy:
  - `<button>` z klasami wizualnymi spójnymi ze stylem `NavButton`
  - Ikona emoji (np. 🚪) lub prosty SVG
- Obsługiwane interakcje:
  - `onClick` → `POST /api/auth/logout` → obsługa statusu → redirect
  - `Enter/Space` (klawiatura) – domyślnie działa na `<button>`
- Walidacja:
  - Brak danych wejściowych; walidacja odpowiedzi HTTP:
    - 204: sukces
    - 401: brak ważnej sesji – traktujemy jak sukces (redirect)
    - 5xx/Network: błąd – pokaż toast i pozwól na ponowienie
- Typy:
  - `LogoutState` (lokalny): `{ isLoading: boolean }`
  - `ApiError` dla mapowania błędu (jeśli serwer zwróci JSON)
- Propsy:
  - Brak w MVP; opcjonalnie `onSuccess?: () => void` post-MVP

### ConfirmModal (opcjonalnie post-MVP)

- Opis: Modal potwierdzenia przed wylogowaniem.
- Główne elementy: istniejący `ConfirmModal`
- Interakcje: `onConfirm` → wyloguj; `onCancel` → zamknij modal
- Walidacja: jak `LogoutButton`
- Typy: `ConfirmModalProps` (istniejący)
- Propsy: `isOpen`, `onConfirm`, `onCancel`, itd.

## 5. Typy

Nowe (frontend, lokalne dla komponentu):

```ts
type LogoutState = {
  isLoading: boolean;
};

// Opcjonalnie, jeśli wyodrębnimy przycisk:
type LogoutButtonProps = {
  className?: string;
  label?: string; // domyślnie "Wyloguj"
  icon?: React.ReactNode; // domyślnie "🚪"
  onSuccessRedirect?: string; // domyślnie "/logowanie"
};
```

Wykorzystanie istniejących:
- `ApiError` z `src/types.ts` do ewentualnego odwzorowania błędu serwera.

## 6. Zarządzanie stanem

- Lokalny stan w `PatientBottomNav` (lub wewnątrz `LogoutButton`):
  - `isLoading: boolean` – blokuje wielokrotne kliknięcia i ustawia aria-busy na przycisku.
- [Opcjonalnie] `isConfirmOpen: boolean` – gdy wdrożymy modal po MVP.
- Brak globalnego store – akcja jednorazowa, bez zależności od innych widoków.

## 7. Integracja API

- Endpoint: `POST /api/auth/logout`
- Request:
  - Brak body; wykorzystuje cookie sesyjne
  - `fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' } })`
- Response:
  - `204 No Content` – sukces
  - `401 Unauthorized` – brak ważnej sesji (traktować jako sukces: czyścimy stan klienta, redirect)
  - `500 Internal Server Error` – błąd serwera (pokaż toast i nie redirectuj)
- Frontend akcje:
  - `204` lub `401` → `window.location.href = '/logowanie'`
  - `5xx`/network error → toast error + odblokuj przycisk

## 8. Interakcje użytkownika

- Kliknięcie „Wyloguj”:
  - Przyciski: aktywuje spinner/disabled
  - Wysyła żądanie POST
  - Po sukcesie → redirect do `/logowanie`
  - Po błędzie 5xx → komunikat o błędzie, możliwość ponowienia
- Dostępność:
  - `<button type="button" aria-label="Wyloguj">`
  - `aria-busy={isLoading}` podczas żądania
  - Focus state zgodny z Tailwind (widoczny outline)

## 9. Warunki i walidacja

- Widoczność przycisku:
  - `PatientBottomNav` montowany tylko na stronach z autoryzacją (już enforceowane w `.astro` przez redirect do `/logowanie`).
- Walidacja odpowiedzi:
  - `204` i `401` traktowane jako prawidłowe wylogowanie (spełnia US-004: sesja unieważniona lub nieważna → brak dostępu).
  - Błędy 5xx → prezentacja błędu (toast).

## 10. Obsługa błędów

- Błąd sieci/timeout:
  - Pokaż `toast.error('Nie udało się wylogować. Spróbuj ponownie.')`
  - `isLoading = false` – umożliw ponowne kliknięcie
- `500` z serwera:
  - Spróbuj odczytać `ApiError` (JSON) i pokazać `message` jeśli dostępny, w przeciwnym razie komunikat ogólny
- Nietypowe kody (np. 403):
  - Traktuj jak błąd; nie redirectuj

## 11. Kroki implementacji

1. Aktualizacja `PatientBottomNav`:
   - Dodaj element `LogoutButton` jako czwarty przycisk po prawej stronie „Ustawienia”.
   - render: `<button>` z ikoną (np. „🚪”) i etykietą „Wyloguj”.
   - Stylizacja spójna z `NavButton`: układ kolumnowy, rozmiary i kolory; dla różnicy semantycznej pozostaw `<button>` (nie `<a>`).
2. Implementacja logiki wylogowania:
   - Dodaj lokalny stan `isLoading`.
   - W `onClick`: ustaw `isLoading = true`, wyślij `POST /api/auth/logout`.
   - Obsłuż status:
     - `204` lub `401` → `window.location.href = '/logowanie'`
     - Błąd/5xx → toast error, `isLoading = false`
3. Dostępność i UX:
   - Dodaj `aria-label="Wyloguj"` i `aria-busy` podczas requestu.
   - Zablokuj przycisk (`disabled`) podczas `isLoading`.
4. [Opcjonalnie, po MVP] Potwierdzenie:
   - Włącz `ConfirmModal` przed wylogowaniem (props: tytuł, treść, „Anuluj”/„Wyloguj”).
5. Manualne testy akceptacyjne:
   - Scenariusz sukcesu (204) → redirect do `/logowanie`.
   - Scenariusz `401` (np. wygaszona sesja) → redirect do `/logowanie`.
   - Scenariusz `500` → toast błędu, przycisk odblokowany po błędzie.
   - A11y: nawigacja klawiaturą, fokus na przycisku, czytelne stany `:focus`.
6. Przegląd i wdrożenie:
   - Code review, sprawdzenie konsystencji z Tailwind i istniejącymi klasami.
   - Deploy i smoke test na środowisku.


