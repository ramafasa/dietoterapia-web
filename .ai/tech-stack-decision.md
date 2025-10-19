# Decyzja Tech Stack - Dietoterapia MVP

**Data**: 2025-10-18
**Status**: Zaakceptowane
**Decyzja**: Astro 4.x + React Islands

---

## Kontekst

Projekt **Dietoterapia** to strona wizytówka dla dietetyk klinicznej Pauliny Maciak. MVP obejmuje:
- 6 statycznych podstron (Home, O mnie, Konsultacje, Opinie, Kontakt, Polityka prywatności)
- 2 formularze kontaktowe z integracją email (SendGrid)
- Responsywny design (mobile-first)
- SEO optimization
- Proste animacje fade-in/hover

**Początkowy stack** (przed analizą):
- Next.js 14+ App Router
- React Hook Form + Zod
- Framer Motion
- Next.js Image

**Finalny stack** (po analizie):
- Astro 4.x
- React Islands (tylko formularze)
- Native CSS animations
- Astro Image (built-in)

---

## Analiza wymagań projektu

### Rzeczywiste potrzeby MVP:

✅ **Statyczna treść** - 90% strony to niezmienny content
✅ **Minimalna interaktywność** - tylko 2 formularze wymagają JavaScript
✅ **SEO** - kluczowe dla lokalnego pozycjonowania
✅ **Performance** - Core Web Vitals wpływają na ranking Google
✅ **Szybki development** - deadline 6 tygodni
✅ **Niski koszt utrzymania** - darmowy hosting

❌ **NIE potrzebne** w MVP:
- Server-Side Rendering (SSR)
- Client-Side Routing
- Kompleksowa state management
- Real-time features
- Autoryzacja/uwierzytelnianie

---

## Porównanie: Next.js App Router vs Astro

| Kryterium | Next.js App Router | Astro 4.x | Zwycięzca |
|-----------|-------------------|-----------|-----------|
| **Bundle size (JS)** | ~200-250KB | ~20-30KB | ✅ Astro |
| **Lighthouse Performance** | 85-92 | 95-100 | ✅ Astro |
| **Czas developmentu MVP** | 3-4 tygodnie | 2-3 tygodnie | ✅ Astro |
| **Krzywa nauki** | Średnia/Wysoka | Niska/Średnia | ✅ Astro |
| **SEO out-of-box** | Bardzo dobre | Doskonałe | ✅ Astro |
| **Skalowalność do SPA** | Bardzo wysoka | Średnia | ✅ Next.js |
| **Ekosystem** | Ogromny | Rosnący | ✅ Next.js |
| **TypeScript support** | Doskonałe | Doskonałe | 🟰 Remis |
| **Hosting** | Vercel (free) | Vercel (free) | 🟰 Remis |

### Dlaczego Next.js App Router był overkill?

**App Router** został stworzony dla:
- Aplikacji z dynamicznym routingiem
- Server Components
- Streaming SSR
- Parallel/Intercepting routes
- Complex data fetching patterns

**W Dietoterapia MVP wykorzystalibyśmy < 10% tych możliwości.**

---

## Uzasadnienie wyboru Astro

### 1. ✅ **Optymalizacja Performance**

**Astro domyślnie:**
- Wysyła 0 KB JavaScript (zero JS by default)
- Dodaje JS tylko tam gdzie potrzeba (Islands Architecture)
- Generuje czysty, statyczny HTML

**Rezultat dla MVP:**
```
Next.js Bundle:   ~250 KB JS
Astro Bundle:     ~25 KB JS (tylko formularze + cookie consent)

Oszczędność: 90% mniej JavaScript = szybsze ładowanie = lepszy SEO
```

### 2. ✅ **Islands Architecture - Idealne dla tego use case**

**Koncepcja:**
- Większość strony = statyczny HTML (Header, Footer, treść)
- Interaktywność tylko w "wyspach" (Islands) = React components

