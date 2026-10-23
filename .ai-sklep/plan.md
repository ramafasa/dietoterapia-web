# Sklep z ebookami – plan wdrożenia

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (lub superpowers:subagent-driven-development) to implement this plan task-by-task.

**Cel:** Sklep z ebookami na paulinamaciak.pl z zakupem bez konta, koszykiem, płatnością Tpay, dostarczaniem PDF przez link z maila i opcjonalnym kontem `customer` z historią zakupów. Na start jeden produkt: „Proteinowa Piekarnia”, 29 zł.

**Architektura:** Nowy, samodzielny moduł `sklep` obok PZK. Wspólnie używa tylko `TpayService` (API Tpay i weryfikacja JWS), `transactions` (zapis płatności), `s3-presign` (pliki w R2), mechanizmu tokenów (SHA-256) i wysyłki maili. Zamówienie (`shop_orders` / `shop_order_items`) jest źródłem prawdy o dostępie do plików. Konto jest tylko wygodnym widokiem zamówień przypisanych do `userId`. Treść stron produktów żyje w Content Collection, a dane handlowe (cena, status, plik) w bazie.

**Tech stack:** Astro 5 SSR (Vercel), React 19 islands, Drizzle ORM + Neon Postgres, Lucia v3, Tpay API v2, Cloudflare R2 (`@aws-sdk/client-s3`), react-email + nodemailer (OVH), Zod, Vitest + testcontainers, Playwright.

**Decyzje:** `.ai-sklep/decyzje.md` (16 decyzji + doprecyzowania). Teksty prawne do akceptacji: `.ai-sklep/regulamin-sklepu.md` i `.ai-sklep/polityka-prywatnosci-zmiany.md`.

---

## 0. Zanim zaczniesz

### 0.1 Fakty o kodzie, na które plan się powołuje

- `src/middleware/index.ts`: kolejność `csrf → auth → rbac`. Webhook musi być w `CSRF_EXEMPT_PATHS` (`src/middleware/csrf.ts:5`).
- `src/middleware/rbac.ts:47`: każdy nie-`patient` na `/pacjent/*` jest przekierowywany do `/dietetyk/dashboard`. Dla `customer` dałoby to pętlę przekierowań, trzeba to zmienić (Task 6.1).
- `src/components/LoginForm.tsx:22`: mapa przekierowań po logowaniu dla ról (dodać `customer`).
- `src/pages/api/auth/login.ts`: login sprawdza `user.status !== 'active'`. Bez zmian: konto `customer` powstaje dopiero linkiem z maila, więc od razu potwierdzone (decyzja 9, zmiana 2026-10-22).
- Hasła: klient wysyła SHA-256 (`hashPasswordClient` w `src/lib/crypto.ts`), serwer robi `hashPasswordV2` (`src/lib/password.ts:38`). Formularz „Ustaw hasło” na `/sklep/konto/{token}` robi to samo (checkout nie przyjmuje hasła).
- `transactions.userId` ma `NOT NULL` + `onDelete: 'restrict'` (`src/db/schema.ts:176`).
- `TpayService.createTransaction()` przyjmuje `notificationUrl` i `returnUrl` per transakcja (`src/lib/services/tpayService.ts`), więc sklep ma własny webhook bez zmian w serwisie.
- **Webhook PZK nie sprawdza `tr_amount`.** Sklep musi to robić (Task 3.4).
- `tests/helpers/db-container.ts:101` `cleanDatabase()` **nie czyści `transactions`**. Dopisujemy nowe tabele i `transactions` (Task 1.6).
- `vercel.json` ma crony `/api/cron/friday-reminder` i `sunday-reminder`, ale **te endpointy nie istnieją** w `src/pages/api`. Nie ruszamy ich. Dopisujemy tylko nowy cron.
- Plik ebooka: `e-book Proteinowa piekarnia Paulina Maciak.pdf` waży **86 MB**. Działa przez presigned URL, ale to dużo na telefon (patrz 0.3).

### 0.2 Zmienne środowiskowe (nowe)

```bash
FF_SKLEP=false                     # true = katalog, koszyk i zamówienia dostępne
CRON_SECRET=***                    # Vercel Cron wysyła "Authorization: Bearer $CRON_SECRET"
SHOP_OWNER_NOTIFICATION_EMAILS=dietoterapia@paulinamaciak.pl,rafalmaciak@gmail.com
```

Pozostałe (`TPAY_*`, `OBJECT_STORAGE_*`, `SMTP_*`, `SITE_URL`) już istnieją. **Uwaga:** `TPAY_NOTIFICATION_URL` jest dziś adresem webhooka PZK. Sklep **nie** może go używać, tylko buduje `${SITE_URL}/api/sklep/platnosc/callback`.

### 0.3 Kroki ręczne (poza kodem)

1. **Zmniejszyć PDF** (rekomendacja): 86 MB to ~1 minuta pobierania na słabym LTE. Wystarczy eksport z kompresją zdjęć do 150 dpi w Canvie lub programie, w którym ebook powstał, albo `gs -sDEVICE=pdfwrite -dPDFSETTINGS=/ebook`. Cel: 10–20 MB. Sprawdzić, czy linki w spisie treści („Klik”) dalej działają.
2. Wgrać PDF do R2 skryptem z Task 8.2.
3. Regulamin i zmiany w polityce prywatności: Paulina akceptuje treść, **najlepiej po przeglądzie prawnika** (drafty w `.ai-sklep/`).
4. Tpay: w panelu nic nie trzeba zmieniać, bo URL powiadomień idzie w każdej transakcji.
5. Vercel: dodać `FF_SKLEP`, `CRON_SECRET` i `SHOP_OWNER_NOTIFICATION_EMAILS` (Preview + Production).

### 0.4 Kolejność i gałąź

Gałąź: `ebook-sales-tpay` (bieżąca). Fazy idą po kolei, a w obrębie fazy commit po każdym tasku. Do momentu Task 10.3 `FF_SKLEP=false` na produkcji, więc można mergować etapami.

---

## Mapa modułu

```
src/
├── content.config.ts                       # NOWY – kolekcja "ebooks"
├── content/ebooks/proteinowa-piekarnia.md  # NOWY – treść strony produktu
├── assets/sklep/proteinowa-piekarnia/      # NOWY – okładka, kolaż, podglądy stron
├── db/schema.ts                            # products, product_price_history, shop_orders,
│                                           # shop_order_items, shop_download_tokens,
│                                           # shop_account_tokens; users.emailVerifiedAt;
│                                           # transactions.userId nullable + shopOrderId
├── lib/shop/
│   ├── money.ts                            # grosze <-> "29.00"
│   ├── cart.ts                             # (client) localStorage koszyka
│   ├── pixel.ts                            # (client) zdarzenia Meta Pixel
│   ├── constants.ts                        # TTL-e, wersja regulaminu, treści zgód
│   ├── mailer.ts                           # interfejs ShopMailer (+ tymczasowy pendingShopMailer do Fazy 5)
│   ├── safeLog.ts                          # truncateForLog, dbErrorLog (logi bez danych osobowych)
│   └── guards.ts                           # checkShopFeatureEnabled()
├── lib/repositories/
│   ├── productRepository.ts
│   └── shopOrderRepository.ts
├── lib/services/
│   ├── shopCheckoutService.ts              # wycena koszyka, tworzenie zamówienia + Tpay
│   ├── shopPaymentService.ts               # obsługa webhooka (idempotentna)
│   ├── shopTokenService.ts                 # tokeny pobrania i konta (hash SHA-256)
│   ├── shopDownloadService.ts              # presigned URL dla pozycji zamówienia
│   ├── shopAccountService.ts               # potwierdzenie/założenie konta, przypinanie zamówień
│   ├── shopMailService.ts                  # maile do klientki i do Pauliny
│   └── shopMaintenanceService.ts           # cron: expire / cleanup / anonimizacja
├── emails/
│   ├── ShopOrderConfirmation.tsx
│   ├── ShopDownloadLinks.tsx
│   └── ShopOwnerNotification.tsx
├── components/sklep/                       # wyspy React: CartIcon, AddToCartButton,
│                                           # CartCheckout, PaymentStatus, ResendLinkForm,
│                                           # AccountSetupForm, PurchasesList, DeleteAccountButton
└── pages/
    ├── sklep/index.astro, [slug].astro, koszyk.astro
    ├── sklep/platnosc/sukces.astro, blad.astro
    ├── sklep/pobierz/[token].astro, wyslij-link.astro, konto/[token].astro
    ├── konto/zakupy.astro, ustawienia.astro
    ├── dietetyk/zamowienia.astro
    ├── regulamin-sklepu.astro
    └── api/
        ├── sklep/cart/quote.ts, orders.ts, orders/[id]/status.ts
        ├── sklep/platnosc/callback.ts
        ├── sklep/pobierz/[token]/[itemId].ts, sklep/orders/[id]/items/[itemId]/download.ts
        ├── sklep/resend-link.ts, sklep/konto/[token].ts
        ├── konto/zakupy/[itemId]/download.ts, konto/delete.ts
        ├── dietitian/shop-orders/[id]/resend.ts
        └── cron/shop-maintenance.ts
```

---

## Faza 1: Model danych

### Task 1.1: Tabele produktów i historii cen

**Files:**
- Modify: `src/db/schema.ts` (dopisać po sekcji `transactions`)

**Step 1: Dopisz schemat**

```ts
// ===== SHOP: PRODUCTS =====
// Dane handlowe produktu. Treść strony produktu: src/content/ebooks/<slug>.md
export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 100 }).unique().notNull(), // = id wpisu w kolekcji "ebooks"
  type: varchar('type', { length: 20 }).notNull(), // 'ebook'
  title: varchar('title', { length: 255 }).notNull(), // snapshotowany do pozycji zamówienia
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).default('PLN').notNull(),
  status: varchar('status', { length: 20 }).notNull(), // 'draft' | 'active' | 'archived'
  fileObjectKey: varchar('file_object_key', { length: 500 }).notNull(), // klucz w R2
  fileName: varchar('file_name', { length: 255 }).notNull(), // nazwa pliku przy pobieraniu
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// ===== SHOP: PRICE HISTORY (Omnibus – najniższa cena z 30 dni) =====
export const productPriceHistory = pgTable('product_price_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }).notNull(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  validFrom: timestamp('valid_from', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  productValidFromIndex: index('idx_product_price_history_product').on(table.productId, sql`${table.validFrom} DESC`),
}))
```

Dopisz typy na końcu pliku, wzorując się na istniejących (`export type Product = typeof products.$inferSelect` itd.).

### Task 1.2: Zamówienia, pozycje, tokeny

**Files:**
- Modify: `src/db/schema.ts`

```ts
// ===== SHOP: ORDERS =====
// Źródło prawdy o zakupie. userId opcjonalne (zakup bez konta).
export const shopOrders = pgTable('shop_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderNumber: varchar('order_number', { length: 20 }).unique().notNull(), // ZAM-2026-00001
  email: varchar('email', { length: 255 }).notNull(), // lowercase; anonimizowany po 5 latach
  firstName: varchar('first_name', { length: 100 }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 20 }).notNull(), // 'pending' | 'paid' | 'failed' | 'expired'
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).default('PLN').notNull(),

  // Faktura (na żądanie, wystawiana ręcznie)
  invoiceRequested: boolean('invoice_requested').default(false).notNull(),
  invoiceCompanyName: varchar('invoice_company_name', { length: 255 }),
  invoiceNip: varchar('invoice_nip', { length: 10 }),
  invoiceAddress: text('invoice_address'),

  // Zgody – snapshot z chwili zamówienia (dowód dla art. 38 ust. 1 pkt 13 u.p.k.)
  termsVersion: varchar('terms_version', { length: 20 }).notNull(),
  termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }).notNull(),
  digitalContentConsentAt: timestamp('digital_content_consent_at', { withTimezone: true }).notNull(),
  digitalContentConsentText: text('digital_content_consent_text').notNull(),

  // Klientka zaznaczyła „Załóż konto” (bez hasła). Konto powstaje dopiero linkiem z maila (shop_account_tokens).
  // Wpływa tylko na treść maila. Ignorowane dla zalogowanych. Migracja 0008.
  accountRequested: boolean('account_requested').default(false).notNull(),

  // Sekret strony sukcesu (httpOnly cookie) – pozwala pobrać plik zaraz po płatności
  checkoutSecretHash: varchar('checkout_secret_hash', { length: 64 }),

  // Potwierdzenie umowy na trwałym nośniku (art. 21 ust. 1 u.p.k.) wysłane. Dopóki NULL, żadne wejście
  // (strona sukcesu, link, konto) NIE wydaje pliku – inaczej wyłączenie prawa odstąpienia nie działa.
  confirmationSentAt: timestamp('confirmation_sent_at', { withTimezone: true }),

  paidAt: timestamp('paid_at', { withTimezone: true }),
  anonymizedAt: timestamp('anonymized_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  emailIndex: index('idx_shop_orders_email').on(table.email),
  userIdIndex: index('idx_shop_orders_user_id').on(table.userId),
  statusCreatedIndex: index('idx_shop_orders_status_created').on(table.status, table.createdAt),
}))

export const shopOrderItems = pgTable('shop_order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').references(() => shopOrders.id, { onDelete: 'cascade' }).notNull(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'restrict' }).notNull(),
  titleSnapshot: varchar('title_snapshot', { length: 255 }).notNull(),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
  fileObjectKey: varchar('file_object_key', { length: 500 }), // NULL = plik produktu (przyszły znak wodny)
}, (table) => ({
  uniqueOrderProduct: uniqueIndex('idx_shop_order_items_order_product').on(table.orderId, table.productId),
}))

// Link "/sklep/pobierz/{token}" – 30 dni, bez limitu pobrań
export const shopDownloadTokens = pgTable('shop_download_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').references(() => shopOrders.id, { onDelete: 'cascade' }).notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).unique().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// Link "/sklep/konto/{token}" – dowód własności skrzynki: załóż konto (ustaw hasło) lub przypisz zakup
export const shopAccountTokens = pgTable('shop_account_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).unique().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
```

### Task 1.3: Zmiany w `users` i `transactions`

**Files:**
- Modify: `src/db/schema.ts:5-31` (users), `:174-210` (transactions)

```ts
// users
role: varchar('role', { length: 20 }).notNull(), // 'patient' | 'dietitian' | 'customer'
// Data potwierdzenia e-maila. customer: zawsze ustawione (konto powstaje linkiem z maila). Login go nie sprawdza.
emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),

// transactions
userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }), // NULL = zakup w sklepie bez konta
shopOrderId: uuid('shop_order_id').references(() => shopOrders.id, { onDelete: 'restrict' }),
```

