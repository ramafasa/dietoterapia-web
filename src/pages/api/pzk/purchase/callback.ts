/**
 * POST /api/pzk/purchase/callback
 *
 * Webhook endpoint for Tpay payment notifications.
 *
 * CRITICAL SECURITY:
 * - MUST verify JWS signature from X-JWS-Signature header before processing
 * - MUST be idempotent (handle duplicate callbacks)
 * - MUST use HTTPS (configured in Vercel/production)
 *
 * Authentication: JWS signature verification (RFC 7515)
 * Rate Limiting: None (Tpay controls retry logic)
 *
 * Request Headers:
 *   X-JWS-Signature: string  // JWS signature (header.payload.signature)
 *   Content-Type: application/x-www-form-urlencoded
 *
 * Request Body (from Tpay) - URL-encoded form data:
 * tr_id=12345&tr_status=TRUE&tr_amount=299.00&tr_crc=<uuid>&...
 *
 * Fields:
 *   tr_id: string         // Tpay transaction ID
 *   tr_status: 'TRUE' | 'FALSE'  // Payment status
 *   tr_amount: string     // Amount (e.g., "299.00")
 *   tr_crc: string        // Our transaction UUID
 *   ...                   // Other Tpay fields
 *
 * Response:
 * - Success: "TRUE" (text/plain)
 * - Error: "FALSE" (text/plain)
 *
 * Note: Tpay requires plain text "TRUE"/"FALSE" response
 *
 * Documentation: https://docs-api.tpay.com/en/webhooks/#security
 */

import type { APIRoute } from 'astro'
import { db } from '@/db'
import { PzkPurchaseService } from '@/lib/services/pzkPurchaseService'

export const prerender = false

// Hard limit to avoid DoS via large request bodies (webhook is small urlencoded payload).
// Can be overridden in env to tune without code changes.
const MAX_TPAY_WEBHOOK_BODY_BYTES = (() => {
  const v = Number(process.env.TPAY_WEBHOOK_MAX_BODY_BYTES)
  return Number.isFinite(v) && v > 0 ? v : 64 * 1024 // 64KB
})()

async function readRequestTextWithLimit(request: Request, maxBytes: number): Promise<string> {
  // Fail fast if Content-Length is present and exceeds limit
  const contentLength = request.headers.get('content-length')
  if (contentLength) {
    const len = Number(contentLength)
    if (Number.isFinite(len) && len > maxBytes) {
      throw new Error(`Request body too large: ${len} bytes > ${maxBytes}`)
    }
  }

  if (!request.body) {
    // Some runtimes may not expose a body stream; fallback to request.text()
    const text = await request.text()
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new Error(`Request body too large (post-read) > ${maxBytes}`)
    }
    return text
  }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      total += value.byteLength
      if (total > maxBytes) {
        throw new Error(`Request body too large (streamed) > ${maxBytes}`)
      }
      chunks.push(value)
    }
  }

  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8')
}

// ===== ENDPOINT =====

export const POST: APIRoute = async ({ request }) => {
  try {
    // 1. Get raw request body (needed for JWS signature verification)
    const rawBody = await readRequestTextWithLimit(request, MAX_TPAY_WEBHOOK_BODY_BYTES)

    // 2. Extract JWS signature from header
    const jwsSignature = request.headers.get('X-JWS-Signature')

    console.log('[POST /api/pzk/purchase/callback] Received webhook:', {
      hasSignature: !!jwsSignature,
      bodyLength: rawBody.length,
      timestamp: new Date().toISOString(),
    })

    // 3. Parse URL-encoded form data manually (body was already consumed)
    const params = new URLSearchParams(rawBody)
    const payload: Record<string, string> = {}
    for (const [key, value] of params.entries()) {
      payload[key] = value
    }

    // 4. Extract required fields
    const tpayTransactionId = payload.tr_id
    const transactionId = payload.tr_crc // Our transaction UUID
    const isSuccess = payload.tr_status === 'TRUE'

    console.log('[Webhook] Parsed payload:', {
      tr_id: tpayTransactionId,
      tr_status: payload.tr_status,
      tr_crc: transactionId,
    })

    // 5. Validate required fields
    if (!tpayTransactionId || !transactionId) {
      console.error('[Webhook] Missing required fields:', {
        tpayTransactionId,
        transactionId,
      })
      return new Response('FALSE', {
        status: 400,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    // 6. Process payment via PzkPurchaseService
    const purchaseService = new PzkPurchaseService(db)

    await purchaseService.processPaymentCallback({
      transactionId,
      tpayTransactionId,
      status: isSuccess ? 'success' : 'failed',
      signature: jwsSignature,
      rawPayload: payload,
      rawBody, // Add raw body for signature verification
    })

    // 5. Return success to Tpay
    console.log('[Webhook] Processed successfully:', {
      transactionId,
      status: isSuccess ? 'success' : 'failed',
    })

    return new Response('TRUE', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  } catch (error) {
    // 6. Error handling
    console.error('[POST /api/pzk/purchase/callback] Error:', error)

    // Log error details for debugging
    if (error instanceof Error) {
      console.error('[Webhook] Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      })
    }

    // Return FALSE to Tpay (they will retry)
    return new Response('FALSE', {
      status: error instanceof Error && /too large/i.test(error.message) ? 413 : 500,
      headers: { 'Content-Type': 'text/plain' },
    })
  }
}
