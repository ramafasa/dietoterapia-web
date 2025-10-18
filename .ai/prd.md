# Dokument wymagań produktu (PRD) - Dietoterapia - Paulina Maciak

Wersja: 1.0
Data: 2025-10-18
Status: Gotowy do rozwoju

---

## 1. Przegląd produktu

### 1.1 Nazwa produktu
Dietoterapia - Strona wizytówka dla dietetyka klinicznego Pauliny Maciak

### 1.2 Cel produktu
Aplikacja Dietoterapia to profesjonalna strona internetowa typu wizytówka, która służy jako:
- Główny kanał obecności w internecie dla dietetyka klinicznego Pauliny Maciak
- Narzędzie do prezentacji oferty konsultacji dietetycznych
- Platforma umożliwiająca pozyskiwanie nowych klientów
- System kontaktu i wstępnego umawiania konsultacji

### 1.3 Zakres MVP (Minimum Viable Product)
Pierwsza faza projektu skupia się na stworzeniu statycznej strony internetowej z funkcjonalnością formularzy email-based. MVP obejmuje:
- 6 głównych stron: Home, O mnie, Konsultacje, Opinie, Kontakt, Polityka prywatności
- Responsywny design (mobile-first)
- System formularzy kontaktowych z integracją email (SendGrid)
- Prezentacja 3 typów konsultacji
- Sekcja opinii klientów
- Zgodność z RODO/GDPR

### 1.4 Grupa docelowa
- Osoby poszukujące wsparcia w redukcji masy ciała
- Pacjenci z chorobami metabolicznymi (cukrzyca, insulinooporność)
- Osoby z zaburzeniami hormonalnymi (PCOS, problemy tarczycy)
- Pacjenci chcący poprawić ogólny stan zdrowia poprzez zmianę nawyków żywieniowych
- Osoby szukające profesjonalnego wsparcia dietetyka klinicznego

### 1.5 Stack technologiczny

Frontend:
- Framework: Next.js 14+ (App Router)
- Język: TypeScript
- Styling: TailwindCSS lub CSS Modules
- Animacje: Framer Motion
- Formularze: React Hook Form + Zod (walidacja)
- Optymalizacja obrazów: Next.js Image component

Backend (MVP - minimalny):
- Email: SendGrid API
- API Routes: Next.js API routes dla wysyłki formularzy
- Walidacja: Server-side validation (Zod schemas)

Infrastruktura:
- Hosting: Vercel (darmowy tier)
- Domena: paulinamaciak.pl
- CI/CD: GitHub Actions (deploy przy merge do master)
- Version Control: Git (feature branches → master)
- 
---

## 2. Problem użytkownika

### 2.1 Główny problem biznesowy
Dietetyk kliniczna Paulina Maciak prowadzi praktykę dietetyczną "Dietoterapia" i potrzebuje profesjonalnej obecności w internecie, aby:

1. Zwiększyć widoczność w wyszukiwarkach internetowych
   - Brak strony internetowej uniemożliwia pozycjonowanie w Google
   - Potencjalni klienci szukający "dietetyk Brzeziny" lub "dietetyk online" nie znajdują Pauliny

2. Prezentować ofertę w profesjonalny sposób
   - Social media (Facebook, Instagram) nie są wystarczające do szczegółowej prezentacji usług
   - Brak centralnego miejsca z pełną ofertą konsultacji, cenami i szczegółami

3. Ułatwić klientom kontakt i umawianie wizyt
   - Klienci muszą samodzielnie szukać numeru telefonu lub emaila
   - Brak standardowego procesu zbierania danych pacjentów przed konsultacją

4. Budować wiarygodność i zaufanie
   - Potencjalni klienci nie mają dostępu do opinii innych pacjentów
   - Brak profesjonalnej prezentacji doświadczenia i kwalifikacji Pauliny

### 2.2 Problemy użytkowników końcowych (pacjentów)

Problem 1: Trudność w znalezieniu odpowiedniego dietetyka
- Osoby szukające dietetyka klinicznego nie wiedzą, jak znaleźć profesjonalistę w swojej okolicy
- Brak informacji o specjalizacji i doświadczeniu utrudnia podjęcie decyzji
- Porównywanie różnych dietetyków wymaga przeglądania wielu źródeł

Problem 2: Skomplikowany proces umawiania konsultacji
- Konieczność samodzielnego pisania emaili lub dzwonienia
- Brak jasnych informacji o dostępnych typach konsultacji i cenach
- Niepewność co do dalszych kroków po pierwszym kontakcie

Problem 3: Brak transparentności oferty
- Potencjalni klienci nie wiedzą, czego mogą się spodziewać
- Brak jasnych opisów konsultacji, czasu trwania, cen
- Niepewność czy dany dietetyk specjalizuje się w ich problemie zdrowotnym

Problem 4: Trudność w weryfikacji kompetencji
- Brak dostępu do opinii innych pacjentów
- Brak informacji o wykształceniu i doświadczeniu dietetyka
- Niskie zaufanie do nowych usługodawców

### 2.3 Jak produkt rozwiązuje te problemy

Dla Pauliny (właścicielki):
- Profesjonalna strona internetowa zwiększa widoczność w Google (SEO lokalne)
- Centralne miejsce prezentacji pełnej oferty i cen
- Automatyzacja zbierania danych pacjentów przez formularze
- Budowanie marki osobistej i wiarygodności

Dla pacjentów:
- Łatwy dostęp do informacji o usługach i cenach
- Prosty proces umawiania konsultacji (formularz online)
- Dostęp do opinii innych pacjentów
- Przejrzysty opis doświadczenia i specjalizacji dietetyka
- Możliwość kontaktu bez konieczności dzwonienia

---

## 3. Wymagania funkcjonalne

### 3.1 Struktura nawigacji

3.1.1 Header (górna nawigacja)
- Logo Dietoterapia (po lewej stronie)
- Menu główne: Home | O mnie | Konsultacje | Opinie | Kontakt
- Przycisk CTA "Umów konsultację" (scroll do sekcji konsultacji)
- Sticky header (pozostaje widoczny przy scrollowaniu)
- Responsywne menu hamburger na urządzeniach mobilnych

3.1.2 Footer (stopka)
- Dane kontaktowe:
  - Email: dietoterapia@paulinamaciak.pl
  - Telefon: +48 518 036 686
  - Adres: Gaj 5, 95-060 Brzeziny
- Ikony social media:
  - Facebook: https://www.facebook.com/paulina.maciak.dietoterapia
  - Instagram: @paulinamaciak_dietetyk
- Link do polityki prywatności
- Copyright notice

### 3.2 Strona główna (Home)

3.2.1 Hero section
- Główne zdjęcie portretowe Pauliny (wysokiej jakości)
- Krótkie bio (maksymalnie 200-300 znaków):
  - Imię i nazwisko
  - Tytuł: "Dietetyk kliniczna"
  - Krótki opis specjalizacji
