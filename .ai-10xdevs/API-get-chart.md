## API Endpoint Implementation Plan: GET /api/dietitian/patients/:patientId/chart

### 1. Przegląd punktu końcowego

- Cel: Zwraca dane do wykresu wagi pacjenta dla dietetyka, obejmujące listę punktów (z 7‑dniową średnią kroczącą) oraz statystyki agregujące dla okresu 30 lub 90 dni.
- Odbiorcy: wyłącznie użytkownicy z rolą `dietitian` (RBAC).
- Dane wyjściowe: `patient` (skrót danych pacjenta) + `chartData` (punkty wykresu, statystyki, opcjonalnie `goalWeight`).

### 2. Szczegóły żądania

- Metoda HTTP: GET
- Struktura URL: `/api/dietitian/patients/:patientId/chart`
- Parametry:
  - Wymagane:
    - `patientId` (param ścieżki): UUID pacjenta
  - Opcjonalne (query):
    - `period`: "30" | "90" (dni, domyślnie "30")
- Request Body: brak

Walidacja wejścia:
- `patientId`: poprawny UUID.
- `period`: dozwolone wartości: "30", "90"; w innym przypadku błąd wejścia (400).

### 3. Wykorzystywane typy

- DTOs (z `src/types.ts`):
  - `PatientSummaryDTO` (id, firstName, lastName, status)
  - `ChartDataPoint` (date, weight, source, isOutlier, ma7)
  - `WeightStatistics` (startWeight, endWeight, change, changePercent, avgWeeklyChange, trendDirection)
  - `GetPatientChartResponse` (patient, chartData: { entries, statistics, goalWeight })
- Command modele: brak mutacji — nie wymagane. (Opcjonalnie: tracking eventów analitycznych może użyć `CreateEventCommand`, ale to poza zakresem MVP).

### 4. Szczegóły odpowiedzi

- Statusy:
  - 200 OK — sukces
  - 400 Bad Request — niepoprawny `period` lub `patientId`
  - 401 Unauthorized — brak sesji
  - 403 Forbidden — rola inna niż `dietitian`
  - 404 Not Found — pacjent nie istnieje (lub nie jest pacjentem)
  - 500 Internal Server Error — błąd serwera
- Struktura (200 OK):
  - `patient`: `PatientSummaryDTO`
  - `chartData`:
    - `entries`: `ChartDataPoint[]` (posortowane rosnąco po dacie pomiaru)
    - `statistics`: `WeightStatistics`
    - `goalWeight`: `number | null` (MVP: `null`, dopóki nie dodamy źródła celu)

Uwagi dot. wartości brzegowych:
- Gdy brak wpisów w okresie:
  - `entries`: `[]`
  - `statistics`: wartości neutralne (patrz sekcja „Przepływ danych” — logika obliczeń)
  - `goalWeight`: `null`

### 5. Przepływ danych

1. AuthN:
   - Pobierz sesję przez Lucia (`src/lib/auth.ts`) — brak sesji => 401.
2. RBAC:
   - Sprawdź rolę użytkownika — jeśli nie `dietitian` => 403.
3. Walidacja wejścia:
   - `patientId`: UUID.
   - `period`: parsuj do liczby, akceptuj 30 lub 90, domyślnie 30; w przeciwnym razie 400.
4. Weryfikacja pacjenta:
   - Upewnij się, że `patientId` istnieje w tabeli użytkowników i ma rolę `patient`. Brak => 404.
5. Zakres dat:
   - `endDate` = dziś (UTC, ustandaryzowane do początku dnia dla porównań dziennych).
   - `startDate` = `endDate - (periodDays - 1)` (obejmujemy dzisiejszy dzień).
6. Pobranie danych:
   - Repozytorium wagi (`src/lib/repositories/weightEntryRepository.ts`): metoda `findByPatientAndDateRange(patientId, startDate, endDate)` zwracająca pełne wpisy (id, userId, weight, measurementDate, source, isOutlier, note, createdAt, updatedAt).
   - Wyniki posortuj po `measurementDate` ASC, a przy równej dacie po `createdAt` ASC (stabilność).
