# PRD Planning Summary - Dietoterapia MVP

## Decisions

### 1. Target Audience & Positioning
- **Grupa docelowa**: Osoby chcące schudnąć oraz poprawić stan zdrowia (choroby metaboliczne, choroby hormonalne)
- **Specjalizacja**: Dietetyka kliniczna z naciskiem na wsparcie w zmianie nawyków żywieniowych

### 2. Technical Stack
- **Framework**: Next.js 14+ (App Router) z TypeScript
- **Rendering**: Static Site Generation (SSG) dla MVP
- **Uwaga**: Architektura musi być skalowalna - w przyszłości logika biznesowa (kalendarz, sklep)
- **CMS**: Brak - customowa aplikacja bez WordPress/headless CMS
- **Hosting**: Do 50 zł/miesiąc (rekomendacja: Vercel)
- **Domena**: paulinamaciak.pl (już zarejestrowana)

### 3. Content Management
- **Aktualizacje treści**: Paulina NIE będzie samodzielnie aktualizować - wymagane wsparcie techniczne
- **Początkowe treści**: Lorem ipsum (treści dostarczone później przez Paulinę)
- **Zarządzanie**: Kod w repozytorium Git

### 4. Responsive Design
- **Approach**: Mobile-first design
- **Breakpoints**: Mobile + Desktop (ewentualnie Tablet)
- **Design System**: Wybrana Propozycja 1 "Naturalna Harmonia" z moodboard.md

### 5. Visual Identity
- **Logo**: Dostępne w `.ai/logo.png`
- **Paleta kolorów**: 3 propozycje w `.ai/moodboard.md`
- **Rekomendacja**: Propozycja 1 "Naturalna Harmonia" (ciepłe, naturalne, profesjonalne kolory)

### 6. Forms & Email Communication
- **Email Service**: SendGrid (darmowy tier dla MVP)
- **Workflow**: Double opt-in dla wszystkich formularzy
- **Potwierdzenia**:
  - Email do użytkownika (potwierdzenie wysłania)
  - Email do Pauliny (notyfikacja z treścią zapytania)
- **Subject lines**: Różne dla każdego typu formularza (łatwiejsze sortowanie)

### 7. GDPR/RODO Compliance
- **Polityka prywatności**: Dedykowana strona w MVP (treść: Lorem ipsum, dostarczony później)
- **Formularze**: Checkbox RODO (required) we wszystkich formularzach
- **Link**: Footer z linkiem do polityki prywatności

### 8. SEO & Analytics
- **SEO lokalne**: Optymalizacja pod frazy "dietetyk [miasto]"
- **Technical SEO**:
  - Meta tagi (title, description)
  - Open Graph tags
  - Sitemap.xml
  - Schema markup (LocalBusiness, Person)
  - Struktura URL przyjazna SEO
- **Analytics**: Google Analytics 4
- **Google Business Profile**: Integracja
- **Search Console**: Konfiguracja

### 9. Success Metrics
- **MVP**: Brak aktywnego mierzenia KPI
- **Potencjalne metryki** (do rozważenia w przyszłości):
  - Liczba wypełnionych formularzy/miesiąc
  - Współczynnik odrzuceń (bounce rate)
  - Średni czas na stronie

### 10. Timeline & Budget
- **Deadline**: 6 tygodni od rozpoczęcia
- **Breakdown**:
  - Design: ~2 tygodnie
  - Development: 2-3 tygodnie
  - Testing & fixes: 1 tydzień
- **Budget**: Hosting do 50 zł/miesiąc, domena już zakupiona

### 11. Navigation Structure
- **Header**:
  - Sticky
  - Logo po lewej
  - Menu (Desktop: horyzontalne, Mobile: hamburger)
  - Struktura: Home | O mnie | Konsultacje | Opinie | Kontakt
  - CTA button: "Umów konsultację" (scroll do sekcji konsultacji)
- **Footer**:
  - Dane kontaktowe
  - Ikony social media (Facebook, Instagram - linki dostarczone później)
  - Link do polityki prywatności

