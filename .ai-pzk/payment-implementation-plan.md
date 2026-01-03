# Plan Implementacji Płatności PZK przez Tpay

**Data utworzenia:** 2026-01-03
**Status:** Oczekuje na akceptację
**Priorytet:** Wysoki

---

## 1. Podsumowanie Wymagań

### 1.1 Wymagania Biznesowe
- **Bramka płatności:** Tpay.com (sandbox na start)
- **Okres dostępu:** 12 miesięcy od daty zakupu
- **Ceny modułów:** Konfigurowalne przez zmienne środowiskowe
  - Moduł 1: 299 PLN (wartość startowa)
  - Moduł 2: 299 PLN (wartość startowa)
  - Moduł 3: 299 PLN (wartość startowa)
- **Historia transakcji:** Pełne logowanie w dedykowanej tabeli
- **Duplikaty:** Blokowanie próby zakupu modułu, do którego użytkownik ma już aktywny dostęp
- **Email potwierdzający:** Wysyłany po udanej płatności
- **Dane płatnika:** Email (wymagany) + Imię i nazwisko (opcjonalne, jeśli wypełnione w profilu)

### 1.2 Flow Użytkownika

#### Scenariusz A: Użytkownik zalogowany
1. Użytkownik klika "Kup moduł X" na `/pzk/kup`
2. System sprawdza czy użytkownik ma już dostęp do modułu
   - **TAK:** Przekierowanie do `/pacjent/pzk/katalog` z komunikatem "Masz już dostęp do tego modułu"
   - **NIE:** Kontynuacja procesu zakupu
3. System tworzy transakcję w bazie (status: `pending`)
4. System wywołuje Tpay API do utworzenia płatności
5. Użytkownik przekierowywany do formularza płatności Tpay
6. Po płatności Tpay wywołuje webhook `/api/pzk/purchase/callback`
7. System weryfikuje callback, aktywuje dostęp, wysyła email
8. Użytkownik przekierowywany do:
   - **Sukces:** `/pzk/platnosc/sukces` → przycisk do katalogu PZK
   - **Błąd:** `/pzk/platnosc/blad` → przycisk "Spróbuj ponownie"

#### Scenariusz B: Użytkownik niezalogowany
1. Użytkownik klika "Kup moduł X" na `/pzk/kup`
2. Przekierowanie do `/logowanie` z parametrem `?redirect=/api/pzk/purchase/initiate&module=X`
3. Po zalogowaniu → rozpoczęcie procesu zakupu (Scenariusz A od kroku 2)

---

## 2. Architektura Rozwiązania

### 2.1 Diagram Flow

```
┌─────────────────┐
│  /pzk/kup       │
│  (Strona zakupu)│
└────────┬────────┘
         │ Click "Kup moduł X"
         ▼
┌─────────────────────────┐
│ Sprawdzenie auth        │
│ (client-side JS)        │
└────────┬────────────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
Niezalog.  Zalogowany
    │         │
    │         ▼
    │   ┌─────────────────────────────┐
    │   │ POST /api/pzk/purchase/     │
    │   │      initiate                │
    │   │ - Sprawdź duplikat dostępu  │
    │   │ - Utwórz transakcję (DB)    │
    │   │ - Wywołaj Tpay API          │
    │   │ - Zwróć redirect URL        │
    │   └────────┬────────────────────┘
    │            │
    │            ▼
    │   ┌─────────────────┐
    │   │ Tpay Payment    │
    │   │ Form (external) │
    │   └────────┬────────┘
    │            │
    │            ▼
    │   ┌─────────────────────────────┐
    │   │ POST /api/pzk/purchase/     │
    │   │      callback (webhook)     │
    │   │ - Weryfikuj signature       │
    │   │ - Aktualizuj transakcję     │
    │   │ - Aktywuj dostęp (DB)       │
    │   │ - Wyślij email              │
    │   └────────┬────────────────────┘
    │            │
    │       ┌────┴────┐
    │       │         │
    │       ▼         ▼
    │   Sukces     Błąd
    │       │         │
    │       ▼         ▼
    │  /pzk/platnosc/sukces
    │  /pzk/platnosc/blad
    │
    ▼
/logowanie?redirect=...
```

### 2.2 Struktura Bazy Danych

#### Nowa tabela: `pzk_transactions`

