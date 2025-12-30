import type { Database } from '@/db'
import {
  pzkMaterials,
  pzkCategories,
  pzkMaterialPdfs,
  pzkMaterialVideos,
} from '@/db/schema'
import { eq, and, inArray, sql } from 'drizzle-orm'
import type { PzkModuleNumber, PzkMaterialStatus } from '@/types/pzk-dto'

/**
 * PZK Catalog Repository
 *
 * Responsibilities:
 * - Query catalog data (materials + categories + attachments)
 * - Support filtering by module and status
 * - Compute hasPdf/hasVideos flags efficiently
 */

/**
 * Flattened catalog row (single material with category and attachment flags)
 */
export type CatalogRow = {
  // Material fields
  materialId: string
  materialModule: number
  materialCategoryId: string
  materialStatus: string
  materialOrder: number
  materialTitle: string
  materialDescription: string | null
  materialContentMd: string | null

  // Category fields
  categoryId: string
  categorySlug: string
  categoryLabel: string
  categoryDescription: string | null
  categoryDisplayOrder: number

  // Computed attachment flags
  hasPdf: boolean
  hasVideos: boolean
}

/**
 * Query parameters for catalog listing
 */
export type CatalogQuery = {
  modules: PzkModuleNumber[]
  includeStatuses: PzkMaterialStatus[]
}

export class PzkCatalogRepository {
  constructor(private db: Database) {}

  /**
   * List catalog rows (materials with categories and attachment flags)
   *
   * Business logic:
   * - Only returns materials with specified statuses (published, publish_soon)
   * - Filters by module numbers if specified
   * - Computes hasPdf/hasVideos using subquery aggregation
   * - Returns flattened rows sorted by module ASC, displayOrder ASC, order ASC
   *
   * Performance:
   * - Single query with LEFT JOINs and subquery aggregation
   * - Uses index: idx_pzk_materials_status_module (status, module, category_id, order)
   * - Avoids N+1 queries for attachments
   *
   * @param query - Filter parameters (modules, includeStatuses)
   * @returns Array of flattened catalog rows
   *
   * @example
   * const rows = await repo.listCatalogRows({
   *   modules: [1, 2],
   *   includeStatuses: ['published', 'publish_soon']
   * })
   */
  async listCatalogRows(query: CatalogQuery): Promise<CatalogRow[]> {
    try {
      // Build WHERE conditions
      const conditions = [
        inArray(pzkMaterials.status, query.includeStatuses),
        inArray(pzkMaterials.module, query.modules),
      ]

      // Subquery: count PDFs per material
      const pdfCountSubquery = this.db
        .select({
          materialId: pzkMaterialPdfs.materialId,
          count: sql<number>`COUNT(*)::int`.as('count'),
        })
        .from(pzkMaterialPdfs)
        .groupBy(pzkMaterialPdfs.materialId)
        .as('pdf_counts')

      // Subquery: count videos per material
      const videoCountSubquery = this.db
        .select({
          materialId: pzkMaterialVideos.materialId,
          count: sql<number>`COUNT(*)::int`.as('count'),
        })
        .from(pzkMaterialVideos)
        .groupBy(pzkMaterialVideos.materialId)
        .as('video_counts')

      // Main query: materials + categories + attachment flags
      const rows = await this.db
        .select({
          // Material fields
          materialId: pzkMaterials.id,
          materialModule: pzkMaterials.module,
          materialCategoryId: pzkMaterials.categoryId,
          materialStatus: pzkMaterials.status,
          materialOrder: pzkMaterials.order,
          materialTitle: pzkMaterials.title,
          materialDescription: pzkMaterials.description,
          materialContentMd: pzkMaterials.contentMd,

          // Category fields
          categoryId: pzkCategories.id,
          categorySlug: pzkCategories.slug,
          categoryLabel: pzkCategories.label,
          categoryDescription: pzkCategories.description,
          categoryDisplayOrder: pzkCategories.displayOrder,

          // Attachment flags (computed from subqueries)
          hasPdf: sql<boolean>`COALESCE(${pdfCountSubquery.count}, 0) > 0`.as(
            'has_pdf'
          ),
          hasVideos: sql<boolean>`COALESCE(${videoCountSubquery.count}, 0) > 0`.as(
            'has_videos'
          ),
        })
        .from(pzkMaterials)
        .innerJoin(
          pzkCategories,
          eq(pzkMaterials.categoryId, pzkCategories.id)
        )
        .leftJoin(
          pdfCountSubquery,
          eq(pzkMaterials.id, pdfCountSubquery.materialId)
        )
        .leftJoin(
          videoCountSubquery,
          eq(pzkMaterials.id, videoCountSubquery.materialId)
        )
        .where(and(...conditions))
        .orderBy(
          pzkMaterials.module,
          pzkCategories.displayOrder,
          pzkMaterials.order
        )

      return rows as CatalogRow[]
    } catch (error) {
      console.error('[PzkCatalogRepository] Error listing catalog rows:', error)
      throw error
    }
  }
}