### 12. Consultation Booking Form
**Lokalizacja**: Strona "Konsultacje"

**Pola formularza**:
1. Wybór konsultacji (dropdown - 3 opcje) - required
2. Imię i nazwisko - required
3. Email - required (walidacja formatu)
4. Telefon - required (format +48 XXX XXX XXX)
5. Preferowany termin - opcjonalnie (textarea)
6. Dodatkowe informacje - opcjonalnie (textarea, max 500 znaków)
7. Checkbox RODO - required

**Behavior**: Wysyła email do Pauliny z danymi + potwierdzenie do użytkownika

### 13. Contact Form
**Lokalizacja**: Strona "Kontakt"

**Pola formularza**:
1. Imię i nazwisko - required
2. Email - required (walidacja)
3. Telefon - opcjonalnie
4. Wiadomość - required (textarea, max 1000 znaków)
5. Checkbox RODO - required

**Różnica od formularza konsultacji**: Prostszy, bez wyboru konsultacji, krótszy

### 14. Form Validation & Error Handling
**Walidacja**:
- Real-time validation on blur (email, telefon)
- Ogólna walidacja po kliknięciu "Wyślij"

**Error messages**:
- Czerwony tekst pod polem
- Konkretne komunikaty (np. "Podaj prawidłowy adres email")

**States**:
- **Loading**: Spinner/loading indicator podczas wysyłki
- **Success**: Modal lub toast z potwierdzeniem + automatyczny email do użytkownika
- **Error**: Toast z komunikatem "Ups, coś poszło nie tak. Spróbuj ponownie lub napisz na [email]"

### 15. Photo Gallery ("O mnie" page)
**Struktura**:
- 1 główne zdjęcie hero (portret, wysokiej jakości)
- 2-3 dodatkowe zdjęcia (lifestyle/gabinet)

**Optymalizacja**:
- Next.js Image component
- Format: WebP + fallback JPEG
- Responsive srcset
- Blur placeholder (blur-up effect)
- Lazy loading

**UI**: Bez lightbox (niepotrzebny overhead)

### 16. Testimonials/Reviews Section
**Layout**:
- Grid layout: 3 kolumny (desktop), 1 kolumna (mobile)
- 3-6 opinii dla MVP
- Pagination jeśli więcej niż 6

**Struktura karty opinii**:
- Zdjęcie (jeśli dostępne) - opcjonalne
- Cytat/treść opinii (max 500 znaków)
- Imię i nazwisko
- Krótki opis (np. "po 3 miesiącach współpracy")

**Bez**:
- Slidera/carousel (problemy z accessibility)
- Gwiazdkowego ratingu (wymaga zewnętrznego systemu)

### 17. Animations & Interactions
**Subtle animations** (performance + accessibility):
- Fade-in on scroll dla sekcji (Intersection Observer API)
- Hover effects dla buttonów (scale 1.05, shadow)
- Smooth scroll dla anchor links
- Loading skeletons dla dynamicznych sekcji

**Biblioteka**: Framer Motion lub CSS animations

**Unikać**: Parallax, heavy animations, zbędne efekty

### 18. Social Media & External Links
**Social media** (Footer):
- Facebook (link dostarczony później)
- Instagram (link dostarczony później)
- Ikony: Outline style, spójne z design system

**Google Maps**:
- Sekcja na stronie "Kontakt"
- Embedded Google Maps (jeśli gabinet stacjonarny)

**Brak**: Przycisków "Podziel się", WhatsApp button

### 19. Deployment & CI/CD
**Version Control**:
- Git workflow: Feature branches → PR → Merge to master
- Brak preview deployments (sprawdzanie na branchu lokalnie/developersko)

**CI/CD**:
- GitHub Actions
- Auto-deploy przy merge do master
- Automated testing (opcjonalnie)

**Hosting**: Vercel (rekomendowany) - darmowy tier + automatyczny CI/CD, Web Vitals monitoring

---

## Matched Recommendations

