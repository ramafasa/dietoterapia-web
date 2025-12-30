import type { Database } from '@/db'
import { pzkMaterialPdfs } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

/**
 * PZK Material PDF Repository
 *
 * Responsibilities:
 * - Fetch PDFs attached to a material
 * - Return fields needed for DTO mapping (omit objectKey for security)
 * - Sort by displayOrder for correct UI rendering
 * - Fetch specific PDF with objectKey for presign (internal use only)
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

/**
 * PDF record for presign (includes objectKey - internal use only)
 * Used by presign service to generate signed URL
 */
export type PdfRecordForPresign = {
  id: string
  materialId: string
  objectKey: string
  fileName: string | null
  contentType: string | null
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

  /**
   * Find specific PDF by material ID and PDF ID (IDOR protection)
   *
   * CRITICAL SECURITY: Query combines materialId AND pdfId to prevent
   * unauthorized access to PDFs from other materials.
   *
   * Returns objectKey for presign - INTERNAL USE ONLY, never expose to client.
   *
   * @param materialId - Material ID that owns the PDF
   * @param pdfId - PDF ID to fetch
   * @returns PDF record with objectKey, or null if not found or doesn't belong to material
   *
   * @example
   * const pdf = await repo.findByMaterialIdAndPdfId('mat-123', 'pdf-456')
   * if (!pdf) {
   *   // PDF not found OR doesn't belong to this material (IDOR attempt)
   *   throw new PdfNotFoundError()
   * }
   * // pdf.objectKey is safe to use for presign
   */
  async findByMaterialIdAndPdfId(
    materialId: string,
    pdfId: string
  ): Promise<PdfRecordForPresign | null> {
    try {
      const records = await this.db
        .select({
          id: pzkMaterialPdfs.id,
          materialId: pzkMaterialPdfs.materialId,
          objectKey: pzkMaterialPdfs.objectKey,
          fileName: pzkMaterialPdfs.fileName,
          contentType: pzkMaterialPdfs.contentType,
          displayOrder: pzkMaterialPdfs.displayOrder,
        })
        .from(pzkMaterialPdfs)
        .where(
          and(
            eq(pzkMaterialPdfs.materialId, materialId),
            eq(pzkMaterialPdfs.id, pdfId)
          )
        )
        .limit(1)

      return records.length > 0 ? records[0] : null
    } catch (error) {
      console.error(
        '[PzkMaterialPdfRepository] Error finding PDF by materialId and pdfId:',
        error
      )
      throw error
    }
  }
}