Zaktualizuj komentarz nad `transactions`: `item = 'SHOP_ORDER'` dla zamówień sklepu.

> `shopOrders` musi być zadeklarowane **przed** `transactions` albo trzeba użyć leniwego `() => shopOrders.id` (Drizzle to akceptuje). Umieść sekcję SHOP nad `transactions`.

**Uwaga dla PZK:** `PzkPurchaseService` zakłada `transaction.userId` != null. Typ zmieni się na `string | null`. Popraw kompilację asercją `transaction.userId!` w `activateModuleAccess` (PZK zawsze tworzy transakcje z userId). Nie zmieniaj logiki.

### Task 1.4: Migracja

**Step 1:** `npm run db:generate`

**Step 2:** Dopisz ręcznie na końcu wygenerowanego pliku `drizzle/0007_*.sql` (wzorem CHECK-ów PZK):

```sql
CREATE SEQUENCE IF NOT EXISTS shop_order_number_seq START 1;
--> statement-breakpoint
UPDATE "users" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_status_check" CHECK ("status" IN ('draft','active','archived'));
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_type_check" CHECK ("type" IN ('ebook'));
--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_status_check" CHECK ("status" IN ('pending','paid','failed','expired'));
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("role" IN ('patient','dietitian','customer'));
```

> Przed dodaniem `users_role_check` sprawdź na produkcji `SELECT DISTINCT role FROM users;`. Jeśli są inne wartości, pomiń ten CHECK.

**Step 3:** Przejrzyj SQL: `ALTER TABLE transactions ALTER COLUMN user_id DROP NOT NULL` ma być obecne.

**Step 4:** `npm run test:integration -- tests/integration/database/users.test.ts`. Testcontainers odpala wszystkie migracje, więc test pokaże błąd SQL. Expected: PASS.

**Step 5:** Commit `feat(sklep): schemat bazy sklepu (produkty, zamówienia, tokeny)`

> **Po review fazy 3 (2026-10-22):** osobna migracja `drizzle/0008_shop_account_requested.sql` dodaje `shop_orders.account_requested boolean DEFAULT false NOT NULL` (checkbox „Załóż konto” bez hasła, decyzja 9).

### Task 1.5: Pomocnik kwot

**Files:**
- Create: `src/lib/shop/money.ts`
- Test: `tests/unit/lib/shop/money.test.ts`

**Step 1: Test (failing)**

```ts
import { describe, it, expect } from 'vitest'
import { toGrosze, fromGrosze, sumPrices } from '@/lib/shop/money'

describe('money', () => {
  it('parses decimal strings to integer grosze', () => {
    expect(toGrosze('29.00')).toBe(2900)
    expect(toGrosze('0.10')).toBe(10)
    expect(toGrosze('29')).toBe(2900)
  })
  it('formats grosze as decimal string', () => {
    expect(fromGrosze(2900)).toBe('29.00')
    expect(fromGrosze(5)).toBe('0.05')
  })
  it('sums without float errors', () => {
    expect(sumPrices(['0.10', '0.20'])).toBe('0.30')
  })
  it('rejects malformed input', () => {
    expect(() => toGrosze('29,00')).toThrow()
    expect(() => toGrosze('-1.00')).toThrow()
  })
})
```

**Step 2:** `npx vitest run tests/unit/lib/shop/money.test.ts`. Expected: FAIL (moduł nie istnieje).

**Step 3: Implementacja**

```ts
// Kwoty w bazie: decimal(10,2) jako string. Obliczenia: integer grosze.
const DECIMAL_RE = /^\d+(\.\d{1,2})?$/

export function toGrosze(value: string): number {
  if (!DECIMAL_RE.test(value)) throw new Error(`Invalid amount: ${value}`)
  const [zl, gr = ''] = value.split('.')
  return Number(zl) * 100 + Number(gr.padEnd(2, '0'))
}

export function fromGrosze(grosze: number): string {
  if (!Number.isInteger(grosze) || grosze < 0) throw new Error(`Invalid grosze: ${grosze}`)
  return `${Math.floor(grosze / 100)}.${String(grosze % 100).padStart(2, '0')}`
}

export function sumPrices(prices: string[]): string {
  return fromGrosze(prices.reduce((acc, p) => acc + toGrosze(p), 0))
}

export function formatPLN(value: string): string {
  return `${value.replace('.', ',')} zł`
}
```

**Step 4:** test PASS. **Step 5:** commit.

### Task 1.6: Testy: sprzątanie i fixture'y

**Files:**
- Modify: `tests/helpers/db-container.ts:101` (`cleanDatabase`). Dopisz **na początku**, przed PZK:
  ```ts
  await database.delete(schema.transactions);
  await database.delete(schema.shopDownloadTokens);
  await database.delete(schema.shopAccountTokens);
  await database.delete(schema.shopOrderItems);
  await database.delete(schema.shopOrders);
  await database.delete(schema.productPriceHistory);
  await database.delete(schema.products);
  ```
- Create: `tests/fixtures/shop.ts` z `createProduct(db, overrides)` (domyślnie slug `proteinowa-piekarnia`, price `'29.00'`, status `active`, `fileObjectKey: 'products/ebooks/test.pdf'`) i `createPaidOrder(db, { email, productIds, userId? })`.
- Modify: `tests/helpers/fixtures.ts`: `createUser` przyjmuje `role: 'customer'` i `emailVerifiedAt` (domyślnie `now` dla `customer`).

Run: `npm run test:integration`. Expected: wszystko PASS (regresja). Commit.

---

## Faza 2: Katalog i koszyk

### Task 2.1: Feature flag + guard

> Częściowo zrobione przy regulaminie: `'SKLEP'` jest już w `FeatureFlag`, a `/regulamin-sklepu` i link w stopce zależą od flagi. Zostaje guard i reguły w `rbac.ts`.

**Files:**
- Modify: `src/lib/feature-flags.ts:11`: `export type FeatureFlag = 'STREFA_PACJENTA' | 'PZK' | 'SKLEP'`
- Create: `src/lib/shop/guards.ts`: `checkShopFeatureEnabled(context)` wzorem `src/lib/pzk/guards.ts` (przeczytaj i skopiuj kształt odpowiedzi 404).
- Modify: `src/middleware/rbac.ts`: blok jak dla PZK, ale **tylko** dla ścieżek sprzedażowych:

```ts
// Feature flag: FF_SKLEP wyłącza tylko sprzedaż. Dostarczenie zakupionych plików, konto i webhook
// działają zawsze (klientki, które już zapłaciły, muszą mieć dostęp).
const isShopEnabled = isFeatureEnabled('SKLEP')
const SHOP_ALWAYS_ON = ['/sklep/pobierz/', '/sklep/konto/', '/sklep/wyslij-link', '/sklep/platnosc/',
  '/api/sklep/pobierz/', '/api/sklep/konto/', '/api/sklep/resend-link', '/api/sklep/platnosc/callback',
  '/api/sklep/orders/'] // status + download po płatności
const isShopRoute = url.pathname === '/sklep' || url.pathname.startsWith('/sklep/') || url.pathname.startsWith('/api/sklep/')
const isShopAlwaysOn = SHOP_ALWAYS_ON.some((p) => url.pathname.startsWith(p)) && url.pathname !== '/api/sklep/orders'
if (!isShopEnabled && isShopRoute && !isShopAlwaysOn) {
  return new Response(null, { status: 404, statusText: 'Not Found' })
}
```

- Test: dopisz przypadki do `tests/integration/middleware/rbac.test.ts` (sprawdź, jak testuje FF PZK, i powiel: `/sklep` → 404 przy wyłączonej fladze, `/sklep/pobierz/x` → nie 404, `POST /api/sklep/orders` → 404).

Commit.

### Task 2.2: Repozytorium produktów

**Files:**
- Create: `src/lib/repositories/productRepository.ts`
- Test: `tests/integration/database/products.test.ts`

Metody (wzorem `pzkAccessRepository.ts`, klasa z `constructor(private db: Database)`):
- `findActiveBySlugs(slugs: string[]): Promise<Product[]>`
- `findBySlug(slug: string): Promise<Product | null>`
- `listActive(): Promise<Product[]>`
- `lowestPriceInLast30Days(productId, now = new Date()): Promise<string | null>`. Najniższa `price` z `product_price_history`, gdzie `validFrom >= now - 30d`, **plus** cena obowiązująca na początku okna (ostatni wpis sprzed okna). Na razie nieużywana w UI, przygotowana pod promocje.

Testy: aktywne vs `draft/archived`, puste wejście `[]` zwraca `[]` (bez zapytania z pustym `IN`), najniższa cena z historią przed oknem i w oknie.

TDD jak w 1.5. Commit.

### Task 2.3: Wycena koszyka (serwis + endpoint)

**Files:**
- Create: `src/lib/services/shopCheckoutService.ts` (na razie tylko `quoteCart`)
- Create: `src/pages/api/sklep/cart/quote.ts`
- Test: `tests/integration/services/shopCheckoutService.test.ts`

```ts
export interface CartQuote {
  items: { productId: string; slug: string; title: string; price: string }[]
  removedSlugs: string[] // nieistniejące / nieaktywne – UI pokazuje komunikat i czyści koszyk
  total: string
}

async quoteCart(slugs: string[]): Promise<CartQuote> {
  const unique = [...new Set(slugs)].slice(0, 20)
  const found = await this.products.findActiveBySlugs(unique)
  const bySlug = new Map(found.map((p) => [p.slug, p]))
  const items = unique.flatMap((s) => {
    const p = bySlug.get(s)
    return p ? [{ productId: p.id, slug: p.slug, title: p.title, price: p.price }] : []
  })
  return {
    items,
    removedSlugs: unique.filter((s) => !bySlug.has(s)),
    total: sumPrices(items.map((i) => i.price)),
  }
}
```

Endpoint: `POST { slugs: string[] }` (Zod: `z.array(z.string().regex(/^[a-z0-9-]{1,100}$/)).max(20)`), zwraca `{ data: CartQuote, error: null }`. Rate limit IP: `checkPublicRateLimit` / `recordPublicRequest` z `src/lib/rate-limit-public.ts`. **Uwaga:** ten limiter ma 5 req/h na IP (przeznaczony do formularzy kontaktowych). Do quote dodaj w `rate-limit-public.ts` osobny licznik `checkShopRateLimit(ip)` 60 req/10 min (ta sama technika Map + GC). Testy: duplikaty, nieaktywny produkt w `removedSlugs`, suma.

Commit.

### Task 2.4: Koszyk po stronie klienta

**Files:**
- Create: `src/lib/shop/cart.ts`
- Test: `tests/unit/lib/shop/cart.test.ts` (happy-dom ma localStorage)

```ts
// Koszyk: tylko slugi w localStorage. Ceny zawsze z /api/sklep/cart/quote.
const KEY = 'sklep:cart:v1'
const EVENT = 'sklep:cart-changed'

export function getCart(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : []
  } catch { return [] }
}
function save(slugs: string[]) {
  try { localStorage.setItem(KEY, JSON.stringify(slugs)) } catch {}
  window.dispatchEvent(new CustomEvent(EVENT, { detail: slugs }))
}
export function addToCart(slug: string) { const c = getCart(); if (!c.includes(slug)) save([...c, slug]) }
export function removeFromCart(slug: string) { save(getCart().filter((s) => s !== slug)) }
export function clearCart() { save([]) }
export function onCartChange(cb: (slugs: string[]) => void) {
  const h = (e: Event) => cb((e as CustomEvent<string[]>).detail)
  const s = (e: StorageEvent) => { if (e.key === KEY) cb(getCart()) } // inne karty
  window.addEventListener(EVENT, h); window.addEventListener('storage', s)
  return () => { window.removeEventListener(EVENT, h); window.removeEventListener('storage', s) }
}
```

Testy: add idempotentny, remove, uszkodzony JSON zwraca `[]`, event wywołany. Commit.

### Task 2.5: Content Collection + zdjęcia

**Files:**
- Create: `src/content.config.ts`
- Create: `src/content/ebooks/proteinowa-piekarnia.md`
- Move: zdjęcia z katalogu głównego do `src/assets/sklep/proteinowa-piekarnia/`:
  - `Zrzut ekranu 2026-10-20 o 09.15.01.png` → `okladka.png` (okładka)
  - `e-book Proteinowa piekarnia Paulina Maciak.jpg` → `kolaz-wypiekow.jpg`
  - `Zrzut ekranu 2026-10-20 o 11.46.40.png` → `spis-przepisow.png`
  - `Zrzut ekranu 2026-10-20 o 11.47.04.png` → `przyklad-strony.png`
- PDF **nie** trafia do repo. Dodaj `*.pdf` w katalogu głównym do `.gitignore` albo przenieś plik poza repo po wgraniu do R2.

```ts
// src/content.config.ts
import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

const ebooks = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/ebooks' }), // id = nazwa pliku = products.slug
  schema: ({ image }) => z.object({
    title: z.string(),
    subtitle: z.string(),
    lead: z.string(),
    highlights: z.array(z.string()).min(1),
    cover: image(),
    coverAlt: z.string(),
    gallery: z.array(z.object({ src: image(), alt: z.string() })).default([]),
    seoTitle: z.string(),
    seoDescription: z.string().max(160),
    order: z.number().default(0),
  }),
})

export const collections = { ebooks }
```

```md
---
title: Proteinowa Piekarnia
subtitle: Proste przepisy na domowe bajgle, bułeczki i słodkie wypieki
lead: Poznaj 10 sprawdzonych przepisów na domowe wypieki z większą ilością białka. Słodkie i wytrawne propozycje, wartości odżywcze oraz praktyczne wskazówki — wszystko w jednym e-booku.
highlights:
  - 10 przepisów na słodko i wytrawnie
  - Wartości odżywcze do każdego przepisu
  - Praktyczne wskazówki i zamienniki
  - Informacje o wykorzystanych produktach
cover: ../../assets/sklep/proteinowa-piekarnia/okladka.png
coverAlt: Okładka e-booka Proteinowa Piekarnia
gallery:
  - { src: ../../assets/sklep/proteinowa-piekarnia/kolaz-wypiekow.jpg, alt: Wypieki z e-booka – bajgle, gofry, pankejki, chlebek }
  - { src: ../../assets/sklep/proteinowa-piekarnia/spis-przepisow.png, alt: Spis przepisów – 5 wytrawnych i 5 słodkich }
  - { src: ../../assets/sklep/proteinowa-piekarnia/przyklad-strony.png, alt: Przykładowa strona – jak liczyć udział białka }
seoTitle: Proteinowa Piekarnia – e-book z przepisami na wypieki proteinowe | Paulina Maciak
seoDescription: 10 przepisów na proteinowe bajgle, bułeczki, gofry i słodkie wypieki z wartościami odżywczymi. E-book dietetyczki Pauliny Maciak. 29 zł.
order: 1
---

## Co znajdziesz w środku

**Wytrawne:** gofro-pizza, bajgle proteinowe ze skyru, bułka wysokobiałkowa orkiszowa, bułeczki z serka wiejskiego, chlebek skyrowy.

**Słodkie:** gofry proteinowe na słodko, pankejki proteinowe, bułeczki proteinowe z owocami i kruszonką, proteinowe ciasteczka owsiane, cynamonka proteinowa – jednoporcjowa.

Na początku e-booka wyjaśniam, kiedy produkt ma „wysoką zawartość białka” i jak to sprawdzić na etykiecie.

E-book w formacie PDF: otworzysz go na telefonie, tablecie i komputerze.
```

