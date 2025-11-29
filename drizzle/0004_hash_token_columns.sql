-- Migration: Hash token columns for security
-- Rename 'token' to 'token_hash' in invitations and password_reset_tokens tables
-- This migration preserves existing data but tokens will need to be regenerated

ALTER TABLE "invitations" RENAME COLUMN "token" TO "token_hash";

ALTER TABLE "password_reset_tokens" RENAME COLUMN "token" TO "token_hash";
