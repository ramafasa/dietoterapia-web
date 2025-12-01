# Plan implementacji widoku Szczegóły Pacjenta (Dietetyk)

## 1. Przegląd

Widok przeznaczony dla dietetyka do pracy z pojedynczym pacjentem. Umożliwia:
- podgląd danych pacjenta i statystyk,
- przegląd historii wpisów (Dziś / Ten tydzień / Zakres dat),
- podgląd wykresu (30/90 dni z MA7, outliery, wpisy dietetyka),
- dodanie wagi w imieniu pacjenta (z notatką),
- zmianę statusu pacjenta (aktywny / wstrzymany / zakończony).

Zgodność z PRD, user stories US-020/021/022/023 i istniejącymi endpointami API.

## 2. Routing widoku

- Ścieżka: `/dietetyk/pacjenci/:patientId`
- Plik strony: `src/pages/dietetyk/pacjenci/[patientId].astro` (SSR)
- Autoryzacja: tylko rola `dietitian` (walidowane po stronie API; UI reaguje na 401/403)

## 3. Struktura komponentów

- `PatientDetailsPage` (container/entry z Astro + React Island)
  - `PatientHeader`
    - `StatusBadge` (inline/trigger)
    - `ChangeStatusModal` (portal)
    - `AddWeightForPatientModal` (portal)
  - `PatientStats`
  - `WeightHistoryTabs`
    - `WeightHistoryRangePicker` (pokazywany, gdy Zakres dat)
    - `WeightEntryList`
      - `WeightEntryCard` (N x)
    - `LoadMoreButton` (gdy są kolejne strony)
  - `WeightChart`

## 4. Szczegóły komponentów

### PatientDetailsPage
- Opis: Kontener strony; orkiestruje pobieranie danych, stan wybranych zakładek/okresów, modale i odświeżanie po mutacjach.
- Główne elementy:
  - Nagłówek + akcje (dodaj wagę, zmiana statusu)
  - Dwie kolumny (desktop): wykres + historia; układ stacked na mobile
- Interakcje:
  - Inicjalne pobranie: szczegóły pacjenta, historia (domyślnie „Ten tydzień”), wykres (30 dni)
  - Re-fetch po udanym POST/PATCH
- Walidacja:
  - Przy statusie `ended` wyłącz akcję „Dodaj wagę” (zgodnie z UX)
- Typy: `GetPatientDetailsResponse`, `GetPatientWeightEntriesResponse`, `GetPatientChartResponse`, `PatientDetailViewState` (VM)
- Propsy: brak (page root); `patientId` z paramów routingu

### PatientHeader
- Opis: Pasek nagłówka z imieniem/nazwiskiem, emailem, statusem (badge + zmiana), akcją „Dodaj wagę”.
- Elementy:
  - Imię i nazwisko; email
  - `StatusBadge` + przycisk „Zmień” (otwiera `ChangeStatusModal`)
  - Przycisk „Dodaj wagę” (otwiera `AddWeightForPatientModal`)
- Interakcje:
  - Klik „Zmień status” → otwarcie modala
  - Klik „Dodaj wagę” → otwarcie modala
- Walidacja:
  - Gdy `status === 'ended'` — przycisk „Dodaj wagę” disabled + tooltip z uzasadnieniem
- Typy: `GetPatientDetailsResponse['patient']`
- Propsy:
  - `patient: GetPatientDetailsResponse['patient']`
  - `onChangeStatus(): void`
  - `onAddWeight(): void`

### StatusBadge
- Opis: Badge z aktualnym statusem pacjenta.
- Elementy: znacznik/badge kolorystyczny (active/paused/ended)
- Interakcje: brak (read-only); klik badge może również otwierać modal (opcjonalnie)
- Walidacja: brak
- Typy: `patient.status` z user DTO
- Propsy:
  - `status: 'active' | 'paused' | 'ended' | null`