Run: `npm run build`. Expected: build bez błędów schematu kolekcji. Commit.

### Task 2.6: Strony katalogu i produktu

**Files:**
- Create: `src/pages/sklep/index.astro`, `src/pages/sklep/[slug].astro`
- Create: `src/components/sklep/AddToCartButton.tsx`, `src/components/sklep/CartIcon.tsx`
- Modify: `src/components/Header.astro`: link „Sklep” w nawigacji marketingowej (desktop + mobile) i `CartIcon client:idle` widoczne, gdy `isFeatureEnabled('SKLEP')`

`[slug].astro` (SSR, `export const prerender = false`):
1. `getEntry('ebooks', slug)` + `productRepository.findBySlug(slug)`. Brak któregokolwiek albo `status !== 'active'` daje 404.
2. Layout zgodny z „Naturalna Harmonia”: po lewej okładka (`<Image>` z `astro:assets`, `loading="eager"`, bo to LCP), po prawej tytuł (`font-heading`), podtytuł, lead, cena `formatPLN(product.price)` + „Jednorazowy zakup · PDF”, przycisk `AddToCartButton client:load` (dodaje i przekierowuje do `/sklep/koszyk`), druga opcja „Dodaj do koszyka i kontynuuj zakupy”, lista `highlights` z ✓. Pod spodem treść markdown (`render(entry)`) i galeria (`loading="lazy"`).
3. Pod przyciskiem drobny tekst: „Po opłaceniu e-book wyślemy na Twój e-mail. Zakup bez zakładania konta.”
4. JSON-LD `Product` + `Offer` (price, priceCurrency, availability InStock). Wzór: `src/components/PersonSchema.astro`.
5. Pixel `ViewContent` (Task 7.1) w małym `<script>` lub w `AddToCartButton` przy montowaniu.

`index.astro`: siatka kart (okładka, tytuł, podtytuł, cena, „Zobacz”) z `listActive()` połączonego z kolekcją po slugu, sortowanie po `order`.

`CartIcon.tsx`: ikona torby + licznik z `getCart().length`, nasłuchuje `onCartChange`, link do `/sklep/koszyk`. Licznik ukryty, gdy 0. **Hydration:** w pierwszym renderze licznik 0, aktualizacja w `useEffect` (localStorage niedostępny w SSR).

Weryfikacja: `npm run dev`, `FF_SKLEP=true`, seed produktu (Task 8.1, lokalnie), wejście na `/sklep/proteinowa-piekarnia`, dodanie do koszyka, licznik = 1. Commit.

---

## Faza 3: Zamówienie i płatność

### Task 3.1: Stałe i treści zgód

**Files:**
- Create: `src/lib/shop/constants.ts`

```ts
export const SHOP_TERMS_VERSION = '2026-11-01' // = data w /regulamin-sklepu; zmiana regulaminu = nowa wersja
export const DOWNLOAD_TOKEN_TTL_DAYS = 30
export const ACCOUNT_TOKEN_TTL_DAYS = 30
export const PRESIGN_TTL_SECONDS = 300
export const CHECKOUT_SECRET_TTL_HOURS = 24
export const PENDING_ORDER_TTL_HOURS = 24
export const ORDER_RETENTION_YEARS = 5
export const SHOP_TRANSACTION_ITEM = 'SHOP_ORDER'
export const CHECKOUT_COOKIE = 'sklep_checkout'

// Dokładnie ten tekst widzi klientka przy checkboxie i zapisujemy go w zamówieniu.
export const DIGITAL_CONTENT_CONSENT_TEXT =
  'Żądam dostarczenia treści cyfrowej (e-booka) przed upływem 14 dni od zawarcia umowy i przyjmuję do wiadomości, ' +
  'że po dostarczeniu e-booka utracę prawo odstąpienia od umowy.' // = § 9 ust. 3 regulaminu, słowo w słowo
export const TERMS_CONSENT_LABEL = 'Akceptuję Regulamin sklepu i zapoznałam/em się z Polityką prywatności.'
```

### Task 3.2: Tworzenie zamówienia (serwis)

**Files:**
- Modify: `src/lib/services/shopCheckoutService.ts`
- Create: `src/lib/repositories/shopOrderRepository.ts`
- Test: `tests/integration/services/shopCheckoutService.test.ts` (Tpay mockowany przez wstrzyknięcie)

Wejście (już zwalidowane w endpoincie):

```ts
export interface CreateOrderInput {
  slugs: string[]
  email: string               // lowercase, trim
  firstName?: string
  acceptTerms: true
  acceptDigitalContent: true
  invoice?: { companyName: string; nip: string; address: string }
  createAccount?: boolean    // checkbox „Załóż konto” (bez hasła) -> shop_orders.account_requested
  sessionUser?: { id: string; email: string } | null
}

export type CreateOrderResult =
  | { ok: true; orderId: string; redirectUrl: string; checkoutSecret: string }
  | { ok: false; code: 'EMPTY_CART' | 'CART_CHANGED' | 'ALREADY_OWNED' | 'PAYMENT_INIT_FAILED'; message: string; removedSlugs?: string[] }
```

Konstruktor: `constructor(private db: Database, private tpay: Pick<TpayService, 'createTransaction'> = getTpayService())` (wstrzykiwalny mock w testach).

Algorytm `createOrder(input, now = new Date())`:
1. `email = sessionUser?.email ?? input.email` (zalogowana osoba nie może podać innego e-maila).
2. `quoteCart(slugs)`: gdy `items.length === 0`, zwróć `EMPTY_CART`. Gdy `removedSlugs.length > 0`, zwróć `CART_CHANGED` (klient odświeża koszyk i pokazuje komunikat).
3. Jeśli `sessionUser`: gdy któryś produkt jest już w opłaconym zamówieniu tego `userId`, zwróć `ALREADY_OWNED` (z linkiem do `/konto/zakupy`). Dla gości nie blokujemy.
4. **Transakcja DB** (`db.transaction`):
   - `orderNumber = 'ZAM-' + year + '-' + String(nextval).padStart(5,'0')` przez `` sql`select nextval('shop_order_number_seq') as n` ``, rok wg strefy Europe/Warsaw (formatowanie wydziel do funkcji i użyj jej też w `tests/fixtures/shop.ts`, który dziś składa numer własnym SQL),
   - insert `shop_orders` (`status: 'pending'`, zgody: `termsVersion`, `termsAcceptedAt: now`, `digitalContentConsentAt: now`, `digitalContentConsentText`, `userId: sessionUser?.id ?? null`, `accountRequested: !sessionUser && !!createAccount`, `checkoutSecretHash`). **Żadnego** insertu do `users`: konto powstaje dopiero linkiem z maila (Task 4.2),
   - insert `shop_order_items` (snapshot `title`, `price`),
   - insert `transactions` (`userId: sessionUser?.id ?? null`, `item: SHOP_TRANSACTION_ITEM`, `amount`, `tpayTitle: 'Zamówienie ' + orderNumber`, `payerEmail`, `shopOrderId`). **Nie używaj** `TransactionService.createTransaction` (wymaga userId). Dodaj w nim metodę `createShopTransaction(tx, params)` lub insert bezpośrednio.
5. Poza transakcją DB: `tpay.createTransaction({ amount: Number(total), description: 'Zamówienie ' + orderNumber, payerEmail: email, payerName: firstName, successUrl: `${SITE_URL}/sklep/platnosc/sukces?order=${order.id}`, errorUrl: `${SITE_URL}/sklep/platnosc/blad?order=${order.id}`, notificationUrl: `${SITE_URL}/api/sklep/platnosc/callback`, crc: transaction.id })`.
   - błąd: `transactions.status = 'failed'`, `shop_orders.status = 'failed'`, zwróć `PAYMENT_INIT_FAILED`. Konta nie ma czego sprzątać, bo przy zamówieniu nie powstaje.
   - sukces: `TransactionService.updateTpayTransactionId(...)`.
6. `checkoutSecret = randomBytes(32).toString('hex')`, w bazie `hashToken(checkoutSecret)`.

Testy (każdy osobno, TDD):
- tworzy `pending` order + item + transakcję z `shopOrderId`, wywołuje Tpay z poprawną kwotą i webhookiem sklepu,
- numery zamówień rosną (`ZAM-2026-00001`, `ZAM-2026-00002`),
- cena z bazy, nie z wejścia (zmień cenę produktu między quote a create, zamówienie ma nową cenę),
- `CART_CHANGED` przy produkcie `archived`,
- `createAccount: true` zapisuje `account_requested = true` i **nie** tworzy użytkownika (także gdy e-mail ma już konto: zamówienie powstaje normalnie),
- zalogowany z `createAccount: true`: `account_requested = false`,
- zalogowany: e-mail z sesji nadpisuje wejście, `ALREADY_OWNED`,
- błąd Tpay: order i transakcja `failed`.

Commit po zielonych testach.

### Task 3.3: Endpoint `POST /api/sklep/orders`

**Files:**
- Create: `src/pages/api/sklep/orders.ts`
- Create: `src/schemas/shop.ts`

```ts
// src/schemas/shop.ts
import { z } from 'zod'

const nipSchema = z.string().transform((s) => s.replace(/[\s-]/g, '')).refine(isValidNip, 'Nieprawidłowy NIP')

export const createOrderSchema = z.object({
  slugs: z.array(z.string().regex(/^[a-z0-9-]{1,100}$/)).min(1).max(20),
  email: z.string().trim().toLowerCase().email('Podaj poprawny adres e-mail').max(255),
  firstName: z.string().trim().max(100).optional(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Zaakceptuj regulamin' }) }),
  acceptDigitalContent: z.literal(true, { errorMap: () => ({ message: 'Ta zgoda jest wymagana do natychmiastowej wysyłki e-booka' }) }),
  invoice: z.object({
    companyName: z.string().trim().min(2).max(255),
    nip: nipSchema,
    address: z.string().trim().min(5).max(500),
  }).optional(),
  createAccount: z.boolean().optional(), // bez hasła – konto zakłada link z maila
})

// Suma kontrolna NIP (wagi 6,5,7,2,3,4,5,6,7)
export function isValidNip(nip: string): boolean {
  if (!/^\d{10}$/.test(nip)) return false
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7]
  const sum = w.reduce((acc, wi, i) => acc + wi * Number(nip[i]), 0)
  return sum % 11 === Number(nip[9])
}
```

Unit test `tests/unit/schemas/shop.test.ts`: NIP poprawny (`8272247279`, NIP sprzedawcy z polityki prywatności) i niepoprawny, brak zgód daje błąd, e-mail jest normalizowany.

Endpoint:
- `checkShopFeatureEnabled`,
- rate limit IP (`checkShopRateLimit`, ale dla zamówień 10/h: osobny klucz),
- `createOrderSchema.safeParse`, przy błędzie 400 `{ data: null, error: { code: 'validation_error', message, details } }` (format jak w `api/pzk/purchase/initiate.ts`),
- `service.createOrder({ ...data, sessionUser: locals.user ? { id, email } : null })`,
- przy sukcesie: `cookies.set(CHECKOUT_COOKIE, `${orderId}.${checkoutSecret}`, { httpOnly: true, secure: import.meta.env.PROD, sameSite: 'lax', path: '/', maxAge: 24*3600 })`. **`sameSite: 'lax'`** jest konieczne, bo powrót z Tpay to nawigacja top-level z innej domeny,
- kody HTTP: `EMPTY_CART`/`CART_CHANGED` 409, `ALREADY_OWNED` 409, `PAYMENT_INIT_FAILED` 502,
- `Cache-Control: no-store`.

Test integracyjny endpointu: wzoruj się na `tests/integration/api/pzk/*.test.ts` (jak budują `context`). Commit.

### Task 3.4: Webhook `POST /api/sklep/platnosc/callback`

> **Zrobione (po review).** Kod: `src/lib/services/shopPaymentService.ts`, `src/pages/api/sklep/platnosc/callback.ts`. Opis niżej = stan implementacji.

**Files:**
- Create: `src/lib/services/shopPaymentService.ts`
- Create: `src/pages/api/sklep/platnosc/callback.ts`
- Modify: `src/middleware/csrf.ts:5`: dodać `'/api/sklep/platnosc/callback'` do `CSRF_EXEMPT_PATHS`
- Test: `tests/integration/services/shopPaymentService.test.ts`, `tests/integration/api/sklep/payment-callback.test.ts`

Endpoint: **skopiuj** `src/pages/api/pzk/purchase/callback.ts` (czytanie body z limitem, parsowanie, odpowiedzi `TRUE`/`FALSE`). Zamień tylko wywołanie serwisu na `new ShopPaymentService(db).processNotification({...})`. Bez sprawdzania feature flagi. `isSuccess = tr_status === 'TRUE'` (jak PZK).

Odpowiedzi (`text/plain`):

| Odpowiedź | Kiedy | Tpay ponawia? |
|---|---|---|
| `TRUE` 200 | każdy `outcome` serwisu: `paid`, `failed`, `amount_mismatch`, `late_payment`, `unexpected_payment`, `unknown_transaction`, `already_processed` | nie |
| `FALSE` 400 | brak `tr_id` / `tr_crc` | tak |
| `FALSE` 413 | body ponad `TPAY_WEBHOOK_MAX_BODY_BYTES` (domyślnie 64 KB) | tak |
| `FALSE` 500 | zła sygnatura (`ShopWebhookError`), błąd bazy | tak |

`ShopPaymentService.processNotification({ transactionId, tpayTransactionId, isSuccess, amount, signature, rawBody })` → `{ outcome, orderId }` (`orderId = null` tylko dla `unknown_transaction`). Zależności wstrzykiwane w konstruktorze (`tpay`, `mailer`, `accounts`, `tokens`, `now`).

