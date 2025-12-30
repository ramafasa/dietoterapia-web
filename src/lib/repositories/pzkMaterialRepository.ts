import type { Database } from '@/db'
import { pzkMaterials, pzkCategories } from '@/db/schema'
import { eq } from 'drizzle-orm'

/**
 * PZK Material Repository
 *
 * Responsibilities:
 * - Fetch individual materials by ID
 * - Include minimal fields needed for DTO mapping
 * - Join with category for full material details
 */

/**
 * Material record with minimal fields for DTO mapping
 */
export type MaterialRecord = {
  id: string
  module: number
  categoryId: string
  status: string
  order: number
  title: string
  description: string | null
  contentMd: string | null
}

/**
 * Material record with category details (for unlocked materials)
 */
export type MaterialWithCategoryRecord = MaterialRecord & {
  category: {
    id: string
    slug: string
    label: string
    displayOrder: number
  } | null
}

export class PzkMaterialRepository {
  constructor(private db: Database) {}

  /**
   * Get material by ID (minimal fields only, no category join)
   *
   * Used for:
   * - Initial material fetch to check status/visibility
   * - Locked materials (where category is omitted)
   *
   * @param materialId - Material ID to fetch
   * @returns Material record or null if not found
   *
   * @example
   * const material = await repo.getById('mat-123')
   * if (!material) return 404
   * if (material.status === 'draft') return 404 // No metadata leak
   */
  async getById(materialId: string): Promise<MaterialRecord | null> {
    try {
      const results = await this.db
        .select({
          id: pzkMaterials.id,
          module: pzkMaterials.module,
          categoryId: pzkMaterials.categoryId,
          status: pzkMaterials.status,
          order: pzkMaterials.order,
          title: pzkMaterials.title,
          description: pzkMaterials.description,
          contentMd: pzkMaterials.contentMd,
        })
        .from(pzkMaterials)
        .where(eq(pzkMaterials.id, materialId))
        .limit(1)

      return results[0] || null
    } catch (error) {
      console.error('[PzkMaterialRepository] Error fetching material:', error)
      throw error
    }
  }

  /**
   * Get material by ID with category details (for unlocked materials)
   *
   * Used for:
   * - Unlocked materials where we need full category info
   *
   * @param materialId - Material ID to fetch
   * @returns Material with category or null if not found
   *
   * @example
   * const material = await repo.getByIdWithCategory('mat-123')
   * if (material && material.category) {
   *   // Include category in response
   * }
   */
  async getByIdWithCategory(
    materialId: string
  ): Promise<MaterialWithCategoryRecord | null> {
    try {
      const results = await this.db
        .select({
          id: pzkMaterials.id,
          module: pzkMaterials.module,
          categoryId: pzkMaterials.categoryId,
          status: pzkMaterials.status,
          order: pzkMaterials.order,
          title: pzkMaterials.title,
          description: pzkMaterials.description,
          contentMd: pzkMaterials.contentMd,
          category: {
            id: pzkCategories.id,
            slug: pzkCategories.slug,
            label: pzkCategories.label,
            displayOrder: pzkCategories.displayOrder,
          },
        })
        .from(pzkMaterials)
        .leftJoin(
          pzkCategories,
          eq(pzkMaterials.categoryId, pzkCategories.id)
        )
        .where(eq(pzkMaterials.id, materialId))
        .limit(1)

      return results[0] || null
    } catch (error) {
      console.error(
        '[PzkMaterialRepository] Error fetching material with category:',
        error
      )
      throw error
    }
  }
}
