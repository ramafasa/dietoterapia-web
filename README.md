# Dietoterapia - Paulina Maciak

Strona wizytówka dla dietetyk klinicznej Pauliny Maciak. MVP obejmuje prezentację usług, formularz kontaktowy oraz informacje o dietetyk.

## 🛠️ Tech Stack

- **Framework**: Astro 4.x (Static Site Generation)
- **Islands**: React (tylko dla interaktywnych komponentów - formularze)
- **Styling**: TailwindCSS
- **Language**: TypeScript
- **Email**: SMTP (OVH MX Plan) via nodemailer
- **Hosting**: Vercel

### Dlaczego Astro?

- ✅ **90% mniej JavaScript** (~25 KB vs ~250 KB w Next.js)
- ✅ **Lighthouse 98-100** (Performance, SEO, Accessibility)
- ✅ **Szybszy development** (2-3 tygodnie zamiast 3-4)
- ✅ **Islands Architecture** (React tylko tam gdzie potrzeba)
- ✅ **Built-in optimizations** (image, fonts, SEO)

Więcej informacji: `.ai/tech-stack-decision.md`

## 📁 Struktura projektu

```
dietoterapia-web/
├── .ai/                      # Dokumentacja projektu
│   ├── prd.md                    # Product Requirements Document
│   ├── tech-stack-decision.md    # Uzasadnienie wyboru tech stack
│   ├── moodboard.md              # Paleta kolorów i design
│   └── project-description.md    # Opis projektu
├── src/
│   ├── pages/                # File-based routing
│   │   └── index.astro           # Strona główna
│   ├── components/           # React islands i Astro components
│   ├── layouts/
│   │   └── Layout.astro          # Main layout
│   ├── styles/
│   │   └── global.css            # TailwindCSS + custom styles
│   └── assets/               # Obrazy (optymalizowane przez Astro)
├── public/                   # Static assets (favicon, robots.txt)
├── astro.config.mjs          # Astro configuration
├── tailwind.config.mjs       # TailwindCSS + paleta "Naturalna Harmonia"
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

# Edit .env.local and add your SendGrid API key
```

### Development

```bash
# Start dev server (localhost:4321)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
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
SMTP_HOST=ssl0.ovh.net
SMTP_PORT=465
SMTP_USER=dietoterapia@paulinamaciak.pl
SMTP_PASS=your_password_here
CONTACT_EMAIL=dietoterapia@paulinamaciak.pl
SITE_URL=https://paulinamaciak.pl
```

## 🧪 Testing

```bash
# Lighthouse audit
npm run build
npm run preview
# Otwórz Chrome DevTools → Lighthouse → Run audit

# Cross-browser testing
# Manual testing na:
# - Chrome (latest)
# - Safari (latest)
# - Firefox (latest)
# - Edge (latest)
```

## 🚢 Deployment (Vercel)

### Automatic Deployment

1. Połącz repo z Vercel
2. Skonfiguruj environment variables:
   - `SMTP_HOST`
   - `SMTP_PORT`
   - `SMTP_USER`
   - `SMTP_PASS`
   - `CONTACT_EMAIL`
   - `SITE_URL`
3. Deploy automatically przy push do `main`

### Manual Deployment

```bash
# Build
npm run build

# Output będzie w dist/
# Deploy dist/ do Vercel
```

## 📊 MVP Features

### Strony:
- ✅ Home (Hero + Bio + CTA)
- ⏳ O mnie (Bio + Galeria zdjęć)
- ⏳ Konsultacje (Lista konsultacji + Formularz)
- ⏳ Opinie (Grid opinii klientów)
- ⏳ Kontakt (Formularz + Google Maps + Dane kontaktowe)
- ⏳ Polityka prywatności (RODO/GDPR)

### Komponenty:
- ✅ Header (Sticky navigation + Logo + Menu)
- ✅ Footer (Dane kontaktowe + Social media + Polityka)
- ✅ ConsultationForm (React island)
- ⏳ ContactForm (React island)
- ⏳ CookieConsent (React island)

### API Endpoints:
- ✅ `/api/consultation` (SMTP OVH integration)
- ⏳ `/api/contact` (SMTP OVH integration)

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
**Last Updated**: 2025-10-18
