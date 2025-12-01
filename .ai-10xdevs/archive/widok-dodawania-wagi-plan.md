# Plan implementacji widoku „Dodawanie wagi” (Dashboard pacjenta)

## 1. Przegląd

Widok przeznaczony dla pacjenta, dostępny po zalogowaniu, umożliwiający:
- szybkie dodanie dzisiejszej wagi (1–2 kliknięcia),
- wgląd w status obowiązku tygodniowego,
- podgląd ostatnich 7 wpisów z oznaczeniami (backfill, outlier, źródło),
- obsługę ostrzeżeń o anomaliach z opcją potwierdzenia/korekty,
- przyjazny UX na mobile (sticky widget, bottom nav).

Zgodność z PRD i user stories: US-010, US-011, US-013, US-014, US-016.

## 2. Routing widoku

- Ścieżka: `/waga`
- Dostęp: authenticated, role: `patient` (middleware już egzekwuje)
- Plik strony: `src/pages/waga/index.astro` (zastąpienie placeholderów realnymi komponentami)

## 3. Struktura komponentów

```
WagaPage (/waga)
├─ WelcomeHero (opcjonalny nagłówek)
├─ WeightEntryWidget  ← główny widget dodawania
│  ├─ OutlierConfirmModal (warunkowo)
│  └─ Toast/Snackbar (sukces/błąd)
├─ WeeklyStatusBadge
├─ RecentEntriesList
│  └─ WeightEntryCard × N
└─ PatientBottomNav (mobile)
```

## 4. Szczegóły komponentów

### WeightEntryWidget
- Opis: Formularz szybkiego dodania wagi (waga, data, notatka). Wspiera walidację klienta, obsługuje POST `/api/weight`, pokazuje ostrzeżenia o anomaliach i oferuje potwierdzenie/korektę.
- Główne elementy:
  - `<input type="number" inputMode="decimal">` dla wagi (30–250, step 0.1, max 1 miejsce po przecinku)
  - `<input type="date">` dla `measurementDate` (domyślnie dziś; do 7 dni wstecz)
  - `<textarea>` dla notatki (opcjonalnie, max 200 znaków)
  - `<button>` Submit (z loaderem), disabled przy niepoprawnych danych lub duplikacie dnia
  - Informacja, że wpis dzisiejszy już istnieje (jeśli dotyczy)
  - Wsparcie dla klawisza skrótu Ctrl+Enter (submit)
- Obsługiwane interakcje:
  - Zmiana wagi, daty, notatki (onChange/onBlur walidacja)
  - Submit (Enter/Ctrl+Enter/kliknięcie)
  - Wyświetlenie OutlierConfirmModal po 201 z `warnings[0].type === 'anomaly_detected'`
- Obsługiwana walidacja:
  - Waga: wymagana, liczba, 30–250, max 1 miejsce po przecinku
  - Data: nie przyszłość, nie starsza niż 7 dni
  - Notatka: ≤ 200 znaków
  - Jeden wpis/dzień: jeśli API zwróci 409 duplicate_entry → komunikat i disabled submit dla dzisiejszej daty
- Typy:
  - DTO: `CreateWeightEntryRequest`, `CreateWeightEntryResponse`, `AnomalyWarning`
  - ViewModel: `WeightEntryFormVM` (rozszerzenie `WeightEntryFormData` o stany UI)
- Propsy:
  - `onSuccess?: () => void` (odświeżenie listy po dodaniu)
  - `onSkip?: () => void` (dla przepływów onboardingowych)

### OutlierConfirmModal
- Opis: Modal wyświetlany przy wykryciu anomalii (>3 kg/24h). Pozwala potwierdzić wartość lub przejść do korekty (edycja formularza).
- Główne elementy:
  - Tekst ostrzeżenia z poprzednią wartością, datą i wielkością zmiany
  - Przyciski: „Potwierdź” i „Popraw”
- Obsługiwane interakcje:
  - „Potwierdź” → (docelowo) POST `/api/weight/:id/confirm` z `confirmed: true`
  - „Popraw” → zamknij modal i fokus na polu wagi lub notatki
- Walidacja:
  - Brak (działa na ostatnim utworzonym wpisie)
- Typy:
  - DTO (docelowo): `ConfirmOutlierRequest`, `ConfirmOutlierResponse`
  - ViewModel: `OutlierWarningVM` (sformatowana wiadomość + dane do UI)
- Propsy:
  - `warning: AnomalyWarning`
  - `entryId: string`
  - `onConfirm: () => Promise<void>`
  - `onEdit: () => void`

### WeeklyStatusBadge
- Opis: Komponent prezentujący status obowiązku tygodniowego (na bazie ostatnich wpisów).
- Główne elementy:
  - Badge: „✅ Obowiązek spełniony” lub „⏳ Brak wpisu w tym tygodniu”
  - Tooltip (opcjonalnie): zasady tygodnia (pn 00:00 – nd 23:59, strefa Europe/Warsaw)
