/**
 * PZK Notes Validation Schemas
 *
 * Zod validation schemas for PZK notes endpoints:
 * - GET/PUT/DELETE /api/pzk/materials/:materialId/note
 *
 * Business rules:
 * - materialId must be a valid UUID
 * - content must be a non-empty string (after trim)
 * - content max length: 10,000 characters
 */

import { z } from 'zod'

/**
 * Path parameter validation schema for notes endpoints
 *
 * Used by: GET, PUT, DELETE /api/pzk/materials/:materialId/note
 *
 * @example
 * const result = notePathParamsSchema.safeParse({ materialId: 'uuid-here' })
 * if (!result.success) {
 *   // Handle validation error
 * }
 */
export const notePathParamsSchema = z.object({
  materialId: z.string().uuid('materialId must be a valid UUID'),
})

/**
 * Request body validation schema for PUT /api/pzk/materials/:materialId/note
 *
 * Business rules:
 * - content is required
 * - content must be a string
 * - after trim, content must have at least 1 character (no empty notes)
 * - max 10,000 characters (consistent with PzkNoteUpsertRequest DTO comment)
 *
 * @example
 * const result = noteUpsertBodySchema.safeParse({ content: 'My note' })
 * if (!result.success) {
 *   // Handle validation error (400 Bad Request)
 * }
 */
export const noteUpsertBodySchema = z.object({
  content: z
    .string({
      required_error: 'content is required',
      invalid_type_error: 'content must be a string',
    })
    .trim()
    .min(1, 'content must have at least 1 character after trimming')
    .max(10000, 'content must not exceed 10,000 characters'),
})

/**
 * Type inference helpers for TypeScript
 */
export type NotePathParams = z.infer<typeof notePathParamsSchema>
export type NoteUpsertBody = z.infer<typeof noteUpsertBodySchema>
