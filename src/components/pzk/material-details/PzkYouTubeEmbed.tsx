/**
 * PzkYouTubeEmbed Component
 *
 * Embedded YouTube video player with error handling.
 *
 * Features:
 * - Uses youtube-nocookie.com for privacy
 * - Accessible iframe with title
 * - Error fallback with retry
 * - Responsive aspect ratio (16:9)
 *
 * Props:
 * - youtubeVideoId: string
 * - title: string | null
 */

import { useState } from 'react'

interface PzkYouTubeEmbedProps {
  youtubeVideoId: string
  title: string | null
}

export function PzkYouTubeEmbed({
  youtubeVideoId,
  title,
}: PzkYouTubeEmbedProps) {
  const [hasError, setHasError] = useState(false)
  const [key, setKey] = useState(0) // For forcing iframe reload

  const embedUrl = `https://www.youtube-nocookie.com/embed/${youtubeVideoId}`
  const ariaTitle = title || 'Wideo'

  const handleRetry = () => {
    setHasError(false)
    setKey((prev) => prev + 1) // Force iframe reload
  }

  if (hasError) {
    return (
      <div
        className="aspect-video w-full bg-red-50 border-2 border-red-200 rounded-lg flex flex-col items-center justify-center p-6"
        role="alert"
      >
        <svg
          className="h-12 w-12 text-red-500 mb-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-red-700 mb-3">
          Nie udało się załadować wideo.
        </p>
        <button
          onClick={handleRetry}
          className="px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors"
        >
          Odśwież
        </button>
      </div>
    )
  }

  return (
    <div className="aspect-video w-full rounded-lg overflow-hidden bg-neutral-dark/5">
      <iframe
        key={key}
        src={embedUrl}
        title={ariaTitle}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        onError={() => setHasError(true)}
        className="w-full h-full border-0"
      />
    </div>
  )
}
