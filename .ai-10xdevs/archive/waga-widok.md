# Plan implementacji widoku Historia Wpisów (Pacjent)

## 1. Przegląd

Widok historii wagi umożliwia pacjentowi:
- przegląd pełnej historii pomiarów z filtrowaniem po zakresie dat,
- nieskończone przewijanie (paginacja kursorem) po 30 wpisów,
- edycję wpisu w dozwolonym oknie (do końca następnego dnia),
- potwierdzanie anomalii (skok >3 kg/24h) lub ich korektę,
- usuwanie wpisu w dozwolonym oknie.

Zgodność z PRD: US-012, US-013, US-014, US-015, US-016. Integracja z istniejącymi endpointami: GET/POST/PATCH/DELETE/confirm pod `/api/weight`.

## 2. Routing widoku

- Ścieżka: `/waga/historia`
- Dostęp: wyłącznie zalogowany pacjent (SSR; kontrola w middleware)
- Tryb renderowania: SSR (Astro) z wyspami React dla logiki UI

Sugestia struktury plików:
- `src/pages/waga/historia.astro` (kontener strony, SSR)
- `src/components/waga/WeightHistoryView.tsx` (główna wyspa React)

## 3. Struktura komponentów

```
HistoryPage (/waga/historia.astro)
└── WeightHistoryView (React)
    ├── HistoryFilters
    ├── WeightEntryList
    │   ├── WeightEntryHistoryCard (1..n)
    │   │   └── [przyciski: Edytuj / Usuń / Potwierdź anomalię]
    │   └── LoadMoreSpinner / EmptyState / ErrorAlert
    ├── EditWeightModal
    ├── ConfirmOutlierModal
    ├── DeleteConfirmationModal (re-use: components/ui/ConfirmModal)
    └── PatientBottomNav (re-use)
```

## 4. Szczegóły komponentów

### WeightHistoryView
- Opis: Komponent rodzic zarządzający stanem widoku (filtry, paginacja, wybór wpisu do akcji, modale), integruje wywołania API.
- Główne elementy: nagłówek, `HistoryFilters`, `WeightEntryList`, modale (edycja, potwierdzenie outliera, usunięcie), `PatientBottomNav`.
- Obsługiwane interakcje:
  - Zmiana filtrów (startDate/endDate) → reset listy i ponowne pobranie
  - Nieskończone przewijanie → doładowanie przy końcu listy
  - Akcje per wpis: Edycja, Usuń, Potwierdź/Anuluj anomalię
- Obsługiwana walidacja:
  - Walidacja filtrów: `startDate <= endDate` (jeśli oba)
  - Warunki okna edycji/usunięcia: do końca następnego dnia po `measurementDate` (sprawdzenie klient + serwer docelowo egzekwuje)
- Typy:
  - DTO: `GetWeightEntriesResponse`, `WeightEntryDTO`, `UpdateWeightEntryRequest`, `ConfirmOutlierRequest`
  - ViewModel: `HistoryFiltersVM`, `InfiniteHistoryState`, `EditFormData`, `EditFormErrors`
- Propsy: brak (komponent-główna wyspa)

### HistoryFilters
- Opis: Pasek filtrów z zakresem dat; zapis filtrów w query params.
- Główne elementy: dwa `input[type="date"]`, przycisk Wyczyść.
- Obsługiwane interakcje: zmiana dat, zatwierdzenie/zmiana filtra, reset.
- Walidacja:
  - `startDate` i `endDate` w formacie ISO (YYYY-MM-DD)
  - `startDate <= endDate`
- Typy: `HistoryFiltersVM`
- Propsy:
  - `value: HistoryFiltersVM`
  - `onChange: (next: HistoryFiltersVM) => void`
  - `isLoading?: boolean`