```typescript
export const pzkTransactions = pgTable('pzk_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  module: integer('module').notNull(), // CHECK (module IN (1,2,3))

  // Kwoty
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(), // 299.00
  currency: varchar('currency', { length: 3 }).default('PLN').notNull(),

  // Status transakcji
  status: varchar('status', { length: 20 }).notNull(),
  // 'pending' | 'success' | 'failed' | 'cancelled'

  // Tpay metadata
  tpayTransactionId: varchar('tpay_transaction_id', { length: 255 }).unique(),
  tpayTitle: varchar('tpay_title', { length: 255 }).notNull(), // "PZK Moduł 1"

  // Dane płatnika (snapshot z momentu zakupu)
  payerEmail: varchar('payer_email', { length: 255 }).notNull(),
  payerName: varchar('payer_name', { length: 255 }), // firstName + lastName

  // Timestampy
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }), // Data finalizacji (success/failed)
}, (table) => ({
  // Index dla listowania transakcji użytkownika
  userIdIndex: index('idx_pzk_transactions_user_id').on(table.userId, sql`${table.createdAt} DESC`),
  // Index dla statusów (monitoring pending transactions)
  statusIndex: index('idx_pzk_transactions_status').on(table.status, sql`${table.createdAt} DESC`),
}))
```

**Migracja SQL:**
```sql
-- Dodaj tabelę pzk_transactions
CREATE TABLE pzk_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  module INTEGER NOT NULL CHECK (module IN (1, 2, 3)),
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'PLN',
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'success', 'failed', 'cancelled')),
  tpay_transaction_id VARCHAR(255) UNIQUE,
  tpay_title VARCHAR(255) NOT NULL,
  payer_email VARCHAR(255) NOT NULL,
  payer_name VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indeksy
CREATE INDEX idx_pzk_transactions_user_id ON pzk_transactions(user_id, created_at DESC);
CREATE INDEX idx_pzk_transactions_status ON pzk_transactions(status, created_at DESC);

-- Trigger dla updatedAt
CREATE TRIGGER update_pzk_transactions_updated_at
  BEFORE UPDATE ON pzk_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### 2.3 Zmienne Środowiskowe

**Dodać do `.env.local` i Vercel:**

```bash
# Tpay Configuration
TPAY_CLIENT_ID=***                    # Merchant ID (z panelu Tpay)
TPAY_CLIENT_SECRET=***                # API Key (z panelu Tpay)
TPAY_ENVIRONMENT=sandbox              # sandbox | production
TPAY_NOTIFICATION_URL=https://paulinamaciak.pl/api/pzk/purchase/callback

# PZK Module Prices (PLN, format: XXX.XX)
MODULE_1_PRICE=299.00
MODULE_2_PRICE=299.00
MODULE_3_PRICE=299.00
```

**Dodać do CLAUDE.md dokumentacji:**
```markdown
**Tpay Payment Integration:**
```bash
# Tpay (Payment Gateway)
TPAY_CLIENT_ID=***                    # Merchant ID from Tpay panel
TPAY_CLIENT_SECRET=***                # API Key from Tpay panel
TPAY_ENVIRONMENT=sandbox              # sandbox (test) | production (live)
TPAY_NOTIFICATION_URL=***             # Full URL to webhook endpoint

# Module Pricing (PLN)
MODULE_1_PRICE=299.00                 # Price for Module 1
MODULE_2_PRICE=299.00                 # Price for Module 2
MODULE_3_PRICE=299.00                 # Price for Module 3
```
```

---

## 3. Implementacja Backend

### 3.1 Tpay Service (`src/lib/services/tpayService.ts`)

**Odpowiedzialność:**
- Komunikacja z Tpay API
- Tworzenie transakcji
- Weryfikacja webhook signature
- Pobieranie statusu transakcji

**API Tpay:**
- **Sandbox:** https://api.sandbox.tpay.com
- **Production:** https://api.tpay.com
- **Dokumentacja:** https://docs-api.tpay.com

**Kluczowe metody:**
```typescript
class TpayService {
  // Utworzenie transakcji
  async createTransaction(params: {
    amount: number
    description: string
    payerEmail: string
    payerName?: string
    returnUrl: string
    notificationUrl: string
  }): Promise<{ transactionId: string; paymentUrl: string }>

  // Weryfikacja podpisu webhook
  verifyWebhookSignature(payload: object, signature: string): boolean

