/**
 * PzkMaterialUnlockedContent Component
 *
 * Wrapper for unlocked material content sections.
 *
 * Renders (conditionally):
 * - PzkMaterialBody (contentMd)
 * - PzkPdfSection (pdfs)
 * - PzkVideoSection (videos)
 * - PzkNotePanel (note)
 *
 * Props:
 * - unlocked: PzkMaterialUnlockedVM
 */

import type { PzkMaterialUnlockedVM } from '@/types/pzk-vm'
import { PzkMaterialBody } from './PzkMaterialBody'
import { PzkPdfSection } from './PzkPdfSection'
import { PzkVideoSection } from './PzkVideoSection'
import { PzkNotePanel } from './PzkNotePanel'

interface PzkMaterialUnlockedContentProps {
  unlocked: PzkMaterialUnlockedVM
  materialId: string // Needed for PDF/note actions in future iterations
}

export function PzkMaterialUnlockedContent({
  unlocked,
  materialId,
}: PzkMaterialUnlockedContentProps) {
  return (
    <div className="space-y-6">
      {/* Main Content (Markdown) */}
      <PzkMaterialBody contentMd={unlocked.contentMd} />

      {/* PDF Section */}
      <PzkPdfSection materialId={materialId} pdfs={unlocked.pdfs} />

      {/* Video Section */}
      <PzkVideoSection videos={unlocked.videos} />

      {/* Note Panel */}
      <PzkNotePanel materialId={materialId} initialNote={unlocked.note} />
    </div>
  )
}
