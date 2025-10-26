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

### Dependencies - NOWE

```json
{
  "dependencies": {
    // ===== JUŻ MAJĄ =====
    "@astrojs/react": "^4.4.0",
    "@astrojs/sitemap": "^3.6.0",
    "@astrojs/vercel": "^8.2.10",
    "@types/nodemailer": "^7.0.2",
    "astro": "^5.14.6",
    "nodemailer": "^7.0.9",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-hot-toast": "^2.6.0",
    "zod": "^3.25.76",

    // ===== NOWE - BAZA DANYCH =====
    "drizzle-orm": "^0.35.0",
    "@neondatabase/serverless": "^0.9.0",

    // ===== NOWE - AUTENTYKACJA =====
    "lucia": "^3.0.0",
    "@lucia-auth/adapter-drizzle": "^1.0.0",
    "bcrypt": "^5.1.1",
    "@types/bcrypt": "^5.0.2",

    // ===== NOWE - BEZPIECZEŃSTWO =====
    "jose": "^5.2.0",

    // ===== NOWE - WEB PUSH =====
    "web-push": "^3.6.7",
    "@types/web-push": "^3.6.3",

    // ===== NOWE - EMAIL TEMPLATES =====
    "react-email": "^2.1.0",
    "@react-email/components": "^0.0.25",
    "@react-email/render": "^0.0.17",

    // ===== NOWE - UTILITIES =====
    "date-fns": "^3.3.1",
    "date-fns-tz": "^3.1.0"
  },
  "devDependencies": {
    // ===== JUŻ MAJĄ =====
    "@astrojs/tailwind": "^5.1.2",
    "@tailwindcss/typography": "^0.5.19",
    "@types/react": "^19.2.2",
    "@types/react-dom": "^19.2.2",
    "tailwindcss": "^3.4.17",

    // ===== NOWE - DATABASE TOOLS =====
    "drizzle-kit": "^0.26.0",
    "pg": "^8.11.3",
    "@types/pg": "^8.10.9"
  }
}
```

### Environment Variables

```bash
# ===== OBECNE (już mają) =====
SMTP_HOST=ssl0.ovh.net
SMTP_PORT=465
SMTP_USER=dietoterapia@paulinamaciak.pl
SMTP_PASS=***
CONTACT_EMAIL=dietoterapia@paulinamaciak.pl
SITE_URL=https://paulinamaciak.pl

# ===== NOWE - DATABASE =====
DATABASE_URL=postgresql://user:password@ep-xxx.eu-central-1.aws.neon.tech/dbname?sslmode=require

# ===== NOWE - AUTH =====
SESSION_SECRET=*** # generować: openssl rand -base64 32

# ===== NOWE - WEB PUSH =====
# Generować: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=***
VAPID_PRIVATE_KEY=***
VAPID_SUBJECT=mailto:dietoterapia@paulinamaciak.pl

# ===== RATE LIMITING (NIE UŻYWANE W MVP) =====
# Można dodać w przyszłości jeśli potrzebne:
# UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
# UPSTASH_REDIS_REST_TOKEN=***
```

---

## Struktura Projektu - Nowe Katalogi

```
dietoterapia-web/
├── src/
│   ├── components/           # ✅ Już istnieje
│   ├── hooks/                # ✅ Już istnieje
│   ├── layouts/              # ✅ Już istnieje
│   ├── pages/                # ✅ Już istnieje
│   ├── styles/               # ✅ Już istnieje
│   │
│   ├── db/                   # 🆕 NOWE - Database
│   │   ├── schema.ts         # Drizzle schema (users, weight_entries, events)
│   │   ├── index.ts          # DB client export
│   │   └── migrate.ts        # Migration runner
│   │
│   ├── lib/                  # 🆕 NOWE - Business logic
│   │   ├── auth.ts           # Lucia Auth setup
│   │   ├── push.ts           # Web Push utilities
│   │   └── analytics.ts      # Event tracking helpers
│   │
│   ├── emails/               # 🆕 NOWE - Email templates
│   │   ├── WeightReminder.tsx
│   │   ├── Invitation.tsx
│   │   ├── PasswordReset.tsx
│   │   └── Welcome.tsx
│   │
│   ├── middleware/           # 🆕 NOWE - Astro middleware
│   │   └── auth.ts           # Auth middleware (check session)
│   │
│   └── utils/                # 🆕 NOWE - Utilities
│       ├── validation.ts     # Zod schemas
│       └── dates.ts          # Date utilities (timezone Europe/Warsaw)
│
├── drizzle/                  # 🆕 NOWE - Migrations
│   └── 0000_initial.sql
│
├── public/
│   ├── sw.js                 # 🆕 NOWE - Service Worker (Web Push)
│   └── ...                   # ✅ Już istnieje
│
├── drizzle.config.ts         # 🆕 NOWE - Drizzle Kit config
└── ...
```