### ChangeStatusModal
- Opis: Modal zmiany statusu pacjenta.
- Elementy:
  - Select: `active | paused | ended`
  - Textarea: notatka (opcjonalna, ≤ 500 znaków; trafia do audytu po stronie backend)
  - Ostrzeżenia UX:
    - paused → „Przypomnienia wyłączone”
    - ended → „Retencja 24 miesiące. Nie można dodawać wpisów.”
  - CTA: Zapisz / Anuluj
- Interakcje:
  - Zapis → `PATCH /api/dietitian/patients/:patientId/status`
  - Po sukcesie: toast + zamknięcie modala + re-fetch szczegółów i historii/wykresu (jeśli wpływa na UX)
- Walidacja:
  - `status` wymagany, enumeracja ('active'|'paused'|'ended')
  - `note` maks. 500 znaków (frontend)
- Typy: `UpdatePatientStatusRequest`, `UpdatePatientStatusResponse`
- Propsy:
  - `isOpen: boolean`
  - `onClose(): void`
  - `patientId: string`
  - `currentStatus: 'active' | 'paused' | 'ended' | null`

### PatientStats
- Opis: Kafle ze statystykami pacjenta.
- Elementy: totalEntries, weeklyComplianceRate, currentStreak, longestStreak, lastEntry
- Interakcje: brak
- Walidacja: brak
- Typy: `GetPatientDetailsResponse['statistics']`
- Propsy:
  - `statistics: GetPatientDetailsResponse['statistics']`

### WeightHistoryTabs
- Opis: Zakładki: Dziś | Ten tydzień | Zakres dat; sekcja listy wpisów.
- Elementy:
  - Tabs (radio/segmented control)
  - `WeightHistoryRangePicker` pojawia się tylko dla zakładki Zakres
  - `WeightEntryList` + `LoadMoreButton` (gdy `pagination.hasMore`)
- Interakcje:
  - Zmiana zakładki -> trigger fetch GET historii z odpowiednimi query
  - Zmiana zakresu dat -> walidacja i fetch
  - Klik „Pokaż więcej” -> fetch z `cursor`
- Walidacja:
  - `view`: 'today' | 'week' | 'range'
  - Dla `range`: `startDate` i `endDate` wymagane; `startDate <= endDate`; format ISO; odfiltrowanie błędów (422 vs 400)
- Typy: `GetPatientWeightEntriesResponse`, `HistoryView` (VM), `HistoryFiltersVM`
- Propsy:
  - `patientId: string`
  - `defaultView?: HistoryView` (domyślnie 'week')

### WeightHistoryRangePicker
- Opis: Dwa inputy dat (YYYY-MM-DD) lub DatePicker (zgodny z ISO).
- Elementy: `startDate`, `endDate`, przycisk „Zastosuj”
- Interakcje:
  - Edycja dat → walidacja lokalna (format, relacja, zakres sensowności)
  - „Zastosuj” → fetch historii
- Walidacja:
  - Format ISO 8601 (YYYY-MM-DD)
  - `startDate <= endDate`
- Typy: `HistoryFiltersVM`
- Propsy:
  - `value: HistoryFiltersVM`
  - `onChange(value: HistoryFiltersVM): void`
  - `onApply(): void`

### WeightEntryList
- Opis: Lista wpisów wagi (read-only dla dietetyka).
- Elementy:
  - `WeightEntryCard` (N)
  - Empty state: „Brak danych dla wybranego okresu”
  - Error state
- Interakcje:
  - „Pokaż więcej” → stronicowanie kursorem
- Walidacja: brak
- Typy: `WeightEntryDTO[]`, `CursorPagination`
- Propsy:
  - `entries: WeightEntryDTO[]`
  - `hasMore: boolean`
  - `onLoadMore(): void`
  - `isLoading: boolean`
  - `error?: string | null`

### WeightEntryCard
- Opis: Karta pojedynczego wpisu z wagą, datą, źródłem, flagami, notatką.
- Elementy:
  - Data pomiaru, waga (kg)
  - Badges: `source` (patient/dietitian), `isBackfill`, `isOutlier`
  - Notatka (opcjonalna)