- Główny CTA button: "Umów konsultację"
- Optymalizacja obrazu: Next.js Image, WebP + JPEG fallback, blur placeholder

3.2.2 Sekcja zaproszenie do oferty
- Krótki opis wartości, jakie oferuje Paulina
- 3-4 kluczowe korzyści (ikony + tekst)
- Dodatkowy CTA: "Zobacz ofertę konsultacji"

### 3.3 Strona "O mnie"

3.3.1 Główna sekcja bio
- Rozszerzony opis doświadczenia (600-800 znaków):
  - Wykształcenie i kwalifikacje
  - Lata doświadczenia
  - Specjalizacja (choroby metaboliczne, hormonalne, redukcja masy ciała)
  - Filozofia pracy (wsparcie w zmianie nawyków)

3.3.2 Galeria zdjęć
- 1 główne zdjęcie hero (portret)
- 2-3 dodatkowe zdjęcia (lifestyle, gabinet, podczas pracy)
- Optymalizacja:
  - Next.js Image component
  - Responsive srcset
  - Lazy loading
  - Blur placeholder

### 3.4 Strona "Konsultacje"

3.4.1 Lista konsultacji (3 karty)
Każda karta zawiera:
- Tytuł konsultacji
- Opis (200-300 znaków)
- Czas trwania
- Cena
- Przycisk CTA: "Wybierz tę konsultację"

Typy konsultacji:
1. Konsultacja diagnostyczna
2. Konsultacja kontrolna
3. Konsultacja kompleksowa

3.4.2 Formularz "Umów konsultację"

Pola formularza:
1. Wybór konsultacji (dropdown select - required)
   - Opcje: Diagnostyczna, Kontrolna, Kompleksowa

2. Imię i nazwisko (text input - required)
   - Walidacja: min 2 znaki

3. Email (email input - required)
   - Walidacja formatu email
   - Real-time validation on blur

4. Telefon (tel input - required)
   - Format: +48 XXX XXX XXX
   - Walidacja formatu polskiego numeru telefonu

5. Preferowany termin (textarea - opcjonalnie)
   - Placeholder: "np. poniedziałek 10:00 lub wtorek po 15:00"
   - Max 200 znaków

6. Dodatkowe informacje (textarea - opcjonalnie)
   - Placeholder: "Informacje o problemach zdrowotnych, celach"
   - Max 500 znaków

7. Checkbox RODO (checkbox - required)
   - Tekst: "Akceptuję politykę prywatności i wyrażam zgodę na przetwarzanie danych osobowych"
   - Link do polityki prywatności

Przycisk: "Wyślij zapytanie"

Funkcjonalność po wysłaniu:
- Walidacja wszystkich pól (client-side + server-side)
- Loading state (spinner)
- Wysłanie emaila do Pauliny z danymi
- Wysłanie emaila potwierdzenia do użytkownika
- Modal/toast z komunikatem sukcesu
- Czyszczenie formularza

Email do Pauliny:
- Subject: "Nowe zapytanie o konsultację: [Typ konsultacji]"
- Treść: wszystkie dane z formularza

Email do użytkownika:
- Subject: "Potwierdzenie wysłania zapytania - Dietoterapia"
- Treść: potwierdzenie otrzymania, informacja że Paulina odpowie w ciągu 24h

Error handling:
- Wyświetlanie błędów walidacji pod każdym polem (czerwony tekst)
- Toast z komunikatem błędu przy problemach z wysyłką
- Komunikat: "Ups, coś poszło nie tak. Spróbuj ponownie lub napisz na dietoterapia@paulinamaciak.pl"

### 3.5 Strona "Opinie"

3.5.1 Grid opinii
- Layout: 3 kolumny (desktop), 1 kolumna (mobile)
- Liczba opinii: 3-6 dla MVP
- Pagination jeśli więcej niż 6 opinii

3.5.2 Struktura pojedynczej opinii (karta)
- Zdjęcie klienta (opcjonalnie, avatar placeholder jeśli brak)
- Treść opinii (cytat, max 500 znaków)
- Imię i nazwisko
- Kontekst (np. "po 3 miesiącach współpracy")

Treść: Lorem ipsum w MVP (dostarczone później)

### 3.6 Strona "Kontakt"

3.6.1 Formularz kontaktowy

Pola formularza:
1. Imię i nazwisko (text input - required)
   - Walidacja: min 2 znaki

2. Email (email input - required)
   - Walidacja formatu email
   - Real-time validation on blur

3. Telefon (tel input - opcjonalnie)
   - Format: +48 XXX XXX XXX
   - Walidacja formatu jeśli wypełnione

4. Wiadomość (textarea - required)
   - Max 1000 znaków
   - Counter znaków

5. Checkbox RODO (checkbox - required)
   - Tekst: "Akceptuję politykę prywatności i wyrażam zgodę na przetwarzanie danych osobowych"
   - Link do polityki prywatności

Przycisk: "Wyślij wiadomość"

Funkcjonalność po wysłaniu:
- Walidacja wszystkich pól
- Loading state
- Wysłanie emaila do Pauliny
- Wysłanie emaila potwierdzenia do użytkownika
- Modal/toast z komunikatem sukcesu

Email do Pauliny:
- Subject: "Nowa wiadomość kontaktowa - Dietoterapia"
- Treść: wszystkie dane z formularza

Email do użytkownika:
- Subject: "Potwierdzenie wysłania wiadomości - Dietoterapia"
- Treść: potwierdzenie otrzymania

3.6.2 Sekcja danych kontaktowych
- Email: dietoterapia@paulinamaciak.pl (klikalne mailto:)
- Telefon: +48 518 036 686 (klikalne tel:)
- Adres: Gaj 5, 95-060 Brzeziny

3.6.3 Google Maps (embedded)
- Lokalizacja: Gaj 5, 95-060 Brzeziny
- Embedded iframe z Google Maps
- Responsive

3.6.4 Informacja o trybie konsultacji
- Tekst: "Konsultacje stacjonarne i online"

### 3.7 Strona "Polityka prywatności"

3.7.1 Treść prawna RODO/GDPR
- Lorem ipsum w MVP (dostarczona później)
- Konsultacja z prawnikiem przed finalnym contentem
- Typowe sekcje:
  - Administrator danych
  - Zakres zbieranych danych
  - Cel przetwarzania danych
  - Podstawa prawna
  - Odbiorcy danych
  - Okres przechowywania danych
  - Prawa użytkowników
  - Pliki cookies

### 3.8 Cookie Consent Banner

3.8.1 Implementacja
- Biblioteka: react-cookie-consent lub custom component
- Pozycja: na dole ekranu
- Przyciski:
  - "Akceptuję wszystkie"
  - "Ustawienia cookies"
  - "Odrzuć opcjonalne"

