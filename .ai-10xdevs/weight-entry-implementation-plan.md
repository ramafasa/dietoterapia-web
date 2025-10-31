# API Endpoint Implementation Plan: POST /api/weight

## 1. Przegląd punktu końcowego

**Cel:** Endpoint umożliwia pacjentom dodawanie nowych wpisów wagi do systemu monitorowania.

**Kluczowe funkcjonalności:**
- Dodawanie wpisów wagi przez zalogowanych pacjentów
- Wsparcie backfill (do 7 dni wstecz)
- Automatyczne wykrywanie anomalii (zmiana wagi > 3kg w 24h)
- Ograniczenie: jeden wpis dziennie per pacjent (timezone: Europe/Warsaw)
- Audyt: automatyczne śledzenie `createdAt`, `createdBy`

**Ograniczenia:**
- Tylko użytkownicy z rolą `patient`
- Waga: 30.0 - 250.0 kg (decimal 4,1)
- Backfill limit: maksymalnie 7 dni wstecz
- Unique constraint: jeden wpis/dzień per użytkownik w Europe/Warsaw timezone

---

## 2. Szczegóły żądania

**Metoda HTTP:** `POST`

**Struktura URL:** `/api/weight`

**Headers:**
- `Content-Type: application/json`
- `Cookie: session_id=<lucia_session_token>`

### Parametry Request Body:

**Wymagane:**
- `weight` (number): Waga w kg, zakres: 30.0 - 250.0, format: decimal(4,1)
- `measurementDate` (string): Data pomiaru ISO 8601 (max 7 dni wstecz)

**Opcjonalne:**
- `note` (string): Notatka, max 200 znaków

**Przykład:**
```json
{
  "weight": 75.5,
  "measurementDate": "2025-10-30T08:00:00+02:00",
  "note": "Morning weight after breakfast"
}
```

---

## 3. Wykorzystywane typy

### DTOs (już zdefiniowane w src/types.ts):
- `CreateWeightEntryRequest` - request body (lines 118-123)
- `CreateWeightEntryResponse` - success response (lines 134-138)
- `AnomalyWarning` - ostrzeżenia o anomaliach (lines 125-132)
- `ApiError` - błędy API (lines 12-17)

### Command Models:
- `CreateWeightEntryCommand` - command dla service layer (lines 512-520)

**Wszystkie typy są już poprawnie zdefiniowane - nie wymagają zmian.**

---

## 4. Szczegóły odpowiedzi

### Success (201 Created)

**Normalny wpis:**
- `entry` object z id, userId, weight, measurementDate, source, isBackfill, isOutlier, note, timestamps
- `warnings` - pusta tablica

**Wpis z anomalią:**
- `entry` object z `isOutlier: true`, `outlierConfirmed: false`
- `warnings` - tablica z `AnomalyWarning` object (type, message, previousWeight, previousDate, change)

### Error Responses

| Kod | Scenariusz | Error Code |
|-----|-----------|------------|
| 400 | Waga poza zakresem 30-250 kg | `invalid_weight` |
| 400 | Data > 7 dni wstecz | `backfill_limit_exceeded` |
| 401 | Brak/nieprawidłowa sesja | `unauthorized` |
| 403 | User nie jest pacjentem | `forbidden` |
| 409 | Wpis już istnieje dla daty | `duplicate_entry` |
| 422 | Błędy walidacji (format, długość) | `validation_error` |
| 500 | Błąd serwera/bazy danych | `internal_server_error` |

---

## 5. Przepływ danych

### High-Level Flow

```
1. Request → API Endpoint (/api/weight.ts)
2. Authentication Check (Lucia middleware)
3. Authorization Check (role === 'patient')
4. Request Validation (Zod schema)
5. Business Logic (WeightEntryService)
   ├─ Validate backfill limit (7 days)
   ├─ Check duplicate entry (unique constraint)
   ├─ Detect anomaly (> 3kg change in 24h)
   └─ Calculate isBackfill flag
6. Database Insert (WeightEntryRepository)
7. Event Tracking (Analytics: 'add_weight_patient')
8. Response (201 Created)
```

