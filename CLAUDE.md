# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dietoterapia is a professional website for clinical dietitian Paulina Maciak, expanding into a web application for patient weight tracking. Built with Astro using server-side rendering (SSR), it uses React islands architecture for interactive components and TailwindCSS for styling.

**Key characteristics:**
- Server-side rendering for authenticated features
- Static pages for marketing content (hybrid rendering)
- Polish language content
- Mobile-first responsive design
- RODO (GDPR) compliant health data handling
- MVP in progress - weight tracking features under development

## Development Commands

```bash
# Start development server (localhost:4321)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Database migrations (Drizzle ORM)
npm run db:generate  # Generate migration from schema changes
npm run db:push      # Push schema to database
npm run db:studio    # Open Drizzle Studio GUI

# Email template preview
npm run email:dev    # Start react-email dev server (localhost:3000)
```

**Note:** There are no linting, testing, or formatting scripts configured yet.

## Architecture

### Framework: Astro SSR + React Islands

This project uses **Astro** in server-side rendering mode with the **Islands Architecture** pattern:

- **Rendering mode**: `output: 'server'` (full SSR) with Vercel adapter
- **Static content**: `.astro` files (most components and pages)
- **Interactive components**: `.tsx` React components used as "islands" where interactivity is needed
- **Integration**: React islands are imported into Astro components with `client:*` directives

**Why SSR:**
- Authentication and session management for weight tracking app
- Dynamic content per user (patient dashboard, dietitian panel)
- Protected routes requiring authorization
- Access to cookies and server-side data

**Future optimization:**
- Can switch to `output: 'hybrid'` to make marketing pages static while keeping app pages SSR
- This improves SEO for public pages while maintaining auth for app features

### Directory Structure

```
src/
├── components/          # UI components (mix of .astro and .tsx)
│   ├── *.astro         # Static Astro components
│   └── *.tsx           # React islands (interactive)
├── hooks/              # React custom hooks (for islands)
├── layouts/            # Astro layout templates
│   └── Layout.astro    # Main layout with SEO, fonts, global meta
├── pages/              # File-based routing (SSR)
│   ├── index.astro     # Home page
│   ├── o-mnie.astro    # About page
│   ├── waga/           # Weight tracking app (planned)
│   └── api/            # API endpoints
│       ├── consultation.ts  # Consultation form endpoint
│       ├── auth/       # Auth endpoints (planned)
│       ├── weight/     # Weight entry endpoints (planned)
│       └── cron/       # Scheduled job endpoints (planned)
├── styles/
│   └── global.css      # TailwindCSS imports + custom animations
├── assets/             # Images (optimized by Astro)
├── db/                 # Database layer (Drizzle ORM)
│   ├── schema.ts       # Database schema
│   ├── index.ts        # DB client
│   └── migrate.ts      # Migration runner (planned)
├── lib/                # Business logic & utilities
│   ├── auth.ts         # Lucia Auth setup (planned)
│   ├── push.ts         # Web Push utilities (planned)
│   └── analytics.ts    # Event tracking (planned)
├── emails/             # Email templates (react-email)
│   └── *.tsx           # Email template components (planned)
├── middleware/         # Astro middleware
│   ├── auth.ts         # Auth middleware (planned)
│   └── index.ts        # Middleware composition (planned)
└── utils/              # Shared utilities
    ├── validation.ts   # Zod schemas (planned)
    └── dates.ts        # Date utilities (planned)

public/
├── sw.js               # Service Worker for web push (planned)
└── images/             # Static images

drizzle/                # Database migrations
.ai/                    # Project documentation (PRD, design specs, etc.)
.ai-10xdevs/            # Extended planning docs (tech stack decisions)
```

### Routing

- **File-based routing**: Pages in `src/pages/` automatically become routes (SSR)
  - `src/pages/index.astro` → `/`
  - `src/pages/o-mnie.astro` → `/o-mnie`
  - `src/pages/waga/index.astro` → `/waga` (patient dashboard, planned)
  - `src/pages/dietetyk/pacjenci.astro` → `/dietetyk/pacjenci` (dietitian panel, planned)
- **API routes**: `src/pages/api/` - JSON endpoints
  - `POST /api/consultation` - Consultation form (implemented)
  - `POST /api/auth/signup` - Patient registration (planned)
  - `POST /api/auth/login` - User login (planned)
  - `POST /api/weight/add` - Add weight entry (planned)
  - `GET /api/cron/friday-reminder` - Scheduled reminder job (planned)

