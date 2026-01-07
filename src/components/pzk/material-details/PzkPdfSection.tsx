/**
 * PzkPdfSection Component
 *
 * Section displaying list of PDF attachments with download buttons.
 *
 * Features:
 * - List of PDF attachments (sorted by displayOrder)
 * - Download button per PDF
 * - Per-PDF state management via usePzkPdfDownload
 * - Hidden if no PDFs
 *
 * Props:
 * - materialId: string
 * - pdfs: PzkMaterialPdfVM[]
 */

import type { PzkMaterialPdfVM } from '@/types/pzk-vm'
import { usePzkPdfDownload } from '@/hooks/pzk/usePzkPdfDownload'
import { PzkPdfDownloadButton } from './PzkPdfDownloadButton'

interface PzkPdfSectionProps {
  materialId: string
  pdfs: PzkMaterialPdfVM[]
}

export function PzkPdfSection({ materialId, pdfs }: PzkPdfSectionProps) {
  const { downloadPdf, getDownloadState, resetDownloadState } =
    usePzkPdfDownload(materialId)

  // Don't render if no PDFs
  if (pdfs.length === 0) {
    return null
  }

  // Sort by displayOrder (defense-in-depth)
  const sortedPdfs = [...pdfs].sort((a, b) => a.displayOrder - b.displayOrder)

  return (
    <section
      className="bg-white rounded-xl border-2 border-neutral-light p-6"
      aria-label="Pliki PDF"
      data-testid="pzk-pdf-section"
    >
      {/* Section Header */}
      <h2 className="text-xl font-heading font-bold text-neutral-dark mb-4">
        Pliki do pobrania
      </h2>

      {/* PDF List */}
      <div className="space-y-3">
        {sortedPdfs.map((pdf) => (
          <PzkPdfDownloadButton
            key={pdf.id}
            pdfId={pdf.id}
            label={pdf.label}
            state={getDownloadState(pdf.id)}
            onDownload={() => downloadPdf(pdf.id)}
            onRetry={() => {
              resetDownloadState(pdf.id)
              void downloadPdf(pdf.id)
            }}
          />
        ))}
      </div>
    </section>
  )
}
