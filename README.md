# Dietoterapia - Paulina Maciak

Professional website and weight tracking application for clinical dietitian Paulina Maciak.

**Phase 1 (Completed):** Marketing website with service presentation, contact forms, and professional information.

**Phase 2 (In Progress):** Patient weight tracking web application with authentication, real-time charts, push notifications, and email reminders.

## 🛠️ Tech Stack

### Frontend & Framework
- **Framework**: Astro 5.x (Server-Side Rendering + Static)
- **Islands**: React 19 (tylko dla interaktywnych komponentów)
- **Styling**: TailwindCSS 3.x
- **Language**: TypeScript
- **Forms**: react-hook-form + Zod validation
- **Charts**: Chart.js + react-chartjs-2
- **Notifications**: react-hot-toast

### Backend & Database
- **Database**: Neon Postgres (serverless, EU hosting)
- **ORM**: Drizzle ORM 0.44.x + Drizzle Kit
- **Authentication**: Lucia Auth v3 (session-based)
- **Security**: jose (JWT) + bcrypt (password hashing)
- **Email**: SMTP (OVH MX Plan) via nodemailer
- **Email Templates**: react-email + @react-email/components

### Infrastructure
- **Hosting**: Vercel (SSR + Static Hybrid)
- **Push Notifications**: web-push + Service Worker
- **Scheduled Jobs**: Vercel Cron Jobs
- **Date Handling**: date-fns + date-fns-tz (Europe/Warsaw)

### Dlaczego Astro?

- ✅ **Hybrid Rendering** - SSR dla app (autentykacja), static dla marketingu
- ✅ **90% mniej JavaScript** (~25 KB vs ~250 KB w Next.js)
- ✅ **Lighthouse 98-100** (Performance, SEO, Accessibility)
- ✅ **Islands Architecture** (React tylko tam gdzie potrzeba)
- ✅ **Built-in optimizations** (image, fonts, SEO, sitemap)
- ✅ **Edge-ready** - Vercel Edge Functions support

Więcej informacji: `.ai/tech-stack-decision.md`

## 📁 Struktura projektu

```
dietoterapia-web/
├── .ai/                      # Dokumentacja projektu (marketing website)
│   ├── prd.md                    # Product Requirements Document
│   ├── tech-stack-decision.md    # Uzasadnienie wyboru tech stack
│   ├── moodboard.md              # Paleta kolorów i design
│   └── project-description.md    # Opis projektu
├── .ai-10xdevs/              # Dokumentacja weight tracking app
│   └── tech-stack-waga.md        # Implementacja modułu wagi
├── src/
│   ├── pages/                # File-based routing (SSR + Static)
│   │   ├── index.astro           # Strona główna
│   │   ├── o-mnie.astro          # O mnie
│   │   ├── konsultacje.astro     # Konsultacje
│   │   ├── opinie.astro          # Opinie
│   │   ├── kontakt.astro         # Kontakt
│   │   ├── polityka-prywatnosci.astro  # Polityka prywatności
│   │   ├── logowanie.astro       # Login (feature flagged)
│   │   ├── reset-hasla.astro     # Password reset (feature flagged)
│   │   ├── waga/                 # Patient zone (SSR)
│   │   ├── dietetyk/             # Dietitian panel (SSR)
│   │   └── api/                  # API endpoints
│   │       ├── consultation.ts       # Consultation form
│   │       ├── contact.ts            # Contact form
│   │       └── weight.ts             # Weight tracking API
│   ├── components/           # React islands i Astro components
│   ├── hooks/                # React custom hooks
│   ├── layouts/
│   │   └── Layout.astro          # Main layout (SEO, fonts, meta)
│   ├── styles/
│   │   └── global.css            # TailwindCSS + custom animations
│   ├── assets/               # Images (optimized by Astro)
│   ├── db/                   # Database (Drizzle ORM)
│   │   ├── schema.ts             # Database schema (11 tables)
│   │   ├── index.ts              # DB client
│   │   └── seed.ts               # Seed data
│   ├── lib/                  # Business logic & utilities
│   │   ├── feature-flags.ts      # Feature flag management
│   │   ├── rate-limit-public.ts  # Public form rate limiting
│   │   ├── captcha.ts            # reCAPTCHA verification
│   │   └── email-security.ts     # Email sanitization & validation
│   └── utils/                # Shared utilities
├── public/                   # Static assets
│   ├── images/                   # Static images
│   └── favicon.svg               # Favicon
├── tests/                    # Test suites
│   ├── unit/                     # Vitest unit tests
│   ├── integration/              # Integration tests (Testcontainers)
│   └── e2e/                      # Playwright E2E tests
├── drizzle/                  # Database migrations
├── astro.config.mjs          # Astro configuration (SSR mode)
├── tailwind.config.mjs       # TailwindCSS + "Naturalna Harmonia"
├── vitest.config.ts          # Vitest test configuration
├── playwright.config.ts      # Playwright E2E configuration
├── drizzle.config.ts         # Drizzle ORM configuration
└── package.json
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18.20.8, 20.3.0+ lub 22.0.0+
- npm 9.6.5+

### Installation

```bash
# 1. Clone repository
git clone <repository-url>
cd dietoterapia-web

