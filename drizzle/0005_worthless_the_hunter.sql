CREATE TABLE "pzk_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"label" varchar(160) NOT NULL,
	"description" text,
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pzk_categories_slug_unique" UNIQUE("slug"),
	CONSTRAINT "pzk_categories_display_order_unique" UNIQUE("display_order")
);
--> statement-breakpoint
CREATE TABLE "pzk_material_pdfs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"file_name" varchar(255),
	"content_type" varchar(100),
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pzk_material_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" uuid NOT NULL,
	"youtube_video_id" varchar(32) NOT NULL,
	"title" varchar(200),
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pzk_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module" integer NOT NULL,
	"category_id" uuid NOT NULL,
	"status" varchar(20) NOT NULL,
	"order" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"content_md" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pzk_module_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"module" integer NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pzk_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pzk_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pzk_material_pdfs" ADD CONSTRAINT "pzk_material_pdfs_material_id_pzk_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."pzk_materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pzk_material_videos" ADD CONSTRAINT "pzk_material_videos_material_id_pzk_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."pzk_materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pzk_materials" ADD CONSTRAINT "pzk_materials_category_id_pzk_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."pzk_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pzk_module_access" ADD CONSTRAINT "pzk_module_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pzk_notes" ADD CONSTRAINT "pzk_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pzk_notes" ADD CONSTRAINT "pzk_notes_material_id_pzk_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."pzk_materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pzk_reviews" ADD CONSTRAINT "pzk_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pzk_material_pdfs_material_order" ON "pzk_material_pdfs" USING btree ("material_id","display_order");--> statement-breakpoint
CREATE INDEX "idx_pzk_material_pdfs_material" ON "pzk_material_pdfs" USING btree ("material_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pzk_material_videos_material_order" ON "pzk_material_videos" USING btree ("material_id","display_order");--> statement-breakpoint
CREATE INDEX "idx_pzk_material_videos_material" ON "pzk_material_videos" USING btree ("material_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pzk_materials_module_category_order" ON "pzk_materials" USING btree ("module","category_id","order");--> statement-breakpoint
CREATE INDEX "idx_pzk_materials_status_module" ON "pzk_materials" USING btree ("status","module","category_id","order");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pzk_module_access_user_module_start" ON "pzk_module_access" USING btree ("user_id","module","start_at");--> statement-breakpoint
CREATE INDEX "idx_pzk_module_access_user_expires" ON "pzk_module_access" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pzk_notes_user_material" ON "pzk_notes" USING btree ("user_id","material_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pzk_reviews_user" ON "pzk_reviews" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_pzk_reviews_created_at" ON "pzk_reviews" USING btree ("created_at" DESC);--> statement-breakpoint
CREATE INDEX "idx_events_event_type_timestamp" ON "events" USING btree ("event_type","timestamp" DESC);--> statement-breakpoint

-- ===== CHECK CONSTRAINTS (not supported natively by Drizzle ORM) =====

-- pzk_categories: display_order > 0
ALTER TABLE "pzk_categories" ADD CONSTRAINT "chk_pzk_categories_display_order" CHECK (display_order > 0);--> statement-breakpoint

-- pzk_materials: module IN (1,2,3), status IN (...), order > 0
ALTER TABLE "pzk_materials" ADD CONSTRAINT "chk_pzk_materials_module" CHECK (module IN (1,2,3));--> statement-breakpoint
ALTER TABLE "pzk_materials" ADD CONSTRAINT "chk_pzk_materials_status" CHECK (status IN ('draft','published','archived','publish_soon'));--> statement-breakpoint
ALTER TABLE "pzk_materials" ADD CONSTRAINT "chk_pzk_materials_order" CHECK ("order" > 0);--> statement-breakpoint

-- pzk_material_pdfs: display_order > 0
ALTER TABLE "pzk_material_pdfs" ADD CONSTRAINT "chk_pzk_material_pdfs_display_order" CHECK (display_order > 0);--> statement-breakpoint

-- pzk_material_videos: display_order > 0
ALTER TABLE "pzk_material_videos" ADD CONSTRAINT "chk_pzk_material_videos_display_order" CHECK (display_order > 0);--> statement-breakpoint

-- pzk_module_access: module IN (1,2,3), expires_at > start_at
ALTER TABLE "pzk_module_access" ADD CONSTRAINT "chk_pzk_module_access_module" CHECK (module IN (1,2,3));--> statement-breakpoint
ALTER TABLE "pzk_module_access" ADD CONSTRAINT "chk_pzk_module_access_expires" CHECK (expires_at > start_at);--> statement-breakpoint

-- pzk_reviews: rating BETWEEN 1 AND 6
ALTER TABLE "pzk_reviews" ADD CONSTRAINT "chk_pzk_reviews_rating" CHECK (rating BETWEEN 1 AND 6);