import type { Database } from '@/db'
import { PzkMaterialRepository } from '@/lib/repositories/pzkMaterialRepository'
import { PzkMaterialPdfRepository } from '@/lib/repositories/pzkMaterialPdfRepository'
import { PzkAccessRepository } from '@/lib/repositories/pzkAccessRepository'
import { EventRepository } from '@/lib/repositories/eventRepository'
import type { PzkPresignResponse } from '@/types/pzk-dto'
import { generatePresignedUrl } from '@/lib/storage/s3-presign'

/**
 * PZK PDF Presign Service
 *
 * Responsibilities:
 * - Business logic for generating presigned PDF download URLs
 * - Material status and access control validation
 * - PDF ownership verification (IDOR protection)
 * - Presigned URL generation (S3/R2 storage)
 * - Best-effort event logging
 *
 * Security:
 * - No metadata leak for draft/archived materials (404)
 * - publish_soon materials are forbidden (403)
 * - Module access validation (403 if no access)
 * - PDF must belong to material (IDOR protection)
 * - objectKey never exposed to client
 */

/**
 * Command model for presign operation
 */
export interface PzkPresignPdfCommand {
  userId: string
  materialId: string
  pdfId: string
  ttlSeconds: number
  ip?: string
}

/**
 * Custom error classes for presign operations
 */

/**
 * Material not found OR has status draft/archived (no metadata leak)
 */
export class MaterialNotFoundError extends Error {
  constructor(materialId: string) {
    super(`Material not found or not visible: ${materialId}`)
    this.name = 'MaterialNotFoundError'
  }
}

/**
 * Material forbidden - publish_soon (not actionable) OR no module access
 */
export class MaterialForbiddenError extends Error {
  public reason: 'publish_soon' | 'no_module_access'

  constructor(reason: 'publish_soon' | 'no_module_access', message?: string) {
    super(message || `Material forbidden: ${reason}`)
    this.name = 'MaterialForbiddenError'
    this.reason = reason
  }
}

/**
 * PDF not found OR doesn't belong to material (IDOR protection)
 */
export class PdfNotFoundError extends Error {
  constructor(materialId: string, pdfId: string) {
    super(`PDF not found or doesn't belong to material: ${pdfId} in ${materialId}`)
    this.name = 'PdfNotFoundError'
  }
}

/**
 * Storage error during presign generation
 */
export class PresignStorageError extends Error {
  constructor(message: string, public originalError?: unknown) {
    super(message)
    this.name = 'PresignStorageError'
  }
}

export class PzkPdfPresignService {
  private materialRepository: PzkMaterialRepository
  private pdfRepository: PzkMaterialPdfRepository
  private accessRepository: PzkAccessRepository
  private eventRepository: EventRepository

  constructor(db: Database) {
    this.materialRepository = new PzkMaterialRepository(db)
    this.pdfRepository = new PzkMaterialPdfRepository(db)
    this.accessRepository = new PzkAccessRepository(db)
    this.eventRepository = new EventRepository(db)
  }

