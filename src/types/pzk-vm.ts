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

import type { PzkModuleNumber, PzkPurchaseCta } from './pzk-dto'

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
 */
export interface PzkCatalogModuleVM {
  module: PzkModuleNumber
  label: string
  isActive: boolean
  categories: PzkCatalogCategoryVM[]
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
  status: 'published' | 'publish_soon'
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