**Przykład struktury:**
```
src/
  pages/
    index.astro          ← Statyczny HTML + CSS
    konsultacje.astro    ← Mix: Statyczny + React island (formularz)
    kontakt.astro        ← Mix: Statyczny + React island (formularz)
  components/
    Header.astro         ← Statyczny (0 KB JS)
    Footer.astro         ← Statyczny (0 KB JS)
    ContactForm.tsx      ← React island (~15 KB)
    CookieConsent.tsx    ← React island (~10 KB)
```

**Tylko formularze wysyłają JavaScript do przeglądarki.**

### 3. ✅ **Szybszy Development MVP**

**Dlaczego?**
- Mniej boilerplate kodu
- Prostsze routing (file-based, bez App Router złożoności)
- Built-in image optimization (nie trzeba konfigurować)
- Mniej decision fatigue (mniej opcji = szybsze decyzje)

**Oszczędność czasu: ~1-2 tygodnie developmentu**

### 4. ✅ **SEO - Best-in-class**

**Astro został stworzony dla content-heavy sites:**
- Automatyczne generowanie sitemap.xml
- Meta tags per-page
- Schema markup support
- Perfect Core Web Vitals (dzięki minimal JS)

**Rezultat:**
- Lighthouse SEO: 100/100
- Perfect Accessibility: 100/100
- Performance: 98-100/100

### 5. ✅ **Możliwość użycia React gdzie potrzeba**

**Astro pozwala:**
```astro
---
import ContactForm from '../components/ContactForm.tsx'
---

<h1>Kontakt</h1>
<p>Napisz do nas...</p>

<!-- React component jako "island" -->
<ContactForm client:load />
```

**Zalety:**
- React tylko w formularzach
- Możesz używać React Hook Form jeśli chcesz (opcjonalnie)
- Custom hooks działają normalnie

### 6. ✅ **Niższy koszt utrzymania**

**Mniej kodu = mniej problemów:**
```
Next.js MVP:  ~3000 linii kodu + 10-15 dependencies
Astro MVP:    ~1800 linii kodu + 5-8 dependencies

Oszczędność: ~40% mniej kodu do utrzymania
```

### 7. ✅ **Doskonały DX (Developer Experience)**

**Built-in features:**
- Image optimization (Astro Image)
- TypeScript support
- Hot Module Replacement
- Error overlay
- VS Code extension

**Nie trzeba instalować:**
- ❌ react-hook-form (~50KB)
- ❌ framer-motion (~55KB)
- ❌ next/image configuration

---

## Odpowiedzi na krytyczne pytania

### ❓ 1. Czy Astro pozwoli szybko dostarczyć MVP?

**✅ TAK - szybciej niż Next.js**

**Powody:**
- Prostsza architektura (mniej boilerplate)
- Built-in optimizations (image, fonts)
- Mniej konfiguracji
- File-based routing (prostsze niż App Router)

**Szacowany czas developmentu:**
- Next.js App Router: 3-4 tygodnie
- Astro: 2-3 tygodnie

### ❓ 2. Czy będzie skalowalne w miarę wzrostu?

**✅ TAK, ale z ograniczeniami**

**Astro jest idealne dla:**
- ✅ Blog (przyszła funkcja)
- ✅ Landing pages
- ✅ Marketing sites
- ✅ Dokumentacja

**Astro ma ograniczenia dla:**
- ⚠️ Złożone SPA (Single Page Apps)
- ⚠️ Real-time dashboards
- ⚠️ Heavy client-side state

**Dla Dietoterapia:**

**MVP → Faza 2:**
```
✅ Dodanie bloga dietetycznego       → Astro świetne
✅ Więcej stron landing               → Astro świetne
✅ Galeria przepisów                  → Astro dobre
```