---

## Plan Implementacji

### Faza 0: Przygotowanie (Dzień 1)

#### 0.1 Setup Neon Database

**Krok po kroku:**

1. **Załóż konto Neon**
   - Przejdź do: https://neon.tech
   - Rejestracja (GitHub OAuth lub email)
   - Wybierz region: **EU Central (Frankfurt)** - RODO compliance

2. **Utwórz projekt**
   - Nazwa: `dietoterapia-production`
   - Region: `AWS eu-central-1 (Frankfurt)`
   - Postgres version: 16
   - **Skopiuj connection string**

3. **Utwórz branch dla development**
   - Neon Console → Branches → Create Branch
   - Nazwa: `development`
   - Parent: `main`
   - **Skopiuj development connection string**

4. **Dodaj do `.env.local`**
   ```bash
   # Development
   DATABASE_URL=postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/main?sslmode=require

   # Production (dodać do Vercel env variables)
   # DATABASE_URL=postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/main?sslmode=require
   ```

#### 0.2 Generate Keys

```bash
# Session secret
openssl rand -base64 32
# Dodaj do .env.local:
# SESSION_SECRET=<wynik>

# VAPID keys (web push)
npx web-push generate-vapid-keys
# Dodaj do .env.local:
# VAPID_PUBLIC_KEY=<public key>
# VAPID_PRIVATE_KEY=<private key>
# VAPID_SUBJECT=mailto:dietoterapia@paulinamaciak.pl
```

#### 0.3 Instalacja Dependencies

```bash
cd /Users/rafalmaciak/CodeSmithy/projects/dietoterapia-web

# Database
npm install drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit pg @types/pg

# Auth
npm install lucia @lucia-auth/adapter-drizzle bcrypt
npm install -D @types/bcrypt

# Security
npm install jose

# Web Push
npm install web-push
npm install -D @types/web-push

# Email Templates
npm install react-email @react-email/components @react-email/render

# Utils
npm install date-fns date-fns-tz
```

---

### Faza 1: Database Setup (Dzień 1-2)

#### 1.1 Drizzle Config

**Plik**: `drizzle.config.ts`

```typescript
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL!,
  },
} satisfies Config
```

#### 1.2 Database Schema

**Plik**: `src/db/schema.ts`

```typescript
import { pgTable, uuid, varchar, timestamp, decimal, boolean, text, jsonb, integer } from 'drizzle-orm/pg-core'

// ===== USERS TABLE =====
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 20 }).notNull(), // 'patient' | 'dietitian'

  // Profile
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),
  age: integer('age'),
  gender: varchar('gender', { length: 20 }), // 'male' | 'female' | 'other'

  // Status
  status: varchar('status', { length: 20 }).default('active').notNull(),
  // 'active' | 'paused' | 'ended'

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ===== SESSIONS TABLE (Lucia Auth) =====
export const sessions = pgTable('sessions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
})

// ===== WEIGHT ENTRIES TABLE =====
export const weightEntries = pgTable('weight_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),

  // Weight data
  weight: decimal('weight', { precision: 4, scale: 1 }).notNull(), // 30.0 - 250.0
  measurementDate: timestamp('measurement_date').notNull(),

  // Metadata
  source: varchar('source', { length: 20 }).notNull(), // 'patient' | 'dietitian'
  isBackfill: boolean('is_backfill').default(false).notNull(),
  isOutlier: boolean('is_outlier').default(false).notNull(),
  outlierConfirmed: boolean('outlier_confirmed').default(false),
  note: varchar('note', { length: 200 }),

  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedBy: uuid('updated_by').references(() => users.id),
})

// ===== EVENTS TABLE (Analytics) =====
export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),

  eventType: varchar('event_type', { length: 50 }).notNull(),
  // view_add_weight, add_weight_patient, add_weight_dietitian, edit_weight,
  // reminder_sent, reminder_open, reminder_click, login, signup, consent_accept

  properties: jsonb('properties'), // {channel, source, flags, etc.}
  timestamp: timestamp('timestamp').defaultNow().notNull(),
})

// ===== AUDIT LOG TABLE =====
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),

  action: varchar('action', { length: 50 }).notNull(), // create, update, delete
  tableName: varchar('table_name', { length: 50 }).notNull(),
  recordId: uuid('record_id'),

  before: jsonb('before'), // Stary stan
  after: jsonb('after'),   // Nowy stan

  timestamp: timestamp('timestamp').defaultNow().notNull(),
})

// ===== INVITATIONS TABLE =====
export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull(),
  token: varchar('token', { length: 255 }).unique().notNull(),

  createdBy: uuid('created_by').references(() => users.id).notNull(), // Dietetyk
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ===== PASSWORD RESET TOKENS =====
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  token: varchar('token', { length: 255 }).unique().notNull(),

  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ===== PUSH SUBSCRIPTIONS TABLE =====
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),

  endpoint: text('endpoint').unique().notNull(),
  keys: jsonb('keys').notNull(), // {p256dh, auth}

  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ===== CONSENTS TABLE (RODO) =====
export const consents = pgTable('consents', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),

  consentType: varchar('consent_type', { length: 50 }).notNull(),
  // 'data_processing', 'health_data', 'marketing', etc.

  consentText: text('consent_text').notNull(), // Treść zgody w momencie akceptacji
  accepted: boolean('accepted').notNull(),

  timestamp: timestamp('timestamp').defaultNow().notNull(),
})

// ===== TYPES (export dla TypeScript) =====
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Session = typeof sessions.$inferSelect
export type WeightEntry = typeof weightEntries.$inferSelect
export type NewWeightEntry = typeof weightEntries.$inferInsert
export type Event = typeof events.$inferSelect
export type AuditLog = typeof auditLog.$inferSelect
export type Invitation = typeof invitations.$inferSelect
export type PushSubscription = typeof pushSubscriptions.$inferSelect
export type Consent = typeof consents.$inferSelect
```

