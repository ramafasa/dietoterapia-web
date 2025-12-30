import type { Database } from '@/db'
import type { PzkNoteDto, PzkModuleNumber } from '@/types/pzk-dto'
import { PzkMaterialRepository } from '@/lib/repositories/pzkMaterialRepository'
import { PzkAccessRepository } from '@/lib/repositories/pzkAccessRepository'
import { PzkNoteRepository } from '@/lib/repositories/pzkNoteRepository'

/**
 * PZK Notes Service
 *
 * Responsibilities:
 * - Get user's private note for a material
 * - Upsert (create/update) user's note
 * - Delete user's note
 * - Enforce access control: only published materials, require active module access
 * - IDOR protection: always bind notes to authenticated user
 *
 * Business rules:
 * - Authentication: required (enforced in API route)
 * - Role: patient (enforced in API route)
 * - Material status: only 'published' materials are actionable
 *   - draft/archived → 404 (no metadata leak)
 *   - publish_soon → 404 (notes only for published materials)
 * - Module access: user must have active access to material's module
 *   - active = revokedAt IS NULL AND startAt <= now AND now < expiresAt
 * - Note limit: 1 note per (user, material) pair (enforced by DB UNIQUE constraint)
 */

/**
 * Custom error for material not found or not accessible
 * Used for 404 responses (material doesn't exist or status != published)
 */
export class MaterialNotFoundError extends Error {
  constructor(message: string = 'Material not found or not accessible') {
    super(message)
    this.name = 'MaterialNotFoundError'
  }
}

/**
 * Custom error for forbidden access to material
 * Used for 403 responses (user lacks active module access)
 */
export class MaterialForbiddenError extends Error {
  public readonly reason: 'no_module_access'

  constructor(reason: 'no_module_access' = 'no_module_access') {
    super('Brak aktywnego dostępu do modułu')
    this.name = 'MaterialForbiddenError'
    this.reason = reason
  }
}

export class PzkNotesService {
  private materialRepo: PzkMaterialRepository
  private accessRepo: PzkAccessRepository
  private noteRepo: PzkNoteRepository

  constructor(private db: Database) {
    this.materialRepo = new PzkMaterialRepository(db)
    this.accessRepo = new PzkAccessRepository(db)
    this.noteRepo = new PzkNoteRepository(db)
  }

  /**
   * Get user's note for a material
   *
   * Flow:
   * 1. Assert user can access published material (404 if not published, 403 if no access)
   * 2. Fetch note from DB (or return null if doesn't exist)
   * 3. Map to DTO
   *
   * @param userId - Authenticated user ID
   * @param materialId - Material ID
   * @param now - Current timestamp (optional, defaults to new Date())
   * @returns PzkNoteDto or null if note doesn't exist
   * @throws MaterialNotFoundError if material not found or not published
   * @throws MaterialForbiddenError if user lacks module access
   *
   * @example
   * const note = await service.getNote('user-123', 'mat-456')
   * if (note) {
   *   // User has a note for this material
   * }
   */
  async getNote(
    userId: string,
    materialId: string,
    now: Date = new Date()
  ): Promise<PzkNoteDto | null> {
    // 1. Assert user can access published material
    await this.assertCanAccessPublishedMaterial(userId, materialId, now)

    // 2. Fetch note from DB
    const noteRecord = await this.noteRepo.getByUserAndMaterial(
      userId,
      materialId
    )

    // 3. Return null if note doesn't exist
    if (!noteRecord) {
      return null
    }

    // 4. Map to DTO
    return {
      materialId,
      content: noteRecord.content,
      updatedAt: noteRecord.updatedAt.toISOString(),
    }
  }

  /**
   * Upsert (create or update) user's note for a material
   *
   * Idempotent operation: always returns 200 with the note data.
   * Uses ON CONFLICT to prevent race conditions.
   *
   * Flow:
   * 1. Assert user can access published material (404 if not published, 403 if no access)
   * 2. Upsert note in DB (create or replace)
   * 3. Map to DTO
   *
   * @param userId - Authenticated user ID
   * @param materialId - Material ID
   * @param content - Note content (1-10,000 chars, validated before calling)
   * @param now - Current timestamp (optional, defaults to new Date())
   * @returns PzkNoteDto with updated note data
   * @throws MaterialNotFoundError if material not found or not published
   * @throws MaterialForbiddenError if user lacks module access
   *
   * @example
   * const note = await service.upsertNote('user-123', 'mat-456', 'My note')
   * // Note created or updated successfully
   */
  async upsertNote(
    userId: string,
    materialId: string,
    content: string,
    now: Date = new Date()
  ): Promise<PzkNoteDto> {
    // 1. Assert user can access published material
    await this.assertCanAccessPublishedMaterial(userId, materialId, now)

    // 2. Upsert note in DB
    const noteRecord = await this.noteRepo.upsertByUserAndMaterial(
      userId,
      materialId,
      content,
      now
    )

    // 3. Map to DTO
    return {
      materialId,
      content: noteRecord.content,
      updatedAt: noteRecord.updatedAt.toISOString(),
    }
  }

  /**
   * Delete user's note for a material
   *
   * Idempotent operation: always succeeds (even if note doesn't exist).
   *
   * Flow:
   * 1. Assert user can access published material (404 if not published, 403 if no access)
   * 2. Delete note from DB (idempotent)
   *
   * @param userId - Authenticated user ID
   * @param materialId - Material ID
   * @param now - Current timestamp (optional, defaults to new Date())
   * @returns void (idempotent - no error if note doesn't exist)
   * @throws MaterialNotFoundError if material not found or not published
   * @throws MaterialForbiddenError if user lacks module access
   *
   * @example
   * await service.deleteNote('user-123', 'mat-456')
   * // Note deleted (or already didn't exist)
   */
  async deleteNote(
    userId: string,
    materialId: string,
    now: Date = new Date()
  ): Promise<void> {
    // 1. Assert user can access published material
    await this.assertCanAccessPublishedMaterial(userId, materialId, now)

    // 2. Delete note from DB (idempotent)
    await this.noteRepo.deleteByUserAndMaterial(userId, materialId)
  }

  /**
   * Assert that user can access a published material
   *
   * Business rules:
   * 1. Material must exist
   * 2. Material status must be 'published' (draft/archived/publish_soon → 404)
   * 3. User must have active access to material's module (403 if not)
   *
   * @param userId - Authenticated user ID
   * @param materialId - Material ID
   * @param now - Current timestamp
   * @throws MaterialNotFoundError if material not found or not published
   * @throws MaterialForbiddenError if user lacks module access
   *
   * @example
   * await this.assertCanAccessPublishedMaterial('user-123', 'mat-456', new Date())
   * // Throws if user cannot access material
   */
  private async assertCanAccessPublishedMaterial(
    userId: string,
    materialId: string,
    now: Date
  ): Promise<void> {
    // 1. Fetch material from DB (minimal fields)
    const material = await this.materialRepo.getById(materialId)

    // 2. Check if material exists
    if (!material) {
      throw new MaterialNotFoundError()
    }

    // 3. Check material status (only 'published' is actionable for notes)
    // draft/archived/publish_soon → 404 (no metadata leak)
    if (material.status !== 'published') {
      throw new MaterialNotFoundError()
    }

    // 4. Check user has active access to material's module
    const module = material.module as PzkModuleNumber
    const hasAccess = await this.accessRepo.hasActiveAccessToModule(
      userId,
      module,
      now
    )

    if (!hasAccess) {
      throw new MaterialForbiddenError('no_module_access')
    }

    // User can access material - continue
  }
}