**Faza 3 (system rezerwacji + sklep):**
```
⚠️ System rezerwacji z kalendarzem   → Możliwe w Astro (React islands)
⚠️ Panel admin dla Pauliny           → Lepsze w Next.js lub dedicated backend
⚠️ Sklep e-commerce                  → Lepsze w Next.js + Stripe

REKOMENDACJA dla Fazy 3:
- Opcja A: Astro (frontend) + Dedicated backend (Node.js/Express + Postgres)
- Opcja B: Migracja do Next.js
```

**Ścieżka migracji (jeśli potrzeba):**
1. Astro components można konwertować do React/Next.js
2. API endpoints są podobne (oba używają Request/Response API)
3. Astro może być początkowo serwowany obok Next.js (różne domeny/subdirectories)

### ❓ 3. Czy koszt utrzymania będzie akceptowalny?

**✅ TAK - niższy niż Next.js**

**Porównanie kosztów:**

| Aspekt | Next.js | Astro |
|--------|---------|-------|
| **Hosting** | Vercel free tier | Vercel free tier |
| **Build time** | ~2-3 min | ~30-60 sec |
| **Bundle size** | ~250 KB | ~25 KB |
| **Dependencies** | 10-15 | 5-8 |
| **Update frequency** | Częste (Fast Pace) | Stabilne (Slow Pace) |
| **Debugging time** | Średni | Niski |

**Oszczędność:**
- Szybsze buildy = mniej czasu CI/CD
- Mniej dependencies = mniej breaking changes
- Prostszy kod = łatwiejsze onboarding nowych devów

### ❓ 4. Czy nie jest to zbyt złożone rozwiązanie?

**✅ NIE - Astro jest prostsze niż Next.js App Router**

**Poziom złożoności:**
```
WordPress:                ████░░░░░░ (4/10) - Proste, ale nieelastyczne
Astro:                    █████░░░░░ (5/10) - Balans prostota/elastyczność
Next.js Pages Router:     ██████░░░░ (6/10) - Średnio złożone
Next.js App Router:       ████████░░ (8/10) - Złożone, ale potężne
```

**Astro jest łatwiejsze do nauki niż Next.js:**
- Składnia zbliżona do HTML
- Mniej konceptów do opanowania (no server components, no streaming, no suspense)
- Debugging jest prostsze (mniej "magic")

### ❓ 5. Czy istnieje prostsze podejście?

**Porównanie alternatyw:**

**1. WordPress + Theme**
- ✅ Najszybsze (gotowe szablony)
- ❌ Nieelastyczne, trudne customizacje
- ❌ Performance problemy
- ❌ Nie przygotowane na przyszłe custom features

**2. Static HTML + CSS**
- ✅ Najprostsze
- ❌ Brak reusable components
- ❌ Trudne utrzymanie (copy-paste)
- ❌ Brak TypeScript/tooling

**3. Astro** ⭐
- ✅ Balans prostota/możliwości
- ✅ Component-based
- ✅ TypeScript support
- ✅ Łatwa rozbudowa

**4. Next.js**
- ⚠️ Nadmiarowe możliwości dla MVP
- ⚠️ Wyższa krzywa nauki
- ✅ Świetne dla złożonych apps

**WNIOSEK: Astro jest "goldilocks solution" - nie za proste, nie za złożone.**

### ❓ 6. Czy zapewnia odpowiednie bezpieczeństwo?

**✅ TAK - podobne możliwości jak Next.js**

**Security features:**

**1. Built-in Security:**
- ✅ Server-side validation (Zod schemas w API endpoints)
- ✅ CSRF protection (można dodać middleware)
- ✅ Environment variables (bezpieczne .env handling)
- ✅ Content Security Policy (CSP headers)

**2. Wymagane dodatki:**
- ✅ Rate limiting (middleware lub Vercel Edge Config)
- ✅ Honeypot fields (custom implementation)
- ✅ Input sanitization (DOMPurify lub podobne)

