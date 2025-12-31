-- Add index on updated_at DESC for pzk_reviews table
-- This index improves performance for sort=updatedAtDesc queries in GET /api/pzk/reviews

CREATE INDEX "idx_pzk_reviews_updated_at" ON "pzk_reviews" USING btree ("updated_at" DESC);