- Interakcje: brak (prezentacyjny)
- Walidacja: obliczenia po stronie klienta na bazie `entries`
- Typy:
  - ViewModel: `WeeklyStatus` { met: boolean; lastEntryDate?: string }
- Propsy:
  - `entries: WeightEntryDTO[]`

### RecentEntriesList
- The goal: Pokazać ostatnie 7 wpisów z oznaczeniami i deltą wagi
- Główne elementy:
  - Nagłówek i lista kart
  - Skeleton na czas ładowania
- Interakcje:
  - (opcjonalnie) kliknięcie elementu → przyszła edycja
- Walidacja: brak (prezentacja)
- Typy:
  - DTO: `GetWeightEntriesResponse.entries: WeightEntryDTO[]`
  - ViewModel: `RecentEntryVM` (sformatowane daty, delta do poprzedniego, ikonki badge)
- Propsy:
  - `entries: WeightEntryDTO[]`
  - `isLoading?: boolean`

### WeightEntryCard
- Opis: Pojedynczy wpis w historii
- Główne elementy:
  - Data pomiaru, waga
  - Badges: backfill, outlier, source (👩‍⚕️ dietetyk / 👤 pacjent)
  - Delta vs poprzedni dzień (jeśli dostępna)
- Interakcje: (opcjonalnie) akcje kontekstowe w przyszłości (edycja)
- Walidacja: brak
- Typy:
  - `WeightEntryDTO` + `RecentEntryVM`
- Propsy:
  - `entry: WeightEntryDTO`
  - `previous?: WeightEntryDTO`

### PatientBottomNav (mobile)
- Opis: Dolna nawigacja dla pacjenta (Dashboard, Historia, Ustawienia)
- Interakcje: nawigacja
- Walidacja: brak
- Propsy: brak (statyczne linki/nawigacja)

## 5. Typy

- Wykorzystane (istniejące):
  - `CreateWeightEntryRequest`, `CreateWeightEntryResponse`, `AnomalyWarning`
  - `GetWeightEntriesResponse`, `WeightEntryDTO`
  - `WeightEntryFormData`, `WeightEntryErrors`
- Nowe ViewModel-e:
  - `WeightEntryFormVM`:
    - `weight: string`
    - `measurementDate: string`
    - `note?: string`
    - `isSubmitting: boolean`
    - `submitError?: string`
    - `isDuplicateToday?: boolean` (na bazie błędu 409)
  - `OutlierWarningVM`:
    - `message: string`
    - `previousWeight: number`
    - `previousDate: string`
    - `change: number`
  - `WeeklyStatus`:
    - `met: boolean`
    - `lastEntryDate?: string`
  - `RecentEntryVM`:
    - `id: string`
    - `date: string` (YYYY-MM-DD)
    - `weight: number`
    - `delta?: number`
    - `isBackfill: boolean`
    - `isOutlier: boolean`
    - `source: 'patient' | 'dietitian'`

## 6. Zarządzanie stanem

- Formularz: istnieje hook `useWeightEntry()`:
  - Stan: `formData`, `errors`, `isSubmitting`
  - Walidacja: waga (30–250, max 1 decimal), data (≤ 7 dni wstecz, nie przyszłość)
  - Submit: POST `/api/weight`, obsługa błędów, zwrot `warnings`
- Historia: nowy hook `useWeightHistory(limit = 7)`:
  - Stan: `entries`, `isLoading`, `error`
  - Efekt: GET `/api/weight?limit=7`
  - Metody: `reload()` (po sukcesie submitu), cache na pamięci komponentu
- Status tygodniowy: pomocnicza funkcja `computeWeeklyStatus(entries)` zwraca `WeeklyStatus`
- Modal outlier: lokalny stan w `WeightEntryWidget`:
  - `pendingOutlier?: { entryId: string; warning: AnomalyWarning }`

## 7. Integracja API

- POST `/api/weight` (patient only):
  - Request: `CreateWeightEntryRequest` { weight: number; measurementDate: string; note?: string }
  - Response: `CreateWeightEntryResponse` { entry: {...}, warnings: AnomalyWarning[] }
  - Obsługa statusów:
    - 201: sukces, ostrzeżenia opcjonalne (obsłużyć modal)
    - 409 duplicate_entry: zasygnalizować duplikat (disabled submit dla tego dnia)
    - 400 backfill_limit_exceeded: komunikat, podświetlić pole daty
    - 422 validation_error: wypisać per-field
    - 401/403: chronione przez stronę; fallback toast + redirect (teoretycznie)
- GET `/api/weight?limit=7`:
  - Response: `GetWeightEntriesResponse` { entries: WeightEntryDTO[]; pagination }
  - Nagłówki: `Cache-Control: no-store` (szanujemy, nie cache’ować)