**Przykład rate limiting w Astro:**
```typescript
// src/middleware/rateLimit.ts
import rateLimit from 'express-rate-limit'

export const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minut
  max: 5, // 5 requestów
  message: 'Zbyt wiele żądań, spróbuj później'
})
```

**Przykład secure API endpoint:**
```typescript
// src/pages/api/contact.ts
import { z } from 'zod'
import rateLimit from '../middleware/rateLimit'

const contactSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  message: z.string().min(10).max(1000)
})

export async function POST({ request }) {
  // Rate limiting
  await rateLimit(request)

  // Parse & validate
  const body = await request.json()
  const validated = contactSchema.safeParse(body)

  if (!validated.success) {
    return new Response(JSON.stringify({ error: validated.error }), {
      status: 400
    })
  }

  // Send email via SendGrid...
}
```

**Security checklist:**
- ✅ Server-side validation (Zod)
- ✅ Rate limiting (custom middleware)
- ✅ Honeypot fields (React component)
- ✅ Environment variables security (.env.local)
- ✅ CORS policy (Astro middleware)
- ✅ CSP headers (Vercel/Astro config)
- ✅ HTTPS (Vercel automatycznie)
- ✅ Dependency scanning (Dependabot)

**Astro NIE jest mniej bezpieczny niż Next.js.**

---

## Usunięte biblioteki i ich zamienniki

### 1. ❌ Framer Motion → ✅ CSS Transitions

**Powód usunięcia:**
- 55 KB bundle size
- Overkill dla prostych animacji (fade-in, hover)

**Zamiennik:**
```css
/* CSS transitions wystarczą */
.fade-in {
  opacity: 0;
  transform: translateY(20px);
  transition: all 0.6s ease;
}

.fade-in.visible {
  opacity: 1;
  transform: translateY(0);
}
```

```typescript
// Intersection Observer (native browser API)
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible')
    }
  })
})
```

**Oszczędność: 55 KB**

### 2. ❌ React Hook Form → ✅ Native HTML5 + Custom Hooks

**Powód usunięcia:**
- 50 KB bundle size
- Tylko 2 proste formularze (~10 pól total)

**Zamiennik:**
```typescript
// Custom hook dla form handling
function useContactForm() {
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const validateEmail = (email: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return regex.test(email)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    // Validation logic...
    // API call...
  }

  return { errors, loading, handleSubmit, validateEmail }
}
```

**HTML5 validation:**
```html
<input
  type="email"
  required
  pattern="[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$"
/>
```

**Oszczędność: 50 KB**

### 3. ❌ Next.js Image → ✅ Astro Image (built-in)

**Powód zmiany:**
- Astro Image jest built-in (0 dodatkowych KB)
- Automatyczna optymalizacja WebP + AVIF

**Przykład:**
```astro
---
import { Image } from 'astro:assets'
import heroImage from '../assets/paulina-hero.jpg'
---

<Image
  src={heroImage}
  alt="Paulina Maciak - Dietetyk kliniczna"
  width={800}
  height={600}
  format="webp"
  loading="eager"
/>
```

**Funkcje:**
- ✅ Automatyczna konwersja do WebP/AVIF
- ✅ Responsive images (srcset)
- ✅ Blur placeholder
- ✅ Lazy loading
- ✅ TypeScript support

---

## Struktura projektu Astro