#### 1.3 Database Client

**Plik**: `src/db/index.ts`

```typescript
import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import * as schema from './schema'

if (!import.meta.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined')
}

const sql = neon(import.meta.env.DATABASE_URL)
export const db = drizzle(sql, { schema })
```

#### 1.4 Generate & Run Migrations

```bash
# Generate migration z schema
npx drizzle-kit generate:pg

# Apply migration do DB
npx drizzle-kit push:pg

# Sprawdź w Neon Console czy tabele się utworzyły
# Dashboard → Tables
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

---

### Faza 2: Authentication Setup (Dzień 2-3)

#### 2.1 Lucia Auth Configuration

**Plik**: `src/lib/auth.ts`

```typescript
import { Lucia } from 'lucia'
import { DrizzlePostgreSQLAdapter } from '@lucia-auth/adapter-drizzle'
import { db } from '@/db'
import { sessions, users } from '@/db/schema'
import type { User } from '@/db/schema'

const adapter = new DrizzlePostgreSQLAdapter(db, sessions, users)

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    attributes: {
      secure: import.meta.env.PROD
    }
  },
  sessionExpiresIn: 30 * 24 * 60 * 60 * 1000, // 30 dni
  getUserAttributes: (attributes) => {
    return {
      email: attributes.email,
      role: attributes.role,
      firstName: attributes.firstName,
      lastName: attributes.lastName,
      status: attributes.status
    }
  }
})

declare module 'lucia' {
  interface Register {
    Lucia: typeof lucia
    DatabaseUserAttributes: Omit<User, 'id' | 'passwordHash'>
  }
}
```

#### 2.2 Auth Middleware

**Plik**: `src/middleware/auth.ts`

```typescript
import { defineMiddleware } from 'astro:middleware'
import { lucia } from '@/lib/auth'

export const onRequest = defineMiddleware(async (context, next) => {
  const sessionId = context.cookies.get(lucia.sessionCookieName)?.value ?? null

  if (!sessionId) {
    context.locals.user = null
    context.locals.session = null
    return next()
  }

  const { session, user } = await lucia.validateSession(sessionId)

  if (session && session.fresh) {
    const sessionCookie = lucia.createSessionCookie(session.id)
    context.cookies.set(
      sessionCookie.name,
      sessionCookie.value,
      sessionCookie.attributes
    )
  }

  if (!session) {
    const sessionCookie = lucia.createBlankSessionCookie()
    context.cookies.set(
      sessionCookie.name,
      sessionCookie.value,
      sessionCookie.attributes
    )
  }

  context.locals.user = user
  context.locals.session = session

  return next()
})
```

**Plik**: `src/middleware/index.ts`

```typescript
import { sequence } from 'astro:middleware'
import { onRequest as authMiddleware } from './auth'

