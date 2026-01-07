/**
 * PZK Purchase Service (PZK-specific)
 *
 * Orchestrates the PZK module purchase flow:
 * - Validates access (blocks duplicate purchases)
 * - Creates transaction via TransactionService
 * - Initiates payment via TpayService
 * - Activates module access after successful payment
 * - Sends confirmation email
 *
 * Maps PZK module numbers (1, 2, 3) to generic item format ('PZK_MODULE_X')
 */

import type { Database } from '@/db'
import { TransactionService } from './transactionService'
import { TpayService } from './tpayService'
import { PzkAccessService } from './pzkAccessService'
import { pzkModuleAccess, users, events, type NewPzkModuleAccess } from '@/db/schema'
import { eq } from 'drizzle-orm'
import type { PzkModuleNumber } from '@/types/pzk-dto'
import { sendPzkPurchaseConfirmationEmail, sendPzkPurchaseNotificationEmail, type SMTPConfig } from '@/lib/email'

// ===== TYPES =====

export interface InitiatePurchaseParams {
  userId: string
  module?: PzkModuleNumber // 1 | 2 | 3 (optional when bundle is provided)
  bundle?: 'ALL' // Complete bundle (all 3 modules)
}

export interface InitiatePurchaseSuccess {
  success: true
  redirectUrl: string // URL to Tpay payment form
  transactionId: string // Our transaction UUID
}

export interface InitiatePurchaseError {
  success: false
  error: 'ALREADY_HAS_ACCESS' | 'PENDING_TRANSACTION' | 'UNKNOWN'
  message: string
  redirectUrl?: string // Optional redirect for client
}

export type InitiatePurchaseResult = InitiatePurchaseSuccess | InitiatePurchaseError

export interface ProcessCallbackParams {
  transactionId: string
  tpayTransactionId: string
  status: 'success' | 'failed'
  signature: string | null
  rawPayload: any
  rawBody: string // Raw request body for JWS verification
}

// ===== PZK PURCHASE SERVICE =====

export class PzkPurchaseService {
  private transactionService: TransactionService
  private tpayService: TpayService
  private accessService: PzkAccessService

  constructor(private db: Database) {
    this.transactionService = new TransactionService(db)
    this.tpayService = new TpayService()
    this.accessService = new PzkAccessService(db)
  }

  /**
   * Initiate PZK module purchase
   *
   * Flow:
   * 1. Check if user already has active access → return error + catalog redirect
   * 2. Check for pending transactions → return error
   * 3. Get module price from env
   * 4. Create transaction in DB (status: pending)
   * 5. Call Tpay API to create payment
   * 6. Return redirect URL to payment form
   *
   * @param params - Purchase parameters (userId, module)
   * @returns Success with payment URL or error with reason
   */
  async initiatePurchase(params: InitiatePurchaseParams): Promise<InitiatePurchaseResult> {
    try {
      const { userId, module, bundle } = params

      // 0. Validate params: either module OR bundle must be provided (not both, not neither)
      if ((!module && !bundle) || (module && bundle)) {
        return {
          success: false,
          error: 'UNKNOWN',
          message: 'Nieprawidłowe parametry zakupu. Podaj moduł lub pakiet.',
        }
      }

      // 1. Determine item and description based on purchase type
      let item: string
      let description: string
      let price: number

      if (bundle === 'ALL') {
        item = 'PZK_BUNDLE_ALL'
        description = 'PZK Pakiet - 3 moduły'
        price = this.getPriceForBundle()
      } else if (module) {
        item = this.getItemFromModule(module)
        description = `PZK Moduł ${module}`
        price = this.getPriceForModule(module)
      } else {
        // Should never reach here due to validation above
        throw new Error('Invalid purchase params')
      }

      // 2. Check if user already has active access
      const accessSummary = await this.accessService.getAccessSummary(userId)

      if (bundle === 'ALL') {
        // For bundle: user cannot have ANY active module
        if (accessSummary.activeModules.length > 0) {
          const firstModule = accessSummary.activeModules[0]
          return {
            success: false,
            error: 'ALREADY_HAS_ACCESS',
            message: `Masz już aktywny dostęp do modułu ${firstModule}. Kup pozostałe moduły osobno.`,
            redirectUrl: '/pacjent/pzk/katalog',
          }
        }
      } else if (module) {
        // For single module: user cannot have THIS module
        if (accessSummary.activeModules.includes(module)) {
          return {
            success: false,
            error: 'ALREADY_HAS_ACCESS',
            message: `Masz już aktywny dostęp do modułu ${module}`,
            redirectUrl: '/pacjent/pzk/katalog',
          }
        }
      }

      // 3. Check for pending transactions
      const hasPending = await this.transactionService.hasPendingTransaction(userId, item)
      if (hasPending) {
        const itemLabel = bundle === 'ALL' ? 'pakiet' : `moduł ${module}`
        return {
          success: false,
          error: 'PENDING_TRANSACTION',
          message: `Masz już oczekującą płatność za ${itemLabel}. Dokończ płatność lub spróbuj ponownie później.`,
        }
      }

      // 4. Get user data
      const [user] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

      if (!user) {
        throw new Error(`User not found: ${userId}`)
      }

      // 5. Build payer name (optional)
      const payerName =
        user.firstName && user.lastName
          ? `${user.firstName} ${user.lastName}`
          : undefined

      // 6. Create transaction in DB
      const transaction = await this.transactionService.createTransaction({
        userId,
        item,
        amount: price,
        payerEmail: user.email,
        payerName,
        tpayTitle: description,
      })

      // 7. Build return URLs
      const siteUrl = process.env.SITE_URL || 'https://paulinamaciak.pl'
      const returnUrl = `${siteUrl}/pzk/platnosc/sukces?transaction=${transaction.id}`
      const notificationUrl = process.env.TPAY_NOTIFICATION_URL || `${siteUrl}/api/pzk/purchase/callback`

      // 8. Call Tpay API to create payment
      const tpayResult = await this.tpayService.createTransaction({
        amount: price,
        description,
        payerEmail: user.email,
        payerName,
        returnUrl,
        notificationUrl,
        crc: transaction.id, // Use our transaction ID as reference
      })

      // 9. Update transaction with Tpay ID
      await this.transactionService.updateTpayTransactionId(
        transaction.id,
        tpayResult.transactionId
      )

      // 10. Return success with payment URL
      return {
        success: true,
        redirectUrl: tpayResult.paymentUrl,
        transactionId: transaction.id,
      }
    } catch (error) {
      console.error('[PzkPurchaseService] initiatePurchase error:', error)
      return {
        success: false,
        error: 'UNKNOWN',
        message: 'Wystąpił błąd podczas inicjalizacji płatności. Spróbuj ponownie.',
      }
    }
  }