### R1: Next.js z Static Generation
**Uzasadnienie**: Świetne SEO, niskie koszty hostingu, skalowalna architektura dla przyszłej logiki biznesowej.

### R2: Mobile-First Design
**Uzasadnienie**: Ponad 60% ruchu w branży medycznej pochodzi z urządzeń mobilnych.

### R3: Propozycja 1 "Naturalna Harmonia" (Moodboard)
**Uzasadnienie**:
- Buduje zaufanie (stonowane, profesjonalne kolory)
- Ciepła paleta (wsparcie, troska)
- Naturalne akcenty (zdrowie, natura)
- Uniwersalna dla szerokiej grupy wiekowej
- Nie jest zbyt medyczna ani zbyt energetyczna

### R4: SendGrid dla Email
**Uzasadnienie**: Darmowy tier (do 100 emaili/dzień), prosta integracja, niezawodność.

### R5: Double Opt-in dla Formularzy
**Uzasadnienie**: Lepsze doświadczenie użytkownika (potwierdzenie), RODO compliance, eliminacja spamu.

### R6: Oddzielne Formularze (Konsultacje vs Kontakt)
**Uzasadnienie**:
- Jasny podział intencji użytkownika
- Łatwiejsze sortowanie emaili dla Pauliny
- Lepsza konwersja (dedykowane CTA)

### R7: Grid Layout dla Opinii (bez slidera)
**Uzasadnienie**:
- Lepsze UX (wszystkie opinie widoczne)
- Accessibility (problemy z carousel dla screen readers)
- Performance (brak dodatkowych bibliotek)

### R8: Subtle Animations
**Uzasadnienie**:
- Lepsza percepcja jakości strony
- Nie zakłócają accessibility
- Niski wpływ na performance

### R9: SEO Lokalne
**Uzasadnienie**: Dietetyk lokalny - kluczowe pozycjonowanie w wyszukiwarce pod lokalne frazy.

### R10: Vercel Hosting + GitHub Actions
**Uzasadnienie**:
- W budżecie (darmowy tier wystarczy dla MVP)
- Automatyczny CI/CD
- Świetna integracja z Next.js
- Web Vitals monitoring

---

## PRD Planning Summary

### Overview
**Dietoterapia** to aplikacja typu wizytówka internetowa dla dietetyk klinicznej Pauliny Maciak. MVP skupia się na statycznej stronie prezentacyjnej z formularzami kontaktowymi (email-based), która w przyszłości zostanie rozbudowana o funkcjonalności e-commerce i system rezerwacji online.

### Primary Problem
Dietetyk Paulina Maciak potrzebuje profesjonalnej obecności w internecie, aby:
1. Prezentować swoją ofertę (3 typy konsultacji)
2. Pozyskiwać nowych klientów (osoby z problemami metabolicznymi, hormonalnymi, chcące schudnąć)
3. Umożliwić łatwy kontakt i umawianie konsultacji
4. Budować wiarygodność poprzez opinie klientów i profesjonalną prezentację

### Key Features (MVP)

#### 1. Strona główna (Home)
- Hero section z krótkim bio Pauliny
- Zdjęcie portretowe (wysokiej jakości)
- Zaproszenie do skorzystania z oferty
- CTA: "Umów konsultację"

#### 2. Strona "O mnie"
- Dłuższa wersja bio Pauliny
- 1 główne zdjęcie hero + 2-3 zdjęcia lifestyle/gabinet
- Opis doświadczenia, specjalizacji
- Podkreślenie wartości: wsparcie w zmianie nawyków, poprawa zdrowia

#### 3. Strona "Konsultacje"
- Lista 3 typów konsultacji (karty)
- Każda karta: tytuł, opis (Lorem ipsum na start), cena
- Formularz "Umów konsultację":
  - Dropdown wyboru konsultacji
  - Imię i nazwisko, email, telefon (+48)
  - Preferowany termin (opcjonalnie)
  - Dodatkowe informacje (opcjonalnie, max 500 znaków)
  - Checkbox RODO
  - Button: "Wyślij zapytanie"
