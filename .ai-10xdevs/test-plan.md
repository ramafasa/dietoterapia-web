<test_plan>
### 1. Przegląd strategii testowania

- **Cel testów**
  - Zapewnienie, że moduł „Waga” oraz rozszerzenia wokół autentykacji działają poprawnie, są bezpieczne, wydajne i zgodne z wymaganiami (w tym RODO).
  - Minimalizacja ryzyka regresji przy dalszym rozwoju produktu.

- **Kontekst technologiczny**
  - **Frontend**: Astro (SSR, output: `server`) + React Islands, Tailwind CSS.
  - **Backend**: Astro server routes (`src/pages/api/*`), Lucia Auth v3, logika biznesowa w serwisach (`src/lib/services/*`).
  - **Baza danych**: Neon Postgres + Drizzle ORM (migrations, typowany dostęp).

- **Główne założenia strategii**
  - **Piramida testów**:
    - Duży nacisk na **testy jednostkowe i integracyjne** logiki biznesowej (serwisy, repozytoria, utilsy).
    - **Testy E2E** skoncentrowane na krytycznych przepływach użytkownika i scenariuszach wysokiego ryzyka.
    - Uzupełniające **testy wydajnościowe** i **bezpieczeństwa** dla wrażliwych obszarów (auth, dane zdrowotne, cron, panel dietetyka).
  - **Testy oparte o ryzyko**:
    - Priorytet dla obszarów: autentykacja, RODO (dane zdrowotne), wpisy wagi, cron/notifications, dostęp ról (RBAC).
  - **Automatyzacja**:
    - Maksymalna automatyzacja testów unit/integration/E2E w CI.
    - Manualne testy skoncentrowane na UX, kopi tekstowych, scenariuszach granicznych i RODO.

---

### 2. Typy testów

- **Testy jednostkowe (unit tests)**
  - Logika w serwisach:
    - `authService` (signup, login, reset password).
    - `weightEntryService` (dodawanie/edycja/usuwanie wagi, backfill, outliery).
    - `patientService` (agregacje do panelu dietetyka).
    - Utilsy (`chartCalculations.ts`, `dates.ts`, `editWindow.ts`, `password.ts`, itp.).
  - Hooki React (`useWeightEntry`, `useWeightHistory`, `useInfiniteWeightHistory`, `usePasswordStrength`, hooki dietetyka).
  - Walidacje Zod (`src/schemas/*`).

- **Testy integracyjne**
  - Integracja serwisów z Drizzle / Postgres (realna schema na testowej bazie):
    - Zapisywanie i odczyt użytkowników, sesji, wpisów wagi, eventów.
    - Transakcje (np. rejestracja z zaproszeniem: user + consents + invitation + audit).
  - Integracja endpointów API (`src/pages/api/*`) z serwisami (np. `/api/weight`, `/api/auth/login`, `/api/consultation`).
  - Middleware (`auth.ts`, `rbac.ts`) – przepływy requestów dla różnych ról i stanów sesji.

- **Testy end-to-end (E2E)**
  - Od strony przeglądarki, z użyciem realnej bazy i backendu (środowisko testowe):
    - Rejestracja pacjenta przez zaproszenie → logowanie → onboarding wagi → dodawanie wpisów → przeglądanie historii.
    - Logowanie dietetyka → przegląd pacjentów → podgląd historii wagi → dodanie wpisu jako dietetyk.
    - Reset hasła (pełen flow z mailem).

- **Testy API / kontraktowe**
  - Testy REST dla głównych endpointów (statusy HTTP, payload, błąd/sukces).
  - Spójność schematów odpowiedzi z założeniami frontendu (np. typy danych, pola wymagane).

- **Testy wydajnościowe (performance / load)**
  - API:
    - `/api/weight` – dodawanie i pobieranie wpisów (scenariusze z rosnącą liczbą użytkowników i wpisów).
    - Endpointy panelu dietetyka (listy pacjentów, wykresy).
    - Endpointy cronowe (masowe generowanie przypomnień).
  - TTFB i czas ładowania kluczowych stron (SSR) – np. `/pacjent/waga`, `/dietetyk/dashboard`.