# 2. Install dependencies
npm install

# 3. Copy .env.example to .env.local and configure
cp .env.example .env.local

# Edit .env.local and add required environment variables
# See "Environment Variables" section for complete list
```

### Development

```bash
# Start dev server (localhost:4321)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint:fix

# Database management (Drizzle ORM)
npm run db:generate  # Generate migration from schema changes
npm run db:push      # Push schema to database
npm run db:studio    # Open Drizzle Studio GUI
npm run db:seed      # Seed database with sample data

# Email template preview
npm run email:dev    # Start react-email dev server (localhost:3000)

# Testing
npm test              # Run all tests
npm run test:unit     # Run unit tests
npm run test:integration  # Run integration tests
npm run test:watch    # Run tests in watch mode
npm run test:ui       # Open Vitest UI
npm run test:coverage # Generate coverage report
npm run test:e2e      # Run Playwright E2E tests
npm run test:e2e:ui   # Open Playwright UI
npm run test:e2e:headed  # Run E2E tests in headed mode
npm run test:e2e:debug   # Debug E2E tests
```

## 🎨 Design System - "Naturalna Harmonia"

### Kolory

```css
Primary:   #4A7C59  /* Głęboka zieleń */
Secondary: #E8B4A8  /* Brzoskwiniowy */
Accent:    #F4A460  /* Złoty pomarańczowy */
Neutral Dark:  #2C3E3A
Neutral Light: #F9F6F3
```

### Typografia

- **Nagłówki**: Montserrat (600, 700)
- **Body**: Open Sans (400, 600)

### Spacing

- 8px grid system
- Border radius: 8-16px (zaokrąglone rogi)

## 📧 Email Configuration (SMTP OVH)

### Setup

1. Upewnij się że masz skonfigurowane konto email na OVH MX Plan
2. Dodaj credentials SMTP do `.env.local`:
   ```
   SMTP_HOST=ssl0.ovh.net
   SMTP_PORT=465
   SMTP_USER=dietoterapia@paulinamaciak.pl
   SMTP_PASS=your_password_here
   CONTACT_EMAIL=dietoterapia@paulinamaciak.pl
   ```
3. Zainstaluj nodemailer: `npm install nodemailer @types/nodemailer`

### Formularze

Projekt zawiera 2 formularze:
- **Formularz konsultacji** (`/konsultacje`)
- **Formularz kontaktowy** (`/kontakt`)

Oba wysyłają emaile przez SMTP OVH via nodemailer w API endpoints w `src/pages/api/`.

## 📝 Environment Variables

```bash
# .env.local (nie commituj tego pliku!)

# Feature Flags
FF_STREFA_PACJENTA=false  # Default: false - controls patient zone visibility

