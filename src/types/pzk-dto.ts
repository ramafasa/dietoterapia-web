/**
 * PZK (Przestrzeń Zdrowej Kobiety) - Data Transfer Objects
 *
 * This file contains DTO and Command Model definitions for the PZK API.
 * All types are derived from database schema entities (@/db/schema.ts).
 *
 * Naming conventions:
 * - Database: snake_case
 * - JSON API: camelCase
 * - TypeScript: PascalCase for types, camelCase for properties
 */

import type {
  PzkCategory,
  PzkMaterial,
  PzkMaterialPdf,
  PzkMaterialVideo,
  PzkModuleAccess,
  PzkNote,
  PzkReview,
  User,
} from '@/db/schema'

// ============================================================================
// Common / Utility Types
// ============================================================================

/**
 * Generic API response envelope
 * Used for consistent error handling across all endpoints
 */
export interface ApiResponse<T> {
  data: T | null
  error: ApiError | null
}

/**
 * API error structure
 * Maps domain errors to HTTP status codes with additional context
 */
export interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>
}

/**
 * PZK module identifier (1, 2, or 3)
 * Represents the three educational modules in the PZK program
 */
export type PzkModuleNumber = 1 | 2 | 3

/**
 * PZK bundle identifier
 * Represents the complete bundle (all 3 modules)
 */
export type PzkBundleType = 'ALL'

/**
 * Material status values
 * Controls visibility and actionability in the patient UI
 */
export type PzkMaterialStatus = 'draft' | 'published' | 'archived' | 'publish_soon'

// ============================================================================
// 1. GET /api/pzk/access - Access Summary
// ============================================================================

/**
 * Single module access record (simplified for API response)
 * Derived from: PzkModuleAccess (omits id, userId, revokedAt, timestamps)
 */
export interface PzkAccessRecord {
  module: PzkModuleNumber
  startAt: string // ISO 8601 timestamp
  expiresAt: string // ISO 8601 timestamp
}

/**
 * Access summary response
 * Used for navigation/menu gating and UI access control
 *
 * Business rule: hasAnyActiveAccess determines if user can access PZK at all
 * Active = revokedAt IS NULL AND startAt <= now() AND now() < expiresAt
 */
export interface PzkAccessSummary {
  hasAnyActiveAccess: boolean
  activeModules: PzkModuleNumber[]
  access: PzkAccessRecord[]
  serverTime: string // ISO 8601 timestamp for client sync
}

// ============================================================================
// 2. GET /api/pzk/catalog - Catalog (hierarchical structure)
// ============================================================================

/**
 * Material in catalog (simplified view)
 * Derived from: PzkMaterial + computed access fields
 */
export interface PzkCatalogMaterial {
  id: string
  title: string
  description: string | null
  status: PzkMaterialStatus
  order: number
  module: PzkModuleNumber // Module number (1, 2, or 3) - used for purchase flow

  // Computed access control fields
  isLocked: boolean // User lacks module access OR status is publish_soon
  isActionable: boolean // Can click/view details (unlocked + published)
  hasPdf: boolean // Material has at least one PDF attachment
  hasVideos: boolean // Material has at least one video attachment
}

/**
 * Category in catalog
 * Derived from: PzkCategory (full fields) + nested materials
 */
export interface PzkCatalogCategory {
  id: string
  slug: string
  label: string
  description: string | null
  displayOrder: number
  materials: PzkCatalogMaterial[]
}

/**
 * Module in catalog
 * Groups categories by module number (1, 2, or 3)
 */
export interface PzkCatalogModule {
  module: PzkModuleNumber
  isActive: boolean // User has active access to this module
  categories: PzkCatalogCategory[]
}

/**
 * Complete catalog response
 * Hierarchical structure: modules → categories → materials
 *
 * Performance: Single query with joins, grouped in-memory
 * Index used: pzk_materials(status, module, category_id, order)
 */
export interface PzkCatalog {
  modules: PzkCatalogModule[]
}

// ============================================================================
// 3. GET /api/pzk/materials/:materialId - Material Details
// ============================================================================

/**
 * Category reference in material details (simplified)
 * Derived from: PzkCategory (subset of fields)
 */
export interface PzkMaterialCategoryRef {
  id: string
  slug: string
  label: string
  displayOrder: number
}

/**
 * PDF attachment in material details (simplified)
 * Derived from: PzkMaterialPdf (omits objectKey, contentType, timestamps)
 *
 * Note: objectKey is intentionally omitted for security (use presign endpoint)
 */
export interface PzkMaterialPdfDto {
  id: string
  fileName: string | null
  displayOrder: number
}

/**
 * Video attachment in material details (simplified)
 * Derived from: PzkMaterialVideo (omits materialId, timestamps)
 */