3.8.2 Kategorie cookies
- Niezbędne (always on): funkcjonalność strony
- Analityczne (optional): Google Analytics
- Marketingowe (optional): przyszłe kampanie remarketingowe

### 3.9 Wymagania techniczne

3.9.1 Responsywność
- Mobile-first approach
- Breakpoints:
  - Mobile: < 768px
  - Tablet: 768px - 1024px (opcjonalnie)
  - Desktop: > 1024px
- Touch-friendly (min 44x44px dla elementów klikanych)

3.9.2 Performance
- Core Web Vitals:
  - LCP (Largest Contentful Paint): < 2.5s
  - FID (First Input Delay): < 100ms
  - CLS (Cumulative Layout Shift): < 0.1
- Lighthouse score: > 90 we wszystkich kategoriach
- Image optimization (WebP, lazy loading, blur placeholder)
- Code splitting
- Tree shaking

3.9.3 SEO

Technical SEO:
- Meta tagi (title, description) dla każdej strony
- Open Graph tags (og:title, og:description, og:image)
- Sitemap.xml
- Robots.txt
- Canonical URLs
- Semantic HTML (header, nav, main, section, article, footer)

Schema markup:
- LocalBusiness schema
- Person schema (dla Pauliny)
- Service schema (dla konsultacji)

SEO lokalne:
- Optymalizacja pod frazy:
  - "dietetyk Brzeziny"
  - "dietetyk kliniczny online"
  - "dietetyk metaboliczny"
  - "poradnia dietetyczna Brzeziny"
- Google Business Profile integration
- Google Search Console setup

3.9.4 Accessibility
- WCAG 2.1 Level AA compliance
- Semantic HTML
- ARIA labels gdzie potrzebne
- Keyboard navigation
- Focus indicators
- Alt text dla obrazów
- Kontrast kolorów (min 4.5:1 dla tekstu)
- Screen reader friendly

3.9.5 Animacje i interakcje

Subtle animations:
- Fade-in on scroll dla sekcji (Intersection Observer API)
- Hover effects dla buttonów:
  - Scale 1.05
  - Shadow transition
- Smooth scroll dla anchor links
- Loading skeletons dla dynamicznych sekcji

Biblioteka: Framer Motion

Unikać:
- Parallax effects
- Heavy animations
- Zbędne efekty wizualne

3.9.6 Analytics
- Google Analytics 4
- Tracking events:
  - Form submissions (konsultacje, kontakt)
  - CTA clicks
  - Page views
  - Time on page
  - Bounce rate

---

## 4. Granice produktu

### 4.1 Co jest w zakresie MVP

W zakresie:
- Statyczna strona wizytówka (6 podstron)
- Formularze kontaktowe z wysyłką emaili
- Responsywny design (mobile + desktop)
- Podstawowe animacje
- SEO optimization
- RODO/GDPR compliance (polityka prywatności, cookie consent)
- Google Maps integration
- Social media links
- Lorem ipsum content (zastąpiony prawdziwymi treściami przed launch)
- Stock photos (zastąpione prawdziwymi zdjęciami przed launch)

### 4.2 Co jest poza zakresem MVP

Poza zakresem (przyszłe fazy):
- System rezerwacji online z kalendarzem
- Panel administracyjny dla Pauliny
- Edycja treści przez Paulinę (CMS)
- Sklep internetowy (e-commerce)
- System płatności online (Stripe, Przelewy24)
- Baza danych
- System uwierzytelniania użytkowników
- Konta pacjentów
- Historia wizyt pacjentów
- System dokumentacji medycznej
- Integracja z systemem fakturowania
- Blog dietetyczny
- Kalkulatory dietetyczne
- Baza przepisów
- Plany żywieniowe online
- Video consultations
- Chat/messaging system
- Mobile app
- Multilanguage support (tylko polska wersja w MVP)
- A/B testing
- Advanced analytics dashboards
- Email marketing automation
- Newsletter system
- Recenzje Google/Facebook integration
- Booking reminders (SMS/email)

### 4.3 Założenia i zależności

Założenia:
- Paulina dostarczy finalne treści (bio, opisy konsultacji, opinie) przed launch
- Paulina dostarczy profesjonalne zdjęcia przed launch
- Treść polityki prywatności będzie skonsultowana z prawnikiem
- Domena paulinamaciak.pl jest już zarejestrowana i dostępna
- Email dietoterapia@paulinamaciak.pl jest już skonfigurowany
- SendGrid free tier (100 emaili/dzień) jest wystarczający dla MVP

Zależności zewnętrzne:
- SendGrid API (wysyłka emaili)
- Vercel hosting
- Google Maps API
- Google Analytics
- DNS provider dla domeny

Ryzyka:
- Opóźnienie w dostarczeniu contentu przez Paulinę → Mitigation: Lorem ipsum w MVP
- Problemy z SendGrid → Mitigation: Backup plan (Nodemailer + Gmail SMTP)
- Performance issues → Mitigation: Image optimization, lazy loading, code splitting
- SEO niewidoczność → Mitigation: Technical SEO od początku, Search Console monitoring
- RODO non-compliance → Mitigation: Konsultacja z prawnikiem, gotowe szablony

### 4.4 Ograniczenia techniczne

Ograniczenia MVP:
- Brak automatycznego systemu rezerwacji (tylko email-based booking)
- Brak możliwości edycji treści przez Paulinę (wymaga wsparcia technicznego)
- Brak systemu płatności (opłaty bezpośrednio u Pauliny)
- Ograniczenia SendGrid free tier: 100 emaili/dzień
- Brak backup planu dla formularzy jeśli SendGrid nie działa

### 4.5 Użytkownicy systemu

W MVP:
- Potencjalni pacjenci (odwiedzający stronę)
- Paulina (odbiorca emaili z formularzy)

Brak:
- Panel admin dla Pauliny
- Konta pacjentów
- Role i uprawnienia

---

## 5. Historyjki użytkowników

### US-001: Wyszukiwanie dietetyka w Google

ID: US-001
Priorytet: Wysoki
Epic: SEO i widoczność

Jako: Osoba szukająca dietetyka klinicznego w swojej okolicy
Chcę: Znaleźć stronę Pauliny w wynikach wyszukiwania Google
Aby: Poznać jej ofertę i umówić się na konsultację

Kryteria akceptacji:
- Strona jest zindeksowana w Google Search Console
- Meta tagi (title, description) są unikalne dla każdej podstrony
- Sitemap.xml jest wygenerowany i dostępny pod /sitemap.xml
- Robots.txt jest skonfigurowany poprawnie
- Schema markup LocalBusiness jest zaimplementowany
- Strona ładuje się w < 3 sekundy na mobile
- Lighthouse SEO score > 90