- Interakcje: brak
- Walidacja: brak
- Typy: `WeightEntryDTO`
- Propsy:
  - `entry: WeightEntryDTO`

### WeightChart
- Opis: Wykres liniowy 30/90 dni, linia MA7, oznaczenia outlierów i wpisów dietetyka, opcjonalna linia celu (post-MVP).
- Elementy:
  - Toggle okresu: 30 / 90
  - Chart.js LineChart
  - Legendy, tooltipy, wskaźniki dostępności (klawiatura)
- Interakcje:
  - Zmiana okresu → fetch GET chart
- Walidacja:
  - `period`: '30' | '90'
- Typy: `GetPatientChartResponse`, `ChartPeriod` (VM), `ChartDataPoint` (DTO)
- Propsy:
  - `patientId: string`
  - `defaultPeriod?: ChartPeriod` (domyślnie 30)

### AddWeightForPatientModal
- Opis: Modal formularza dodania wpisu przez dietetyka (z notatką).
- Elementy:
  - Number input: waga (30–250, step 0.1)
  - Date input: data pomiaru (domyślnie dziś, nie w przyszłość, max 7 dni wstecz)
  - Textarea: notatka (wymagana w UX: min 10, max 200 znaków)
  - CTA: Zapisz / Anuluj
- Interakcje:
  - Submit → `POST /api/dietitian/patients/:patientId/weight`
  - Po sukcesie: toast + zamknięcie + re-fetch historii i wykresu
- Walidacja:
  - `weight`: number, 30.0–250.0, dokładność 0.1
  - `measurementDate`: ISO; nie w przyszłości; max 7 dni wstecz
  - `note`: min 10, max 200 (frontend); backend dopuszcza opcjonalnie — UX wymusza wymagane
- Typy: `CreateWeightEntryDietitianRequest`, `CreateWeightEntryDietitianResponse`, `AddWeightForPatientFormVM`
- Propsy:
  - `isOpen: boolean`
  - `onClose(): void`
  - `patientId: string`

## 5. Typy

Wykorzystanie istniejących DTO z `src/types.ts`:
- `GetPatientDetailsResponse`, `PatientStatistics`, `PatientSummaryDTO`
- `GetPatientWeightEntriesResponse`, `WeightEntryDTO`, `CursorPagination`
- `GetPatientChartResponse`, `ChartDataPoint`, `WeightStatistics`
- `CreateWeightEntryDietitianRequest` / `Response`
- `UpdatePatientStatusRequest` / `Response`

Nowe typy ViewModel (VM) dla UI:
- `type HistoryView = 'today' | 'week' | 'range'`
- `type ChartPeriod = 30 | 90`
- `type PatientDetailViewState = { 
  selectedView: HistoryView; 
  chartPeriod: ChartPeriod; 
  range: HistoryFiltersVM; 
  isAddModalOpen: boolean; 
  isStatusModalOpen: boolean; 
  isLoading: boolean; 
  error: string | null 
}`
- `type AddWeightForPatientFormVM = { 
  weight: string; 
  measurementDate: string; 
  note: string; 
  errors?: { weight?: string; measurementDate?: string; note?: string; submit?: string } 
}`

Uwagi do typów:
- W polach formularzy stosujemy `string`, a konwersję/parsowanie do number/Date wykonujemy przed submit.
- `ChartPeriod` odpowiada parametrowi `period` endpointu chart (`'30'|'90'` → liczba).

## 6. Zarządzanie stanem

- Lokalny stan w wyspach React:
  - `useState`/`useReducer` dla `PatientDetailViewState`
  - Oddzielne stany i efekty w custom hookach do danych: loading, error, data, re-fetch
- Custom hooki:
  - `usePatientDetails(patientId)` → GET szczegóły
  - `useWeightHistory(patientId, { view, startDate, endDate })` → GET historia + stronicowanie kursorem
  - `useChartData(patientId, period)` → GET wykres
  - `useMutatePatientStatus(patientId)` → PATCH status
  - `useAddWeightForPatient(patientId)` → POST wpis
