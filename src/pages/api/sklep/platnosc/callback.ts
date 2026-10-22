/**
 * POST /api/sklep/platnosc/callback
 *
 * Webhook Tpay dla sklepu z e-bookami (osobny od PZK, decyzja 10). Zawsze aktywny – bez feature
 * flagi (FF_SKLEP=false nie może gubić płatności; guards.ts ma tę ścieżkę jako always-on),
 * zwolniony z CSRF (src/middleware/csrf.ts) – zabezpieczony podpisem JWS.
 *
 * Struktura skopiowana z /api/pzk/purchase/callback (limit body, ręczne parsowanie form-urlencoded).
 *
 * Pola Tpay: tr_crc = nasze id transakcji, tr_id = id Tpay, tr_status ('TRUE' = sukces; wszystko
 * inne = niepowodzenie, jak w PZK), tr_amount = kwota, nagłówek X-JWS-Signature.
 *
 * Odpowiedzi (jak PZK, text/plain):
 * - "TRUE" 200 – przetworzone, już przetworzone, niezgodna kwota (obsługa ręczna), płatność spóźniona
 *   lub nieoczekiwana, nieznana / nie-sklepowa transakcja przy POPRAWNYM podpisie (ponowienia nic nie
 *   zmienią; przy sukcesie alert do Pauliny); Tpay nie ponawia,
 * - "FALSE" 400 – brak tr_id / tr_crc,
 * - "FALSE" 413 – body za duże,
 * - "FALSE" 500 – zła sygnatura, błąd bazy (Tpay ponowi powiadomienie).
 */

import type { APIRoute } from 'astro'
import { db } from '@/db'
import { ShopPaymentService, ShopWebhookError } from '@/lib/services/shopPaymentService'
import { dbErrorLog, truncateForLog } from '@/lib/shop/safeLog'

export const prerender = false

const LOG = '[POST /api/sklep/platnosc/callback]'

// Hard limit to avoid DoS via large request bodies (webhook is small urlencoded payload).
const MAX_TPAY_WEBHOOK_BODY_BYTES = (() => {
  const v = Number(process.env.TPAY_WEBHOOK_MAX_BODY_BYTES)
  return Number.isFinite(v) && v > 0 ? v : 64 * 1024 // 64KB
})()

class BodyTooLargeError extends Error {}

async function readRequestTextWithLimit(request: Request, maxBytes: number): Promise<string> {
  const contentLength = request.headers.get('content-length')
  if (contentLength) {
    const len = Number(contentLength)
    if (Number.isFinite(len) && len > maxBytes) {
      throw new BodyTooLargeError(`Request body too large: ${len} bytes > ${maxBytes}`)
    }
  }

  if (!request.body) {
    const text = await request.text()
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new BodyTooLargeError(`Request body too large (post-read) > ${maxBytes}`)
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
        throw new BodyTooLargeError(`Request body too large (streamed) > ${maxBytes}`)
      }
      chunks.push(value)
    }
  }

  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8')
}

function plain(body: 'TRUE' | 'FALSE', status: number): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain' } })
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const rawBody = await readRequestTextWithLimit(request, MAX_TPAY_WEBHOOK_BODY_BYTES)
    const signature = request.headers.get('X-JWS-Signature')

    const params = new URLSearchParams(rawBody)
    const tpayTransactionId = params.get('tr_id') ?? ''
    const transactionId = params.get('tr_crc') ?? ''
    const trStatus = params.get('tr_status')

    console.log(`${LOG} Received webhook`, {
      hasSignature: !!signature,
      bodyLength: rawBody.length,
      // przed weryfikacją podpisu – wartości od kogokolwiek, przycięte
      tr_id: truncateForLog(tpayTransactionId),
      tr_status: truncateForLog(trStatus, 16),
      tr_crc: truncateForLog(transactionId),
    })

    if (!tpayTransactionId || !transactionId) {
      console.error(`${LOG} Missing required fields`, {
        hasTrId: !!tpayTransactionId,
        hasTrCrc: !!transactionId,
      })
      return plain('FALSE', 400)
    }

    const result = await new ShopPaymentService(db).processNotification({
      transactionId,
      tpayTransactionId,
      isSuccess: trStatus === 'TRUE',
      amount: params.get('tr_amount') ?? undefined,
      signature,
      rawBody,
    })

    console.log(`${LOG} Processed`, { transactionId: truncateForLog(transactionId), ...result })
    return plain('TRUE', 200)
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      console.error(`${LOG} ${error.message}`)
      return plain('FALSE', 413)
    }
    // Bez error.message z warstwy DB (zawiera parametry zapytań) – tylko kod / nazwa.
    console.error(`${LOG} Error`, error instanceof ShopWebhookError ? { code: error.code } : dbErrorLog(error))
    return plain('FALSE', 500)
  }
}
