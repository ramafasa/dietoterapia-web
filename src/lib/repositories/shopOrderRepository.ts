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
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { formatOrderNumber } from '@/lib/shop/orderNumber'
import { dbErrorLog } from '@/lib/shop/safeLog'

/**
 * Shop Order Repository (sklep)
 *
 * Responsibilities:
 * - Order numbers (shop_order_number_seq → ZAM-RRRR-NNNNN)
 * - Insert orders, order items and shop transactions (item = 'SHOP_ORDER', userId may be NULL)
 * - Ownership check (products already in a paid order of a user)
 * - Status updates after payment initiation
 * - Status view for the payment success page (one query: order + items + "account exists")
 * - Paid orders (+ items) by e-mail for "Wyślij link ponownie"
 *
 * Errors are logged without Drizzle messages (they carry query params: e-mail, invoice data).
 *
 * Inside db.transaction construct it with the transaction handle (`new ShopOrderRepository(tx)`).
 */
/** Values allowed by chk_shop_orders_status (shop_orders.status is varchar in the schema). */
export type ShopOrderStatus = 'pending' | 'paid' | 'failed' | 'expired'

/** Order fields needed by GET /api/sklep/orders/[id]/status (incl. checkout cookie verification). */
export interface ShopOrderStatusView {
  id: string
  orderNumber: string
  email: string
  userId: string | null
  status: ShopOrderStatus
  totalAmount: string
  checkoutSecretHash: string | null
  confirmationSentAt: Date | null
  anonymizedAt: Date | null
  createdAt: Date
  items: { id: string; title: string }[]
  /** A user with the order's e-mail exists (case-insensitive, any role). */
  accountExists: boolean
}

/** Paid order with its items ("Wyślij link ponownie"). */
export interface ShopOrderWithItems {
  order: ShopOrder
  items: ShopOrderItem[]
}

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
      console.error('[ShopOrderRepository] Error getting next order number:', dbErrorLog(error))
      throw error
    }
  }

  async insertOrder(values: NewShopOrder): Promise<ShopOrder> {
    try {
      const [order] = await this.db.insert(shopOrders).values(values).returning()
      return order
    } catch (error) {
      console.error('[ShopOrderRepository] Error inserting order:', dbErrorLog(error))
      throw error
    }
  }

  async insertItems(values: NewShopOrderItem[]): Promise<ShopOrderItem[]> {
    if (values.length === 0) return []
    try {
      return await this.db.insert(shopOrderItems).values(values).returning()
    } catch (error) {
      console.error('[ShopOrderRepository] Error inserting order items:', dbErrorLog(error))
      throw error
    }
  }

  async insertTransaction(values: NewTransaction): Promise<Transaction> {
    try {
      const [transaction] = await this.db.insert(transactions).values(values).returning()
      return transaction
    } catch (error) {
      console.error('[ShopOrderRepository] Error inserting transaction:', dbErrorLog(error))
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
      console.error('[ShopOrderRepository] Error finding owned products:', { userId, ...dbErrorLog(error) })
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
      console.error('[ShopOrderRepository] Error setting Tpay transaction id:', { transactionId, ...dbErrorLog(error) })
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
      console.error('[ShopOrderRepository] Error marking payment init failed:', {
        orderId,
        transactionId,
        ...dbErrorLog(error),
      })
      throw error
    }
  }

  /** Full order row by id (null when missing). Callers validate the uuid first. */
  async findById(orderId: string): Promise<ShopOrder | null> {
    try {
      const [order] = await this.db.select().from(shopOrders).where(eq(shopOrders.id, orderId)).limit(1)
      return order ?? null
    } catch (error) {
      console.error('[ShopOrderRepository] Error loading order:', { orderId, ...dbErrorLog(error) })
      throw error
    }
  }

  /**
   * Order + items + whether an account with the order's e-mail exists – one round trip
   * (items as a json_agg subquery, account as EXISTS). null when the order does not exist.
   */
  async findStatusView(orderId: string): Promise<ShopOrderStatusView | null> {
    try {
      const [row] = await this.db
        .select({
          id: shopOrders.id,
          orderNumber: shopOrders.orderNumber,
          email: shopOrders.email,
          userId: shopOrders.userId,
          status: shopOrders.status,
          totalAmount: shopOrders.totalAmount,
          checkoutSecretHash: shopOrders.checkoutSecretHash,
          confirmationSentAt: shopOrders.confirmationSentAt,
          anonymizedAt: shopOrders.anonymizedAt,
          createdAt: shopOrders.createdAt,
          // Kwalifikowane nazwy wpisane ręcznie: w select Drizzle renderuje ${kolumna} bez tabeli,
          // co w podzapytaniu wiązałoby się z niewłaściwą tabelą (np. "email" = "email").
          items: sql<{ id: string; title: string }[]>`coalesce((
            select json_agg(json_build_object('id', soi.id, 'title', soi.title_snapshot) order by soi.title_snapshot, soi.id)
            from shop_order_items soi
            where soi.order_id = "shop_orders"."id"
          ), '[]'::json)`,
          accountExists: sql<boolean>`exists(
            select 1 from users u where lower(u.email) = lower("shop_orders"."email")
          )`,
        })
        .from(shopOrders)
        .where(eq(shopOrders.id, orderId))
        .limit(1)
      // status: varchar w schemacie, wartości gwarantuje CHECK chk_shop_orders_status
      return (row as ShopOrderStatusView | undefined) ?? null
    } catch (error) {
      console.error('[ShopOrderRepository] Error loading order status view:', { orderId, ...dbErrorLog(error) })
      throw error
    }
  }

  /**
   * Paid (status 'paid'), non-anonymised orders with this e-mail (case-insensitive), any userId –
   * also after the account was deleted (decision 15). Newest first; items ordered by title.
   * Two queries (orders, then items by order ids). Empty array when there are none.
   */
  async findPaidOrdersWithItemsByEmail(email: string): Promise<ShopOrderWithItems[]> {
    const normalized = email.trim().toLowerCase()
    try {
      const orders = await this.db
        .select()
        .from(shopOrders)
        .where(
          and(
            sql`lower(${shopOrders.email}) = ${normalized}`,
            eq(shopOrders.status, 'paid'),
            isNull(shopOrders.anonymizedAt)
          )
        )
        .orderBy(desc(sql`coalesce(${shopOrders.paidAt}, ${shopOrders.createdAt})`), desc(shopOrders.createdAt))
      if (orders.length === 0) return []

      const items = await this.db
        .select()
        .from(shopOrderItems)
        .where(
          inArray(
            shopOrderItems.orderId,
            orders.map((o) => o.id)
          )
        )
        .orderBy(asc(shopOrderItems.titleSnapshot), asc(shopOrderItems.id))

      return orders.map((order) => ({ order, items: items.filter((i) => i.orderId === order.id) }))
    } catch (error) {
      // bez e-maila w logu
      console.error('[ShopOrderRepository] Error loading paid orders by e-mail:', dbErrorLog(error))
      throw error
    }
  }
}