### WeightEntryList
- Opis: Lista wpisów z obsługą nieskończonego przewijania i stanów (loading/empty/error).
- Główne elementy: kontener listy, sentinel do IO, predykat końca listy.
- Obsługiwane interakcje: scroll → `onLoadMore` przy wejściu w sentinel.
- Walidacja: brak (prezentacja)
- Typy: `WeightEntryDTO[]`, `CursorPagination`
- Propsy:
  - `entries: WeightEntryDTO[]`
  - `previousById: Record<string, WeightEntryDTO | undefined>` (do obliczenia delta)
  - `hasMore: boolean`
  - `isLoading: boolean`
  - `error?: string | null`
  - `onLoadMore: () => void`
  - `onEdit: (entry: WeightEntryDTO) => void`
  - `onDelete: (entry: WeightEntryDTO) => void`
  - `onConfirmOutlier: (entry: WeightEntryDTO) => void`

### WeightEntryHistoryCard
- Opis: Karta wpisu rozszerzona o akcje; bazuje na istniejącym `WeightEntryCard`, ale dodaje strefę przycisków.
- Główne elementy: data, waga, delta, badże (backfill/outlier/source), notatka, przyciski akcji.
- Obsługiwane interakcje:
  - `Edytuj` (jeżeli w oknie edycji i `source === 'patient'`)
  - `Usuń` (jeżeli w oknie edycji i `source === 'patient'`)
  - `Potwierdź anomalię` / `Cofnij potwierdzenie` (jeżeli `isOutlier === true`)
- Walidacja UI (warunkowe wyświetlenie akcji):
  - `canMutate = isWithinEditWindow(entry) && entry.source === 'patient'`
  - `canConfirmOutlier = entry.isOutlier === true`
- Typy: `WeightEntryDTO`
- Propsy:
  - `entry: WeightEntryDTO`
  - `previous?: WeightEntryDTO`
  - `onEdit`, `onDelete`, `onConfirmOutlier`

### EditWeightModal
- Opis: Modal do edycji wagi i notatki (limit 200 znaków), walidacja jak w `updateWeightEntrySchema`.
- Główne elementy: `input number` (krok 0.1), `textarea`, przyciski `Zapisz`, `Anuluj`.
- Obsługiwane interakcje: edycja pól, submit (PATCH), anulowanie.
- Walidacja:
  - `weight` 30.0–250.0, maks. 1 miejsce po przecinku
  - `note` maks. 200 znaków
- Typy: `EditFormData`, `EditFormErrors`, `UpdateWeightEntryRequest`
- Propsy:
  - `isOpen: boolean`
  - `entry: WeightEntryDTO | null`
  - `onClose: () => void`
  - `onSaved: (updated: WeightEntryDTO) => void`

### ConfirmOutlierModal
- Opis: Modal potwierdzenia anomalii (lub cofnięcia potwierdzenia), prosty komunikat i CTA.
- Główne elementy: re-use `ConfirmModal` z `variant="info"`.
- Obsługiwane interakcje: confirm (`POST /api/weight/:id/confirm`), cancel.
- Walidacja: brak (serwer sprawdza `isOutlier`)
- Typy: `ConfirmOutlierRequest`
- Propsy:
  - `isOpen: boolean`
  - `entry: WeightEntryDTO | null`
  - `onClose: () => void`
  - `onConfirmed: (updated: WeightEntryDTO) => void`

### DeleteConfirmationModal
- Opis: Modal potwierdzenia usunięcia wpisu (re-use `components/ui/ConfirmModal` z `variant="danger"`).
- Główne elementy: tytuł, message z datą wpisu, `Usuń`/`Anuluj`.
- Obsługiwane interakcje: confirm (`DELETE /api/weight/:id`), cancel.
- Walidacja: w UI ukrywamy przycisk, jeśli poza oknem edycji; serwer egzekwuje.
- Typy: brak dodatkowych
- Propsy:
  - `isOpen: boolean`
  - `entry: WeightEntryDTO | null`
  - `onClose: () => void`
  - `onDeleted: (id: string) => void`

