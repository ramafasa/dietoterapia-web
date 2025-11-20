# Tech Stack Decision - Dietoterapia Waga MVP

**Data**: 2025-10-26
**Status**: Zaakceptowane
**Cel**: Rozszerzenie aplikacji Dietoterapia o funkcjonalność monitorowania wagi pacjentów

---

## Kontekst

Projekt **Dietoterapia Waga** rozszerza obecną stronę wizytówkową o aplikację webową do regularnego raportowania masy ciała pacjentów. MVP obejmuje:

- Autentykację i autoryzację (role: pacjent, dietetyk)
- Codzienne wpisy wagi z walidacją i backfill
- Automatyczne przypomnienia (email + web push)
- Panel dietetyka z wykresami i historią
- Analitykę i KPI
- Compliance z RODO

**Kluczowe różnice vs obecny stack:**
- Wymaga persystencji danych (baza danych)
- Wymaga autentykacji i sesji
- Wymaga SSR dla stron autentykowanych
- Wymaga scheduled jobs (CRON)
- Wymaga web push notifications

---

## Decyzje Stackowe

Na podstawie analizy wymagań z `prd-waga.md` podjęto następujące decyzje:

### 1. ✅ Astro Rendering Mode

**Decyzja**: Pozostajemy przy `output: 'server'` (pełny SSR)

**Aktualny stan**: Projekt już używa `output: 'server'` w `astro.config.mjs`

**Uzasadnienie**:
- Wszystkie strony aplikacji "Waga" wymagają autoryzacji
- SSR umożliwia dostęp do session/cookies
- Dynamiczne dane per użytkownik

**Opcjonalna optymalizacja** (post-MVP):
- Można zmienić na `output: 'hybrid'`
- Strony marketingowe (wizytówka) pozostają static dla lepszego SEO
- Strony aplikacji (dashboard) używają SSR

---

### 2. ✅ Baza Danych: Neon Postgres + Drizzle ORM

**Decyzja**: Neon Postgres + Drizzle ORM (bez Liquibase)

**Uzasadnienie wyboru Neon**:
- Serverless Postgres (auto-scaling)
- Hosting w UE (Frankfurt, Amsterdam) - zgodność z RODO
- Free tier: 0.5 GB storage, 100h compute/m - wystarczające dla MVP
- Branching (przydatne dla testów)
- Kompatybilność z Vercel

**Uzasadnienie wyboru Drizzle**:
- Lightweight (~7 KB) vs Prisma (~2 MB)
- Type-safe SQL query builder
- SQL-like syntax (łatwa nauka)
- Built-in migrations (Drizzle Kit) - **Liquibase NIE jest potrzebny**
- Edge-compatible (ważne dla Vercel Edge Functions)

**Alternatywy odrzucone**:
- ❌ Supabase - vendor lock-in, większa złożożność
- ❌ Prisma - za ciężki, własny query language
- ❌ Liquibase - nadmiarowe; Drizzle Kit ma własny system migracji

---

### 3. ✅ Autentykacja: Lucia Auth v3

**Decyzja**: Lucia Auth v3

**Uzasadnienie**:
- Lightweight i framework-agnostic
- Session-based auth (wymóg: sesje 30 dni z PRD)
- Kompatybilny z Drizzle (adapter @lucia-auth/adapter-drizzle)
- TypeScript first
- Aktywnie rozwijany

**Funkcjonalności**:
- Email + password authentication
- Session management (30 dni)
- Password reset z tokenami czasowymi
- RBAC (role-based access control)

**Alternatywy odrzucone**:
- ❌ Auth.js (NextAuth) - głównie dla Next.js, experimental w Astro
- ❌ Supabase Auth - wymaga Supabase DB
- ❌ Własne rozwiązanie - security risk, dużo pracy

---

### 4. ✅ Scheduled Jobs: Vercel Cron Jobs

**Decyzja**: Vercel Cron Jobs (wbudowane w platform)

**Uzasadnienie**:
- Wbudowane w Vercel (zero zewnętrznych zależności)
- Darmowe w ramach Vercel Hobby plan (free tier)
- Prosta konfiguracja w `vercel.json`
- HTTP-based (wywołuje endpoint w aplikacji)
- Timezone-aware (CRON expression w UTC, konwersja w aplikacji)
- Automatyczna weryfikacja przez Vercel (bezpieczne)

