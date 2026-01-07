/**
 * POST /api/pzk/purchase/initiate
 *
 * Initiates PZK module or bundle purchase flow.
 *
 * Authentication: Required (patient role)
 * Rate Limiting: 5 requests/minute/user
 *
 * Request Body (one of):
 * - { module: 1 | 2 | 3 }  // Single module purchase
 * - { bundle: 'ALL' }       // Complete bundle purchase (all 3 modules)
 *
 * Response (Success - 200):
 * {
 *   data: {
 *     redirectUrl: string,  // URL to Tpay payment form
 *     transactionId: string // Our transaction UUID
 *   },
 *   error: null
 * }
 *
 * Response (Already Has Access - 409):
 * {
 *   data: null,
 *   error: {
 *     code: 'already_has_access',
 *     message: string,
 *     details: { redirectUrl: '/pacjent/pzk/katalog' }
 *   }
 * }
 *
 * Response (Validation Error - 400):
 * {
 *   data: null,
 *   error: {
 *     code: 'validation_error',
 *     message: string
 *   }
 * }
 */

import type { APIRoute } from 'astro'
import { db } from '@/db'
import { PzkPurchaseService } from '@/lib/services/pzkPurchaseService'
import { z } from 'zod'
import { checkUserRateLimit, recordUserRequest } from '@/lib/rate-limit-user'
import { checkPzkFeatureEnabled } from '@/lib/pzk/guards'

export const prerender = false

// ===== VALIDATION SCHEMA =====

const initiateRequestSchema = z
  .object({
    module: z.number().int().min(1).max(3).optional(),
    bundle: z.literal('ALL').optional(),
  })
  .refine((data) => (data.module && !data.bundle) || (!data.module && data.bundle), {
    message: 'Podaj moduł lub pakiet (nie oba jednocześnie)',
  })

// ===== ENDPOINT =====

export const POST: APIRoute = async (context) => {
  // Feature flag check
  const disabledResponse = checkPzkFeatureEnabled(context)
  if (disabledResponse) return disabledResponse

  try {
    // 1. Authentication check
    const { locals, request } = context
    if (!locals.user) {
      return new Response(
        JSON.stringify({
          data: null,
          error: {
            code: 'unauthorized',
            message: 'Musisz być zalogowany aby dokonać zakupu',
          },
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        }
      )
    }

    // 2. Authorization check (role === 'patient')
    if (locals.user.role !== 'patient') {
      return new Response(
        JSON.stringify({
          data: null,
          error: {
            code: 'forbidden',
            message: 'Tylko pacjenci mogą kupować moduły PZK',
          },
        }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        }
      )
    }

    // 3. Rate limiting check (5 requests/minute/user)
    const rateLimitResult = checkUserRateLimit(locals.user.id)
    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({
          data: null,
          error: {
            code: 'rate_limit_exceeded',
            message: `Zbyt wiele prób. Spróbuj ponownie za ${rateLimitResult.retryAfter} sekund.`,
            details: {
              retryAfter: rateLimitResult.retryAfter,
            },
          },
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'Retry-After': String(rateLimitResult.retryAfter),
          },
        }
      )
    }

    // Record this request
    recordUserRequest(locals.user.id)

    // 4. Parse and validate request body
    const body = await request.json()
    const validation = initiateRequestSchema.safeParse(body)

    if (!validation.success) {
      return new Response(
        JSON.stringify({
          data: null,
          error: {
            code: 'validation_error',
            message: 'Nieprawidłowy numer modułu lub pakiet. Wybierz moduł 1, 2, 3 lub pakiet ALL.',
            details: validation.error.errors,
          },
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        }
      )
    }

    const { module, bundle } = validation.data

    // 5. Initiate purchase via PzkPurchaseService
    const purchaseService = new PzkPurchaseService(db)
    const result = await purchaseService.initiatePurchase({
      userId: locals.user.id,
      module: module as 1 | 2 | 3 | undefined,
      bundle,
    })

    // 6. Handle result
    if (result.success === false) {
      // Business logic error (already has access, pending transaction, etc.)
      const statusCode = result.error === 'ALREADY_HAS_ACCESS' ? 409 : 400

      return new Response(
        JSON.stringify({
          data: null,
          error: {
            code: result.error.toLowerCase(),
            message: result.message,
            ...(result.redirectUrl && { details: { redirectUrl: result.redirectUrl } }),
          },
        }),
        {
          status: statusCode,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        }
      )
    }

    // 7. Success - return redirect URL
    return new Response(
      JSON.stringify({
        data: {
          redirectUrl: result.redirectUrl,
          transactionId: result.transactionId,
        },
        error: null,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      }
    )
  } catch (error) {
    // 8. Unexpected error handling
    console.error('[POST /api/pzk/purchase/initiate] Error:', error)

    return new Response(
      JSON.stringify({
        data: null,
        error: {
          code: 'internal_server_error',
          message: 'Wystąpił błąd podczas inicjalizacji płatności. Spróbuj ponownie później.',
        },
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      }
    )
  }
}