- **Testy bezpieczeństwa**
  - Autentykacja i autoryzacja:
    - Próby dostępu do zasobów pacjenta jako dietetyk i na odwrót.
    - Próby dostępu bez sesji / z nieprawidłową sesją.
  - Podatności typowe (OWASP Top 10):
    - XSS na formularzach (komentarze/uwagi do wagi, pola tekstowe w konsultacjach/kontakcie).
    - CSRF na endpointach mutujących (jeśli aplikacja używa cookies + brak explicit csrf token – sprawdzić założenia).
    - Bezpieczeństwo haseł (siła hasła, reset hasła, blokada tokenów po użyciu).
  - Dane wrażliwe:
    - Brak wycieku danych zdrowotnych w logach, błędach, endpointach publicznych.

- **Testy użyteczności/UX (manualne)**
  - Czytelność komunikatów błędów i sukcesu (PL).
  - Przejrzystość onboardingów (pacjent) i panelu dietetyka.
  - Responsywność (mobile-first, desktop).

- **Testy regresji**
  - Uruchamiane automatycznie w CI przed każdym wdrożeniem (unit + integration + kluczowe E2E).
  - Dedykowany zestaw smoke testów dla produkcji po deployu.

---

### 3. Zakres testów

- **W zakresie (In Scope)**
  - Autentykacja:
    - Rejestracja pacjenta z zaproszeniem (pełne flow).
    - Logowanie (pacjent/dietetyk).
    - Reset hasła i zmiana hasła.
    - Sesje (tworzenie, wygasanie, redirecty).
  - RBAC / Middleware:
    - Ochrona ścieżek `/pacjent/*`, `/dietetyk/*`.
    - Redirecty z `/logowanie` dla zalogowanych użytkowników, przekierowania między rolami.
  - Wpisy wagi:
    - Dodawanie, edycja, usuwanie (jeśli dostępne).
    - Backfill (dodawanie historycznych wpisów).
    - Outliery (identyfikacja i potwierdzanie).
    - Walidacja zakresów, reguła 1 wpis/dzień.
    - Wyświetlanie historii, paginacja, wykresy.
  - Panel dietetyka:
    - Lista pacjentów, szczegóły pacjenta, podsumowania (np. kto raportował).
    - Działanie filtrów i sortowania.


- **Poza zakresem (Out of Scope) – na etapie MVP**
  - Zaawansowany monitoring i APM (Sentry, full observability).
  - Pełna analiza DPIA i audyty zewnętrzne (prawne/bezpieczeństwa).
  - Rozbudowane scenariusze i18n (inne języki niż PL).
  - Zaawansowane scenariusze HA/DR (disaster recovery, failover między regionami).
  - Pełna automatyzacja testów dostępności (a11y) – poza podstawowym smoke manualnym.
  - Powiadomienia:
    - Cronowe przypomnienia (logika wyboru adresatów).
    - Emaile przypomnień, zaproszeń, resetu hasła.
    - Web push (rejestracja, wysyłka, obsługa braku wsparcia).
  - Analityka:
    - Rejestracja eventów (`login`, `signup`, `view_add_weight`, `add_weight_patient`, `add_weight_dietitian`, `edit_weight`, `reminder_*`, `consent_accept`).
    - Zgodność eventów z biznesowym flow aplikacji.
  - Zgodność z RODO na poziomie technicznym:
    - Poprawne pola w DB (`endedAt`, `scheduledDeletionAt`).
    - Minimalizacja danych w logach, eventach.

---

### 4. Środowisko testowe i konfiguracja

- **Środowiska**
  - **Local dev**:
    - Uruchomienie Astro w trybie dev (`npm run dev`).
    - Baza: lokalny Postgres (Docker) lub Neon testowy branch.
  - **Test / Staging**:
    - Wdrożenie na osobny projekt Vercel lub osobne environment.
    - Baza: oddzielny Neon branch/database (schema odpowiadająca produkcji).
  - **Production**:
    - Tylko smoke testy + monitorowanie logów.