### LoadMoreSpinner / EmptyState / ErrorAlert
- Proste komponenty prezentacyjne stanów ładowania, pustki i błędu.

## 5. Typy

Re-use z `src/types.ts`:
- `WeightEntryDTO`, `GetWeightEntriesResponse`, `UpdateWeightEntryRequest`, `ConfirmOutlierRequest`, `CursorPagination`

Nowe typy (ViewModel):
- `HistoryFiltersVM`
  - `startDate?: string` (YYYY-MM-DD)
  - `endDate?: string` (YYYY-MM-DD)
- `InfiniteHistoryState`
  - `entries: WeightEntryDTO[]`
  - `hasMore: boolean`
  - `nextCursor: string | null`
  - `isLoading: boolean`
  - `error: string | null`
- `EditFormData`
  - `weight: string` (kontrolka formularza; konwersja do number przed PATCH)
  - `note?: string`
- `EditFormErrors`
  - `weight?: string`
  - `note?: string`
  - `submit?: string`

Walidacje wag/notatek spójne z `schemas/weight.ts`:
- waga 30.0–250.0, maks. 1 miejsce po przecinku
- notatka do 200 znaków

## 6. Zarządzanie stanem

- Lokalny stan w `WeightHistoryView`:
  - `filters: HistoryFiltersVM`
  - `state: InfiniteHistoryState`
  - `selectedEntryForEdit: WeightEntryDTO | null`
  - `selectedEntryForDelete: WeightEntryDTO | null`
  - `selectedEntryForConfirm: WeightEntryDTO | null`
  - `modals: { editOpen: boolean; deleteOpen: boolean; confirmOpen: boolean }`

Custom hooki:
- `useInfiniteWeightHistory(filters: HistoryFiltersVM, pageSize = 30)`
  - odpowiedzialny za GET `/api/weight` z `startDate`, `endDate`, `limit`, `cursor`
  - metody: `loadFirstPage()`, `loadNextPage()`, `reset()`
  - stan: jak w `InfiniteHistoryState`
- `useIntersectionObserver` (re-use istniejący) do wyzwalania `loadNextPage`
- `useEditWeightEntry(initialEntry: WeightEntryDTO | null)` (opcjonalnie)
  - zarządza `EditFormData`, walidacją (`validateWeight`, `validateNote` reuse z `useWeightEntry`), `submit()`

## 7. Integracja API

- GET `/api/weight`
  - Query: `startDate?: string`, `endDate?: string`, `limit?: number [1..100, domyślnie 30]`, `cursor?: string (ISO)`
  - Response: `GetWeightEntriesResponse` { entries: `WeightEntryDTO[]`, pagination: { hasMore, nextCursor } }
- PATCH `/api/weight/:id`
  - Body: `UpdateWeightEntryRequest` { weight: number, note?: string }
  - 200 → `UpdateWeightEntryResponse.entry`
- DELETE `/api/weight/:id`
  - 204 No Content
- POST `/api/weight/:id/confirm`
  - Body: `ConfirmOutlierRequest` { confirmed: boolean }
  - 200 → `ConfirmOutlierResponse.entry`

Nagłówki:
- `Accept: application/json`; dla mutacji: `Content-Type: application/json`

Obsługa 401/403:
- Komunikat UI + opcjonalny redirect do logowania

## 8. Interakcje użytkownika

- Zmiana `startDate`/`endDate` → reset listy, GET pierwszej strony, zapis filtrów w URL.
- Scroll do dołu → `onLoadMore` (jeśli `hasMore` i nie `isLoading`) → GET z `cursor`.
- Klik `Edytuj` → otwiera `EditWeightModal` (jeśli w oknie edycji i `source='patient'`).
- Submit edycji → PATCH → sukces: toast „Zaktualizowano”, aktualizacja wpisu w liście (optimistic lub po odpowiedzi).
- Klik `Usuń` → `DeleteConfirmationModal` → DELETE → sukces: toast „Usunięto”, usunięcie z listy.
- Klik `Potwierdź anomalię` lub „Cofnij potwierdzenie” → `ConfirmOutlierModal` → POST confirm(true|false) → sukces: odświeżenie wpisu w liście.