```ts
// 1. JWS – bez poprawnej sygnatury nic nie robimy
if (!(await tpay.verifyWebhookSignature(signature, rawBody))) throw new ShopWebhookError('invalid_signature') // → 500

// 2. Transakcja sklepu: istnieje, ma shopOrderId, item === 'SHOP_ORDER', zamówienie istnieje.
//    Inaczej (także nie-UUID tr_crc → Postgres 22P02, transakcja PZK) – przy POPRAWNYM podpisie:
//    outcome 'unknown_transaction', log (przycięte tr_crc/tr_id), przy sukcesie
//    mailer.notifyOwnerUnknownPayment({ trCrc, tpayTransactionId, amount }). Odpowiedź TRUE (ponowienia nic nie zmienią).
//    Bez guardu „dokładnie raz” (brak wiersza) – duplikat z Tpay = drugi alert.

// 3. Płatność spóźniona: isSuccess && (order 'expired' || order 'pending' starsze niż PENDING_ORDER_TTL_HOURS)
//    && trx in ('pending','cancelled'). Granica 24 h liczona w webhooku – nie czekamy na cron (Task 9.2).
//    Jedna transakcja DB: order pending → 'expired' (warunkowo), trx pending/cancelled → 'success' (warunkowo
//    = guard „dokładnie raz”). Zamówienie ZOSTAJE 'expired' (regulamin § 5 ust. 6: zwrot w 14 dni albo realizacja
//    na wniosek). Potem mailer.notifyCustomerLatePayment(order), NASTĘPNIE notifyOwnerLatePayment(order,
//    { receivedAmount, customerNotified, tpayTransactionId }) (oba zwracają boolean), event 'shop_order_late_payment' { customerNotified, ownerNotified }.
//    Nie wysłano maila do klientki → console.warn (Paulina musi się z nią skontaktować).

// 4. Sukces dla transakcji 'failed' (np. najpierw tr_status=FALSE, potem TRUE) – BEZ automatycznego failed → paid:
//    kwota zgodna → UPDATE trx failed → 'success' WHERE status='failed' (raz), zamówienie zostaje 'failed',
//      notifyOwnerUnexpectedPayment(order, { receivedAmount }), event 'shop_order_unexpected_payment'
//      → 'unexpected_payment'. 0 wierszy → 'already_processed'.
//    kwota niezgodna → notifyOwnerAmountMismatch(order, { expected, received }) najwyżej raz na transakcję:
//      znacznikiem jest event 'shop_order_amount_mismatch' (sprawdzany pod SELECT … FOR UPDATE na transakcji).

// 5. Idempotencja: trx lub order nie 'pending' → 'already_processed' (bez maili, bez tokenów).
//    UWAGA: dopiero po krokach 3–4 – wcześniejsze „if (trx.status !== 'pending') return” połykało płatności spóźnione.

// 6. tr_status != TRUE → trx + order 'failed' → 'failed'.

// 7. Kwota (PZK tego nie robi): toGrosze(amount) !== toGrosze(trx.amount), brak kwoty albo zły format ("29,00")
//    = niezgodność (nie 500). trx + order 'failed', w tej samej transakcji DB event 'shop_order_amount_mismatch'
//    (znacznik z kroku 4), mail [UWAGA] notifyOwnerAmountMismatch → 'amount_mismatch', odpowiedź TRUE.

// 8. Opłacone: jedna transakcja DB, UPDATE … WHERE id = ? AND status = 'pending' RETURNING na trx i order
//    (trx 'success' + tpayTransactionId = tr_id + completedAt; order 'paid' + paidAt).
//    0 wierszy w którymkolwiek UPDATE (kroki 3, 7, 8) → rollback, ponowna ocena na świeżym stanie;
//    drugi konflikt = 'already_processed'. Maile „wyjątkowe” idą tylko po wygraniu warunkowego UPDATE.

// 9. Po opłaceniu (poza transakcją DB, błędy logujemy, NIE rzucamy – płatność już zapisana):
//    items → downloadToken = tokens.createDownloadToken(orderId)
//          → accountLink = accounts.resolveAccountLinkForOrder(order)   // Task 4.2: none | create | attach
//          → sent = mailer.sendOrderConfirmation(order, items, downloadToken, accountLink)
//    sent === true → confirmationSentAt = now (WHERE confirmationSentAt IS NULL). Brak któregoś kroku albo
//    false → confirmationSentAt NULL, plik nie jest wydawany, cron (Task 9.2) ponawia.
//    mailer.notifyOwner(order, items, { confirmationSent, tpayTransactionId })   // PO próbie potwierdzenia;
//                                       // [FAKTURA] w temacie, gdy invoiceRequested
//    event 'shop_order_paid'
```

> **Raporty:** transakcja `success` ≠ zamówienie opłacone. Przy płatności spóźnionej (`expired`) i nieoczekiwanej (`failed`) transakcja jest `success`, bo pieniądze wpłynęły. Przychód liczymy z `shop_orders.status = 'paid'` (Task 9.1).

> **Logi:** tylko identyfikatory, `tr_crc`/`tr_id` przed weryfikacją podpisu przycięte (`truncateForLog`), bez e-maila, tokenów i treści błędów DB (`dbErrorLog`). Bez podglądu body.

**Eventy** (`events`, `userId = order.userId`, w `properties` zawsze `orderId`, `transactionId`):

| `eventType` | Kiedy | Uwagi |
|---|---|---|
| `shop_order_paid` | krok 9 | `total` |
| `shop_order_late_payment` | krok 3 | `total`, `customerNotified`, `ownerNotified` |
| `shop_order_unexpected_payment` | krok 4, kwota zgodna | `total` |
| `shop_order_amount_mismatch` | kroki 4 i 7 | `expected`, `received` (przycięte). **Znacznik idempotencji** maila o niezgodnej kwocie – nie usuwać, dopóki istnieje zamówienie (Task 9.2) |

Testy (`shopPaymentService.test.ts`):
- zła sygnatura: wyjątek, nic się nie zmienia, `tr_crc` w logu przycięte,
- transakcja PZK (bez `shopOrderId`) przy poprawnym podpisie: `unknown_transaction`, transakcja nietknięta, alert do Pauliny,
- nieznana / nie-UUID transakcja: `unknown_transaction`, `tr_crc` przycięte do 64 znaków, alert tylko przy sukcesie,
- sukces: order `paid`, transakcja `success`, 1 download token, maile (mock `ShopMailer`), `confirmationSentAt`, event `shop_order_paid`,
- zalogowana: `accountLink` = `none`,
- błędy po płatności (token, mail do Pauliny) nie rzucają; błąd SMTP przy potwierdzeniu: `paid`, `confirmationSentAt = NULL`,
- duplikat: `already_processed`, bez drugiego tokenu i maili; dwa równoległe duplikaty: dokładnie jeden przetwarza,
- `"29"` vs `"29.00"`: akceptowane; `30.00`, `29,00`, brak kwoty: order + transakcja `failed`, mail do Pauliny raz, bez maila do klientki,
- `tr_status=FALSE`: order + transakcja `failed`, bez maila do klientki i tokenu,
- płatność spóźniona: order zostaje `expired`, transakcja `success`, oba maile raz (ponowienie bez maili); mail do klientki nie wyszedł → `customerNotified=false`; `pending` starsze niż 24 h → `expired` + spóźniona (raz także przy ponowieniu); `pending` 23 h → normalna płatność; równoległe powiadomienia → maile raz; order `expired`, transakcja `pending` → spóźniona; niepowodzenie dla `expired` → `already_processed`,
- sukces po `failed`: kwota zgodna → `unexpected_payment`, transakcja `success`, order `failed`, mail raz; kwota niezgodna → mail o niezgodnej kwocie raz (także przy ponowieniu i równoległych duplikatach).

Testy endpointu (`payment-callback.test.ts`): sukces → `TRUE` 200; działa przy `FF_SKLEP=false`; duplikat i niezgodna kwota → `TRUE` 200; zła sygnatura i błąd bazy → `FALSE` 500; brak `tr_id`/`tr_crc` → 400; za duże body → 413. **Prawdziwe JWS** (`TpayService` z testowym certyfikatem): poprawnie podpisane body → `paid`; ta sama sygnatura po podmianie `tr_amount` albo `tr_crc` → `FALSE` 500, zamówienia zostają `pending`. CSRF: cross-origin POST na webhook przechodzi, na inny endpoint sklepu blokowany. Commit.

**Bramka w webhooku PZK (z review fazy 1).** `PzkPurchaseService.processPaymentCallback` szuka transakcji po id i zmienia jej status **przed** sprawdzeniem `item`. Gdyby powiadomienie o transakcji sklepu trafiło na webhook PZK (np. domyślny URL powiadomień w panelu Tpay), transakcja dostałaby `success`, PZK rzuciłoby w `getModuleFromItem('SHOP_ORDER')`, a webhook sklepu potem pominąłby ją jako „już obsłużoną”. Zamówienie nigdy nie zostałoby wydane. W tym tasku dopisz zaraz po pobraniu transakcji w PZK: `if (!transaction.item.startsWith('PZK_')) { console.error(...); return }` (bez zmiany statusu) plus test, że transakcja `SHOP_ORDER` wysłana na webhook PZK zostaje `pending`.

### Task 3.5: Status zamówienia dla strony sukcesu

**Files:**
- Create: `src/pages/api/sklep/orders/[id]/status.ts`
- Create: `src/lib/shop/checkoutCookie.ts`: `readCheckoutCookie(cookies, orderId, loadOrder, now?)` → `{ status: 'valid', order } | { status: 'mismatch' } | { status: 'missing_or_invalid' }` (parsuje `orderId.secret` – uuid + 64 hex; `loadOrder` wołany tylko, gdy orderId z ciasteczka == żądany, więc endpoint robi jeden odczyt DB; porównuje `hashToken(secret)` z `order.checkoutSecretHash` w stałym czasie, sprawdza `createdAt + CHECKOUT_SECRET_TTL_HOURS`)
- Modify: `ShopOrderRepository.findStatusView(orderId)` (zamówienie + pozycje + „konto istnieje” jednym zapytaniem)

> Pobieranie ze strony sukcesu (`GET /api/sklep/orders/[id]/items/[itemId]/download`) przeniesione do Task 4.3 (wymaga presigned URL).

> Jedno ciasteczko = ostatnie zamówienie. Gdy `orderId` z ciasteczka nie zgadza się z `?order=` (np. dwa zamówienia w dwóch kartach), strona sukcesu **nie pokazuje błędu**, tylko „Link do pobrania wysłaliśmy na Twój e-mail”. Test na ten przypadek.

`GET status`: bez ważnego ciasteczka zwraca 404 (nie zdradzamy istnienia zamówienia). Z ciasteczkiem `{ status, confirmationSent, orderNumber, email, items: [{ id, title }], total, accountState }`, gdzie `accountState` to `'none' | 'link_sent' | 'exists'` (do komunikatu na stronie sukcesu; `none` = zamówienie ma `userId`). `status` to status **zamówienia** (`pending | paid | failed | expired`), nie transakcji: płatność spóźniona daje `expired`, nieoczekiwana `failed` (Task 3.4), więc strona sukcesu nie wydaje pliku.

Mismatch → 404 z `code: 'cookie_mismatch'` (ciasteczko należy do tej przeglądarki, nic nie mówi o żądanym zamówieniu), reszta → 404 `not_found`. Limit: wspólny `checkShopRateLimit` (60 / 10 min / IP); odpytywanie 3 s × 60 s = 20 żądań (nawet 2 min = 40) mieści się. Endpoint bez FF_SKLEP (ścieżka dostarczenia).

Commit.

---

## Faza 4: Dostarczenie i konto

### Task 4.1: Tokeny

**Files:**
- Create: `src/lib/services/shopTokenService.ts`
- Test: `tests/integration/services/shopTokenService.test.ts`

Wzór: `src/lib/tokens.ts`. **Nigdy nie loguj surowego tokenu.**

```ts
createDownloadToken(orderId, now = new Date()): Promise<string>          // 30 dni
validateDownloadToken(raw, now = new Date()): Promise<{ orderId: string } | null> // + ustawia lastUsedAt
createAccountToken(email, now = new Date()): Promise<string>             // 30 dni
consumeAccountToken(raw, now = new Date()): Promise<{ email: string } | null> // ustawia usedAt (jednorazowy)
peekAccountToken(raw, now = new Date()): Promise<{ email: string } | null>    // bez zużycia – do renderu formularza
```

Testy: ważny, wygasły (`now` + 31 dni), zły token, ponowne użycie tokenu konta (`consume` drugi raz zwraca `null`), w DB jest tylko hash (`tokenHash !== raw`). Commit.

### Task 4.2: Konto: przypinanie zamówień i założenie konta linkiem

**Files:**
- Create: `src/lib/services/shopAccountService.ts`
- Test: `tests/integration/services/shopAccountService.test.ts`

```ts
// Jaki link "konto" wysłać w mailu po zakupie
resolveAccountLinkForOrder(order): Promise<
  | { kind: 'none' }                                         // order.userId już ustawione (zalogowana)
  | { kind: 'create'; token: string; emphasized: boolean }   // brak konta; emphasized = order.accountRequested
  | { kind: 'attach'; token: string }                        // istnieje konto z tym e-mailem – CELOWO dowolna rola
                                                             // (patient, customer, także dietitian: Paulina kupująca własny e-book)
>
// W obu przypadkach z tokenem: createAccountToken(order.email) – ten sam endpoint /sklep/konto/{token}

// Przypina wszystkie opłacone zamówienia z tym e-mailem i bez userId
attachOrdersByEmail(userId, email, tx?): Promise<number>

// Brak konta: insert customer (status 'active', emailVerifiedAt = now, passwordHash = hashPasswordV2(hash),
// firstName z najnowszego zamówienia) + attachOrdersByEmail, w jednej transakcji DB; zużywa token
createAccountFromToken(raw, passwordHash, now = new Date()):
  Promise<{ ok: true; userId } | { ok: false; reason: 'invalid' | 'account_exists' }>

// /sklep/konto/{token} – POST
handleAccountToken(raw, ctx: { sessionUser: {id,email,role} | null; passwordHash?: string }):
  Promise<
    | { result: 'created_and_logged_in'; userId }    // brak konta + passwordHash: createAccountFromToken, sesja
    | { result: 'attached'; count }                  // zalogowany na TEN e-mail: attach
    | { result: 'login_required' }                   // konto istnieje, brak sesji / inna sesja – token NIE jest zużywany
    | { result: 'different_account' }                // brak konta dla e-maila tokenu, a sesja INNEGO konta – token NIE jest
                                                     // zużywany, nie zakładamy drugiego konta pod zalogowaną sesją
    | { result: 'password_required' }                // brak konta i brak hasła – pokaż formularz
    | { result: 'invalid' }
  >
```