- **Konfiguracja środowisk**
  - Plik `.env.test` z:
    - Parametrami DB (Neon / lokalny Postgres).
    - Kluczami Lucia (session secret).
    - Fake’owymi danymi SMTP (np. MailHog / Ethereal) w środowisku test.
    - VAPID keys testowe dla `web-push`.
  - Migrations:
    - Uruchamianie Drizzle migrations przed testami integracyjnymi i E2E.
  - Seed:
    - Skrypt `src/db/seed.ts` lub dedykowany `seed.test.ts` do tworzenia:
      - Konta dietetyka (Paulina).
      - Kilku pacjentów w różnych stanach (`active`, `paused`, `ended`).
      - Kilku historii wagi (różne zakresy, outliery, backfill).
      - Przykładowych zaproszeń, tokenów resetu, zgód.

- **Narzędzia i biblioteki testowe (rekomendacje)**
  - **Unit/Integration**:
    - `Vitest` jako runner.
    - `@testing-library/react` dla komponentów React.
    - `supertest` lub natywne `fetch` do testów API.
  - **E2E**:
    - `Playwright` (chromium + webkit + firefox, ale min. chromium w CI).
  - **Performance**:
    - `k6` lub `Artillery` (konfiguracje w plikach `.js/.yaml`).
  - **Security**:
    - OWASP ZAP (Docker) – skan podstawowy stagingu.
  - **CI**:
    - GitHub Actions lub Vercel CI:
      - Kroki: `install → lint → typecheck → test:unit → test:integration → test:e2e (wybrane) → build`.

---

### 5. Przypadki testowe (wysoki poziom, wg funkcjonalności)

#### 5.1. Autentykacja i rejestracja

- **Signup z zaproszeniem**
  - Poprawne zaproszenie:
    - Podanie ważnego tokenu, wymaganych zgód i silnego hasła → użytkownik `patient` utworzony, zgody zapisane, zaproszenie oznaczone jako użyte, event `signup` zarejestrowany.
  - Błędny/nieistniejący token:
    - Oczekiwany błąd `InvalidInvitationError`, brak zmian w DB.
  - Wygasły token:
    - Odrzucenie rejestracji, odpowiedni komunikat dla UI.
  - Użyty token:
    - Brak ponownej rejestracji, błąd biznesowy.
  - Konfilkt email:
    - Próba rejestracji z istniejącym emailem → błąd `EmailConflictError`.

- **Login**
  - Poprawne dane (pacjent/dietetyk) → utworzona sesja, redirect wg roli.
  - Złe hasło → komunikat o błędnych danych, brak ujawniania czy email istnieje.
  - Zablokowany/`ended` użytkownik (jeśli obsługiwane) → brak logowania, komunikat.

- **Reset hasła**
  - Żądanie resetu:
    - Istniejący email → wygenerowanie tokenu, wysłanie maila (test w środowisku testowym np. MailHog).
    - Nieistniejący email → brak ujawniania informacji (ten sam komunikat).
  - Użycie tokenu:
    - Poprawny token → ustawienie nowego hasła, unieważnienie tokenu.
    - Zużyty/nieprawidłowy token → błąd.

#### 5.2. RBAC i middleware

- Wejście na `/pacjent/waga`:
  - Niezalogowany → redirect na `/logowanie`.
  - Zalogowany dietetyk → redirect na `/dietetyk/dashboard`.
  - Zalogowany pacjent → dostęp.
- Wejście na `/dietetyk/dashboard`:
  - Pacjent → redirect na `/pacjent/waga`.
  - Dietetyk → dostęp.
- `/logowanie`:
  - Zalogowany pacjent/dietetyk → redirect odpowiednio do `/pacjent/waga` / `/dietetyk/dashboard`.

#### 5.3. Onboarding i dashboard pacjenta (waga)

- **Onboarding (welcome)**
  - Pacjent bez wpisów:
    - Wejście na `/pacjent/waga/welcome` → wyświetlenie strony powitalnej (hero, kroki, widget dodawania wagi).
    - Dodanie pierwszego wpisu → redirect do `/pacjent/waga`.
  - Pacjent z wpisami:
    - Wejście na `/pacjent/waga/welcome` → redirect do `/pacjent/waga`.