- Re-fetch:
  - Po mutacjach: odśwież szczegóły/statystyki (status może wpływać na dostępność akcji), historię i wykres.
- Concurrency i anulowanie:
  - Użyj `AbortController` w fetchach hooków, anuluj poprzednie requesty przy zmianach widoków/okresu.

## 7. Integracja API

1) GET `/api/dietitian/patients/:patientId`
- Response: `GetPatientDetailsResponse`
- Błędy: 401/403/404/400
- Zastosowanie: `usePatientDetails`

2) GET `/api/dietitian/patients/:patientId/weight`
- Query:
  - `view`: 'today' | 'week' | 'range'
  - `startDate`, `endDate` (jeśli `view=range`)
  - `limit` (domyślnie 30), `cursor`
- Response: `GetPatientWeightEntriesResponse`
- Błędy: 401/403/404/400/422
- Zastosowanie: `useWeightHistory`

3) GET `/api/dietitian/patients/:patientId/chart`
- Query: `period`: '30' | '90'
- Response: `GetPatientChartResponse`
- Błędy: 401/403/404/422
- Zastosowanie: `useChartData`

4) POST `/api/dietitian/patients/:patientId/weight`
- Body: `CreateWeightEntryDietitianRequest` (weight, measurementDate ISO, note)
- Response: `CreateWeightEntryDietitianResponse`
- Błędy: 401/403/404/409/422/400
- Zastosowanie: `useAddWeightForPatient`

5) PATCH `/api/dietitian/patients/:patientId/status`
- Body: `UpdatePatientStatusRequest` (status, note?)
- Response: `UpdatePatientStatusResponse`
- Błędy: 401/403/404/422/400
- Zastosowanie: `useMutatePatientStatus`

Obsługa statusów HTTP:
- 401 → przekierowanie do logowania / komunikat
- 403 → komunikat „Brak uprawnień”
- 404 → „Pacjent nie znaleziony”
- 409 → konflikt (duplikat wpisu)
- 422/400 → walidacja; pokaż błędy przy polach
- 500 → komunikat ogólny; możliwość ponów

## 8. Interakcje użytkownika

- Zmiana statusu:
  - Otwórz modal → wybór statusu → (opcjonalna notatka) → Zapisz → toast sukcesu → re-fetch → zaktualizuj badge i stany UI
- Dodanie wagi:
  - Otwórz modal → wypełnij wagę, datę, notatkę → Zapisz → toast sukcesu → zamknięcie → re-fetch historii i wykresu
  - Gdy status `ended` — przycisk niedostępny
- Przełączanie zakładek historii:
  - Dziś / Tydzień / Zakres → fetch odpowiednich danych; przy „Zakres” pokaż DatePicker
- Zakres dat:
  - Waliduj format i relację dat → fetch po „Zastosuj”
- Wykres:
  - Przełącz 30/90 → fetch chart
- Stronicowanie:
  - „Pokaż więcej” → dociągnięcie kolejnej paczki po `cursor`

## 9. Warunki i walidacja

Walidacje po stronie UI (zgodnie z API i PRD):
- Dodanie wagi (dietetyk):
  - `weight`: number 30–250; krok 0.1 (w input `step=0.1` + walidacja numeryczna)
  - `measurementDate`: ISO; nie w przyszłości; max 7 dni wstecz
  - `note`: min 10, max 200 znaków (UX)
- Zmiana statusu:
  - `status` ∈ {'active','paused','ended'}
  - `note`: max 500
- Historia:
  - `view` w zbiorze {'today','week','range'}
  - Dla `range`: `startDate` i `endDate` poprawny format ISO oraz `startDate <= endDate`
- Ograniczenia UX:
  - `status === 'ended'` → zablokuj „Dodaj wagę”

## 10. Obsługa błędów