```
dietoterapia-web/
├── src/
│   ├── pages/              # File-based routing
│   │   ├── index.astro         # Home page (statyczny)
│   │   ├── o-mnie.astro        # O mnie (statyczny)
│   │   ├── konsultacje.astro   # Mix: statyczny + React island
│   │   ├── opinie.astro        # Opinie (statyczny)
│   │   ├── kontakt.astro       # Mix: statyczny + React island
│   │   └── polityka-prywatnosci.astro
│   │
│   ├── components/
│   │   ├── Header.astro        # Statyczny header (0 KB JS)
│   │   ├── Footer.astro        # Statyczny footer (0 KB JS)
│   │   ├── ConsultationForm.tsx    # React island (~15 KB)
│   │   ├── ContactForm.tsx         # React island (~12 KB)
│   │   └── CookieConsent.tsx       # React island (~8 KB)
│   │
│   ├── layouts/
│   │   └── Layout.astro        # Main layout wrapper
│   │
│   ├── assets/             # Obrazy (optymalizowane przez Astro)
│   │   ├── logo.png
│   │   └── paulina-hero.jpg
│   │
│   ├── styles/
│   │   └── global.css      # TailwindCSS + custom styles
│   │
│   └── pages/api/          # API endpoints
│       ├── contact.ts          # Kontakt form handler
│       └── consultation.ts     # Konsultacja form handler
│
├── public/                 # Static assets (nie przetwarzane)
│   ├── favicon.ico
│   └── robots.txt
│
├── astro.config.mjs        # Astro configuration
├── tailwind.config.mjs     # TailwindCSS configuration
├── tsconfig.json           # TypeScript configuration
└── package.json

Total lines of code (MVP): ~1800
Total dependencies: ~8
Build time: ~30-60 seconds
Bundle size: ~25 KB JS (tylko islands)
```

---

## Wyniki wydajności (przewidywane)

### Lighthouse Scores (MVP):

**Astro:**
```
Performance:    98-100 ✅
Accessibility:  100    ✅
Best Practices: 100    ✅
SEO:            100    ✅
```

**Next.js (dla porównania):**
```
Performance:    85-92  ⚠️
Accessibility:  95-100 ✅
Best Practices: 95-100 ✅
SEO:            95-100 ✅
```

### Core Web Vitals:

| Metric | Next.js | Astro | Target |
|--------|---------|-------|--------|
| LCP (Largest Contentful Paint) | 1.8-2.4s | 0.9-1.4s | < 2.5s |
| FID (First Input Delay) | 50-80ms | 20-40ms | < 100ms |
| CLS (Cumulative Layout Shift) | 0.05-0.08 | 0.01-0.03 | < 0.1 |

**Astro wygrywa we wszystkich metrykach.**

---

## Ścieżka migracji (jeśli potrzeba w przyszłości)

### Scenariusz 1: Rozbudowa w Astro

**Możliwe w Astro:**
- ✅ Blog dietetyczny
- ✅ Galeria przepisów
- ✅ System rezerwacji (z React islands + API)
- ✅ Prosty sklep (z React islands + Stripe)

**Pozostajemy w Astro jeśli:**
- Strona pozostaje głównie content-heavy
- Nie potrzeba złożonego client-side state
- Performance jest priorytetem

### Scenariusz 2: Migracja do Next.js

**Kiedy migrować:**
- Potrzeba złożonego panelu admin
- Aplikacja staje się bardziej SPA niż static site
- Potrzeba Server-Side Rendering (SSR)

**Proces migracji:**
1. **Astro components → React components**
   ```astro
   <!-- Header.astro -->
   <header>...</header>

   // Header.tsx
   export default function Header() {
     return <header>...</header>
   }
   ```

2. **Astro API endpoints → Next.js API routes**
   ```typescript
   // Astro: src/pages/api/contact.ts
   export async function POST({ request }) { ... }

   // Next.js: app/api/contact/route.ts
   export async function POST(request: Request) { ... }
   ```

3. **Stopniowa migracja:**
   - Uruchom Next.js na subdomain (app.paulinamaciak.pl)
   - Astro pozostaje na głównej domenie (www.paulinamaciak.pl)
   - Gradual transition

**Koszt migracji: ~2-3 tygodnie pracy**

### Scenariusz 3: Hybrid (Astro + Dedicated Backend)

**Architektura:**
```
Frontend (Astro):        paulinamaciak.pl
Backend API (Node.js):   api.paulinamaciak.pl
Admin Panel (React):     admin.paulinamaciak.pl
```