> `resolveAccountLinkForOrder` już jest (użyty w webhooku, Task 3.4). Porównanie e-maila bez wielkości liter (`lower(users.email)`), błąd DB → wyjątek (webhook łapie, potwierdzenie czeka na cron). Reszta (`attachOrdersByEmail`, `createAccountFromToken`, `handleAccountToken`) zrobiona (Task 4.2).

Zasady bezpieczeństwa (testy dla każdej):
- `attach` tylko gdy `sessionUser.email === token.email` (case-insensitive),
- token zużywany dopiero po udanej akcji,
- `created_and_logged_in` nie może nadpisać istniejącego konta (wyścig: unikalny e-mail daje `login_required`),
- brak konta + sesja innego konta → `different_account` (bez zakładania konta, token niezużyty),
- nowy `customer` ma `emailVerifiedAt` ustawione i przypięte **wszystkie** opłacone zamówienia z tym e-mailem (także z innych zamówień niż to, z którego pochodzi link),
- istniejące konto: po zalogowaniu na ten e-mail i ponownym wejściu w link `attached` przypina zamówienia (bez tworzenia konta).

Sesję tworzy endpoint (`lucia.createSession` + `setSessionCookie` z `src/lib/auth.ts`), nie serwis. Serwis zwraca `userId`. Commit.

### Task 4.3: Pobieranie pliku

**Files:**
- Create: `src/lib/services/shopDownloadService.ts`
- Create: `src/pages/sklep/pobierz/[token].astro`
- Create: `src/pages/api/sklep/pobierz/[token]/[itemId].ts`
- Create: `src/pages/api/sklep/pobierz/[token]/account-link.ts`
- Create: `src/pages/api/konto/zakupy/[itemId]/download.ts`
- Create: `src/pages/api/sklep/orders/[id]/items/[itemId]/download.ts` (przeniesione z 3.5: `readCheckoutCookie` z Task 3.5 – `valid` → `getDownloadUrl(…, 'checkout')` → 302, inaczej 404; bez FF_SKLEP)
- Test: `tests/integration/services/shopDownloadService.test.ts` (prawdziwa baza – relacje zamówienie/pozycja/produkt; presign wstrzyknięty jako mock)
- Test: `tests/integration/api/sklep/download.test.ts` (4 endpointy, limity account-link, FF_SKLEP=false), `tests/unit/middleware/csrf.test.ts` (`Origin: null`), `tests/unit/lib/shop/maskEmail.test.ts`

```ts
// Jedno miejsce decydujące o dostępie do pliku. Wywoływane z 3 wejść: token z maila,
// ciasteczko strony sukcesu, konto.
async getDownloadUrl(orderId: string, itemId: string, actor: string): Promise<string | null> {
  // item należy do order, order.status === 'paid' ORAZ order.confirmationSentAt != NULL (art. 21 ust. 1 u.p.k.)
  // objectKey = item.fileObjectKey ?? product.fileObjectKey
  // generatePresignedUrl({ objectKey, fileName: product.fileName, contentType: 'application/pdf', ttlSeconds: PRESIGN_TTL_SECONDS })
  // events: 'shop_download' { orderId, itemId, actor: 'token' | 'checkout' | 'account' } – bez e-maila
}
```

- `/sklep/pobierz/[token].astro`: `validateDownloadToken`. Nieważny: komunikat „Link wygasł lub jest nieprawidłowy” + link do `/sklep/wyslij-link`. Ważny: numer zamówienia, lista pozycji z przyciskiem „Pobierz PDF” (`/api/sklep/pobierz/{token}/{itemId}`) i CTA „Załóż konto, żeby mieć e-booki zawsze pod ręką” (tylko gdy order nie ma `userId`). CTA to formularz `POST /api/sklep/pobierz/{token}/account-link`: nowy `createAccountToken(order.email)` i mail z linkiem `/sklep/konto/{token}` („Ustaw hasło i załóż konto” albo, gdy konto istnieje, „Zaloguj się – zakup pojawi się w Twoim koncie”). Token konta **nigdy** nie trafia na stronę (link do pobrania mógł zostać przekazany dalej, własność skrzynki musi potwierdzić mail). Po wysłaniu komunikat „Link do założenia konta wysłałam na {zamaskowany e-mail}”. Limity: `checkShopAccountLinkEmailLimit(order.email)` (2/h, własny licznik – nie zużywa limitu „Wyślij link ponownie” ani formularzy kontaktowych) + `checkPublicRateLimit(ip)`, po przekroczeniu ten sam komunikat bez wysyłki. Strona ma `<meta name="robots" content="noindex">`, bez canonical / og:url i bez GA / Meta Pixel (`Layout` `noindex` + `disableTracking`), `Cache-Control: no-store` i `Referrer-Policy: same-origin` (token w URL nie wycieka do obcych domen). **Nie** `no-referrer`: wtedy przeglądarki wysyłają przy formularzu `Origin: null` i CSRF odrzuca POST. `no-referrer` tylko na odpowiedziach 302 do R2.
- `api/sklep/pobierz/[token]/[itemId]`: walidacja tokenu, `getDownloadUrl`, 302.
- `api/konto/zakupy/[itemId]/download`: wymaga `locals.user`, item należy do zamówienia z `userId === locals.user.id`, 302.

Testy: brak dostępu dla `pending`, brak dostępu dla `paid` z `confirmationSentAt = NULL`, item z innego zamówienia daje `null`, `fileObjectKey` z itemu ma pierwszeństwo. Commit.

### Task 4.4: Strona „Konto” z tokenu

**Files:**
- Create: `src/pages/sklep/konto/[token].astro`, `src/pages/api/sklep/konto/[token].ts`
- Create: `src/components/sklep/AccountSetupForm.tsx`

`[token].astro` (SSR): `peekAccountToken`. Nieważny: komunikat. Ważny, renderuje w zależności od stanu:
- brak konta: formularz „Ustaw hasło i załóż konto” (e-mail z tokenu tylko do odczytu, hasło + powtórz, min. 8 znaków jak w `signupSchemaClient`, `hashPasswordClient`). POST, potem redirect `/konto/zakupy`,
- konto istnieje i sesja na ten e-mail: przycisk „Przypisz zakupy do mojego konta”,
- konto istnieje, brak sesji (albo sesja innego konta – `login_required`, bez ujawniania szczegółów): „Zaloguj się” → `/logowanie?next=/sklep/konto/{token}` (Task 6.2 obsługuje `next`).
- brak konta, sesja na inne konto (`different_account`): „Jesteś zalogowana na inne konto – wyloguj się, aby założyć konto dla {zamaskowany e-mail}”, bez formularza hasła.

Endpoint `POST` wywołuje `handleAccountToken`; `InvalidPasswordHashError` (hasło nie jest 64 znakami hex) → 400. Przy `created_and_logged_in` endpoint tworzy sesję.

Commit.

### Task 4.5: „Wyślij link ponownie”

**Files:**
- Create: `src/pages/sklep/wyslij-link.astro`, `src/components/sklep/ResendLinkForm.tsx`, `src/pages/api/sklep/resend-link.ts`

`POST { email }`:
- **zawsze** 200 z tym samym komunikatem („Jeśli na ten adres jest opłacone zamówienie, wysłaliśmy link”), co chroni przed enumeracją,
- `checkShopResendEmailLimit(email)` (3/h, własny licznik w `rate-limit-public.ts` – niezależny od formularzy kontaktowych i od przycisku „Załóż konto”, żeby droga odzyskania linków nie była przez nie zużywana; liczony przy każdym poprawnym żądaniu, także bez zamówień; po przekroczeniu ta sama odpowiedź 200, bez wysyłki) + `checkPublicRateLimit(ip)` (5/h; po przekroczeniu **429** + `Retry-After` – limit IP nic nie mówi o e-mailu). Zły e-mail → 400 (nie liczy się do limitów),
- dla każdego opłaconego, nieanonimizowanego zamówienia z tym e-mailem: nowy download token. Jeden mail `ShopDownloadLinks` z listą zamówień i linkami,
- w tym samym mailu sekcja konta (nowy `createAccountToken(email)`, to samo `/sklep/konto/{token}`): brak konta na ten e-mail daje „Ustaw hasło i załóż konto”, konto istnieje i są zamówienia bez `userId` daje „Zaloguj się – zakup pojawi się w Twoim koncie”, konto istnieje i wszystko przypięte: bez linku (tylko „Zakupy masz też w koncie”). To jedyna droga do nowego linku konta po wygaśnięciu (regulamin § 4 ust. 3),
- działa niezależnie od tego, czy konto istnieje / zostało usunięte (decyzja 15).

- **czas odpowiedzi:** cała praca dla poprawnego żądania (wyszukanie zamówień, inserty tokenów, SMTP) idzie **po odpowiedzi** (`runInBackground` → `waitUntil` z `@vercel/functions`, Task 5.2), więc czas odpowiedzi nie zdradza, czy zamówienia są. Przed odpowiedzią tylko walidacja i limity w pamięci.

Test integracyjny: brak zamówień, brak maila, odpowiedź identyczna. Brak konta: mail zawiera link konta i w DB jest nowy `shop_account_tokens`. Konto z przypiętymi zamówieniami: bez tokenu konta. Commit.

Stan: zrobione (`ShopResendService`, `tests/integration/api/sklep/resend-link.test.ts`).

---

## Faza 5: Maile

### Task 5.1: Szablony react-email

**Files:**
- Create: `src/emails/ShopOrderConfirmation.tsx`, `src/emails/ShopDownloadLinks.tsx`, `src/emails/ShopOwnerNotification.tsx`

Wzór stylu: `src/emails/PzkPurchaseConfirmation.tsx`. Podgląd: `npm run email:dev`.

**ShopOrderConfirmation** (to jest też **potwierdzenie zawarcia umowy na trwałym nośniku**, art. 21 u.p.k., więc treść jest obowiązkowa):
- „Dziękuję za zakup, {imię}!” + numer zamówienia, data, pozycje z cenami, suma, „Sprzedawca zwolniony z VAT (art. 113 ust. 1 ustawy o VAT)”,
- duży przycisk „Pobierz e-book” prowadzący do `/sklep/pobierz/{token}` + „Link jest ważny 30 dni. Nowy link wygenerujesz na {SITE_URL}/sklep/wyslij-link”,
- sekcja konta zależna od `accountLink.kind`: `create` („Ustaw hasło i załóż konto” – przy `emphasized` jako wyraźny przycisk zaraz pod „Pobierz e-book”, inaczej skromny link na dole: „Chcesz mieć e-booki zawsze w jednym miejscu? Załóż konto”), `attach` („Zaloguj się – zakup pojawi się w Twoim koncie”, link `/sklep/konto/{token}`), `none` („E-book jest też w Twoim koncie: Moje zakupy”). Link ważny 30 dni,
- blok „Potwierdzenie umowy” **w treści maila** (link do strony NIE jest trwałym nośnikiem, wyrok TSUE C‑49/11): dane sprzedawcy, e-book(i), cena, sposób składania reklamacji, **dosłowny tekst zgody** `digitalContentConsentText` z datą jej wyrażenia,
- **załącznik: regulamin w PDF** w wersji `termsVersion`. Plik `src/assets/legal/regulamin-sklepu-<wersja>.pdf` (wydruk strony `/regulamin-sklepu` do PDF przy każdej zmianie wersji), dołączany przez nodemailer `attachments`. Brak pliku dla wersji = błąd wysyłki (nie wysyłamy potwierdzenia bez regulaminu),
  > PDF generuje `scripts/print-shop-terms-pdf.mjs` (Playwright/chromium, A4; bez nagłówka, stopki, CTA i banera cookies; stopka strony z wersją): `FF_SKLEP=true npm run dev`, potem `node scripts/print-shop-terms-pdf.mjs [baseUrl]` – wersja z `SHOP_TERMS_VERSION`, skrypt sprawdza, że strona ją zawiera. **Zmiana regulaminu = nowa `SHOP_TERMS_VERSION` + nowy PDF**; stare PDF-y zostają (cron ponawia potwierdzenia w wersji z zamówienia). Plik `2026-11-01`: 9 stron, ~250 KB.
- jeśli `invoiceRequested`: „Fakturę wyślę na ten adres w ciągu 7 dni”.

**ShopDownloadLinks**: lista zamówień z linkami (30 dni) + sekcja konta wg Task 4.5 (link konta też 30 dni). Sekcja konta to wspólny komponent (`src/emails/shop/components.tsx`); dla `none` tekst w liczbie mnogiej: „E-booki są też w Twoim koncie: Moje zakupy” (link).

**ShopOwnerNotification**: temat `[FAKTURA] Zamówienie ZAM-…` lub `Nowe zamówienie ZAM-…`. Treść: e-mail, imię, pozycje, kwota, Tpay ID, dane do faktury, link do `/dietetyk/zamowienia`. Warianty alertów (ten sam szablon, inny temat i blok „Co zrobić”):
- `[UWAGA] Niezgodna kwota ZAM-…`: oczekiwana / otrzymana kwota, „sprawdź w panelu Tpay, zwrot albo ręczna realizacja”,
- `[UWAGA] Płatność po terminie ZAM-…`: zamówienie `expired`, otrzymana kwota, informacja, czy klientka dostała mail, „zwrot w 14 dni w panelu Tpay albo realizacja na wniosek (nowe potwierdzenie § 5 ust. 7)”,
- `[UWAGA] Płatność dla nieudanego zamówienia ZAM-…`: zamówienie `failed`, otrzymana kwota, „zwrot albo ręczna realizacja”,
- `[UWAGA] Płatność dla nieznanej transakcji`: bez zamówienia, tylko `trCrc`, `tpayTransactionId`, kwota (do wyszukania w panelu Tpay).

**Mail do klientki o płatności po terminie** (`ShopLatePayment` albo wariant `ShopOwnerNotification`): „Płatność wpłynęła po wygaśnięciu zamówienia ZAM-…. Zwrócę pieniądze w ciągu 14 dni. Jeśli wolisz otrzymać e-book, odpisz na tego maila.” (regulamin § 5 ust. 6). Bez linku do pobrania.

### Task 5.2: Wysyłka

