import { pgTable, uuid, varchar, timestamp, decimal, boolean, text, jsonb, integer, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ===== USERS TABLE =====
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 20 }).notNull(), // 'patient' | 'dietitian' | 'customer'
  // NULL = e-mail niepotwierdzony. Logowanie blokowane tylko dla role='customer'.
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),

  // Profile
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),
  age: integer('age'),
  gender: varchar('gender', { length: 20 }), // 'male' | 'female'

  // Status
  status: varchar('status', { length: 20 }).default('active').notNull(),
  // 'active' | 'paused' | 'ended'
  endedAt: timestamp('ended_at', { withTimezone: true }), // Data nadania statusu 'ended'
  scheduledDeletionAt: timestamp('scheduled_deletion_at', { withTimezone: true }), // ended_at + 24 miesiące

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Composite index for patient queries (role + status)
  // Optimizes: WHERE role = 'patient' AND status = 'active'
  roleStatusIndex: index('idx_users_role_status').on(table.role, table.status),
}))

// ===== SESSIONS TABLE (Lucia Auth) =====
export const sessions = pgTable('sessions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})

// ===== WEIGHT ENTRIES TABLE =====
export const weightEntries = pgTable('weight_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),

  // Weight data
  weight: decimal('weight', { precision: 4, scale: 1 }).notNull(), // 30.0 - 250.0
  measurementDate: timestamp('measurement_date', { withTimezone: true }).notNull(),

  // Metadata
  source: varchar('source', { length: 20 }).notNull(), // 'patient' | 'dietitian'
  isBackfill: boolean('is_backfill').default(false).notNull(),
  isOutlier: boolean('is_outlier').default(false).notNull(),
  outlierConfirmed: boolean('outlier_confirmed').default(false),
  note: varchar('note', { length: 200 }),

  // Audit
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  updatedBy: uuid('updated_by').references(() => users.id),
}, (table) => ({
  // Unique constraint: jeden wpis wagi dziennie per użytkownik (Europe/Warsaw timezone)
  oneEntryPerDay: uniqueIndex('idx_one_entry_per_day').on(
    table.userId,
    sql`DATE(${table.measurementDate} AT TIME ZONE 'Europe/Warsaw')`
  ),
  // Index dla optymalizacji GET /api/weight (keyset pagination)
  userDateIndex: index('idx_weight_entries_user_date').on(
    table.userId,
    sql`${table.measurementDate} DESC`
  ),
}))

// ===== EVENTS TABLE (Analytics) =====
export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),

  eventType: varchar('event_type', { length: 50 }).notNull(),
  // view_add_weight, add_weight_patient, add_weight_dietitian, edit_weight,
  // reminder_sent, reminder_open, reminder_click, login, signup, consent_accept
  // pzk_pdf_presign_success, pzk_pdf_presign_error, pzk_pdf_presign_forbidden

  properties: jsonb('properties'), // {channel, source, flags, etc.}
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Index dla PZK presign logs i innych eventów po typie + czasie
  eventTypeTimestampIndex: index('idx_events_event_type_timestamp').on(
    table.eventType,
    sql`${table.timestamp} DESC`
  ),
}))

// ===== AUDIT LOG TABLE =====
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),

  action: varchar('action', { length: 50 }).notNull(), // create, update, delete
  tableName: varchar('table_name', { length: 50 }).notNull(),
  recordId: uuid('record_id'),

  before: jsonb('before'), // Stary stan
  after: jsonb('after'),   // Nowy stan

  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
})

// ===== INVITATIONS TABLE =====
export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull(),
  tokenHash: varchar('token_hash', { length: 255 }).unique().notNull(),

  createdBy: uuid('created_by').references(() => users.id).notNull(), // Dietetyk
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ===== PASSWORD RESET TOKENS =====
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  tokenHash: varchar('token_hash', { length: 255 }).unique().notNull(),

  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ===== PUSH SUBSCRIPTIONS TABLE =====
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),

  endpoint: text('endpoint').unique().notNull(),
  keys: jsonb('keys').notNull(), // {p256dh, auth}

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ===== CONSENTS TABLE (RODO) =====
export const consents = pgTable('consents', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),

  consentType: varchar('consent_type', { length: 50 }).notNull(),
  // 'data_processing', 'health_data', 'marketing', etc.

  consentText: text('consent_text').notNull(), // Treść zgody w momencie akceptacji
  accepted: boolean('accepted').notNull(),

  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
})

