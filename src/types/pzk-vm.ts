/**
 * PZK View Models
 *
 * This file contains ViewModel types for the PZK Catalog UI.
 * These types simplify rendering by mapping DTO → VM with UI-specific logic.
 *
 * Purpose:
 * - Condense business rules into a single mapping layer
 * - Pre-compute UI states (variant, primaryAction, etc.)
 * - Provide A11y-ready labels and metadata
 *
 * Related DTOs: src/types/pzk-dto.ts
 */

import type {
  PzkModuleNumber,
  PzkPurchaseCta,
  PzkMaterialStatus,
} from './pzk-dto'

// ============================================================================
// Catalog View Models
// ============================================================================

/**
 * Complete catalog ViewModel
 *
 * Mapped from PzkCatalog DTO (src/types/pzk-dto.ts)
 */
export interface PzkCatalogVM {
  purchaseCta: PzkPurchaseCta
  modules: PzkCatalogModuleVM[]
}

/**
 * Module tab ViewModel
 *
 * Enriched with UI-specific metadata:
 * - label: "Moduł 1", "Moduł 2", "Moduł 3"
 * - isActive: user has active access to this module
 * - moduleStatus: computed UI state for rendering
 */
export interface PzkCatalogModuleVM {
  module: PzkModuleNumber
  label: string
  isActive: boolean
  categories: PzkCatalogCategoryVM[]

  /**
   * Module status (computed from user access + materials)
   * - 'active': user has access (isActive=true)
   * - 'locked': no access (isActive=false), has published materials
   * - 'soon': all materials in publish_soon status
   */
  moduleStatus: 'active' | 'locked' | 'soon'
}

/**
 * Category accordion ViewModel
 *
 * Enriched with UI-specific metadata:
 * - isEmpty: computed from materials.length === 0
 */
export interface PzkCatalogCategoryVM {
  id: string
  slug: string
  label: string
  description: string | null
  displayOrder: number
  materials: PzkMaterialRowVM[]
  isEmpty: boolean
}

/**
 * Material row ViewModel
 *
 * Enriched with UI-specific metadata:
 * - variant: 'available' | 'locked' | 'soon'
 * - primaryAction: type-safe action descriptor
 * - aria: accessibility labels
 */
export interface PzkMaterialRowVM {
  id: string
  title: string
  description: string | null
  order: number
  status: PzkMaterialStatus
  hasPdf: boolean
  hasVideos: boolean

  /**
   * UI variant (computed from status + isLocked + isActionable)
   * - 'available': status=published + isActionable=true
   * - 'locked': status=published + isLocked=true + isActionable=false
   * - 'soon': status=publish_soon (always locked, non-actionable)
   */
  variant: 'available' | 'locked' | 'soon'

  /**
   * Primary action descriptor
   * - available: link to material details
   * - locked: CTA to purchase page (new tab)
   * - soon: no action (disabled)
   */
  primaryAction:
    | { type: 'link'; href: string; label: string }
    | { type: 'cta'; href: string; label: string; isExternal: true }
    | { type: 'none' }

  /**
   * A11y metadata
   */
  aria?: {
    statusLabel: string // "Dostępny", "Zablokowany", "Dostępny wkrótce"
  }
}

// ============================================================================
// Error View Models
// ============================================================================

/**
 * Catalog error ViewModel
 *
 * Provides user-friendly error messages and retry logic
 */
export interface PzkCatalogErrorVM {
  /**
   * Error kind (for UI-specific handling)
   */
  kind:
    | 'unauthorized' // 401
    | 'forbidden' // 403
    | 'not_found' // 404
    | 'validation' // 400
    | 'server' // 500
    | 'network' // fetch failed, timeout
    | 'unknown' // unexpected error

  /**
   * User-facing error message (Polish)
   */
  message: string

  /**
   * Optional HTTP status code
   */
  statusCode?: number

  /**
   * Whether retry is possible/recommended
   */
  retryable: boolean
}

// ============================================================================
// Material Details View Models
// ============================================================================

/**
 * Breadcrumb item
 */
export interface PzkBreadcrumbItem {
  label: string
  href?: string // undefined for current page
}

/**
 * Breadcrumbs for material details
 */
export interface PzkMaterialBreadcrumbsVM {
  items: PzkBreadcrumbItem[]
}

/**
 * Badge configuration for material header
 */
export interface PzkMaterialBadgeVM {
  kind: 'available' | 'locked' | 'soon'
  label: string
}

/**
 * Material header ViewModel
 */
export interface PzkMaterialHeaderVM {
  title: string
  description: string | null
  badge: PzkMaterialBadgeVM
  meta: {
    moduleLabel: string
  }
}

/**
 * PDF attachment ViewModel
 */
export interface PzkMaterialPdfVM {
  id: string
  fileName: string | null
  displayOrder: number
  label: string // Fallback: "Załącznik 1" if fileName is null
}