- Po wysłaniu: Email do Pauliny + potwierdzenie do użytkownika

#### 4. Strona "Opinie"
- Grid 3-6 opinii (3 kolumny desktop, 1 mobile)
- Struktura karty: zdjęcie (opcjonalnie) + cytat + imię + kontekst
- Pagination jeśli więcej niż 6 opinii
- Treść: Lorem ipsum (dostarczona później)

#### 5. Strona "Kontakt"
- Formularz kontaktowy:
  - Imię i nazwisko, email
  - Telefon (opcjonalnie)
  - Wiadomość (max 1000 znaków)
  - Checkbox RODO
  - Button: "Wyślij wiadomość"
- Google Maps (embedded) - lokalizacja gabinetu
- Dane kontaktowe (email, telefon)

#### 6. Strona "Polityka prywatności"
- Treść RODO/GDPR compliance (Lorem ipsum, dostarczona później)
- Link w footer

#### 7. Nawigacja i Layout
- **Header** (sticky):
  - Logo (lewa strona)
  - Menu: Home | O mnie | Konsultacje | Opinie | Kontakt
  - CTA button: "Umów konsultację"
  - Mobile: Hamburger menu
- **Footer**:
  - Dane kontaktowe
  - Social media: Facebook, Instagram
  - Link: Polityka prywatności
  - Copyright

### User Stories

#### US1: Potencjalny klient szuka dietetyka
**Jako** osoba szukająca dietetyka klinicznego
**Chcę** szybko poznać doświadczenie i specjalizację Pauliny
**Aby** ocenić, czy jest odpowiednią osobą do pomocy w moim problemie

**Acceptance Criteria**:
- Strona główna wyświetla krótkie bio w ciągu 2 sekund
- Na stronie "O mnie" znajduje się pełny opis doświadczenia
- Zdjęcia Pauliny budują zaufanie i profesjonalizm

#### US2: Klient chce umówić konsultację
**Jako** osoba zainteresowana konsultacją
**Chcę** szybko i łatwo wysłać zapytanie o umówienie wizyty
**Aby** nie musieć samodzielnie szukać kontaktu i pisać emaila

**Acceptance Criteria**:
- Przycisk CTA "Umów konsultację" jest widoczny w header
- Formularz zawiera wszystkie niezbędne pola
- Po wysłaniu otrzymuję potwierdzenie (modal + email)
- Formularz waliduje błędy i pokazuje jasne komunikaty

#### US3: Klient chce poznać opinie innych
**Jako** potencjalny klient
**Chcę** przeczytać opinie innych osób
**Aby** zwiększyć zaufanie do usług Pauliny

**Acceptance Criteria**:
- Strona "Opinie" wyświetla minimum 3 opinie
- Każda opinia zawiera: treść, imię, opcjonalnie zdjęcie
- Layout jest czytelny na mobile i desktop

#### US4: Użytkownik mobilny przegląda stronę
**Jako** użytkownik smartfona
**Chcę** wygodnie przeglądać stronę na małym ekranie
**Aby** bez frustracji zapoznać się z ofertą

**Acceptance Criteria**:
- Strona jest w pełni responsywna (mobile-first)
- Menu hamburger działa poprawnie
- Formularze są łatwe do wypełnienia na touch screen
- Zdjęcia są zoptymalizowane (szybkie ładowanie)

#### US5: Klient ma pytanie ogólne
**Jako** osoba z ogólnym pytaniem (nie konkretna konsultacja)
**Chcę** wysłać wiadomość do Pauliny
**Aby** uzyskać odpowiedź bez konieczności wybierania typu konsultacji

**Acceptance Criteria**:
- Strona "Kontakt" ma uproszczony formularz
- Formularz nie wymusza wyboru konsultacji
- Email trafia do Pauliny z oznaczeniem "Kontakt ogólny"

### Technical Architecture

#### Frontend
- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: TailwindCSS lub CSS Modules
- **Animations**: Framer Motion
- **Forms**: React Hook Form + Zod (walidacja)
- **Image optimization**: Next.js Image component

