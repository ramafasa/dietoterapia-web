# API Endpoint Implementation Plan: GET `/api/weight` — historia pomiarów wagi (pacjent)

## 1. Przegląd punktu końcowego
Punkt końcowy zwraca historię własnych wpisów wagi zalogowanego **pacjenta**, z obsługą filtrowania po datach i stronicowania typu **keyset** (`cursor` oparty na `measurementDate`). Implementacja musi być spójna ze stackiem: **Astro (SSR) + Vercel**, **Neon Postgres + Drizzle ORM**, **Lucia v3** (sesje/RBAC), bez limitowania requestów w MVP, z logowaniem w Vercel oraz opcjonalnym zapisem zdarzeń w tabeli `events`.

---

## 2. Szczegóły żądania
- **Metoda HTTP:** `GET`
- **URL:** `/api/weight`
- **Parametry zapytania (query):**
  - **Wymagane:** brak
  - **Opcjonalne:**
    - `startDate` — ISO 8601 (np. `2025-10-01`); interpretowane jako początek dnia w strefie **Europe/Warsaw**.
    - `endDate` — ISO 8601 (np. `2025-10-30`); interpretowane jako koniec dnia w strefie **Europe/Warsaw**.
    - `limit` — liczba wyników (domyślnie `30`, maks. `100`).
    - `cursor` — ISO 8601 `measurementDate` z ostatniego elementu poprzedniej strony (keyset).
- **Nagłówki:**
  - `Cookie: session=...` — sesja Lucia (wymagana).
- **Body:** brak.

---

## 3. Wykorzystywane typy
**DTOs (Response / transport):**
- `WeightEntryDto`  
  ```ts
  type WeightEntryDto = {
    id: string
    userId: string
    weight: number            // 30.0–250.0 (skala 0.1; w DB DECIMAL(4,1))
    measurementDate: string   // ISO 8601 z ofsetem, np. "2025-10-30T08:00:00+02:00"
    source: 'patient' | 'dietitian'
    isBackfill: boolean
    isOutlier: boolean
    outlierConfirmed: boolean | null
    note: string | null
    createdAt: string         // ISO 8601 UTC
    updatedAt: string | null  // ISO 8601 UTC
  }
  ```
- `PaginationDto`  
  ```ts
  type PaginationDto = { hasMore: boolean; nextCursor: string | null }
  ```
- `WeightHistoryResponse`  
  ```ts
  type WeightHistoryResponse = { entries: WeightEntryDto[]; pagination: PaginationDto }
  ```

**Query models (wejście):**
```ts
type WeightHistoryQuery = {
  userId: string             // z sesji
  startDate?: string         // ISO (data)
  endDate?: string           // ISO (data)
  limit?: number             // 1..100 (domyślnie 30)
  cursor?: string            // ISO (pełny timestamp)
}
```

**Warstwa domenowa / serwisowa:**
- `WeightEntryService`
  - `listPatientEntries(q: WeightHistoryQuery): Promise<WeightHistoryResponse>`
- `WeightEntryRepository`
  - `findByUserWithFilters(q: RepoQuery): Promise<WeightEntryRow[]>`
- `WeightEntryMapper`
  - `toDto(row: WeightEntryRow): WeightEntryDto`

---

## 3. Szczegóły odpowiedzi
- **200 OK** — zwraca:
  ```json
  {
    "entries": [ /* WeightEntryDto[] */ ],
    "pagination": { "hasMore": true, "nextCursor": "2025-10-01T08:00:00+02:00" }
  }
  ```
- **Kody błędów (patrz sekcja 6):** `401`, `403`, `400/422`, `500`.

> Uwaga dot. kodów: trzymamy się standardu (400 dla nieprawidłowych danych), ale **dla nieprawidłowego formatu daty** zwracamy **422**, zgodnie ze specyfikacją trasy. Reszta walidacji (np. `limit > 100`) → **400**.

---