  // Pobranie statusu transakcji (opcjonalne, dla debugowania)
  async getTransactionStatus(transactionId: string): Promise<TpayTransactionStatus>
}
```

**Bezpieczeństwo:**
- Authorization: Basic Auth (base64 encode `TPAY_CLIENT_ID:TPAY_CLIENT_SECRET`)
- Webhook signature: HMAC-SHA256 z `TPAY_CLIENT_SECRET`

### 3.2 Transaction Service (`src/lib/services/pzkTransactionService.ts`)

**Odpowiedzialność:**
- CRUD operacje na `pzk_transactions`
- Walidacja biznesowa (duplikaty, limity)
- Mapowanie DB ↔ DTO

**Kluczowe metody:**
```typescript
class PzkTransactionService {
  // Utworzenie nowej transakcji (status: pending)
  async createTransaction(params: {
    userId: string
    module: PzkModuleNumber
    amount: number
    payerEmail: string
    payerName?: string
  }): Promise<PzkTransaction>

  // Aktualizacja statusu transakcji
  async updateTransactionStatus(
    transactionId: string,
    status: 'success' | 'failed' | 'cancelled',
    tpayTransactionId?: string
  ): Promise<void>

  // Pobranie transakcji użytkownika (historia zakupów)
  async getUserTransactions(userId: string): Promise<PzkTransaction[]>

  // Sprawdzenie czy istnieje pending transakcja dla modułu
  async hasPendingTransaction(userId: string, module: PzkModuleNumber): Promise<boolean>
}
```

### 3.3 Purchase Service (`src/lib/services/pzkPurchaseService.ts`)

**Odpowiedzialność:**
- Orkiestracja procesu zakupu
- Walidacja biznesowa (czy użytkownik ma już dostęp)
- Koordynacja TpayService + TransactionService + AccessService

**Kluczowe metody:**
```typescript
class PzkPurchaseService {
  // Inicjalizacja zakupu
  async initiatePurchase(params: {
    userId: string
    module: PzkModuleNumber
  }): Promise<{
    redirectUrl: string
    transactionId: string
  } | {
    error: 'ALREADY_HAS_ACCESS'
    redirectUrl: string // /pacjent/pzk/katalog
  }>

  // Przetworzenie callback z Tpay
  async processPaymentCallback(params: {
    tpayTransactionId: string
    status: 'success' | 'failed'
    signature: string
    rawPayload: object
  }): Promise<void>

  // Aktywacja dostępu po udanej płatności
  private async activateModuleAccess(
    transactionId: string
  ): Promise<void>
}
```

### 3.4 API Endpoints

#### POST `/api/pzk/purchase/initiate`

**Request:**
```typescript
{
  module: 1 | 2 | 3
}
```

**Response (Success - 200):**
```typescript
{
  data: {
    redirectUrl: string // URL do Tpay payment form
    transactionId: string // UUID naszej transakcji
  },
  error: null
}
```

**Response (Already Has Access - 409):**
```typescript
{
  data: null,
  error: {
    code: 'already_has_access',
    message: 'Masz już aktywny dostęp do tego modułu',
    details: {
      redirectUrl: '/pacjent/pzk/katalog'
    }
  }
}
```

**Implementacja:**
1. Sprawdź autentykację (middleware)
2. Walidacja `module` (Zod schema)
3. Sprawdź czy użytkownik ma już dostęp → jeśli TAK, zwróć 409
4. Pobierz cenę z env (`MODULE_X_PRICE`)
5. Utwórz transakcję w DB (status: pending)
6. Wywołaj Tpay API
7. Zwróć redirect URL

**Rate Limiting:** 5 żądań/minutę/użytkownik

---

#### POST `/api/pzk/purchase/callback` (Webhook)

**Request (z Tpay):**
```json
{
  "tr_id": "TR-XXX-YYY-ZZZ",
  "tr_status": "TRUE",
  "tr_amount": "299.00",
  "tr_crc": "transaction-uuid",
  "md5sum": "signature-hash",
  ...
}
```

**Response:**
```
TRUE
```
(Tpay wymaga odpowiedzi "TRUE" dla sukcesu)

**Implementacja:**
1. **Weryfikacja signature** - KRYTYCZNE dla bezpieczeństwa!
2. Znajdź transakcję po `tr_crc` (UUID naszej transakcji)
3. Sprawdź czy transakcja nie została już przetworzona (idempotencja)
4. Aktualizuj status transakcji:
   - `tr_status === 'TRUE'` → `success` + aktywuj dostęp
   - `tr_status === 'FALSE'` → `failed`
5. Jeśli success:
   - Dodaj wpis do `pzk_module_access` (startAt: now, expiresAt: +12 miesięcy)
   - Wyślij email potwierdzający
   - Zaloguj event w `events` table
6. Zwróć "TRUE"

**Bezpieczeństwo:**
- **HTTPS only** (webhook URL musi używać HTTPS)
- **IP whitelist** - opcjonalnie zweryfikować IP Tpay (lista w dokumentacji)
- **Signature verification** - OBOWIĄZKOWE
- **Idempotencja** - sprawdzenie czy callback nie jest duplikatem

---

#### GET `/api/pzk/purchase/status/:transactionId`

**Opcjonalny endpoint** dla debugowania i sprawdzania statusu transakcji przez użytkownika.

**Response:**
```typescript
{
  data: {
    status: 'pending' | 'success' | 'failed' | 'cancelled'
    module: 1 | 2 | 3
    amount: string // "299.00"
    createdAt: string // ISO
    completedAt: string | null
  },
  error: null
}
```

---

## 4. Implementacja Frontend

### 4.1 Modyfikacja Przycisku "Kup moduł X"

**Obecnie:** `/pzk/kup` → Przyciski kierują na zewnętrzny URL
**Docelowo:** Przyciski inicjują proces zakupu przez API

**Plik:** `src/components/pzk/PzkPurchaseModules.astro`

**Zmiana 1: React Island z logiką zakupu**

Utworzyć nowy komponent React:
`src/components/pzk/PzkPurchaseButton.tsx`

```tsx
interface Props {
  module: 1 | 2 | 3
  label: string
}