#### Backend (MVP - minimal)
- **Email**: SendGrid API
- **API Routes**: Next.js API routes dla form submission
- **Validation**: Server-side validation (Zod schemas)

#### Infrastructure
- **Hosting**: Vercel (darmowy tier)
- **Domain**: paulinamaciak.pl
- **CI/CD**: GitHub Actions (deploy on merge to master)
- **Version Control**: Git (feature branches → master)

#### Future Considerations (post-MVP)
- Database (Postgres/MongoDB) dla kalendarza i sklepu
- Authentication system (NextAuth.js)
- Payment gateway (Stripe/Przelewy24)
- Admin panel dla Pauliny

### Design System
**Paleta kolorów** (Propozycja 1 "Naturalna Harmonia"):
- Primary: `#4A7C59` (głęboka zieleń)
- Secondary: `#E8B4A8` (brzoskwiniowy)
- Accent: `#F4A460` (złoty pomarańczowy)
- Neutral Dark: `#2C3E3A`
- Neutral Light: `#F9F6F3`
- White: `#FFFFFF`

**Typografia**:
- Nagłówki: Montserrat (600, 700)
- Body: Open Sans (400, 600)

**Spacing**: 8px grid system
**Border radius**: 8-16px (zaokrąglone rogi)
**Shadows**: Miękkie, subtle

### Success Criteria (Post-Launch)
Mimo że w MVP nie mierzymy aktywnie, warto zdefiniować potencjalne wskaźniki:

1. **Konwersja**: Min. 5% odwiedzających wypełnia formularz
2. **Performance**: Lighthouse score > 90 (wszystkie kategorie)
3. **SEO**: Pozycja w top 10 Google dla "dietetyk [miasto]" w ciągu 3 miesięcy
4. **UX**: Średni czas na stronie > 2 minuty
5. **Technical**: Zero critical bugs w pierwszym miesiącu

### Quality Assurance
- **Cross-browser testing**: Chrome, Safari, Firefox, Edge
- **Device testing**: iPhone (Safari), Android (Chrome), Desktop
- **Accessibility**: WCAG 2.1 Level AA
- **Performance**: Core Web Vitals (LCP < 2.5s, FID < 100ms, CLS < 0.1)
- **SEO**: Lighthouse audit, manual testing

### Content Strategy
**MVP**:
- Wszystkie treści: Lorem ipsum
- Logo: `.ai/logo.png` (dostarczone)
- Zdjęcia: Placeholders (dostarczone później przez Paulinę)

**Post-MVP** (dostarczone przez Paulinę):
- Bio (krótkie i długie)
- Opisy 3 konsultacji + ceny
- 3-6 opinii klientów
- Dane kontaktowe
- Linki social media
- Treść polityki prywatności
- Zdjęcia: portret + lifestyle/gabinet

### Timeline & Milestones
**Total: 6 tygodni**

**Tydzień 1-2: Design & Planning**
- Finalizacja wyboru palety kolorów
- Wireframes (low-fidelity)
- Mockupy (high-fidelity) w Figma
- Approval od Pauliny

**Tydzień 3-5: Development**
- Setup projektu (Next.js + TypeScript + TailwindCSS)
- Implementacja komponentów (Header, Footer, Forms)
- Implementacja stron (Home, O mnie, Konsultacje, Opinie, Kontakt, Polityka)
- Integracja SendGrid
- Responsywność (mobile + desktop)
- Animacje

**Tydzień 6: Testing & Deployment**
- Cross-browser testing
- Device testing
- Accessibility audit
- Performance optimization
- SEO setup (meta tags, sitemap, robots.txt)
- Deploy na Vercel
- DNS setup (paulinamaciak.pl)
- Final approval