**Kiedy to rozwiązanie:**
- Potrzeba dedykowanego backendu (DB, auth, complex logic)
- Frontend pozostaje głównie statyczny
- Separacja concerns (frontend team vs backend team)

---

## Rekomendacje implementacyjne

### 1. Setup projektu

```bash
# Inicjalizacja projektu Astro
npm create astro@latest dietoterapia-web

# Template: Empty
# TypeScript: Yes, strict
# Install dependencies: Yes
# Git: Yes

cd dietoterapia-web

# Dodaj dependencies
npm install -D tailwindcss @tailwindcss/typography
npm install @astrojs/react
npm install nodemailer @types/nodemailer zod
npm install react react-dom

# Setup TailwindCSS
npx astro add tailwind
npx astro add react
```

### 2. Astro Config

```javascript
// astro.config.mjs
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import tailwind from '@astrojs/tailwind'

export default defineConfig({
  integrations: [
    react(),
    tailwind()
  ],
  output: 'static',
  site: 'https://paulinamaciak.pl',
  compressHTML: true,
  build: {
    inlineStylesheets: 'auto'
  }
})
```

### 3. Przykład React Island (Contact Form)

```tsx
// src/components/ContactForm.tsx
import { useState, type FormEvent } from 'react'

export default function ContactForm() {
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const data = Object.fromEntries(formData)

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })

      if (res.ok) {
        // Success toast
        alert('Wiadomość wysłana!')
        e.currentTarget.reset()
      } else {
        // Error handling
        const error = await res.json()
        setErrors(error.errors || {})
      }
    } catch (err) {
      alert('Błąd wysyłki. Spróbuj ponownie.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="name">Imię i nazwisko</label>
        <input
          type="text"
          id="name"
          name="name"
          required
          minLength={2}
          className="w-full px-4 py-2 border rounded"
        />
        {errors.name && <p className="text-red-600">{errors.name}</p>}
      </div>

      <div>
        <label htmlFor="email">Email</label>
        <input
          type="email"
          id="email"
          name="email"
          required
          className="w-full px-4 py-2 border rounded"
        />
        {errors.email && <p className="text-red-600">{errors.email}</p>}
      </div>

      <div>
        <label htmlFor="message">Wiadomość</label>
        <textarea
          id="message"
          name="message"
          required
          maxLength={1000}
          rows={5}
          className="w-full px-4 py-2 border rounded"
        />
        {errors.message && <p className="text-red-600">{errors.message}</p>}
      </div>

      <div>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="gdpr" required />
          <span>Akceptuję politykę prywatności</span>
        </label>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="bg-primary text-white px-6 py-3 rounded hover:scale-105 transition"
      >
        {loading ? 'Wysyłanie...' : 'Wyślij wiadomość'}
      </button>
    </form>
  )
}
```

### 4. Przykład użycia w Astro page

```astro
---
// src/pages/kontakt.astro
import Layout from '../layouts/Layout.astro'
import ContactForm from '../components/ContactForm.tsx'
---

<Layout title="Kontakt - Dietoterapia">
  <main>
    <h1>Skontaktuj się ze mną</h1>
    <p>Masz pytania? Napisz do mnie!</p>

    <!-- React island - tylko ten component wysyła JS -->
    <ContactForm client:load />

    <div class="contact-info">
      <p>Email: <a href="mailto:dietoterapia@paulinamaciak.pl">
        dietoterapia@paulinamaciak.pl
      </a></p>
      <p>Telefon: <a href="tel:+48518036686">+48 518 036 686</a></p>
    </div>
  </main>
</Layout>

<style>
  /* Scoped CSS - tylko dla tej strony */
  h1 {
    font-size: 2.5rem;
    color: var(--primary);
  }
</style>
```

### 5. API Endpoint (SMTP OVH)