> **Zrobione.** Kod: `src/lib/services/shopMailService.ts`, `src/lib/email.ts` (`sendShopEmail`), `src/lib/shop/termsPdf.ts`, `src/lib/shop/background.ts`. Testy: `tests/unit/services/shopMailService.test.ts`, `tests/unit/lib/shop/termsPdf.test.ts`, `tests/unit/lib/shop/background.test.ts`, `tests/integration/services/shopPaymentService.test.ts` (blok z prawdziwym `ShopMailService`), `tests/integration/api/sklep/resend-link.test.ts`.
>
> Stan i odchylenia od opisu niżej:
> - `src/lib/email.ts`: jedna funkcja `sendShopEmail({ to, subject, html, text, replyTo?, attachments? }, smtp, isDev)` zamiast trzech; szablony renderuje `ShopMailService` (HTML + `plainText`). Dev: log tylko tematu, liczby adresatów i nazw załączników (treść `[token redacted]`), bez adresów.
> - **Tryb dev** (log zamiast wysyłki) tylko poza produkcją (`import.meta.env.PROD` false – w zbudowanym artefakcie zawsze true –, `NODE_ENV !== 'production'` i brak `VERCEL_ENV`) i bez `SMTP_USER`/`SMTP_PASS`; wtedy metody zwracają `true` (lokalnie przepływ end-to-end: `confirmationSentAt`, pobranie). Produkcja/preview bez SMTP albo bez `SITE_URL` → `console.error` + `false` (potwierdzenie nigdy „na niby”).
> - Adresaci powiadomień: `SHOP_OWNER_NOTIFICATION_EMAILS` (po przecinku, przycięte), puste → `CONTACT_EMAIL`, brak obu → warn + `false`. Maile do klientek: Reply-To = `CONTACT_EMAIL`; powiadomienia o zamówieniu (warianty z zamówieniem): Reply-To = e-mail klientki (Paulina odpowiada wprost), `unknown_payment` bez Reply-To.
> - SMTP sklepu z krótkimi timeoutami (`connectionTimeout`/`greetingTimeout` 10 s, `socketTimeout` 20 s) – zawieszony serwer nie trzyma webhooka do limitu funkcji. Funkcje PZK/hasło bez zmian. Logi błędów: `name`, `code`, `responseCode` – nigdy `message`/`response` (adresy).
> - Webhook: `sendOrderConfirmation` awaitowane (od niego zależy `confirmationSentAt`), `notifyOwner` w tle (`runInBackground` → `waitUntil`), żeby Tpay szybciej dostał `TRUE`.
> - Dane do szablonów: URL-e z `SITE_URL` (`/sklep/pobierz/{token}`, `/sklep/konto/{token}`, `/sklep/wyslij-link`, `/konto/zakupy`, `/dietetyk/zamowienia`), daty `Europe/Warsaw` („1 listopada 2026, 12:30”), kwoty `formatPLN` (nieparsowalna kwota z Tpay → surowa, przycięta). Tekst/data zgody i `termsVersion` **z wiersza zamówienia**.
> - PDF regulaminu wbudowany w bundle przez Vite: `import.meta.glob('/src/assets/legal/regulamin-sklepu-*.pdf', { query: '?inline', eager: true })` → data URL → `Buffer` (bez `fs` i `includeFiles`; sprawdzone: w `npm run build` base64 PDF jest w chunku `shopMailService_*.mjs` funkcji `_render.func`). Brak pliku dla `order.termsVersion` → `false`, nic nie wysłane. Glob jest **eager** – każda wersja to ~340 KB base64 w pamięci funkcji; przy wielu wersjach przejść na lazy (`eager: false`, import tylko potrzebnej).
> - Alerty dla właścicielki (`amount_mismatch`, `late_payment`, `unexpected_payment`) same wczytują pozycje zamówienia (`new ShopMailService(db)`); błąd → pusta lista, alert i tak idzie.
> - Interfejs zmieniony: `notifyOwner(order, items, { confirmationSent, tpayTransactionId })` (webhook woła PO próbie potwierdzenia, `confirmationSent=false` także przy braku tokenu/linku konta), `tpayTransactionId` w alertach, `notifyOwnerLatePayment(..., { receivedAmount, customerNotified, tpayTransactionId })` (klientka pierwsza, potem właścicielka; `expectedAmount` usunięte – szablon pokazuje kwotę zamówienia). `pendingShopMailer` usunięty; domyślny mailer w `ShopPaymentService`, `ShopResendService` i `account-link.ts` = `ShopMailService`.
> - Resend: endpoint odpowiada od razu, `ShopResendService.resend()` w `runInBackground` (`waitUntil`; poza Vercelem `waitUntil` to no-op, obietnica i tak działa; błędy łapane – nigdy unhandled rejection). Testy czekają przez `flushBackgroundTasks()`.

**Files:**
- Modify: `src/lib/email.ts`: dopisz `sendShopOrderConfirmationEmail`, `sendShopDownloadLinksEmail`, `sendShopOwnerNotificationEmail` w tym samym stylu (`isDev` loguje zamiast wysyłać, w logu **nie** wypisuj linków z tokenem, tylko `[token redacted]`)
- Create: `src/lib/services/shopMailService.ts`: **implementuje `ShopMailer`** z `src/lib/shop/mailer.ts` (interfejs już używany przez webhook). Buduje parametry (URL-e z `SITE_URL`, SMTP z env, jak `PzkPurchaseService`) i łapie błędy (log, bez rzucania). Adresaci powiadomień: `SHOP_OWNER_NOTIFICATION_EMAILS`.
- Modify: `src/lib/services/shopResendService.ts` (domyślny mailer, `TODO(5.2)`) i `src/pages/api/sklep/resend-link.ts`: **timing** – wysyłka maila resend po odpowiedzi (`waitUntil` z `@vercel/functions`) albo minimalny czas odpowiedzi ścieżki „brak zamówień” (Task 4.5). Odpowiedź nadal identyczna.
- Modify: `src/lib/services/shopPaymentService.ts`: domyślny `mailer` = `ShopMailService` zamiast `pendingShopMailer` (`TODO(5.2)`), potem usunąć `pendingShopMailer`. Do tego czasu potwierdzenia nie wychodzą, `confirmationSentAt` zostaje NULL i plik nie jest wydawany (bezpieczne prawnie, cron ponowi).

Interfejs (stan w kodzie):

```ts
type AccountLink =
  | { kind: 'none' }
  | { kind: 'create'; token: string; emphasized: boolean }
  | { kind: 'attach'; token: string }

interface ShopMailer {
  // true TYLKO gdy potwierdzenie umowy (trwały nośnik, art. 21 u.p.k.) naprawdę wyszło → confirmationSentAt
  sendOrderConfirmation(order, items, downloadToken: string, accountLink: AccountLink): Promise<boolean>
  // [FAKTURA] / Nowe zamówienie; po próbie potwierdzenia
  notifyOwner(order, items, details: { confirmationSent: boolean; tpayTransactionId: string | null }): Promise<void>
  notifyOwnerAmountMismatch(order, details: { expected: string; received: string; tpayTransactionId: string | null }): Promise<void>
  notifyCustomerLatePayment(order): Promise<boolean>                                    // true = wysłane
  notifyOwnerLatePayment(order, details: { receivedAmount: string; customerNotified: boolean; tpayTransactionId: string | null }): Promise<boolean>
  notifyOwnerUnexpectedPayment(order, details: { receivedAmount: string; tpayTransactionId: string | null }): Promise<void> // sukces po 'failed'
  notifyOwnerUnknownPayment(details: { trCrc: string; tpayTransactionId: string; amount: string }): Promise<void>
  sendAccountLink(email, accountLink: Exclude<AccountLink, { kind: 'none' }>): Promise<boolean>
  sendDownloadLinks(email, downloads: { order; items; downloadToken }[], accountLink: AccountLink): Promise<boolean>
}
```

Kontrakt: metody nie rzucają (webhook i tak łapie), surowych tokenów nigdy nie logujemy, kwoty w `details` jak z Tpay/bazy (już przycięte w webhooku).

Test unit: `ShopMailService` przy `isDev` nie rzuca, przy błędzie transportera nie rzuca, `sendOrderConfirmation` / `notifyCustomerLatePayment` / `notifyOwnerLatePayment` zwracają `false` przy błędzie, brak PDF regulaminu dla `termsVersion` → `false`. Test integracyjny webhooka z prawdziwym `ShopMailService` (transporter mock): sukces ustawia `confirmationSentAt`. Commit.

---

## Faza 6: Role, logowanie, panel

### Task 6.1: RBAC dla `customer` i `/konto`

> **Zrobione.** Kod: `src/middleware/rbac.ts`, `src/lib/roleHome.ts` (`homeFor`, wspólne dla RBAC i LoginForm), `src/lib/safeRedirect.ts` (`safeNextPath`), `src/pages/pacjent/pzk/index.astro` (gałąź `customer`). Testy: `tests/integration/middleware/rbac.test.ts` (blok „customer i /konto”, prawdziwe middleware), `tests/unit/lib/safeRedirect.test.ts`.
>
> Stan i odchylenia od opisu niżej:
> - `/konto` chronione po granicy segmentu (`/konto` i `/konto/...`, nie `/kontakt`). Gość → `/logowanie?next=<ścieżka+query>` (tylko dla `/konto`; `/pacjent/*` i `/dietetyk/*` dalej gołe `/logowanie`).
> - `customer` na `/pacjent/pzk` przekierowany już w RBAC (przed wyjątkiem bramki), strona ma tę samą gałąź jako obronę w głąb.
> - `/logowanie` (i `/logowanie/`) dla zalogowanych: poprawny `next` (`safeNextPath`) → przekierowanie prosto na `next` (gdy `next` znowu wskazuje `/logowanie` → `homeFor`); niepoprawny `next` (np. `//evil.com`) ignorowany → `homeFor`. Intencja PZK (`pzkModule`/`pzkBundle`) pokazuje formularz jak dotąd, ale `customer` idzie na `homeFor` (bez ślepego 403).
> - `homeFor`: nieznana/pusta rola → `/` (neutralnie, bez pętli w strefach); `patient` → `/pacjent/waga`.

**Files:**
- Modify: `src/middleware/rbac.ts`
- Test: `tests/integration/middleware/rbac.test.ts`

```ts
const homeFor = (role?: string) =>
  role === 'dietitian' ? '/dietetyk/dashboard' : role === 'customer' ? '/konto/zakupy' : '/pacjent/waga'

const protectedPatterns = ['/pacjent/', '/dietetyk/', '/konto/']
// ...
if (url.pathname.startsWith('/dietetyk/') && user?.role !== 'dietitian') return redirect(homeFor(user?.role))
if (url.pathname.startsWith('/pacjent/') && user?.role !== 'patient') return redirect(homeFor(user?.role))
// /konto/* – każda zalogowana rola
// /logowanie: redirect(homeFor(user.role)), ale nie gdy jest ?next= (Task 6.2)
```

Testy: customer na `/pacjent/waga` trafia do `/konto/zakupy` (brak pętli), customer na `/pacjent/pzk` trafia do `/konto/zakupy` (uwaga na wyjątek `/pacjent/pzk` w linii 29: strona sama przekierowuje, więc sprawdź `src/pages/pacjent/pzk/index.astro:56` i dodaj gałąź dla `customer`), patient na `/konto/zakupy` przechodzi, gość na `/konto/zakupy` trafia do `/logowanie`. Commit.

### Task 6.2: Logowanie

