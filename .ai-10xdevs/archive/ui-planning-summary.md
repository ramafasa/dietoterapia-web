# UI Architecture Planning Summary - Dietoterapia Weight Tracking MVP

**Data:** 2025-11-03
**Status:** ✅ Zatwierdzone
**Cel:** Architektura interfejsu użytkownika dla MVP aplikacji śledzenia wagi pacjentów

---

## Decisions

### Routing i Struktura Aplikacji
1. **Routing:** Wyraźnie rozdzielony routing dla pacjenta (`/waga/*`) i dietetyka (`/dietetyk/*`) oraz widoków autentykacji (`/auth/*`)
2. **Layouty:** Osobne layouty dla pacjenta (`PatientLayout.astro`) i dietetyka (`DietitianLayout.astro`) z responsive navigation

### Przepływy Użytkownika
3. **Onboarding:** Liniowy flow: Email → Rejestracja → Welcome → Pierwszy wpis → Pre-CTA push
4. **Dashboard pacjenta:** Typ "Quick Add + Overview" (all-in-one) z widgetem dodawania wagi na górze
5. **Historia wpisów:** Infinite scroll z cursor-based pagination (30 wpisów per page)
6. **Edycja wpisów:** Inline editing w historii + modal dla większych zmian

### Komponenty i Biblioteki
7. **Wykresy:** Chart.js (lightweight, 60KB gzipped) dla wykresów dietetyka z MA7 i oznaczeniami
8. **State Management:** React Context + TanStack Query (React Query) - hybrydowe podejście
9. **Error Handling:** Multi-layer: client-side validation (Zod) + toast notifications (react-hot-toast) + modals dla anomalii

### Widoki Dietetyka
10. **Dashboard zbiorczy:** TAK - uproszczona wersja w MVP z tabelą/listą pacjentów i statusem obowiązku tygodniowego
11. **Status pacjenta:** Inline control w widoku szczegółów (dropdown w header)
12. **Szczegóły pacjenta:** Multi-section layout z zakładkami (Dziś/Tydzień/Zakres), historią i wykresem
13. **Dodawanie wagi:** Modal z dodatkowymi polami (data pomiaru, obowiązkowa notatka)
14. **Panel analityki:** Single-page dashboard z sekcjami: KPI cards, reminder effectiveness, cohort analysis

### UX i Interakcje
15. **Pre-CTA web push:** Modal po pierwszym dodaniu wagi z opcją "Może później"
16. **Formularze autentykacji:** Osobne strony (/auth/login, /auth/signup, /auth/forgot-password, /auth/reset-password) - **uwzględnić istniejącą stronę logowania i przenieść pod /auth**
17. **Ustawienia użytkownika:** Prosta strona dla pacjenta (powiadomienia, profil, RODO), brak dla dietetyka w MVP

### Design System i Responsywność
18. **Responsywność:** Mobile-first z 3 breakpointami TailwindCSS (< 640px mobile, 640-1024px tablet, >= 1024px desktop)
19. **Nawigacja mobile:** Bottom nav dla pacjenta (3 items), hamburger menu dla dietetyka
20. **Accessibility:** WCAG AA checklist - fokus na keyboard navigation, form labels, kontrast kolorów

---

## Matched Recommendations

### 1. Routing i Hierarchia Widoków

**Struktura routingu:**
```
/auth/*
  ├── /auth/login (przenieść istniejącą stronę)
  ├── /auth/signup?token=...
  ├── /auth/forgot-password
  └── /auth/reset-password?token=...

/waga/* (pacjent)
  ├── /waga (dashboard)
  ├── /waga/welcome (po rejestracji)
  ├── /waga/historia
  └── /waga/ustawienia

/dietetyk/*
  ├── /dietetyk/dashboard (główny - lista pacjentów)
  ├── /dietetyk/pacjenci/:id
  ├── /dietetyk/analityka
  ├── /dietetyk/zaproszenia
  └── /dietetyk/audit
```

**Middleware autoryzacji:**
- `/waga/*` → wymaga roli `patient`
- `/dietetyk/*` → wymaga roli `dietitian`
- `/auth/*` → publiczne

---

### 2. Onboarding Flow

**Kroki:**
1. Email zaproszenia → klik w link `/auth/signup?token=abc123`
2. Formularz rejestracji (1 krok): imię, nazwisko, wiek, płeć, email (readonly), hasło, zgody RODO
3. Auto-login → redirect do `/waga/welcome`
4. Welcome screen: krótkie intro + CTA "Dodaj pierwszą wagę"
5. Formularz dodawania wagi (prosty)
6. Sukces → Toast + Modal pre-CTA push (delay 1s)

