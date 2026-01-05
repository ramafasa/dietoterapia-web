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
        : 'https://api.sandbox.tpay.com'
  }

  /**
   * Create a new payment transaction
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
      // Build request payload (Tpay API format)
      const payload = {
        amount: params.amount.toFixed(2),
        description: params.description,
        crc: params.crc,
        result_url: params.returnUrl,
        result_email: params.payerEmail,
        email: params.payerEmail,
        ...(params.payerName && { name: params.payerName }),
        ...(params.notificationUrl && { notifications_url: params.notificationUrl }),
      }

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
