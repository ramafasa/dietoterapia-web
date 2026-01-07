import type { Database } from '@/db'
import { pzkMaterialVideos } from '@/db/schema'
import { eq } from 'drizzle-orm'

/**
 * PZK Material Video Repository
 *
 * Responsibilities:
 * - Fetch videos (YouTube) attached to a material
 * - Return fields needed for DTO mapping
 * - Sort by displayOrder for correct UI rendering
 */

/**
 * Video record for DTO mapping
 */
export type VideoRecord = {
  id: string
  youtubeVideoId: string
  title: string | null
  displayOrder: number
}

export class PzkMaterialVideoRepository {
  constructor(private db: Database) {}

  /**
   * List all videos for a material, sorted by display order
   *
   * @param materialId - Material ID to fetch videos for
   * @returns Array of video records, sorted by displayOrder ASC
   *
   * @example
   * const videos = await repo.listByMaterialId('mat-123')
   * // [{ id: 'vid-1', youtubeVideoId: 'abc123', title: 'Film 1', displayOrder: 1 }, ...]
   */
  async listByMaterialId(materialId: string): Promise<VideoRecord[]> {
    try {
      const records = await this.db
        .select({
          id: pzkMaterialVideos.id,
          youtubeVideoId: pzkMaterialVideos.youtubeVideoId,
          title: pzkMaterialVideos.title,
          displayOrder: pzkMaterialVideos.displayOrder,
        })
        .from(pzkMaterialVideos)
        .where(eq(pzkMaterialVideos.materialId, materialId))
        .orderBy(pzkMaterialVideos.displayOrder)

      return records
    } catch (error) {
      console.error('[PzkMaterialVideoRepository] Error listing videos:', error)
      throw error
    }
  }
}