### Architektura (3-warstwowa)

**API Layer:** `src/pages/api/weight.ts`
- Obsługa HTTP request/response
- Authentication & authorization
- Request validation (Zod)
- Error handling

**Service Layer:** `src/lib/services/weightEntryService.ts`
- Business logic (backfill limit, anomaly detection)
- Orchestracja operacji
- Walidacja reguł biznesowych

**Repository Layer:** `src/lib/repositories/weightEntryRepository.ts`
- Dostęp do bazy danych (Drizzle ORM)
- Queries: duplicate check, previous entry lookup, insert

### Database Queries (3 queries max)

1. **Check duplicate entry** - sprawdzenie czy wpis istnieje dla daty (w timezone Europe/Warsaw)
2. **Get previous entry** - pobranie ostatniego wpisu dla anomaly detection (optional)
3. **Insert new entry** - utworzenie nowego wpisu z obliczonymi flagami

---

## 6. Względy bezpieczeństwa

### Authentication (Lucia v3)
- Session-based auth z 30-dniową ważnością
- Session token w secure HTTP-only cookie
- Walidacja sesji przy każdym żądaniu

### Authorization (RBAC)
- Tylko `role === 'patient'` może używać tego endpointa
- Dietetycy używają osobnego endpointa `/api/dietitian/patients/:patientId/weight`

### Input Validation (3 warstwy)
1. **Zod schema** - format, typy, zakresy wartości
2. **Business rules** - backfill limit, duplicate check
3. **Database constraints** - unique index, foreign keys

### Data Integrity
- **userId z sesji** (NIE z request body) - zapobiega spoofingowi
- **Unique constraint w DB** - jeden wpis/dzień per użytkownik
- **Foreign key constraints** - referencja do users table
- **Parametryzowane queries** - Drizzle ORM zapobiega SQL injection

### CSRF Protection
- Astro middleware weryfikuje CSRF token dla POST/PUT/DELETE requests

---

## 7. Obsługa błędów

### Error Handling Strategy

**Authentication/Authorization:**
- 401: Brak sesji, sesja wygasła → `unauthorized`
- 403: User nie jest pacjentem → `forbidden`

**Validation:**
- 422: Nieprawidłowy format daty, waga poza zakresem, note za długa → `validation_error`

**Business Logic:**
- 400: Data > 7 dni wstecz → `backfill_limit_exceeded`
- 409: Wpis już istnieje → `duplicate_entry`

**Server:**
- 500: Błąd DB, unexpected errors → `internal_server_error` + console.error

### Error Logging
- **MVP:** `console.error()` dla błędów 500, logi w Vercel dashboard
- **Post-MVP:** Sentry integration (free tier)

---

## 8. Rozważania dotyczące wydajności

### Database Performance
- **Index na (user_id, measurement_date DESC)** - przyspiesza duplicate check i previous entry lookup
- **Unique constraint** - już istnieje w schema (idx_one_entry_per_day)
- **Connection pooling** - Neon automatycznie zarządza pool

### Query Optimization
- **Previous entry lookup:** Index-only scan, LIMIT 1 → ~5-10ms
- **Duplicate check:** Index scan → ~5-10ms
- **Insert:** ~20-30ms

### Expected Response Times
| Scenariusz | Estimated Time |
|-----------|----------------|
| Normal insert | 50-100ms |
| Insert with anomaly | 80-120ms |
| Validation error | 5-10ms |
| Cold start (Neon free tier) | 1000-2000ms |

### Timezone Conversion
- `date-fns-tz` library (~2kb)
- Konwersja: ~0.1-0.5ms per call
- Nie stanowi bottleneck

### Scalability
- **Current architecture scales to:** ~100 active patients, ~10 req/sec
- **Bottlenecks:** Neon free tier limits (0.5GB storage, 100h compute/month)
- **Post-MVP:** Upgrade to Neon Scale ($19/m), Redis caching

