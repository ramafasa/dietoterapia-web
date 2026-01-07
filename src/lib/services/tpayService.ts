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
  md5sum: string // Signature hash
  [key: string]: string // Additional fields
}

export interface TpayConfig {
  clientId: string // Merchant ID
  clientSecret: string // API Key
  environment: 'sandbox' | 'production'
  notificationUrl: string // Base webhook URL
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
    // Load from environment variables if not provided
    this.config = {
      clientId: config?.clientId || process.env.TPAY_CLIENT_ID || '',
      clientSecret: config?.clientSecret || process.env.TPAY_CLIENT_SECRET || '',
      environment: (config?.environment || process.env.TPAY_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production',
      notificationUrl: config?.notificationUrl || process.env.TPAY_NOTIFICATION_URL || '',
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
   * Verify webhook signature
   *
   * CRITICAL for security: Always verify the webhook signature before processing payments.
   * This prevents attackers from sending fake payment confirmations.
   *
   * @param payload - Webhook payload from Tpay
   * @param receivedSignature - md5sum field from payload
   * @returns true if signature is valid, false otherwise
   *
   * @example
   * const isValid = tpayService.verifyWebhookSignature(webhookData, webhookData.md5sum)
   * if (!isValid) {
   *   throw new Error('Invalid webhook signature')
   * }
   */
  verifyWebhookSignature(
    payload: TpayWebhookPayload,
    receivedSignature: string
  ): boolean {
    try {
      // Build signature string according to Tpay documentation
      // Format: sort keys alphabetically, concatenate values, append CLIENT_SECRET
      const sortedKeys = Object.keys(payload)
        .filter(key => key !== 'md5sum') // Exclude signature field
        .sort()

      const values = sortedKeys.map(key => payload[key]).join('')
      const stringToHash = values + this.config.clientSecret

      // Calculate MD5 hash
      const calculatedSignature = crypto
        .createHash('md5')
        .update(stringToHash)
        .digest('hex')

      // Compare signatures
      return calculatedSignature === receivedSignature
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
