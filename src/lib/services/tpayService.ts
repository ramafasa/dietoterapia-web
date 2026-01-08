/**
 * Tpay Payment Gateway Service
 *
 * Handles communication with Tpay API for payment processing.
 * Supports both sandbox and production environments.
 *
 * Documentation: https://docs-api.tpay.com
 */

import crypto from 'crypto'

// ===== TYPES =====

export interface TpayCreateTransactionParams {
  amount: number // Amount in PLN (e.g., 299.00)
  description: string // Transaction title (e.g., "PZK Moduł 1")
  payerEmail: string // Customer email (required)
  payerName?: string // Customer name (optional)
  returnUrl: string // URL to redirect after payment
  notificationUrl: string // Webhook URL for payment notifications
  crc: string // Custom reference (our transaction UUID)
}

export interface TpayCreateTransactionResponse {
  transactionId: string // Tpay transaction ID (e.g., "TR-XXX-YYY")
  paymentUrl: string // URL to Tpay payment form
}

export interface TpayWebhookPayload {
  tr_id: string // Tpay transaction ID
  tr_status: 'TRUE' | 'FALSE' // Payment status
  tr_amount: string // Amount (e.g., "299.00")
  tr_crc: string // Our transaction UUID
  [key: string]: string // Additional fields
}

export interface TpayConfig {
  clientId: string // Merchant ID
  clientSecret: string // API Key
  environment: 'sandbox' | 'production'
  notificationUrl: string // Base webhook URL
  certDomain: string // Allowed certificate domain for JWS verification
}

// ===== PAYMENT METHOD RESTRICTION =====

/**
 * Allowed payment groups (BLIK + Online Bank Transfers)
 *
 * TEMPORARILY DISABLED - Pending research on new Tpay API (2025).
 *
 * This list was designed to restrict available payment methods to:
 * - BLIK (groupId: 150)
 * - Online bank transfers (19 different banks)
 *
 * Hidden payment methods (when enabled):
 * - Credit/debit cards (groupId: 103)
 * - Google Pay (groupId: 166)
 * - Apple Pay (groupId: 170)
 * - Installments/deferred payments (groupId: 169, 174, 175)
 *
 * Source: GET /transactions/bank-groups (researched: 2026-01-07 on old API)
 * Details: .ai-pzk/tpay-research-results.md
 *
 * TODO: Verify if 'groups' parameter works with new API format (nested callbacks structure)
 */
const ALLOWED_PAYMENT_GROUPS = [
  150, // BLIK
  102, // Bank Pekao SA
  108, // PKO Bank Polski
  110, // Inteligo
  111, // ING Bank Śląski SA
  113, // Alior Bank SA
  114, // Bank Millennium SA
  115, // Santander Bank Polska SA
  116, // Credit Agricole Polska SA
  119, // Velo Bank
  124, // Bank Pocztowy SA
  130, // Nest Bank
  132, // Citibank Handlowy SA
  133, // BNP Paribas Bank Polska SA
  135, // Banki Spółdzielcze
  145, // Plus Bank SA
  148, // Euro Payment
  157, // Druczek płatności / Przelew z innego banku
  159, // Bank Nowy
  160, // mBank
] as const

// ===== TPAY SERVICE =====

export class TpayService {
  private config: TpayConfig
  private baseUrl: string

  // ===== WEBHOOK CERTIFICATE CACHE (DoS HARDENING) =====
  // In serverless environments this persists for warm instances, which is enough to prevent per-request fetch storms.
  private certKeyCache = new Map<string, { publicKey: crypto.KeyObject; expiresAt: number }>()
  private certKeyFetchInFlight = new Map<string, Promise<crypto.KeyObject>>()

  // Defaults can be overridden with env vars if needed.
  private static readonly DEFAULT_CERT_CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes
  private static readonly DEFAULT_CERT_FETCH_TIMEOUT_MS = 2_000 // 2 seconds
  private static readonly DEFAULT_MAX_CERT_BYTES = 64 * 1024 // 64KB

  private get certCacheTtlMs(): number {
    const v = Number(process.env.TPAY_CERT_CACHE_TTL_MS)
    return Number.isFinite(v) && v > 0 ? v : TpayService.DEFAULT_CERT_CACHE_TTL_MS
  }