7. Mapowanie do DTO:
   - Konwersja `weight` z DECIMAL/tekst → `number`.
   - `date`: ISO YYYY-MM-DD (bez czasu).
   - `source`: przepuść z wpisu.
   - `isOutlier`: przepuść z wpisu.
8. Obliczenia:
   - 7‑dniowa średnia krocząca (`ma7`):
     - Liczona na bazie do 7 ostatnich dostępnych wpisów (okno „rolling” po wejściach, nie po dniach).
     - Jeśli mniej niż 7 wpisów, licz średnią z dostępnych (1..6).
     - Zaokrąglij do 1 miejsca po przecinku.
   - Statystyki:
     - `startWeight`: waga z pierwszego wpisu w okresie (jeśli brak — patrz niżej).
     - `endWeight`: waga z ostatniego wpisu w okresie.
     - `change`: `endWeight - startWeight` (zaokrąglij do 1 miejsca po przecinku).
     - `changePercent`: gdy `startWeight > 0` → `(change / startWeight) * 100`, w przeciwnym razie `0`; zaokrąglij do 1 miejsca po przecinku.
     - `avgWeeklyChange`: jeśli jest >= 2 wpisów, użyj średniego tempa dziennego na bazie różnicy i liczby dni między pierwszą a ostatnią datą wpisu, przeskalowane do 7 dni; w przeciwnym razie `0` (zaokrąglone do 1 miejsca po przecinku).
     - `trendDirection`: próg 0.1 kg:
       - `change > 0.1` → "increasing"
       - `change < -0.1` → "decreasing"
       - w pozostałych przypadkach → "stable"
   - Brak wpisów:
     - `entries`: `[]`
     - `statistics`: wszystkie wartości 0, `trendDirection: "stable"`
9. Cel wagi:
   - MVP: `goalWeight = null` (brak źródła prawdy w schemacie).
10. Złożenie odpowiedzi w formacie `GetPatientChartResponse` i zwrot 200.

### 6. Względy bezpieczeństwa

- AuthN & RBAC:
  - Wymagana aktywna sesja Lucia.
  - Wymagana rola `dietitian`.
- IDOR:
  - MVP: brak relacji dietetyk–pacjent może pozwalać na wgląd w dane dowolnego pacjenta przez dowolnego dietetyka. Ryzyko: średnie. Mitigacja (post‑MVP): tabela relacji i filtracja dostępu.
- Ograniczenie PII:
  - Zwracamy minimalny zestaw danych pacjenta (`PatientSummaryDTO`).
- SQL Injection:
  - Drizzle ORM zapewnia parametryzację zapytań.
- Rate limiting:
  - Wyłączone w MVP (wg `tech-stack-waga.md`). Ryzyko nadużyć niskie dla odczytu; można dodać post‑MVP.
- Logowanie błędów:
  - Vercel logs + opcjonalne `events` (typ: `api_error`, post‑MVP).

### 7. Obsługa błędów

- 400 Bad Request:
  - Niepoprawny `period` (nie "30" ani "90")
  - Niepoprawny format `patientId` (nie UUID)
- 401 Unauthorized:
  - Brak/nieprawidłowa sesja
- 403 Forbidden:
  - Użytkownik nie ma roli `dietitian`
- 404 Not Found:
  - `patientId` nie istnieje lub nie jest pacjentem
- 500 Internal Server Error:
  - Problem z bazą, inne wyjątki

Format błędów: korzystaj z spójnego kształtu `ApiError` (`src/types.ts`), np.:
```json
{
  "error": "Bad Request",
  "message": "Invalid period. Allowed values: 30, 90",
  "statusCode": 400
}
```

### 8. Rozważania dotyczące wydajności

- Indeksy DB:
  - Na tabeli wpisów wagi: `(user_id, measurement_date)` — kluczowe dla zakresu dat.
- Limit zakresu:
  - Tylko 30 lub 90 dni — kontroluje ilość danych.
- Obliczenia po stronie serwera:
  - MA7 i statystyki są liniowe względem liczby wpisów (N ≤ kilka setek); w pamięci.