export const onRequest = sequence(authMiddleware)
```

#### 2.3 Auth Types

**Plik**: `src/env.d.ts` (rozszerz istniejący)

```typescript
/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    user: import('lucia').User | null
    session: import('lucia').Session | null
  }
}
```

#### 2.4 Auth API Endpoints

**Plik**: `src/pages/api/auth/signup.ts`

```typescript
import type { APIRoute } from 'astro'
import { db } from '@/db'
import { users, invitations } from '@/db/schema'
import { lucia } from '@/lib/auth'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import { eq } from 'drizzle-orm'

const signupSchema = z.object({
  invitationToken: z.string(),
  password: z.string().min(8),
  firstName: z.string().min(2).max(100),
  lastName: z.string().min(2).max(100),
  age: z.number().int().min(16).max(120),
  gender: z.enum(['male', 'female', 'other']),
  gdprConsent: z.literal(true),
  healthDataConsent: z.literal(true)
})

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json()
    const validated = signupSchema.safeParse(body)

    if (!validated.success) {
      return new Response(JSON.stringify({ error: validated.error }), {
        status: 400
      })
    }

    const { invitationToken, password, ...profile } = validated.data

    // Sprawdź zaproszenie
    const [invitation] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.token, invitationToken))
      .limit(1)

    if (!invitation || invitation.usedAt || invitation.expiresAt < new Date()) {
      return new Response(JSON.stringify({ error: 'Invalid invitation' }), {
        status: 400
      })
    }

    // Hash hasła
    const passwordHash = await bcrypt.hash(password, 10)

    // Utwórz użytkownika
    const [user] = await db.insert(users).values({
      email: invitation.email,
      passwordHash,
      role: 'patient',
      ...profile,
      status: 'active'
    }).returning()

    // Oznacz zaproszenie jako użyte
    await db.update(invitations)
      .set({ usedAt: new Date() })
      .where(eq(invitations.id, invitation.id))

    // Utwórz sesję
    const session = await lucia.createSession(user.id, {})
    const sessionCookie = lucia.createSessionCookie(session.id)

    cookies.set(
      sessionCookie.name,
      sessionCookie.value,
      sessionCookie.attributes
    )

    return new Response(JSON.stringify({ success: true }), {
      status: 200
    })
  } catch (error) {
    console.error('Signup error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500
    })
  }
}
```

**Podobnie**: `login.ts`, `logout.ts`, `password-reset.ts` - implementacja analogiczna

---

### Faza 3: Core Features (Dzień 3-5)

#### 3.1 Weight Entry API

**Plik**: `src/pages/api/weight/add.ts`

```typescript
import type { APIRoute } from 'astro'
import { db } from '@/db'
import { weightEntries, events } from '@/db/schema'
import { z } from 'zod'
import { and, eq, gte, lte } from 'drizzle-orm'
import { startOfDay, endOfDay, subDays } from 'date-fns'
import { utcToZonedTime } from 'date-fns-tz'

const addWeightSchema = z.object({
  weight: z.number().min(30).max(250).step(0.1),
  measurementDate: z.string().datetime(), // ISO string
  note: z.string().max(200).optional()
})

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user || locals.user.role !== 'patient') {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const body = await request.json()
    const validated = addWeightSchema.safeParse(body)

    if (!validated.success) {
      return new Response(JSON.stringify({ error: validated.error }), {
        status: 400
      })
    }

    const { weight, measurementDate, note } = validated.data
    const measurementDateObj = new Date(measurementDate)
    const now = new Date()
    const timezone = 'Europe/Warsaw'

    // Walidacja: max 7 dni wstecz
    const maxPastDays = 7
    const minDate = subDays(now, maxPastDays)
    const isBackfill = measurementDateObj < startOfDay(now)

    if (measurementDateObj < minDate) {
      return new Response(
        JSON.stringify({ error: `Można dodać wagę maksymalnie ${maxPastDays} dni wstecz` }),
        { status: 400 }
      )
    }

    // Sprawdź czy już istnieje wpis tego dnia
    const dayStart = startOfDay(measurementDateObj)
    const dayEnd = endOfDay(measurementDateObj)

    const existing = await db
      .select()
      .from(weightEntries)
      .where(
        and(
          eq(weightEntries.userId, locals.user.id),
          gte(weightEntries.measurementDate, dayStart),
          lte(weightEntries.measurementDate, dayEnd)
        )
      )
      .limit(1)

    if (existing.length > 0) {
      return new Response(
        JSON.stringify({ error: 'Wpis dla tego dnia już istnieje' }),
        { status: 400 }
      )
    }

    // Sprawdź anomalie (>3kg/24h)
    const yesterday = subDays(measurementDateObj, 1)
    const prevEntry = await db
      .select()
      .from(weightEntries)
      .where(
        and(
          eq(weightEntries.userId, locals.user.id),
          gte(weightEntries.measurementDate, subDays(yesterday, 1)),
          lte(weightEntries.measurementDate, yesterday)
        )
      )
      .orderBy(weightEntries.measurementDate)
      .limit(1)

    let isOutlier = false
    if (prevEntry.length > 0) {
      const diff = Math.abs(weight - parseFloat(prevEntry[0].weight))
      isOutlier = diff > 3
    }

    // Dodaj wpis
    const [entry] = await db.insert(weightEntries).values({
      userId: locals.user.id,
      weight: weight.toString(),
      measurementDate: measurementDateObj,
      source: 'patient',
      isBackfill,
      isOutlier,
      note,
      createdBy: locals.user.id
    }).returning()

    // Event tracking
    await db.insert(events).values({
      userId: locals.user.id,
      eventType: 'add_weight_patient',
      properties: { weight, isBackfill, isOutlier }
    })

    return new Response(JSON.stringify({ success: true, entry }), {
      status: 200
    })
  } catch (error) {
    console.error('Add weight error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500
    })
  }
}
```

#### 3.2 Patient Dashboard Page

**Plik**: `src/pages/waga/index.astro`

```astro
---
import Layout from '@/layouts/Layout.astro'