```typescript
// src/pages/api/contact.ts
import type { APIRoute } from 'astro'
import { z } from 'zod'
import nodemailer from 'nodemailer'

// Configure SMTP transporter
const transporter = nodemailer.createTransport({
  host: import.meta.env.SMTP_HOST, // ssl0.ovh.net
  port: 465,
  secure: true,
  auth: {
    user: import.meta.env.SMTP_USER, // dietoterapia@paulinamaciak.pl
    pass: import.meta.env.SMTP_PASS,
  },
})

const contactSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  message: z.string().min(10).max(1000),
  gdpr: z.literal('on')
})

export const POST: APIRoute = async ({ request }) => {
  try {
    // Parse body
    const body = await request.json()

    // Validate
    const validated = contactSchema.safeParse(body)
    if (!validated.success) {
      return new Response(
        JSON.stringify({ errors: validated.error.flatten() }),
        { status: 400 }
      )
    }

    const { name, email, message } = validated.data

    // Send email to Paulina
    await transporter.sendMail({
      from: 'dietoterapia@paulinamaciak.pl',
      to: 'dietoterapia@paulinamaciak.pl',
      subject: `Nowa wiadomość kontaktowa - ${name}`,
      text: `
        Imię: ${name}
        Email: ${email}
        Wiadomość: ${message}
      `,
      html: `
        <h2>Nowa wiadomość kontaktowa</h2>
        <p><strong>Imię:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Wiadomość:</strong></p>
        <p>${message}</p>
      `
    })

    // Send confirmation to user
    await transporter.sendMail({
      from: 'dietoterapia@paulinamaciak.pl',
      to: email,
      subject: 'Potwierdzenie wysłania wiadomości - Dietoterapia',
      text: `
        Dziękujemy za wiadomość!
        Paulina odpowie w ciągu 24 godzin.
      `
    })

    return new Response(JSON.stringify({ success: true }), {
      status: 200
    })
  } catch (error) {
    console.error('Contact form error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 }
    )
  }
}
```

---

## Podsumowanie decyzji

### ✅ Dlaczego Astro jest lepszy dla Dietoterapia MVP?

1. **90% mniej JavaScript** = lepszy performance = wyższe pozycje w Google
2. **2-3 tygodnie developmentu** zamiast 3-4 (oszczędność 1-2 tygodnie)
3. **Prostszy kod** = łatwiejsze utrzymanie = niższe koszty
4. **Lighthouse 98-100** zamiast 85-92
5. **Built-in optimizations** = mniej konfiguracji
6. **Możliwość użycia React** = elastyczność gdzie potrzeba

### ⚠️ Kiedy Astro NIE jest dobrym wyborem?

- Aplikacja wymaga heavy client-side state management
- Potrzeba real-time features (chat, live updates)
- Większość contentu jest dynamiczna (user dashboards)
- Aplikacja to głównie SPA (Single Page App)

### 🎯 Dla Dietoterapia MVP: **Astro jest idealny**

**Projekt to:**
- 90% statyczny content
- 10% interaktywność (formularze)
- SEO critical
- Performance critical
- Budget-conscious

**Astro został stworzony dokładnie dla tego typu projektów.**

---

## Następne kroki

1. ✅ **Setup projektu** (Astro + TypeScript + TailwindCSS)
2. ✅ **Implementacja Layout & Navigation** (Header, Footer)
3. ✅ **Implementacja stron** (6 podstron)
4. ✅ **React islands** (ContactForm, ConsultationForm, CookieConsent)
5. ✅ **API endpoints** (SendGrid integration)
6. ✅ **Optymalizacja obrazów** (Astro Image)
7. ✅ **CSS animations** (fade-in, hover effects)
8. ✅ **SEO setup** (meta tags, sitemap, schema markup)
9. ✅ **Testing** (cross-browser, mobile, performance)
10. ✅ **Deploy** (Vercel)

**Timeline: 2-3 tygodnie**

---

**Decyzja zatwierdzona przez**: Rafał Maciak (Tech Lead)
**Data**: 2025-10-18
**Status**: ✅ Zaakceptowane