export default function PzkPurchaseButton({ module, label }: Props) {
  const [isLoading, setIsLoading] = useState(false)

  const handlePurchase = async () => {
    setIsLoading(true)

    try {
      // 1. Sprawdź czy użytkownik jest zalogowany
      const authResponse = await fetch('/api/auth/session')
      if (authResponse.status === 401) {
        // Przekieruj do logowania z parametrem redirect
        window.location.href = `/logowanie?redirect=/api/pzk/purchase/initiate&module=${module}`
        return
      }

      // 2. Inicjuj zakup
      const response = await fetch('/api/pzk/purchase/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module })
      })

      const data = await response.json()

      if (response.status === 409) {
        // Użytkownik ma już dostęp
        toast.success('Masz już dostęp do tego modułu!')
        window.location.href = '/pacjent/pzk/katalog'
        return
      }

      if (!response.ok) {
        throw new Error(data.error?.message || 'Błąd inicjalizacji płatności')
      }

      // 3. Przekieruj do Tpay
      window.location.href = data.data.redirectUrl

    } catch (error) {
      console.error('Purchase error:', error)
      toast.error('Wystąpił błąd. Spróbuj ponownie.')
      setIsLoading(false)
    }
  }

  return (
    <button
      onClick={handlePurchase}
      disabled={isLoading}
      className="btn btn-primary w-full"
    >
      {isLoading ? 'Przekierowywanie...' : label}
    </button>
  )
}
```

**Zmiana 2: Aktualizacja `PzkPurchaseModules.astro`**

```diff
- <a href={module.ctaUrl} target="_blank" rel="noopener noreferrer" class="btn btn-primary">
-   {module.ctaLabel}
- </a>
+ <PzkPurchaseButton
+   module={module.module}
+   label={module.ctaLabel}
+   client:load
+ />
```

### 4.2 Strona Sukcesu (`src/pages/pzk/platnosc/sukces.astro`)

**URL:** `/pzk/platnosc/sukces?transaction=<uuid>`

```astro
---
import Layout from '@/layouts/Layout.astro'

// Opcjonalnie: pobrać szczegóły transakcji z API
const transactionId = Astro.url.searchParams.get('transaction')
---

<Layout title="Płatność zakończona sukcesem" description="Dziękujemy za zakup">
  <main class="min-h-screen bg-neutral-light py-16">
    <div class="container mx-auto px-4 max-w-2xl">
      <div class="bg-white rounded-lg shadow-lg p-8 text-center">
        <!-- Ikona sukcesu -->
        <div class="mb-6">
          <svg class="w-20 h-20 text-green-500 mx-auto" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
          </svg>
        </div>

        <h1 class="text-3xl font-heading font-bold text-neutral-dark mb-4">
          Płatność zakończona sukcesem!
        </h1>

        <p class="text-neutral-dark/70 mb-6">
          Dziękujemy za zakup. Dostęp do modułu został aktywowany.
          Na Twój adres email wysłaliśmy potwierdzenie zakupu.
        </p>

        <a href="/pacjent/pzk/katalog" class="btn btn-primary">
          Przejdź do katalogu PZK
        </a>
      </div>
    </div>
  </main>
