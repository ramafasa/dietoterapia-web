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
   * Tpay sends signatures in X-JWS-Signature header in format: header.payload.signature
   * All parts are base64url-encoded.
   *
   * Verification process:
   * 1. Parse JWS header to extract certificate URL (x5u)
   * 2. Validate certificate domain is secure.tpay.com
   * 3. Download and validate certificate chain
   * 4. Verify signature using certificate's public key
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

      console.log('[TpayService] Downloading certificate from:', certUrl)

      // 5. Download certificate
      const certResponse = await fetch(certUrl)
      if (!certResponse.ok) {
        console.error('[TpayService] Failed to download certificate:', certResponse.status)
        return false
      }
      const certPem = await certResponse.text()

      // 6. Verify payload matches request body
      const expectedPayload = Buffer.from(requestBody).toString('base64url')
      if (payloadB64 !== expectedPayload) {
        console.error('[TpayService] Payload mismatch:', {
          expectedLength: expectedPayload.length,
          receivedLength: payloadB64.length,
          bodyPreview: requestBody.substring(0, 100),
        })
        return false
      }

      console.log('[TpayService] Payload verified, checking signature...')

      // 7. Verify signature using certificate's public key
      const signatureData = `${headerB64}.${payloadB64}`
      const signatureBytes = Buffer.from(signatureB64, 'base64url')

      const verify = crypto.createVerify('SHA256')
      verify.update(signatureData)
      verify.end()

      const isValid = verify.verify(certPem, signatureBytes)

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

// ===== SINGLETON INSTANCE =====

/**
 * Default Tpay service instance (loads config from env)
 */
export const tpayService = new TpayService()
