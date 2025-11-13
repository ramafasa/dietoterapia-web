import { usePasswordStrength } from '@/hooks/usePasswordStrength'

interface PasswordStrengthIndicatorProps {
  password: string
}

/**
 * Component displaying password strength indicator
 * Shows list of rules with checkmarks and strength bar/label
 */
export default function PasswordStrengthIndicator({ password }: PasswordStrengthIndicatorProps) {
  const { score, rules, label } = usePasswordStrength(password)

  // Color mapping for strength levels
  const getColorClass = () => {
    switch (score) {
      case 0:
      case 1:
        return 'text-red-600 bg-red-100'
      case 2:
        return 'text-orange-600 bg-orange-100'
      case 3:
        return 'text-yellow-600 bg-yellow-100'
      case 4:
        return 'text-green-600 bg-green-100'
    }
  }

  const getBarColorClass = () => {
    switch (score) {
      case 0:
      case 1:
        return 'bg-red-500'
      case 2:
        return 'bg-orange-500'
      case 3:
        return 'bg-yellow-500'
      case 4:
        return 'bg-green-500'
    }
  }

  // Only show indicator if password is not empty
  if (!password) {
    return null
  }

  return (
    <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-3">
      {/* Strength label and bar */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Siła hasła:</span>
          <span className={`text-xs font-semibold px-2 py-1 rounded ${getColorClass()}`}>
            {label}
          </span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${getBarColorClass()}`}
            style={{ width: `${(score / 4) * 100}%` }}
          />
        </div>
      </div>

      {/* Rules checklist */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-600">Wymagania:</p>
        <ul className="space-y-1">
          {rules.map((rule) => (
            <li key={rule.id} className="flex items-center gap-2 text-sm">
              <span
                className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${
                  rule.satisfied ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-500'
                }`}
              >
                {rule.satisfied ? (
                  <svg
                    className="w-3 h-3"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <span className="text-xs">×</span>
                )}
              </span>
              <span
                className={`${rule.satisfied ? 'text-gray-700' : 'text-gray-500'} ${
                  rule.id === 'hasSpecial' ? 'italic' : ''
                }`}
              >
                {rule.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