## 4. Przepływ danych
1. **Auth (Lucia v3 / SSR):** middleware odczytuje sesję i role; brak sesji → `401`, rola ≠ `patient` → `403`.
2. **Walidacja query (Zod):**
   - `startDate`, `endDate` — parsowanie ISO **daty** i przekształcenie do przedziału `[startTz, endTz]` w **Europe/Warsaw**.
   - `cursor` — parsowanie jako pełny timestamp ISO.
   - `limit` — domyślnie `30`, zakres `1..100`.
3. **Budowa filtra (service):**
   - `userId = session.user.id`.
   - Zakres dat → na kolumnę `measurement_date` (TIMESTAMPTZ).
   - Paginacja **keyset**: sort `measurement_date DESC`; jeśli `cursor`, filtr `measurement_date < cursor`.
4. **Repo (Drizzle ORM → Postgres w Neon):**
   - Zapytanie po indeksie `(user_id, measurement_date DESC)`; *offset* nie jest używany.
   - Limit `limit + 1` do detekcji `hasMore`.
   - Unikalność 1 wpis/dzień gwarantowana na poziomie DB (UTC/tz Warsaw w unikalnym indeksie).  
5. **Mapowanie i odpowiedź:**
   - `entries = rows.slice(0, limit)`; `hasMore = rows.length > limit`.
   - `nextCursor = entries.at(-1)?.measurementDate ?? null`.
6. **Logging/analytics (opcjonalnie w MVP):**
   - Zdarzenie `view_weight_history` (jeśli zdecydujemy się rozszerzyć tabelę `events`), z minimalnym `properties` (np. `{ source: 'api' }`). W MVP analityka własna jest przewidziana i tabela `events` istnieje.

**Uzasadnienie przepływu w kontekście stacku:** SSR umożliwia dostęp do sesji/cookies, Neon + Drizzle zapewnia type-safe dostęp do Postgresa, a RBAC w Lucii upraszcza kontrolę roli pacjenta.

---

## 5. Względy bezpieczeństwa
- **Uwierzytelnienie i autoryzacja:** wyłącznie sesje Lucia; endpoint dostępny **tylko** dla roli `patient`. Żadnych parametrów `userId` w query — chroni przed IDOR.
- **Zakres danych:** zwracamy tylko wiersze z `user_id == session.user.id`.
- **Walidacja wejścia:** ścisła walidacja ISO 8601, limity ilości (`limit <= 100`), `startDate <= endDate`.
- **SQLi:** Drizzle parametryzuje zapytania.
- **Strefy czasowe i prywatność:** interpretujemy filtry dat w strefie **Europe/Warsaw** (spójnie z unikalnością „1 wpis/dzień”), minimalizujemy ryzyko ujawnienia danych przy granicach doby.
- **RODO / lokalizacja danych:** Neon w UE (Frankfurt/Amsterdam), brak wysyłania danych poza UE; zalecany **DPIA** i audyt logów operacji.
- **Rate limiting:** **brak w MVP** (świadoma decyzja); w razie nadużyć — dołożyć Upstash Redis + `@upstash/ratelimit` post-MVP.
- **Logi i PII:** w logach Vercel nie zapisujemy treści cookies ani surowych zapytań; maskujemy identyfikatory tam, gdzie to możliwe. Error tracking zewnętrzny (np. Sentry) **poza MVP**.

---

## 6. Obsługa błędów
**Konwencje i przykłady odpowiedzi (JSON):**
- `401 Unauthorized` — brak/nieprawidłowa sesja:
  ```json
  { "error": "unauthorized", "message": "Authentication required." }
  ```
- `403 Forbidden` — rola inna niż `patient`:
  ```json
  { "error": "forbidden", "message": "Patient role required." }
  ```
- `400 Bad Request` — walidacja biznesowa:
  - `limit` poza zakresem (`> 100` lub `< 1`)
  - `startDate > endDate`
  - konflikt parametrów
  ```json
  { "error": "bad_request", "message": "Invalid query parameters." }
  ```
- `422 Unprocessable Entity` — **wyłącznie** nieprawidłowy format daty (`startDate`, `endDate`, `cursor` niezgodne z ISO):
  ```json
  { "error": "unprocessable_entity", "message": "Invalid date format." }
  ```
- `500 Internal Server Error` — niespodziewane:
  ```json
  { "error": "internal_error", "message": "Unexpected server error." }
  ```