## 9. Warunki i walidacja

- Filtry:
  - `startDate`/`endDate` format ISO; `startDate <= endDate` → inaczej komunikat i blokada submitu
- Akcje edycji/usunięcia:
  - `source === 'patient'`
  - `now <= endOfNextDay(entry.measurementDate, Europe/Warsaw)` (UI warunkuje widoczność; serwer zwróci `400 edit_window_expired` jeśli niespełnione)
- W edycji:
  - `weight`: 30.0–250.0, max 1 decimal (regex), wymagane
  - `note`: opcjonalna, max 200 znaków
- Potwierdzanie anomalii:
  - `entry.isOutlier === true` (inaczej ukryj przycisk; serwer zwraca `400 not_outlier`)

## 10. Obsługa błędów

- GET:
  - 422 (format daty) → pokaż błąd przy filtrach
  - inne → `ErrorAlert` z komunikatem, przycisk „Spróbuj ponownie”
- PATCH:
  - 400 `invalid_weight` → walidacja pól (waga)
  - 400 `edit_window_expired` → zamknij modal, toast ostrzegawczy, odśwież listę
  - 403/404 → zamknij modal, toast, odśwież listę
  - 422 → wyświetl błędy pól
- DELETE:
  - 400 `edit_window_expired` → toast, odśwież listę
  - 403/404 → toast, odśwież listę
- POST confirm:
  - 400 `not_outlier` → toast informacyjny, odśwież listę
  - 403/404 → toast, odśwież listę
- 401/403 (dowolne) → komunikat i CTA do logowania
- Network error → toast + retry

## 11. Kroki implementacji

1) Routing i kontener strony
- Utwórz `src/pages/waga/historia.astro` z SSR i osadź `WeightHistoryView` (React island).
- Zabezpiecz dostęp (middleware auth + rola `patient`).

2) Główny komponent `WeightHistoryView`
- Stan filtrów, parsowanie/aktualizacja query params.
- Stan nieskończonej listy i modali.
- Toasty (re-use `ToastProvider` obecny globalnie).

3) Hook `useInfiniteWeightHistory`
- GET pierwszej strony po zmianie filtrów.
- Obliczanie `previousById` (do delty).
- `loadNextPage` z `cursor`; ochrona przed równoległymi żądaniami.

4) Komponenty listy
- `HistoryFilters` z walidacją i kontrolą URL.
- `WeightEntryList` + sentinel z `useIntersectionObserver`.
- `WeightEntryHistoryCard` (rozszerzenie UI + akcje).

5) Modale i mutacje
- `EditWeightModal`: formularz, walidacja (reuse z `useWeightEntry`), PATCH, aktualizacja listy.
- `DeleteConfirmationModal`: re-use `ui/ConfirmModal`, DELETE, aktualizacja listy.
- `ConfirmOutlierModal`: re-use `ui/ConfirmModal`, POST confirm, aktualizacja listy.

6) Stany brzegowe i UX
- Skeletony, empty state, błędy, retry.
- Blokada akcji przy `isLoading`/`isSubmitting`.
- Fokus trap i dostępność (role="dialog", aria-*).

7) Telemetria (opcjonalnie, jeśli dostępne helpery)
- Wywołania `trackEvent`: `view_history`, `edit_weight`, `outlier_confirmed`, `outlier_corrected`, `delete_weight`.

8) Testy ręczne
- Scenariusze z US-012..US-016: edycja w/po oknie, backfill, notatki, potwierdzanie anomalii, paginacja, filtry.

9) Optymalizacje
- Memoizacja listy i kart.
- Batch update listy po mutacjach (bez pełnego refetchu, o ile respons zawiera komplet rekordów).
- Ograniczenie re-renderów (klucze, stable props).


