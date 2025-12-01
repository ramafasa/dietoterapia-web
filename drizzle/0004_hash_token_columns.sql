-- Migration: Hash token columns for security
-- Rename 'token' to 'token_hash' in invitations and password_reset_tokens tables
-- This ensures tokens are stored as SHA-256 hashes instead of plaintext

ALTER TABLE "invitations" RENAME COLUMN "token" TO "token_hash";
ALTER TABLE "password_reset_tokens" RENAME COLUMN "token" TO "token_hash";