---

## 9. Etapy wdrożenia

### Krok 1: Setup infrastruktury (1h)
- Utworzenie struktury katalogów (`services/`, `repositories/`, `utils/`)
- Weryfikacja schema bazy danych i migracji

### Krok 2: Walidacja i typy (1h)
- Utworzenie Zod schema w `src/utils/validation.ts`
- Weryfikacja typów w `src/types.ts` (już kompletne)

### Krok 3: Repository Layer (2h)
- Utworzenie `WeightEntryRepository` w `src/lib/repositories/`
- Metody: `checkDuplicateEntry()`, `getPreviousEntry()`, `createEntry()`
- Drizzle ORM queries z timezone handling

### Krok 4: Service Layer (3h)
- Utworzenie `WeightEntryService` w `src/lib/services/`
- Metody: `createWeightEntry()`, `detectAnomaly()`, `validateBackfillLimit()`, `isBackfillEntry()`
- Custom errors: `DuplicateEntryError`, `BackfillLimitError`

### Krok 5: API Endpoint (2h)
- Utworzenie `POST` handler w `src/pages/api/weight.ts`
- Authentication check (Lucia session)
- Authorization check (role === 'patient')
- Request validation (Zod)
- Business logic execution (service)
- Error handling (try-catch z custom errors)
- Response formatting

### Krok 6: Testy manualne (1h)
- Przygotowanie test user (patient role)
- Test cases: success, anomaly, duplicate, backfill limit, validation errors, 401, 403
- Weryfikacja w Postman/Insomnia lub curl

### Krok 7: Dokumentacja (30min)
- JSDoc comments dla publicznych metod
- Update CLAUDE.md ze statusem implementacji

**Szacowany czas: 8-10h (1-2 dni robocze)**

---

## 10. Post-Implementation Checklist

### Must-Have (przed produkcją)
- [ ] Wszystkie testy manualne przeszły pomyślnie
- [ ] Error handling pokrywa wszystkie scenariusze
- [ ] Lucia Auth działa poprawnie
- [ ] Database migrations applied
- [ ] Timezone Europe/Warsaw działa poprawnie
- [ ] Anomaly detection przetestowane
- [ ] CSRF protection włączone

### Nice-to-Have (post-MVP)
- [ ] Unit tests (Vitest)
- [ ] Integration tests
- [ ] Rate limiting (Upstash Redis)
- [ ] Sentry error tracking
- [ ] Performance monitoring
- [ ] E2E tests (Playwright)

---

## 11. Kluczowe Decyzje Architektoniczne

### 1. Anomaly Detection
- **Threshold:** 3kg zmiana w 24h
- **Logic:** Porównanie z poprzednim wpisem, flag `isOutlier: true`
- **UX:** Warning w response, pacjent może potwierdzić przez osobny endpoint

### 2. Backfill Strategy
- **Limit:** 7 dni wstecz
- **Flag:** `isBackfill: true` jeśli data < today
- **Rationale:** Zapobiega retroaktywnemu wypełnianiu danych, zachowuje integralność timeline

### 3. Unique Constraint
- **Scope:** Jeden wpis/dzień per użytkownik
- **Timezone:** Europe/Warsaw (nie UTC!)
- **Implementation:** Unique index w DB + pre-check w service layer dla lepszej UX

### 4. Error Handling Philosophy
- **Fast-fail:** Walidacja na początku flow
- **User-friendly messages:** Polski język, jasne komunikaty
- **Logging:** Console.error dla 500, Sentry post-MVP

---

## Podsumowanie

**Architektura:** 3-warstwowa (API → Service → Repository)
**Bezpieczeństwo:** Lucia Auth + RBAC + Zod validation + CSRF protection
**Performance:** Indexed queries, O(1) anomaly detection, <100ms response time
**Timeline:** 8-10h implementation time
**Status:** Gotowy do implementacji po zatwierdzeniu planu