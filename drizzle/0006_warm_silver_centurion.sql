CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item" varchar(100) NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'PLN' NOT NULL,
	"status" varchar(20) NOT NULL,
	"tpay_transaction_id" varchar(255),
	"tpay_title" varchar(255) NOT NULL,
	"payer_email" varchar(255) NOT NULL,
	"payer_name" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "transactions_tpay_transaction_id_unique" UNIQUE("tpay_transaction_id")
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_transactions_user_id" ON "transactions" USING btree ("user_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX "idx_transactions_status" ON "transactions" USING btree ("status","created_at" DESC);--> statement-breakpoint
CREATE INDEX "idx_transactions_item" ON "transactions" USING btree ("item","created_at" DESC);