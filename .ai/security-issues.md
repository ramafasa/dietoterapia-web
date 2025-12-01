# RAPORT BEZPIECZEŃSTWA - Dietoterapia Web Application

**Data audytu:** 2025-10-28
**Typ:** Security Code Review
**Zakres:** Pełna analiza aplikacji webowej
**Status:** 🔴 **KRYTYCZNE problemy wymagają natychmiastowej naprawy**

---

## 📊 PODSUMOWANIE WYKONAWCZE

Przeprowadzono kompleksowy audyt bezpieczeństwa aplikacji Dietoterapia. Zidentyfikowano **13 problemów bezpieczeństwa**, w tym:
- **1 KRYTYCZNY** problem (XSS)
- **5 WYSOKICH** problemów (Rate Limiting, CSRF, Email Injection, Security Headers)
- **5 ŚREDNICH** problemów
- **2 NISKIE** problemy

**Ocena ryzyka ogólnego:** 🔴 **WYSOKA** - aplikacja **NIE** jest gotowa do produkcji bez naprawy problemów krytycznych i wysokich.

---

## 🔍 STATUS WERYFIKACJI (2025-12-01)

**Problemy naprawione (✅):**
1. ✅ #1 - XSS w szablonach emaili (sanityzacja przez `email-security.ts`)
2. ✅ #2 - Rate limiting (IP + email limiting + reCAPTCHA v3)
3. ✅ #4 - Email header injection (sanityzacja + walidacja)
4. ✅ #7 - Wyciek błędów w produkcji (tylko DEV mode)

**Problemy częściowo naprawione (⚠️):**
- ⚠️ #9 - Sanityzacja input (działa przez `sanitizeFormData()`, ale schematy Zod mogłyby mieć `.trim()`)
- ⚠️ #10 - Honeypot (jest reCAPTCHA v3, ale honeypot byłby dodatkową warstwą)

**Problemy wymagające naprawy (❌):**
- ❌ #3 - CSRF Protection (brak origin checking)
- ❌ #5 - Security Headers (brak w vercel.json)
- ❌ #6 - SMTP timeout (brak timeoutów w transporter config)
- ❌ #8 - Globalny auth middleware (niepotrzebne DB queries na publicznych routes)
- ❌ #12 - Słabe parametry bcrypt (SALT_ROUNDS=10, powinno być 12+)
- ❌ #13 - CSP dla inline styles (część #5)

**Nie dotyczy (ℹ️):**
- ℹ️ #11 - File upload validation (feature nie zaimplementowany)

**Podsumowanie:** 4 problemy naprawione, 2 częściowo, 6 wymaga naprawy (w tym 4 wysokiego/średniego priorytetu).

---

## 🔴 PROBLEMY KRYTYCZNE (Priorytet 1)

### 1. **XSS (Cross-Site Scripting) w szablonach emaili** #NOT_VALID

**Lokalizacja:**
- `src/pages/api/consultation.ts:113-145` (email do właściciela)
- `src/pages/api/consultation.ts:160-164` (email do użytkownika)
- `src/pages/api/contact.ts:76-92` (email do właściciela)
- `src/pages/api/contact.ts:116` (email do użytkownika)

**Status:** ✅ **NAPRAWIONE** - Dane są sanityzowane przez `sanitizeFormData()` z `src/lib/email-security.ts` przed użyciem w szablonach email. Wszystkie znaczniki HTML są usuwane, znaki specjalne escapowane.

**Problem:**
Dane użytkownika są wstawiane bezpośrednio do HTML emaila **bez escapowania**. Atakujący może wstrzyknąć złośliwy kod HTML/JavaScript poprzez pola formularza.

**Przykład ataku:**
```javascript
fullName: "<img src=x onerror='alert(document.cookie)'>John Doe"
email: "attacker@evil.com"
additionalInfo: "<script>/* malicious code */</script>"
```

**Wpływ:**
- Wykonanie JavaScript w kliencie email (np. Outlook, Gmail web)
- Kradzież sesji/tokenów
- Phishing przez podmianę treści emaila
- Potencjalny dostęp do konta email

**Rozwiązanie:**
```typescript
// Zainstaluj: npm install escape-html
import escapeHtml from 'escape-html';

// Przed wstawieniem do HTML:
const safeFullName = escapeHtml(validatedData.fullName);
const safeEmail = escapeHtml(validatedData.email);
const safeMessage = escapeHtml(validatedData.message);

// W szablonie:
<p><strong>Imię:</strong> ${safeFullName}</p>
<p><strong>Email:</strong> ${safeEmail}</p>
```