**Cel:** Minimalizacja friction, szybkie dotarcie do Value Moment (pierwszy wpis).

---

### 3. Dashboard Pacjenta - Quick Add + Overview

**Sekcje:**
- **Górna:** Widget dodawania wagi (sticky na mobile, disabled jeśli już jest wpis dziś)
- **Środkowa:** Status tygodniowy - badge "✅ Obowiązek spełniony" lub "⏳ Brak wpisu"
- **Dolna:** Historia ostatnich 7 dni z ikonami (backfill, outlier, źródło)
- **Mobile:** Bottom nav (Dashboard, Historia, Ustawienia)

**API Integration:**
- `GET /api/weight?limit=7`
- `POST /api/weight`
- `PATCH /api/weight/:id`

---

### 4. Formularz Dodawania Wagi - Mobile-First

**Cechy:**
- Input type="number", inputmode="decimal", step="0.1"
- Klawiatura numeryczna z kropką na mobile
- Walidacja client-side (Zod) + server-side
- Toast error jeśli poza zakresem 30-250 kg

**Anomaly Detection:**
- Jeśli skok >3 kg/24h → modal potwierdzenia: "⚠️ Duża zmiana wagi. Wykryliśmy zmianę o 3.3 kg w 24h. Czy to jest poprawne?"

---

### 5. Historia Wpisów - Infinite Scroll

**UI:**
- 30 ostatnich wpisów domyślnie
- Auto-load kolejnych 30 przy scrollu do końca
- Filtry: Date picker (startDate, endDate)
- Sortowanie: malejąco po measurementDate
- Karta wpisu: data, waga, zmiana vs poprzedni, notatka, badges, przycisk "Edytuj"

**API:** `GET /api/weight?cursor=...&limit=30`

---

### 6. Wykres dla Dietetyka - Chart.js

**Funkcjonalność:**
- Linie: Rzeczywiste pomiary (solid) + MA7 (dotted)
- Oś X: Daty (format "1 paź")
- Oś Y: Waga (auto-adjust z marginesem 5%)
- Interaktywność: Tooltip on hover (data, waga, zmiana, notatka)
- Wyróżnienia: Outlier (czerwony punkt), wpis dietetyka (ikona), gap dla brakujących dat
- Opcjonalnie: Linia celu (horizontal dotted)
- Toggle: 30/90 dni

**API:** `GET /api/dietitian/patients/:id/chart?period=30|90`

---

### 7. Zarządzanie Statusem Pacjenta - Inline Control

**Lokalizacja:** Header widoku szczegółów pacjenta

**Flow:**
1. Dropdown statusu w header (Aktywny/Wstrzymany/Zakończony)
2. Modal potwierdzenia z opcjonalną notatką
3. API: `PATCH /api/dietitian/patients/:id/status`
4. Toast + aktualizacja badge

**Wizualizacja:**
- 🟢 Aktywny
- 🟡 Wstrzymany (+ "Przypomnienia wyłączone")
- 🔴 Zakończony (+ "Retencja: 24 miesiące od [data]")

---

### 8. Pre-CTA dla Web Push

**Timing:**
- Po pierwszym `add_weight_patient` (delay 1s po toast sukcesu)
- Tylko przy pierwszym wpisie

**Modal:** "📬 Nie zapomnij o wadze! Włącz powiadomienia, aby otrzymywać przypomnienia w piątki i niedziele."
- Przyciski: "Włącz powiadomienia" / "Może później"
- Checkbox: "Nie pokazuj ponownie"

**Fallback:** Jeśli brak wsparcia push → info o email fallback + auto-set `emailEnabled: true`

**Ponowienie:** Po 7 dniach banner "💡 Wskazówka: Włącz powiadomienia"

---

### 9. Error Handling - Multi-Layer Strategy

**Warstwy:**
1. **Client-side validation:** Zod schema, inline errors (red text)
2. **API errors:** Toast notifications (400, 401, 409, 500)
3. **Anomaly warnings:** Modal potwierdzenia (outlier >3kg)
4. **Network errors:** Global error boundary + fallback UI
5. **Loading states:** Button spinner + skeleton screens

---

### 10. Dashboard Zbiorczy Dietetyka - MVP

**Strona:** `/dietetyk/dashboard` (główny widok po zalogowaniu)