### Risk Assessment
1. **Brak treści od Pauliny**: Mitigation: Lorem ipsum w MVP, deadline na dostarczenie treści przed launch
2. **Problemy z SendGrid**: Mitigation: Backup plan (Nodemailer + Gmail SMTP)
3. **Performance issues**: Mitigation: Image optimization, lazy loading, code splitting
4. **SEO niewidoczność**: Mitigation: Technical SEO od początku, Google Search Console monitoring
5. **RODO compliance**: Mitigation: Konsultacja z prawnikiem, gotowe szablony polityki prywatności

---

## Unresolved Issues

### 1. Email Configuration
**Pytanie**: Jaki jest dokładny adres email Pauliny, na który mają trafiać formularze?
**Wymagane do**: Konfiguracji SendGrid, wyświetlania w sekcji Kontakt, error messages

### 2. Social Media Links
**Pytanie**: Jakie są dokładne linki do profili Facebook i Instagram?
**Wymagane do**: Footer social media icons

### 3. Lokalizacja Gabinetu
**Pytanie**: Jaki jest dokładny adres gabinetu dla Google Maps? Czy gabinet jest stacjonarny, czy konsultacje tylko online?
**Wymagane do**: Embedded Google Maps na stronie Kontakt, SEO lokalne

### 4. Numer Telefonu Kontaktowy
**Pytanie**: Jaki numer telefonu ma być wyświetlany na stronie (jeśli w ogóle)?
**Wymagane do**: Sekcja Kontakt, Footer

### 5. Szczegóły Konsultacji (Post-MVP)
**Pytanie**: Jakie są nazwy 3 typów konsultacji i ceny?
**Wymagane do**: Wypełnienia treści przed launch (obecnie Lorem ipsum)
**Status**: Dostarczone później przez Paulinę

### 6. Treść Bio (Post-MVP)
**Pytanie**: Krótka i długa wersja bio Pauliny?
**Wymagane do**: Strona główna (krótka) i strona "O mnie" (długa)
**Status**: Dostarczone później przez Paulinę

### 7. Opinie Klientów (Post-MVP)
**Pytanie**: 3-6 opinii klientów (tekst + imię + opcjonalnie zdjęcie)?
**Wymagane do**: Strona "Opinie"
**Status**: Dostarczone później przez Paulinę

### 8. Zdjęcia (Post-MVP)
**Pytanie**: Zdjęcie portretowe hero + 2-3 zdjęcia lifestyle/gabinet?
**Wymagane do**: Strona główna i "O mnie"
**Status**: Dostarczone później przez Paulinę

### 9. Polityka Prywatności - Treść Prawna
**Pytanie**: Czy Paulina skonsultuje treść polityki prywatności z prawnikiem?
**Wymagane do**: Compliance z RODO dla usług zdrowotnych
**Status**: Dostarczone później przez Paulinę

### 10. Analytics & Tracking
**Pytanie**: Czy Paulina ma już konto Google Analytics? Jeśli nie, kto je utworzy?
**Wymagane do**: Tracking ID dla Google Analytics 4
**Status**: Do ustalenia przed launch

### 11. Design System - Finalna Decyzja
**Pytanie**: Która propozycja z moodboard.md została wybrana? (Rekomendacja: Propozycja 1)
**Wymagane do**: Rozpoczęcia prac nad mockupami
**Status**: Do potwierdzenia przez Paulinę

### 12. Cookie Consent Banner
**Pytanie**: Czy potrzebny jest cookie consent banner (ze względu na Google Analytics)?
**Rekomendacja**: TAK - wymagane przez RODO
**Status**: Do ustalenia implementacji (biblioteka: react-cookie-consent lub custom)

---

## Next Steps

1. **Design Approval**: Paulina wybiera paletę kolorów z moodboard.md
2. **Content Collection**: Zebrane podstawowe dane (email, telefon, social media, adres)
3. **Mockups Creation**: Przygotowanie high-fidelity mockupów w Figma (opcjonalnie)
4. **Development Start**: Setup projektu Next.js + TypeScript
5. **PRD Finalization**: Utworzenie pełnego dokumentu PRD na podstawie tego podsumowania

---

**Document Version**: 1.0
**Last Updated**: 2025-10-18
**Status**: Planning Complete - Ready for PRD Creation
