import type { Database } from '@/db'
import type {
  PzkMaterialDetails,
  PzkMaterialCategoryRef,
  PzkMaterialPdfDto,
  PzkMaterialVideoDto,
  PzkMaterialNoteDto,
  PzkMaterialAccess,
  PzkModuleNumber,
  PzkMaterialStatus,
} from '@/types/pzk-dto'
import { PzkMaterialRepository } from '@/lib/repositories/pzkMaterialRepository'
import { PzkAccessRepository } from '@/lib/repositories/pzkAccessRepository'
import { PzkMaterialPdfRepository } from '@/lib/repositories/pzkMaterialPdfRepository'
import { PzkMaterialVideoRepository } from '@/lib/repositories/pzkMaterialVideoRepository'
import { PzkNoteRepository } from '@/lib/repositories/pzkNoteRepository'

/**
 * PZK Material Service
 *
 * Responsibilities:
 * - Fetch material details with access control
 * - Enforce visibility rules (draft/archived → 404)
 * - Evaluate lock/unlock state (status + module access)
 * - Build purchase CTA URLs for locked materials
 * - Map database records to DTOs
 *
 * Business rules:
 * - draft/archived materials: always 404 (no metadata leak)
 * - publish_soon materials: 200 with locked state (reason: publish_soon)
 * - published materials:
 *   - with access → unlocked (full content)
 *   - without access → locked (reason: no_module_access, with CTA)
 */

/**
 * Custom error for material not found or not accessible
 * Used to distinguish 404 from other errors in API route
 */
export class MaterialNotFoundError extends Error {
  constructor(message: string = 'Material not found or not accessible') {
    super(message)
    this.name = 'MaterialNotFoundError'
  }
}

/**
 * Parameters for getMaterialDetails
 */
export type GetMaterialDetailsParams = {
  userId: string
  materialId: string
  include: {
    pdfs: boolean
    videos: boolean
    note: boolean
  }
  now?: Date // Optional, defaults to new Date()
}

export class PzkMaterialService {
  private materialRepo: PzkMaterialRepository
  private accessRepo: PzkAccessRepository
  private pdfRepo: PzkMaterialPdfRepository
  private videoRepo: PzkMaterialVideoRepository
  private noteRepo: PzkNoteRepository

  constructor(private db: Database) {
    this.materialRepo = new PzkMaterialRepository(db)
    this.accessRepo = new PzkAccessRepository(db)
    this.pdfRepo = new PzkMaterialPdfRepository(db)
    this.videoRepo = new PzkMaterialVideoRepository(db)
    this.noteRepo = new PzkNoteRepository(db)
  }

  /**
   * Get material details with access control
   *
   * Flow:
   * 1. Fetch material from DB
   * 2. Check visibility rules (draft/archived → throw MaterialNotFoundError)
   * 3. Evaluate access state (status + module access)
   * 4. Fetch related data if unlocked and included
   * 5. Map to DTO
   *
   * @param params - Parameters for fetching material details
   * @returns PzkMaterialDetails DTO
   * @throws MaterialNotFoundError if material not found or not accessible (draft/archived)
   *
   * @example
   * const details = await service.getMaterialDetails({
   *   userId: 'user-123',
   *   materialId: 'mat-456',
   *   include: { pdfs: true, videos: true, note: true },
   * })
   */
  async getMaterialDetails(
    params: GetMaterialDetailsParams
  ): Promise<PzkMaterialDetails> {
    const { userId, materialId, include, now = new Date() } = params

    // 1. Fetch material from DB
    const material = await this.materialRepo.getById(materialId)

    // 2. Check visibility rules
    if (!material) {
      throw new MaterialNotFoundError()
    }

    // draft/archived materials: always 404 (no metadata leak)
    if (material.status === 'draft' || material.status === 'archived') {
      throw new MaterialNotFoundError()
    }

    // 3. Evaluate access state
    const status = material.status as PzkMaterialStatus
    const module = material.module as PzkModuleNumber

    // Check module access (needed for both publish_soon and published)
    const hasAccess = await this.accessRepo.hasActiveAccessToModule(
      userId,
      module,
      now
    )

    // publish_soon: locked, but distinguish between with/without access
    if (status === 'publish_soon') {
      return this.buildLockedResponse({
        material,
        reason: hasAccess ? 'publish_soon_with_access' : 'publish_soon',
        ctaUrl: null,
      })
    }

    if (!hasAccess) {
      // locked: no module access (CTA handled by PzkPurchaseButton in UI)
      return this.buildLockedResponse({
        material,
        reason: 'no_module_access',
        ctaUrl: null,
      })
    }

    // unlocked: fetch full material with related data
    return this.buildUnlockedResponse({
      userId,
      materialId,
      material,
      include,
    })
  }