  private get certFetchTimeoutMs(): number {
    const v = Number(process.env.TPAY_CERT_FETCH_TIMEOUT_MS)
    return Number.isFinite(v) && v > 0 ? v : TpayService.DEFAULT_CERT_FETCH_TIMEOUT_MS
  }

  private get maxCertBytes(): number {
    const v = Number(process.env.TPAY_MAX_CERT_BYTES)
    return Number.isFinite(v) && v > 0 ? v : TpayService.DEFAULT_MAX_CERT_BYTES
  }

  constructor(config?: Partial<TpayConfig>) {
    // Determine environment first
    const environment = (config?.environment || process.env.TPAY_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production'

    // Set default cert domain based on environment (can be overridden by env var)
    const defaultCertDomain = environment === 'production'
      ? 'secure.tpay.com'
      : 'secure.sandbox.tpay.com'

    // Load from environment variables if not provided
    this.config = {
      clientId: config?.clientId || process.env.TPAY_CLIENT_ID || '',
      clientSecret: config?.clientSecret || process.env.TPAY_CLIENT_SECRET || '',
      environment,
      notificationUrl: config?.notificationUrl || process.env.TPAY_NOTIFICATION_URL || '',
      certDomain: config?.certDomain || process.env.TPAY_CERT_DOMAIN || defaultCertDomain,
    }

    // Validate config
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('TpayService: Missing TPAY_CLIENT_ID or TPAY_CLIENT_SECRET')
    }

    // Set base URL based on environment
    this.baseUrl =
      this.config.environment === 'production'
        ? 'https://api.tpay.com'
        : 'https://openapi.sandbox.tpay.com'

    console.log('[TpayService] Initialized:', {
      environment: this.config.environment,
      baseUrl: this.baseUrl,
      certDomain: this.config.certDomain,
    })
  }

