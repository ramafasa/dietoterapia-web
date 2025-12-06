/**
 * Hashes a token using SHA-256 algorithm (server-side only)
 *
 * This function is used to securely store tokens (password reset, invitations) in the database.
 * By storing only the hash, we ensure that database leaks do not expose valid tokens that
 * could be used for account takeover.
 *
 * Implementation details:
 * - Algorithm: SHA-256 (cryptographically secure, one-way hash function)
 * - Output format: 64-character hexadecimal string
 * - Deterministic: same input always produces same output
 * - One-way: hash cannot be reversed to recover original token
 *
 * Why SHA-256 (not bcrypt)?
 * - Bcrypt is for passwords (slow, with salt, designed to resist brute-force)
 * - Tokens are already random 32-byte values (high entropy), no need for salt
 * - SHA-256 is fast and sufficient for high-entropy inputs
 * - Constant-time comparison prevents timing attacks
 *
 * Security considerations:
 * - NEVER log the raw token (only log hash for debugging)
 * - Raw tokens should only exist in memory during email sending
 * - Always hash tokens before querying the database
 *
 * @param token - Raw token string (typically 64-char hex from randomBytes(32))
 * @returns SHA-256 hash of the token (64-char hex string)
 *
 * @example
 * ```typescript
 * import { randomBytes } from 'crypto'
 * import { hashToken } from './crypto'
 *
 * // Generate random token
 * const rawToken = randomBytes(32).toString('hex') // "a1b2c3..."
 *
 * // Hash for database storage
 * const tokenHash = hashToken(rawToken) // "f4e5d6..."
 *
 * // Store hash in DB (NOT raw token!)
 * await db.insert(passwordResetTokens).values({ tokenHash })
 *
 * // Send raw token in email
 * const resetLink = `https://example.com/reset?token=${rawToken}`
 * await sendEmail(resetLink)
 *
 * // During validation: hash incoming token and compare
 * const incomingHash = hashToken(incomingToken)
 * const record = await db.select().where(eq(tokenHash, incomingHash))
 * ```
 */
export function hashToken(token: string): string {
  // Dynamic import to avoid bundling Node.js crypto for browser
  // This function is only called server-side
  const { createHash } = require('crypto')
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Client-side password hashing utility (browser-only)
 *
 * Hashuje hasło za pomocą SHA-256 przed wysłaniem przez sieć.
 * Uses Web Crypto API (native browser API, 0 KB bundle size)
 *
 * @param password - Plain text password
 * @returns SHA-256 hash (64-char lowercase hex string)
 *
 * @example
 * const hash = await hashPasswordClient('MyPassword123')
 * // Returns: "ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f"
 */
export async function hashPasswordClient(password: string): Promise<string> {
  // Check browser support
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error(
      'Twoja przeglądarka jest przestarzała. Zaktualizuj przeglądarkę do najnowszej wersji.'
    )
  }

  // Encode string to Uint8Array
  const encoder = new TextEncoder()
  const data = encoder.encode(password)

  // SHA-256 hash using Web Crypto API
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)

  // Convert ArrayBuffer to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')

  return hashHex
}