  /**
   * Build locked response (no access, publish_soon, or publish_soon with access)
   *
   * Returns minimal fields: title, description, status, order, module
   * Omits: contentMd, category, pdfs, videos, note
   */
  private buildLockedResponse(params: {
    material: {
      id: string
      module: number
      status: string
      order: number
      title: string
      description: string | null
    }
    reason: 'no_module_access' | 'publish_soon' | 'publish_soon_with_access'
    ctaUrl: string | null
  }): PzkMaterialDetails {
    const { material, reason, ctaUrl } = params

    return {
      id: material.id,
      module: material.module as PzkModuleNumber,
      category: null,
      status: material.status as PzkMaterialStatus,
      order: material.order,
      title: material.title,
      description: material.description,
      contentMd: null,
      pdfs: [],
      videos: [],
      note: null,
      access: {
        isLocked: true,
        ctaUrl,
        reason,
      },
    }
  }

  /**
   * Build unlocked response (full access)
   *
   * Fetches category, pdfs, videos, note based on include flags
   */
  private async buildUnlockedResponse(params: {
    userId: string
    materialId: string
    material: {
      id: string
      module: number
      categoryId: string
      status: string
      order: number
      title: string
      description: string | null
      contentMd: string | null
    }
    include: {
      pdfs: boolean
      videos: boolean
      note: boolean
    }
  }): Promise<PzkMaterialDetails> {
    const { userId, materialId, material, include } = params

    // Fetch category (always for unlocked materials)
    const materialWithCategory =
      await this.materialRepo.getByIdWithCategory(materialId)

    let category: PzkMaterialCategoryRef | null = null
    if (materialWithCategory?.category) {
      category = {
        id: materialWithCategory.category.id,
        slug: materialWithCategory.category.slug,
        label: materialWithCategory.category.label,
        displayOrder: materialWithCategory.category.displayOrder,
      }
    }

    // Fetch pdfs if included
    let pdfs: PzkMaterialPdfDto[] = []
    if (include.pdfs) {
      const pdfRecords = await this.pdfRepo.listByMaterialId(materialId)
      pdfs = pdfRecords.map((pdf) => ({
        id: pdf.id,
        fileName: pdf.fileName,
        displayOrder: pdf.displayOrder,
      }))
    }

    // Fetch videos if included
    let videos: PzkMaterialVideoDto[] = []
    if (include.videos) {
      const videoRecords = await this.videoRepo.listByMaterialId(materialId)
      videos = videoRecords.map((video) => ({
        id: video.id,
        youtubeVideoId: video.youtubeVideoId,
        title: video.title,
        displayOrder: video.displayOrder,
      }))
    }

    // Fetch note if included
    let note: PzkMaterialNoteDto | null = null
    if (include.note) {
      const noteRecord = await this.noteRepo.getByUserAndMaterial(
        userId,
        materialId
      )
      if (noteRecord) {
        note = {
          content: noteRecord.content,
          updatedAt: noteRecord.updatedAt.toISOString(),
        }
      }
    }

    // Build access state (unlocked)
    const access: PzkMaterialAccess = {
      isLocked: false,
      ctaUrl: null,
    }

    return {
      id: material.id,
      module: material.module as PzkModuleNumber,
      category,
      status: material.status as PzkMaterialStatus,
      order: material.order,
      title: material.title,
      description: material.description,
      contentMd: material.contentMd,
      pdfs,
      videos,
      note,
      access,
    }
  }
}