**Harmonogram przypomnień**:
- Piątek 18:00 UTC = 19:00 CET / 20:00 CEST (Europe/Warsaw)
- Niedziela 10:00 UTC = 11:00 CET / 12:00 CEST (Europe/Warsaw)

**Konfiguracja** (`vercel.json`):
```json
{
  "crons": [
    {
      "path": "/api/cron/friday-reminder",
      "schedule": "0 18 * * 5"
    },
    {
      "path": "/api/cron/sunday-reminder",
      "schedule": "0 10 * * 0"
    }
  ]
}
```

**Alternatywy odrzucone**:
- ❌ Upstash QStash - dodatkowa zależność, nie potrzebna gdy mamy Vercel
- ❌ GitHub Actions - mniej niezawodne, hacky
- ❌ cron-job.org - external dependency bez SLA

---

### 5. ✅ Web Push Notifications

**Decyzja**: `web-push` library + Service Worker

**Uzasadnienie**:
- Native browser API (Web Push Protocol)
- Pełna kontrola nad implementacją
- VAPID keys dla autentykacji
- Lightweight
- Works offline (Service Worker)

**Implementacja**:
- Service Worker: `/public/sw.js`
- VAPID keys generowane raz (przechowywane w env)
- Push subscriptions w DB
- Fallback na email gdy brak wsparcia lub opt-out

**Flow**:
1. Pacjent dodaje pierwszą wagę
2. Pre-CTA: "Włącz powiadomienia push?"
3. Jeśli akceptuje → rejestracja subscription
4. Token zapisany w DB
5. Cron job wysyła push przez web-push library

---

### 6. ⏸️ Rate Limiting: Removed from MVP

**Decyzja**: NIE implementujemy w MVP

**Uzasadnienie**:
- Nice-to-have, nie krytyczne dla MVP
- Można dodać post-MVP jeśli pojawią się problemy z nadużyciami
- W przypadku potrzeby można dodać Upstash Redis + @upstash/ratelimit

**Potencjalne use cases** (post-MVP):
- Login endpoint: 5 prób / 15 minut
- Password reset: 3 requesty / godzinę
- API endpoints: 100 requests / minutę per user

---

### 7. ✅ Email Templates: react-email

**Decyzja**: `react-email` + `@react-email/components`

**Uzasadnienie**:
- React-based templates (projekt już używa React)
- Type-safe
- Preview mode (dev server)
- Responsywne (mobile-first)
- Export do HTML

**Typy emaili**:
- Przypomnienie o wadze (piątek/niedziela)
- Zaproszenie do rejestracji (dietetyk → pacjent)
- Reset hasła
- Potwierdzenie rejestracji

**Przykład**:
```tsx
// src/emails/WeightReminder.tsx
import { Html, Button, Text } from '@react-email/components'

export function WeightReminder({ firstName }: { firstName: string }) {
  return (
    <Html>
      <Text>Cześć {firstName}!</Text>
      <Text>Przypominamy o dodaniu wagi za ten tydzień.</Text>
      <Button href="https://paulinamaciak.pl/waga/dodaj">
        Dodaj wagę teraz
      </Button>
    </Html>
  )
}
```

**Wysyłka**: nodemailer (już używany w projekcie) + OVH SMTP

---

### 8. ✅ Analityka: Własna implementacja w DB

**Decyzja**: Custom events tracking w Postgres

**Uzasadnienie**:
- Projekt nie ma obecnie żadnej analityki
- Pełna kontrola nad danymi (RODO compliance)
- Brak kosztów zewnętrznych serwisów
- Prostota dla MVP

**Event tracking** (wymóg z PRD):
- `view_add_weight`, `add_weight_patient`, `add_weight_dietitian`
- `edit_weight`, `reminder_sent`, `reminder_open`, `reminder_click`
- `login`, `signup`, `consent_accept`

**Schema**:
```sql
CREATE TABLE events (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  event_type VARCHAR(50) NOT NULL,
  properties JSONB,  -- {channel, source, flags}
  timestamp TIMESTAMP DEFAULT NOW()
);
```