  /**
   * Generate presigned URL for PDF download
   *
   * Flow:
   * 1. Fetch material (only published/publish_soon, no draft/archived)
   * 2. Check material visibility (draft/archived → 404)
   * 3. Check material status (publish_soon → 403)
   * 4. Check module access (no access → 403)
   * 5. Fetch PDF by (materialId, pdfId) → IDOR protection
   * 6. Generate presigned URL (S3/R2)
   * 7. Log event (best-effort)
   *
   * @param command - Presign command with userId, materialId, pdfId, ttlSeconds
   * @returns PzkPresignResponse with url, expiresAt, ttlSeconds
   * @throws MaterialNotFoundError - Material not found or draft/archived
   * @throws MaterialForbiddenError - publish_soon or no module access
   * @throws PdfNotFoundError - PDF not found or doesn't belong to material
   * @throws PresignStorageError - Storage presign generation failed
   *
   * @example
   * try {
   *   const response = await service.generatePresignUrl({
   *     userId: 'user-123',
   *     materialId: 'mat-456',
   *     pdfId: 'pdf-789',
   *     ttlSeconds: 60,
   *     ip: '192.168.1.1'
   *   })
   *   // { url: 'https://...', expiresAt: '...', ttlSeconds: 60 }
   * } catch (error) {
   *   if (error instanceof MaterialNotFoundError) return 404
   *   if (error instanceof MaterialForbiddenError) return 403
   *   if (error instanceof PdfNotFoundError) return 404
   *   if (error instanceof PresignStorageError) return 500
   * }
   */
  async generatePresignUrl(
    command: PzkPresignPdfCommand
  ): Promise<PzkPresignResponse> {
    const { userId, materialId, pdfId, ttlSeconds, ip } = command
    const now = new Date()

    try {
      // 1. Fetch material (only published/publish_soon, no draft/archived)
      const material = await this.materialRepository.findForPresign(materialId)

      if (!material) {
        // Material not found OR draft/archived (no metadata leak)
        await this.logEvent(userId, 'pzk_pdf_presign_error', {
          materialId,
          pdfId,
          reason: 'material_not_found',
          ip,
        })
        throw new MaterialNotFoundError(materialId)
      }

      // 2. Check material status (publish_soon → 403 forbidden)
      if (material.status === 'publish_soon') {
        await this.logEvent(userId, 'pzk_pdf_presign_forbidden', {
          materialId,
          pdfId,
          module: material.module,
          reason: 'publish_soon',
          ip,
        })
        throw new MaterialForbiddenError(
          'publish_soon',
          'Materiał będzie dostępny wkrótce'
        )
      }

      // 3. Check module access (user must have active access)
      const activeAccess = await this.accessRepository.listActiveAccessByUserId(
        userId,
        now
      )

      const hasModuleAccess = activeAccess.some(
        (access) => access.module === material.module
      )

      if (!hasModuleAccess) {
        await this.logEvent(userId, 'pzk_pdf_presign_forbidden', {
          materialId,
          pdfId,
          module: material.module,
          reason: 'no_module_access',
          ip,
        })
        throw new MaterialForbiddenError(
          'no_module_access',
          'Brak dostępu do modułu materiału'
        )
      }

      // 4. Fetch PDF by (materialId, pdfId) - IDOR protection
      const pdf = await this.pdfRepository.findByMaterialIdAndPdfId(
        materialId,
        pdfId
      )

      if (!pdf) {
        // PDF not found OR doesn't belong to this material
        await this.logEvent(userId, 'pzk_pdf_presign_error', {
          materialId,
          pdfId,
          module: material.module,
          reason: 'pdf_not_found',
          ip,
        })
        throw new PdfNotFoundError(materialId, pdfId)
      }

      // 5. Generate presigned URL (S3/R2)
      // TODO: Replace with real storage integration in next step
      const presignedUrl = await this.generateStoragePresignUrl(
        pdf.objectKey,
        pdf.fileName || 'download.pdf',
        pdf.contentType || 'application/pdf',
        ttlSeconds
      )

      const expiresAt = new Date(now.getTime() + ttlSeconds * 1000)

      // 6. Log success event (best-effort)
      await this.logEvent(userId, 'pzk_pdf_presign_success', {
        materialId,
        pdfId,
        module: material.module,
        ttlSeconds,
        ip,
      })

      return {
        url: presignedUrl,
        expiresAt: expiresAt.toISOString(),
        ttlSeconds,
      }
    } catch (error) {
      // Re-throw known errors
      if (
        error instanceof MaterialNotFoundError ||
        error instanceof MaterialForbiddenError ||
        error instanceof PdfNotFoundError ||
        error instanceof PresignStorageError
      ) {
        throw error
      }

      // Unexpected errors
      console.error('[PzkPdfPresignService] Unexpected error:', error)
      await this.logEvent(userId, 'pzk_pdf_presign_error', {
        materialId,
        pdfId,
        reason: 'unexpected_error',
        error: error instanceof Error ? error.message : 'Unknown error',
        ip,
      })

      throw new PresignStorageError(
        'Failed to generate presigned URL',
        error
      )
    }
  }

  /**
   * Generate presigned URL from storage (S3/R2)
   *
   * @param objectKey - Object key in storage bucket
   * @param fileName - Suggested filename for Content-Disposition
   * @param contentType - MIME type for Content-Type header
   * @param ttlSeconds - Time-to-live in seconds
   * @returns Presigned GET URL
   * @throws PresignStorageError - Storage error
   *
   * @private
   */
  private async generateStoragePresignUrl(
    objectKey: string,
    fileName: string,
    contentType: string,
    ttlSeconds: number
  ): Promise<string> {
    try {
      const presignedUrl = await generatePresignedUrl({
        objectKey,
        fileName,
        contentType,
        ttlSeconds,
      })

      return presignedUrl
    } catch (error) {
      console.error('[PzkPdfPresignService] Storage presign error:', error)
      throw new PresignStorageError(
        'Failed to generate presigned URL from storage',
        error
      )
    }
  }

  /**
   * Log event (best-effort, don't throw on failure)
   *
   * @param userId - User ID
   * @param eventType - Event type
   * @param properties - Event properties (JSONB)
   *
   * @private
   */
  private async logEvent(
    userId: string,
    eventType: string,
    properties: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.eventRepository.create({
        userId,
        eventType,
        properties,
      })
    } catch (error) {
      // Best-effort logging - don't block operation on logging failure
      console.error('[PzkPdfPresignService] Failed to log event:', error)
    }
  }
}
