# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dietoterapia is a professional website for clinical dietitian Paulina Maciak. Built with Astro for static site generation, it uses React islands architecture for interactive components and TailwindCSS for styling.

**Key characteristics:**
- Static site optimized for performance (Lighthouse 90+ target)
- Polish language content
- Mobile-first responsive design
- MVP in progress - not all features are implemented yet

## Development Commands

```bash
# Start development server (localhost:4321)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

**Note:** There are no linting, testing, or formatting scripts configured yet.

## Architecture

### Framework: Astro + React Islands

This project uses **Astro** as the main framework with the **Islands Architecture** pattern:

- **Static content**: `.astro` files (most components and pages)
- **Interactive components**: `.tsx` React components used as "islands" where interactivity is needed
- **Integration**: React islands are imported into Astro components with `client:*` directives

**Why this matters:**
- Most of the site is static HTML with zero JavaScript
- React is only loaded for specific interactive components (forms, animations)
- This results in minimal JavaScript (~25 KB vs ~250 KB in full React apps)

### Directory Structure

```
src/
├── components/          # UI components (mix of .astro and .tsx)
│   ├── *.astro         # Static Astro components
│   └── *.tsx           # React islands (interactive)
├── hooks/              # React custom hooks (for islands)
├── layouts/            # Astro layout templates
│   └── Layout.astro    # Main layout with SEO, fonts, global meta
├── pages/              # File-based routing
│   ├── index.astro     # Home page
│   ├── o-mnie.astro    # About page
│   └── api/            # API endpoints (planned, not yet implemented)
├── styles/
│   └── global.css      # TailwindCSS imports + custom animations
└── assets/             # Images (optimized by Astro)

public/                 # Static assets (favicon, images not processed by Astro)
.ai/                    # Project documentation (PRD, design specs, etc.)
```

### Routing

- **File-based routing**: Pages in `src/pages/` automatically become routes
  - `src/pages/index.astro` → `/`
  - `src/pages/o-mnie.astro` → `/o-mnie`
- **API routes**: Will be in `src/pages/api/` (planned but not implemented)

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

- `astro.config.mjs` - Astro configuration with React and Tailwind integrations
  - Output: `static` (SSG)
  - Site: `https://paulinamaciak.pl`
  - Integrations: React, Tailwind (base styles disabled)
- `tailwind.config.mjs` - Custom design system configuration
- `tsconfig.json` - TypeScript configuration (if exists)

## Project Status (MVP)

**Completed:**
- ✅ Basic project setup with Astro + React + Tailwind
- ✅ Main layout with SEO, fonts, and global styles
- ✅ Home page (Hero + Benefits sections)
- ✅ About page (Hero + Image gallery)
- ✅ Consultations page with form (`/konsultacje`)
- ✅ Animation system with `AnimatedSection` component
- ✅ Header and Footer components
- ✅ API endpoint for consultations (`/api/consultation`) - SMTP via nodemailer
- ✅ Toast notification system for form feedback

**Planned but not implemented:**
- ⏳ Testimonials page (`/opinie`)
- ⏳ Contact page (`/kontakt`)
- ⏳ Privacy policy page (`/polityka-prywatnosci`)
- ⏳ API endpoint for contact form (`/api/contact`)
- ⏳ Cookie consent component

## Important Notes

### Environment Variables

The project needs these environment variables:

```bash
SMTP_HOST=ssl0.ovh.net
SMTP_PORT=465
SMTP_USER=dietoterapia@paulinamaciak.pl
SMTP_PASS=your_password_here
CONTACT_EMAIL=dietoterapia@paulinamaciak.pl
SITE_URL=https://paulinamaciak.pl
```

Create `.env.local` for local development (not committed to git).

### Email Integration

Forms use **SMTP (OVH MX Plan)** via nodemailer for email delivery. When implementing:
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

### Performance Goals

Target Lighthouse scores:
- Performance: > 90
- SEO: > 90
- Accessibility: > 90
- Core Web Vitals: LCP < 2.5s, FID < 100ms, CLS < 0.1

### Documentation

Detailed project docs in `.ai/` directory:
- `prd.md` - Full product requirements
- `tech-stack-decision.md` - Rationale for Astro choice
- `moodboard.md` - Design system and color palette details
- `project-description.md` - Project overview

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
