/**
 * PZK Reviews Validation Schemas
 *
 * Zod validation schemas for PZK reviews endpoints:
 * - GET /api/pzk/reviews (list with pagination)
 * - GET /api/pzk/reviews/me (my review)
 * - PUT /api/pzk/reviews/me (upsert my review)
 * - DELETE /api/pzk/reviews/me (delete my review)
 *
 * Business rules:
 * - rating: integer 1-6 (6-point scale)
 * - content: non-empty string after trim, max 5000 characters
 * - limit: integer 1-50, default 20
 * - sort: enum 'createdAtDesc' | 'updatedAtDesc', default 'createdAtDesc'
 * - cursor: optional opaque string
 */

import { z } from 'zod'

/**
 * Query parameter validation schema for GET /api/pzk/reviews
 *
 * Business rules:
 * - cursor: optional opaque string (base64url encoded JSON)
 * - limit: optional integer, default 20, min 1, max 50
 * - sort: optional enum, default 'createdAtDesc'
 *
 * @example
 * const result = reviewListQuerySchema.safeParse({
 *   cursor: 'eyJ0aW1lc3RhbXAiOiIyMDI1LTEyLTAxVDEwOjAwOjAwWiIsImlkIjoidXVpZCJ9',
 *   limit: '20',
 *   sort: 'createdAtDesc'
 * })
 * if (!result.success) {
 *   // Handle validation error (400 Bad Request)
 * }
 */
export const reviewListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z
    .string()
    .optional()
    .default('20')
    .transform((val) => parseInt(val, 10))
    .pipe(
      z
        .number({
          invalid_type_error: 'limit must be a number',
        })
        .int('limit must be an integer')
        .min(1, 'limit must be at least 1')
        .max(50, 'limit must not exceed 50')
    ),
  sort: z
    .enum(['createdAtDesc', 'updatedAtDesc'], {
      invalid_type_error:
        "sort must be either 'createdAtDesc' or 'updatedAtDesc'",
    })
    .optional()
    .default('createdAtDesc'),
})

/**
 * Request body validation schema for PUT /api/pzk/reviews/me
 *
 * Business rules:
 * - rating: required integer, 1-6 (6-point scale)
 * - content: required string, after trim must have at least 1 character, max 5000 characters
 *
 * @example
 * const result = reviewUpsertBodySchema.safeParse({
 *   rating: 5,
 *   content: 'Great program!'
 * })
 * if (!result.success) {
 *   // Handle validation error (400 Bad Request)
 * }
 */
export const reviewUpsertBodySchema = z.object({
  rating: z
    .number({
      required_error: 'rating is required',
      invalid_type_error: 'rating must be a number',
    })
    .int('rating must be an integer')
    .min(1, 'rating must be at least 1')
    .max(6, 'rating must not exceed 6'),
  content: z
    .string({
      required_error: 'content is required',
      invalid_type_error: 'content must be a string',
    })
    .trim()
    .min(1, 'content must have at least 1 character after trimming')
    .max(5000, 'content must not exceed 5,000 characters'),
})

/**
 * Type inference helpers for TypeScript
 */
export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>
export type ReviewUpsertBody = z.infer<typeof reviewUpsertBodySchema>