**Alternatywnie**, użyj biblioteki do szablonów email z automatycznym escapowaniem:
```typescript
// Już masz zainstalowane react-email - UŻYJ GO!
// Stwórz template w src/emails/ i renderuj z @react-email/render
import { render } from '@react-email/render';
import ConsultationEmail from '@/emails/ConsultationEmail';

const html = render(ConsultationEmail({ data: validatedData }));
```

---

## 🟠 PROBLEMY WYSOKIE (Priorytet 2)

### 2. **Brak Rate Limiting na endpointach API** #NOT_VALID

**Lokalizacja:**
- `src/pages/api/consultation.ts:7` - brak rate limiter
- `src/pages/api/contact.ts:7` - brak rate limiter
- `src/lib/ratelimit.ts` - zdefiniowany, ale **nie używany**

**Status:** ✅ **NAPRAWIONE** - Oba endpointy (`/api/consultation` i `/api/contact`) implementują:
- IP rate limiting: 5 requestów/godzinę na IP (via `checkPublicRateLimit()`)
- Email rate limiting: 2 emaile potwierdzające/godzinę na adres email (via `checkEmailRateLimit()`)
- In-memory storage z automatycznym garbage collection co 10 minut
- reCAPTCHA v3 verification (score >= 0.5)

**Problem:**
Atakujący może:
- Spamować formularzami (email bombing)
- Wykonać atak DoS
- Przesyłać tysiące requestów bez ograniczeń
- Wyczerpać limit SMTP (abuse)

**Wpływ:**
- Koszty SMTP/infrastruktury
- Blokada konta SMTP przez OVH
- Degradacja wydajności
- Spam do właściciela i użytkowników

**Rozwiązanie:**
```typescript
// W src/pages/api/consultation.ts
import { apiRateLimiter } from '@/lib/ratelimit';

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // Rate limiting (100 req/min per IP)
  if (apiRateLimiter) {
    const identifier = clientAddress || 'anonymous';
    const { success } = await apiRateLimiter.limit(identifier);

    if (!success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Za dużo requestów. Spróbuj ponownie za chwilę.',
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // ... reszta kodu
};
```

**WAŻNE:** Ustaw zmienne środowiskowe:
```bash
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

### 3. **Brak CSRF Protection** #VALID

**Lokalizacja:**
- `src/pages/api/consultation.ts` - POST endpoint bez CSRF token
- `src/pages/api/contact.ts` - POST endpoint bez CSRF token
- `src/middleware/index.ts` - brak middleware CSRF

**Status:** ❌ **WCIĄŻ WYMAGA NAPRAWY** - Brak origin checking lub CSRF token validation w API endpoints.

**Problem:**
Atakujący może stworzyć złośliwą stronę, która wysyła requesty do API w imieniu zalogowanego użytkownika.

**Przykład ataku:**
```html
<!-- evil.com -->
<form action="https://paulinamaciak.pl/api/consultation" method="POST">
  <input name="email" value="victim@example.com">
  <!-- ... reszta pól -->
</form>
<script>document.forms[0].submit()</script>
```

**Wpływ:**
- Nieautoryzowane wysyłanie formularzy
- Spam w imieniu użytkowników
- Ataki socjotechniczne

**Rozwiązanie:**

**Opcja 1: Same-Site Cookies (prostsza, zalecana)**
```typescript
// W src/middleware/csrf.ts
import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  if (context.request.method === 'POST') {
    const origin = context.request.headers.get('origin');
    const host = context.request.headers.get('host');

    // Odrzuć requesty z innych domen
    if (origin && !origin.includes(host || '')) {
      return new Response('Forbidden', { status: 403 });
    }
  }

  return next();
});
```

**Opcja 2: CSRF Token (bardziej secure)**
```bash
npm install @astrojs/csrf
```

### 4. **Email Header Injection** #NOT_VALID

**Lokalizacja:**
- `src/pages/api/consultation.ts:94-95` - email w polu `to`
- `src/pages/api/contact.ts:64-66` - email w polu `to`

**Status:** ✅ **NAPRAWIONE** - Email adresy są sanityzowane przez `sanitizeFormData()` która:
- Wykonuje `.toLowerCase().trim()` na adresach email
- Waliduje format i blokuje podejrzane wzorce przez `validateEmailRecipient()`
- Blokuje domeny jednorazowe (disposable email domains)

**Problem:**
Mimo walidacji Zod, atakujący może próbować wstrzyknąć dodatkowe nagłówki email poprzez pole email.

**Przykład ataku:**
```
email: "attacker@evil.com\nBcc: spam@list.com"
```

**Rozwiązanie:**
Dodaj sanityzację nagłówków:
```typescript
// Usuń newlines z email przed użyciem
const sanitizedEmail = validatedData.email.replace(/[\r\n]/g, '');

