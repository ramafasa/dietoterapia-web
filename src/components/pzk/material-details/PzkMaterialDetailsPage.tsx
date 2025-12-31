/**
 * PzkMaterialDetailsPage Component
 *
 * Main container for material details view.
 *
 * Features:
 * - Integrates usePzkMaterialDetails hook
 * - Orchestrates data loading and error handling
 * - Renders appropriate variant (unlocked/locked/soon)
 * - Re-uses PzkInternalNav from catalog
 *
 * Workflow:
 * 1. Load material details from API (via hook)
 * 2. Show loading state during fetch
 * 3. On error: show error state with retry
 * 4. On success: determine variant and render appropriate content
 *
 * Props:
 * - materialId: string (UUID from URL param)
 */

import { usePzkMaterialDetails } from '@/hooks/pzk/usePzkMaterialDetails'
import { PzkInternalNav } from '@/components/pzk/catalog/PzkInternalNav'
import { PzkMaterialDetailsLoadingState } from './PzkMaterialDetailsLoadingState'
import { PzkMaterialDetailsErrorState } from './PzkMaterialDetailsErrorState'
import { PzkBreadcrumbs } from './PzkBreadcrumbs'
import { PzkMaterialHeader } from './PzkMaterialHeader'
import { PzkMaterialLockedState } from './PzkMaterialLockedState'
import { PzkMaterialPublishSoonState } from './PzkMaterialPublishSoonState'
import { PzkMaterialUnlockedContent } from './PzkMaterialUnlockedContent'

interface PzkMaterialDetailsPageProps {
  materialId: string
}

export default function PzkMaterialDetailsPage({
  materialId,
}: PzkMaterialDetailsPageProps) {
  // Fetch material details
  const { material, isLoading, error, reload } =
    usePzkMaterialDetails(materialId)

  // Loading state
  if (isLoading) {
    return <PzkMaterialDetailsLoadingState />
  }

  // Error state
  if (error) {
    return <PzkMaterialDetailsErrorState error={error} onRetry={reload} />
  }

  // No data (should not happen after successful fetch, but defensive check)
  if (!material) {
    return null
  }

  // Success: Render material details
  return (
    <div className="min-h-screen bg-neutral-light">
      <div className="container mx-auto px-4 max-w-6xl pt-10 pb-24">
        {/* Internal Navigation */}
        <PzkInternalNav active="catalog" />

        {/* Breadcrumbs */}
        <PzkBreadcrumbs breadcrumbs={material.breadcrumbs} />

        {/* Header (title, description, badge, meta) */}
        <PzkMaterialHeader header={material.header} />

        {/* Main Content - variant-based rendering */}
        <main data-testid="pzk-material-content">
          {material.variant === 'unlocked' && material.unlocked && (
            <PzkMaterialUnlockedContent
              unlocked={material.unlocked}
              materialId={materialId}
            />
          )}

          {material.variant === 'locked' && material.locked && (
            <PzkMaterialLockedState locked={material.locked} />
          )}

          {material.variant === 'soon' && material.soon && (
            <PzkMaterialPublishSoonState soon={material.soon} />
          )}
        </main>
      </div>
    </div>
  )
}
