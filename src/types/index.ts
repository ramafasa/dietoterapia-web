/**
 * Types index
 * Central export point for all TypeScript types and DTOs
 */

// PZK (Przestrzeń Zdrowej Kobiety) DTOs
export type {
  // Common / Utility Types
  ApiResponse,
  ApiError,
  PzkModuleNumber,
  PzkMaterialStatus,

  // Access Summary (GET /api/pzk/access)
  PzkAccessRecord,
  PzkAccessSummary,

  // Catalog (GET /api/pzk/catalog)
  PzkCatalogMaterial,
  PzkCatalogCategory,
  PzkCatalogModule,
  PzkCatalog,

  // Material Details (GET /api/pzk/materials/:id)
  PzkMaterialCategoryRef,
  PzkMaterialPdfDto,
  PzkMaterialVideoDto,
  PzkMaterialNoteDto,
  PzkMaterialAccess,
  PzkMaterialDetails,

  // Presigned PDF (POST /api/pzk/materials/:id/pdfs/:pdfId/presign)
  PzkPresignRequest,
  PzkPresignResponse,

  // Notes (GET/PUT/DELETE /api/pzk/materials/:id/note)
  PzkNoteDto,
  PzkNoteUpsertRequest,

  // Reviews (GET /api/pzk/reviews)
  PzkReviewAuthor,
  PzkReviewDto,
  PzkReviewsList,

  // My Review (GET/PUT/DELETE /api/pzk/reviews/me)
  PzkMyReviewDto,
  PzkReviewUpsertRequest,

  // Query Parameters
  PzkCatalogQueryParams,
  PzkMaterialQueryParams,
  PzkReviewsQueryParams,

  // Type Helpers
  TimestampToString,
  OmitAuditFields,
} from './pzk-dto'

// Patient Details (existing types)
export type {
  HistoryView,
  ChartPeriod,
  PatientDetailViewState,
  HistoryFiltersVM,
  AddWeightForPatientFormVM,
  StatusBadgeVariant,
} from './patient-details'

export {
  getStatusBadgeVariant,
  getStatusLabel,
  getStatusWarning,
} from './patient-details'
