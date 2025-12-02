-- Migration: Hash token columns for security
-- Rename 'token' to 'token_hash' in invitations and password_reset_tokens tables
-- This ensures tokens are stored as SHA-256 hashes instead of plaintext

-- Idempotent: Only rename if 'token' exists and 'token_hash' doesn't exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invitations' AND column_name = 'token'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invitations' AND column_name = 'token_hash'
  ) THEN
    ALTER TABLE "invitations" RENAME COLUMN "token" TO "token_hash";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'password_reset_tokens' AND column_name = 'token'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'password_reset_tokens' AND column_name = 'token_hash'
  ) THEN
    ALTER TABLE "password_reset_tokens" RENAME COLUMN "token" TO "token_hash";
  END IF;
END $$;