const { user } = Astro.locals

if (!user || user.role !== 'patient') {
  return Astro.redirect('/login')
}

// Fetch user's weight entries
import { db } from '@/db'
import { weightEntries } from '@/db/schema'
import { eq } from 'drizzle-orm'

const entries = await db
  .select()
  .from(weightEntries)
  .where(eq(weightEntries.userId, user.id))
  .orderBy(weightEntries.measurementDate)
  .limit(30)
---

<Layout title="Moja waga - Dietoterapia">
  <main class="container mx-auto px-4 py-8">
    <h1>Witaj, {user.firstName}!</h1>

    <section class="my-8">
      <h2>Dodaj pomiar wagi</h2>
      <!-- React island: AddWeightForm.tsx -->
    </section>

    <section class="my-8">
      <h2>Historia pomiarów</h2>
      <!-- Lista wpisów -->
      <ul>
        {entries.map(entry => (
          <li>
            {entry.measurementDate.toLocaleDateString('pl-PL')}: {entry.weight} kg
            {entry.isBackfill && <span class="badge">Uzupełniono</span>}
            {entry.isOutlier && <span class="badge warning">Nietypowa wartość</span>}
          </li>
        ))}
      </ul>
    </section>
  </main>
</Layout>
```

---

### Faza 4: Web Push & Reminders (Dzień 6-7)

#### 4.1 Service Worker

**Plik**: `public/sw.js`

```javascript
self.addEventListener('push', (event) => {
  const data = event.data.json()

  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    data: { url: data.url },
    tag: 'weight-reminder',
    requireInteraction: false
  }

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  )
})
```

#### 4.2 Push Subscription API

**Plik**: `src/pages/api/push/subscribe.ts`

```typescript
import type { APIRoute } from 'astro'
import { db } from '@/db'
import { pushSubscriptions } from '@/db/schema'
import { z } from 'zod'

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string()
  })
})

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const body = await request.json()
    const validated = subscribeSchema.safeParse(body)

    if (!validated.success) {
      return new Response(JSON.stringify({ error: validated.error }), {
        status: 400
      })
    }

    // Zapisz subscription
    await db.insert(pushSubscriptions).values({
      userId: locals.user.id,
      endpoint: validated.data.endpoint,
      keys: validated.data.keys
    })

    return new Response(JSON.stringify({ success: true }), {
      status: 200
    })
  } catch (error) {
    console.error('Push subscribe error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500
    })
  }
}
```

#### 4.3 Push Helper

**Plik**: `src/lib/push.ts`

```typescript
import webpush from 'web-push'

webpush.setVapidDetails(
  import.meta.env.VAPID_SUBJECT,
  import.meta.env.VAPID_PUBLIC_KEY,
  import.meta.env.VAPID_PRIVATE_KEY
)

export async function sendPushNotification(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: { title: string; body: string; url: string }
) {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys
      },
      JSON.stringify(payload)
    )
    return { success: true }
  } catch (error) {
    console.error('Push notification error:', error)
    return { success: false, error }
  }
}
```

#### 4.4 CRON Endpoint - Friday Reminder

**Plik**: `src/pages/api/cron/friday-reminder.ts`

```typescript
import type { APIRoute } from 'astro'
import { db } from '@/db'
import { users, weightEntries, pushSubscriptions, events } from '@/db/schema'
import { eq, and, gte, lte } from 'drizzle-orm'
import { startOfWeek, endOfWeek } from 'date-fns'
import { sendPushNotification } from '@/lib/push'
import { sendEmail } from '@/lib/email' // Implement using nodemailer + react-email