  /**
   * Process payment callback from Tpay webhook
   *
   * Flow:
   * 1. Verify webhook signature (security!)
   * 2. Find transaction by ID
   * 3. Check if already processed (idempotence)
   * 4. Update transaction status
   * 5. If success → activate module access + send email
   * 6. If failed → log error
   *
   * @param params - Callback parameters
   */
  async processPaymentCallback(params: ProcessCallbackParams): Promise<void> {
    try {
      const { transactionId, tpayTransactionId, status, signature, rawPayload, rawBody } = params

      // 1. Verify JWS signature (CRITICAL!)
      const isValid = await this.tpayService.verifyWebhookSignature(signature, rawBody)
      if (!isValid) {
        console.error('[PzkPurchaseService] Invalid webhook signature!', {
          transactionId,
          hasSignature: !!signature,
        })
        throw new Error('Invalid webhook signature')
      }

      // 2. Get transaction
      const transaction = await this.transactionService.getTransactionById(transactionId)
      if (!transaction) {
        throw new Error(`Transaction not found: ${transactionId}`)
      }

      // 3. Check if already processed (idempotence)
      if (transaction.status !== 'pending') {
        console.log('[PzkPurchaseService] Transaction already processed', {
          id: transactionId,
          status: transaction.status,
        })
        return // Skip processing, already handled
      }

      // 4. Update transaction status
      await this.transactionService.updateTransactionStatus(
        transactionId,
        status,
        tpayTransactionId
      )

      // 5. If success → activate module access
      if (status === 'success') {
        await this.activateModuleAccess(transaction)
      } else {
        console.log('[PzkPurchaseService] Payment failed', {
          transactionId,
          item: transaction.item,
        })

        // Send notification email to owners about failed payment
        await this.sendPurchaseNotificationEmail(transaction, 'failed')
      }
    } catch (error) {
      console.error('[PzkPurchaseService] processPaymentCallback error:', error)
      throw error
    }
  }