  /**
   * Create a new payment transaction
   *
   * NOTE: Payment method restriction (groups parameter) is temporarily disabled
   * pending research on new API format. All payment methods will be visible.
   *
   * @param params - Transaction parameters
   * @returns Transaction ID and payment URL
   *
   * @example
   * const result = await tpayService.createTransaction({
   *   amount: 299.00,
   *   description: 'PZK Moduł 1',
   *   payerEmail: 'user@example.com',
   *   payerName: 'Jan Kowalski',
   *   returnUrl: 'https://paulinamaciak.pl/pzk/platnosc/sukces',
   *   notificationUrl: 'https://paulinamaciak.pl/api/pzk/purchase/callback',
   *   crc: 'transaction-uuid-here'
   * })
   * // { transactionId: 'TR-XXX-YYY', paymentUrl: 'https://...' }
   */
  async createTransaction(
    params: TpayCreateTransactionParams
  ): Promise<TpayCreateTransactionResponse> {
    try {
      // Build return URLs with status query params
      const baseReturnUrl = params.returnUrl
      const successUrl = `${baseReturnUrl}${baseReturnUrl.includes('?') ? '&' : '?'}status=success`
      const errorUrl = `${baseReturnUrl}${baseReturnUrl.includes('?') ? '&' : '?'}status=error`

      // Build request payload (Tpay API v2 format - 2025)
      const payload: any = {
        amount: params.amount, // number (not string)
        description: params.description,
        hiddenDescription: params.crc, // custom reference (our transaction UUID)
        payer: {
          email: params.payerEmail,
          ...(params.payerName && { name: params.payerName }),
        },
        callbacks: {
          notification: {
            url: params.notificationUrl,
          },
          payerUrls: {
            success: successUrl,
            error: errorUrl,
          },
        },
      }

      // TODO: Add payment method restriction after research
      // Payment methods restriction (groups parameter) disabled pending API research
      // See: .ai-pzk/tpay-research-results.md
      // groups: ALLOWED_PAYMENT_GROUPS,

      // Make API request
      const response = await fetch(`${this.baseUrl}/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.getAuthHeader(),
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `Tpay API error: ${response.status} ${response.statusText} - ${errorText}`
        )
      }

      const data = await response.json()

      // Extract transaction ID and payment URL
      const transactionId = data.transactionId || data.tr_id || ''
      const paymentUrl = data.transactionPaymentUrl || data.payment_url || ''

      if (!transactionId || !paymentUrl) {
        throw new Error('Tpay API: Missing transactionId or paymentUrl in response')
      }

      return {
        transactionId,
        paymentUrl,
      }
    } catch (error) {
      console.error('[TpayService] createTransaction error:', error)
      throw error
    }
  }

  /**
   * Verify webhook JWS signature (RFC 7515)
   *
   * CRITICAL for security: Always verify the webhook signature before processing payments.
   * This prevents attackers from sending fake payment confirmations.
   *
   * Tpay sends signatures in X-JWS-Signature header in two possible formats:
   * - Detached payload: `header..signature` (empty middle part, body sent separately)
   * - Attached payload: `header.payload.signature` (body included in JWS)
   *
   * All parts are base64url-encoded.
   *
   * Verification process:
   * 1. Parse JWS header to extract certificate URL (x5u)
   * 2. Validate certificate domain matches configured cert domain
   * 3. Download and validate certificate chain
   * 4. Handle detached/attached payload format
   * 5. Verify signature using certificate's public key
   *
   * @param jwsSignature - JWS signature from X-JWS-Signature header
   * @param requestBody - Raw request body (URL-encoded form data)
   * @returns true if signature is valid, false otherwise
   *
   * @example
   * const signature = request.headers.get('X-JWS-Signature')
   * const isValid = await tpayService.verifyWebhookSignature(signature, rawBody)
   */
  async verifyWebhookSignature(
    jwsSignature: string | null,
    requestBody: string
  ): Promise<boolean> {
    try {
      if (!jwsSignature) {
        console.error('[TpayService] Missing X-JWS-Signature header')
        return false
      }

      console.log('[TpayService] Verifying JWS signature:', {
        signatureLength: jwsSignature.length,
        bodyLength: requestBody.length,
      })

      // 1. Parse JWS (header.payload.signature)
      const parts = jwsSignature.split('.')
      if (parts.length !== 3) {
        console.error('[TpayService] Invalid JWS format (expected 3 parts, got ' + parts.length + ')')
        return false
      }

      const [headerB64, payloadB64, signatureB64] = parts

      // 2. Decode header
      const headerJson = Buffer.from(headerB64, 'base64url').toString('utf-8')
      const header = JSON.parse(headerJson)

      console.log('[TpayService] JWS header:', {
        alg: header.alg,
        x5u: header.x5u,
      })

      // 3. Extract certificate URL from header
      const certUrl = header.x5u
      if (!certUrl) {
        console.error('[TpayService] Missing x5u (certificate URL) in JWS header')
        return false
      }

      // 4. Validate certificate domain (CRITICAL security check)
      const certUrlObj = new URL(certUrl)
      if (certUrlObj.hostname !== this.config.certDomain) {
        console.error('[TpayService] Invalid certificate domain:', {
          expected: this.config.certDomain,
          received: certUrlObj.hostname,
        })
        return false
      }

      // 5. Get public key for verification (cached with TTL; fetch has timeout + size limit)
      const publicKey = await this.getCachedPublicKeyFromCertUrl(certUrl)

      // 6. Handle both attached and detached payload JWS
      let actualPayload: string

      if (payloadB64 === '' || payloadB64.length === 0) {
        // Detached payload JWS (header..signature)
        // Payload is sent separately in request body
        console.log('[TpayService] Detached payload JWS detected')
        actualPayload = Buffer.from(requestBody).toString('base64url')
      } else {
        // Attached payload JWS (header.payload.signature)
        // Verify payload matches request body
        const expectedPayload = Buffer.from(requestBody).toString('base64url')
        if (payloadB64 !== expectedPayload) {
          console.error('[TpayService] Payload mismatch:', {
            expectedLength: expectedPayload.length,
            receivedLength: payloadB64.length,
            bodyPreview: requestBody.substring(0, 100),
          })
          return false
        }
        actualPayload = payloadB64
        console.log('[TpayService] Attached payload verified')
      }

      console.log('[TpayService] Checking signature...')

      // 7. Verify signature using certificate's public key
      const signatureData = `${headerB64}.${actualPayload}`
      const signatureBytes = Buffer.from(signatureB64, 'base64url')

      const verify = crypto.createVerify('SHA256')
      verify.update(signatureData)
      verify.end()

      const isValid = verify.verify(publicKey, signatureBytes)

      if (!isValid) {
        console.error('[TpayService] Signature verification failed')
      } else {
        console.log('[TpayService] Signature verified successfully ✓')
      }

      return isValid
    } catch (error) {
      console.error('[TpayService] verifyWebhookSignature error:', error)
      return false
    }
  }

  private async getCachedPublicKeyFromCertUrl(certUrl: string): Promise<crypto.KeyObject> {
    const now = Date.now()
    const cached = this.certKeyCache.get(certUrl)
    if (cached && cached.expiresAt > now) {
      return cached.publicKey
    }
    if (cached) {
      this.certKeyCache.delete(certUrl)
    }

    const inflight = this.certKeyFetchInFlight.get(certUrl)
    if (inflight) {
      return inflight
    }

    const p = (async () => {
      try {
        console.log('[TpayService] Downloading certificate (cache miss) from:', certUrl)
        const certPem = await this.fetchTextWithTimeoutAndLimit(certUrl, this.certFetchTimeoutMs, this.maxCertBytes)
        const publicKey = crypto.createPublicKey(certPem)

        this.certKeyCache.set(certUrl, {
          publicKey,
          expiresAt: Date.now() + this.certCacheTtlMs,
        })

        return publicKey
      } finally {
        this.certKeyFetchInFlight.delete(certUrl)
      }
    })()

    this.certKeyFetchInFlight.set(certUrl, p)
    return p
  }

  private async fetchTextWithTimeoutAndLimit(url: string, timeoutMs: number, maxBytes: number): Promise<string> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) {
        throw new Error(`Failed to download certificate: ${response.status}`)
      }

      // Respect Content-Length if present to fail fast
      const contentLength = response.headers.get('content-length')
      if (contentLength) {
        const len = Number(contentLength)
        if (Number.isFinite(len) && len > maxBytes) {
          throw new Error(`Certificate too large: ${len} bytes > ${maxBytes}`)
        }
      }

      if (!response.body) {
        // Fallback (should be rare): still try standard text()
        const text = await response.text()
        if (Buffer.byteLength(text, 'utf8') > maxBytes) {
          throw new Error(`Certificate too large (post-read) > ${maxBytes}`)
        }
        return text
      }

      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let total = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          total += value.byteLength
          if (total > maxBytes) {
            throw new Error(`Certificate too large (streamed) > ${maxBytes}`)
          }
          chunks.push(value)
        }
      }

      return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8')
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Certificate fetch timeout after ${timeoutMs}ms`)
      }
      throw err
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Get transaction status (optional, for debugging)
   *
   * @param transactionId - Tpay transaction ID
   * @returns Transaction details
   */
  async getTransactionStatus(transactionId: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/transactions/${transactionId}`, {
        method: 'GET',
        headers: {
          Authorization: this.getAuthHeader(),
        },
      })

      if (!response.ok) {
        throw new Error(`Tpay API error: ${response.status} ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('[TpayService] getTransactionStatus error:', error)
      throw error
    }
  }

  /**
   * Generate Authorization header (Basic Auth)
   *
   * @returns Base64-encoded Basic Auth header
   */
  private getAuthHeader(): string {
    const credentials = `${this.config.clientId}:${this.config.clientSecret}`
    const base64Credentials = Buffer.from(credentials).toString('base64')
    return `Basic ${base64Credentials}`
  }
}

// ===== LAZY SINGLETON (OPTIONAL) =====
// Avoid eager construction at module import time (important for tests and serverless cold starts).
let _tpayService: TpayService | undefined

/**
 * Default Tpay service instance (loads config from env) - constructed lazily on first access.
 */
export function getTpayService(): TpayService {
  if (!_tpayService) {
    _tpayService = new TpayService()
  }
  return _tpayService
}
