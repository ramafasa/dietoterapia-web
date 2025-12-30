import type { Database } from '@/db'
import { pzkMaterialPdfs } from '@/db/schema'
import { eq } from 'drizzle-orm'

/**
 * PZK Material PDF Repository
 *
 * Responsibilities:
 * - Fetch PDFs attached to a material
 * - Return fields needed for DTO mapping (omit objectKey for security)
 * - Sort by displayOrder for correct UI rendering
 */

/**
 * PDF record for DTO mapping
 * Note: objectKey is intentionally omitted (use presign endpoint for download)
 */
export type PdfRecord = {
  id: string
  fileName: string | null
  displayOrder: number
}

export class PzkMaterialPdfRepository {
  constructor(private db: Database) {}

  /**
   * List all PDFs for a material, sorted by display order
   *
   * Security note: objectKey is NOT returned (use presign endpoint)
   *
   * @param materialId - Material ID to fetch PDFs for
   * @returns Array of PDF records, sorted by displayOrder ASC
   *
   * @example
   * const pdfs = await repo.listByMaterialId('mat-123')
   * // [{ id: 'pdf-1', fileName: 'intro.pdf', displayOrder: 1 }, ...]
   */
  async listByMaterialId(materialId: string): Promise<PdfRecord[]> {
    try {
      const records = await this.db
        .select({
          id: pzkMaterialPdfs.id,
          fileName: pzkMaterialPdfs.fileName,
          displayOrder: pzkMaterialPdfs.displayOrder,
        })
        .from(pzkMaterialPdfs)
        .where(eq(pzkMaterialPdfs.materialId, materialId))
        .orderBy(pzkMaterialPdfs.displayOrder)

      return records
    } catch (error) {
      console.error('[PzkMaterialPdfRepository] Error listing PDFs:', error)
      throw error
    }
  }
}
