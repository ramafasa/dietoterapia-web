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

## 🔴 PROBLEMY KRYTYCZNE (Priorytet 1)

### 1. **XSS (Cross-Site Scripting) w szablonach emaili**

**Lokalizacja:**
- `src/pages/api/consultation.ts:113-145` (email do właściciela)
- `src/pages/api/consultation.ts:160-164` (email do użytkownika)
- `src/pages/api/contact.ts:76-92` (email do właściciela)
- `src/pages/api/contact.ts:116` (email do użytkownika)

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

### 2. **Brak Rate Limiting na endpointach API**

**Lokalizacja:**
- `src/pages/api/consultation.ts:7` - brak rate limiter
- `src/pages/api/contact.ts:7` - brak rate limiter
- `src/lib/ratelimit.ts` - zdefiniowany, ale **nie używany**

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

### 3. **Brak CSRF Protection**

**Lokalizacja:**
- `src/pages/api/consultation.ts` - POST endpoint bez CSRF token
- `src/pages/api/contact.ts` - POST endpoint bez CSRF token
- `src/middleware/index.ts` - brak middleware CSRF

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

### 4. **Email Header Injection**

**Lokalizacja:**
- `src/pages/api/consultation.ts:94-95` - email w polu `to`
- `src/pages/api/contact.ts:64-66` - email w polu `to`

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

### 5. **Brak Security Headers**

**Lokalizacja:**
- `astro.config.mjs` - brak konfiguracji headers
- Brak `vercel.json` z headers
- Brak middleware ustawiającego headers

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

### 6. **Brak timeout dla SMTP**

**Lokalizacja:**
- `src/pages/api/consultation.ts:61-69` - transporter bez timeout
- `src/pages/api/contact.ts:48-56` - transporter bez timeout

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

### 7. **Wyciek szczegółów błędów w produkcji**

**Lokalizacja:**
- `src/pages/api/consultation.ts:221` - `emailError.message` w produkcji
- `src/pages/api/contact.ts:173` - `emailError.message` w produkcji

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

### 8. **Middleware auth jest globalny**

**Lokalizacja:**
- `src/middleware/index.ts:4` - auth middleware dla wszystkich routes

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

### 9. **Brak sanityzacji input poza Zod**

**Problem:**
Zod waliduje format, ale nie sanityzuje (np. trim, lowercase dla email).

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

### 10. **Brak honeypot w formularzu (bot protection)**

**Lokalizacja:**
- `src/components/ConsultationForm.tsx` - brak honeypot
- `src/components/ContactForm.tsx` - brak honeypot

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

### 11. **Brak walidacji file upload (przyszłe)**

**Problem:**
Gdy dodasz upload zdjęć/dokumentów, brak validacji może prowadzić do:
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

### 12. **Słabe parametry bcrypt**

**Lokalizacja:**
- `src/lib/auth.ts` - używa bcrypt, ale nie widzę salt rounds

**Problem:**
Domyślne salt rounds w bcrypt to 10. Zalecane to 12+ dla 2025 roku.

**Rozwiązanie:**
```typescript
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12; // Zwiększ z 10 do 12
const hash = await bcrypt.hash(password, SALT_ROUNDS);
```

### 13. **Brak Content Security Policy dla inline styles**

**Problem:**
Emaile używają inline styles, co jest OK dla emaili, ale strona główna też może mieć inline styles.

**Rozwiązanie:**
Już zawarty w punkcie 5 (Security Headers).

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