export const GET: APIRoute = async ({ request }) => {
  // Vercel Cron Jobs są automatycznie weryfikowane przez platformę
  // Opcjonalnie można dodać Authorization header check dla dodatkowego bezpieczeństwa

  try {
    const now = new Date()
    const weekStart = startOfWeek(now, { weekStartsOn: 1 }) // Poniedziałek
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 })

    // Znajdź aktywnych pacjentów bez wpisu w tym tygodniu
    const activePatients = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName
      })
      .from(users)
      .where(
        and(
          eq(users.role, 'patient'),
          eq(users.status, 'active')
        )
      )

    for (const patient of activePatients) {
      // Sprawdź czy ma wpis w tym tygodniu
      const weeklyEntries = await db
        .select()
        .from(weightEntries)
        .where(
          and(
            eq(weightEntries.userId, patient.id),
            gte(weightEntries.measurementDate, weekStart),
            lte(weightEntries.measurementDate, weekEnd)
          )
        )

      if (weeklyEntries.length > 0) {
        continue // Ma już wpis, pomiń
      }

      // Wyślij przypomnienie
      const pushSubs = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, patient.id))

      let pushSent = false

      for (const sub of pushSubs) {
        const result = await sendPushNotification(sub, {
          title: 'Przypomnienie o wadze',
          body: `Cześć ${patient.firstName}! Nie zapomnij dodać wagi za ten tydzień.`,
          url: 'https://paulinamaciak.pl/waga/dodaj'
        })

        if (result.success) {
          pushSent = true
          break
        }
      }

      // Fallback na email jeśli push nie działa
      if (!pushSent) {
        await sendEmail({
          to: patient.email,
          subject: 'Przypomnienie o wadze',
          template: 'WeightReminder',
          props: { firstName: patient.firstName }
        })
      }

      // Event tracking
      await db.insert(events).values({
        userId: patient.id,
        eventType: 'reminder_sent',
        properties: { channel: pushSent ? 'push' : 'email', day: 'friday' }
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200
    })
  } catch (error) {
    console.error('Friday reminder error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500
    })
  }
}
```

**Analogicznie**: `sunday-reminder.ts`

#### 4.5 Vercel Cron Configuration

Cron jobs są już skonfigurowane w `vercel.json` w root projektu:

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

**Deployment:**
- Po push do main, Vercel automatycznie wykryje i uruchomi cron jobs
- Sprawdź w Vercel Dashboard → Project → Settings → Cron Jobs
- Logi dostępne w Vercel Dashboard → Logs (filtruj po `/api/cron/`)

---

### Faza 5: Email Templates (Dzień 8)

#### 5.1 React Email Dev Server

```bash
# Dodaj do package.json scripts
"email:dev": "email dev"
```

```bash
npm run email:dev
# Otwiera http://localhost:3000 z preview wszystkich emaili
```

#### 5.2 Weight Reminder Template

**Plik**: `src/emails/WeightReminder.tsx`

```tsx
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Img
} from '@react-email/components'

interface WeightReminderProps {
  firstName: string
}

export default function WeightReminder({ firstName }: WeightReminderProps) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: '#F9F6F3', fontFamily: 'Open Sans, sans-serif' }}>
        <Container style={{ padding: '20px' }}>
          <Section style={{ backgroundColor: '#fff', padding: '40px', borderRadius: '8px' }}>
            <Img
              src="https://paulinamaciak.pl/logo.png"
              width="150"
              alt="Dietoterapia"
            />

            <Text style={{ fontSize: '24px', fontWeight: 'bold', color: '#2C3E3A' }}>
              Cześć {firstName}!
            </Text>

            <Text style={{ fontSize: '16px', color: '#2C3E3A', lineHeight: '1.6' }}>
              Przypominamy o dodaniu wagi za ten tydzień. Regularne pomiary pomagają nam monitorować Twoje postępy.
            </Text>

            <Button
              href="https://paulinamaciak.pl/waga/dodaj"
              style={{
                backgroundColor: '#4A7C59',
                color: '#fff',
                padding: '12px 24px',
                borderRadius: '8px',
                textDecoration: 'none',
                display: 'inline-block'
              }}
            >
              Dodaj wagę teraz
            </Button>

            <Text style={{ fontSize: '14px', color: '#666', marginTop: '40px' }}>
              Paulina Maciak - Dietetyk Kliniczna<br />
              dietoterapia@paulinamaciak.pl
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
```

#### 5.3 Email Helper

**Plik**: `src/lib/email.ts`

```typescript
import nodemailer from 'nodemailer'
import { render } from '@react-email/render'
import WeightReminder from '@/emails/WeightReminder'
// Import innych templates