# SMTP (OVH MX Plan)
SMTP_HOST=ssl0.ovh.net
SMTP_PORT=465
SMTP_USER=dietoterapia@paulinamaciak.pl
SMTP_PASS=your_password_here
CONTACT_EMAIL=dietoterapia@paulinamaciak.pl

# Site Configuration
SITE_URL=https://paulinamaciak.pl

# reCAPTCHA v3 (for contact forms)
PUBLIC_RECAPTCHA_SITE_KEY=***  # Generate: https://www.google.com/recaptcha/admin
RECAPTCHA_SECRET_KEY=***

# Database (Neon Postgres) - Weight Tracking App
DATABASE_URL=postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/dbname?sslmode=require

# Authentication (Lucia) - Weight Tracking App
SESSION_SECRET=***  # Generate: openssl rand -base64 32

# Web Push (VAPID keys) - Weight Tracking App
VAPID_PUBLIC_KEY=***     # Generate: npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY=***
VAPID_SUBJECT=mailto:dietoterapia@paulinamaciak.pl
```

## 🧪 Testing

### Test Stack

- **Unit & Integration Tests**
  - `Vitest` – Business logic testing (services, utilities, Zod validation)
  - `@testing-library/react` – React component testing (forms, hooks)
  - `@testcontainers/postgresql` – Integration tests with real Postgres (Drizzle migrations in container)
  - `happy-dom` / `jsdom` – DOM environment for component tests
  - Built-in `fetch` – API endpoint testing (`src/pages/api/*`)

- **End-to-End (E2E) Tests**
  - `Playwright` – Browser automation (signup flow, weight tracking, dietitian panel)
  - Multi-browser testing (Chromium, Firefox, WebKit)

- **Code Quality**
  - `ESLint` – Static code analysis (TypeScript, React, Astro, JSX a11y)
  - `TypeScript` – Type checking (`npm run typecheck`)
  - Coverage reports via Vitest

### Running Tests

```bash
# Unit tests (fast, isolated)
npm run test:unit

# Integration tests (with Testcontainers)
npm run test:integration

# E2E tests (browser automation)
npm run test:e2e
npm run test:e2e:ui      # Interactive mode
npm run test:e2e:headed  # See browser

# All tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

### CI/CD Pipeline

GitHub Actions workflow:
1. Install dependencies
2. Lint code (`npm run lint`)
3. Type check (`npm run typecheck`)
4. Run unit tests (`npm run test:unit`)
5. Run integration tests (`npm run test:integration`)
6. Run selected E2E tests (`npm run test:e2e`)
7. Build (`npm run build`)
8. Deploy to Vercel (automatic on merge to `main`)

### Manual Testing

**Lighthouse Audit:**
```bash
npm run build
npm run preview
# Open Chrome DevTools → Lighthouse → Run audit
```

**Cross-browser testing:**
- Chrome (latest)
- Safari (latest)
- Firefox (latest)
- Edge (latest)

## 🚢 Deployment (Vercel)

### Automatic Deployment

1. Połącz repo z Vercel
2. Skonfiguruj environment variables (patrz sekcja "Environment Variables"):
   - Feature flags: `FF_STREFA_PACJENTA`
   - SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `CONTACT_EMAIL`
   - Site: `SITE_URL`
   - reCAPTCHA: `PUBLIC_RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY`
   - Database: `DATABASE_URL` (Neon Postgres)
   - Auth: `SESSION_SECRET`
   - Web Push: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
3. Deploy automatically przy push do `main`
4. Preview deployments dla Pull Requests

### Manual Deployment

```bash
# Build
npm run build

# Output będzie w dist/
# Deploy dist/ do Vercel
```

## 📊 MVP Features

### Phase 1: Marketing Website (Completed ✅)
**Strony:**
- ✅ Home (Hero + Benefits sections)
- ✅ O mnie (Hero + Image gallery)
- ✅ Konsultacje (Lista konsultacji + Formularz)
- ✅ Opinie (Grid opinii klientów)
- ✅ Kontakt (Formularz + Dane kontaktowe)
- ✅ Polityka prywatności (RODO/GDPR)

**Komponenty:**
- ✅ Header (Sticky navigation + Logo + Hamburger menu)
- ✅ Footer (Dane kontaktowe + Social media + Polityka)
- ✅ AnimatedSection (Scroll-triggered animations)
- ✅ ConsultationForm (React island with validation)
- ✅ ContactForm (React island with reCAPTCHA)

**API Endpoints:**
- ✅ `/api/consultation` (SMTP OVH integration + validation)
- ✅ `/api/contact` (SMTP OVH + reCAPTCHA + rate limiting)

### Phase 2: Weight Tracking App (In Progress 🚧)

**Database (Implemented ✅):**
- ✅ Schema design (11 tables: users, sessions, weight_entries, events, audit_log, invitations, password_reset_tokens, push_subscriptions, consents, login_attempts)
- ✅ Drizzle ORM setup
- ✅ Migrations infrastructure
- ⏳ Seed data for development

**Authentication (In Progress):**
- ⏳ Lucia Auth v3 integration
- ⏳ Signup flow with invitation tokens
- ⏳ Login/logout endpoints
- ⏳ Password reset flow
- ⏳ Session management
- ⏳ Protected routes middleware

**Patient Features:**
- ✅ Patient dashboard page (`/waga`)
- ✅ Weight entry form
- ✅ Weight history page
- ⏳ Weight chart visualization (Chart.js)
- ⏳ Weight entry validation (max 7 days backfill, anomaly detection)
- ⏳ Web push notifications
- ⏳ Email reminders (Friday 19:00, Sunday 11:00 CET)

**Dietitian Features:**
- ✅ Dietitian dashboard (`/dietetyk/dashboard`)
- ✅ Patient list page (`/dietetyk/pacjenci/[patientId]`)
- ✅ Invitations page (`/dietetyk/zaproszenia`)
- ⏳ Patient invitation system
- ⏳ Patient weight chart viewing
- ⏳ Patient status management (active/paused/ended)

**Infrastructure:**
- ✅ Feature flags system (`FF_STREFA_PACJENTA`)
- ✅ Email security (reCAPTCHA, rate limiting, sanitization)
- ✅ Test infrastructure (Vitest, Playwright, Testcontainers)
- ⏳ Scheduled jobs (Vercel Cron Jobs)
- ⏳ RODO compliance (data export, account deletion, audit log)

## 🎯 Performance Goals

- Lighthouse Performance: > 90
- Lighthouse SEO: > 90
- Lighthouse Accessibility: > 90
- Core Web Vitals:
  - LCP < 2.5s
  - FID < 100ms
  - CLS < 0.1

## 📚 Documentation

Szczegółowa dokumentacja w `.ai/`:
- `prd.md` - Product Requirements Document (wszystkie wymagania)
- `tech-stack-decision.md` - Uzasadnienie wyboru Astro
- `moodboard.md` - Design system i paleta kolorów
- `prd-planning-summary.md` - Podsumowanie planowania

## 🤝 Contributing

To jest prywatny projekt. Development workflow:

```bash
# 1. Utwórz feature branch
git checkout -b feature/nazwa-feature

# 2. Wprowadź zmiany i commit
git add .
git commit -m "feat: opis zmian"

# 3. Push i utwórz PR
git push origin feature/nazwa-feature

# 4. Merge do main (automatyczny deploy na Vercel)
```

## 📞 Contact

**Paulina Maciak - Dietoterapia**

- Email: dietoterapia@paulinamaciak.pl
- Telefon: +48 518 036 686
- Facebook: [paulina.maciak.dietoterapia](https://www.facebook.com/paulina.maciak.dietoterapia)
- Instagram: @paulinamaciak_dietetyk

## 📄 License

Private - All rights reserved

---

**Tech Lead**: Rafał Maciak
**Last Updated**: 2025-12-01
