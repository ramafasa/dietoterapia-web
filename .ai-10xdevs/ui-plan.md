# Architektura UI dla Dietoterapia - System Śledzenia Wagi Pacjentów

**Data:** 2025-11-03
**Status:** ✅ Zatwierdzona
**Wersja:** 1.0

---

## 1. Przegląd struktury UI

System składa się z trzech głównych obszarów funkcjonalnych:

1. **Moduł Autentykacji** (`/auth/*`) - publiczny dostęp do logowania, rejestracji i odzyskiwania hasła
2. **Moduł Pacjenta** (`/waga/*`) - interfejs dla pacjentów z funkcjami dodawania wagi i przeglądania postępów
3. **Moduł Dietetyka** (`/dietetyk/*`) - panel zarządzania pacjentami, analityki i raportowania

**Główne założenia projektowe:**
- **Mobile-first** - priorytet dla urządzeń mobilnych (większość pacjentów korzysta ze smartfonów)
- **Accessibility** - zgodność z WCAG AA (keyboard navigation, screen readers, kontrast kolorów)
- **Progressive Enhancement** - podstawowa funkcjonalność bez JavaScript, wzbogacona interakcja z React
- **Security by Design** - walidacja na wszystkich poziomach, minimalizacja surface attack
- **RODO Compliance** - jawne zgody, eksport danych, anonimizacja przy usuwaniu konta

---

## 2. Lista widoków

### 2.1 Moduł Autentykacji (`/auth/*`)

#### A. Widok Logowania
**Ścieżka:** `/auth/login`
**Dostęp:** Publiczny
**Główny cel:** Umożliwienie zalogowania się użytkownikom (pacjent i dietetyk)

**Kluczowe informacje:**
- Formularz email + hasło
- Link do odzyskiwania hasła
- Informacja o błędach logowania
- Rate limiting (5 prób / 15 min)

**Kluczowe komponenty:**
- `LoginForm` - formularz z walidacją Zod
- `Button` - primary CTA "Zaloguj się"
- `Input` - pola email i password
- `Alert` - komunikaty błędów (401, 429)
- `Link` - "Zapomniałeś hasła?"

**API Integration:**
- `POST /api/auth/login`

**UX, dostępność i bezpieczeństwo:**
- Auto-focus na polu email przy załadowaniu
- Show/hide password toggle
- Keyboard navigation (Tab, Enter)
- ARIA labels dla screen readers (`aria-label="Email"`, `aria-describedby="email-error"`)
- Client-side validation przed wysłaniem (Zod)
- Server-side re-validation
- CSRF protection przez Astro middleware
- Secure, httpOnly session cookies
- Clear error messages bez ujawniania, czy email istnieje (generic "Invalid credentials")
- Loading state podczas wysyłania
- Redirect po zalogowaniu: pacjent → `/waga`, dietetyk → `/dietetyk/dashboard`

---

#### B. Widok Rejestracji
**Ścieżka:** `/auth/signup?token={invitation_token}`
**Dostęp:** Publiczny (tylko z ważnym tokenem zaproszenia)
**Główny cel:** Rejestracja nowego pacjenta na podstawie zaproszenia od dietetyka

**Kluczowe informacje:**
- Email z zaproszenia (readonly)
- Imię, nazwisko
- Wiek, płeć (opcjonalne w UI, ale zalecane)
- Hasło (≥8 znaków)
- Zgody RODO (wymagane checkboxy)

**Kluczowe komponenty:**
- `SignupForm` - wielopołowy formularz
- `Input` - text, number, password
- `Select` - dropdown płci
- `Checkbox` - zgody RODO z rozwijanym tekstem
- `Button` - "Utwórz konto"
- `Alert` - błędy walidacji

**API Integration:**
- `GET /api/invitations/:token` - walidacja tokenu przy wejściu na stronę
- `POST /api/auth/signup`

**UX, dostępność i bezpieczeństwo:**
- Walidacja tokenu przy załadowaniu strony (redirect do error page jeśli nieważny)
- Email z zaproszenia pokazany jako readonly (nie można zmienić)
- Real-time password strength indicator
- Inline validation errors (Zod)
- Rozwijalne treści zgód (aby użytkownik mógł przeczytać)
- Disabled submit button dopóki wszystkie wymagane zgody nie zostały zaznaczone
- Clear visual hierarchy (required fields marked with *)
- Password requirements tooltip
- Auto-login po rejestracji → redirect do `/waga/welcome`
- Event tracking: `signup_completed`, `consent_accept`
- WCAG AA keyboard navigation
- Focus trap w rozwiniętych zgodach

---

#### C. Widok "Zapomniałem hasła"
**Ścieżka:** `/auth/forgot-password`
**Dostęp:** Publiczny
**Główny cel:** Inicjacja procesu odzyskiwania hasła

**Kluczowe informacje:**
- Pole email
- Komunikat o wysłaniu linka (zawsze pozytywny, aby nie ujawniać czy email istnieje)

**Kluczowe komponenty:**
- `ForgotPasswordForm`
- `Input` - email
- `Button` - "Wyślij link do resetu"
- `SuccessMessage` - "Jeśli konto istnieje, wysłaliśmy link..."

**API Integration:**
- `POST /api/auth/forgot-password`

**UX, dostępność i bezpieczeństwo:**
- Generic success message (nie ujawnia czy email istnieje - security best practice)
- Rate limiting (max 3 requesty / godzinę na email)
- Email z linkiem ważny 60 minut
- Clear instructions w emailu
- Link prowadzi do `/auth/reset-password?token=...`

---

#### D. Widok Resetu Hasła
**Ścieżka:** `/auth/reset-password?token={reset_token}`
**Dostęp:** Publiczny (z ważnym tokenem)
**Główny cel:** Ustawienie nowego hasła

**Kluczowe informacje:**
- Pole nowego hasła
- Pole potwierdzenia hasła
- Token walidowany server-side