</Layout>
```

### 4.3 Strona Błędu (`src/pages/pzk/platnosc/blad.astro`)

**URL:** `/pzk/platnosc/blad`

```astro
---
import Layout from '@/layouts/Layout.astro'
---

<Layout title="Błąd płatności" description="Płatność nie powiodła się">
  <main class="min-h-screen bg-neutral-light py-16">
    <div class="container mx-auto px-4 max-w-2xl">
      <div class="bg-white rounded-lg shadow-lg p-8 text-center">
        <!-- Ikona błędu -->
        <div class="mb-6">
          <svg class="w-20 h-20 text-red-500 mx-auto" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
          </svg>
        </div>

        <h1 class="text-3xl font-heading font-bold text-neutral-dark mb-4">
          Płatność nie powiodła się
        </h1>

        <p class="text-neutral-dark/70 mb-6">
          Niestety, nie udało się zrealizować płatności. Spróbuj ponownie lub skontaktuj się z nami, jeśli problem będzie się powtarzał.
        </p>

        <div class="flex gap-4 justify-center">
          <a href="/pzk/kup" class="btn btn-primary">
            Spróbuj ponownie
          </a>
          <a href="/kontakt" class="btn btn-secondary">
            Skontaktuj się
          </a>
        </div>
      </div>
    </div>
  </main>