- Serializacja:
  - Zaokrąglenia liczb ograniczają rozmiar odpowiedzi; daty jako `YYYY-MM-DD`.

### 9. Kroki implementacji

1) Endpoint API
- Plik: `src/pages/api/dietitian/patients/[patientId]/chart.ts`
- Implementacja:
  - Pobierz `patientId` z params.
  - Pobierz `period` z query: `const periodDays = parseInt(period ?? "30", 10)`.
  - Walidacja: `periodDays ∈ {30, 90}`, `patientId` jest UUID → w razie błędu zwróć 400 z `ApiError`.
  - AuthN: pobierz użytkownika z sesji (Lucia); w razie braku → 401.
  - RBAC: sprawdź `user.role === 'dietitian'`; w razie braku → 403.
  - Weryfikuj pacjenta: zapytanie do `users` w Drizzle; musi istnieć i mieć rolę `patient`; inaczej → 404.
  - Wyznacz `startDate`, `endDate`.
  - Pobierz wpisy wagi przez repo (patrz punkt 2).
  - Zmapuj do `ChartDataPoint[]` (konwersje i formatowanie dat).
  - Oblicz MA7 i `WeightStatistics`.
  - Złóż `GetPatientChartResponse` i zwróć 200.

2) Warstwa repozytorium
- Plik: `src/lib/repositories/weightEntryRepository.ts`
- Dodaj metodę:
  - `findByPatientAndDateRange(patientId: string, start: Date, end: Date): Promise<WeightEntry[]>`
  - Zapytanie Drizzle: `where user_id = patientId AND measurement_date BETWEEN start AND end ORDER BY measurement_date ASC, created_at ASC`

3) Warstwa serwisu (preferowana enkapsulacja logiki)
- Plik: `src/lib/services/patientService.ts` (istniejący)
- Dodaj funkcję:
  - `getPatientChartData(patientId: string, periodDays: 30 | 90): Promise<GetPatientChartResponse>`
  - Wewnątrz: kroki 5–9 z sekcji „Przepływ danych”.
  - Zwracaj gotowy obiekt `GetPatientChartResponse`.

4) Walidacja i pomocnicze
- Util dat:
  - Funkcja do normalizacji daty (początek dnia w UTC) i formatowania `YYYY-MM-DD`.
- Funkcja MA7:
  - Rolling-window na wejściach; zaokrąglenie do 1 miejsca.
- Funkcja statystyk:
  - Oblicza `WeightStatistics` zgodnie z regułami z sekcji „Obliczenia”.

5) Obsługa błędów
- Spójny kształt `ApiError`.
- `try/catch` na poziomie handlera endpointu — mapowanie wyjątków do 500 (oraz log do Vercel).

6) Testy (zakres minimalny)
- Jednostkowe (serwis):
  - MA7 dla <7 i ≥7 wpisów.
  - Statystyki dla: brak wpisów, pojedynczy wpis, wiele wpisów, rosnący/malejący trend.
- Integracyjne (endpoint):
  - 401 bez sesji, 403 bez roli, 400 zły period, 404 brak pacjenta, 200 z danymi.

7) Dokumentacja
- Opisz endpoint w `.ai-10xdevs/api-plan.md` (odsyłacz) i utrzymaj spójność typów z `src/types.ts`.

### 10. Scenariusze błędów i mapowanie statusów

- Brak sesji → 401
- Rola ≠ `dietitian` → 403
- `patientId` nieprawidłowe (format) → 400
- `period` spoza zbioru {"30","90"} → 400
- Pacjent nie istnieje / rola ≠ `patient` → 404
- Błąd DB / niespodziewany wyjątek → 500

### 11. Zmiany w strukturze/projektach (opcjonalne, post‑MVP)

- Źródło celu wagi (`goalWeight`) w schemacie DB i serwis do odczytu celu.
- Relacja dietetyk–pacjent w DB z egzekwowaniem IDOR.
- Tracking eventów (`view_patient_chart`) w tabeli `events`.
- Rate limiting dla endpointów odczytu (np. IP/user).