### Styling System

**TailwindCSS** with custom design system "Naturalna Harmonia":

- **Colors**:
  - `primary` (#4A7C59) - Deep green
  - `secondary` (#E8B4A8) - Peachy
  - `accent` (#F4A460) - Golden orange
  - `neutral-dark` (#2C3E3A) - Almost black green
  - `neutral-light` (#F9F6F3) - Warm white
- **Typography**:
  - `font-heading` (Montserrat: 600, 700)
  - `font-body` (Open Sans: 400, 600)
- **Spacing**: 8px grid system
- **Border radius**: 8-16px rounded corners

See `tailwind.config.mjs` for full configuration.

### React Islands Pattern

Interactive components use React with custom hooks:

- `AnimatedSection.tsx` - Scroll-triggered animations using Intersection Observer
- `useIntersectionObserver.ts` - Custom hook for intersection detection

**When adding new interactive features:**
1. Create React component (`.tsx`) in `src/components/`
2. Import into Astro component with appropriate `client:*` directive:
   - `client:load` - Load immediately
   - `client:visible` - Load when visible (recommended for below-fold content)
   - `client:idle` - Load when browser is idle

### Configuration Files

- `astro.config.mjs` - Astro configuration
  - Output: `server` (SSR mode)
  - Adapter: Vercel
  - Site: `https://paulinamaciak.pl`
  - Integrations: React, Tailwind (base styles disabled), Sitemap
- `tailwind.config.mjs` - Custom design system configuration
- `tsconfig.json` - TypeScript configuration with path aliases
- `drizzle.config.ts` - Drizzle ORM configuration for database migrations

## Project Status

### Phase 1: Marketing Website (Completed ✅)
- ✅ Basic project setup with Astro + React + Tailwind
- ✅ SSR mode with Vercel adapter
- ✅ Main layout with SEO, fonts, and global styles
- ✅ Home page (Hero + Benefits sections)
- ✅ About page (Hero + Image gallery)
- ✅ Consultations page with form (`/konsultacje`)
- ✅ Animation system with `AnimatedSection` component
- ✅ Header and Footer components
- ✅ API endpoint for consultations (`/api/consultation`) - SMTP via nodemailer
- ✅ Toast notification system for form feedback

### Phase 2: Marketing Website - Remaining Pages (Planned ⏳)
- ⏳ Testimonials page (`/opinie`)
- ⏳ Contact page (`/kontakt`)
- ⏳ Privacy policy page (`/polityka-prywatnosci`)
- ⏳ API endpoint for contact form (`/api/contact`)
- ⏳ Cookie consent component

### Phase 3: Weight Tracking App (In Progress 🚧)

**Tech Stack (Installed):**
- ✅ Neon Postgres + Drizzle ORM (database)
- ✅ Lucia Auth v3 (authentication)
- ✅ jose (JWT handling for tokens)
- ✅ web-push (push notifications)
- ✅ react-email (email templates)
- ✅ date-fns + date-fns-tz (date handling)

**Implementation Status:**
- 🚧 Database schema (users, weight_entries, sessions, events)
- ⏳ Authentication system (signup, login, password reset)
- ⏳ Patient dashboard (`/waga`)
- ⏳ Weight entry form with validation (max 7 days backfill, anomaly detection >3kg/24h)
- ⏳ Dietitian panel (`/dietetyk/pacjenci`)
- ⏳ Patient detail view with weight chart
- ⏳ Invitation system (dietitian → patient)
- ⏳ Web push notifications (Service Worker)
- ⏳ Email reminders (Friday 19:00, Sunday 11:00 CET)
- ⏳ Scheduled jobs via Vercel Cron Jobs
- ⏳ RODO compliance (data export, account deletion, audit log)
- ⏳ Analytics & event tracking

**See `.ai-10xdevs/tech-stack-waga.md` for complete implementation plan.**

## Important Notes

### Environment Variables

Create `.env.local` for local development (not committed to git).

**Feature Flags:**
```bash
# Feature flags control visibility of features in the application
FF_STREFA_PACJENTA=false  # Default: false
FF_PZK=true               # Default: true
```

**FF_STREFA_PACJENTA:**
- Controls visibility of patient zone features
- When `false` (default):
  - "Strefa pacjenta" button hidden in header (desktop + mobile)
  - `/logowanie` page returns 404
  - Login link hidden on `/pzk/kup` (purchase landing page)
- When `true`:
  - Patient zone fully accessible
  - Login link visible on `/pzk/kup`
  - Used during development/staging before public launch

**FF_PZK:**
- Controls visibility of PZK (Przestrzeń Zdrowej Kobiety) features
- When `false`:
  - "Przestrzeń Zdrowej Kobiety" links hidden in header (desktop + mobile, marketing + patient)
  - All `/pzk/*` and `/pacjent/pzk/*` pages return 404
  - All `/api/pzk/*` endpoints return 404 (except webhook)
  - `/api/pzk/purchase/callback` (Tpay webhook) always active (prevents lost payments)
- When `true` (default):
  - Full PZK functionality available
  - Used for gradual rollout or emergency disable

**Usage in code:**
```typescript
import { isFeatureEnabled } from '@/lib/feature-flags'

if (isFeatureEnabled('STREFA_PACJENTA')) {
  // Strefa pacjenta-specific code
}

if (isFeatureEnabled('PZK')) {
  // PZK-specific code
}
```

**Current (Marketing Website):**
```bash
# SMTP (OVH MX Plan)
SMTP_HOST=ssl0.ovh.net
SMTP_PORT=465
SMTP_USER=dietoterapia@paulinamaciak.pl
SMTP_PASS=***
CONTACT_EMAIL=dietoterapia@paulinamaciak.pl
SITE_URL=https://paulinamaciak.pl

# reCAPTCHA v3 (for contact forms)
PUBLIC_RECAPTCHA_SITE_KEY=***  # Generate: https://www.google.com/recaptcha/admin
RECAPTCHA_SECRET_KEY=***
```

**Planned (Weight Tracking App):**
```bash
# Database (Neon Postgres)
DATABASE_URL=postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/dbname?sslmode=require

# Authentication (Lucia)
SESSION_SECRET=***  # Generate: openssl rand -base64 32

# Web Push (VAPID keys)
VAPID_PUBLIC_KEY=***     # Generate: npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY=***
VAPID_SUBJECT=mailto:dietoterapia@paulinamaciak.pl

# PZK (Przestrzeń Zdrowej Kobiety) - Purchase CTA
PUBLIC_PZK_PURCHASE_CTA_BASE_URL=https://example.com/pzk  # Base URL for external purchase landing page
PUBLIC_PZK_PURCHASE_CTA_PARAM_NAME=module                  # Query param name (optional, default: 'module')
# Example: https://example.com/pzk?module=2 for locked module 2 materials
# Used in:
#   - /pzk/kup (public purchase landing page) - builds CTA URLs for module cards
#   - /api/pzk/catalog (locked materials) - provides purchase links to users without access
```

**Tpay Payment Integration:**
```bash
# Tpay (Payment Gateway)
TPAY_CLIENT_ID=***                    # Merchant ID from Tpay panel
TPAY_CLIENT_SECRET=***                # API Key from Tpay panel
TPAY_ENVIRONMENT=sandbox              # sandbox (test) | production (live)
TPAY_NOTIFICATION_URL=***             # Full URL to webhook endpoint

# Product Pricing (PLN)
PZK_MODULE_1_PRICE=299.00             # Price for PZK Module 1
PZK_MODULE_2_PRICE=299.00             # Price for PZK Module 2
PZK_MODULE_3_PRICE=299.00             # Price for PZK Module 3
```

**Tpay Setup:**
- **Sandbox:** Register at https://panel.sandbox.tpay.com for testing
- **Production:** Register at https://panel.tpay.com for live payments
- **Webhook URL:** Must use HTTPS (e.g., `https://paulinamaciak.pl/api/pzk/purchase/callback`)
- **Documentation:** https://docs-api.tpay.com

**Payment Flow:**
1. User clicks "Kup moduł X" → authenticates if needed
2. System creates transaction (status: pending) + calls Tpay API
3. User redirects to Tpay payment form
4. After payment, Tpay sends webhook to `/api/pzk/purchase/callback`
5. System verifies signature, activates access (12 months), sends confirmation email
6. User redirects to success/error page

### Email Integration

**Current:** SMTP (OVH MX Plan) via nodemailer for consultation forms

**Planned:** react-email for templated emails
- Rich HTML emails with React components
- Preview mode: `npm run email:dev` (localhost:3000)
- Templates: Weight reminders, invitations, password reset, welcome emails
- Same SMTP transport (nodemailer + OVH)

**Implementation guidelines:**
- API endpoints go in `src/pages/api/`
- Use Zod for server-side validation
- Configure SMTP transporter with OVH credentials
- Astro endpoints return JSON responses

### Image Handling

- **Optimized images**: Import from `src/assets/` - processed by Astro
- **Static images**: Place in `public/images/` - served as-is
- Note: Some images may be in HEIC format and need conversion to JPEG

### Design System Compliance

When creating new components, follow the "Naturalna Harmonia" design system:
- Use Tailwind color tokens (`primary`, `secondary`, `accent`)
- Apply 8px spacing grid
- Use defined border radius values (8-16px)
- Match typography scale (`font-heading`, `font-body`)

### Database & ORM (Drizzle)

**Stack:** Neon Postgres (serverless) + Drizzle ORM

**Key features:**
- Type-safe SQL query builder (lightweight ~7 KB vs Prisma ~2 MB)
- Built-in migrations (Drizzle Kit)
- Edge-compatible (Vercel Edge Functions)
- SQL-like syntax (easy to learn)

**Schema location:** `src/db/schema.ts`

**Migration workflow:**
```bash
# 1. Update schema in src/db/schema.ts
# 2. Generate migration
npm run db:generate
# 3. Review generated SQL in drizzle/ folder
# 4. Push to database
npm run db:push
# 5. Open GUI to inspect database
npm run db:studio
```

**Neon features:**
- EU hosting (Frankfurt/Amsterdam) - RODO compliance
- Branching for safe testing
- Auto-scaling
- Free tier: 0.5 GB storage, 100h compute/month

### Authentication & Security

**Stack:**
- **Lucia Auth v3** - Session-based authentication (30-day sessions)
- **jose** - JWT handling for tokens
- **bcrypt** - Password hashing
- **SHA-256** - Token hashing (password reset, invitations)
- **Vercel Cron Jobs** - Scheduled jobs (reminders)

**Security features:**
- CSRF protection via Astro middleware
- Secure session cookies (httpOnly, secure in prod)
- Password reset with time-limited tokens (hashed in database)
- Invitation tokens hashed in database
- Audit log for all sensitive operations
- Rate limiting can be added post-MVP if needed

**Token Security (Password Reset & Invitations):**

Tokens are stored as SHA-256 hashes to prevent account takeover in case of database breach.

**Implementation:**
1. Generate cryptographically secure random token (32 bytes → 64-char hex)
2. Hash token with SHA-256 → 64-char hex hash
3. Store hash in database (`tokenHash` column)
4. Send raw token via email/URL (one-time use)
5. During validation: hash incoming token → compare with DB hash

**Security benefits:**
- Database leak ≠ valid tokens (hashes cannot be reversed)
- Tokens are single-use (marked with `usedAt` timestamp)
- Automatic expiration (60 min for password reset, 7 days for invitations)

**IMPORTANT for developers:**
- NEVER log raw tokens (only log hash for debugging)
- Raw tokens only exist in memory during email sending
- Always hash tokens before database queries
- See `src/lib/crypto.ts` for implementation details

### Email Security (Contact Forms)

**Stack:**
- **Google reCAPTCHA v3** - Bot protection (invisible, score-based)
- **IP-based rate limiting** - In-memory storage (Map)
- **HTML sanitization** - Strict XSS prevention
- **Email validation** - Disposable domain blocking

**Security features:**
- **IP rate limiting**: 5 requests per hour per IP
- **Email rate limiting**: 2 confirmation emails per hour per email address
- **reCAPTCHA verification**: Minimum score 0.5, action validation
- **Input sanitization**: All HTML removed, special characters escaped
- **Email validation**: Blocks disposable domains, validates format
- **Risk scoring**: Flags suspicious email patterns

**Implementation details:**
- Rate limits stored in-memory (reset on server restart)
- Automatic garbage collection every 10 minutes
- Owner email always sent, confirmation email conditionally sent
- Comprehensive logging for security monitoring
- Dev mode: skips reCAPTCHA, logs rate limit events

**Files:**
- `src/lib/rate-limit-public.ts` - IP and email rate limiting
- `src/lib/captcha.ts` - reCAPTCHA verification
- `src/lib/email-security.ts` - Sanitization and validation
- `src/pages/api/contact.ts` - Contact form endpoint (secured)
- `src/pages/api/consultation.ts` - Consultation form endpoint (secured)

**Testing:**
- `tests/unit/rate-limit-public.test.ts` - Rate limiting tests
- `tests/unit/captcha.test.ts` - CAPTCHA verification tests
- `tests/unit/email-security.test.ts` - Sanitization tests

**Setup required:**
1. Generate reCAPTCHA v3 keys at https://www.google.com/recaptcha/admin
2. Add keys to `.env.local` and Vercel environment variables
3. Frontend integration needed (pending implementation):
   - Add reCAPTCHA script to `Layout.astro`
   - Generate token on form submit (`grecaptcha.execute()`)
   - Handle 429 rate limit errors in UI

**IMPORTANT for developers:**
- Backend is fully secured and tested
- Frontend must add reCAPTCHA token to form submissions
- Never bypass rate limiting in production
- Monitor logs for suspicious activity patterns

### Performance Goals

Target Lighthouse scores:
- Performance: > 90
- SEO: > 90
- Accessibility: > 90
- Core Web Vitals: LCP < 2.5s, FID < 100ms, CLS < 0.1

**Note:** SSR may slightly impact performance vs static, but enables authentication features.

### RODO (GDPR) Compliance

**Critical for health data handling:**

**Data storage:**
- All databases in EU (Neon Frankfurt, Upstash Ireland)
- Health data (weight entries) stored with user consent
- Consent tracking in `consents` table

**User rights:**
- Right to data portability: `GET /api/user/export-data` (JSON export)
- Right to deletion: `POST /api/user/delete-account` (anonymization)
- Audit log for all data operations

**Implementation requirements:**
- Explicit consent on signup (RODO checkbox)
- Privacy policy page before launch
- Data retention policy (TBD with legal counsel)
- DPIA (Data Protection Impact Assessment) recommended before production

### Documentation

**Marketing website docs (`.ai/` directory):**
- `prd.md` - Full product requirements
- `tech-stack-decision.md` - Rationale for Astro choice
- `moodboard.md` - Design system and color palette details
- `project-description.md` - Project overview

**Weight tracking app docs (`.ai-10xdevs/` directory):**
- `tech-stack-waga.md` - Complete implementation plan for weight tracking MVP
  - Tech stack decisions (Neon, Drizzle, Lucia)
  - Database schema design
  - 12-day implementation timeline
  - Cost estimates ($0/month MVP, ~$19-39/month production)
  - Risk mitigation strategies

## Git Workflow

```bash
# Create feature branch
git checkout -b feature/nazwa-feature

# Make changes and commit
git add .
git commit -m "feat: description"

# Push and create PR
git push origin feature/nazwa-feature

# Merge to main triggers automatic Vercel deployment
```

## Language

- **Content**: Polish (pl)
- **Code**: English variable/function names preferred
- **Comments**: Polish acceptable for domain-specific explanations

## Tech Stack Summary

### Current Production Stack
- **Framework:** Astro 5.x (SSR mode)
- **Hosting:** Vercel
- **UI Library:** React 19 (islands)
- **Styling:** TailwindCSS 3.x
- **Email:** nodemailer (OVH SMTP)
- **Forms:** Zod validation + react-hot-toast

### Weight Tracking App Stack (Installed, In Development)
- **Database:** Neon Postgres (serverless, EU hosting)
- **ORM:** Drizzle ORM 0.44.x + Drizzle Kit
- **Authentication:** Lucia v3 (session-based)
- **Security:** jose (JWT) + bcrypt (password hashing)
- **Scheduled Jobs:** Vercel Cron Jobs (built-in)
- **Push Notifications:** web-push + Service Worker
- **Email Templates:** react-email + @react-email/components
- **Date Handling:** date-fns + date-fns-tz (Europe/Warsaw timezone)

### Development Tools
- **Package Manager:** npm
- **TypeScript:** Yes (with path aliases)
- **Linting:** Not configured yet
- **Testing:** Not configured yet
- **Database GUI:** Drizzle Studio (`npm run db:studio`)
- **Email Preview:** react-email dev server (`npm run email:dev`)

### Infrastructure & Services
- **Deployment:** Vercel (automatic on push to main)
- **Database:** Neon (Frankfurt, EU) - Free tier
- **CRON Jobs:** Vercel Cron Jobs - Free tier (Hobby plan)
- **Email SMTP:** OVH MX Plan (existing)

### Cost Breakdown
- **MVP:** $0/month (all free tiers including Vercel Hobby)
- **Production (estimated):** ~$19/month (or ~$39/month with Vercel Pro)
  - Vercel Hobby: $0/month (includes Cron Jobs) or Pro: $20/month
  - Neon Scale: $19/month