- **Dodawanie wpisów**
  - Pierwszy wpis:
    - Waga w zakresie (np. 70.0 kg), data dzisiejsza → wpis zapisany, widoczny w historii i na wykresie.
  - Kolejny wpis tego samego dnia:
    - Błąd wynikający z `uniqueIndex` (1 wpis/dzień) → odpowiedni komunikat.
  - Wpisy historyczne (backfill):
    - Dodanie wagi z datą sprzed kilku dni → `isBackfill = true`, poprawne ułożenie w historii i na wykresie.
  - Waga poza zakresem (np. 20.0 lub 300.0):
    - Walidacja Zod/serwis → odrzucenie, komunikat walidacyjny.
  - Duży skok wagi (outlier):
    - Wpis o odchyleniu > X kg (wg logiki w serwisie) → `isOutlier = true`, wymagane potwierdzenie.
    - Potwierdzenie outliera → `outlierConfirmed = true`.

- **Edycja/usuwanie wpisów (jeśli dostępne w UI)**
  - Edycja wagi z zachowaniem reguły 1 wpis/dzień.
  - Próba edycji na datę, gdzie istnieje inny wpis → błąd.
  - Usunięcie ostatniego wpisu i odświeżenie wykresu.

- **Historia i wykres**
  - Prawidłowe sortowanie po `measurementDate` (desc).
  - Paginated / infinite scroll:
    - Ładowanie kolejnych stron, brak duplikatów.
  - Wykres:
    - Prawidłowe dane (daty i wagi), brak przerw przy backfill, obsługa outlierów.

#### 5.4. Panel dietetyka

- **Lista pacjentów**
  - Wyświetlanie listy z podstawowymi danymi (imię, nazwisko, status, ostatnia waga).
  - Filtrowanie po statusie (active/paused/ended).
  - Sortowanie np. po dacie ostatniego wpisu wagi.

- **Szczegóły pacjenta**
  - Wyświetlenie profilu i historii wagi danego pacjenta.
  - Dodanie wpisu przez dietetyka (`source = 'dietitian'`, `createdBy` = dietetyk).
  - Dostęp do tych danych tylko dla dietetyka (pacjent nie może podejrzeć danych innych pacjentów).

#### 5.7. Formularze konsultacji i kontaktu

- Walidacja pól (Zod + frontend).
- Integracja z backendem (`/api/consultation`, `/api/contact` jeżeli istnieje).
- Sprawdzenie, że treści formularzy nie trafiają do logów wrażliwych.

---

### 6. Wymagania dotyczące danych testowych

- **Użytkownicy**
  - 1 dietetyk (np. Paulina) – konto z pełnymi uprawnieniami.
  - 3–5 pacjentów:
    - `active` z różnymi historiami wagi (stabilna, spadająca, rosnąca, nieregularna).
    - `paused` – np. w trakcie przerwy.
    - `ended` – współpraca zakończona, z ustawionym `endedAt` i `scheduledDeletionAt`.
  - Pacjent bez żadnych wpisów (do testów onboardingu).

- **Wpisy wagi**
  - Seria dziennych wpisów z:
    - Normalnymi zmianami (±0.1–0.5 kg/dzień).
    - Jednym dużym outlierem (np. +10 kg w 1 dzień).
    - Przerwami (dni bez wpisów).
    - Backfill (wpisy dodane później z datami wstecz).

- **Zaproszenia**
  - 1 aktywne zaproszenie (ważne, nieużyte).
  - 1 wygasłe zaproszenie.
  - 1 zaproszenie już użyte.

- **Tokeny resetu hasła**
  - 1 ważny, 1 wygasły/nieprawidłowy.


---

### 7. Harmonogram testów i kamienie milowe

- **Faza 0 – Przygotowanie (0,5–1 dnia)**
  - Konfiguracja środowiska testowego (Neon/test Postgres, `.env.test`).
  - Dodanie i konfiguracja frameworków testowych (Vitest, Testing Library, Playwright, k6/Artillery).
  - Implementacja skryptu seed dla testów.

- **Faza 1 – Testy jednostkowe (1–2 dni)**
  - Pokrycie serwisów:
    - `authService` – wszystkie ścieżki sukcesu i błędów.
    - `weightEntryService` – reguły wagi, backfill, outliery, 1 wpis/dzień.
    - `patientService` – agregacje do panelu dietetyka.
  - Testy utils (`dates`, `editWindow`, `password`, `chartCalculations`).
  - Testy walidacji Zod (schemas).