> **Zrobione.** Kod: `src/components/LoginForm.tsx`, `src/pages/logowanie.astro`, `src/middleware/rbac.ts`, `src/lib/safeRedirect.ts` (`safeNextPath`, `postLoginRedirect`). Testy: `tests/integration/api/auth/login-customer.test.ts`, `tests/unit/lib/safeRedirect.test.ts`, `tests/unit/components/LoginForm.test.tsx`.
>
> Stan i odchylenia od opisu niżej:
> - `login.ts` bez zmian (brak blokady roli; `status !== 'active'` → 401 jak dla wszystkich). Forgot/reset (`password-reset-request.ts`, `reset-password.ts`) nie filtrują po roli – bez zmian, test pokrywa pełny cykl dla `customer`.
> - **Zmiana względem opisu niżej (decyzja 2026-10-23, `decyzje.md`):** `/logowanie` działa **zawsze**, niezależnie od flag (zamiast `STREFA_PACJENTA || SKLEP`) – bramka 404 usunięta ze strony. `/reset-hasla`, `/reset-hasla/[token]` i API auth (login, logout, forgot/reset) nigdy nie miały bramki. Za `FF_STREFA_PACJENTA` zostają tylko link „Strefa pacjenta” w nagłówku, link „Utwórz nowe konto” na `/logowanie` i link logowania na `/pzk/kup`. Rejestracja/zaproszenia bez zmian.
> - `next`: `safeNextPath` (tylko `/…`, nie `//` ani `/\`, bez schematu i znaków sterujących, parsowanie `new URL` + ten sam origin, ponowne sprawdzenie po normalizacji, np. `/..//evil.com`). Kolejność w LoginForm: intencja PZK → poprawny `next` → strona startowa roli; cel liczy `postLoginRedirect(role, next, roleRedirects)` (ta sama funkcja co w testach). 403 z `/api/pzk/purchase/initiate` po zalogowaniu (np. `customer`) → `homeFor` zamiast błędu.
> - Dodatkowo: link „Utwórz nowe konto” (rejestracja pacjenta) na `/logowanie` ukryty przy `FF_STREFA_PACJENTA=false` (prop `showSignupLink`).

**Files:**
- `src/pages/api/auth/login.ts`: **bez blokady** dla `customer`. Niepotwierdzonych kont sklepu nie ma (konto powstaje linkiem z maila, decyzja 9, zmiana 2026-10-22).
- Modify: `src/components/LoginForm.tsx:22`: `customer: '/konto/zakupy'`. Obsłuż `?next=`: przekieruj tylko na ścieżki względne zaczynające się od `/` i nie od `//` (open redirect).
- Modify: `src/pages/api/auth/forgot-password.ts` / reset: sprawdź, czy działają dla `customer` (nie filtrują po roli). Jeśli filtrują, dopuść `customer`.
- Modify: `src/pages/logowanie.astro` (+ strony „zapomniałam hasła” / reset): dziś zwracają 404 przy `FF_STREFA_PACJENTA=false`, więc klientka sklepu nie zaloguje się, żeby przypiąć zakupy (`/sklep/konto/{token}` działa zawsze). Warunek: `STREFA_PACJENTA || SKLEP`. Link „Strefa pacjenta” w nagłówku nadal tylko przy `STREFA_PACJENTA`.
- Uwaga (Task 4.4): przy koncie z innym zalogowanym użytkownikiem strona tokenu pokazuje wylogowanie + zamaskowany e-mail (zamiast samego „Zaloguj się”), bo rbac przekierowuje zalogowanych z `/logowanie`. API zwraca nadal gołe `login_required`.
- Test: `tests/integration/api/auth/login-customer.test.ts`: `customer` loguje się (200) i trafia na `/konto/zakupy`, `?next=/sklep/konto/{token}` działa, `?next=//evil.com` jest ignorowane, `/logowanie` działa przy `FF_STREFA_PACJENTA=false` + `FF_SKLEP=true` i daje 404, gdy obie flagi są wyłączone.

Commit.

### Task 6.3: Header

> **Zrobione.** Kod: `src/components/Header.astro`, `src/lib/navLinks.ts` (czysta logika: `navTypeFor`, `panelNavLinks`, `patientZoneLink`, `desktopBreakpointFor`), `src/lib/repositories/shopOrderRepository.ts` (`hasPaidOrderForUser`). Testy: `tests/unit/lib/navLinks.test.ts`, `tests/integration/database/shop-paid-orders.test.ts`. Ręcznie (Playwright, lokalna baza w kontenerze, FF_SKLEP/PZK=true, STREFA_PACJENTA=false): gość, pacjentka z zakupem i bez, klientka, dietetyczka na 390/768/1024/1280/1440.
>
> Stan i odchylenia od opisu niżej:
> - Typ nawigacji wybiera sam nagłówek z `Astro.locals.user.role` (`navTypeFor`) – jest jeden `Layout` → `Header`, strony niczego nie przekazują. `/konto/*` (6.4/6.5) dostaną nawigację roli automatycznie (klientka: „Moje zakupy”, „Ustawienia”, „Sklep”; pacjentka: swoją). Klientka ma nawigację panelu na **wszystkich** stronach (jak pacjentka/dietetyczka), więc nigdy nie widzi marketingowych linków PZK (`/pzk/kup` i tak jest publiczne).
> - Desktop i mobile renderowane z jednej listy `panelNavLinks` (zamiast trzech kopii markupu). Koszyk: marketing, pacjentka i klientka (przy FF_SKLEP), nie dietetyczka.
> - „Moje e-booki” (pacjentka): `hasPaidOrderForUser` – `userId` + `status='paid'`, `LIMIT 1`; zamówienia niepodpięte do konta (`user_id NULL`) się nie liczą. Błąd DB → `false` + log `dbErrorLog`. Niezależne od FF_SKLEP (dostawa działa zawsze).
> - `patientZoneUrl` → `patientZoneLink`: gość `/logowanie` (tylko przy FF_STREFA_PACJENTA), zalogowany `homeFor(role)` niezależnie od flagi (nieznana rola → przycisk ukryty, bo `homeFor` = `/`). W praktyce zalogowane znane role widzą nawigację panelu, więc przycisk dotyczy gościa; klientka ma „Moje zakupy” w swojej nawigacji przy każdej fladze.
> - **Breakpointy (poza opisem):** nawigacja panelu od `md` łamała się już przed zmianą (np. „Przestrzeń Zdrowej Kobiety” w 3 liniach na 768/1024, przy 768 „Wyloguj” wypadał poza ekran). Teraz hamburger poniżej progu: pacjentka (do 5 linków) od `xl`, dietetyczka i klientka (3 krótkie linki) od `lg`; linki `whitespace-nowrap`. Koszyk poniżej progu stoi obok hamburgera.
> - Linki do stron, których jeszcze nie ma: `/konto/zakupy`, `/konto/ustawienia` (6.4/6.5), `/dietetyk/zamowienia` (9.1).
> - Po review: „Zamówienia” dietetyczki tylko przy FF_SKLEP. Aktywny link: `activeNavHref` (`navLinks.ts`) – dopasowanie po pełnych segmentach (podstrony, np. `/dietetyk/zamowienia/[id]`, `/konto/zakupy/...`, podświetlają rodzica), najdłuższe dopasowanie wygrywa (`/pacjent/waga` vs `/pacjent/waga/historia` bez podwójnego podświetlenia), `/` tylko dokładnie, `/pzk/kup` aktywne na `/pzk/*`. `aria-current="page"` na aktywnych linkach (desktop + mobile), hamburger z `aria-controls="mobile-menu"`, etykietą „Otwórz menu”/„Zamknij menu” i ikoną `aria-hidden`.

**Files:**
- Modify: `src/components/Header.astro`

- `NavType` += `'customer'`. Linki: „Moje zakupy” (`/konto/zakupy`), „Ustawienia” (`/konto/ustawienia`), „Sklep” (gdy FF), wylogowanie. **Bez** Wagi i PZK.
- Pacjent: dodaj „Moje ebooki” (`/konto/zakupy`), gdy ma ≥1 opłacone zamówienie. Zapytanie `SELECT 1 FROM shop_orders WHERE user_id = ? AND status = 'paid' LIMIT 1` tylko dla `role === 'patient'` (indeks `idx_shop_orders_user_id`).
- `patientZoneUrl` dla `customer` to `/konto/zakupy`.
- Desktop i mobile (sekcje ok. linii 87 i 249).
- Dietetyk: link „Zamówienia” (`/dietetyk/zamowienia`).

Weryfikacja ręczna 3 rolami. Commit.

### Task 6.4: `/konto/zakupy`

> **Zrobione.** Kod: `src/pages/konto/zakupy.astro` (czyste Astro, bez wyspy React), `src/lib/shop/purchasesView.ts` (czysta logika widoku: data, `ready`, okładka, link), `src/lib/repositories/shopOrderRepository.ts` (`findPaidOrdersWithItemsForUser`). Testy: `tests/unit/lib/shop/purchasesView.test.ts`, `tests/integration/database/shop-user-purchases.test.ts`. Ręcznie (Playwright, lokalny Postgres w kontenerze, dev server): klientka z zamówieniami (potwierdzone + „w drodze”, pozycja bez okładki) i bez zamówień na 390/1440, bez poziomego przewijania.
>
> Stan i odchylenia od opisu niżej:
> - Repozytorium: `userId` + `status='paid'` + `anonymizedAt IS NULL`, najnowsze po `coalesce(paidAt, createdAt)`; pozycje (join `products` → slug) po tytule. Dwa zapytania. Błąd DB → strona 500 z komunikatem „Nie udało się wczytać zakupów” (log tylko `userId` + `dbErrorLog`).
> - „Pobierz PDF” to zwykły link `<a>` do `/api/konto/zakupy/{itemId}/download` (302 na presigned URL, jak na stronie tokenu) – bez JS. Zamówienie opłacone, ale bez `confirmationSentAt` → „Potwierdzenie w drodze – plik będzie dostępny za chwilę…” zamiast przycisków.
> - Okładka z kolekcji `ebooks` po slugu (`astro:assets`, 80/160 px); brak wpisu → zastępczy kafelek „PDF”. Data w czasie polskim („1 listopada 2026”).
> - Pusty stan: „Nie masz jeszcze zakupów” + „Przejdź do sklepu” (tylko przy FF_SKLEP – inaczej `/sklep` to 404) + „Wyślij link ponownie” (zakup z innym e-mailem). Strona działa bez FF_SKLEP (dostawa). `noindex`, `Cache-Control: no-store`.

**Files:**
- Create: `src/pages/konto/zakupy.astro`, `src/components/sklep/PurchasesList.tsx` (lub czyste Astro, bo interakcji jest mało)

SSR: opłacone zamówienia `userId = locals.user.id` (najnowsze pierwsze). Karta zamówienia: numer, data, pozycje z okładką (z kolekcji po slugu produktu), „Pobierz PDF” (`/api/konto/zakupy/{itemId}/download`). Pusty stan: „Nie masz jeszcze zakupów” + link do `/sklep`. Commit.

### Task 6.5: `/konto/ustawienia` + usunięcie konta `customer`

**Files:**
- Create: `src/pages/konto/ustawienia.astro`
- Create: `src/pages/api/konto/delete.ts`, `src/components/sklep/DeleteAccountButton.tsx`
- Test: `tests/integration/api/konto/delete.test.ts`

Ustawienia: e-mail (tylko odczyt), „Zmień hasło” (ten sam mechanizm co `src/pages/pacjent/ustawienia.astro:40-46`, czyli link resetu na e-mail), „Usuń konto” (tylko `customer`, pacjent widzi „Skontaktuj się z dietetykiem”).

`POST /api/konto/delete` (tylko `role === 'customer'`, potwierdzenie przez wpisanie e-maila):
```ts
await db.transaction(async (tx) => {
  await tx.update(shopOrders).set({ userId: null }).where(eq(shopOrders.userId, user.id))
  await tx.update(transactions).set({ userId: null }).where(eq(transactions.userId, user.id))
  await tx.delete(users).where(eq(users.id, user.id)) // sessions/tokens: cascade; events: set null
})
// + wylogowanie (clearSessionCookie), audit_log: { action: 'delete', tableName: 'users', recordId }
```

Uwaga (review 4.2): jeśli zamiast `delete` konto jest anonimizowane (wiersz zostaje), `users.email` MUSI zostać zanonimizowany (np. `deleted-{id}@invalid`), inaczej `users_email_unique` i lookup `lower(email)` na zawsze blokują ponowne założenie konta przez tę kupującą (`account_exists` / `login_required`). W obu wariantach wyczyść e-mail z `audit_log.after` (wpis `create users` z `source: 'shop_account_link'` go zawiera) dla `recordId = user.id`. Test: po usunięciu nowy link konta tworzy konto od nowa.

Testy: zamówienia zostają z `userId = null`, „wyślij link” dalej działa, `patient` dostaje 403. Commit.

---

## Faza 7: Frontend checkoutu

### Task 7.1: Meta Pixel

**Files:**
- Create: `src/lib/shop/pixel.ts`

```ts
// fbq istnieje tylko po zgodzie na cookies marketingowe (MetaPixel.astro) – bez zgody to no-op.
type PixelEvent = 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase'
export function trackPixel(event: PixelEvent, params: { value: number; currency: 'PLN'; content_ids: string[]; content_type: 'product'; num_items?: number }) {
  const fbq = (window as any).fbq
  if (typeof fbq === 'function') fbq('track', event, params)
}
export function trackPurchaseOnce(orderId: string, params: Parameters<typeof trackPixel>[1]) {
  const key = `sklep:purchase-tracked:${orderId}`
  try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1') } catch {}
  trackPixel('Purchase', params)
}
```

`content_ids` to slugi (nigdy e-mail). Commit.

### Task 7.2: Koszyk + formularz zamówienia

**Files:**
- Create: `src/pages/sklep/koszyk.astro` (`<CartCheckout client:load sessionEmail={locals.user?.email ?? null} />`)
- Create: `src/components/sklep/CartCheckout.tsx`

Zachowanie:
1. Mount: `getCart()`, potem `POST /api/sklep/cart/quote`. Przy `removedSlugs` usuń je z koszyka i pokaż toast (`react-hot-toast`, jak w formularzach). Pusty koszyk: „Koszyk jest pusty” + link do `/sklep`.
2. Lista pozycji (okładka, tytuł, cena, „Usuń”), suma.
3. Formularz:
   - E-mail (gdy zalogowana: wypełniony, `readOnly`, „Kupujesz jako …”),
   - Imię (opcjonalne),
   - ☐ „Chcę fakturę” rozwija: Nazwa firmy, NIP, Adres,
   - ☐ „Załóż konto, żeby mieć zakupy zawsze pod ręką” (ukryte dla zalogowanych), **bez pól hasła**. Pod spodem: „Po płatności wyślemy Ci link do ustawienia hasła.”,
   - ☐ (wymagany) `TERMS_CONSENT_LABEL` z linkami do `/regulamin-sklepu` i `/polityka-prywatnosci` (nowa karta),
   - ☐ (wymagany) `DIGITAL_CONTENT_CONSENT_TEXT`,
   - Przycisk **„Zamawiam i płacę 29,00 zł”** (art. 17 ust. 3 u.p.k.: przycisk musi jednoznacznie wskazywać obowiązek zapłaty),
   - Pod przyciskiem: „Płatność obsługuje Tpay. Po opłaceniu e-book wyślemy na podany e-mail.”
4. Submit: walidacja klientem (te same reguły co `createOrderSchema`), `trackPixel('InitiateCheckout')`, `POST /api/sklep/orders` (przycisk zablokowany do odpowiedzi, chroni przed podwójnym zamówieniem). Sukces: `window.location.href = redirectUrl`. Błędy: `CART_CHANGED` ponawia quote + toast, `ALREADY_OWNED` daje link do `/konto/zakupy`.
5. **Nie** czyść koszyka przy submit. Czyścimy na stronie sukcesu po `paid` (porzucona płatność nie gubi koszyka).
6. A11y: etykiety `<label for>`, błędy przy polach z `aria-describedby`, focus na pierwszym błędzie.

Commit.

### Task 7.3: Strony wyniku płatności

**Files:**
- Create: `src/pages/sklep/platnosc/sukces.astro`, `src/pages/sklep/platnosc/blad.astro`
- Create: `src/components/sklep/PaymentStatus.tsx`

Tpay wraca na `sukces.astro?order=<id>` (sukces) albo prosto na `blad.astro?order=<id>` (błąd lub przerwanie), bez parametru `status` (Task 3.2, `successUrl`/`errorUrl`). `PaymentStatus client:load orderId` odpytuje `GET /api/sklep/orders/{id}/status` co 3 s, maks. 60 s:
- `pending`: spinner „Czekamy na potwierdzenie płatności z Tpay…”,
- `paid` i `confirmationSent: false`: „Płatność przyjęta, przygotowujemy potwierdzenie…” (dalej odpytuje). Przycisków „Pobierz” jeszcze nie ma,
- `paid` i `confirmationSent: true`: ✓ „Dziękuję za zakup!”, przyciski „Pobierz” dla każdej pozycji (`/api/sklep/orders/{id}/items/{itemId}/download`), „Link do pobrania wysłałam też na {email}”, sekcja konta wg `accountState` (`link_sent`: „Link do założenia konta wysłałam na {email}”, `exists`: „Zaloguj się – zakup pojawi się w Twoim koncie”), `clearCart()`, `trackPurchaseOnce(orderId, …)`,
- `failed`: komunikat + „Wróć do koszyka”,
- `expired`: „Zamówienie wygasło. Jeśli płatność mimo to wpłynęła, napiszę do Ciebie mailem.” + „Wróć do koszyka” (płatność spóźniona, Task 3.4),
- timeout lub 404 (brak ciasteczka, np. inna przeglądarka): „Płatność jest przetwarzana. Link do pobrania przyjdzie mailem w ciągu kilku minut. Nie przyszedł? [Wyślij link ponownie](/sklep/wyslij-link)”.

`blad.astro`: „Płatność nie została zakończona. Koszyk czeka na Ciebie.” + przycisk do koszyka.

Commit.

---

## Faza 8: Dane produktu i storage

### Task 8.1: Seed produktu

**Files:**
- Create: `scripts/seed-products.ts` (uruchamianie: `npx tsx scripts/seed-products.ts`, `tsx` już jest w devDependencies, bo używa go `test:e2e:cleanup`)

```ts
// Idempotentny upsert produktów. Zmiana ceny => nowy wpis w product_price_history.
const PRODUCTS = [{
  slug: 'proteinowa-piekarnia',
  type: 'ebook',
  title: 'Proteinowa Piekarnia',
  price: '29.00',
  status: 'active',
  fileObjectKey: 'products/ebooks/proteinowa-piekarnia/proteinowa-piekarnia-v1.pdf',
  fileName: 'Proteinowa-Piekarnia-Paulina-Maciak.pdf',
}]
// for each: select by slug -> insert (+history) | update; if price changed -> insert history
```

Logika upsertu w `ProductRepository.upsert()` z testem integracyjnym (nowy produkt: 1 wpis historii, ta sama cena: bez nowego wpisu, zmiana ceny: nowy wpis). Commit.

### Task 8.2: Upload PDF do R2

**Files:**
- Create: `scripts/upload-product-file.ts`. Argumenty: ścieżka lokalna i objectKey. `PutObjectCommand` z `@aws-sdk/client-s3` (już zależność), `ContentType: application/pdf`, konfiguracja z tych samych `OBJECT_STORAGE_*` co `s3-presign.ts`. Wypisuje rozmiar i klucz.

```bash
npx tsx scripts/upload-product-file.ts "./e-book Proteinowa piekarnia Paulina Maciak.pdf" products/ebooks/proteinowa-piekarnia/proteinowa-piekarnia-v1.pdf
```

Nowa wersja pliku dostaje nowy klucz (`-v2.pdf`) + seed. Zamówienia nie przechowują klucza produktu, więc wszyscy klienci od razu dostają nową wersję. Commit.

---

## Faza 9: Panel Pauliny i utrzymanie

### Task 9.1: `/dietetyk/zamowienia`

**Files:**
- Create: `src/pages/dietetyk/zamowienia.astro`
- Create: `src/pages/api/dietitian/shop-orders/[id]/resend.ts`
- Modify: `src/lib/repositories/shopOrderRepository.ts`: `listForAdmin({ status?, invoiceOnly?, page })`

Tabela (paginacja 50): data, numer, e-mail, imię, pozycje, kwota, status (badge), „Konto” (tak/nie), ikona faktury (rozwija dane do faktury), przycisk „Wyślij link ponownie” (POST resend: nowy download token + mail `ShopDownloadLinks`, tylko dla `paid`). Filtry: status, „tylko z fakturą”, **„do zwrotu / do decyzji”**. Dostęp: rola `dietitian` (rbac już to robi). Wpis do `audit_log` przy resend.

- **Przychód / sumy** liczymy z `shop_orders.status = 'paid'`, **nie** z `transactions.status = 'success'` (płatność spóźniona i nieoczekiwana mają transakcję `success`, a zamówienie `expired` / `failed`).
- **„Do zwrotu / do decyzji”**: zamówienia `expired` albo `failed` z transakcją `success` (join `transactions.shopOrderId`) oraz zamówienia z eventem `shop_order_amount_mismatch`. Osobny badge (np. pomarańczowy) i licznik nad tabelą. Zwrot Paulina robi ręcznie w panelu Tpay (patrz „Ryzyka”).

Commit.

### Task 9.2: Cron `shop-maintenance`

**Files:**
- Create: `src/lib/services/shopMaintenanceService.ts`
- Create: `src/pages/api/cron/shop-maintenance.ts`
- Modify: `vercel.json`: `{ "path": "/api/cron/shop-maintenance", "schedule": "0 3 * * *" }`
- Test: `tests/integration/services/shopMaintenanceService.test.ts`

```ts
async run(now = new Date()) {
  return {
    expired: await this.expirePendingOrders(now),         // pending > PENDING_ORDER_TTL_HOURS -> 'expired' / 'cancelled'
    confirmationsRetried: await this.retryConfirmations(now), // paid && confirmationSentAt NULL -> ponów mail potwierdzenia
    deletedTokens: await this.deleteExpiredAccountTokens(now), // shop_account_tokens z expiresAt < now (konto nie powstaje)
    deletedDownloadTokens: await this.deleteExpiredDownloadTokens(now), // shop_download_tokens z expiresAt < now (każdy resend dodaje nowe)
    anonymized: await this.anonymizeOldOrders(now),       // paidAt/createdAt < 1 stycznia (rok(now) - 5)
  }
}
// anonimizacja: email = 'anon-' || id || '@anonymized.local', firstName/invoice* = NULL, anonymizedAt = now;
//               transactions.payerEmail/payerName tak samo; usuń download tokens zamówienia
```

**`expirePendingOrders`** – wyścig z webhookiem (płatność w ostatniej chwili): dla każdego zamówienia w **jednej transakcji DB** warunkowe UPDATE-y:
- `shop_orders SET status='expired' WHERE id = ? AND status = 'pending'`,
- `transactions SET status='cancelled' WHERE shopOrderId = ? AND status = 'pending'` – **nigdy** nie nadpisuje transakcji `success` (webhook mógł już zapisać płatność spóźnioną) ani `failed`.

0 wierszy przy zamówieniu = webhook był pierwszy, pomijamy. Webhook i tak sam traktuje `pending` starsze niż 24 h jak wygasłe (Task 3.4), więc kolejność cron/webhook nie zmienia wyniku. Test: transakcja `success` + zamówienie `pending` po terminie → cron nie zmienia transakcji.

**`retryConfirmations`** – surowe tokeny nie są przechowywane (tylko hash), więc ponowienie **tworzy NOWY download token** (`createDownloadToken`) i **nowy link konta** (`resolveAccountLinkForOrder`), potem `sendOrderConfirmation` i przy `true` `confirmationSentAt = now` (`WHERE confirmationSentAt IS NULL`). Stare tokeny zostają ważne do wygaśnięcia. Tylko `paid` (nie `expired`/`failed` z transakcją `success`). Test: po ponowieniu w DB jest drugi token, mail dostaje nowy surowy token.

**Eventy a retencja:** `shop_order_amount_mismatch` jest znacznikiem idempotencji maila o niezgodnej kwocie (Task 3.4). Ewentualne czyszczenie `events` **nie może** go usuwać, dopóki istnieje zamówienie. Anonimizacja zamówienia nie usuwa eventów sklepu (w `properties` są tylko id i kwoty, bez e-maila).

Granica 5 lat: dowód z roku 2026 przechowujemy do 31.12.2031, więc anonimizujemy zamówienia z `createdAt < 2026-01-01`, gdy `now >= 2032-01-01`. Formuła: `createdAt < startOfYear(now) - 5 lat`. Test z `now = 2032-01-01`: zamówienie z 2026-12-31 anonimizowane, z 2027-01-01 nie.

Endpoint: `GET`, `Authorization === 'Bearer ' + process.env.CRON_SECRET`, inaczej 401. Zwraca JSON z licznikami. Commit.

---

## Faza 10: Treści prawne, testy E2E, uruchomienie

### Task 10.1: Regulamin sklepu

**Files:**
- Create: `src/pages/regulamin-sklepu.astro`. Treść z `.ai-sklep/regulamin-sklepu.md` **po akceptacji Pauliny**. Layout jak `polityka-prywatnosci.astro` (te same klasy nagłówków, `AnimatedSection`).
- Modify: `src/components/Footer.astro`: link „Regulamin sklepu” obok „Polityka prywatności”.
- Data na stronie = `SHOP_TERMS_VERSION`.

Strona publiczna, **niezależna** od `FF_SKLEP` (musi być dostępna dla klientek, które już kupiły). Commit.

### Task 10.2: Polityka prywatności

**Files:**
- Modify: `src/pages/polityka-prywatnosci.astro` według `.ai-sklep/polityka-prywatnosci-zmiany.md`. Zmiany obejmują też naprawę istniejącej niezgodności: polityka twierdzi, że nie ma narzędzi marketingowych, a Meta Pixel działa.

Commit.

### Task 10.3: E2E + checklist przed włączeniem

**Files:**
- Create: `tests/e2e/sklep/purchase.spec.ts` (wzór: `tests/e2e/auth/*`, page objects w `tests/e2e/page-objects`)

Scenariusz (sandbox Tpay, `FF_SKLEP=true`): produkt, „Kup”, koszyk, e-mail testowy + zgody, płatność w sandboxie Tpay (formularz testowy), powrót, status `paid` (webhook musi dotrzeć: na lokalnym środowisku użyj Vercel Preview albo tunelu, np. `cloudflared`), przycisk „Pobierz” zwraca 302 na URL R2. Drugi scenariusz bez płatności: brak zgód blokuje submit.

Checklist przed `FF_SKLEP=true` na produkcji:
- [ ] Migracja wykonana na produkcji (`npm run db:push` / migrate), `SELECT DISTINCT role FROM users` sprawdzone
- [ ] PDF wgrany do R2 produkcyjnego, seed wykonany, `status = 'active'`
- [ ] Regulamin i polityka prywatności opublikowane **tego samego dnia, w którym włączamy `FF_SKLEP`** (treść polityki opisuje sklep). Data „ostatniej aktualizacji” w polityce oraz `SHOP_TERMS_VERSION` / data w regulaminie = faktyczny dzień publikacji
- [ ] Meta Events Manager → piksel 1164111462436313 → **Automatic Advanced Matching wyłączone** (inaczej Meta czyta e-mail z formularza zamówienia, a polityka mówi, że go nie przekazujemy)
- [ ] Region bucketu R2 sprawdzony w panelu Cloudflare. Jeśli EU (`.eu.r2.cloudflarestorage.com`), poprawić wpis „Cloudflare R2” w sekcji 5 polityki
- [ ] Testowy zakup na produkcji za 29 zł (potem zwrot w panelu Tpay), mail doszedł, link działa, konto założone linkiem „Ustaw hasło i załóż konto”, `/konto/zakupy` pokazuje ebooka
- [ ] Mail [FAKTURA] dociera do Pauliny
- [ ] Cron widoczny w Vercel → Settings → Cron Jobs, ręczne wywołanie z `CRON_SECRET` zwraca 200
- [ ] Pixel: w Meta Events Manager → Test Events widać 4 zdarzenia (po akceptacji cookies)
- [ ] Lighthouse `/sklep/proteinowa-piekarnia` mobile: Performance > 90

### Task 10.4: Dokumentacja

**Files:**
- Modify: `CLAUDE.md`: sekcja „Sklep (ebooki)”: flaga `FF_SKLEP`, nowe env, procedura „Jak dodać nowy ebook” (poniżej), rola `customer`.

**Jak dodać nowy ebook (procedura):**
1. Zdjęcia do `src/assets/sklep/<slug>/`, treść do `src/content/ebooks/<slug>.md`.
2. `npx tsx scripts/upload-product-file.ts <pdf> products/ebooks/<slug>/<slug>-v1.pdf`
3. Dopisz produkt w `scripts/seed-products.ts` ze statusem `draft`, uruchom na produkcji.
4. Deploy, sprawdź stronę na preview, zmień status na `active` (seed).

---

## Ryzyka i otwarte tematy (poza zakresem MVP)

| Temat | Opis | Rekomendacja |
|---|---|---|
| Regulamin PZK | PZK sprzedaje bez regulaminu i bez zgody na utratę prawa odstąpienia, a to treść cyfrowa z dostępem na 12 miesięcy. | Osobne zadanie: regulamin PZK albo wspólny „Regulamin sprzedaży” + checkboxy w `/pzk/kup`. |
| Niespójny adres | Meta description polityki prywatności: „95-060 Brzeziny”, treść: „Gaj 5, 95-060 Gaj”. | Paulina potwierdza poprawny adres do regulaminu. |
| Eksport danych RODO | Brak `/api/user/export-data`. | MVP: na żądanie mailowe (polityka już tak mówi). |
| Crony przypomnień | `vercel.json` wskazuje nieistniejące endpointy (friday/sunday-reminder). | Osobny ticket: usunąć wpisy albo zaimplementować. |
| Rozmiar PDF | 86 MB. | Kompresja przed uploadem (0.3). |
| Meta Pixel w strefie pacjenta | `MetaPixel` jest w `Layout.astro`, więc `PageView` leci też z `/pacjent/*` i `/waga`. URL-e mogą zdradzać kontekst zdrowotny (art. 9 RODO). | Osobny ticket: nie ładować Pixela na `/pacjent/*`, `/dietetyk/*`, `/konto/*`, `/sklep/pobierz/*`, `/sklep/konto/*`. |
| Tpay „groups” | Ograniczenie metod płatności wyłączone (karty i raty widoczne). | Dla 29 zł to plus. Bez zmian. |
| Podwójne kliknięcie „Zamawiam i płacę” | Dwa żądania tworzą dwa zamówienia `pending` i dwie transakcje Tpay. Klientka może opłacić obie. | UI blokuje przycisk do odpowiedzi. Nieopłacone wygasają po 24 h. Podwójną płatność Paulina zwraca ręcznie w panelu Tpay. |
| Zwroty przez API Tpay | Webhook (jak PZK) nadpisuje `transactions.tpayTransactionId` wartością `tr_id`, a zwrot przez API Tpay potrzebuje id transakcji z OpenAPI (zapisanego przy inicjacji). | MVP: zwroty (płatność spóźniona, nieoczekiwana, niezgodna kwota, podwójna) ręcznie w panelu Tpay. Przy automatyzacji zwrotów trzymać oba id zamiast nadpisywać (`TODO` w `shopPaymentService.ts`). |
| Alert o nieznanej transakcji | `notifyOwnerUnknownPayment` nie ma guardu „dokładnie raz” (brak wiersza w bazie), więc duplikat od Tpay = drugi mail. | Akceptowalne (rzadkie). |
| Lookupy `lower(email)` | `users`/`shop_orders` szukane po `lower(email)` (konto sklepu, przypinanie) nie używają zwykłych indeksów na `email`. | Przy tej skali bez znaczenia. Później indeks wyrażeniowy `lower(email)`. |
| Rate limit w pamięci | Limitery to `Map` w pamięci instancji serverless, więc na Vercelu są „miękkie”. | Akceptowalne w MVP (jak dla formularzy). |
| IP klienta z `x-forwarded-for` | `getClientIp` ufa pierwszemu wpisowi `x-forwarded-for`. Na Vercelu nagłówek ustawia platforma (klient go nie podrobi), poza Vercelem (inny proxy) limit IP dałoby się obejść. | Na Vercelu OK. Przy zmianie hostingu: brać IP z zaufanego nagłówka proxy. |
