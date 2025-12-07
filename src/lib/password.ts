import bcrypt from 'bcrypt'

const SALT_ROUNDS = 8 // Optimized for serverless (Vercel) - ~4x faster than 10, still secure

// ===== v1 (legacy) - zostaw dla kompatybilności =====

/**
 * @deprecated Używaj hashPasswordV2 dla nowych implementacji
 */
export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, SALT_ROUNDS)
}

/**
 * @deprecated Używaj verifyPasswordV2 dla nowych implementacji
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash)
}

// ===== v2 (client-side SHA-256 + bcrypt) =====

/**
 * Hashuje SHA-256 hash hasła za pomocą bcrypt (v2 - double hashing)
 *
 * Frontend wysyła SHA-256 hash (64-char hex string)
 * Backend hashuje ten hash za pomocą bcrypt
 *
 * @param sha256Hash - SHA-256 hash od frontendu (64 hex chars)
 * @returns bcrypt hash (60 chars, format: $2b$10$...)
 * @throws Error jeśli sha256Hash ma nieprawidłowy format
 *
 * @example
 * const frontendHash = "a1b2c3..." // 64 chars from frontend
 * const dbHash = await hashPasswordV2(frontendHash)
 * // Returns: "$2b$10$abc..."
 */
export async function hashPasswordV2(sha256Hash: string): Promise<string> {
  validateSHA256Hash(sha256Hash)
  return await bcrypt.hash(sha256Hash, SALT_ROUNDS)
}

/**
 * Weryfikuje SHA-256 hash hasła z bcrypt hash z DB (v2)
 *
 * @param sha256Hash - SHA-256 hash od frontendu (64 hex chars)
 * @param bcryptHash - bcrypt hash z DB (60 chars)
 * @returns true jeśli hasło jest poprawne
 * @throws Error jeśli sha256Hash ma nieprawidłowy format
 *
 * @example
 * const isValid = await verifyPasswordV2(frontendHash, user.passwordHash)
 */
export async function verifyPasswordV2(
  sha256Hash: string,
  bcryptHash: string
): Promise<boolean> {
  validateSHA256Hash(sha256Hash)
  return await bcrypt.compare(sha256Hash, bcryptHash)
}

/**
 * Waliduje format SHA-256 hash (64-char lowercase hex)
 *
 * @param hash - String do walidacji
 * @throws Error jeśli nieprawidłowy format
 */
function validateSHA256Hash(hash: string): void {
  if (typeof hash !== 'string') {
    throw new Error('SHA-256 hash must be a string')
  }

  if (hash.length !== 64) {
    throw new Error(
      `Invalid SHA-256 hash length: expected 64 chars, got ${hash.length}`
    )
  }

  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error(
      'Invalid SHA-256 hash format: must be lowercase hexadecimal (a-f0-9)'
    )
  }
}