const userEmailOptions = {
  from: contactEmail,
  to: sanitizedEmail, // użyj sanitized
  subject: 'Potwierdzenie...',
  // ...
};
```

### 5. **Brak Security Headers** #VALID

**Lokalizacja:**
- `astro.config.mjs` - brak konfiguracji headers
- Brak `vercel.json` z headers
- Brak middleware ustawiającego headers

**Status:** ❌ **WCIĄŻ WYMAGA NAPRAWY** - `vercel.json` istnieje, ale zawiera tylko konfigurację cron jobs. Brak security headers (X-Frame-Options, CSP, X-Content-Type-Options, etc.)

**Problem:**
Brak ochrony przed:
- Clickjacking (brak X-Frame-Options)
- XSS (brak Content-Security-Policy)
- MIME sniffing (brak X-Content-Type-Options)
- Wyciek referrerów (brak Referrer-Policy)

**Wpływ:**
- Aplikacja może być osadzona w iframe (clickjacking)
- Brak mitigacji XSS
- Podatność na ataki MIME

**Rozwiązanie:**

Stwórz `vercel.json`:
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Permissions-Policy",
          "value": "camera=(), microphone=(), geolocation=()"
        },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:;"
        }
      ]
    }
  ]
}
```

### 6. **Brak timeout dla SMTP** #VALID

**Lokalizacja:**
- `src/pages/api/consultation.ts:126-134` - transporter bez timeout
- `src/pages/api/contact.ts:113-121` - transporter bez timeout

**Status:** ❌ **WCIĄŻ WYMAGA NAPRAWY** - Transportery nodemailer nie mają skonfigurowanych timeoutów (connectionTimeout, greetingTimeout, socketTimeout).

**Problem:**
Jeśli serwer SMTP nie odpowiada, request może zawiesić się na minuty, blokując zasoby.

**Rozwiązanie:**
```typescript
const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: true,
  auth: { user: smtpUser, pass: smtpPass },
  connectionTimeout: 10000, // 10s
  greetingTimeout: 5000,    // 5s
  socketTimeout: 15000,      // 15s
});
```

---

## 🟡 PROBLEMY ŚREDNIE (Priorytet 3)

### 7. **Wyciek szczegółów błędów w produkcji** #NOT_VALID

**Lokalizacja:**
- `src/pages/api/consultation.ts:294` - `emailError.message` w produkcji
- `src/pages/api/contact.ts:246` - `emailError.message` w produkcji

**Status:** ✅ **NAPRAWIONE** - Szczegóły błędów są zwracane tylko w trybie DEV: `details: import.meta.env.DEV ? emailError.message : undefined`

**Problem:**
```typescript
details: import.meta.env.DEV ? emailError.message : undefined,
```
To jest dobre, ale console.error wciąż loguje pełne błędy w produkcji.

**Rozwiązanie:**
Użyj structured logging:
```bash
npm install pino
```
```typescript
import pino from 'pino';
const logger = pino({ level: import.meta.env.PROD ? 'error' : 'debug' });

logger.error({ err: emailError }, 'Failed to send email');
```

### 8. **Middleware auth jest globalny** #VALID

**Lokalizacja:**
- `src/middleware/index.ts:5` - auth middleware dla wszystkich routes

**Status:** ❌ **WCIĄŻ WYMAGA NAPRAWY** - Auth middleware jest wykonywany na wszystkich ścieżkach, w tym publicznych (`/`, `/api/consultation`), powodując niepotrzebne zapytania do bazy danych.

**Problem:**
Middleware sprawdza sesję Lucia na **wszystkich** requestach, także publicznych (/, /api/consultation). To powoduje:
- Niepotrzebne query do bazy
- Potencjalne błędy jeśli baza nie istnieje
- Overhead

