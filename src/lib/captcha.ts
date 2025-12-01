/**
 * Google reCAPTCHA v3 verification
 *
 * Environment variables required:
 * - PUBLIC_RECAPTCHA_SITE_KEY: Public key for frontend
 * - RECAPTCHA_SECRET_KEY: Secret key for backend verification
 */

interface RecaptchaVerifyResponse {
  success: boolean
  score?: number
  action?: string
  challenge_ts?: string
  hostname?: string
  'error-codes'?: string[]
}

interface CaptchaVerifyResult {
  success: boolean
  score?: number
  error?: string
}

const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify'
const DEFAULT_MIN_SCORE = 0.5
const REQUEST_TIMEOUT_MS = 5000

/**
 * Verify reCAPTCHA v3 token
 *
 * @param token - Token from grecaptcha.execute()
 * @param expectedAction - Expected action name (e.g., 'contact_form')
 * @param minScore - Minimum required score (0.0 - 1.0), default 0.5
 * @returns Verification result
 */
export async function verifyCaptcha(
  token: string,
  expectedAction: string,
  minScore: number = DEFAULT_MIN_SCORE
): Promise<CaptchaVerifyResult> {
  const secretKey = import.meta.env.RECAPTCHA_SECRET_KEY

  // Development mode: skip verification (check both Vite and Node.js env)
  const isDev = import.meta.env.DEV || process.env.NODE_ENV === 'development'
  if (isDev) {
    console.log('[DEV MODE] Skipping reCAPTCHA verification')
    return { success: true, score: 1.0 }
  }

  // Check if secret key is configured
  if (!secretKey) {
    console.error('RECAPTCHA_SECRET_KEY not configured')
    return {
      success: false,
      error: 'reCAPTCHA not configured on server'
    }
  }

  // Validate token
  if (!token || token.length < 20) {
    return {
      success: false,
      error: 'Invalid reCAPTCHA token'
    }
  }

  try {
    // Create request body
    const params = new URLSearchParams({
      secret: secretKey,
      response: token,
    })

    // Call Google reCAPTCHA API with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    const response = await fetch(RECAPTCHA_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      console.error('reCAPTCHA API error:', response.status, response.statusText)
      return {
        success: false,
        error: 'reCAPTCHA verification failed'
      }
    }

    const data: RecaptchaVerifyResponse = await response.json()

    // Check if verification succeeded
    if (!data.success) {
      console.warn('reCAPTCHA verification failed:', data['error-codes'])
      return {
        success: false,
        error: `reCAPTCHA verification failed: ${data['error-codes']?.join(', ')}`
      }
    }

    // Verify action matches
    if (data.action !== expectedAction) {
      console.warn(`reCAPTCHA action mismatch: expected "${expectedAction}", got "${data.action}"`)
      return {
        success: false,
        error: 'reCAPTCHA action mismatch'
      }
    }

    // Check score
    const score = data.score ?? 0
    if (score < minScore) {
      console.warn(`reCAPTCHA score too low: ${score} < ${minScore}`)
      return {
        success: false,
        score,
        error: 'reCAPTCHA score too low'
      }
    }

    // Success
    console.log(`✅ reCAPTCHA verified: action="${data.action}", score=${score}`)
    return {
      success: true,
      score
    }

  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error('reCAPTCHA verification timeout')
      return {
        success: false,
        error: 'reCAPTCHA verification timeout'
      }
    }

    console.error('reCAPTCHA verification error:', error)
    return {
      success: false,
      error: 'reCAPTCHA verification error'
    }
  }
}

/**
 * Get reCAPTCHA site key (for frontend)
 * Safe to expose publicly
 */
export function getRecaptchaSiteKey(): string | undefined {
  return import.meta.env.PUBLIC_RECAPTCHA_SITE_KEY
}

/**
 * Check if reCAPTCHA is configured
 */
export function isRecaptchaConfigured(): boolean {
  return !!(import.meta.env.RECAPTCHA_SECRET_KEY && import.meta.env.PUBLIC_RECAPTCHA_SITE_KEY)
}