**KPI Dashboard**:
- Panel PM w interfejsie dietetyka
- Queries na events table
- Raporty kohortowe (weekly)

**Alternatywy odrzucone** (na razie):
- ❌ PostHog - koszt + złożoność
- ❌ Plausible - $9/m, głównie web analytics
- ❌ Google Analytics - RODO concerns

---

### 9. ⏸️ Type-safe Environment Variables

**Decyzja**: NIE implementujemy w MVP

**Uzasadnienie**:
- Nice-to-have, nie krytyczne
- Zod już używany do walidacji form
- Można dodać post-MVP

---

### 10. ⏸️ Monitoring i Error Tracking

**Decyzja**: NIE implementujemy w MVP

**Uzasadnienie**:
- MVP może działać z console.log + Vercel logs
- Sentry można dodać później (free tier)
- Priorytet: core functionality

---

### 11. ✅ Stack testowy

**Decyzja**: Dedykowany stack testowy opisany w `test-plan.md`, skupiony na wysokim pokryciu logiki biznesowej i krytycznych ścieżek użytkownika.

- **Testy jednostkowe i integracyjne**
  - `Vitest` – runner dla serwisów, utilsów i walidacji (`src/lib/services/*`, `src/utils/*`, `src/schemas/*`).
  - `@testing-library/react` – testy komponentów React i hooków (formularze, moduł „Waga”, panel dietetyka).
  - `@testcontainers/postgresql` – uruchamianie PostgreSQL w Dockerze, automatyczne Drizzle migrations, izolowane środowisko dla każdego suite’u.
  - `supertest` / wbudowany `fetch` – testy endpointów API (`src/pages/api/*`).

- **Testy end-to-end (E2E)**
  - `Playwright` – scenariusze od strony przeglądarki (rejestracja z zaproszeniem, logowanie, dodawanie wagi, panel dietetyka, reset hasła) na stagingu lub lokalnie.

- **Testy bezpieczeństwa**
  - `OWASP ZAP` (Docker) – podstawowy skan środowiska staging pod kątem OWASP Top 10 (XSS, CSRF, misconfig).

- **CI / automatyzacja**
  - GitHub Actions lub Vercel CI – pipeline: `install → lint → typecheck → test:unit → test:integration → test:e2e (wybrane) → build`.

---

## Stack Docelowy - Kompletna Lista

### Framework i Rendering

```javascript
// astro.config.mjs
export default defineConfig({
  output: 'server',          // SSR dla aplikacji "Waga"
  adapter: vercel(),         // ✅ Już skonfigurowane
  integrations: [
    react(),                 // ✅ Już skonfigurowane
    tailwind(),              // ✅ Już skonfigurowane
    sitemap()                // ✅ Już skonfigurowane
  ],
  site: 'https://paulinamaciak.pl'
})
```

#### 1.5 Seed Database (Opcjonalnie)

**Plik**: `src/db/seed.ts`

```typescript
import { db } from './index'
import { users } from './schema'
import bcrypt from 'bcrypt'

async function seed() {
  // Utwórz konto dietetyka (Paulina)
  const passwordHash = await bcrypt.hash('TymczasoweHaslo123!', 10)

  await db.insert(users).values({
    email: 'dietoterapia@paulinamaciak.pl',
    passwordHash,
    role: 'dietitian',
    firstName: 'Paulina',
    lastName: 'Maciak',
    status: 'active'
  })

  console.log('✅ Seed completed: Dietitian account created')
}

seed().catch(console.error)
```

```bash
# Uruchom seed
npx tsx src/db/seed.ts
```

## Szacunki Kosztów

### MVP (Free Tier)

| Serwis | Plan | Koszt | Limity |
|--------|------|-------|--------|
| **Vercel** | Hobby | $0 | 100GB bandwidth, 100h serverless, Cron Jobs included |
| **Neon** | Free | $0 | 0.5GB storage, 100h compute/m |
| **OVH SMTP** | Existing | $0 | Już posiadane |

**Total MVP: $0/miesiąc** ✅ (wszystkie free tiers!)

### Produkcja (po przekroczeniu limitów)