/**
 * Video attachment ViewModel
 */
export interface PzkMaterialVideoVM {
  id: string
  youtubeVideoId: string
  title: string | null
  displayOrder: number
  ariaTitle: string // Fallback: "Wideo" if title is null
}

/**
 * Note ViewModel (for unlocked content)
 */
export interface PzkMaterialNoteVM {
  content: string
  updatedAt: string
}

/**
 * Unlocked material content ViewModel
 */
export interface PzkMaterialUnlockedVM {
  contentMd: string | null
  pdfs: PzkMaterialPdfVM[]
  videos: PzkMaterialVideoVM[]
  note: PzkMaterialNoteVM | null
}

/**
 * Locked material ViewModel (with CTA)
 */
export interface PzkMaterialLockedVM {
  message: string
  cta: {
    href: string
    label: string
    isExternal: true
  }
  module: PzkModuleNumber // For fallback CTA construction
}

/**
 * Publish soon material ViewModel (informational only)
 */
export interface PzkMaterialPublishSoonVM {
  message: string
}

/**
 * Complete material details ViewModel
 */
export interface PzkMaterialDetailsVM {
  id: string
  module: PzkModuleNumber
  status: PzkMaterialStatus
  title: string
  description: string | null
  breadcrumbs: PzkMaterialBreadcrumbsVM
  header: PzkMaterialHeaderVM
  variant: 'unlocked' | 'locked' | 'soon'
  unlocked?: PzkMaterialUnlockedVM
  locked?: PzkMaterialLockedVM
  soon?: PzkMaterialPublishSoonVM
}

/**
 * Material details error ViewModel (consistent with catalog errors)
 */
export interface PzkMaterialDetailsErrorVM {
  kind: 'unauthorized' | 'forbidden' | 'validation' | 'not_found' | 'server' | 'network' | 'unknown'
  message: string
  statusCode?: number
  retryable: boolean
}

// ============================================================================
// PDF Download State
// ============================================================================

/**
 * PDF download state per attachment
 */
export interface PzkPdfDownloadStateVM {
  status: 'idle' | 'loading' | 'success' | 'error' | 'rate_limited'
  message?: string
  retryAfterSeconds?: number
}

// ============================================================================
// Note Editor State
// ============================================================================

/**
 * Note editor ViewModel
 */
export interface PzkNoteEditorVM {
  value: string
  isDirty: boolean
  isSaving: boolean
  isDeleting: boolean
  lastSavedAt?: string
  error?: {
    message: string
    retryable: boolean
  }
}

// ============================================================================
// Reviews View Models
// ============================================================================

/**
 * PZK rating type (1-6 scale)
 */
export type PzkRating = 1 | 2 | 3 | 4 | 5 | 6

/**
 * Review sort options
 */
export type ReviewSortOptionVM = 'createdAtDesc' | 'updatedAtDesc'

/**
 * Single review in list ViewModel
 *
 * Mapped from PzkReviewDto with UI-friendly date labels
 */
export interface PzkReviewListItemVM {
  id: string
  authorFirstName: string // Fallback: "Anonim" if null
  rating: PzkRating
  content: string
  createdAtIso: string
  updatedAtIso: string
  createdAtLabel: string // e.g., "2 stycznia 2025"
  updatedAtLabel?: string // Optional, shown when different from createdAt
}

/**
 * Reviews list ViewModel (with pagination)
 */
export interface PzkReviewsListVM {
  items: PzkReviewListItemVM[]
  nextCursor: string | null
  sort: ReviewSortOptionVM
  limit: number
}

/**
 * My review ViewModel
 *
 * Mapped from PzkMyReviewDto with UI metadata
 */
export interface PzkMyReviewVM {
  id: string
  rating: PzkRating
  content: string
  createdAtIso: string
  updatedAtIso: string
  metaLabel?: string // e.g., "Ostatnio zaktualizowano: 2 stycznia 2025"
}

/**
 * My review editor state (UI-specific)
 *
 * Local state for form, not persisted
 */
export interface PzkMyReviewEditorVM {
  rating: PzkRating | null
  content: string
  isDirty: boolean
  isSubmitting: boolean
  isDeleting: boolean
  fieldErrors?: {
    rating?: string
    content?: string
  }
  submitError?: {
    message: string
    retryable: boolean
  }
  deleteError?: {
    message: string
    retryable: boolean
  }
}

/**
 * Reviews page error ViewModel
 *
 * Structurally consistent with PzkCatalogErrorVM
 */
export interface PzkReviewsErrorVM {
  kind:
    | 'unauthorized'
    | 'forbidden'
    | 'validation'
    | 'not_found'
    | 'server'
    | 'network'
    | 'unknown'
  message: string
  statusCode?: number
  retryable: boolean
}

/**
 * Inline error ViewModel (for load more failures, etc.)
 */
export interface PzkInlineErrorVM {
  message: string
  retryable: boolean
}