**Rozwiązanie:**
```typescript
// src/middleware/index.ts
import { sequence, defineMiddleware } from 'astro:middleware';
import { onRequest as authMiddleware } from './auth';

const conditionalAuth = defineMiddleware(async (context, next) => {
  // Tylko dla chronionych ścieżek
  if (context.url.pathname.startsWith('/waga') ||
      context.url.pathname.startsWith('/dietetyk')) {
    return authMiddleware(context, next);
  }

  // Publiczne - pomiń auth
  context.locals.user = null;
  context.locals.session = null;
  return next();
});

export const onRequest = sequence(conditionalAuth);
```

### 9. **Brak sanityzacji input poza Zod** #VALID

**Problem:**
Zod waliduje format, ale nie sanityzuje (np. trim, lowercase dla email).

**Status:** ⚠️ **CZĘŚCIOWO NAPRAWIONE** - Dane są sanityzowane przez `sanitizeFormData()` po walidacji Zod, ale lepszym podejściem byłoby dodanie `.trim()` i `.toLowerCase()` bezpośrednio w schematach Zod (`src/schemas/consultation.ts`, `src/schemas/contact.ts`).

**Rozwiązanie:**
```typescript
// src/schemas/consultation.ts
export const consultationSchema = z.object({
  fullName: z.string()
    .trim()
    .min(2, 'Imię i nazwisko musi mieć min. 2 znaki')
    .max(100, 'Max 100 znaków')
    .regex(/^[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ\s-]+$/, 'Tylko litery, spacje i myślnik'),

  email: z.string()
    .trim()
    .toLowerCase()
    .email('Podaj prawidłowy adres email'),

  // ... reszta
});
```

### 10. **Brak honeypot w formularzu (bot protection)** #VALID

**Lokalizacja:**
- `src/components/ConsultationForm.tsx` - brak honeypot
- `src/components/ContactForm.tsx` - brak honeypot

**Status:** ⚠️ **CZĘŚCIOWO NAPRAWIONE** - Formularze mają reCAPTCHA v3 (bot protection), ale honeypot byłby dodatkową warstwą ochrony.

**Rozwiązanie:**
```tsx
// W formularzu dodaj ukryte pole:
<input
  type="text"
  name="website"
  style={{ display: 'none' }}
  tabIndex={-1}
  autoComplete="off"
/>

// W API sprawdź:
if (body.website) {
  return new Response(JSON.stringify({ success: true }), { status: 200 });
}
```

### 11. **Brak walidacji file upload (przyszłe)** #NOT_APPLICABLE

**Problem:**
Gdy dodasz upload zdjęć/dokumentów, brak validacji może prowadzić do:

**Status:** ℹ️ **NIE DOTYCZY** - Feature nie jest jeszcze zaimplementowany.
- Upload malware
- DoS przez duże pliki
- Path traversal

**Rozwiązanie (na przyszłość):**
```typescript
// Waliduj: typ MIME, rozmiar, rozszerzenie
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

if (!ALLOWED_TYPES.includes(file.type)) {
  throw new Error('Niedozwolony typ pliku');
}
```

---

## ⚪ PROBLEMY NISKIE (Priorytet 4)

### 12. **Słabe parametry bcrypt** #VALID

**Lokalizacja:**
- `src/lib/password.ts:3` - `SALT_ROUNDS = 10`

**Status:** ❌ **WCIĄŻ WYMAGA NAPRAWY** - SALT_ROUNDS ustawione na 10. Zalecane jest 12+ dla 2025 roku.

**Problem:**
Domyślne salt rounds w bcrypt to 10. Zalecane to 12+ dla 2025 roku.

**Rozwiązanie:**
```typescript
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12; // Zwiększ z 10 do 12
const hash = await bcrypt.hash(password, SALT_ROUNDS);
```

### 13. **Brak Content Security Policy dla inline styles** #VALID

**Problem:**
Emaile używają inline styles, co jest OK dla emaili, ale strona główna też może mieć inline styles.

**Status:** ❌ **WCIĄŻ WYMAGA NAPRAWY** - Część problemu #5 (Security Headers). Brak CSP w vercel.json.

---

## ✅ POZYTYWNE ASPEKTY BEZPIECZEŃSTWA