const transporter = nodemailer.createTransport({
  host: import.meta.env.SMTP_HOST,
  port: parseInt(import.meta.env.SMTP_PORT),
  secure: true,
  auth: {
    user: import.meta.env.SMTP_USER,
    pass: import.meta.env.SMTP_PASS
  }
})

type EmailTemplate = 'WeightReminder' | 'Invitation' | 'PasswordReset' | 'Welcome'

interface SendEmailOptions {
  to: string
  subject: string
  template: EmailTemplate
  props: Record<string, any>
}

export async function sendEmail({ to, subject, template, props }: SendEmailOptions) {
  let Component

  switch (template) {
    case 'WeightReminder':
      Component = WeightReminder
      break
    // ... inne templates
    default:
      throw new Error(`Unknown template: ${template}`)
  }

  const html = render(Component(props))

  await transporter.sendMail({
    from: import.meta.env.SMTP_USER,
    to,
    subject,
    html
  })
}
```

---

### Faza 6: Dietitian Panel (Dzień 9-10)

#### 6.1 Dietitian Dashboard

**Plik**: `src/pages/dietetyk/pacjenci.astro`

```astro
---
import Layout from '@/layouts/Layout.astro'
import { db } from '@/db'
import { users, weightEntries } from '@/db/schema'
import { eq, and, gte, lte, count } from 'drizzle-orm'
import { startOfWeek, endOfWeek } from 'date-fns'

const { user } = Astro.locals

if (!user || user.role !== 'dietitian') {
  return Astro.redirect('/login')
}

// Fetch wszystkich pacjentów
const patients = await db
  .select({
    id: users.id,
    firstName: users.firstName,
    lastName: users.lastName,
    email: users.email,
    status: users.status
  })
  .from(users)
  .where(eq(users.role, 'patient'))

// Dla każdego pacjenta: check czy ma wpis w tym tygodniu
const now = new Date()
const weekStart = startOfWeek(now, { weekStartsOn: 1 })
const weekEnd = endOfWeek(now, { weekStartsOn: 1 })

const patientsWithStatus = await Promise.all(
  patients.map(async (patient) => {
    const [result] = await db
      .select({ count: count() })
      .from(weightEntries)
      .where(
        and(
          eq(weightEntries.userId, patient.id),
          gte(weightEntries.measurementDate, weekStart),
          lte(weightEntries.measurementDate, weekEnd)
        )
      )

    return {
      ...patient,
      hasWeeklyEntry: result.count > 0
    }
  })
)
---

<Layout title="Pacjenci - Panel Dietetyka">
  <main class="container mx-auto px-4 py-8">
    <h1>Pacjenci</h1>

    <section class="my-8">
      <h2>Status tygodniowy</h2>

      <div class="grid gap-4">
        {patientsWithStatus.map(patient => (
          <div class="card">
            <h3>{patient.firstName} {patient.lastName}</h3>
            <p>{patient.email}</p>

            {patient.hasWeeklyEntry ? (
              <span class="badge success">✓ Wpis dodany</span>
            ) : (
              <span class="badge warning">⚠ Brak wpisu</span>
            )}

            <a href={`/dietetyk/pacjent/${patient.id}`}>
              Zobacz szczegóły →
            </a>
          </div>
        ))}
      </div>
    </section>

    <section class="my-8">
      <a href="/dietetyk/zaproszenia" class="btn-primary">
        + Zaproś nowego pacjenta
      </a>
    </section>
  </main>
</Layout>
```

#### 6.2 Patient Detail Page z Wykresem

**Plik**: `src/pages/dietetyk/pacjent/[id].astro`

```astro
---
import Layout from '@/layouts/Layout.astro'
import { db } from '@/db'
import { users, weightEntries } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'

const { id } = Astro.params
const { user } = Astro.locals

if (!user || user.role !== 'dietitian') {
  return Astro.redirect('/login')
}

// Fetch pacjenta
const [patient] = await db
  .select()
  .from(users)
  .where(eq(users.id, id))
  .limit(1)

if (!patient || patient.role !== 'patient') {
  return Astro.redirect('/dietetyk/pacjenci')
}

// Fetch ostatnie 90 dni wpisów
const entries = await db
  .select()
  .from(weightEntries)
  .where(eq(weightEntries.userId, id))
  .orderBy(desc(weightEntries.measurementDate))
  .limit(90)
---