- **Faza 2 – Testy integracyjne (1–2 dni)**
  - Testy z realną DB:
    - CRUD dla `users`, `sessions`, `weightEntries`, `events`.
    - Transakcje rejestracji, zaproszeń, resetu hasła.
  - Testy endpointów API: `/api/weight`, `/api/auth/login`, `/api/consultation`, `/api/cron/*`.
  - Testy middleware (RBAC) na poziomie requestów.

- **Faza 3 – Testy E2E (2 dni)**
  - Scenariusze:
    - Rejestracja z zaproszeniem → onboarding → dodawanie wagi.
    - Logowanie dietetyka → przegląd pacjentów → dodanie wpisu wagi.
    - Reset hasła (z mailem).
  - Uruchomienie E2E w CI dla smoke/regresji.

- **Faza 4 – Performance i Security (1–2 dni)**
  - Scenariusze obciążeniowe (k6/Artillery) dla głównych endpointów.
  - Skan OWASP ZAP środowiska staging.
  - Naprawa wykrytych istotnych problemów.

- **Faza 5 – Testy manualne i regresyjne (ciągłe, 1–2 dni skumulowane)**
  - UX, copywriting, RODO (polityka prywatności, zgody).
  - Smoke testy po każdej większej zmianie.
  - Końcowe potwierdzenie przed wdrożeniem na produkcję.

---

### 8. Ocena ryzyka i strategie mitygacji

- **Ryzyko: Błędy w logice wag (backfill, outliery, 1 wpis/dzień)**
  - **Skutek**: błędne wykresy, zła interpretacja postępów pacjenta.
  - **Mitygacja**:
    - Wysokie pokrycie testami jednostkowymi `weightEntryService`.
    - Integracyjne testy constraintów DB (unique index, indeksy dat).
    - Scenariusze E2E na historii wagi.

- **Ryzyko: Błędy w RBAC i middleware**
  - **Skutek**: dostęp do danych innych pacjentów, złe redirecty, naruszenia RODO.
  - **Mitygacja**:
    - Jednostkowe i integracyjne testy middleware.
    - E2E sprawdzające dostępność kluczowych ścieżek dla różnych ról.
    - Regularne testy bezpieczeństwa (próby „przełamania” roli).

- **Ryzyko: Podatności bezpieczeństwa (XSS, CSRF, wycieki danych)**
  - **Skutek**: naruszenia bezpieczeństwa użytkowników i RODO.
  - **Mitygacja**:
    - Bezpieczeństwa-focused testy jednostkowe (np. sanity check na sanitizację inputów tam, gdzie potrzeba).
    - Automatyczny skan OWASP ZAP na staging.
    - Przegląd kodu pod kątem logowania danych wrażliwych.

- **Ryzyko: Cold starts Neon i wydajność zapytań**
  - **Skutek**: wolne odpowiedzi, gorsze UX.
  - **Mitygacja**:
    - Testy wydajnościowe zapytań (przy rosnących wolumenach danych).
    - Monitoring logów zapytań i czasu odpowiedzi.
    - Możliwość przejścia na płatny plan lub cache po MVP.

- **Ryzyko: Flaky E2E w CI (zewnętrzne usługi, czas)**
  - **Skutek**: fałszywe alarmy, spowolnienie pipeline’u.
  - **Mitygacja**:
    - Mockowanie SMTP i web-push w E2E (lub dedykowane środowisko z MailHog).
    - Czasowe retry dla wybranych kroków w Playwright.
    - Ograniczona liczba E2E w CI (tylko krytyczne ścieżki), pełna suite np. nocą.


---

Ten plan może zostać rozszerzony o szczegółową listę test case’ów w formacie tabelarycznym (ID testu, kroki, dane wejściowe, oczekiwany rezultat) oraz przemapowany na konkretne zadania w systemie zarządzania projektami (np. Jira), ale już w obecnej formie stanowi kompletny przewodnik dla zespołu przy wdrażaniu strategii testów dla projektu Dietoterapia Waga.
</test_plan>