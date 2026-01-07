/**
 * POST /api/pzk/purchase/callback
 *
 * Webhook endpoint for Tpay payment notifications.
 *
 * CRITICAL SECURITY:
 * - MUST verify webhook signature before processing
 * - MUST be idempotent (handle duplicate callbacks)
 * - MUST use HTTPS (configured in Vercel/production)
 *
 * Authentication: None (webhook from Tpay)
 * Rate Limiting: None (Tpay controls retry logic)
 *
 * Request Body (from Tpay):
 * {
 *   tr_id: string,        // Tpay transaction ID
 *   tr_status: 'TRUE' | 'FALSE',  // Payment status
 *   tr_amount: string,    // Amount (e.g., "299.00")
 *   tr_crc: string,       // Our transaction UUID
 *   md5sum: string,       // Signature hash
 *   ...                   // Other Tpay fields
 * }
 *
 * Response:
 * - Success: "TRUE" (text/plain)
 * - Error: "FALSE" (text/plain)
 *
 * Note: Tpay requires plain text "TRUE"/"FALSE" response
 */

import type { APIRoute } from 'astro'
import { db } from '@/db'
import { PzkPurchaseService } from '@/lib/services/pzkPurchaseService'

export const prerender = false

// ===== ENDPOINT =====

export const POST: APIRoute = async ({ request }) => {
  try {
    // 1. Parse webhook payload
    const payload = await request.json()

    console.log('[POST /api/pzk/purchase/callback] Received webhook:', {
      tr_id: payload.tr_id,
      tr_status: payload.tr_status,
      tr_crc: payload.tr_crc,
      timestamp: new Date().toISOString(),
    })

    // 2. Extract required fields
    const tpayTransactionId = payload.tr_id
    const transactionId = payload.tr_crc // Our transaction UUID
    const isSuccess = payload.tr_status === 'TRUE'
    const signature = payload.md5sum

    // 3. Validate required fields
    if (!tpayTransactionId || !transactionId || !signature) {
      console.error('[Webhook] Missing required fields:', {
        tpayTransactionId,
        transactionId,
        signature: !!signature,
      })
      return new Response('FALSE', {
        status: 400,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    // 4. Process payment via PzkPurchaseService
    const purchaseService = new PzkPurchaseService(db)

    await purchaseService.processPaymentCallback({
      transactionId,
      tpayTransactionId,
      status: isSuccess ? 'success' : 'failed',
      signature,
      rawPayload: payload,
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
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    })
  }
}
