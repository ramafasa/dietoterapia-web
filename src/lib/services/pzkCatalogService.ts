import type { Database } from '@/db'
import { PzkAccessRepository } from '@/lib/repositories/pzkAccessRepository'
import {
  PzkCatalogRepository,
  type CatalogQuery,
} from '@/lib/repositories/pzkCatalogRepository'
import type {
  PzkCatalog,
  PzkCatalogModule,
  PzkCatalogCategory,
  PzkCatalogMaterial,
  PzkModuleNumber,
  PzkMaterialStatus,
} from '@/types/pzk-dto'

/**
 * PZK Catalog Service
 *
 * Responsibilities:
 * - Fetch user's active module access
 * - Fetch catalog data from repository
 * - Group materials hierarchically: modules → categories → materials
 * - Compute access control fields (isLocked, isActionable, ctaUrl)
 * - Map to PzkCatalog DTO
 */
export class PzkCatalogService {
  private accessRepository: PzkAccessRepository
  private catalogRepository: PzkCatalogRepository

  constructor(db: Database) {
    this.accessRepository = new PzkAccessRepository(db)
    this.catalogRepository = new PzkCatalogRepository(db)
  }

  /**
   * Get catalog for a user
   *
   * Returns hierarchical catalog structure with access control applied:
   * - modules: grouped by module number (1, 2, 3)
   * - categories: nested under modules, sorted by displayOrder
   * - materials: nested under categories, sorted by order
   *
   * Business logic for material access:
   * - 'publish_soon': always locked, not actionable, no CTA
   * - 'published':
   *   - User has active access → unlocked, actionable, no CTA
   *   - User has no access → locked, not actionable, CTA with purchase URL
   *
   * @param userId - User ID to get catalog for
   * @param query - Filter parameters (modules, includeStatuses)
   * @param now - Optional timestamp (defaults to new Date())
   * @returns PzkCatalog DTO
   *
   * @example
   * const catalog = await service.getCatalog('user-123', {
   *   modules: [1, 2],
   *   includeStatuses: ['published', 'publish_soon']
   * })
   */
  async getCatalog(
    userId: string,
    query: CatalogQuery,
    now: Date = new Date()
  ): Promise<PzkCatalog> {
    try {
      // 1. Fetch user's active module access
      const activeRecords = await this.accessRepository.listActiveAccessByUserId(
        userId,
        now
      )

      const activeModulesSet = new Set<PzkModuleNumber>(
        activeRecords.map((r) => this.validateModuleNumber(r.module))
      )

      // 2. Fetch catalog data from repository
      const rows = await this.catalogRepository.listCatalogRows(query)

      // 3. Group in-memory: modules → categories → materials
      const modulesMap = new Map<
        PzkModuleNumber,
        {
          module: PzkModuleNumber
          isActive: boolean
          categoriesMap: Map<string, PzkCatalogCategory>
        }
      >()

      for (const row of rows) {
        const module = this.validateModuleNumber(row.materialModule)

        // Get or create module
        if (!modulesMap.has(module)) {
          modulesMap.set(module, {
            module,
            isActive: activeModulesSet.has(module),
            categoriesMap: new Map(),
          })
        }

        const moduleEntry = modulesMap.get(module)!

        // Get or create category
        if (!moduleEntry.categoriesMap.has(row.categoryId)) {
          moduleEntry.categoriesMap.set(row.categoryId, {
            id: row.categoryId,
            slug: row.categorySlug,
            label: row.categoryLabel,
            description: row.categoryDescription,
            displayOrder: row.categoryDisplayOrder,
            materials: [],
          })
        }

        const category = moduleEntry.categoriesMap.get(row.categoryId)!

        // Build material DTO with access control
        const material = this.buildMaterialDto(
          row,
          activeModulesSet.has(module)
        )

        category.materials.push(material)
      }

      // 4. Convert maps to arrays (sorted)
      const modules: PzkCatalogModule[] = Array.from(modulesMap.values())
        .map((moduleEntry) => ({
          module: moduleEntry.module,
          isActive: moduleEntry.isActive,
          categories: Array.from(moduleEntry.categoriesMap.values()).sort(
            (a, b) => a.displayOrder - b.displayOrder
          ),
        }))
        .sort((a, b) => a.module - b.module)

      // 5. Build final DTO
      const catalog: PzkCatalog = {
        modules,
      }

      return catalog
    } catch (error) {
      console.error('[PzkCatalogService] Error getting catalog:', error)
      throw error
    }
  }

  /**
   * Build material DTO with access control fields
   *
   * @param row - Flattened catalog row from repository
   * @param hasModuleAccess - Whether user has active access to material's module
   * @returns PzkCatalogMaterial DTO
   */
  private buildMaterialDto(
    row: any,
    hasModuleAccess: boolean
  ): PzkCatalogMaterial {
    const status = row.materialStatus as PzkMaterialStatus
    const module = this.validateModuleNumber(row.materialModule)

    // Compute access control fields
    let isLocked: boolean
    let isActionable: boolean

    if (status === 'publish_soon') {
      // publish_soon: always locked, not actionable
      isLocked = true
      isActionable = false
    } else if (status === 'published') {
      // published: depends on module access
      if (hasModuleAccess) {
        // User has access → unlocked
        isLocked = false
        isActionable = true
      } else {
        // User has no access → locked (purchase flow handled by UI)
        isLocked = true
        isActionable = false
      }
    } else {
      // draft/archived should not appear in catalog (filtered by repository)
      // But handle defensively
      isLocked = true
      isActionable = false
    }

    return {
      id: row.materialId,
      title: row.materialTitle,
      description: row.materialDescription,
      status,
      order: row.materialOrder,
      module,
      isLocked,
      isActionable,
      hasPdf: row.hasPdf,
      hasVideos: row.hasVideos,
    }
  }

  /**
   * Validate and cast module number to PzkModuleNumber type
   *
   * Database CHECK constraint ensures module is 1, 2, or 3,
   * but we validate at runtime to satisfy TypeScript.
   *
   * @param module - Module number from database
   * @returns PzkModuleNumber (1 | 2 | 3)
   * @throws Error if module is not 1, 2, or 3 (data integrity issue)
   */
  private validateModuleNumber(module: number): PzkModuleNumber {
    if (module !== 1 && module !== 2 && module !== 3) {
      throw new Error(
        `Invalid module number in database: ${module}. Expected 1, 2, or 3.`
      )
    }
    return module as PzkModuleNumber
  }
}