- (Docelowo) POST `/api/weight/:id/confirm`:
  - Request: `ConfirmOutlierRequest` { confirmed: boolean }
  - Response: `ConfirmOutlierResponse`
  - Backend po stronie projektu: brak implementacji – UI przygotowane pod integrację

## 8. Interakcje użytkownika

- Wpis wagi:
  - Wprowadzenie wagi → walidacja live (blokuj litery, dozwól liczby i kropkę)
  - Zmiana daty → walidacja przedziału (≤7 dni, nie przyszłość)
  - Notatka (opcjonalna, licznik znaków)
  - Submit → loader, sukces: toast „Dodano wagę”, odśwież historię
- Anomalia:
  - Po sukcesie z ostrzeżeniem → modal
  - „Potwierdź” → (docelowo) wywołanie confirm endpoint; tymczasowo: schowaj modal
  - „Popraw” → zamknij modal, fokus na polu wagi
- Historia:
  - Przegląd ostatnich 7 wpisów z oznaczeniami (backfill/outlier/źródło)
- Mobile:
  - Sticky widget na górze ekranu przy scrollu
  - Dolna nawigacja

## 9. Warunki i walidacja

- Waga:
  - required, numeric, 30 ≤ waga ≤ 250, max 1 decimal (regex)
- Data:
  - format `YYYY-MM-DD` (input type=date)
  - nie przyszłość, nie starsza niż 7 dni (backfill limit)
- Notatka: ≤ 200 znaków
- Jeden wpis/dzień:
  - jeśli próba duplikatu, API zwraca 409 → komunikat „Wpis dla tej daty już istnieje”, disable submit dla tej daty
- Status tygodniowy:
  - Oblicz ze zwróconych `entries` (tydzień pn–nd, Europe/Warsaw)
- Anomalia:
  - Jeśli `warnings[0].type === 'anomaly_detected'` → pokaż modal

## 10. Obsługa błędów

- 401/403: strona już przekierowuje; w komponentach – wyświetlić ogólny komunikat jeśli fetch zwróci 401/403
- 409 duplicate_entry: clear submit, komunikat i zablokowanie ponownej próby dla tej daty
- 400 backfill_limit_exceeded: error pod polem daty + toast
- 422 validation_error: mapowanie `details[]` do `WeightEntryErrors`
- 500/internal: toast „Wystąpił błąd serwera. Spróbuj ponownie.”
- Network/offline:
  - Pokaż informację o braku połączenia; umożliwić ponów próbę
  - Nie buforujemy wpisów offline (poza MVP)

## 11. Kroki implementacji

1) Strona `/waga`:
   - Podmień placeholdery w `src/pages/waga/index.astro` na realne komponenty:
     - zaimportuj i wyrenderuj `WeightEntryWidget`, `WeeklyStatusBadge`, `RecentEntriesList`, `PatientBottomNav`.
2) Hook do historii:
   - Utwórz `useWeightHistory(limit = 7)` (w `src/hooks/useWeightHistory.ts`):
     - fetch GET `/api/weight?limit=7`
     - stan: `entries`, `isLoading`, `error`, metoda `reload()`
3) Integracja formularza:
   - W `WeightEntryWidget` użyj istniejącego `useWeightEntry()`
   - Po `handleSubmit()` sukces → `onSuccess?.()` → `useWeightHistory.reload()`
   - Obsłuż błędy: mapowanie statusów (409/400/422) na komunikaty i stany
4) Anomalia – modal:
   - Jeżeli `CreateWeightEntryResponse.warnings` zawiera `anomaly_detected`:
     - Ustaw stan `pendingOutlier`
     - Otwórz `OutlierConfirmModal`
     - „Potwierdź”: tymczasowo zamknij modal; docelowo wywołaj POST `/api/weight/:id/confirm`
     - „Popraw”: zamknij modal, fokus na polu wagi
5) WeeklyStatusBadge:
   - Zaimplementuj `computeWeeklyStatus(entries)` i przekaż wynik do komponentu
6) RecentEntriesList + WeightEntryCard:
   - Mapuj `entries` do kart; oblicz deltę względem poprzedniego
   - Pokaż badge: backfill, outlier, source
7) UX i mobilność:
   - Zapewnij sticky widget (CSS na mobile), focus management, aria-live dla komunikatów
   - Integracja z `ToastProvider` dla success/error
8) Testy manualne:
   - Scenariusze: poprawny wpis, duplikat dnia, backfill >7 dni, nieprawidłowa waga, anomalia
   - Mobile viewporty 360–414 px, focus/keyboard-access
9) Telemetria (opcjonalnie post-MVP):
   - Wywołania eventów: `view_add_weight`, `add_weight_patient`, `outlier_flagged`


