interface ErrorAlertProps {
  message: string
  onRetry?: () => void
}

/**
 * Error Alert
 * Displays error message with optional retry button
 */
export default function ErrorAlert({ message, onRetry }: ErrorAlertProps) {
  return (
    <div
      className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-4">
        {/* Error Icon */}
        <div className="flex-shrink-0">
          <svg
            className="w-6 h-6 text-red-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1">
          <h3 className="text-red-800 font-semibold mb-1">Wystąpił błąd</h3>
          <p className="text-red-700">{message}</p>

          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-4 text-sm text-red-800 font-semibold underline hover:no-underline focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 rounded"
            >
              Spróbuj ponownie
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
