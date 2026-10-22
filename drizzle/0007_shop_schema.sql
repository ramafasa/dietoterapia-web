CREATE TABLE "product_price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"type" varchar(20) NOT NULL,
	"title" varchar(255) NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'PLN' NOT NULL,
	"status" varchar(20) NOT NULL,
	"file_object_key" varchar(500) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "shop_account_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_account_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "shop_download_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_download_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "shop_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"title_snapshot" varchar(255) NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"file_object_key" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "shop_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" varchar(20) NOT NULL,
	"email" varchar(255) NOT NULL,
	"first_name" varchar(100),
	"user_id" uuid,
	"status" varchar(20) NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'PLN' NOT NULL,
	"invoice_requested" boolean DEFAULT false NOT NULL,
	"invoice_company_name" varchar(255),
	"invoice_nip" varchar(10),
	"invoice_address" text,
	"terms_version" varchar(20) NOT NULL,
	"terms_accepted_at" timestamp with time zone NOT NULL,
	"digital_content_consent_at" timestamp with time zone NOT NULL,
	"digital_content_consent_text" text NOT NULL,
	"checkout_secret_hash" varchar(64),
	"confirmation_sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"anonymized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "shop_order_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "product_price_history" ADD CONSTRAINT "product_price_history_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_download_tokens" ADD CONSTRAINT "shop_download_tokens_order_id_shop_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."shop_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_order_id_shop_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."shop_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_product_price_history_product" ON "product_price_history" USING btree ("product_id","valid_from" DESC);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_shop_order_items_order_product" ON "shop_order_items" USING btree ("order_id","product_id");--> statement-breakpoint
CREATE INDEX "idx_shop_orders_email" ON "shop_orders" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_shop_orders_user_id" ON "shop_orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_shop_orders_status_created" ON "shop_orders" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_shop_order_id_shop_orders_id_fk" FOREIGN KEY ("shop_order_id") REFERENCES "public"."shop_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- ===== SHOP: SEQUENCE + BACKFILL + CHECK CONSTRAINTS (not supported natively by Drizzle ORM) =====
CREATE SEQUENCE IF NOT EXISTS shop_order_number_seq START 1;
--> statement-breakpoint
UPDATE "users" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_status_check" CHECK ("status" IN ('draft','active','archived'));
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_type_check" CHECK ("type" IN ('ebook'));
--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_status_check" CHECK ("status" IN ('pending','paid','failed','expired'));
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("role" IN ('patient','dietitian','customer'));