**Funkcjonalność:**
- Widget KPI: "25 aktywnych pacjentów | 20 dodało wagę (80%)"
- Tabela/lista: Imię, Status, Ostatni wpis, Obowiązek tygodniowy
- Sortowanie: domyślnie po dacie ostatniego wpisu (oldest first)
- Filtry: Status (wszystkie/aktywni/wstrzymani)
- Badge: 🟢 wpis w tym tygodniu / 🔴 brak wpisu
- Klik w wiersz → `/dietetyk/pacjenci/:id`

**Mobile:** Card view zamiast tabeli

**API:** `GET /api/dietitian/patients`

---

### 11. State Management

**Architektura:**

1. **AuthContext (React Context):** Global state dla user data, isAuthenticated, logout
2. **TanStack Query:** Server state (API calls, caching, mutations)
3. **useState:** Local UI state (modals, filters)
4. **localStorage + API sync:** User preferences

**Setup:** `npm install @tanstack/react-query`

---

### 12. Layout i Nawigacja

**Pacjent:**
- **Desktop:** Top bar (Logo, User menu)
- **Mobile:** Top bar + Bottom nav (sticky, 3 items)

**Dietetyk:**
- **Desktop:** Sidebar (fixed, 240px) z nawigacją
- **Mobile:** Top bar + Hamburger menu (drawer slide-in)

---

### 13. Formularze Autentykacji

**Uwaga:** Strona logowania już istnieje.

**Akcje:**
1. Przenieść istniejącą stronę do `/auth/login`
2. Zachować design i funkcjonalność
3. Dostosować pozostałe strony (signup, forgot-password, reset-password) do tego samego stylu

**Wytyczne:**
- Zachować: palette kolorów, typography, button style, border radius, spacing
- Dopasować: input fields, checkboxy, labels do istniejącego designu

---

### 14. Edycja Wpisu Wagi - Modal Flow

**Flow:**
1. Historia wpisów → przycisk "Edytuj" (jeśli w oknie: do końca następnego dnia)
2. Modal z formularzem (waga, notatka)
3. Walidacja client + server
4. Jeśli nowy outlier → warning modal
5. Sukces → close modal + optimistic update + toast

**Usuwanie:**
- Przycisk "Usuń" w modalu edycji
- Confirmation modal
- API: `DELETE /api/weight/:id`

---

### 15. Widok Szczegółów Pacjenta

**Sekcje:**
1. **Header:** Imię, email, statystyki (wpis w tygodniu, streak, total entries), dropdown statusu
2. **Quick Action:** "Dodaj wagę za pacjenta" → modal
3. **Zakładki:** Dziś / Ten tydzień / Zakres dat
4. **Historia:** Lista kart (bez edycji)
5. **Wykres:** Chart.js (30/90 dni), desktop: obok historii, mobile: nad historią

**API:**
- `GET /api/dietitian/patients/:id`
- `GET /api/dietitian/patients/:id/weight?view=...`
- `GET /api/dietitian/patients/:id/chart?period=...`

---

### 16. Modal Dodawania Wagi przez Dietetyka

**Pola:**
1. **Waga:** 30-250 kg, step 0.1
2. **Data pomiaru:** Date picker (domyślnie dziś, backfill do 7 dni)
3. **Notatka:** OBOWIĄZKOWA (min. 10 znaków, max 200)

**Info:** "Ten wpis będzie oznaczony jako 'dodany przez dietetyka' i zaliczy obowiązek tygodniowy pacjenta."

**API:** `POST /api/dietitian/patients/:id/weight`

---

### 17. Panel Analityki - Single-Page Dashboard

**Sekcje:**

1. **Filtry:** Dropdown period + custom range + przycisk odśwież
2. **KPI Cards (3 columns):**
   - Weekly Compliance Rate (główna metryka, % change vs poprzedni okres)
   - Active Patients
   - Total Entries (breakdown: pacjent vs dietetyk)
3. **Reminder Effectiveness (2 karty):**
   - Friday 19:00: sent, open rate, click rate, conversion, avg time to entry
   - Sunday 11:00: sent, open rate, click rate, conversion, avg time to entry
4. **Cohort Analysis (tabela):**
   - 4-tygodniowe okresy: cohort ID, pacjenci, compliance, push opt-in, avg wpisów/tydzień

**API:**
- `GET /api/dietitian/analytics/kpi?period=month`
- `GET /api/dietitian/analytics/cohorts?startDate=...&endDate=...`

---

### 18. Ustawienia Użytkownika - Pacjent

**Strona:** `/waga/ustawienia`

**Sekcje:**

1. **Powiadomienia:**
   - Toggle push notifications
   - Toggle email (fallback)