// ===== LOGIN ATTEMPTS TABLE (Rate Limiting) =====
export const loginAttempts = pgTable('login_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull(),

  success: boolean('success').notNull(),
  ipAddress: varchar('ip_address', { length: 45 }), // IPv4/IPv6
  userAgent: text('user_agent'),

  attemptedAt: timestamp('attempted_at', { withTimezone: true }).defaultNow().notNull(),
})

// ===== SHOP: PRODUCTS =====
// Dane handlowe produktu. Treść strony produktu: src/content/ebooks/<slug>.md
export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 100 }).unique().notNull(), // = id wpisu w kolekcji "ebooks"
  type: varchar('type', { length: 20 }).notNull(), // 'ebook' - CHECK w SQL
  title: varchar('title', { length: 255 }).notNull(), // snapshotowany do pozycji zamówienia
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).default('PLN').notNull(),
  status: varchar('status', { length: 20 }).notNull(), // 'draft' | 'active' | 'archived' - CHECK w SQL
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

// ===== SHOP: ORDERS =====
// Źródło prawdy o zakupie. userId opcjonalne (zakup bez konta).
export const shopOrders = pgTable('shop_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderNumber: varchar('order_number', { length: 20 }).unique().notNull(), // ZAM-2026-00001
  email: varchar('email', { length: 255 }).notNull(), // lowercase; anonimizowany po 5 latach
  firstName: varchar('first_name', { length: 100 }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 20 }).notNull(), // 'pending' | 'paid' | 'failed' | 'expired' - CHECK w SQL
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

// ===== SHOP: ORDER ITEMS =====
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

// ===== SHOP: DOWNLOAD TOKENS =====
// Link "/sklep/pobierz/{token}" – 30 dni, bez limitu pobrań
export const shopDownloadTokens = pgTable('shop_download_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').references(() => shopOrders.id, { onDelete: 'cascade' }).notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).unique().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ===== SHOP: ACCOUNT TOKENS =====
// Link "/sklep/konto/{token}" – dowód własności skrzynki: załóż/potwierdź konto lub przypisz zakup
export const shopAccountTokens = pgTable('shop_account_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).unique().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ===== TRANSACTIONS TABLE (Generic Payment System) =====
// Generic transaction table supporting multiple product types:
// - PZK modules: 'PZK_MODULE_1', 'PZK_MODULE_2', 'PZK_MODULE_3'
// - Shop orders: item = 'SHOP_ORDER' (shopOrderId wskazuje zamówienie, userId może być NULL)
// - Future products: 'CONSULTATION_30MIN', 'MEAL_PLAN_CUSTOM', 'EBOOK_XYZ', etc.
export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }), // NULL = zakup w sklepie bez konta
  shopOrderId: uuid('shop_order_id').references(() => shopOrders.id, { onDelete: 'restrict' }),

  // Product identifier (generic, extensible)
  item: varchar('item', { length: 100 }).notNull(),
  // Examples: 'PZK_MODULE_1', 'PZK_MODULE_2', 'PZK_MODULE_3'
  // Future: 'CONSULTATION_30MIN', 'MEAL_PLAN_CUSTOM', 'EBOOK_HEALTHY_RECIPES', etc.

  // Amounts
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(), // 299.00
  currency: varchar('currency', { length: 3 }).default('PLN').notNull(),

  // Transaction status
  status: varchar('status', { length: 20 }).notNull(),
  // 'pending' | 'success' | 'failed' | 'cancelled'

  // Tpay metadata
  tpayTransactionId: varchar('tpay_transaction_id', { length: 255 }).unique(),
  tpayTitle: varchar('tpay_title', { length: 255 }).notNull(), // "PZK Moduł 1"

  // Payer data (snapshot from purchase moment)
  payerEmail: varchar('payer_email', { length: 255 }).notNull(),
  payerName: varchar('payer_name', { length: 255 }), // firstName + lastName

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }), // Date of finalization (success/failed)
}, (table) => ({
  // Index for user transaction listing
  userIdIndex: index('idx_transactions_user_id').on(table.userId, sql`${table.createdAt} DESC`),
  // Index for status monitoring (pending transactions)
  statusIndex: index('idx_transactions_status').on(table.status, sql`${table.createdAt} DESC`),
  // Index for product type (analytics)
  itemIndex: index('idx_transactions_item').on(table.item, sql`${table.createdAt} DESC`),
}))