<Layout title={`${patient.firstName} ${patient.lastName} - Panel Dietetyka`}>
  <main class="container mx-auto px-4 py-8">
    <h1>{patient.firstName} {patient.lastName}</h1>

    <section class="my-8">
      <h2>Wykres wagi (90 dni)</h2>
      <!-- React island: WeightChart.tsx -->
      <!-- Przekaż entries jako props -->
    </section>

    <section class="my-8">
      <h2>Dodaj wagę za pacjenta</h2>
      <!-- React island: AddWeightForPatient.tsx -->
    </section>

    <section class="my-8">
      <h2>Historia pomiarów</h2>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Waga</th>
            <th>Źródło</th>
            <th>Notatka</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(entry => (
            <tr>
              <td>{entry.measurementDate.toLocaleDateString('pl-PL')}</td>
              <td>{entry.weight} kg</td>
              <td>
                {entry.source === 'dietitian' ? 'Dietetyk' : 'Pacjent'}
              </td>
              <td>{entry.note || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  </main>
</Layout>
```

---

### Faza 7: RODO Compliance (Dzień 11)

#### 7.1 Consent Management

**API**: `src/pages/api/user/delete-account.ts`

```typescript
import type { APIRoute } from 'astro'
import { db } from '@/db'
import { users, weightEntries, events, auditLog, consents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { lucia } from '@/lib/auth'

export const POST: APIRoute = async ({ locals, cookies }) => {
  if (!locals.user || locals.user.role !== 'patient') {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    // Anonimizacja PII
    await db.update(users).set({
      email: `deleted-${locals.user.id}@example.com`,
      firstName: 'Usunięty',
      lastName: 'Użytkownik',
      passwordHash: '',
      status: 'ended'
    }).where(eq(users.id, locals.user.id))

    // Zachowaj weight entries (bez PII) dla statystyk
    // Nie usuwaj - już są anonimowe (tylko user_id)

    // Unieważnij wszystkie sesje
    await lucia.invalidateUserSessions(locals.user.id)

    // Wyloguj
    const sessionCookie = lucia.createBlankSessionCookie()
    cookies.set(
      sessionCookie.name,
      sessionCookie.value,
      sessionCookie.attributes
    )

    // Audit log
    await db.insert(auditLog).values({
      userId: locals.user.id,
      action: 'delete',
      tableName: 'users',
      recordId: locals.user.id,
      before: { email: locals.user.email },
      after: { email: `deleted-${locals.user.id}@example.com` }
    })

    return new Response(JSON.stringify({ success: true }), {
      status: 200
    })
  } catch (error) {
    console.error('Delete account error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500
    })
  }
}
```

#### 7.2 Data Export (RODO Right to Data Portability)

**API**: `src/pages/api/user/export-data.ts`

```typescript
import type { APIRoute } from 'astro'
import { db } from '@/db'
import { users, weightEntries, consents } from '@/db/schema'
import { eq } from 'drizzle-orm'

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    // Pobierz wszystkie dane użytkownika
    const [userData] = await db
      .select()
      .from(users)
      .where(eq(users.id, locals.user.id))

    const weightData = await db
      .select()
      .from(weightEntries)
      .where(eq(weightEntries.userId, locals.user.id))

    const consentData = await db
      .select()
      .from(consents)
      .where(eq(consents.userId, locals.user.id))

    const exportData = {
      user: {
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        age: userData.age,
        gender: userData.gender,
        status: userData.status,
        createdAt: userData.createdAt
      },
      weightEntries: weightData,
      consents: consentData
    }

    return new Response(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="moje-dane.json"'
      }
    })
  } catch (error) {
    console.error('Export data error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500
    })
  }
}
```

---

### Faza 8: Deployment (Dzień 12)

#### 8.1 Environment Variables - Vercel

```bash
# Vercel Dashboard → Project → Settings → Environment Variables
# Dodaj wszystkie zmienne z .env.local
# Dla Production, Preview, Development
```

#### 8.2 Build & Deploy

```bash
# Local build test
npm run build

# Deploy
git add .
git commit -m "feat: Waga MVP implementation"
git push origin main

# Automatic deployment via Vercel GitHub integration
```

#### 8.3 Post-Deployment Tasks

1. **Sprawdź Vercel Cron Jobs** (Vercel Dashboard → Settings → Cron Jobs)
2. **Sprawdź logi** (Vercel Dashboard → Logs)
3. **Test endpoints**:
   - `/api/auth/signup`
   - `/api/weight/add`
   - `/api/push/subscribe`
4. **Seed production DB** z kontem dietetyka (jak w Faza 1.5)
5. **Test cron endpoints ręcznie** (curl do `/api/cron/friday-reminder`)

---

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