2. **Profil:**
   - Read-only fields (imię, nazwisko, email, wiek, płeć)
   - Przycisk "Zmień hasło" → modal
3. **RODO:**
   - "Pobierz moje dane" → `GET /api/user/export` (JSON download)
   - "Usuń konto" → modal z ostrzeżeniem → `DELETE /api/user/account`

**Dietetyk:** Brak strony ustawień w MVP (tylko logout)

---

### 19. Responsywność - Mobile-First

**Breakpoints:**
- Mobile: `< 640px`
- Tablet: `640px - 1024px`
- Desktop: `>= 1024px`

**Patterns TailwindCSS:**
- Layout: `p-4 md:p-6 lg:p-8`
- Grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- Typography: `text-2xl md:text-3xl lg:text-4xl`
- Conditional: `md:hidden` / `hidden md:flex`

**Tabele:** Mobile → card view, Desktop → table view

**Testing devices:** iPhone SE (375px), iPad (768px), MacBook (1440px)

---

### 20. Accessibility - WCAG AA

**Priority HIGH (krityczne dla MVP):**
- ✅ Keyboard navigation (Tab, Enter, Esc)
- ✅ Focus indicators (`focus:ring-2 focus:ring-offset-2`)
- ✅ Form labels (`htmlFor`, `aria-required`, `aria-describedby`)
- ✅ Error messages (`role="alert"`)
- ✅ Kontrast kolorów (min. 4.5:1)
- ✅ ARIA landmarks (`nav`, `main`, `aside`)
- ✅ Loading states (`aria-live`, `role="status"`)
- ✅ Modal accessibility (`aria-modal`, focus trap, Esc)

**Testing:**
- Lighthouse (automated audit)
- axe DevTools (detailed report)
- Manual keyboard test
- Screen reader (NVDA/VoiceOver)

---

## UI Architecture Summary

### 1. Routing i Struktura

**Hierarchia:**
- `/auth/*` - publiczne (login, signup, forgot-password, reset-password)
- `/waga/*` - pacjent (dashboard, welcome, historia, ustawienia)
- `/dietetyk/*` - dietetyk (dashboard, pacjenci/:id, analityka, zaproszenia, audit)

**Middleware:** Astro SSR sprawdza session cookie i rolę przed renderowaniem

---

### 2. Kluczowe Widoki

**Pacjent:**
- Dashboard: Quick add widget + status tygodniowy + historia 7 dni + bottom nav
- Historia: Infinite scroll (30/page) + filtry date range + edycja (modal)
- Ustawienia: Powiadomienia, profil, RODO

**Dietetyk:**
- Dashboard: KPI widget + tabela pacjentów + filtry + badge obowiązku
- Szczegóły pacjenta: Header + stats + quick action + zakładki + historia + wykres
- Analityka: KPI cards + reminder effectiveness + cohort analysis

---

### 3. Przepływy Użytkownika

**Onboarding:** Email → Signup → Welcome → Dodaj wagę → Pre-CTA push

**Dodawanie wagi (pacjent):** Dashboard input → Walidacja → API → Outlier check → Toast + update

**Edycja:** Historia → Modal → Walidacja → Outlier check → Toast + optimistic update

**Dodawanie przez dietetyka:** Widok pacjenta → Modal (waga + data + notatka) → API → Toast + update

**Zmiana statusu:** Dropdown → Modal potwierdzenia → API → Toast + badge update

---

### 4. API Mapping

**Pacjent:**
- `POST /api/weight`, `GET /api/weight?cursor=...`, `PATCH /api/weight/:id`, `DELETE /api/weight/:id`, `POST /api/weight/:id/confirm`

**Dietetyk:**
- `GET /api/dietitian/patients`, `GET /api/dietitian/patients/:id`, `GET /api/dietitian/patients/:id/weight`, `GET /api/dietitian/patients/:id/chart`, `POST /api/dietitian/patients/:id/weight`, `PATCH /api/dietitian/patients/:id/status`, `GET /api/dietitian/analytics/kpi`, `GET /api/dietitian/analytics/cohorts`