**Kluczowe komponenty:**
- `ResetPasswordForm`
- `Input` - password, password confirmation
- `Button` - "Ustaw nowe hasło"
- `PasswordStrengthIndicator`
- `Alert` - błędy (token expired, passwords don't match)

**API Integration:**
- `POST /api/auth/reset-password`

**UX, dostępność i bezpieczeństwo:**
- Walidacja tokenu przy załadowaniu (expired/invalid → error message z linkiem do `/auth/forgot-password`)
- Password matching validation
- Password strength requirements (≥8 chars, zalecane: uppercase, number, special char)
- All active sessions invalidated po zmianie hasła
- Success → redirect do `/auth/login` z success toast
- Event: `password_reset_completed`

---

### 2.2 Moduł Pacjenta (`/waga/*`)

#### A. Dashboard Pacjenta
**Ścieżka:** `/waga`
**Dostęp:** Pacjent (authenticated, role: patient)
**Główny cel:** Szybkie dodanie dzisiejszej wagi i przegląd ostatnich 7 dni

**Kluczowe informacje:**
- Widget dodawania wagi (sticky na mobile)
- Status obowiązku tygodniowego
- Historia ostatnich 7 wpisów
- Bottom navigation (mobile)

**Kluczowe komponenty:**
- `WeightEntryWidget` - quick add form
  - Input number (30-250 kg, step 0.1)
  - Optional note textarea (max 200 chars)
  - Submit button
  - Disabled jeśli już jest wpis dziś
- `WeeklyStatusBadge` - "✅ Obowiązek spełniony" / "⏳ Brak wpisu"
- `RecentEntriesList` - ostatnie 7 dni
  - `WeightEntryCard` dla każdego wpisu (data, waga, delta, badges)
- `PatientBottomNav` - mobile navigation (Dashboard, Historia, Ustawienia)

**API Integration:**
- `GET /api/weight?limit=7` - ostatnie 7 wpisów
- `POST /api/weight` - dodanie nowego wpisu
- Weekly obligation check (computed client-side na bazie entries)

**UX, dostępność i bezpieczeństwo:**
- Widget sticky na górze przy scrollu (mobile)
- Auto-focus na polu wagi jeśli brak wpisu dziś
- Inputmode="decimal" dla klawiatury numerycznej na mobile
- Client-side validation (Zod): 30-250 kg, precision 0.1
- Real-time format validation (block letters, tylko cyfry i kropka)
- Anomaly detection: jeśli API zwróci warning (>3kg/24h) → modal potwierdzenia
- Success toast po dodaniu
- Pre-CTA modal po PIERWSZYM dodaniu wagi (delay 1s): "Włącz powiadomienia push"
- Optimistic update dla lepszego UX
- Loading states (button spinner)
- Skeleton screens dla loading entries
- Error boundary dla network errors
- ARIA live region dla success/error messages
- Keyboard shortcuts: Ctrl+Enter = submit
- Clear visual feedback dla disabled state (już dodano dziś)
- Badge indicators: 🔄 backfill, ⚠️ outlier, 👩‍⚕️ dodane przez dietetyka
- Event tracking: `view_add_weight`, `add_weight_patient`, `outlier_flagged`

---

#### B. Strona Powitalna (Welcome)
**Ścieżka:** `/waga/welcome`
**Dostęp:** Pacjent (authenticated, tylko po rejestracji)
**Główny cel:** Onboarding - wprowadzenie do aplikacji i zachęcenie do pierwszego wpisu

**Kluczowe informacje:**
- Krótkie intro (1-2 zdania o aplikacji)
- Wyjaśnienie obowiązku tygodniowego
- CTA: "Dodaj pierwszą wagę"

**Kluczowe komponenty:**
- `WelcomeHero` - hero section z ilustracją
- `OnboardingSteps` - kroki: 1. Dodaj wagę, 2. Otrzymuj przypomnienia, 3. Śledź postępy
- `Button` - primary CTA "Dodaj pierwszą wagę" → scroll do weight widget
- `WeightEntryWidget` - ten sam co na dashboardzie

**UX, dostępność i bezpieczeństwo:**
- Pokazywane tylko raz (po rejestracji)
- Po dodaniu pierwszej wagi → redirect do `/waga` (dashboard)
- Możliwość "Skip" → przejście do dashboard bez dodawania
- Ilustracje accessibility (alt text)
- Mobile-optimized layout

---

#### C. Historia Wpisów
**Ścieżka:** `/waga/historia`
**Dostęp:** Pacjent (authenticated)
**Główny cel:** Przeglądanie pełnej historii pomiarów z opcją edycji i filtrowania

**Kluczowe informacje:**
- Lista wszystkich wpisów (sortowanie DESC po measurementDate)
- Filtry: zakres dat
- Infinite scroll (30 wpisów per page)
- Możliwość edycji (w oknie do końca następnego dnia)

**Kluczowe komponenty:**
- `HistoryFilters` - date range picker (startDate, endDate)
- `WeightEntryList` - lista z infinite scroll
  - `WeightEntryCard` - karta wpisu
    - Data, waga, zmiana (delta), notatka
    - Badges: backfill, outlier, source
    - Button "Edytuj" (jeśli w edit window)
    - Button "Potwierdź" (jeśli outlier niepotwierdzony)
- `EditWeightModal` - modal edycji
  - Input waga
  - Textarea notatka
  - Buttons: "Zapisz", "Usuń", "Anuluj"
- `ConfirmOutlierModal` - modal potwierdzenia anomalii
- `DeleteConfirmationModal` - modal potwierdzenia usunięcia
- `LoadMoreSpinner` - spinner przy ładowaniu kolejnych stron

**API Integration:**
- `GET /api/weight?cursor={lastEntryDate}&limit=30` - paginowane wpisy
- `PATCH /api/weight/:id` - edycja
- `DELETE /api/weight/:id` - usunięcie
- `POST /api/weight/:id/confirm` - potwierdzenie outliera

**UX, dostępność i bezpieczeństwo:**
- Infinite scroll z Intersection Observer (auto-load przy scrollu do końca)
- Filtry persisted w URL query params (shareable links)
- Inline editing vs modal (modal dla lepszego fokus)
- Edit window validation: "Możesz edytować do końca następnego dnia" (client + server check)
- Outlier confirmation flow:
  - Wpis z flagą outlier wyróżniony wizualnie (border czerwony, ikona ⚠️)
  - Banner "Duża zmiana wagi (X kg). Czy to poprawne?"
  - Buttons: "Tak, potwierdź" / "Nie, popraw"
- Delete confirmation: "Czy na pewno usunąć wpis z [data]?"
- Optimistic updates dla edycji
- Rollback on error
- Toast notifications dla success/error
- Loading states
- Empty state: "Brak wpisów. Dodaj pierwszą wagę!"
- Skeleton screens przy pierwszym ładowaniu
- Keyboard navigation w modalu (Esc = cancel, Enter = submit)
- Focus trap w modalu
- ARIA: `aria-modal="true"`, `role="dialog"`
- Event tracking: `edit_weight`, `outlier_confirmed`, `outlier_corrected`

---

#### D. Ustawienia Pacjenta
**Ścieżka:** `/waga/ustawienia`
**Dostęp:** Pacjent (authenticated)
**Główny cel:** Zarządzanie preferencjami powiadomień, przeglądanie profilu, RODO actions

**Kluczowe informacje:**
- Preferencje powiadomień (push, email)
- Dane profilu (read-only)
- RODO: eksport danych, usunięcie konta

**Kluczowe komponenty:**
- `SettingsLayout` - 3 sekcje
- **Sekcja Powiadomienia:**
  - `Toggle` - Web push (on/off)
  - `Toggle` - Email fallback (on/off)
  - Info text: "Email wysyłany gdy push niedostępny"
- **Sekcja Profil:**
  - Read-only fields: imię, nazwisko, email, wiek, płeć
  - Button: "Zmień hasło" → modal
- **Sekcja RODO:**
  - Button: "Pobierz moje dane" (JSON export)
  - Button: "Usuń konto" (modal z ostrzeżeniem)
- `ChangePasswordModal`
  - Input: obecne hasło, nowe hasło, potwierdzenie
- `DeleteAccountModal`
  - Input: hasło, confirmation text "DELETE MY ACCOUNT"
  - Warning: "Akcja nieodwracalna. Dane zostaną zanonimizowane."

**API Integration:**
- `GET /api/preferences`
- `PATCH /api/preferences`
- `POST /api/push/subscribe` (gdy włączany push)
- `DELETE /api/push/subscribe` (gdy wyłączany)
- `GET /api/user/export`
- `DELETE /api/user/account`

**UX, dostępność i bezpieczeństwo:**
- Toggle switches z immediate save (optimistic update + API call)
- Web push permission flow:
  - Klik toggle → sprawdź `Notification.permission`
  - Jeśli "default" → request permission
  - Jeśli "granted" → subscribe
  - Jeśli "denied" → show info "Włącz w ustawieniach przeglądarki"
- Safari iOS fallback: push nie działa → auto-enable email + info message
- Change password modal:
  - Validation: obecne hasło required, nowe ≥8 chars, confirmation match
  - Success → wylogowanie wszystkich sesji + redirect do login
- Delete account modal:
  - Heavy confirmation (password + typed text)
  - Warning text: retencja 24 miesiące
  - Data export offered przed usunięciem
  - Success → logout + redirect do marketing page z info
- Loading states dla wszystkich actions
- Toast notifications
- Error handling
- Keyboard navigation
- ARIA labels
- Event tracking: `push_subscribe`, `push_unsubscribe`, `account_deletion_requested`

---

### 2.3 Moduł Dietetyka (`/dietetyk/*`)

#### A. Dashboard Dietetyka
**Ścieżka:** `/dietetyk/dashboard`
**Dostęp:** Dietetyk (authenticated, role: dietitian)
**Główny cel:** Przegląd wszystkich pacjentów z szybkim dostępem do szczegółów i statusem obowiązku tygodniowego

**Kluczowe informacje:**
- Lista wszystkich pacjentów
- Status obowiązku tygodniowego per pacjent
- Filtry: status (active, paused, ended, all)
- Sortowanie: domyślnie oldest first (ostatni wpis)
- KPI widget: aktywni pacjenci, odsetek z wpisem

**Kluczowe komponenty:**
- `DashboardKPIWidget`
  - Metryka: "25 aktywnych | 20 z wpisem (80%)"
- `PatientListFilters`
  - Dropdown: Status (wszystkie, aktywni, wstrzymani, zakończeni)
  - Search input (future: filtrowanie po imieniu)
- `PatientTable` (desktop) / `PatientCardList` (mobile)
  - Kolumny/pola:
    - Imię, nazwisko
    - Status badge (🟢 aktywny, 🟡 wstrzymany, 🔴 zakończony)
    - Ostatni wpis (data)
    - Obowiązek tygodniowy (🟢 spełniony / 🔴 brak)
  - Klik w wiersz → redirect do `/dietetyk/pacjenci/:id`
- `PatientCard` (mobile)
  - Compact card layout

**API Integration:**
- `GET /api/dietitian/patients?status={filter}&limit=50&offset=0`

**UX, dostępność i bezpieczeństwo:**
- Domyślne sortowanie: oldest first (priority dla pacjentów bez wpisu)
- Status filter persisted w URL
- Table responsive: desktop = table, mobile = cards
- Row hover state (desktop)
- Loading skeleton dla tabeli
- Empty states:
  - Brak pacjentów: "Zaproś pierwszego pacjenta"
  - Brak aktywnych: "Wszyscy pacjenci wstrzymani/zakończeni"
- Pagination (offset-based): 50 per page
- Keyboard navigation (Tab przez wiersze, Enter = otwórz szczegóły)
- ARIA: `role="table"`, `aria-label="Lista pacjentów"`
- Mobile: swipe gestures do quick actions (future)
- Badge color coding z high contrast dla accessibility

---

#### B. Szczegóły Pacjenta
**Ścieżka:** `/dietetyk/pacjenci/:id`
**Dostęp:** Dietetyk (authenticated)
**Główny cel:** Szczegółowy widok pojedynczego pacjenta z historią wpisów, wykresem i zarządzaniem statusem

**Kluczowe informacje:**
- Dane pacjenta (imię, email)
- Statystyki (total entries, streak, weekly compliance rate)
- Status pacjenta (edytowalny dropdown)
- Historia wpisów z zakładkami (Dziś, Tydzień, Zakres dat)
- Wykres postępów (30/90 dni z MA7)
- Quick action: dodaj wagę za pacjenta

**Kluczowe komponenty:**
- `PatientHeader`
  - Imię, email
  - Status dropdown (Aktywny, Wstrzymany, Zakończony) - inline edit
  - Button "Dodaj wagę za pacjenta"
- `PatientStats`
  - Total entries, current streak, longest streak
  - Weekly compliance rate
  - Last entry date
- `WeightHistoryTabs`
  - Zakładki: Dziś | Ten tydzień | Zakres dat
  - Content area: lista wpisów
- `WeightEntryList` (read-only dla dietetyka)
  - `WeightEntryCard` - data, waga, źródło, notatka, badges
- `WeightChart`
  - Chart.js line chart
  - Toggle: 30 dni / 90 dni
  - Linie: actual weights (solid), MA7 (dotted)
  - Markers: outliery (red dot), wpisy dietetyka (icon)
  - Optional: goal line (horizontal dotted)
  - Tooltip on hover: data, waga, zmiana, notatka
- `AddWeightForPatientModal`
  - Input: waga (30-250 kg, step 0.1)
  - DatePicker: data pomiaru (default dziś, max 7 dni backfill)
  - Textarea: notatka (OBOWIĄZKOWA, min 10 chars, max 200)
  - Info: "Wpis będzie oznaczony jako dodany przez dietetyka"
- `ChangePatientStatusModal`
  - Dropdown: nowy status
  - Textarea: notatka (opcjonalna, max 500 chars)
  - Warning dla "Zakończony": "Retencja 24 miesiące"

**API Integration:**
- `GET /api/dietitian/patients/:id` - dane pacjenta + statystyki
- `GET /api/dietitian/patients/:id/weight?view={today|week|range}&startDate=&endDate=` - historia
- `GET /api/dietitian/patients/:id/chart?period={30|90}` - dane do wykresu
- `POST /api/dietitian/patients/:id/weight` - dodanie wagi
- `PATCH /api/dietitian/patients/:id/status` - zmiana statusu

**UX, dostępność i bezpieczeństwo:**
- Breadcrumb: Dashboard > Imię pacjenta
- Status dropdown inline edit:
  - Klik dropdown → wybór → modal potwierdzenia
  - Modal z notatką i warningiem (jeśli zakończony)
  - Success → toast + badge update
- Tabs navigation:
  - "Dziś" = measurement date dziś
  - "Ten tydzień" = poniedziałek-niedziela bieżącego tygodnia
  - "Zakres dat" = custom date pickers
- Wykres:
  - Responsive: desktop obok historii (2 kolumny), mobile nad historią (stack)
  - Loading skeleton
  - Empty state: "Brak danych dla wybranego okresu"
  - Tooltip accessibility: keyboard navigable points
  - Color blind friendly: outliery z iconem + kolor
- Add weight modal:
  - Required note (validation)
  - Date picker: max 7 dni wstecz, nie przyszłość
  - Success → toast + chart/history refresh
  - Anomaly detection: jeśli >3kg → info w modal (ale submit allowed)
- Change status modal:
  - Warnings:
    - Wstrzymany → "Przypomnienia wyłączone"
    - Zakończony → "Retencja 24 miesiące. Nie można dodawać wpisów."
  - Audit log entry
- Loading states
- Error handling
- Keyboard navigation
- ARIA labels
- Event tracking: `add_weight_dietitian`, patient status changes

---

#### C. Panel Analityki
**Ścieżka:** `/dietetyk/analityka`
**Dostęp:** Dietetyk (authenticated)
**Główny cel:** Przegląd KPI, skuteczności przypomnień i analiza kohortowa

**Kluczowe informacje:**
- Weekly compliance rate (główny KPI)
- Reminder effectiveness (piątek vs niedziela)
- Cohort analysis (4-tygodniowe okna)
- Filtry: period (week, month, quarter)

**Kluczowe komponenty:**
- `AnalyticsFilters`
  - Dropdown: period (tydzień, miesiąc, kwartał)
  - Custom date range picker (advanced)
  - Button: odśwież
- `KPICards` (3 kolumny grid)
  - **Card 1: Weekly Compliance Rate**
    - Główna metryka: 82%
    - Change vs poprzedni okres: +7% (🟢)
    - Sparkline trend (mini wykres)
  - **Card 2: Active Patients**
    - Liczba: 25
  - **Card 3: Total Entries**
    - Liczba: 98
    - Breakdown: 85 pacjent, 13 dietetyk
- `ReminderEffectiveness` (2 karty side-by-side)
  - **Friday 19:00:**
    - Sent: 20
    - Open rate: 75%
    - Click rate: 60%
    - Conversion: 55% (dodali wpis)
    - Avg time to entry: 2.5h
  - **Sunday 11:00:**
    - Analogiczne metryki
- `CohortAnalysisTable`
  - Kolumny: Cohort ID, Start date, End date, Active patients, Compliance %, Push opt-in %, Avg entries/week
  - Sortowanie po dacie (DESC)
  - 4-tygodniowe okresy

**API Integration:**
- `GET /api/dietitian/analytics/kpi?period={week|month|quarter}`
- `GET /api/dietitian/analytics/cohorts?startDate=&endDate=&groupBy=week`

**UX, dostępność i bezpieczeństwo:**
- Period filter → auto-refresh (with loading state)
- KPI cards z visual hierarchy (główna metryka largest)
- Sparklines dla trendów (Chart.js mini charts)
- Color coding: green = pozytywny trend, red = negatywny
- Reminder effectiveness: bar charts dla porównania pt vs nd
- Cohort table: responsive (mobile = cards)
- Empty states: "Brak danych dla wybranego okresu"
- Export button (future: CSV export)
- Loading skeletons
- Error handling
- Keyboard navigation
- ARIA: `role="region"`, `aria-label="Analityka"`
- Tooltips dla wyjaśnienia metryk

---

#### D. Zaproszenia
**Ścieźka:** `/dietetyk/zaproszenia`
**Dostęp:** Dietetyk (authenticated)
**Główny cel:** Wysyłanie zaproszeń e-mail do nowych pacjentów

**Kluczowe informacje:**
- Formularz wysyłania zaproszenia (email)
- Historia wysłanych zaproszeń (status, data wygaśnięcia)

**Kluczowe komponenty:**
- `InvitationForm`
  - Input: email pacjenta
  - Button: "Wyślij zaproszenie"
- `InvitationsList`
  - Table: Email, Status (pending/used/expired), Created, Expires, Actions
  - Action: "Wyślij ponownie" (invalidates previous)

**API Integration:**
- `POST /api/dietitian/invitations`
- `GET /api/dietitian/invitations` (future: lista zaproszeń)

**UX, dostępność i bezpieczeństwo:**
- Email validation (Zod)
- Duplicate check: jeśli email już ma konto → error "Email już zarejestrowany"
- Success: "Zaproszenie wysłane na [email]"
- Copy invitation link button (future)
- Resend: unieważnia poprzednie zaproszenie
- Expiration: 7 dni (pokazane w UI)
- Loading states
- Toast notifications
- Keyboard navigation
- Event tracking: `signup_invite_sent`

---

#### E. Audit Log
**Ścieźka:** `/dietetyk/audit`
**Dostęp:** Dietetyk (authenticated)
**Główny cel:** Przeglądanie dziennika zmian dla compliance i debugowania

**Kluczowe informacje:**
- Lista wszystkich akcji create/update/delete
- Filtry: user, action, table, date range
- Pagination

**Kluczowe komponenty:**
- `AuditLogFilters`
  - Select: user (dropdown pacjentów)
  - Select: action (create, update, delete)
  - Select: table name
  - Date range picker
- `AuditLogTable`
  - Kolumny: Timestamp, User, Action, Table, Record ID, Before, After
  - Expandable rows dla before/after JSON
- `AuditEntryDetail` - modal/drawer z full JSON diff

**API Integration:**
- `GET /api/dietitian/audit?userId=&action=&tableName=&startDate=&endDate=&limit=50&offset=0`

**UX, dostępność i bezpieczeństwo:**
- Filters persisted w URL
- Pagination: 50 per page
- JSON diff visualization (library: react-diff-viewer)
- Syntax highlighting
- Search within audit (future)
- Export (future: CSV)
- Loading states
- Empty state: "Brak wpisów dla wybranych filtrów"
- Keyboard navigation
- ARIA: table semantics

---

## 3. Mapa podróży użytkownika

### 3.1 Podróż Pacjenta

#### A. Onboarding (nowy pacjent)
```
1. EMAIL ZAPROSZENIA
   ↓ klik w link
2. /auth/signup?token=abc123
   - Walidacja tokenu
   - Formularz rejestracji (imię, nazwisko, wiek, płeć, hasło, zgody)
   ↓ submit
3. Auto-login
   ↓ redirect
4. /waga/welcome
   - Welcome screen z intro
   - CTA "Dodaj pierwszą wagę"
   ↓ scroll/click
5. WeightEntryWidget
   - Wprowadzenie wagi
   ↓ submit
6. Success toast
   ↓ delay 1s
7. Pre-CTA Modal
   - "Włącz powiadomienia push?"
   - [Włącz] / [Może później]
   ↓ wybór
8. /waga (dashboard)
   - Główny widok aplikacji
```

**Pain points rozwiązane:**
- **Problem:** Skomplikowana rejestracja z wieloma krokami
  **Rozwiązanie:** Single-page signup, auto-login, szybkie dotarcie do value moment (pierwszy wpis)
- **Problem:** Zapomnienie o regularnych wpisach
  **Rozwiązanie:** Pre-CTA do włączenia push + email fallback
- **Problem:** Niejasne co robić po rejestracji
  **Rozwiązanie:** Welcome screen z clear CTA i onboarding steps

---

#### B. Codzienne dodawanie wagi
```
1. Wejście na /waga (dashboard)
   - Widget dodawania na górze
   ↓
2. Wprowadzenie wagi
   - Input number (mobile keyboard numeric)
   - Optional note
   ↓ submit
3. Client-side validation (Zod)
   - Zakres 30-250 kg
   - Precision 0.1
   ↓ pass
4. API call: POST /api/weight
   ↓
5a. Success (normal)
    - Toast: "Waga zapisana"
    - Optimistic update UI
    - Widget disabled do jutra

5b. Success (anomaly detected)
    - API zwraca warning (>3kg/24h)
    ↓
    - Modal: "Duża zmiana wagi. Czy poprawne?"
    - [Potwierdź] / [Popraw]
    ↓ potwierdź
    - POST /api/weight/:id/confirm
    - Toast: "Wpis potwierdzony"

5c. Error (conflict - już jest wpis dziś)
    - Toast error: "Wpis na dziś już istnieje"
    - Suggestion: "Możesz edytować w Historii"

5d. Error (validation)
    - Inline errors w formularzu
    - "Waga musi być w zakresie 30-250 kg"
```

**Pain points rozwiązane:**
- **Problem:** Długi proces dodawania
  **Rozwiązanie:** Quick add widget, 1-2 kliknięcia, optimistic updates
- **Problem:** Pomyłki w danych
  **Rozwiązanie:** Anomaly detection + możliwość edycji (do końca następnego dnia)
- **Problem:** Próba dodania drugiego wpisu tego samego dnia
  **Rozwiązanie:** Clear error message + sugestia edycji w Historii

---

#### C. Edycja wpisu
```
1. /waga/historia
   - Lista wszystkich wpisów
   ↓
2. Klik "Edytuj" (tylko jeśli w edit window)
   ↓
3. EditWeightModal
   - Pre-filled: waga, notatka
   - [Zapisz] [Usuń] [Anuluj]
   ↓ edit + submit
4. Client + server validation
   - Edit window check (do końca następnego dnia)
   ↓ pass
5. API call: PATCH /api/weight/:id
   ↓
6a. Success
    - Toast: "Wpis zaktualizowany"
    - Optimistic update + re-fetch
    - Modal close

6b. Success (new anomaly)
    - API zwraca new warning
    ↓
    - Confirmation modal

6c. Error (edit window expired)
    - Toast: "Nie możesz już edytować tego wpisu"
    - Modal close
```

**Pain points rozwiązane:**
- **Problem:** Brak możliwości korekty błędów
  **Rozwiązanie:** Edycja w rozszerzonym oknie (do końca następnego dnia)
- **Problem:** Przypadkowe usunięcie wpisu
  **Rozwiązanie:** Delete confirmation modal

---

#### D. Backfill (uzupełnianie brakujących dni)
```
1. /waga (dashboard)
   ↓
2. WeightEntryWidget
   - Checkbox: "Inny dzień" (opens date picker)
   ↓ select date (max 7 dni wstecz)
3. Wprowadzenie wagi dla wybranej daty
   ↓ submit
4. API: POST /api/weight
   - Server sprawdza: measurementDate vs NOW
   - Ustawia isBackfill=true
   ↓
5. Success
   - Toast: "Wpis zapisany (backfill)"
   - Wpis w historii z 🔄 badge
```

**Pain points rozwiązane:**
- **Problem:** Zapomnienie dodania wagi przez kilka dni
  **Rozwiązanie:** Backfill do 7 dni z oznaczeniem

---

### 3.2 Podróż Dietetyka

#### A. Przegląd pacjentów i dodawanie wagi
```
1. Login → redirect /dietetyk/dashboard
   - Lista pacjentów z statusem obowiązku
   ↓
2. Klik na pacjenta bez wpisu (🔴)
   ↓ redirect
3. /dietetyk/pacjenci/:id
   - Header z danymi pacjenta
   - Zakładki historii
   - Wykres
   ↓
4. Klik "Dodaj wagę za pacjenta"
   ↓
5. AddWeightForPatientModal
   - Input: waga
   - DatePicker: data pomiaru (default dziś)
   - Textarea: notatka (REQUIRED)
   ↓ submit
6. Client + server validation
   ↓ pass
7. API: POST /api/dietitian/patients/:id/weight
   ↓
8. Success
   - Toast: "Waga dodana za pacjenta"
   - Chart + history refresh
   - Modal close
   - Badge update (🟢 obowiązek spełniony)
```

**Pain points rozwiązane:**
- **Problem:** Ręczne upominanie pacjentów o wagę
  **Rozwiązanie:** Dashboard z clear statusem + możliwość dodania za pacjenta
- **Problem:** Brak kontekstu dla wpisu dietetyka
  **Rozwiązanie:** Obowiązkowa notatka (np. "Podane przez telefon")

---

#### B. Zarządzanie statusem pacjenta
```
1. /dietetyk/pacjenci/:id
   ↓
2. Klik dropdown statusu w header
   - Aktywny / Wstrzymany / Zakończony
   ↓ wybór "Wstrzymany"
3. ChangePatientStatusModal
   - Info: "Przypomnienia zostaną wyłączone"
   - Optional: notatka (np. "Urlop 2 tygodnie")
   ↓ confirm
4. API: PATCH /api/dietitian/patients/:id/status
   ↓
5. Success
   - Toast: "Status zmieniony na Wstrzymany"
   - Badge update (🟡)
   - Patient excluded from reminders
   - Audit log entry
```

**Pain points rozwiązane:**
- **Problem:** Przypomnienia wysyłane do nieaktywnych pacjentów
  **Rozwiązanie:** Status management z auto-suppression przypomnień
- **Problem:** Brak historii zmian statusu
  **Rozwiązanie:** Audit log + notatki w modal

---

#### C. Analiza skuteczności
```
1. /dietetyk/analityka
   - KPI cards + reminder effectiveness + cohorts
   ↓
2. Wybór period filter: "Miesiąc"
   ↓ auto-refresh
3. API: GET /api/dietitian/analytics/kpi?period=month
   ↓
4. Widok metryk:
   - Weekly compliance: 82% (+7% vs poprzedni miesiąc)
   - Friday reminders: 75% open rate, 55% conversion
   - Sunday reminders: 75% open rate, 50% conversion
   ↓
5. Insight: piątkowe przypomnienia skuteczniejsze
   ↓
6. Decision: priorytet optymalizacji treści piątkowych emaili
```

**Pain points rozwiązane:**
- **Problem:** Brak wglądu w skuteczność przypomnień
  **Rozwiązanie:** Reminder effectiveness dashboard z open/click/conversion rates
- **Problem:** Brak porównań w czasie
  **Rozwiązanie:** Cohort analysis z 4-tygodniowymi oknami

---

## 4. Układ i struktura nawigacji

### 4.1 Nawigacja Pacjenta

#### Desktop (>= 1024px)
```
┌─────────────────────────────────────────────┐
│ [Logo] Dietoterapia        [User Menu ▼]   │ ← Top bar (fixed)
└─────────────────────────────────────────────┘
│                                             │
│           CONTENT AREA                      │
│                                             │
└─────────────────────────────────────────────┘
```

**Top Bar:**
- Logo (link do `/waga`)
- User menu dropdown (prawy górny róg):
  - Imię pacjenta
  - Dashboard
  - Historia
  - Ustawienia
  - ---
  - Wyloguj

#### Mobile (< 640px)
```
┌─────────────────────────────────────────────┐
│ [Logo] Dietoterapia        [User Menu ▼]   │ ← Top bar
└─────────────────────────────────────────────┘
│                                             │
│           CONTENT AREA                      │
│                                             │
│                                             │
┌─────────────────────────────────────────────┐
│ [🏠 Dashboard] [📊 Historia] [⚙️ Ustawienia]│ ← Bottom nav (sticky)
└─────────────────────────────────────────────┘
```

**Bottom Navigation:**
- 3 items: Dashboard, Historia, Ustawienia
- Active state: primary color + bold icon
- Always visible (sticky bottom)
- Icons + labels
- Haptic feedback on tap (iOS)

**Nawigacja między widokami:**
- `/waga` ↔ `/waga/historia` ↔ `/waga/ustawienia` (bottom nav)
- Deep links obsługiwane (shareable)
- Back button przeglądarki działa

---

### 4.2 Nawigacja Dietetyka

#### Desktop (>= 1024px)
```
┌───────┬─────────────────────────────────────┐
│       │ [User Menu ▼]                       │ ← Top bar
│       ├─────────────────────────────────────┤
│       │                                     │
│ SIDE  │         CONTENT AREA                │
│ BAR   │                                     │
│       │                                     │
│       │                                     │
└───────┴─────────────────────────────────────┘
```

**Sidebar (fixed, 240px):**
- Logo (top)
- Navigation items:
  - 📊 Dashboard
  - 📈 Analityka
  - ✉️ Zaproszenia
  - 📋 Audit Log
- Active state: background color + left border
- Hover states
- Icons + labels

**Top Bar:**
- User menu dropdown (prawy górny róg):
  - Paulina (dietetyk)
  - ---
  - Wyloguj

#### Tablet (640-1024px)
- Sidebar collapsed (tylko ikony)
- Expand on hover
- Logo jako hamburger icon

#### Mobile (< 640px)
```
┌─────────────────────────────────────────────┐
│ [☰] Dietoterapia           [User Menu ▼]   │ ← Top bar
└─────────────────────────────────────────────┘
│                                             │
│           CONTENT AREA                      │
│                                             │
└─────────────────────────────────────────────┘
```

**Hamburger Menu:**
- Slide-in drawer z left
- Same navigation items jako sidebar
- Overlay + backdrop blur
- Close: klik poza drawer / Esc / X button
- Focus trap w drawer

**Nawigacja między widokami:**
- `/dietetyk/dashboard` → główny widok
- Klik pacjenta → `/dietetyk/pacjenci/:id`
- Breadcrumb w szczegółach: `Dashboard > Jan Kowalski`
- Breadcrumb kliknięty → powrót do dashboard

---

### 4.3 Nawigacja Autentykacji (wszystkie urządzenia)

```
┌─────────────────────────────────────────────┐
│              [Logo]                         │
│                                             │
│          FORM CONTENT                       │
│                                             │
│                                             │
└─────────────────────────────────────────────┘
```

**Layout:**
- Minimalistyczny: logo + form + footer
- Centered card (max-width 480px)
- No navigation (dedicated auth flow)
- Links:
  - Login ↔ Forgot password
  - Signup → auto-redirect po success

---

## 5. Kluczowe komponenty

### 5.1 Shared UI Components (`src/components/ui/`)

#### Button
**Warianty:** primary, secondary, outline, ghost, danger
**Stany:** default, hover, active, disabled, loading
**Props:** `variant`, `size` (sm, md, lg), `fullWidth`, `loading`, `disabled`, `icon`, `children`
**Accessibility:** `aria-label`, `aria-busy` (when loading), keyboard focus ring

```tsx
<Button variant="primary" size="md" loading={isSubmitting}>
  Zapisz
</Button>
```

---

#### Input
**Typy:** text, email, password, number, date
**Props:** `type`, `label`, `placeholder`, `error`, `helperText`, `required`, `disabled`, `inputMode` (mobile keyboard)
**Accessibility:** `htmlFor` linking label, `aria-required`, `aria-describedby` (error), `aria-invalid`

```tsx
<Input
  type="number"
  label="Waga (kg)"
  placeholder="75.5"
  inputMode="decimal"
  step="0.1"
  min="30"
  max="250"
  error={errors.weight?.message}
  required
/>
```

---

#### Modal
**Props:** `isOpen`, `onClose`, `title`, `children`, `footer` (buttons), `size` (sm, md, lg)
**Accessibility:** `aria-modal="true"`, `role="dialog"`, `aria-labelledby` (title), focus trap, Esc to close, initial focus management
**Features:** backdrop click to close (optional), scroll lock body, slide-in animation

```tsx
<Modal isOpen={isOpen} onClose={onClose} title="Edytuj wpis">
  <WeightEditForm />
</Modal>
```

---

#### Card
**Props:** `variant` (default, outlined), `padding`, `hover`, `clickable`, `children`
**Use cases:** weight entry cards, patient cards, KPI cards

```tsx
<Card clickable hover onClick={() => navigate(`/pacjenci/${id}`)}>
  <PatientInfo {...patient} />
</Card>
```

---

#### Badge
**Warianty:** success, warning, danger, info, neutral
**Props:** `variant`, `dot` (boolean), `icon`, `children`
**Use cases:** status badges, obligation indicators, flags

```tsx
<Badge variant="success" dot>Aktywny</Badge>
<Badge variant="danger">🔴 Brak wpisu</Badge>
```

---

#### Toast
**Library:** react-hot-toast
**Warianty:** success, error, info, loading
**Props:** `message`, `duration` (default 3s), `icon`
**Position:** top-right (desktop), top-center (mobile)
**Accessibility:** `role="status"`, `aria-live="polite"`, dismiss button

```tsx
toast.success('Waga zapisana');
toast.error('Błąd walidacji');
```

---

#### Spinner
**Props:** `size` (sm, md, lg), `color`
**Use cases:** button loading state, skeleton placeholder, full-page loading

```tsx
<Button loading>
  <Spinner size="sm" /> Zapisywanie...
</Button>
```

---

#### Skeleton
**Props:** `width`, `height`, `variant` (text, circle, rect), `count` (for repeated)
**Use cases:** loading states dla list, cards, charts

```tsx
<SkeletonCard count={7} />
```

---

### 5.2 Form Components (`src/components/forms/`)

#### WeightEntryForm
**Purpose:** Quick add widget dla dashboardu pacjenta
**Fields:** waga (number), notatka (textarea, optional), data pomiaru (date picker, optional - default dziś)
**Validation:** Zod schema (30-250 kg, precision 0.1, max 7 dni backfill)
**Integration:** React Hook Form + TanStack Query mutation
**Features:** optimistic update, anomaly detection modal, disabled po dodaniu dziś

---

#### LoginForm
**Fields:** email, password
**Validation:** Zod (email format, password ≥8 chars)
**Features:** show/hide password, remember me (future), rate limiting info

---

#### SignupForm
**Fields:** firstName, lastName, age (number), gender (select), email (readonly), password, consents (checkboxes)
**Validation:** Zod schema z custom validators
**Features:** password strength indicator, expandable consent texts, invitation token validation

---

#### PasswordResetForm
**Fields:** email
**Validation:** email format
**Features:** generic success message (no email enumeration)

---

### 5.3 Weight Components (`src/components/weight/`)

#### WeightEntryCard
**Props:** entry object (weight, date, note, source, flags)
**Features:**
- Display: data, waga, delta (change from previous)
- Badges: backfill (🔄), outlier (⚠️), dietitian source (👩‍⚕️)
- Edit button (if in edit window)
- Confirmation button (if outlier unconfirmed)
- Responsive: mobile compact, desktop detailed

---

#### WeightChart
**Library:** Chart.js
**Props:** data (entries with ma7), period (30|90), goalWeight (optional)
**Features:**
- Lines: actual weights (solid), MA7 (dotted), goal (horizontal dotted)
- Points: outliery (red), dietitian entries (icon marker)
- Tooltip: date, weight, change, note
- Responsive canvas
- Loading skeleton
- Empty state

---

#### WeightHistory
**Props:** entries array, onLoadMore, hasMore
**Features:**
- Infinite scroll (Intersection Observer)
- WeightEntryCard dla każdego entry
- Loading more spinner
- Empty state: "Brak wpisów"

---

### 5.4 Patient Components (`src/components/patient/`)

#### PatientCard
**Props:** patient object
**Use case:** lista pacjentów w dashboardzie dietetyka
**Features:**
- Display: imię, nazwisko, status badge, last entry date, weekly obligation badge
- Click → navigate to details
- Responsive: mobile card layout, desktop table row

---

#### PatientHeader
**Props:** patient object, onStatusChange
**Features:**
- Display: imię, email, status dropdown (editable)
- Button: "Dodaj wagę za pacjenta"
- Status change → modal confirmation

---

#### PatientStats
**Props:** statistics object
**Features:**
- Display: total entries, current streak, longest streak, weekly compliance rate, last entry
- Icons + numbers
- Tooltips dla wyjaśnień

---

### 5.5 Navigation Components (`src/components/navigation/`)

#### PatientHeader (desktop)
**Props:** user object
**Features:** logo, user menu dropdown
**Sticky:** top

---

#### PatientBottomNav (mobile)
**Props:** active route
**Features:** 3 items (Dashboard, Historia, Ustawienia), active state, icons + labels
**Sticky:** bottom

---

#### DietitianSidebar (desktop)
**Props:** active route
**Features:** navigation items, active state, collapse/expand (tablet)
**Fixed:** left, 240px

---

#### DietitianDrawer (mobile)
**Props:** isOpen, onClose
**Features:** slide-in drawer, navigation items, backdrop, focus trap

---

### 5.6 Specialized Components

#### Pre-CTA Push Modal
**Trigger:** po pierwszym `add_weight_patient` (delay 1s)
**Content:** "📬 Nie zapomnij o wadze! Włącz powiadomienia..."
**Buttons:** "Włącz powiadomienia" / "Może później"
**Checkbox:** "Nie pokazuj ponownie"
**Fallback:** jeśli brak wsparcia push → info + auto-enable email

---

#### Anomaly Confirmation Modal
**Trigger:** API zwraca warning (>3kg/24h)
**Content:** "⚠️ Duża zmiana wagi. Wykryliśmy zmianę o X kg. Czy to poprawne?"
**Buttons:** "Tak, potwierdź" / "Nie, popraw"
**Integration:** `POST /api/weight/:id/confirm` lub redirect do edit

---

#### Delete Confirmation Modal
**Trigger:** klik "Usuń" w edit modal
**Content:** "Czy na pewno usunąć wpis z [data]? Akcja nieodwracalna."
**Buttons:** "Tak, usuń" (danger) / "Anuluj"

---

#### Change Password Modal
**Trigger:** settings → "Zmień hasło"
**Fields:** obecne hasło, nowe hasło, potwierdzenie
**Validation:** obecne required, nowe ≥8 chars, match confirmation
**Success:** logout all sessions + redirect login

---

#### Delete Account Modal
**Trigger:** settings → "Usuń konto"
**Content:** Warning o retencji 24 miesiące, offer data export
**Fields:** password, confirmation text "DELETE MY ACCOUNT"
**Buttons:** "Tak, usuń" (danger) / "Anuluj"
**Success:** logout + redirect + info message

---

## 6. Mapowanie wymagań na elementy UI

### US-001: Dietetyk zaprasza pacjenta
**Widok:** `/dietetyk/zaproszenia`
**Komponenty:** `InvitationForm`, `InvitationsList`
**API:** `POST /api/dietitian/invitations`
**Flow:** formularz email → submit → success toast → email wysłany z linkiem

---

### US-002: Rejestracja pacjenta
**Widok:** `/auth/signup?token=...`
**Komponenty:** `SignupForm` (fields: firstName, lastName, age, gender, email readonly, password, consents)
**API:** `GET /api/invitations/:token` (validation), `POST /api/auth/signup`
**Flow:** token validation → formularz → submit → auto-login → redirect `/waga/welcome`

---

### US-003: Logowanie
**Widok:** `/auth/login`
**Komponenty:** `LoginForm`
**API:** `POST /api/auth/login`
**Flow:** email + password → submit → success → redirect (pacjent: `/waga`, dietetyk: `/dietetyk/dashboard`)

---

### US-010: Szybkie dodanie wagi
**Widok:** `/waga` (dashboard)
**Komponenty:** `WeightEntryWidget` (input waga, textarea notatka, button submit)
**API:** `POST /api/weight`
**Flow:** input → validate (Zod) → submit → success toast / anomaly modal → widget disabled

---

### US-012: Edycja do końca następnego dnia
**Widok:** `/waga/historia`
**Komponenty:** `WeightEntryCard` (button "Edytuj"), `EditWeightModal`
**API:** `PATCH /api/weight/:id`
**Flow:** klik edytuj → modal → change values → submit → validate edit window → success/error

---

### US-013: Backfill do 7 dni
**Widok:** `/waga` (dashboard)
**Komponenty:** `WeightEntryWidget` z date picker (checkbox "Inny dzień")
**API:** `POST /api/weight` (server sets isBackfill)
**Flow:** select date (max 7 dni wstecz) → input waga → submit → success + badge 🔄

---

### US-015: Historia pomiarów
**Widok:** `/waga/historia`
**Komponenty:** `HistoryFilters` (date range), `WeightHistory` (infinite scroll), `WeightEntryCard`
**API:** `GET /api/weight?cursor=...&limit=30`
**Flow:** filtry → lista entries → scroll → auto-load more

---

### US-016: Potwierdzanie anomalii
**Widok:** `/waga/historia` lub dashboard po dodaniu
**Komponenty:** `AnomalyConfirmationModal` (trigger: API warning)
**API:** `POST /api/weight/:id/confirm`
**Flow:** API returns warning → modal → confirm/correct → success toast

---

### US-017: Pre-CTA web push
**Widok:** `/waga` (dashboard, po pierwszym add)
**Komponenty:** `PreCTAPushModal`
**API:** `POST /api/push/subscribe`
**Flow:** first add_weight → delay 1s → modal → "Włącz" → request permission → subscribe

---

### US-020: Widok dietetyka per pacjent
**Widok:** `/dietetyk/pacjenci/:id`
**Komponenty:** `WeightHistoryTabs` (Dziś/Tydzień/Zakres), `WeightEntryList`
**API:** `GET /api/dietitian/patients/:id/weight?view=...`
**Flow:** tabs → select view → lista entries + badge obowiązku

---

### US-021: Dietetyk dodaje wagę
**Widok:** `/dietetyk/pacjenci/:id`
**Komponenty:** `AddWeightForPatientModal` (trigger: button w header)
**API:** `POST /api/dietitian/patients/:id/weight`
**Flow:** button → modal → fields (waga, data, notatka required) → submit → success toast + refresh

---

### US-022: Wykres pacjenta
**Widok:** `/dietetyk/pacjenci/:id`
**Komponenty:** `WeightChart` (Chart.js)
**API:** `GET /api/dietitian/patients/:id/chart?period=30|90`
**Flow:** toggle 30/90 → fetch data → render chart (actual + MA7 + outliery + dietitian markers + goal)

---

### US-023: Zarządzanie statusem
**Widok:** `/dietetyk/pacjenci/:id`
**Komponenty:** `PatientHeader` (status dropdown), `ChangePatientStatusModal`
**API:** `PATCH /api/dietitian/patients/:id/status`
**Flow:** dropdown → select → modal (notatka + warning) → confirm → toast + badge update

---

### US-041: Panel KPI
**Widok:** `/dietetyk/analityka`
**Komponenty:** `KPICards` (3 cards), `AnalyticsFilters`
**API:** `GET /api/dietitian/analytics/kpi?period=...`
**Flow:** period filter → fetch KPI → display cards (compliance, patients, entries)

---

### US-050: Usunięcie konta
**Widok:** `/waga/ustawienia`
**Komponenty:** `DeleteAccountModal`
**API:** `DELETE /api/user/account`
**Flow:** button → modal → fields (password, confirmation) → submit → logout + redirect

---

## 7. Względy UX, dostępności i bezpieczeństwa

### 7.1 UX Best Practices

#### Minimize Friction
- **Quick add widget:** 1-2 kliknięcia do dodania wagi
- **Optimistic updates:** instant feedback, rollback on error
- **Auto-focus:** focus na głównym polu przy wejściu na stronę
- **Smart defaults:** data pomiaru = dziś, notatka optional
- **Keyboard shortcuts:** Ctrl+Enter = submit w formularzach

#### Progressive Disclosure
- **Welcome screen:** pokazany tylko raz po rejestracji
- **Pre-CTA push:** delay 1s, checkbox "Nie pokazuj ponownie"
- **Anomaly modals:** tylko gdy detected, nie blokują workflow
- **Advanced filters:** collapsed by default, expand on demand

#### Clear Feedback
- **Toast notifications:** success/error w right corner (desktop), top-center (mobile)
- **Loading states:** button spinners, skeleton screens, progress indicators
- **Empty states:** helpful messages + CTA (np. "Brak wpisów. Dodaj pierwszą wagę!")
- **Error messages:** specific, actionable (np. "Waga musi być w zakresie 30-250 kg")

#### Mobile-First Design
- **Touch targets:** min 44x44px (Apple HIG)
- **Input modes:** `inputmode="decimal"` dla numeric keyboards
- **Bottom navigation:** łatwy dostęp kciukiem (thumb zone)
- **Sticky elements:** widget dodawania, bottom nav, headers
- **Swipe gestures:** future enhancement dla quick actions

---

### 7.2 Accessibility (WCAG AA)

#### Keyboard Navigation
- **Tab order:** logiczny, bez pułapek
- **Focus indicators:** wyraźne (`focus:ring-2 focus:ring-offset-2`)
- **Shortcuts:** Esc = close modal, Enter = submit, Tab/Shift+Tab = navigate
- **Skip links:** "Skip to main content" (dla screen readers)
- **Focus management:** auto-focus pierwszego pola w modalach, return focus po zamknięciu

#### Screen Readers
- **ARIA labels:** `aria-label`, `aria-labelledby`, `aria-describedby`
- **ARIA landmarks:** `<nav>`, `<main>`, `<aside>`, `role="region"`
- **Live regions:** `aria-live="polite"` dla toastów, `role="status"` dla loading
- **Modal accessibility:** `aria-modal="true"`, `role="dialog"`, focus trap
- **Form labels:** `<label htmlFor="...">`, `aria-required`, `aria-invalid`

#### Visual Accessibility
- **Kontrast kolorów:** min 4.5:1 dla tekstu, 3:1 dla komponentów UI
- **Nie tylko kolor:** ikony + tekst dla statusów (np. 🟢 + "Aktywny")
- **Font size:** min 16px dla body text, skalowalne (rem units)
- **Spacing:** wystarczający (8px grid) dla łatwego klikania
- **Animacje:** respect `prefers-reduced-motion`

#### Testing
- **Lighthouse:** automated audit (target >90)
- **axe DevTools:** detailed accessibility report
- **Manual keyboard test:** pełny workflow bez myszy
- **Screen reader test:** NVDA (Windows) / VoiceOver (macOS, iOS)

---

### 7.3 Bezpieczeństwo

#### Authentication & Authorization
- **Session cookies:** httpOnly, secure (prod), SameSite=lax
- **CSRF protection:** Astro middleware, token w formularzach
- **Rate limiting:** 5 failed login attempts → 15 min lockout
- **Password requirements:** ≥8 chars, optional strength meter
- **Session expiry:** 30 dni, auto-refresh on activity

#### Data Validation
- **Client-side (Zod):** fast feedback, better UX
- **Server-side re-validation:** always, defence in depth
- **Sanitization:** escape user input przed wyświetleniem
- **SQL injection prevention:** parameterized queries (Drizzle ORM)
- **XSS prevention:** React auto-escapes, CSP headers

#### Privacy & RODO
- **Consent tracking:** log treści i timestamp zgód
- **Data export:** `GET /api/user/export` (JSON)
- **Account deletion:** anonimizacja PII, retencja 24 miesiące
- **Audit log:** wszystkie sensitive operations
- **Encryption:** TLS in-transit, at-rest (database level)

#### Error Handling
- **No sensitive info leakage:** generic errors dla auth ("Invalid credentials", nie "Email not found")
- **Logging:** server-side errors logged (nie pokazywane userowi)
- **Fallbacks:** error boundaries, fallback UI, retry mechanisms
- **Monitoring:** future Sentry integration dla production error tracking

---

## 8. Stany błędów i przypadki brzegowe

### 8.1 Network Errors

#### API Offline
- **Detection:** fetch timeout (10s), network error
- **UI:** global error boundary
- **Message:** "Brak połączenia. Sprawdź internet."
- **Actions:** button "Spróbuj ponownie"
- **Fallback:** pokazywanie cached data (TanStack Query)

#### Slow Network
- **Detection:** request >3s
- **UI:** loading spinners, skeleton screens
- **UX:** disable submit buttons podczas loading
- **Timeout:** max 30s dla non-critical requests, abort signal

---

### 8.2 Validation Errors

#### Client-side Validation Fail
- **Trigger:** Zod schema violation
- **UI:** inline errors (red text pod polem)
- **ARIA:** `aria-invalid="true"`, `aria-describedby="field-error"`
- **Prevention:** disabled submit button dopóki validation fails

#### Server-side Validation Fail
- **Trigger:** API returns 400/422
- **UI:** toast error + inline errors (if field-specific)
- **Message:** specific error message z API response
- **Recovery:** user corrects → re-submit

---

### 8.3 Authorization Errors

#### 401 Unauthorized (expired session)
- **Detection:** API returns 401
- **Action:** auto-logout, clear session cookie, redirect `/auth/login`
- **Message:** toast "Sesja wygasła. Zaloguj się ponownie."
- **Preservation:** save form data w localStorage (if applicable)

#### 403 Forbidden (insufficient permissions)
- **Detection:** API returns 403
- **UI:** error page "Brak dostępu"
- **Prevention:** UI elements hidden based on role (client-side check)
- **Logging:** unauthorized access attempts logged server-side

---

### 8.4 Business Logic Errors

#### Duplicate Entry (conflict 409)
- **Scenario:** próba dodania drugiego wpisu tego samego dnia
- **API:** returns 409 Conflict
- **UI:** toast error "Wpis na dziś już istnieje"
- **Suggestion:** link/button "Przejdź do Historii i edytuj"

#### Edit Window Expired
- **Scenario:** próba edycji wpisu po deadline (koniec następnego dnia)
- **API:** returns 400 Bad Request
- **UI:** toast error "Nie możesz już edytować tego wpisu"
- **Prevention:** button "Edytuj" disabled/hidden jeśli expired (client check)

#### Backfill Limit Exceeded
- **Scenario:** próba dodania wpisu >7 dni wstecz
- **API:** returns 400 Bad Request
- **UI:** toast error "Możesz dodawać wpisy max 7 dni wstecz"
- **Prevention:** date picker max = 7 dni wstecz (client validation)

#### Invalid Invitation Token
- **Scenario:** wejście na `/auth/signup?token=expired`
- **API:** `GET /api/invitations/:token` returns 400/404
- **UI:** error page "Zaproszenie wygasło lub zostało użyte"
- **Action:** contact dietetyk (info + email link)

---

### 8.5 Empty States

#### No Weight Entries (pacjent)
- **Widok:** `/waga/historia`
- **Message:** "Brak wpisów. Dodaj pierwszą wagę!"
- **CTA:** button "Dodaj wagę" → scroll to widget / redirect dashboard

#### No Patients (dietetyk)
- **Widok:** `/dietetyk/dashboard`
- **Message:** "Brak pacjentów. Zaproś pierwszego!"
- **CTA:** button "Wyślij zaproszenie" → redirect `/dietetyk/zaproszenia`

#### No Chart Data
- **Widok:** `/dietetyk/pacjenci/:id` (wykres)
- **Message:** "Brak danych dla wybranego okresu"
- **Suggestion:** "Dodaj wpisy lub wybierz inny okres"

---

### 8.6 Loading States

#### Initial Page Load
- **UI:** full-page spinner (centered)
- **Timeout:** max 10s → error message "Ładowanie trwa dłużej niż zwykle"

#### Data Fetching
- **UI:** skeleton screens (dla list, cards)
- **Progressive:** pokazuj partial data + loading dla reszty

#### Form Submission
- **UI:** button spinner + disabled state
- **Message:** "Zapisywanie..." (aria-live)
- **Prevention:** disable multiple submits

#### Infinite Scroll
- **UI:** spinner na dole listy
- **Message:** "Ładowanie więcej..." (visually hidden dla SR)
- **End:** "Brak więcej wpisów"

---

## 9. Responsywność i breakpointy

### Breakpointy TailwindCSS
- **Mobile:** `< 640px` (default)
- **Tablet:** `640px - 1024px` (md)
- **Desktop:** `>= 1024px` (lg)

### Patterns Responsywne

#### Layout
```css
/* Mobile-first */
.container {
  @apply p-4 md:p-6 lg:p-8;
}
```

#### Grid
```css
/* 1 kolumna mobile, 2 tablet, 3 desktop */
.grid {
  @apply grid-cols-1 md:grid-cols-2 lg:grid-cols-3;
}
```

#### Typography
```css
/* Skalowana typografia */
.heading {
  @apply text-2xl md:text-3xl lg:text-4xl;
}
```

#### Visibility
```css
/* Ukryj na mobile, pokaż na desktop */
.desktop-only {
  @apply hidden md:block;
}

/* Pokaż tylko na mobile */
.mobile-only {
  @apply block md:hidden;
}
```

### Komponenty Responsywne

#### Navigation
- **Mobile:** Bottom nav (pacjent), Hamburger drawer (dietetyk)
- **Desktop:** Top bar (pacjent), Sidebar (dietetyk)

#### Tables
- **Mobile:** Card view (stack layout)
- **Desktop:** Table view (rows + columns)

#### Modals
- **Mobile:** Full-screen (slide from bottom)
- **Desktop:** Centered overlay (max-width 600px)

#### Charts
- **Mobile:** Full width, simplified legend
- **Desktop:** Obok innych elementów, detailed tooltips

### Testing Devices
- **iPhone SE:** 375px (smallest mobile)
- **iPad:** 768px (tablet)
- **MacBook:** 1440px (desktop)

---

## 10. Performance Optimization

### Code Splitting
- **Route-based:** każda strona = osobny chunk (Astro automatic)
- **Component-based:** lazy load heavy components (Chart.js, modals)
- **Library splitting:** vendor chunks oddzielone od app code

### Image Optimization
- **Astro Image:** automatyczna optymalizacja, responsive srcset
- **Lazy loading:** `loading="lazy"` dla obrazów below fold
- **WebP format:** modern format z JPEG fallback

### Data Fetching
- **TanStack Query:** caching, deduplication, background refetch
- **Stale-while-revalidate:** pokazuj cached data + fetch fresh
- **Pagination:** 30 wpisów per page (nie load all)

### Rendering
- **SSR:** server-side rendering dla initial load (SEO, performance)
- **Hydration:** minimal JavaScript dla interaktywności
- **Partial hydration:** tylko interactive islands (Astro)

### Bundle Size
- **Tree shaking:** unused code eliminated
- **Chart.js:** ~60KB gzipped (lightweight)
- **TanStack Query:** ~12KB gzipped
- **Total JS:** target <200KB initial bundle

### Metrics Goals
- **LCP (Largest Contentful Paint):** <2.5s
- **FID (First Input Delay):** <100ms
- **CLS (Cumulative Layout Shift):** <0.1
- **Lighthouse Score:** >90 (Performance, Accessibility, SEO)

---

## Podsumowanie

Ta architektura UI zapewnia:

1. **Kompleksowe pokrycie wymagań PRD:** wszystkie user stories zmapowane na konkretne widoki i komponenty
2. **Spójność z API:** każdy widok zintegrowany z odpowiednimi endpointami
3. **Doskonałe UX:** mobile-first, quick actions, optimistic updates, clear feedback
4. **Accessibility:** WCAG AA compliance, keyboard navigation, screen reader support
5. **Bezpieczeństwo:** validation na wszystkich poziomach, CSRF protection, RODO compliance
6. **Skalowalność:** component-based architecture, reusable UI elements, maintainable code
7. **Performance:** code splitting, lazy loading, caching, target <2.5s LCP

**Gotowość do implementacji:** ✅
**Następny krok:** Setup base components + routing + TanStack Query