// ===== PZK (PRZESTRZEŃ ZDROWEJ KOBIETY) TABLES =====

// ===== PZK_CATEGORIES TABLE =====
// Globalna lista kategorii materiałów edukacyjnych (zarządzana ręcznie w MVP)
export const pzkCategories = pgTable('pzk_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 80 }).unique().notNull(),
  label: varchar('label', { length: 160 }).notNull(),
  description: text('description'),
  displayOrder: integer('display_order').unique().notNull(), // CHECK (display_order > 0) - dodane w SQL
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// ===== PZK_MATERIALS TABLE =====
// Materiały edukacyjne w PZK (moduły 1/2/3, wiele PDF, wiele filmów, treść Markdown)
export const pzkMaterials = pgTable('pzk_materials', {
  id: uuid('id').primaryKey().defaultRandom(),
  module: integer('module').notNull(), // CHECK (module IN (1,2,3)) - dodane w SQL
  categoryId: uuid('category_id').references(() => pzkCategories.id, { onDelete: 'restrict' }).notNull(),
  status: varchar('status', { length: 20 }).notNull(), // draft, published, archived, publish_soon - CHECK w SQL
  order: integer('order').notNull(), // CHECK (order > 0) - dodane w SQL
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  contentMd: text('content_md'), // Opcjonalna treść Markdown
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // UNIQUE (module, category_id, order) - deterministyczna kolejność
  uniqueModuleCategoryOrder: uniqueIndex('idx_pzk_materials_module_category_order')
    .on(table.module, table.categoryId, table.order),
  // INDEX (status, module, category_id, order) - optymalizacja listowania
  statusModuleIndex: index('idx_pzk_materials_status_module')
    .on(table.status, table.module, table.categoryId, table.order),
}))

// ===== PZK_MATERIAL_PDFS TABLE =====
// Lista plików PDF przypiętych do materiału (0..N), prywatny bucket S3/R2
export const pzkMaterialPdfs = pgTable('pzk_material_pdfs', {
  id: uuid('id').primaryKey().defaultRandom(),
  materialId: uuid('material_id').references(() => pzkMaterials.id, { onDelete: 'cascade' }).notNull(),
  objectKey: text('object_key').notNull(), // Klucz obiektu w storage (S3/R2)
  fileName: varchar('file_name', { length: 255 }), // Sugerowana nazwa dla Content-Disposition
  contentType: varchar('content_type', { length: 100 }), // np. application/pdf
  displayOrder: integer('display_order').notNull(), // CHECK (display_order > 0) - dodane w SQL
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // UNIQUE (material_id, display_order) - ręczna kolejność PDF-ów
  uniqueMaterialOrder: uniqueIndex('idx_pzk_material_pdfs_material_order')
    .on(table.materialId, table.displayOrder),
  // INDEX (material_id) - pobieranie PDF-ów dla materiału
  materialIndex: index('idx_pzk_material_pdfs_material')
    .on(table.materialId),
}))

// ===== PZK_MATERIAL_VIDEOS TABLE =====
// Lista filmów YouTube przypiętych do materiału (0..N)
export const pzkMaterialVideos = pgTable('pzk_material_videos', {
  id: uuid('id').primaryKey().defaultRandom(),
  materialId: uuid('material_id').references(() => pzkMaterials.id, { onDelete: 'cascade' }).notNull(),
  youtubeVideoId: varchar('youtube_video_id', { length: 32 }).notNull(), // ID filmu (nie URL)
  title: varchar('title', { length: 200 }), // Opcjonalny tytuł do UI
  displayOrder: integer('display_order').notNull(), // CHECK (display_order > 0) - dodane w SQL
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // UNIQUE (material_id, display_order) - ręczna kolejność filmów
  uniqueMaterialOrder: uniqueIndex('idx_pzk_material_videos_material_order')
    .on(table.materialId, table.displayOrder),
  // INDEX (material_id) - pobieranie filmów dla materiału
  materialIndex: index('idx_pzk_material_videos_material')
    .on(table.materialId),
}))