Testy:
- Ręczne wyszukiwanie "dietetyk Brzeziny" w Google
- Sprawdzenie indexowania w Google Search Console
- Lighthouse audit SEO

---

### US-002: Pierwsze wrażenie - strona główna

ID: US-002
Priorytet: Wysoki
Epic: UX i prezentacja

Jako: Potencjalny klient odwiedzający stronę po raz pierwszy
Chcę: Szybko poznać kim jest Paulina i czym się zajmuje
Aby: Ocenić, czy chcę skorzystać z jej usług

Kryteria akceptacji:
- Hero section z dużym zdjęciem Pauliny jest widoczne above the fold
- Krótkie bio (200-300 znaków) jest czytelne i jasne
- Tytuł "Dietetyk kliniczna" jest widoczny
- Przycisk CTA "Umów konsultację" jest widoczny i wyróżniony
- Sekcja z 3-4 kluczowymi korzyściami jest prezentowana poniżej hero
- Strona ładuje się w < 2.5 sekundy (LCP)
- Design jest spójny z paletą "Naturalna Harmonia"

Testy:
- Test użyteczności z 3-5 osobami
- Lighthouse Performance score > 90
- Visual regression testing

---

### US-003: Poznanie doświadczenia dietetyka

ID: US-003
Priorytet: Wysoki
Epic: UX i prezentacja

Jako: Osoba szukająca dietetyka klinicznego
Chcę: Przeczytać szczegółowe informacje o wykształceniu, doświadczeniu i specjalizacji Pauliny
Aby: Upewnić się, że jest kompetentną osobą do pomocy w moim problemie zdrowotnym

Kryteria akceptacji:
- Strona "O mnie" zawiera rozszerzony opis bio (600-800 znaków)
- Bio wymienia wykształcenie i kwalifikacje
- Bio wymienia lata doświadczenia
- Bio wymienia specjalizacje (metaboliczne, hormonalne, redukcja wagi)
- Bio opisuje filozofię pracy (wsparcie w zmianie nawyków)
- Galeria zawiera 1 główne zdjęcie hero + 2-3 dodatkowe zdjęcia
- Wszystkie zdjęcia są zoptymalizowane (WebP + JPEG fallback)
- Zdjęcia mają blur placeholder podczas ładowania

Testy:
- Ręczny przegląd treści
- Test responsywności na mobile i desktop
- Test performance (wszystkie obrazy < 200KB)

---

### US-004: Przeglądanie oferty konsultacji

ID: US-004
Priorytet: Wysoki
Epic: Prezentacja oferty

Jako: Potencjalny klient zainteresowany konsultacją dietetyczną
Chcę: Zobaczyć listę dostępnych konsultacji z opisami i cenami
Aby: Wybrać odpowiednią konsultację dla moich potrzeb

Kryteria akceptacji:
- Strona "Konsultacje" wyświetla 3 karty konsultacji
- Każda karta zawiera: tytuł, opis (200-300 znaków), czas trwania, cenę
- 3 typy konsultacji: Diagnostyczna, Kontrolna, Kompleksowa
- Każda karta ma wyróżniony przycisk CTA "Wybierz tę konsultację"
- Layout: 3 kolumny na desktop, 1 kolumna na mobile
- Design kart jest spójny z design system
- Ceny są wyraźnie widoczne

Testy:
- Visual testing na różnych rozdzielczościach
- Sprawdzenie czytelności na mobile
- A/B test układu kart (opcjonalnie)

---

### US-005: Umówienie konsultacji przez formularz

ID: US-005
Priorytet: Krytyczny
Epic: Formularze i konwersja

Jako: Osoba zainteresowana konkretną konsultacją
Chcę: Wypełnić formularz zapytania o konsultację bezpośrednio na stronie
Aby: Nie musieć samodzielnie pisać emaila ani dzwonić

Kryteria akceptacji:
- Formularz zawiera następujące pola:
  - Dropdown wyboru konsultacji (required)
  - Imię i nazwisko (required, min 2 znaki)
  - Email (required, walidacja formatu)
  - Telefon (required, format +48 XXX XXX XXX)
  - Preferowany termin (opcjonalnie, textarea, max 200 znaków)
  - Dodatkowe informacje (opcjonalnie, textarea, max 500 znaków)
  - Checkbox RODO (required)
- Przycisk "Wyślij zapytanie" jest wyraźnie widoczny
- Real-time walidacja dla email i telefon (on blur)
- Błędy walidacji wyświetlają się pod polami (czerwony tekst)
- Loading state (spinner) jest widoczny podczas wysyłki
- Po sukcesie wyświetla się modal/toast z potwierdzeniem
- Formularz się czyści po wysłaniu
- Email jest wysyłany do Pauliny z wszystkimi danymi
- Email potwierdzenia jest wysyłany do użytkownika
- Error handling: toast z komunikatem błędu jeśli wysyłka się nie powiedzie

Testy:
- Test walidacji (puste pola, niepoprawny email, niepoprawny telefon)
- Test wysyłki formularza (end-to-end)
- Test otrzymania emaila przez Paulinę
- Test otrzymania emaila potwierdzenia przez użytkownika
- Test responsywności formularza na mobile
- Test accessibility (keyboard navigation, screen readers)

---

### US-006: Przeczytanie opinii innych klientów

ID: US-006
Priorytet: Średni
Epic: Social proof

Jako: Potencjalny klient rozważający skorzystanie z usług
Chcę: Przeczytać opinie innych pacjentów
Aby: Zwiększyć zaufanie do Pauliny i jej kompetencji

Kryteria akceptacji:
- Strona "Opinie" wyświetla grid opinii
- Layout: 3 kolumny na desktop, 1 kolumna na mobile
- Liczba opinii: 3-6 dla MVP
- Każda karta opinii zawiera:
  - Zdjęcie klienta (opcjonalnie, avatar placeholder jeśli brak)
  - Treść opinii (max 500 znaków)
  - Imię i nazwisko
  - Kontekst (np. "po 3 miesiącach współpracy")
- Pagination jest widoczna jeśli więcej niż 6 opinii
- Design kart jest spójny i czytelny

Testy:
- Visual testing różnych długości opinii
- Test responsywności gridu
- Test pagination (jeśli dotyczy)

---

### US-007: Wysłanie ogólnej wiadomości kontaktowej

ID: US-007
Priorytet: Wysoki
Epic: Formularze i konwersja

Jako: Osoba z ogólnym pytaniem (nie dotyczącym konkretnej konsultacji)
Chcę: Wysłać wiadomość do Pauliny przez prosty formularz
Aby: Uzyskać odpowiedź bez konieczności wybierania typu konsultacji

