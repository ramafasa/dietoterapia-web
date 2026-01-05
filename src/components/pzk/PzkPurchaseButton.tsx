/**
 * PZK Purchase Button Component
 *
 * Interactive button for initiating PZK module purchase.
 * Handles authentication check, purchase initiation, and redirects.
 *
 * Flow:
 * 1. User clicks button
 * 2. Check authentication status
 * 3. If not logged in → redirect to /logowanie with return URL
 * 4. If logged in → call /api/pzk/purchase/initiate
 * 5. Handle response:
 *    - 409 (already has access) → redirect to /pacjent/pzk/katalog
 *    - 200 (success) → redirect to Tpay payment form
 *    - Error → show toast error
 */

import { useState } from 'react'
import type { PzkModuleNumber } from '@/types/pzk-dto'

interface Props {
  module: PzkModuleNumber // 1 | 2 | 3
  label: string // Button text (e.g., "Kup moduł 1")
  className?: string // Optional custom classes
}

export default function PzkPurchaseButton({ module, label, className }: Props) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePurchase = async () => {
    setIsLoading(true)
    setError(null)

    try {
      // 1. Check authentication status
      const authResponse = await fetch('/api/auth/session')

      if (authResponse.status === 401) {
        // Not logged in → redirect to login with return URL
        const returnUrl = encodeURIComponent(`/api/pzk/purchase/initiate?module=${module}`)
        window.location.href = `/logowanie?redirect=${returnUrl}`
        return
      }

      // 2. Initiate purchase
      const response = await fetch('/api/pzk/purchase/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ module }),
      })

      const data = await response.json()

      // 3. Handle responses
      if (response.status === 409) {
        // Already has access → redirect to catalog
        window.location.href = data.error.details?.redirectUrl || '/pacjent/pzk/katalog'
        return
      }

      if (!response.ok) {
        // Error → show message
        throw new Error(data.error?.message || 'Błąd inicjalizacji płatności')
      }

      // 4. Success → redirect to Tpay payment form
      window.location.href = data.data.redirectUrl
    } catch (err) {
      console.error('[PzkPurchaseButton] Error:', err)
      setError(
        err instanceof Error
          ? err.message
          : 'Wystąpił błąd. Spróbuj ponownie.'
      )
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handlePurchase}
        disabled={isLoading}
        className={
          className ||
          'btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed'
        }
        aria-label={label}
      >
        {isLoading ? 'Przekierowywanie...' : label}
      </button>

      {error && (
        <p
          className="text-sm text-red-600 text-center"
          role="alert"
          aria-live="polite"
        >
          {error}
        </p>
      )}
    </div>
  )
}