- Mapowanie błędów API:
  - 401/403 → banner w widoku + CTA powrotu/ponowienie; opcjonalne przekierowanie
  - 404 (pacjent) → strona/sekcja „Nie znaleziono pacjenta”
  - 409 (duplicate_entry) → toast z informacją, że dla tej daty wpis już istnieje
  - 400 (backfill_limit_exceeded) → inline error przy dacie („max 7 dni wstecz”)
  - 422 (validation_error) → przypisanie do właściwych pól formularza
  - 500 → toast „Wystąpił błąd. Spróbuj ponownie.”
- Retry:
  - Przy listach i wykresie: przycisk „Spróbuj ponownie” w error state
- Anomalie/outlier:
  - Informacyjne oznaczenia w liście i na wykresie (badge, marker)

## 11. Kroki implementacji

1) Routing i szkielety:
- Dodaj stronę `src/pages/dietetyk/pacjenci/[patientId].astro` (SSR)
- Wyrenderuj wyspę React `PatientDetailsPage` z `patientId` z paramów

2) Typy i helpery:
- Zdefiniuj VM: `HistoryView`, `ChartPeriod`, `PatientDetailViewState`, `AddWeightForPatientFormVM`
- Przygotuj util do walidacji formularzy (waga, data, notatka)
- Przygotuj mappery statusu → badge/kolor/etykieta

3) Hooki danych:
- `usePatientDetails(patientId)`: fetch, loading, error
- `useWeightHistory(patientId, {view, startDate, endDate})`: fetch z kursorem, funkcja `loadMore`
- `useChartData(patientId, period)`: fetch + loading
- `useMutatePatientStatus(patientId)`: PATCH + optimistic lock (opcjonalnie)
- `useAddWeightForPatient(patientId)`: POST + obsługa błędów 400/409/422

4) Komponenty bazowe:
- `PatientHeader` + `StatusBadge`
- `PatientStats`
- `WeightHistoryTabs` + `WeightHistoryRangePicker` + `WeightEntryList` + `WeightEntryCard`
- `WeightChart` (Chart.js) z okresami 30/90

5) Modale:
- `ChangeStatusModal`: select statusu, textarea notatki, walidacje, wywołanie PATCH
- `AddWeightForPatientModal`: formularz, walidacje, wywołanie POST
  - Po sukcesie: zamknięcie + re-fetch historii i wykresu

6) Integracja i odświeżanie:
- Po mutacjach odśwież: szczegóły pacjenta, listę wpisów (aktywna zakładka), wykres (aktywny okres)
- Zaimplementuj globalne/toastowe powiadomienia sukcesu/błędów

7) UX i dostępność:
- Klawiatura: focus traps w modalach, aria-labels, role
- Skeletony/placeholdery ładowania dla listy i wykresu
- Empty/error states z jasnymi instrukcjami

8) Testy ręczne (scenariusze krytyczne):
- Zmiana statusu na każdą opcję + powrót
- Dodanie wagi: poprawne, poza zakresem, powyżej 7 dni, duplikat (409)
- Historia: Dziś/Tydzień/Zakres (prawidłowe/nieprawidłowe daty)
- Wykres: przełączanie 30/90
- Różne statusy pacjenta (blokada dodawania przy `ended`)

9) Instrumentacja (post-MVP opcjonalnie w UI):
- Emisja lokalnych eventów (view/interakcje) do własnej warstwy analytics lub logów (back-end już rejestruje zdarzenia z mutacji)

10) Performance:
- Debounce przy wyborze zakresu dat
- Anulowanie fetchy przy szybkich zmianach zakładek/okresów
- Paginate lista wpisów (cursor)

11) Final review:
- Zgodność z PRD i user stories
- Sprawdzenie stanów krawędziowych i dostępności
- Weryfikacja typów i kontraktów API

--- 

Uwagi końcowe:
- Strefa czasu: serwer wylicza tygodnie wg Europe/Warsaw — UI wyświetla daty zgodnie z locale użytkownika, ale nie modyfikuje logiki tygodni (źródło prawdy po stronie backend).
- Note w POST jest w backend opcjonalny — zgodnie z UX wymuszamy required w UI (min 10 znaków).