Kryteria akceptacji:
- Strona "Kontakt" zawiera uproszczony formularz
- Formularz zawiera pola:
  - Imię i nazwisko (required, min 2 znaki)
  - Email (required, walidacja formatu)
  - Telefon (opcjonalnie, walidacja formatu jeśli wypełnione)
  - Wiadomość (required, textarea, max 1000 znaków, counter znaków)
  - Checkbox RODO (required)
- Przycisk "Wyślij wiadomość"
- Real-time walidacja dla email (on blur)
- Błędy walidacji pod polami
- Loading state podczas wysyłki
- Modal/toast z potwierdzeniem sukcesu
- Email wysyłany do Pauliny z treścią wiadomości
- Email potwierdzenia wysyłany do użytkownika
- Error handling

Testy:
- Test walidacji
- Test wysyłki formularza (end-to-end)
- Test otrzymania emaila przez Paulinę
- Test otrzymania emaila potwierdzenia
- Test countera znaków
- Test responsywności

---

### US-008: Znalezienie lokalizacji gabinetu

ID: US-008
Priorytet: Średni
Epic: Informacje kontaktowe

Jako: Osoba zainteresowana konsultacją stacjonarną
Chcę: Zobaczyć lokalizację gabinetu na mapie
Aby: Ocenić odległość i zaplanować dojazd

Kryteria akceptacji:
- Strona "Kontakt" zawiera embedded Google Maps
- Mapa pokazuje lokalizację: Gaj 5, 95-060 Brzeziny
- Mapa jest responsywna
- Mapa jest klikalna (otwiera Google Maps w nowej karcie)
- Poniżej mapy wyświetlony jest adres tekstowo
- Informacja o trybie: "Konsultacje stacjonarne i online"

Testy:
- Test kliknięcia mapy (otwiera Google Maps)
- Test responsywności mapy
- Visual testing

---

### US-009: Szybki kontakt - kliknięcie w telefon/email

ID: US-009
Priorytet: Średni
Epic: Informacje kontaktowe

Jako: Użytkownik mobilny preferujący bezpośredni kontakt
Chcę: Kliknąć w numer telefonu lub email i automatycznie otworzyć aplikację
Aby: Szybko zadzwonić lub napisać bez przepisywania danych

Kryteria akceptacji:
- Email dietoterapia@paulinamaciak.pl jest kliknalny (mailto:)
- Telefon +48 518 036 686 jest kliknalny (tel:)
- Kliknięcie w email otwiera aplikację mailową
- Kliknięcie w telefon otwiera aplikację do dzwonienia (na mobile)
- Dane kontaktowe są widoczne w footer na każdej stronie
- Dane kontaktowe są widoczne na stronie "Kontakt"

Testy:
- Test kliknięcia w email na desktop i mobile
- Test kliknięcia w telefon na mobile
- Visual testing (linki są wyróżnione)

---

### US-010: Odwiedzenie social media

ID: US-010
Priorytet: Niski
Epic: Social proof

Jako: Potencjalny klient chcący lepiej poznać Paulinę
Chcę: Odwiedzić jej profile na Facebook i Instagram
Aby: Zobaczyć więcej zdjęć, postów i opinii