// ===== PZK_MODULE_ACCESS TABLE =====
// Dostęp pacjenta do modułu 1/2/3 (nadawany ręcznie w MVP, 12 miesięcy)
export const pzkModuleAccess = pgTable('pzk_module_access', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  module: integer('module').notNull(), // CHECK (module IN (1,2,3)) - dodane w SQL
  startAt: timestamp('start_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), // CHECK (expires_at > start_at) - dodane w SQL
  revokedAt: timestamp('revoked_at', { withTimezone: true }), // Cofnięcie dostępu (przyszłościowe)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // UNIQUE (user_id, module, start_at) - historia dostępów per moduł
  uniqueUserModuleStart: uniqueIndex('idx_pzk_module_access_user_module_start')
    .on(table.userId, table.module, table.startAt),
  // INDEX (user_id, expires_at) - sprawdzanie aktywnego dostępu
  userExpiresIndex: index('idx_pzk_module_access_user_expires')
    .on(table.userId, table.expiresAt),
}))

// ===== PZK_NOTES TABLE =====
// Prywatne notatki pacjenta do materiału (1 notatka na parę user+material)
export const pzkNotes = pgTable('pzk_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  materialId: uuid('material_id').references(() => pzkMaterials.id, { onDelete: 'cascade' }).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // UNIQUE (user_id, material_id) - jedna notatka per user per materiał
  uniqueUserMaterial: uniqueIndex('idx_pzk_notes_user_material')
    .on(table.userId, table.materialId),
}))

// ===== PZK_REVIEWS TABLE =====
// Recenzje PZK (maksymalnie 1 recenzja na pacjenta, skala 1-6)
export const pzkReviews = pgTable('pzk_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  rating: integer('rating').notNull(), // CHECK (rating BETWEEN 1 AND 6) - dodane w SQL
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // UNIQUE (user_id) - max 1 recenzja per user
  uniqueUser: uniqueIndex('idx_pzk_reviews_user')
    .on(table.userId),
  // INDEX (created_at DESC) - opcjonalnie dla stronicowania
  createdAtIndex: index('idx_pzk_reviews_created_at')
    .on(sql`${table.createdAt} DESC`),
}))

// ===== TYPES (export dla TypeScript) =====
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Session = typeof sessions.$inferSelect
export type WeightEntry = typeof weightEntries.$inferSelect
export type NewWeightEntry = typeof weightEntries.$inferInsert
export type Event = typeof events.$inferSelect
export type AuditLog = typeof auditLog.$inferSelect
export type Invitation = typeof invitations.$inferSelect
export type PushSubscription = typeof pushSubscriptions.$inferSelect
export type Consent = typeof consents.$inferSelect
export type LoginAttempt = typeof loginAttempts.$inferSelect

// Transaction Types (Generic Payment System)
export type Transaction = typeof transactions.$inferSelect
export type NewTransaction = typeof transactions.$inferInsert

// Shop Types
export type Product = typeof products.$inferSelect
export type NewProduct = typeof products.$inferInsert
export type ProductPriceHistory = typeof productPriceHistory.$inferSelect
export type NewProductPriceHistory = typeof productPriceHistory.$inferInsert
export type ShopOrder = typeof shopOrders.$inferSelect
export type NewShopOrder = typeof shopOrders.$inferInsert
export type ShopOrderItem = typeof shopOrderItems.$inferSelect
export type NewShopOrderItem = typeof shopOrderItems.$inferInsert
export type ShopDownloadToken = typeof shopDownloadTokens.$inferSelect
export type NewShopDownloadToken = typeof shopDownloadTokens.$inferInsert
export type ShopAccountToken = typeof shopAccountTokens.$inferSelect
export type NewShopAccountToken = typeof shopAccountTokens.$inferInsert

// PZK Types
export type PzkCategory = typeof pzkCategories.$inferSelect
export type NewPzkCategory = typeof pzkCategories.$inferInsert
export type PzkMaterial = typeof pzkMaterials.$inferSelect
export type NewPzkMaterial = typeof pzkMaterials.$inferInsert
export type PzkMaterialPdf = typeof pzkMaterialPdfs.$inferSelect
export type NewPzkMaterialPdf = typeof pzkMaterialPdfs.$inferInsert
export type PzkMaterialVideo = typeof pzkMaterialVideos.$inferSelect
export type NewPzkMaterialVideo = typeof pzkMaterialVideos.$inferInsert
export type PzkModuleAccess = typeof pzkModuleAccess.$inferSelect
export type NewPzkModuleAccess = typeof pzkModuleAccess.$inferInsert
export type PzkNote = typeof pzkNotes.$inferSelect
export type NewPzkNote = typeof pzkNotes.$inferInsert
export type PzkReview = typeof pzkReviews.$inferSelect
export type NewPzkReview = typeof pzkReviews.$inferInsert
