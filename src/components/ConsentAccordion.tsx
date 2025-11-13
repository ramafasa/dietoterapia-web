import { useState } from 'react'

/**
 * Single consent item with type, text, and acceptance state
 */
export interface ConsentItemVM {
  type: 'data_processing' | 'health_data' | string
  text: string
  accepted: boolean
  required: boolean
  expanded?: boolean
}

interface ConsentAccordionProps {
  items: ConsentItemVM[]
  onChange: (items: ConsentItemVM[]) => void
}

/**
 * ConsentAccordion Component
 *
 * Displays RODO consents with expandable content and checkboxes.
 * Manages state of individual consent items.
 *
 * Required consents: data_processing, health_data
 */
export default function ConsentAccordion({ items, onChange }: ConsentAccordionProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  const toggleExpanded = (type: string) => {
    const newExpanded = new Set(expandedItems)
    if (newExpanded.has(type)) {
      newExpanded.delete(type)
    } else {
      newExpanded.add(type)
    }
    setExpandedItems(newExpanded)
  }

  const handleCheckboxChange = (type: string, checked: boolean) => {
    const updatedItems = items.map((item) =>
      item.type === type ? { ...item, accepted: checked } : item
    )
    onChange(updatedItems)
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-heading font-semibold text-neutral-dark mb-4">
        Zgody RODO
      </h3>

      <div className="space-y-3">
        {items.map((item) => {
          const isExpanded = expandedItems.has(item.type)

          return (
            <div
              key={item.type}
              className="border border-gray-300 rounded-lg overflow-hidden"
            >
              {/* Accordion header */}
              <div className="bg-gray-50 p-4">
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    id={`consent-${item.type}`}
                    checked={item.accepted}
                    onChange={(e) => handleCheckboxChange(item.type, e.target.checked)}
                    className="mt-1 w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary focus:ring-2"
                    aria-required={item.required}
                  />

                  {/* Label and expand button */}
                  <div className="flex-1 min-w-0">
                    <label
                      htmlFor={`consent-${item.type}`}
                      className="text-sm font-medium text-neutral-dark cursor-pointer"
                    >
                      {getConsentTitle(item.type)}
                      {item.required && (
                        <span className="text-red-600 ml-1" aria-label="wymagane">
                          *
                        </span>
                      )}
                    </label>

                    {/* Expand/collapse button */}
                    <button
                      type="button"
                      onClick={() => toggleExpanded(item.type)}
                      className="mt-1 text-xs text-primary hover:text-primary/80 underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
                      aria-expanded={isExpanded}
                      aria-controls={`consent-content-${item.type}`}
                    >
                      {isExpanded ? 'Zwiń treść' : 'Rozwiń treść'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Accordion content */}
              {isExpanded && (
                <div
                  id={`consent-content-${item.type}`}
                  className="p-4 bg-white border-t border-gray-200"
                >
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.text}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Helper text for required consents */}
      <p className="text-xs text-gray-600 mt-4">
        <span className="text-red-600">*</span> Zgody wymagane do utworzenia konta
      </p>
    </div>
  )
}

/**
 * Helper function to get consent title by type
 */
function getConsentTitle(type: string): string {
  switch (type) {
    case 'data_processing':
      return 'Zgoda na przetwarzanie danych osobowych'
    case 'health_data':
      return 'Zgoda na przetwarzanie danych zdrowotnych'
    default:
      return 'Zgoda opcjonalna'
  }
}
