/**
 * PZK DTO → ViewModel Mappers
 *
 * This module provides mapping functions to convert PZK DTOs
 * (from API responses) into ViewModels optimized for UI rendering.
 *
 * Purpose:
 * - Centralize UI logic (variant computation, action descriptors)
 * - Pre-compute derived states (isEmpty, aria labels)
 * - Keep components simple and declarative
 */

import type {
  PzkCatalog,
  PzkCatalogModule,
  PzkCatalogCategory,
  PzkCatalogMaterial,
  PzkModuleNumber,
} from '@/types/pzk-dto'
import type {
  PzkCatalogVM,
  PzkCatalogModuleVM,
  PzkCatalogCategoryVM,
  PzkMaterialRowVM,
  PzkCatalogErrorVM,
} from '@/types/pzk-vm'
import { buildPurchaseUrl } from './config'

/**
 * Map PzkCatalog DTO to PzkCatalogVM
 *
 * @param dto - PzkCatalog from API response
 * @returns PzkCatalogVM optimized for rendering
 */
export function mapPzkCatalogToVm(dto: PzkCatalog): PzkCatalogVM {
  return {
    purchaseCta: dto.purchaseCta,
    modules: dto.modules.map(mapModuleToVm),
  }
}

/**
 * Map PzkCatalogModule DTO to PzkCatalogModuleVM
 *
 * @param dto - PzkCatalogModule from API response
 * @returns PzkCatalogModuleVM with UI metadata
 */
function mapModuleToVm(dto: PzkCatalogModule): PzkCatalogModuleVM {
  const categories = dto.categories
    .map(mapCategoryToVm)
    .sort((a, b) => a.displayOrder - b.displayOrder) // Defense-in-depth sort

  // Compute moduleStatus
  let moduleStatus: PzkCatalogModuleVM['moduleStatus']

  if (dto.isActive) {
    moduleStatus = 'active'
  } else {
    // Check if all materials are publish_soon
    const allMaterials = categories.flatMap((cat) => cat.materials)
    const allPublishSoon =
      allMaterials.length > 0 &&
      allMaterials.every((m) => m.status === 'publish_soon')

    moduleStatus = allPublishSoon ? 'soon' : 'locked'
  }

  return {
    module: dto.module,
    label: `Moduł ${dto.module}`,
    isActive: dto.isActive,
    categories,
    moduleStatus,
  }
}

/**
 * Map PzkCatalogCategory DTO to PzkCatalogCategoryVM
 *
 * @param dto - PzkCatalogCategory from API response
 * @returns PzkCatalogCategoryVM with isEmpty flag
 */
function mapCategoryToVm(dto: PzkCatalogCategory): PzkCatalogCategoryVM {
  const materials = dto.materials
    .map(mapMaterialToVm)
    .sort((a, b) => a.order - b.order) // Defense-in-depth sort

  return {
    id: dto.id,
    slug: dto.slug,
    label: dto.label,
    description: dto.description,
    displayOrder: dto.displayOrder,
    materials,
    isEmpty: materials.length === 0,
  }
}

/**
 * Map PzkCatalogMaterial DTO to PzkMaterialRowVM
 *
 * Computes:
 * - variant: 'available' | 'locked' | 'soon'
 * - primaryAction: type-safe action descriptor
 * - aria: accessibility labels
 *
 * Business rules (from plan):
 * - available: status=published + isActionable=true
 * - locked: status=published + isLocked=true + isActionable=false
 * - soon: status=publish_soon (always locked, non-actionable)
 *
 * @param dto - PzkCatalogMaterial from API response
 * @returns PzkMaterialRowVM with UI-specific metadata
 */
function mapMaterialToVm(dto: PzkCatalogMaterial): PzkMaterialRowVM {
  // Compute variant
  let variant: PzkMaterialRowVM['variant']
  if (dto.status === 'publish_soon') {
    variant = 'soon'
  } else if (dto.isActionable) {
    variant = 'available'
  } else {
    variant = 'locked'
  }

  // Compute primaryAction
  let primaryAction: PzkMaterialRowVM['primaryAction']
  if (variant === 'available') {
    primaryAction = {
      type: 'link',
      href: `/pacjent/pzk/material/${dto.id}`,
      label: 'Otwórz',
    }
  } else if (variant === 'locked') {
    // Use ctaUrl from API, fallback to buildPurchaseUrl if null (edge case)
    const ctaHref = dto.ctaUrl || '#'
    primaryAction = {
      type: 'cta',
      href: ctaHref,
      label: 'Kup dostęp',
      isExternal: true,
    }
  } else {
    // variant === 'soon'
    primaryAction = { type: 'none' }
  }

  // Compute aria status label
  const ariaStatusLabel =
    variant === 'available'
      ? 'Dostępny'
      : variant === 'locked'
        ? 'Zablokowany'
        : 'Dostępny wkrótce'

  return {
    id: dto.id,
    title: dto.title,
    description: dto.description,
    order: dto.order,
    status: dto.status,
    hasPdf: dto.hasPdf,
    hasVideos: dto.hasVideos,
    variant,
    primaryAction,
    aria: {
      statusLabel: ariaStatusLabel,
    },
  }
}

/**
 * Map API error to PzkCatalogErrorVM
 *
 * Provides user-friendly error messages and retry logic based on:
 * - HTTP status code
 * - Error kind (network, validation, etc.)
 *
 * @param statusCode - HTTP status code (if available)
 * @param errorMessage - Error message from API or fetch
 * @returns PzkCatalogErrorVM with Polish user message
 */
export function mapPzkError(
  statusCode?: number,
  errorMessage?: string
): PzkCatalogErrorVM {
  // Determine error kind and message based on status code
  switch (statusCode) {
    case 401:
      return {
        kind: 'unauthorized',
        message: 'Sesja wygasła. Zaloguj się ponownie.',
        statusCode,
        retryable: false,
      }

    case 403:
      return {
        kind: 'forbidden',
        message: 'Brak dostępu do katalogu.',
        statusCode,
        retryable: false,
      }

    case 400:
      return {
        kind: 'validation',
        message: 'Nieprawidłowe parametry widoku. Odśwież stronę.',
        statusCode,
        retryable: true,
      }

    case 500:
    case 502:
    case 503:
    case 504:
      return {
        kind: 'server',
        message: 'Wystąpił błąd. Spróbuj ponownie.',
        statusCode,
        retryable: true,
      }

    default:
      // Network error or unknown error
      if (!statusCode) {
        return {
          kind: 'network',
          message:
            'Nie udało się połączyć z serwerem. Sprawdź połączenie internetowe.',
          retryable: true,
        }
      }

      return {
        kind: 'unknown',
        message: errorMessage || 'Wystąpił nieoczekiwany błąd.',
        statusCode,
        retryable: true,
      }
  }
}