</Layout>
```

### 4.4 Opcjonalny Endpoint Session (`/api/auth/session`)

Dla sprawdzenia czy użytkownik jest zalogowany (client-side).

```typescript
// src/pages/api/auth/session.ts
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return new Response(null, { status: 401 })
  }

  return new Response(JSON.stringify({
    id: locals.user.id,
    email: locals.user.email,
    role: locals.user.role
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
```

---

## 5. Email Potwierdzający

### 5.1 Template (`src/emails/PzkPurchaseConfirmation.tsx`)

**Używając `react-email`:**

```tsx
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface Props {
  userName: string
  moduleName: string
  expiresAt: string // Format: "1 stycznia 2027"
  catalogUrl: string
}

export default function PzkPurchaseConfirmation({
  userName = 'Użytkowniku',
  moduleName = 'Moduł 1',
  expiresAt = '1 stycznia 2027',
  catalogUrl = 'https://paulinamaciak.pl/pacjent/pzk/katalog'
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>Potwierdzenie zakupu - Przestrzeń Zdrowej Kobiety</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Dziękujemy za zakup!</Heading>

          <Text style={text}>Witaj {userName},</Text>

          <Text style={text}>
            Dziękujemy za zakup dostępu do <strong>{moduleName}</strong> w programie
            Przestrzeń Zdrowej Kobiety.
          </Text>

          <Section style={box}>
            <Text style={boxText}>
              ✅ Dostęp aktywny do: <strong>{expiresAt}</strong>
            </Text>
          </Section>

          <Text style={text}>
            Możesz już korzystać z materiałów edukacyjnych, filmów i tworzyć własne notatki.
          </Text>

          <Link href={catalogUrl} style={button}>
            Przejdź do katalogu PZK
          </Link>

          <Text style={footer}>
            Pozdrawiam,<br />
            Paulina Maciak<br />
            Dietetyk Kliniczny
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

// Style...
const main = { backgroundColor: '#f6f9fc', fontFamily: 'sans-serif' }
const container = { margin: '0 auto', padding: '20px 0 48px', maxWidth: '580px' }
const h1 = { color: '#4A7C59', fontSize: '24px', fontWeight: 'bold' }
const text = { color: '#2C3E3A', fontSize: '16px', lineHeight: '26px' }
const box = { backgroundColor: '#F9F6F3', padding: '16px', borderRadius: '8px', margin: '24px 0' }
const boxText = { margin: 0, color: '#2C3E3A', fontSize: '16px' }
const button = {
  backgroundColor: '#4A7C59',
  borderRadius: '8px',
  color: '#fff',
  display: 'inline-block',
  fontSize: '16px',
  fontWeight: 'bold',
  padding: '12px 24px',
  textDecoration: 'none',
  textAlign: 'center' as const,
  margin: '24px 0'
}
const footer = { color: '#8898aa', fontSize: '14px', lineHeight: '22px', marginTop: '32px' }
```

### 5.2 Wysyłanie Emaila

W `PzkPurchaseService.activateModuleAccess()`:

```typescript
import { render } from '@react-email/render'
import PzkPurchaseConfirmation from '@/emails/PzkPurchaseConfirmation'
import { sendEmail } from '@/lib/email' // Istniejący SMTP sender

// ... po dodaniu wpisu do pzk_module_access ...

// Formatuj datę wygaśnięcia
const expiresAtFormatted = format(expiresAt, 'd MMMM yyyy', { locale: pl })

// Renderuj email
const emailHtml = render(
  <PzkPurchaseConfirmation
    userName={user.firstName || user.email}
    moduleName={`Moduł ${module}`}
    expiresAt={expiresAtFormatted}
    catalogUrl="https://paulinamaciak.pl/pacjent/pzk/katalog"
  />
)

// Wyślij email
await sendEmail({
  to: user.email,
  subject: 'Potwierdzenie zakupu - Przestrzeń Zdrowej Kobiety',
  html: emailHtml
})
```

---

## 6. Bezpieczeństwo

### 6.1 Weryfikacja Webhook Signature

**Krytyczne:** Webhook od Tpay MUSI być zweryfikowany, aby zapobiec fałszywym powiadomieniom.

**Algorytm:**
```typescript
function verifyTpaySignature(payload: object, receivedSignature: string): boolean {
  // 1. Sortuj klucze alfabetycznie
  const sortedKeys = Object.keys(payload).sort()

  // 2. Konkatenuj wartości (bez kluczy)
  const values = sortedKeys.map(key => payload[key]).join('')

  // 3. Dodaj CLIENT_SECRET na końcu
  const stringToHash = values + process.env.TPAY_CLIENT_SECRET

  // 4. Oblicz MD5 hash
  const calculatedSignature = crypto
    .createHash('md5')
    .update(stringToHash)
    .digest('hex')

  // 5. Porównaj
  return calculatedSignature === receivedSignature
}
```

**Dokumentacja:** https://docs-api.tpay.com/#!/webhook/post_webhooks_verify

### 6.2 HTTPS Only

Webhook URL **MUSI** używać HTTPS:
- ✅ `https://paulinamaciak.pl/api/pzk/purchase/callback`
- ❌ `http://paulinamaciak.pl/api/pzk/purchase/callback`

Vercel zapewnia automatyczne HTTPS.

### 6.3 Rate Limiting

**Endpoint:** `POST /api/pzk/purchase/initiate`
**Limit:** 5 żądań/minutę/użytkownik

Implementacja w middleware lub bezpośrednio w endpoincie (in-memory Map).

### 6.4 Idempotencja Webhook

Sprawdzenie przed przetworzeniem callback:

```typescript
// Pobierz transakcję
const transaction = await db.query.pzkTransactions.findFirst({
  where: eq(pzkTransactions.id, transactionId)
})

// Jeśli już przetworzona - zwróć sukces bez zmian
if (transaction.status !== 'pending') {
  console.log(`[Webhook] Transaction ${transactionId} already processed (status: ${transaction.status})`)
  return new Response('TRUE', { status: 200 })
}

// Kontynuuj przetwarzanie...
```

### 6.5 Logowanie Zdarzeń

Wszystkie operacje związane z płatnościami logować w `events` table:

- `pzk_purchase_initiated` - rozpoczęcie zakupu
- `pzk_payment_success` - udana płatność
- `pzk_payment_failed` - nieudana płatność
- `pzk_access_activated` - aktywacja dostępu

Properties:
```json
{
  "transactionId": "uuid",
  "module": 1,
  "amount": "299.00",
  "tpayTransactionId": "TR-XXX"
}
```

---

## 7. Testy

### 7.1 Testy Jednostkowe

**TpayService:**
- ✅ Poprawne tworzenie transaction request
- ✅ Weryfikacja signature (prawidłowy/nieprawidłowy)
- ✅ Obsługa błędów API Tpay

**PzkTransactionService:**
- ✅ Tworzenie transakcji
- ✅ Aktualizacja statusu
- ✅ Sprawdzanie duplikatów

**PzkPurchaseService:**
- ✅ Blokowanie zakupu przy aktywnym dostępie
- ✅ Prawidłowa aktywacja dostępu (12 miesięcy)
- ✅ Wysyłanie emaila po sukcesie

### 7.2 Testy Integracyjne

**Endpoint: POST /api/pzk/purchase/initiate**
- ✅ 401 dla niezalogowanego
- ✅ 400 dla nieprawidłowego module
- ✅ 409 dla użytkownika z aktywnym dostępem
- ✅ 200 + redirect URL dla poprawnego żądania

**Endpoint: POST /api/pzk/purchase/callback**
- ✅ Odrzucenie nieprawidłowego signature
- ✅ Prawidłowe przetworzenie success callback
- ✅ Prawidłowe przetworzenie failed callback
- ✅ Idempotencja (duplikowane callback)

### 7.3 Testy E2E (Manualne w Sandbox)

1. Zakup modułu 1 jako zalogowany użytkownik
2. Płatność testowa w Tpay Sandbox
3. Weryfikacja aktywacji dostępu
4. Sprawdzenie emaila potwierdzającego
5. Próba ponownego zakupu tego samego modułu → blokada

**Karta testowa Tpay Sandbox:**
- Numer: 4111 1111 1111 1111
- CVV: 123
- Data wygaśnięcia: 12/25

---

## 8. Plan Implementacji Krok po Kroku

### Krok 1: Przygotowanie Infrastruktury (30 min)
- [ ] Utworzyć konto Tpay Sandbox (jeśli nie istnieje)
- [ ] Pobrać `TPAY_CLIENT_ID` i `TPAY_CLIENT_SECRET` z panelu Tpay
- [ ] Dodać zmienne środowiskowe do `.env.local`
- [ ] Dodać zmienne do Vercel Environment Variables (Production/Preview)
- [ ] Wygenerować migrację dla tabeli `pzk_transactions` (`npm run db:generate`)
- [ ] Zastosować migrację (`npm run db:push`)

### Krok 2: Backend - Services (2h)
- [ ] Implementacja `TpayService` (`src/lib/services/tpayService.ts`)
  - [ ] `createTransaction()`
  - [ ] `verifyWebhookSignature()`
  - [ ] Testy jednostkowe
- [ ] Implementacja `PzkTransactionService` (`src/lib/services/pzkTransactionService.ts`)
  - [ ] `createTransaction()`
  - [ ] `updateTransactionStatus()`
  - [ ] `getUserTransactions()`
  - [ ] Testy jednostkowe
- [ ] Implementacja `PzkPurchaseService` (`src/lib/services/pzkPurchaseService.ts`)
  - [ ] `initiatePurchase()`
  - [ ] `processPaymentCallback()`
  - [ ] `activateModuleAccess()`
  - [ ] Testy jednostkowe

### Krok 3: Backend - API Endpoints (1.5h)
- [ ] `POST /api/pzk/purchase/initiate`
  - [ ] Walidacja Zod schema
  - [ ] Sprawdzenie duplikatu dostępu
  - [ ] Wywołanie Tpay API
  - [ ] Testy integracyjne
- [ ] `POST /api/pzk/purchase/callback`
  - [ ] Weryfikacja signature
  - [ ] Przetworzenie callback
  - [ ] Aktywacja dostępu
  - [ ] Testy integracyjne
- [ ] `GET /api/auth/session` (opcjonalnie)

### Krok 4: Frontend - Purchase Flow (1.5h)
- [ ] Komponent `PzkPurchaseButton.tsx`
  - [ ] Logika sprawdzenia auth
  - [ ] Wywołanie initiate endpoint
  - [ ] Przekierowanie do Tpay
- [ ] Aktualizacja `PzkPurchaseModules.astro`
- [ ] Strona `/pzk/platnosc/sukces.astro`
- [ ] Strona `/pzk/platnosc/blad.astro`

### Krok 5: Email Template (45 min)
- [ ] Utworzenie `PzkPurchaseConfirmation.tsx`
- [ ] Integracja z `sendEmail()`
- [ ] Test preview (`npm run email:dev`)

### Krok 6: Testy E2E (1h)
- [ ] Zakup modułu w Tpay Sandbox
- [ ] Weryfikacja aktywacji dostępu w DB
- [ ] Sprawdzenie emaila
- [ ] Testy blokady duplikatu

### Krok 7: Dokumentacja i Deploy (30 min)
- [ ] Aktualizacja `CLAUDE.md` (nowe zmienne env)
- [ ] Commit i push do repo
- [ ] Deploy na Vercel (automatyczny)
- [ ] Weryfikacja webhook URL w panelu Tpay
- [ ] Smoke test na Preview

**Łączny czas:** ~7.5 godziny

---

## 9. Monitoring i Obsługa Błędów

### 9.1 Logowanie

**Co logować:**
- Wszystkie wywołania Tpay API (request + response)
- Wszystkie webhook callbacks (raw payload + signature status)
- Błędy podczas przetwarzania płatności
- Aktywacje dostępu

**Format:**
```typescript
console.log('[TpayService] Creating transaction', {
  userId,
  module,
  amount,
  timestamp: new Date().toISOString()
})

console.error('[PurchaseCallback] Signature verification failed', {
  receivedSignature,
  transactionId,
  timestamp: new Date().toISOString()
})
```

### 9.2 Obsługa Błędów Tpay API

**Możliwe błędy:**
- 400 Bad Request - nieprawidłowe dane
- 401 Unauthorized - błędne credentials
- 500 Internal Server Error - problem po stronie Tpay

**Strategia:**
- Logowanie błędu
- Zwrócenie przyjaznego komunikatu użytkownikowi
- NIE ujawnianie szczegółów technicznych

### 9.3 Retry Logic

**Dla webhook callback:**
Tpay automatycznie retryuje webhook w przypadku błędu (HTTP 5xx).

**Dla API calls:**
Implementacja retry z exponential backoff dla przejściowych błędów sieci.

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (maxRetries === 0) throw error
    await new Promise(resolve => setTimeout(resolve, delay))
    return withRetry(fn, maxRetries - 1, delay * 2)
  }
}
```

---

## 10. Przyszłe Rozszerzenia (Post-MVP)

### 10.1 Zwroty (Refunds)
- Endpoint `POST /api/pzk/purchase/refund`
- Wywołanie Tpay Refund API
- Cofnięcie dostępu (ustawienie `revokedAt`)

### 10.2 Panel Administracyjny
- Lista wszystkich transakcji
- Filtrowanie po statusie, module, dacie
- Manualna aktywacja/dezaktywacja dostępu

### 10.3 Rabaty i Kody Promocyjne
- Tabela `discount_codes`
- Walidacja kodu przed płatnością
- Obliczanie zniżki

### 10.4 Pakiety (Bundle)
- Zakup wszystkich 3 modułów ze zniżką
- Cena promocyjna dla pakietu

### 10.5 Subskrypcje Cykliczne
- Płatność automatyczna co 12 miesięcy
- Tpay Recurring Payments API

---

## 11. Pytania Otwarte / Odpowiedzi

1. **Faktura VAT:** ❌ NIE - Brak automatycznego generowania faktur
2. **Logo w Tpay Form:** ❌ NIE - Bez uploadu logo do formularza płatności
3. **Historia Zakupów UI:** ❌ NIE - Brak dedykowanej strony z listą transakcji (dane będą w DB, ale bez UI w MVP)
4. **Webhook Retry:** ⏳ Do ustalenia w trakcie implementacji (Tpay ma wbudowany retry mechanism)
5. **Anulowanie Transakcji:** ⏳ Post-MVP (nie priorytet)

---

## 12. Dokumentacja Tpay

**Kluczowe linki:**
- Dokumentacja API: https://docs-api.tpay.com
- Panel Sandbox: https://panel.sandbox.tpay.com
- Panel Production: https://panel.tpay.com
- Transaction API: https://docs-api.tpay.com/#!/transaction
- Webhook Guide: https://docs-api.tpay.com/#!/webhook

**Kontakt z Tpay:**
- Support email: support@tpay.com
- Sandbox issues: sandbox@tpay.com

---

## 13. Checklisty

### Pre-Production Checklist
- [ ] Zmienne środowiskowe ustawione na Production
- [ ] Migracja DB zastosowana na Production
- [ ] Webhook URL zweryfikowany w panelu Tpay
- [ ] HTTPS działa prawidłowo
- [ ] Testy E2E wykonane w Sandbox
- [ ] Email SMTP skonfigurowany
- [ ] Monitoring i logi działają
- [ ] Backup bazy danych przed startem

### Go-Live Checklist
- [ ] Zmiana `TPAY_ENVIRONMENT` z `sandbox` na `production`
- [ ] Aktualizacja `TPAY_CLIENT_ID` i `TPAY_CLIENT_SECRET` na production keys
- [ ] Weryfikacja cen modułów w `.env`
- [ ] Test zakupu z prawdziwą kartą (mała kwota)
- [ ] Monitoring pierwszych transakcji

---

**Koniec Planu**

---

## Uwagi końcowe

Ten plan jest szczegółowy i gotowy do implementacji. Przed rozpoczęciem upewnij się, że:
1. Masz dostęp do konta Tpay Sandbox
2. Wszystkie zmienne środowiskowe są poprawnie skonfigurowane
3. Baza danych jest zsynchronizowana (migracja zastosowana)

Implementacja powinna zająć około 7-8 godzin pracy i jest podzielona na niezależne kroki, które można realizować iteracyjnie.

Jeśli masz pytania lub wątpliwości dotyczące któregokolwiek punktu - daj znać przed rozpoczęciem implementacji!