**Auth:**
- `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/signup`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`

**Push & Preferences:**
- `POST /api/push/subscribe`, `DELETE /api/push/subscribe`, `GET /api/preferences`, `PATCH /api/preferences`

**RODO:**
- `GET /api/user/export`, `DELETE /api/user/account`

---

### 5. State Management

- **AuthContext:** Global user data
- **TanStack Query:** Server state, caching, mutations
- **useState:** Local UI state
- **localStorage + API:** Preferences sync

---

### 6. Komponenty UI

**Shared Components:**
- `ui/` - Button, Input, Modal, Card, Badge, Toast, Spinner, Skeleton
- `forms/` - WeightEntryForm, LoginForm, SignupForm, PasswordResetForm
- `weight/` - WeightEntryCard, WeightChart, WeightHistory
- `patient/` - PatientCard, PatientHeader, PatientStats
- `navigation/` - PatientHeader, PatientBottomNav, DietitianSidebar, DietitianDrawer

**Design System "Naturalna Harmonia":**
- Kolory: primary (#4A7C59), secondary (#E8B4A8), accent (#F4A460)
- Typography: Montserrat (heading), Open Sans (body)
- Spacing: 8px grid
- Border radius: 8-16px

**Biblioteki:**
- TanStack Query (server state)
- Chart.js (wykresy)
- react-hot-toast (notifications)
- @headlessui/react (accessible components) - opcjonalnie
- date-fns (date formatting)

---

### 7. Walidacja i Bezpieczeństwo

**Client-side:** Zod schemas + React Hook Form
**Server-side:** API re-validate + middleware autoryzacji + rate limiting (5 prób login / 15 min)
**Error handling:** Inline errors → toast → modal → error boundary → loading states
**RODO:** Consent tracking, data export, account deletion, audit log

---

## Unresolved Issues

### 1. Service Worker Implementation
- Jak zarządzać wersjami SW (cache invalidation)?
- Strategia retry/backoff dla failed push?
- Fallback UX dla Safari iOS (brak wsparcia)?

### 2. Email Templates Design
- Tone of voice (formalny vs przyjacielski)?
- Logo i header design
- Opt-out mechanism (link w emailu vs tylko ustawienia)?

### 3. CRON Job Monitoring
- Dashboard do podglądu job history?
- Alerting przy failures?
- Manual trigger do testowania?

### 4. Dashboard Collective - Rozszerzenia
- Bulk actions ("Wyślij przypomnienie do wszystkich")?
- Eksport CSV?
- Wyszukiwanie zaawansowane?
**Rekomendacja:** Post-MVP

### 5. Wykres - Linia Celu
- Formularz ustawiania celu per pacjent?
- Historia zmian celu?
**Rekomendacja:** Post-MVP

### 6. Optymalizacja Auth
- Obecna lokalizacja strony login?
- Istniejący API endpoint?
- Session cookies skonfigurowane?
**Wymaga weryfikacji:** Review istniejącego kodu

### 7. Testing Strategy
- Unit tests (Vitest) - które komponenty?
- E2E (Playwright) - które flow?
**Rekomendacja MVP:** Manual testing + E2E dla critical paths

### 8. Deployment
- Vercel auto-deploy z main?
- Preview deployments?
**Rekomendacja:** Main → production, feature branches → preview

### 9. Error Tracking
- Sentry w MVP?
**Rekomendacja MVP:** Console.log + Vercel logs, Sentry post-MVP

### 10. Data Seeding
- Seed script z fake pacjentami?
**Rekomendacja:** `src/db/seed.ts` (1 dietetyk + 5-10 pacjentów + 30 dni wpisów)

---

## Następne Kroki

1. **Review istniejącej strony logowania** - zapoznać się z obecnym kodem auth
2. **Setup TanStack Query** - instalacja i konfiguracja QueryClient
3. **Utworzenie base components** - Button, Input, Modal, Card (design system)
4. **Implementacja AuthContext** - global state dla user data
5. **Routing i layouty** - PatientLayout, DietitianLayout, AuthLayout
6. **Pierwsze API integration** - login endpoint z istniejącą stroną
7. **Dashboard pacjenta MVP** - quick add widget + historia 7 dni
8. **Iteracyjna implementacja** pozostałych widoków

**Priorytety:**

**P1 (Critical Path):**
- Auth (login, signup)
- Dashboard pacjenta (dodawanie wagi)
- Historia wpisów

**P2 (Core Features):**
- Dashboard dietetyka (lista pacjentów)
- Widok szczegółów pacjenta
- Wykres Chart.js

**P3 (Nice-to-Have):**
- Panel analityki
- Web push notifications
- Audit log

---

**Timeline estimate:** ~12 dni roboczych
- Setup + base components: 2 dni
- Auth flows: 2 dni
- Pacjent views: 3 dni
- Dietetyk views: 3 dni
- Testing + polish: 2 dni

---

**Dokument przygotowany:** 2025-11-03
**Status:** ✅ Gotowy do implementacji
**Następna akcja:** Review istniejącego auth + setup projektu