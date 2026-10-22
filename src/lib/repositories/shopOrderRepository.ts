import type { Database } from '@/db'
import {
  shopOrderItems,
  shopOrders,
  transactions,
  type NewShopOrder,
  type NewShopOrderItem,
  type NewTransaction,
  type ShopOrder,
  type ShopOrderItem,
  type Transaction,
} from '@/db/schema'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { formatOrderNumber } from '@/lib/shop/orderNumber'

/**
 * Shop Order Repository (sklep)
 *
 * Responsibilities:
 * - Order numbers (shop_order_number_seq → ZAM-RRRR-NNNNN)
 * - Insert orders, order items and shop transactions (item = 'SHOP_ORDER', userId may be NULL)
 * - Ownership check (products already in a paid order of a user)
 * - Status updates after payment initiation
 *
 * Inside db.transaction construct it with the transaction handle (`new ShopOrderRepository(tx)`).
 */
export class ShopOrderRepository {
  constructor(private db: Database) {}

  /** Next order number from the global sequence, year by Europe/Warsaw at `at`. */
  async nextOrderNumber(at: Date): Promise<string> {
    try {
      const [row] = await this.db.execute<{ n: string }>(
        sql`select nextval('shop_order_number_seq')::text as n`
      )
      return formatOrderNumber(row.n, at)
    } catch (error) {
      console.error('[ShopOrderRepository] Error getting next order number:', error)
      throw error
    }
  }

  async insertOrder(values: NewShopOrder): Promise<ShopOrder> {
    try {
      const [order] = await this.db.insert(shopOrders).values(values).returning()
      return order
    } catch (error) {
      console.error('[ShopOrderRepository] Error inserting order')
      throw error
    }
  }

  async insertItems(values: NewShopOrderItem[]): Promise<ShopOrderItem[]> {
    if (values.length === 0) return []
    try {
      return await this.db.insert(shopOrderItems).values(values).returning()
    } catch (error) {
      console.error('[ShopOrderRepository] Error inserting order items:', error)
      throw error
    }
  }

  async insertTransaction(values: NewTransaction): Promise<Transaction> {
    try {
      const [transaction] = await this.db.insert(transactions).values(values).returning()
      return transaction
    } catch (error) {
      console.error('[ShopOrderRepository] Error inserting transaction:', error)
      throw error
    }
  }

  /**
   * Which of `productIds` the user already owns (item of an order with status 'paid' and this userId).
   */
  async findOwnedProductIds(userId: string, productIds: string[]): Promise<string[]> {
    if (productIds.length === 0) return []
    try {
      const rows = await this.db
        .selectDistinct({ productId: shopOrderItems.productId })
        .from(shopOrderItems)
        .innerJoin(shopOrders, eq(shopOrderItems.orderId, shopOrders.id))
        .where(
          and(
            eq(shopOrders.userId, userId),
            eq(shopOrders.status, 'paid'),
            inArray(shopOrderItems.productId, productIds)
          )
        )
      return rows.map((r) => r.productId)
    } catch (error) {
      console.error('[ShopOrderRepository] Error finding owned products:', error)
      throw error
    }
  }

  /** Link our transaction with Tpay's transaction id (after successful payment initiation). */
  async setTpayTransactionId(transactionId: string, tpayTransactionId: string, now: Date = new Date()): Promise<void> {
    try {
      await this.db
        .update(transactions)
        .set({ tpayTransactionId, updatedAt: now })
        .where(eq(transactions.id, transactionId))
    } catch (error) {
      console.error('[ShopOrderRepository] Error setting Tpay transaction id:', error)
      throw error
    }
  }

  /** Payment could not be initiated: transaction and order → 'failed' (atomically). */
  async markPaymentInitFailed(orderId: string, transactionId: string, now: Date = new Date()): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        await tx
          .update(transactions)
          .set({ status: 'failed', completedAt: now, updatedAt: now })
          .where(eq(transactions.id, transactionId))
        await tx
          .update(shopOrders)
          .set({ status: 'failed', updatedAt: now })
          .where(eq(shopOrders.id, orderId))
      })
    } catch (error) {
      console.error('[ShopOrderRepository] Error marking payment init failed:', error)
      throw error
    }
  }
}