**Rejestrowanie błędów:** w MVP — logi Vercel; opcjonalnie zapis zdarzenia do `events` z `event_type = 'api_error'` (bez PII).

---

## 7. Rozważania dotyczące wydajności
- **Keyset pagination** (po `measurement_date`) — brak `OFFSET`.  
- **Indeksy:**
  - `CREATE INDEX IF NOT EXISTS idx_weight_entries_user_date ON weight_entries (user_id, measurement_date DESC);`
  - Unikalność „1 wpis/dzień” już wymuszana (Warsaw tz) — pozostaje.  
- **Limity:** domyślnie `30`, maks. `100`.
- **Neon serverless cold starts:** akceptowalne w MVP; przy potrzebie — planowany upgrade do planu z wyeliminowaniem cold startów.
- **Cache (post-MVP):** Redis/Upstash dla często odczytywanych zakresów użytkownika i invalidacja po dodaniu/edycji.

---

## 8. Etapy wdrożenia

1. **Kontrakt i schematy**
   - Spisz kontrakt OpenAPI/TS types (DTO + query).  
   - Zdefiniuj Zod schemas: `WeightHistoryQuerySchema`.  

2. **Auth & RBAC**
   - Middleware sesji Lucia (SSR) + straż roli `patient`.

3. **Walidacja wejścia**
   - `startDate/endDate` (ISO **data** → zakres `[00:00, 23:59:59.999]` w **Europe/Warsaw**).  
   - `cursor` (ISO **datetime**).  
   - `limit` (domyślnie `30`, maks. `100`).  
   - Błędy formatu dat → **422**; pozostałe → **400**.

4. **Repozytorium (Drizzle)**
   - Zapytanie:
     ```ts
     // pseudo-Drizzle
     // SELECT * FROM weight_entries
     // WHERE user_id = $userId
     //   AND (start/endDate filters if provided)
     //   AND (cursor ? measurement_date < cursor : true)
     // ORDER BY measurement_date DESC
     // LIMIT limit + 1
     ```
   - Dodaj indeks `(user_id, measurement_date DESC)`.

5. **Serwis**
   - Sklejanie filtrów, translacja TZ, logika keyset (`limit+1`, `hasMore`, `nextCursor`), mapowanie do DTO.

6. **Handler HTTP (`/api/weight`)**
   - Kolejność: **auth → walidacja → service → 200 JSON**.
   - Nagłówki: `Cache-Control: no-store` (dane wrażliwe).

7. **Obsługa błędów**
   - Mapowanie wyjątków do kodów (`401/403/400/422/500`).  
   - Logowanie do stdout (Vercel). **Bez PII**.

8. **Analityka (opcjonalnie w MVP)**
   - Dodać `view_weight_history` do listy eventów (lub użyć istniejących wzorców eventów). Tabela `events` zgodnie z decyzją.

9. **Testy**
   - Jednostkowe (serwis: filtry, paginacja, TZ).  
   - Integracyjne (handler + DB Neon branch).  
   - E2E (Playwright) podstawowe scenariusze (autoryzacja pacjenta, pusta lista, filtry dat, paginacja).

10. **Dokumentacja i klient**
    - Opis w README + kolekcja API (np. Insomnia/Thunder Client).  
    - Uzgodnienie z UI wykorzystywania `cursor`.

11. **Release**
    - Deploy na Vercel (Hobby) + migracja indeksu w Neon.  
    - Monitorowanie logów i ewentualny tuning (limit, indeksy, upgrade).

---

### Dodatkowe uwagi implementacyjne
- **TZ i unikalność:** DB wymusza 1 wpis/dzień per użytkownik liczone po dacie w strefie **Europe/Warsaw** — odczyt musi respektować tę semantykę przy filtrach dziennych.  
- **Źródło pomiaru (`source`):** endpoint zwraca **wszystkie** wpisy danego pacjenta (zarówno `patient`, jak i `dietitian`), aby historia była kompletna.  
- **Polityka danych wrażliwych:** hosting i przetwarzanie wyłącznie w UE; zalecany **DPIA** przed produkcją i audyt operacji.
