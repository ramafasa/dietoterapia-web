/**
 * PzkVideoSection Component
 *
 * Section displaying list of YouTube video embeds.
 *
 * Features:
 * - List of videos (sorted by displayOrder)
 * - Video title (optional)
 * - YouTube embed per video
 * - Hidden if no videos
 *
 * Props:
 * - videos: PzkMaterialVideoVM[]
 */

import type { PzkMaterialVideoVM } from '@/types/pzk-vm'
import { PzkYouTubeEmbed } from './PzkYouTubeEmbed'

interface PzkVideoSectionProps {
  videos: PzkMaterialVideoVM[]
}

export function PzkVideoSection({ videos }: PzkVideoSectionProps) {
  // Don't render if no videos
  if (videos.length === 0) {
    return null
  }

  // Sort by displayOrder (defense-in-depth)
  const sortedVideos = [...videos].sort(
    (a, b) => a.displayOrder - b.displayOrder
  )

  return (
    <section
      className="bg-white rounded-xl border-2 border-neutral-light p-6"
      aria-label="Wideo"
      data-testid="pzk-video-section"
    >
      {/* Section Header */}
      <h2 className="text-xl font-heading font-bold text-neutral-dark mb-4">
        Materiały wideo
      </h2>

      {/* Video List */}
      <div className="space-y-6">
        {sortedVideos.map((video) => (
          <div key={video.id} className="space-y-3">
            {/* Video Title (optional) */}
            {video.title && (
              <h3 className="text-lg font-semibold text-neutral-dark">
                {video.title}
              </h3>
            )}

            {/* YouTube Embed */}
            <PzkYouTubeEmbed
              youtubeVideoId={video.youtubeVideoId}
              title={video.ariaTitle}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