1. ✅ **Walidacja Zod** - dobrze zaimplementowana w schematach
2. ✅ **GDPR Consent** - wymagany checkbox w formularzach
3. ✅ **Secrets w .env** - nie w kodzie, `.env.local` w `.gitignore`
4. ✅ **Lucia Auth** - profesjonalna biblioteka do autentykacji
5. ✅ **Database schema** - audit log, consent tracking, RODO-compliant
6. ✅ **Rate limiter gotowy** - tylko wymaga użycia
7. ✅ **Password hashing** - bcrypt (dobra praktyka)
8. ✅ **HTTPS** - Vercel wymusza HTTPS
9. ✅ **Input validation** - podstawowa walidacja jest

---

## 📋 PRIORYTETYZACJA NAPRAW

### 🔥 NATYCHMIAST (1-2 dni)
1. Napraw XSS w emailach (escapeHtml lub react-email)
2. Dodaj rate limiting do API endpoints
3. Dodaj CSRF protection (origin check minimum)
4. Dodaj email header sanitization

### 📅 PILNE (1 tydzień)
5. Dodaj security headers (vercel.json)
6. Dodaj timeout dla SMTP
7. Popraw middleware auth (conditional)

### 🕒 WAŻNE (2 tygodnie)
8. Dodaj honeypot do formularzy
9. Popraw sanityzację input (trim, regex)
10. Zwiększ bcrypt salt rounds

### 💡 NICE TO HAVE
11. Structured logging (pino)
12. Monitoring/alerting
13. Penetration testing przed produkcją

---

## 🛠️ IMPLEMENTACJA - QUICK WINS

### 1. Szybka naprawa XSS (5 minut)
```bash
npm install escape-html
```
```typescript
// W consultation.ts i contact.ts:
import escapeHtml from 'escape-html';

const safe = {
  fullName: escapeHtml(validatedData.fullName),
  email: escapeHtml(validatedData.email),
  phone: escapeHtml(validatedData.phone || ''),
  message: escapeHtml(validatedData.message || ''),
  additionalInfo: escapeHtml(validatedData.additionalInfo || ''),
  preferredDate: escapeHtml(validatedData.preferredDate || ''),
};

// Użyj `safe.*` w szablonach HTML
```

### 2. Szybka naprawa Rate Limiting (10 minut)
```typescript
// Ustaw .env.local:
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

// W consultation.ts i contact.ts dodaj na początku:
if (apiRateLimiter) {
  const ip = request.headers.get('x-forwarded-for') || 'anonymous';
  const { success } = await apiRateLimiter.limit(ip);
  if (!success) {
    return new Response(
      JSON.stringify({ success: false, error: 'Za dużo requestów' }),
      { status: 429 }
    );
  }
}
```

### 3. Szybka naprawa CSRF (5 minut)
```typescript
// Dodaj origin check w consultation.ts i contact.ts:
const origin = request.headers.get('origin');
const allowedOrigins = [
  'https://paulinamaciak.pl',
  import.meta.env.DEV ? 'http://localhost:4321' : '',
];

if (origin && !allowedOrigins.includes(origin)) {
  return new Response(
    JSON.stringify({ success: false, error: 'Forbidden' }),
    { status: 403 }
  );
}
```

---

## 📊 PODSUMOWANIE KOŃCOWE

**Stan obecny:** 🔴 **Aplikacja NIE JEST bezpieczna do produkcji**

**Po naprawie problemów KRYTYCZNYCH i WYSOKICH:** 🟢 **Akceptowalne ryzyko**

**Szacowany czas naprawy:**
- Krytyczne + Wysokie: **4-6 godzin**
- Średnie: **2-3 godziny**
- Niskie: **1 godzina**

**Całkowity czas:** ~8-10 godzin pracy

**Rekomendacja:** Przed uruchomieniem produkcji napraw co najmniej problemy **KRYTYCZNE** i **WYSOKIE** (punkty 1-6).

---

## 📞 NASTĘPNE KROKI

1. Przejrzyj raport i ustal priorytety z zespołem
2. Zacznij od problemu #1 (XSS) - najbardziej krytyczny
3. Wdróż rate limiting (#2) - najłatwiejszy do naprawy spośród wysokich
4. Zaimplementuj pozostałe poprawki zgodnie z priorytetami
5. Po naprawach wykonaj ponowny test bezpieczeństwa

**Priorytet 1: XSS i Rate Limiting - bez tego NIE wchodź na produkcję!**