export interface PzkMaterialVideoDto {
  id: string
  youtubeVideoId: string
  title: string | null
  displayOrder: number
}

/**
 * User's note for material (simplified)
 * Derived from: PzkNote (omits id, userId, materialId, createdAt)
 */
export interface PzkMaterialNoteDto {
  content: string
  updatedAt: string // ISO 8601 timestamp
}

/**
 * Material access state
 * Computed based on user's module access and material status
 */
export interface PzkMaterialAccess {
  isLocked: boolean
  ctaUrl: string | null
  reason?: 'no_module_access' | 'publish_soon' // Only present when locked
}

/**
 * Complete material details response
 * Derived from: PzkMaterial + PzkCategory + PzkMaterialPdf[] + PzkMaterialVideo[] + PzkNote?
 *
 * Business rules:
 * - If locked (no access): contentMd, pdfs, videos, note are empty/null
 * - If draft/archived: returns 404 (no metadata leak)
 * - If publish_soon: returns with isLocked=true, no actionable content
 */
export interface PzkMaterialDetails {
  id: string
  module: PzkModuleNumber
  category: PzkMaterialCategoryRef | null // Null when locked
  status: PzkMaterialStatus
  order: number
  title: string
  description: string | null
  contentMd: string | null // Null when locked

  // Attachments (empty arrays when locked)
  pdfs: PzkMaterialPdfDto[]
  videos: PzkMaterialVideoDto[]

  // User's private note (null if not exists or locked)
  note: PzkMaterialNoteDto | null

  // Access control
  access: PzkMaterialAccess
}

// ============================================================================
// 4. POST /api/pzk/materials/:materialId/pdfs/:pdfId/presign - Presigned PDF
// ============================================================================

/**
 * Presign request (optional TTL override)
 * Command model for generating presigned download URL
 */
export interface PzkPresignRequest {
  ttlSeconds?: number // Optional; defaults to 60s
}

/**
 * Presign response
 * Contains time-limited signed URL for direct download from storage
 */
export interface PzkPresignResponse {
  url: string // Presigned URL (e.g., S3/R2 with signature)
  expiresAt: string // ISO 8601 timestamp
  ttlSeconds: number // Actual TTL used
}

// ============================================================================
// 5. Notes - GET/PUT/DELETE /api/pzk/materials/:materialId/note
// ============================================================================

/**
 * Note DTO (for GET and PUT responses)
 * Derived from: PzkNote (omits id, userId, createdAt)
 */
export interface PzkNoteDto {
  materialId: string
  content: string
  updatedAt: string // ISO 8601 timestamp
}

/**
 * Note upsert request (for PUT)
 * Command model for creating or updating a note
 */
export interface PzkNoteUpsertRequest {
  content: string // Max 10k chars (validated in API)
}

// ============================================================================
// 6. Reviews - GET /api/pzk/reviews (list)
// ============================================================================

/**
 * Review author (anonymized)
 * Derived from: User (only firstName exposed)
 */
export interface PzkReviewAuthor {
  firstName: string | null
}

/**
 * Review DTO (in list)
 * Derived from: PzkReview + User.firstName
 */
export interface PzkReviewDto {
  id: string
  author: PzkReviewAuthor
  rating: number // 1-6
  content: string
  createdAt: string // ISO 8601 timestamp
  updatedAt: string // ISO 8601 timestamp
}

/**
 * Reviews list response (cursor-based pagination)
 * Used for social proof inside PZK (requires active module access)
 */
export interface PzkReviewsList {
  items: PzkReviewDto[]
  nextCursor: string | null // Opaque cursor for next page
}

// ============================================================================
// 7. My Review - GET/PUT/DELETE /api/pzk/reviews/me
// ============================================================================

/**
 * My review DTO (GET and PUT responses)
 * Derived from: PzkReview (omits userId)
 */
export interface PzkMyReviewDto {
  id: string
  rating: number // 1-6
  content: string
  createdAt: string // ISO 8601 timestamp
  updatedAt: string // ISO 8601 timestamp
}

/**
 * Review upsert request (for PUT)
 * Command model for creating or updating user's review
 */
export interface PzkReviewUpsertRequest {
  rating: number // Must be integer 1-6
  content: string // Max 5k chars (validated in API)
}

// ============================================================================
// 8. Purchase Landing Page - ViewModels (/pzk/kup)
// ============================================================================

/**
 * PZK Purchase CTA Configuration
 * Used for building purchase links with module parameters
 */
export interface PzkPurchaseCtaConfig {
  baseUrl: string
  paramName: string
}

/**
 * Content section for module accordion
 * Used to display detailed module contents (lectures, meal plans, etc.)
 */
