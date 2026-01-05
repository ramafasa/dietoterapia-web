/**
 * Transaction Service (Generic)
 *
 * Generic CRUD service for transactions table.
 * Product-agnostic - works for PZK modules, consultations, meal plans, etc.
 *
 * Responsibilities:
 * - Create/read/update transactions in database
 * - Map DB records to DTOs
 * - Business logic validation (duplicates, status transitions)
 */

import type { Database } from '@/db'
import { transactions, type Transaction, type NewTransaction } from '@/db/schema'
import { eq, and, desc } from 'drizzle-orm'

// ===== TYPES =====

export interface CreateTransactionParams {
  userId: string
  item: string // Generic product identifier (e.g., 'PZK_MODULE_1', 'CONSULTATION_30MIN')
  amount: number // Amount in PLN
  payerEmail: string
  payerName?: string
  tpayTitle: string // Description for Tpay (e.g., "PZK Moduł 1")
}

export type TransactionStatus = 'pending' | 'success' | 'failed' | 'cancelled'

// ===== TRANSACTION SERVICE =====

export class TransactionService {
  constructor(private db: Database) {}

  /**
   * Create a new transaction (status: pending)
   *
   * @param params - Transaction parameters
   * @returns Created transaction record
   *
   * @example
   * const transaction = await transactionService.createTransaction({
   *   userId: 'user-uuid',
   *   item: 'PZK_MODULE_1',
   *   amount: 299.00,
   *   payerEmail: 'user@example.com',
   *   payerName: 'Jan Kowalski',
   *   tpayTitle: 'PZK Moduł 1'
   * })
   */
  async createTransaction(params: CreateTransactionParams): Promise<Transaction> {
    try {
      const newTransaction: NewTransaction = {
        userId: params.userId,
        item: params.item,
        amount: params.amount.toFixed(2), // Store as string with 2 decimal places
        currency: 'PLN',
        status: 'pending',
        tpayTransactionId: null, // Will be set after Tpay API call
        tpayTitle: params.tpayTitle,
        payerEmail: params.payerEmail,
        payerName: params.payerName || null,
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
      }

      const [transaction] = await this.db
        .insert(transactions)
        .values(newTransaction)
        .returning()

      console.log('[TransactionService] Created transaction:', {
        id: transaction.id,
        item: transaction.item,
        amount: transaction.amount,
        status: transaction.status,
      })

      return transaction
    } catch (error) {
      console.error('[TransactionService] createTransaction error:', error)
      throw error
    }
  }

  /**
   * Update transaction status
   *
   * @param transactionId - Transaction UUID
   * @param status - New status ('success' | 'failed' | 'cancelled')
   * @param tpayTransactionId - Optional Tpay transaction ID to store
   *
   * @example
   * await transactionService.updateTransactionStatus(
   *   'transaction-uuid',
   *   'success',
   *   'TR-XXX-YYY-ZZZ'
   * )
   */
  async updateTransactionStatus(
    transactionId: string,
    status: Exclude<TransactionStatus, 'pending'>,
    tpayTransactionId?: string
  ): Promise<void> {
    try {
      const updates: Partial<Transaction> = {
        status,
        updatedAt: new Date(),
        completedAt: new Date(),
        ...(tpayTransactionId && { tpayTransactionId }),
      }

      await this.db
        .update(transactions)
        .set(updates)
        .where(eq(transactions.id, transactionId))

      console.log('[TransactionService] Updated transaction status:', {
        id: transactionId,
        status,
        tpayTransactionId,
      })
    } catch (error) {
      console.error('[TransactionService] updateTransactionStatus error:', error)
      throw error
    }
  }

  /**
   * Get transaction by ID
   *
   * @param transactionId - Transaction UUID
   * @returns Transaction record or null if not found
   */
  async getTransactionById(transactionId: string): Promise<Transaction | null> {
    try {
      const [transaction] = await this.db
        .select()
        .from(transactions)
        .where(eq(transactions.id, transactionId))
        .limit(1)

      return transaction || null
    } catch (error) {
      console.error('[TransactionService] getTransactionById error:', error)
      throw error
    }
  }

  /**
   * Get all transactions for a user (sorted by date DESC)
   *
   * @param userId - User UUID
   * @returns List of transactions
   */
  async getUserTransactions(userId: string): Promise<Transaction[]> {
    try {
      const userTransactions = await this.db
        .select()
        .from(transactions)
        .where(eq(transactions.userId, userId))
        .orderBy(desc(transactions.createdAt))

      return userTransactions
    } catch (error) {
      console.error('[TransactionService] getUserTransactions error:', error)
      throw error
    }
  }

  /**
   * Check if user has a pending transaction for a specific item
   *
   * Useful to prevent duplicate purchases while a payment is in progress.
   *
   * @param userId - User UUID
   * @param item - Product identifier (e.g., 'PZK_MODULE_1')
   * @returns true if pending transaction exists, false otherwise
   */
  async hasPendingTransaction(userId: string, item: string): Promise<boolean> {
    try {
      const [pendingTransaction] = await this.db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.item, item),
            eq(transactions.status, 'pending')
          )
        )
        .limit(1)

      return !!pendingTransaction
    } catch (error) {
      console.error('[TransactionService] hasPendingTransaction error:', error)
      throw error
    }
  }

  /**
   * Update Tpay transaction ID
   *
   * Called after successful Tpay API call to link our transaction with Tpay's ID.
   *
   * @param transactionId - Our transaction UUID
   * @param tpayTransactionId - Tpay transaction ID (e.g., "TR-XXX-YYY")
   */
  async updateTpayTransactionId(
    transactionId: string,
    tpayTransactionId: string
  ): Promise<void> {
    try {
      await this.db
        .update(transactions)
        .set({
          tpayTransactionId,
          updatedAt: new Date(),
        })
        .where(eq(transactions.id, transactionId))

      console.log('[TransactionService] Updated Tpay transaction ID:', {
        id: transactionId,
        tpayTransactionId,
      })
    } catch (error) {
      console.error('[TransactionService] updateTpayTransactionId error:', error)
      throw error
    }
  }
}