Kryteria akceptacji:
- Footer zawiera ikony Facebook i Instagram
- Facebook link: https://www.facebook.com/paulina.maciak.dietoterapia
- Instagram link: @paulinamaciak_dietetyk (https://instagram.com/paulinamaciak_dietetyk)
- Ikony są spójne z design system (outline style)
- Linki otwierają się w nowej karcie (target="_blank" rel="noopener noreferrer")
- Ikony mają hover effect

Testy:
- Test kliknięcia w każdą ikonę (otwiera właściwy profil)
- Test target="_blank"
- Visual testing hover states

---

### US-011: Przeczytanie polityki prywatności

ID: US-011
Priorytet: Wysoki (RODO compliance)
Epic: RODO/GDPR

Jako: Użytkownik dbający o prywatność danych
Chcę: Przeczytać politykę prywatności przed wypełnieniem formularza
Aby: Wiedzieć jak moje dane będą przetwarzane

Kryteria akceptacji:
- Strona "Polityka prywatności" jest dostępna pod /polityka-prywatnosci
- Link do polityki jest widoczny w footer na każdej stronie
- Link do polityki jest widoczny w checkboxach RODO w formularzach
- Polityka zawiera wymagane sekcje RODO:
  - Administrator danych
  - Zakres zbieranych danych
  - Cel przetwarzania
  - Podstawa prawna
  - Odbiorcy danych
  - Okres przechowywania
  - Prawa użytkowników
  - Pliki cookies
- Treść jest czytelna i zrozumiała
- Strona jest responsywna

Testy:
- Test dostępności strony
- Test kliknięcia linków
- Ręczny przegląd treści (compliance check)

---

### US-012: Akceptacja/odrzucenie cookies

ID: US-012
Priorytet: Wysoki (RODO compliance)
Epic: RODO/GDPR

Jako: Użytkownik odwiedzający stronę po raz pierwszy
Chcę: Wybrać czy akceptuję cookies analityczne i marketingowe
Aby: Kontrolować jakie dane są o mnie zbierane

Kryteria akceptacji:
- Cookie consent banner pojawia się przy pierwszej wizycie
- Banner jest widoczny na dole ekranu
- Banner zawiera przyciski:
  - "Akceptuję wszystkie"
  - "Ustawienia cookies"
  - "Odrzuć opcjonalne"
- Kategorie cookies:
  - Niezbędne (zawsze włączone, niemodyfikowalne)
  - Analityczne (opcjonalne, Google Analytics)
  - Marketingowe (opcjonalne, przyszłe kampanie)
- Wybór użytkownika jest zapisywany w localStorage/cookies
- Banner nie pojawia się ponownie po dokonaniu wyboru
- Google Analytics ładuje się tylko jeśli użytkownik zaakceptował analityczne cookies
- Link "Ustawienia cookies" jest dostępny w footer

Testy:
- Test pierwszej wizyty (banner się pojawia)
- Test drugiej wizyty (banner się nie pojawia)
- Test "Akceptuję wszystkie" (GA się ładuje)
- Test "Odrzuć opcjonalne" (GA się nie ładuje)
- Test "Ustawienia cookies" (modal z kategoriami)
- Test persistence (localStorage)

---

### US-013: Nawigacja mobilna - menu hamburger

ID: US-013
Priorytet: Krytyczny
Epic: Nawigacja i UX mobile

Jako: Użytkownik mobilny
Chcę: Łatwo nawigować po stronie za pomocą menu hamburger
Aby: Wygodnie przełączać się między stronami na małym ekranie

Kryteria akceptacji:
- Menu hamburger jest widoczne na urządzeniach < 768px
- Ikona hamburgera jest w prawym górnym rogu header
- Kliknięcie otwiera pełnoekranowe menu overlay
- Menu zawiera wszystkie linki: Home, O mnie, Konsultacje, Opinie, Kontakt
- Menu zawiera przycisk CTA "Umów konsultację"
- Kliknięcie w link zamyka menu i scrolluje do sekcji/przechodzi na stronę
- Animacja otwarcia/zamknięcia jest płynna (Framer Motion)
- Przycisk zamknięcia (X) jest widoczny w rogu menu
- Menu jest dostępne przez keyboard (focus trap)
- Menu blokuje scroll strony gdy jest otwarte

Testy:
- Test na różnych rozdzielczościach mobile (320px, 375px, 414px)
- Test keyboard navigation
- Test touch gestures (swipe to close - opcjonalnie)
- Test accessibility (screen readers)
- Visual regression testing

---

### US-014: Smooth scroll do sekcji

ID: US-014
Priorytet: Niski
Epic: UX i interakcje

Jako: Użytkownik klikający w przycisk CTA "Umów konsultację"
Chcę: Płynnie przescrollować do formularza konsultacji
Aby: Mieć lepsze doświadczenie wizualne (nie nagłe skoki)

Kryteria akceptacji:
- Kliknięcie "Umów konsultację" w header scrolluje do formularza na stronie Konsultacje
- Scroll jest płynny (smooth behavior)
- Scroll offset uwzględnia sticky header (formularz nie jest zasłonięty)
- Anchor links działają również w nawigacji
- Smooth scroll działa na wszystkich przeglądarkach (polyfill jeśli potrzebne)

Testy:
- Test kliknięcia CTA w header
- Test anchor links
- Cross-browser testing (Chrome, Safari, Firefox, Edge)

---

### US-015: Fade-in animacje podczas scrollowania

ID: US-015
Priorytet: Niski
Epic: Animacje i interakcje

Jako: Użytkownik scrollujący stronę
Chcę: Widzieć subtelne animacje fade-in gdy sekcje pojawiają się w viewport
Aby: Strona wyglądała bardziej profesjonalnie i dynamicznie

Kryteria akceptacji:
- Sekcje pojawiają się z efektem fade-in gdy wchodzą do viewport
- Animacja wykorzystuje Intersection Observer API
- Animacja jest subtelna (opacity 0 → 1, transform: translateY)
- Czas trwania: 0.6s
- Animacja nie zakłóca accessibility (prefers-reduced-motion)
- Animacje nie wpływają negatywnie na performance (CLS < 0.1)

Testy:
- Visual testing scrollowania
- Test prefers-reduced-motion (animacje wyłączone)
- Lighthouse CLS score < 0.1

---

### US-016: Hover effects na buttonach

ID: US-016
Priorytet: Niski
Epic: Animacje i interakcje

Jako: Użytkownik desktop najeżdżający na przyciski CTA
Chcę: Widzieć hover effect (scale, shadow)
Aby: Mieć feedback wizualny że element jest kliknalny

Kryteria akceptacji:
- Buttony CTA mają hover effect:
  - Scale: 1.05
  - Box shadow transition
  - Transition duration: 0.2s
- Hover działa tylko na desktop (nie na touch devices)
- Cursor zmienia się na pointer
- Hover nie powoduje layout shift
- Focus state (keyboard) również ma styling (outline)

Testy:
- Visual testing hover states
- Test na touch devices (brak hover)
- Keyboard navigation test (focus states)
- Lighthouse accessibility score > 90

---

### US-017: Responsywne obrazy i optymalizacja

ID: US-017
Priorytet: Wysoki
Epic: Performance

Jako: Użytkownik mobilny z wolnym połączeniem
Chcę: Aby obrazy ładowały się szybko i w odpowiedniej rozdzielczości
Aby: Nie czekać długo na załadowanie strony

Kryteria akceptacji:
- Wszystkie obrazy używają Next.js Image component
- Formaty: WebP + JPEG fallback
- Responsive srcset (różne rozmiary dla mobile/tablet/desktop)
- Blur placeholder (blur-up effect) podczas ładowania
- Lazy loading dla obrazów poniżej fold
- Priority loading dla hero images (above fold)
- Max rozmiar obrazu: 200KB (po kompresji)
- Alt text dla wszystkich obrazów

Testy:
- Lighthouse Performance score > 90
- Test LCP < 2.5s
- Visual testing blur placeholders
- Test na wolnym połączeniu (3G throttling)
- Alt text audit

---

### US-018: Walidacja formularza w czasie rzeczywistym

ID: US-018
Priorytet: Wysoki
Epic: Formularze i UX

Jako: Użytkownik wypełniający formularz
Chcę: Widzieć błędy walidacji natychmiast po opuszczeniu pola (on blur)
Aby: Poprawić dane przed próbą wysłania formularza

Kryteria akceptacji:
- Email: walidacja formatu on blur
- Telefon: walidacja formatu +48 XXX XXX XXX on blur
- Błędy wyświetlają się pod polem (czerwony tekst)
- Pole z błędem ma czerwoną ramkę
- Komunikaty błędów są konkretne:
  - "Podaj prawidłowy adres email"
  - "Numer telefonu powinien mieć format +48 XXX XXX XXX"
  - "To pole jest wymagane"
- Po poprawieniu błąd znika
- Submit button jest disabled dopóki formularz nie jest valid (opcjonalnie)

Testy:
- Test każdego typu błędu
- Test poprawiania błędów
- Test UX (czy komunikaty są jasne)
- Accessibility test (aria-invalid, aria-describedby)

---

### US-019: Error handling przy wysyłce formularza

ID: US-019
Priorytet: Wysoki
Epic: Formularze i reliability

Jako: Użytkownik wypełniający formularz
Chcę: Zobaczyć jasny komunikat błędu jeśli wysyłka się nie powiedzie
Aby: Wiedzieć co się stało i móc spróbować ponownie lub skontaktować się inaczej

Kryteria akceptacji:
- Jeśli wysyłka się nie powiedzie, wyświetla się toast z komunikatem:
  "Ups, coś poszło nie tak. Spróbuj ponownie lub napisz na dietoterapia@paulinamaciak.pl"
- Toast zawiera link mailto: do emaila Pauliny
- Formularz nie jest czyszczony po błędzie (dane użytkownika są zachowane)
- Loading state znika
- Użytkownik może spróbować wysłać ponownie
- Error jest logowany (console.error dla debugowania)

Testy:
- Test błędu sieci (disconnect network)
- Test błędu API (mock failed response)
- Test czy dane formularza są zachowane
- Test kliknięcia w link mailto
- Visual testing toasta

---

### US-020: Loading states podczas wysyłki formularza

ID: US-020
Priorytet: Średni
Epic: Formularze i UX

Jako: Użytkownik klikający "Wyślij" w formularzu
Chcę: Widzieć loading indicator
Aby: Wiedzieć że formularz jest w trakcie wysyłania

Kryteria akceptacji:
- Po kliknięciu "Wyślij" przycisk zmienia stan na loading
- Loading indicator: spinner + tekst "Wysyłanie..."
- Przycisk jest disabled podczas loading
- Pola formularza są disabled podczas loading
- Loading state trwa do otrzymania odpowiedzi (success lub error)
- Po sukcesie loading state znika i pojawia się modal/toast sukcesu

Testy:
- Test loading state
- Test disabled states (button i pola)
- Visual testing spinnera
- Test różnych czasów odpowiedzi (slow 3G)

---

### US-021: Potwierdzenie sukcesu wysłania formularza

ID: US-021
Priorytet: Wysoki
Epic: Formularze i UX

Jako: Użytkownik, który właśnie wysłał formularz
Chcę: Zobaczyć jasne potwierdzenie sukcesu
Aby: Mieć pewność że moje zapytanie dotarło do Pauliny

Kryteria akceptacji:
- Po sukcesie wyświetla się modal lub toast z komunikatem:
  "Dziękujemy! Twoje zapytanie zostało wysłane. Paulina odpowie w ciągu 24 godzin."
- Modal/toast zawiera ikonę sukcesu (checkmark)
- Formularz jest czyszczony (wszystkie pola puste)
- Użytkownik otrzymuje email potwierdzenia (double opt-in)
- Modal zamyka się automatycznie po 5 sekundach lub przez kliknięcie X

Testy:
- Test wysłania formularza (end-to-end)
- Test otrzymania emaila potwierdzenia
- Test czyszczenia formularza
- Visual testing modala/toasta
- Test auto-close po 5s

---

### US-022: Email do Pauliny z danymi formularza konsultacji

ID: US-022
Priorytet: Krytyczny
Epic: Email integration

Jako: Paulina (właścicielka)
Chcę: Otrzymywać emaile z danymi pacjentów, którzy wypełnili formularz konsultacji
Aby: Móc skontaktować się z nimi i umówić wizytę

Kryteria akceptacji:
- Email wysyłany przez SendGrid API
- Subject: "Nowe zapytanie o konsultację: [Typ konsultacji]"
- Odbiorca: dietoterapia@paulinamaciak.pl
- Treść emaila zawiera:
  - Typ konsultacji
  - Imię i nazwisko
  - Email
  - Telefon
  - Preferowany termin
  - Dodatkowe informacje
  - Data i godzina wysłania formularza
- Email jest sformatowany czytelnie (HTML template)
- Email jest wysyłany w ciągu 10 sekund od submitu

Testy:
- Test end-to-end wysłania formularza
- Test otrzymania emaila przez Paulinę
- Test poprawności wszystkich danych w emailu
- Test formatowania HTML
- Test czasu wysyłki (< 10s)

---

### US-023: Email potwierdzenia do użytkownika (konsultacje)

ID: US-023
Priorytet: Wysoki
Epic: Email integration

Jako: Użytkownik, który wysłał formularz konsultacji
Chcę: Otrzymać email potwierdzenia
Aby: Mieć pewność że moje zapytanie dotarło i wiedzieć czego się spodziewać

Kryteria akceptacji:
- Email wysyłany przez SendGrid API
- Subject: "Potwierdzenie wysłania zapytania - Dietoterapia"
- Odbiorca: email podany w formularzu
- Treść emaila:
  - Podziękowanie za zapytanie
  - Informacja że Paulina odpowie w ciągu 24h
  - Dane kontaktowe Pauliny (email, telefon)
  - Link do strony
- Email ma profesjonalny HTML template
- Email ma logo Dietoterapia

Testy:
- Test otrzymania emaila
- Test poprawności treści
- Visual testing HTML template
- Test linków w emailu

---

### US-024: Email do Pauliny z wiadomością kontaktową

ID: US-024
Priorytet: Wysoki
Epic: Email integration

Jako: Paulina (właścicielka)
Chcę: Otrzymywać emaile z ogólnymi wiadomościami od odwiedzających
Aby: Odpowiedzieć na ich pytania

Kryteria akceptacji:
- Email wysyłany przez SendGrid API
- Subject: "Nowa wiadomość kontaktowa - Dietoterapia"
- Odbiorca: dietoterapia@paulinamaciak.pl
- Treść emaila zawiera:
  - Imię i nazwisko
  - Email
  - Telefon (jeśli podany)
  - Treść wiadomości
  - Data i godzina wysłania
- Email jest sformatowany czytelnie (HTML template)

Testy:
- Test wysłania formularza kontaktowego
- Test otrzymania emaila przez Paulinę
- Test poprawności danych
- Test z i bez telefonu (opcjonalny)

---

### US-025: Email potwierdzenia do użytkownika (kontakt)

ID: US-025
Priorytet: Średni
Epic: Email integration

Jako: Użytkownik, który wysłał wiadomość kontaktową
Chcę: Otrzymać email potwierdzenia
Aby: Wiedzieć że moja wiadomość dotarła

Kryteria akceptacji:
- Email wysyłany przez SendGrid API
- Subject: "Potwierdzenie wysłania wiadomości - Dietoterapia"
- Odbiorca: email podany w formularzu
- Treść emaila:
  - Podziękowanie za wiadomość
  - Informacja że Paulina odpowie wkrótce
  - Dane kontaktowe Pauliny
- Email ma profesjonalny HTML template

Testy:
- Test otrzymania emaila
- Test poprawności treści

---

### US-026: Cross-browser compatibility

ID: US-026
Priorytet: Wysoki
Epic: Quality Assurance

Jako: Użytkownik przeglądający stronę
Chcę: Aby strona działała poprawnie na różnych przeglądarkach
Aby: Mieć spójne doświadczenie niezależnie od mojej przeglądarki

Kryteria akceptacji:
- Strona działa poprawnie na:
  - Chrome (latest)
  - Safari (latest)
  - Firefox (latest)
  - Edge (latest)
- Wszystkie funkcjonalności działają (formularze, nawigacja, animacje)
- Layout jest identyczny (lub bardzo podobny)
- Nie ma błędów w console
- Performance jest porównywalna

Testy:
- Manual testing na każdej przeglądarce
- Automated testing (Playwright/Cypress)
- Visual regression testing
- Console errors check

---

### US-027: Mobile device compatibility

ID: US-027
Priorytet: Krytyczny
Epic: Quality Assurance

Jako: Użytkownik mobilny
Chcę: Aby strona działała płynnie na moim smartfonie
Aby: Wygodnie przeglądać i wypełniać formularze

Kryteria akceptacji:
- Strona działa poprawnie na:
  - iPhone (Safari)
  - Android (Chrome)
- Rozdzielczości testowane: 320px, 375px, 414px, 428px
- Touch targets są min 44x44px
- Formularze są łatwe do wypełnienia (odpowiednie input types)
- Nie ma horizontal scroll
- Menu hamburger działa płynnie
- Performance: LCP < 2.5s na mobile

Testy:
- Manual testing na rzeczywistych urządzeniach
- Chrome DevTools device emulation
- Touch target size audit
- Lighthouse mobile audit

---

### US-028: Accessibility compliance WCAG 2.1 AA

ID: US-028
Priorytet: Wysoki
Epic: Accessibility

Jako: Użytkownik z niepełnosprawnością
Chcę: Móc nawigować i korzystać ze strony za pomocą klawiatury i screen readera
Aby: Mieć równy dostęp do informacji i usług

Kryteria akceptacji:
- Cała strona jest dostępna przez keyboard (tab navigation)
- Focus indicators są widoczne
- Screen reader czyta wszystkie elementy poprawnie
- Kontrast kolorów: min 4.5:1 dla tekstu
- Alt text dla wszystkich obrazów
- Semantic HTML (header, nav, main, section, article, footer)
- ARIA labels gdzie potrzebne
- Formularze mają poprawne label/input powiązania
- Error messages są czytane przez screen readery
- Lighthouse Accessibility score > 90

Testy:
- Keyboard navigation test (tylko Tab, Enter, Space)
- Screen reader test (NVDA/JAWS/VoiceOver)
- Kontrast audit (axe DevTools)
- Lighthouse Accessibility audit
- Manual WCAG 2.1 AA checklist

---

### US-029: SEO technical optimization

ID: US-029
Priorytet: Wysoki
Epic: SEO

Jako: Właścicielka strony (Paulina)
Chcę: Aby strona była zoptymalizowana technicznie pod SEO
Aby: Mieć szansę na dobre pozycje w Google

Kryteria akceptacji:
- Meta tagi dla każdej strony:
  - Unikalny title (max 60 znaków)
  - Unikalny description (max 160 znaków)
- Open Graph tags (og:title, og:description, og:image)
- Sitemap.xml wygenerowany i dostępny
- Robots.txt skonfigurowany
- Canonical URLs ustawione
- Semantic HTML
- Schema markup:
  - LocalBusiness
  - Person (Paulina)
  - Service (konsultacje)
- Lighthouse SEO score > 90

Testy:
- Google Search Console verification
- Sitemap validation
- Schema markup validation (schema.org validator)
- Lighthouse SEO audit
- Meta tags review

---

### US-031: Google Analytics tracking

ID: US-031
Priorytet: Średni
Epic: Analytics

Jako: Paulina (właścicielka)
Chcę: Śledzić zachowania użytkowników na stronie
Aby: Wiedzieć ile osób odwiedza stronę i jakie podejmują akcje

Kryteria akceptacji:
- Google Analytics 4 jest zintegrowany
- Tracking events:
  - Form submission (konsultacje)
  - Form submission (kontakt)
  - CTA clicks ("Umów konsultację")
  - Social media clicks
  - Phone/email clicks
- Page views są śledzone
- GA ładuje się tylko jeśli użytkownik zaakceptował analityczne cookies
- GA property jest skonfigurowane poprawnie

Testy:
- Test event tracking w GA Debug Mode
- Test conditional loading (cookies consent)
- Verify events w GA Real-Time report

---

### US-039: Pre-launch checklist

ID: US-039
Priorytet: Krytyczny (przed launch)
Epic: Quality Assurance

Jako: Developer i Paulina
Chcę: Przejść przez checklist przed launch
Aby: Upewnić się że wszystko działa i niczego nie pominęliśmy

Kryteria akceptacji:
Checklist zawiera:
- [ ] Wszystkie treści zastąpione (brak Lorem ipsum)
- [ ] Wszystkie zdjęcia zastąpione prawdziwymi
- [ ] Formularze testowane end-to-end (otrzymanie emaili)
- [ ] Cross-browser testing przeprowadzony
- [ ] Mobile testing przeprowadzony
- [ ] Accessibility audit passed
- [ ] SEO audit passed
- [ ] Performance audit passed
- [ ] Google Analytics skonfigurowany
- [ ] Google Search Console skonfigurowany
- [ ] DNS configured (paulinamaciak.pl działa)
- [ ] SSL enabled
- [ ] Cookie consent działa
- [ ] Polityka prywatności opublikowana
- [ ] Social media links działają
- [ ] Google Maps działa
- [ ] Brak błędów w console
- [ ] Final approval od Pauliny

Testy:
- Manual testing wszystkich punktów
- Acceptance testing z Pauliną

### 6.2 Metryki performance
- Lighthouse score > 90 we wszystkich kategoriach (Performance, Accessibility, Best Practices, SEO)
- Core Web Vitals: wszystkie "Good"
  - LCP < 2.5s
  - FID < 100ms
  - CLS < 0.1

### 6.5 Metryki techniczne
- Uptime: 99.9%
- Zero critical bugs w pierwszym miesiącu
- Email delivery rate > 95% (SendGrid)
- Średni czas wysyłki formularza < 10 sekund

### 6.6 Monitoring i narzędzia
- Google Analytics 4: podstawowe metryki traffic i konwersji
- Google Search Console: pozycje w wyszukiwarce, indexowanie
- Vercel Analytics: Web Vitals, performance
- SendGrid Dashboard: delivery rate, bounce rate emaili

---

## Załączniki

### A. Design System - "Naturalna Harmonia"

Paleta kolorów:
- Primary: #4A7C59 (głęboka zieleń)
- Secondary: #E8B4A8 (brzoskwiniowy)
- Accent: #F4A460 (złoty pomarańczowy)
- Neutral Dark: #2C3E3A
- Neutral Light: #F9F6F3
- White: #FFFFFF

Typografia:
- Nagłówki: Montserrat (600, 700)
- Body: Open Sans (400, 600)

Spacing: 8px grid system
Border radius: 8-16px (zaokrąglone rogi)
Shadows: Miękkie, subtle

### B. Dane kontaktowe

Email: dietoterapia@paulinamaciak.pl
Telefon: +48 518 036 686
Adres: Gaj 5, 95-060 Brzeziny
Facebook: https://www.facebook.com/paulina.maciak.dietoterapia
Instagram: @paulinamaciak_dietetyk

### C. Typy konsultacji (nazwy)

1. Konsultacja diagnostyczna
2. Konsultacja kontrolna
3. Konsultacja kompleksowa

Uwaga: Ceny i szczegółowe opisy będą dostarczone później (Lorem ipsum w MVP)

### D. Przyszłe funkcjonalności (poza MVP)

- System rezerwacji online z kalendarzem
- Panel administracyjny dla Pauliny
- CMS dla edycji treści
- Sklep internetowy (plany żywieniowe, e-booki)
- System płatności online
- Baza danych (Postgres/MongoDB)
- Konta pacjentów
- Blog dietetyczny
- Baza przepisów

---

Koniec dokumentu