export interface PzkModuleContentSection {
  heading: string
  items: string[]
}

/**
 * Module card data for purchase landing page
 */
export interface PzkPurchaseModuleCardVM {
  module: PzkModuleNumber
  title: string
  subtitle?: string
  price?: number // Current price (PLN)
  originalPrice?: number // Original price before discount (PLN)
  discountBadge?: string // Badge text e.g., "PROMOCJA"
  promotionNote?: string // Additional promotion info text
  bullets: string[]
  contentSections?: PzkModuleContentSection[] // Accordion with detailed content
  ctaLabel: string
  ctaUrl: string | null
}

/**
 * Bundle card data for purchase landing page
 * Represents the complete package (all 3 modules)
 */
export interface PzkPurchaseBundleCardVM {
  title: string
  subtitle?: string
  price: number // Current price (PLN)
  originalPrice: number // Original price before discount (PLN)
  discountBadge?: string // Badge text e.g., "PROMOCJA"
  promotionNote?: string // Additional promotion info text
  bullets: string[]
  ctaLabel: string
}

/**
 * Hero section ViewModel
 */
export interface PzkPurchaseHeroVM {
  title: string
  subtitle?: string
  lead: string
  highlights?: string[]
  primaryCta: {
    label: string
    href: string
    isExternal: boolean
  }
  secondaryCta?: {
    label: string
    href: string
    isExternal: boolean
  }
}

/**
 * "For Who" section ViewModel
 */
export interface PzkPurchaseForWhoVM {
  title: string
  subtitle?: string
  painPoints: string[]
  notForYouTitle?: string
  notForYou?: string[]
}

/**
 * "How It Works" section ViewModel
 */
export interface PzkPurchaseHowItWorksVM {
  title: string
  subtitle?: string
  features: Array<{
    icon: 'calendar' | 'clock' | 'target' | 'play'
    title: string
    description: string
  }>
}

/**
 * "Support" section ViewModel
 */
export interface PzkPurchaseSupportVM {
  title: string
  subtitle?: string
  supportFeatures: Array<{
    title: string
    description: string
    badge?: string
  }>
}

/**
 * "Benefits" section ViewModel
 */
export interface PzkPurchaseBenefitsVM {
  title: string
  subtitle?: string
  benefits: Array<{
    icon: 'scale' | 'heart' | 'energy' | 'mind' | 'growth' | 'calendar'
    title: string
    description: string
  }>
  note?: string
}

/**
 * CTA bar section ViewModel
 */
export interface PzkPurchaseCtaBarVM {
  showLoginLink: boolean
  loginHref: string
  patientGateHref: string
  contactHref: string
}

/**
 * FAQ item ViewModel
 */
export interface PzkFaqItemVM {
  id: string
  question: string
  answerMd: string
}

/**
 * Complete landing page ViewModel
 */
export interface PzkPurchaseLandingVM {
  seo: {
    title: string
    description: string
  }
  hero: PzkPurchaseHeroVM
  forWho: PzkPurchaseForWhoVM
  howItWorks: PzkPurchaseHowItWorksVM
  support: PzkPurchaseSupportVM
  benefits: PzkPurchaseBenefitsVM
  bundle?: PzkPurchaseBundleCardVM // Optional bundle offering
  modules: PzkPurchaseModuleCardVM[]
  ctaBar: PzkPurchaseCtaBarVM
  faq?: PzkFaqItemVM[]
}

// ============================================================================
// Query Parameters (for GET endpoints)
// ============================================================================

/**
 * Catalog query params
 */
export interface PzkCatalogQueryParams {
  modules?: string // Comma-separated: "1,2,3"
  includeStatuses?: string // Comma-separated: "published,publish_soon"
  locale?: string // e.g., "pl"
}

/**
 * Material details query params
 */
export interface PzkMaterialQueryParams {
  include?: string // Comma-separated: "pdfs,videos,note" (default: all)
}

/**
 * Reviews list query params
 */
export interface PzkReviewsQueryParams {
  cursor?: string // Opaque cursor for pagination
  limit?: number // Default: 20, Max: 50
  sort?: 'createdAtDesc' | 'updatedAtDesc' // Default: createdAtDesc
}

// ============================================================================
// Database-to-DTO Mappers (Type Helpers)
// ============================================================================

/**
 * Extract timestamp fields as ISO strings
 * Helper for converting Date objects to ISO 8601 strings in responses
 */
export type TimestampToString<T> = {
  [K in keyof T]: T[K] extends Date | null ? string | null : T[K]
}

/**
 * Omit audit/internal fields from entity
 * Helper for creating public DTOs from database entities
 */
export type OmitAuditFields<T> = Omit<T, 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>