| Serwis | Plan | Koszt |
|--------|------|-------|
| **Vercel** | Hobby lub Pro | $0 lub $20/m (Pro jeśli potrzeba więcej) |
| **Neon** | Scale | $19/m (0-10GB) |

**Total produkcja: ~$19/miesiąc** (lub $39/m na Vercel Pro)

---

## Potencjalne Ryzyka i Mitygacje

### 1. Cold Starts (Neon Serverless)

**Problem**: Neon free tier ma cold start ~1-2s po 5 min inactivity

**Mitygacja**:
- Akceptowalne dla MVP
- Upgrade do Scale ($19/m) eliminuje cold starts
- Cache w Upstash Redis dla często używanych queries

### 2. Vercel Cron Reliability

**Problem**: Brak gwarancji dokładnego czasu wykonania (±1 min)

**Mitygacja**:
- Dla przypomnień weekendowych ±1 min jest akceptowalne
- Logging każdej wysyłki w events table
- Dashboard do sprawdzania czy wszystkie przypomnienia wyszły
- Vercel Hobby ma wysoki uptime (99.9%+)
- W przypadku awarii Vercel - monitoring poprzez logs

### 3. Web Push Adoption

**Problem**: Nie wszyscy włączą push notifications

**Mitygacja**:
- Dobry UX pre-CTA ("Włącz powiadomienia aby nie zapominać!")
- Fallback na email zawsze działa
- Tracking w analytics: % opt-in rate

### 4. RODO Compliance

**Problem**: Rygorystyczne wymogi dla danych zdrowotnych

**Mitygacja**:
- Hosting w UE (Neon Frankfurt, Upstash Ireland)
- Audit log wszystkich operacji
- Consent management na onboarding
- **Recommended**: DPIA (Data Protection Impact Assessment) przed produkcją
- Konsultacja z prawnikiem ds. RODO

### 5. Database Migrations

**Problem**: Schema changes w produkcji mogą zepsuć aplikację

**Mitygacja**:
- Drizzle Kit generuje SQL migrations (review przed apply)
- Neon Branching: test migrations na branch przed merge do main
- Backup DB przed każdą migration (Neon automatic backups)
- Blue-green deployment strategy

---

## Następne Kroki

### Po MVP - Optymalizacje

1. **Zmiana output na `hybrid`**
   - Marketing pages → static (SEO)
   - App pages → SSR (auth)

2. **Caching**
   - Upstash Redis dla frequently accessed data
   - Cache weight entries per patient (invalidate on new entry)

3. **Analytics Dashboard**
   - UI dla KPI w panelu dietetyka
   - Wykresy cohort analysis

4. **Testing**
   - Unit tests (Vitest)
   - E2E tests (Playwright)
   - Load testing (k6)

### Po MVP - Nowe Funkcje (z PRD)

- Dashboard zbiorczy "kto dodał/kto nie"
- Eksport CSV/PDF raportów
- 2FA
- i18n (jeśli rozszerzenie poza Polskę)
- Native mobile apps (React Native z tym samym backend)

---

## Podsumowanie

### ✅ Stack Docelowy

- **Framework**: Astro (output: server) + React Islands
- **Database**: Neon Postgres + Drizzle ORM
- **Auth**: Lucia v3
- **CRON**: Vercel Cron Jobs
- **Push**: web-push + Service Worker
- **Email**: react-email + nodemailer (OVH SMTP)
- **Analytics**: Własna implementacja (events table)
- **Hosting**: Vercel

### 💰 Koszt

- **MVP**: $0/m (wszystkie free tiers)
- **Produkcja**: ~$19/m (lub $39/m na Vercel Pro)

### ⏱️ Timeline

- **Setup Infrastructure**: 1-2 dni
- **Database + Auth**: 2-3 dni
- **Core Features**: 2-3 dni
- **Web Push + CRON**: 2 dni
- **Email Templates**: 1 dzień
- **Dietitian Panel**: 2 dni
- **RODO Compliance**: 1 dzień
- **Deployment + Testing**: 1 dzień

**Total: ~12 dni roboczych** (2.5 tygodnia przy full-time)

---

**Dokument zatwierdzony**: 2025-10-26
**Autor**: AI Assistant + Rafał Maciak (Tech Lead)
**Status**: ✅ Gotowy do implementacji