  /**
   * Activate PZK module access after successful payment
   *
   * Private method called after payment confirmation.
   *
   * Flow:
   * 1. Check if bundle or single module
   * 2. For bundle: activate modules 1, 2, 3
   * 3. For single module: activate that module
   * 4. Send confirmation email
   * 5. Log event
   */
  private async activateModuleAccess(transaction: any): Promise<void> {
    try {
      const startAt = new Date()
      const expiresAt = new Date()
      expiresAt.setMonth(expiresAt.getMonth() + 12)

      // 1. Check if bundle or single module
      if (transaction.item === 'PZK_BUNDLE_ALL') {
        // Bundle: activate all 3 modules
        const modules: PzkModuleNumber[] = [1, 2, 3]

        for (const module of modules) {
          const accessRecord: NewPzkModuleAccess = {
            userId: transaction.userId,
            module,
            startAt,
            expiresAt,
            revokedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
          await this.db.insert(pzkModuleAccess).values(accessRecord)
        }

        console.log('[PzkPurchaseService] Bundle access activated (all 3 modules)', {
          userId: transaction.userId,
          modules,
          expiresAt: expiresAt.toISOString(),
        })

        // Send confirmation email for bundle
        await this.sendBundleConfirmationEmail(transaction, expiresAt)

        // Send notification email to owners
        await this.sendPurchaseNotificationEmail(transaction, 'success')

        // Log event
        await this.logPurchaseEvent(transaction.id, transaction.userId, null, 'pzk_bundle_purchase_success')
      } else {
        // Single module
        const module = this.getModuleFromItem(transaction.item)

        const accessRecord: NewPzkModuleAccess = {
          userId: transaction.userId,
          module,
          startAt,
          expiresAt,
          revokedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }

        await this.db.insert(pzkModuleAccess).values(accessRecord)

        console.log('[PzkPurchaseService] Module access activated', {
          userId: transaction.userId,
          module,
          expiresAt: expiresAt.toISOString(),
        })

        // Send confirmation email for single module
        await this.sendConfirmationEmail(transaction, module, expiresAt)

        // Send notification email to owners
        await this.sendPurchaseNotificationEmail(transaction, 'success')

        // Log event
        await this.logPurchaseEvent(transaction.id, transaction.userId, module, 'pzk_purchase_success')
      }
    } catch (error) {
      console.error('[PzkPurchaseService] activateModuleAccess error:', error)
      throw error
    }
  }

  /**
   * Send bundle purchase confirmation email to user
   *
   * @param transaction - Transaction record
   * @param expiresAt - Access expiration date
   */
  private async sendBundleConfirmationEmail(
    transaction: any,
    expiresAt: Date
  ): Promise<void> {
    try {
      // Get user data
      const [user] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, transaction.userId))
        .limit(1)

      if (!user) {
        console.error('[PzkPurchaseService] User not found for email:', transaction.userId)
        return
      }

      // Prepare user name
      const userName = user.firstName || user.email.split('@')[0]

      // Get SMTP config from env
      const smtpConfig: SMTPConfig = {
        host: process.env.SMTP_HOST || 'ssl0.ovh.net',
        port: parseInt(process.env.SMTP_PORT || '465', 10),
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      }

      // Check if we're in dev mode (no SMTP credentials)
      const isDev = !process.env.SMTP_USER || !process.env.SMTP_PASS

      // TODO: Create bundle-specific email template
      // For now, we'll send a simple text email or reuse module 1 template
      // await sendPzkBundlePurchaseConfirmationEmail(...)

      console.log('[PzkPurchaseService] Bundle confirmation email would be sent', {
        to: user.email,
        modules: [1, 2, 3],
        note: 'Bundle email template not yet implemented - using placeholder',
      })
    } catch (error) {
      // Don't throw - email failure shouldn't block purchase
      console.error('[PzkPurchaseService] sendBundleConfirmationEmail error:', error)
    }
  }

  /**
   * Send purchase confirmation email to user
   *
   * @param transaction - Transaction record
   * @param module - Module number (1 | 2 | 3)
   * @param expiresAt - Access expiration date
   */
  private async sendConfirmationEmail(
    transaction: any,
    module: number,
    expiresAt: Date
  ): Promise<void> {
    try {
      // Get user data
      const [user] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, transaction.userId))
        .limit(1)

      if (!user) {
        console.error('[PzkPurchaseService] User not found for email:', transaction.userId)
        return
      }

      // Prepare user name
      const userName = user.firstName || user.email.split('@')[0]

      // Get SMTP config from env
      const smtpConfig: SMTPConfig = {
        host: process.env.SMTP_HOST || 'ssl0.ovh.net',
        port: parseInt(process.env.SMTP_PORT || '465', 10),
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      }

      // Check if we're in dev mode (no SMTP credentials)
      const isDev = !process.env.SMTP_USER || !process.env.SMTP_PASS

      // Send email
      await sendPzkPurchaseConfirmationEmail(
        user.email,
        userName,
        module as 1 | 2 | 3,
        expiresAt,
        smtpConfig,
        isDev
      )

      console.log('[PzkPurchaseService] Confirmation email sent', {
        to: user.email,
        module,
      })
    } catch (error) {
      // Don't throw - email failure shouldn't block purchase
      console.error('[PzkPurchaseService] sendConfirmationEmail error:', error)
    }
  }

  /**
   * Log purchase event to events table
   *
   * @param transactionId - Transaction UUID
   * @param userId - User UUID
   * @param module - Module number (null for bundle)
   * @param eventType - Event type
   */
  private async logPurchaseEvent(
    transactionId: string,
    userId: string,
    module: number | null,
    eventType: string
  ): Promise<void> {
    try {
      const properties: any = {
        transactionId,
      }

      if (module !== null) {
        properties.module = module
        properties.item = `PZK_MODULE_${module}`
      } else {
        properties.item = 'PZK_BUNDLE_ALL'
        properties.modules = [1, 2, 3]
      }

      await this.db.insert(events).values({
        userId,
        eventType,
        properties,
        timestamp: new Date(),
      })

      console.log('[PzkPurchaseService] Event logged', {
        eventType,
        module: module || 'bundle',
      })
    } catch (error) {
      // Don't throw - event logging failure shouldn't block purchase
      console.error('[PzkPurchaseService] logPurchaseEvent error:', error)
    }
  }

  /**
   * Send purchase notification email to owners
   *
   * Sends email to dietoterapia@paulinamaciak.pl and rafalmaciak@gmail.com
   * with purchase details (success or failure).
   *
   * @param transaction - Transaction record
   * @param status - Payment status ('success' | 'failed')
   */
  private async sendPurchaseNotificationEmail(
    transaction: any,
    status: 'success' | 'failed'
  ): Promise<void> {
    try {
      // Get SMTP config from env
      const smtpConfig: SMTPConfig = {
        host: process.env.SMTP_HOST || 'ssl0.ovh.net',
        port: parseInt(process.env.SMTP_PORT || '465', 10),
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      }

      // Check if we're in dev mode (no SMTP credentials)
      const isDev = !process.env.SMTP_USER || !process.env.SMTP_PASS

      // Prepare purchase details
      const purchaseDetails = {
        payerEmail: transaction.payerEmail,
        payerName: transaction.payerName,
        item: transaction.item,
        amount: transaction.amount,
        purchasedAt: transaction.completedAt || new Date(),
        status,
        transactionId: transaction.id,
        tpayTransactionId: transaction.tpayTransactionId,
      }

      // Send notification email
      await sendPzkPurchaseNotificationEmail(purchaseDetails, smtpConfig, isDev)

      console.log('[PzkPurchaseService] Purchase notification email sent', {
        status,
        item: transaction.item,
        to: 'dietoterapia@paulinamaciak.pl, rafalmaciak@gmail.com',
      })
    } catch (error) {
      // Don't throw - email failure shouldn't block purchase
      console.error('[PzkPurchaseService] sendPurchaseNotificationEmail error:', error)
    }
  }

  /**
   * Helper: Map module number → item string
   *
   * @param module - Module number (1 | 2 | 3)
   * @returns Item string ('PZK_MODULE_1', 'PZK_MODULE_2', 'PZK_MODULE_3')
   */
  private getItemFromModule(module: PzkModuleNumber): string {
    return `PZK_MODULE_${module}`
  }

  /**
   * Helper: Parse module number from item string
   *
   * @param item - Item string ('PZK_MODULE_1')
   * @returns Module number (1)
   */
  private getModuleFromItem(item: string): number {
    const match = item.match(/PZK_MODULE_(\d)/)
    if (!match) {
      throw new Error(`Invalid PZK item format: ${item}`)
    }
    return parseInt(match[1], 10)
  }

  /**
   * Helper: Get module price from environment variables
   *
   * @param module - Module number (1 | 2 | 3)
   * @returns Price in PLN
   * @throws Error if price not configured
   */
  private getPriceForModule(module: PzkModuleNumber): number {
    const priceKey = `PZK_MODULE_${module}_PRICE`
    const priceString = process.env[priceKey]

    if (!priceString) {
      throw new Error(`Missing price configuration: ${priceKey}`)
    }

    const price = parseFloat(priceString)
    if (isNaN(price) || price <= 0) {
      throw new Error(`Invalid price for ${priceKey}: ${priceString}`)
    }

    return price
  }

  /**
   * Helper: Get bundle price from environment variables
   *
   * @returns Price in PLN for complete bundle (all 3 modules)
   * @throws Error if price not configured
   */
  private getPriceForBundle(): number {
    const priceKey = 'PZK_BUNDLE_ALL_PRICE'
    const priceString = process.env[priceKey]

    if (!priceString) {
      throw new Error(`Missing price configuration: ${priceKey}`)
    }

    const price = parseFloat(priceString)
    if (isNaN(price) || price <= 0) {
      throw new Error(`Invalid price for ${priceKey}: ${priceString}`)
    }

    return price
  }
}
