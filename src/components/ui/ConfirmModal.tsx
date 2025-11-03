import { useEffect, useRef } from 'react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'warning' | 'danger' | 'info';
}

/**
 * ConfirmModal - uniwersalny modal potwierdzenia akcji
 * - Ikona ostrzeżenia u góry
 * - Akcent na przycisk "Cancel" (zachęca do pozostania)
 * - Bez animacji (natychmiastowe pojawienie)
 * - Zamykanie tylko przez przyciski (nie przez backdrop)
 * - Focus trap + Escape handler
 */
export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
  variant = 'warning',
}: ConfirmModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Focus trap + Escape handler
  useEffect(() => {
    if (!isOpen) return;

    // Focus na przycisk "Anuluj" przy otwarciu
    cancelButtonRef.current?.focus();

    // Handler dla klawisza Escape
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    // Focus trap - tab/shift+tab tylko między przyciskami w modalu
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusableElements = [cancelButtonRef.current, confirmButtonRef.current].filter(Boolean);
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        // Shift + Tab - cofanie
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        // Tab - przechodzenie dalej
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('keydown', handleTab);

    // Blokada scrollowania body gdy modal otwarty
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('keydown', handleTab);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  // Wybór ikony w zależności od wariantu
  const getIcon = () => {
    switch (variant) {
      case 'warning':
        return (
          <svg
            className="w-16 h-16 text-accent"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        );
      case 'danger':
        return (
          <svg
            className="w-16 h-16 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        );
      case 'info':
        return (
          <svg
            className="w-16 h-16 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      aria-describedby="modal-description"
    >
      {/* Backdrop - ciemne tło bez blur */}
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />

      {/* Modal */}
      <div
        ref={modalRef}
        className="relative bg-white rounded-2xl shadow-soft-lg max-w-md w-full p-8"
      >
        {/* Ikona */}
        <div className="flex justify-center mb-6">{getIcon()}</div>

        {/* Tytuł */}
        <h2
          id="modal-title"
          className="font-heading font-bold text-xl text-neutral-dark text-center mb-4"
        >
          {title}
        </h2>

        {/* Tekst */}
        <p
          id="modal-description"
          className="font-body text-gray-600 text-center mb-8"
        >
          {message}
        </p>

        {/* Przyciski */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Przycisk "Anuluj" - primary (akcent na pozostanie) */}
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            className="flex-1 bg-primary text-white font-body font-semibold py-3 px-6 rounded-lg hover:bg-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2"
          >
            {cancelText}
          </button>

          {/* Przycisk "Potwierdź" - secondary/outline */}
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            className="flex-1 bg-transparent text-neutral-dark font-body font-semibold py-3 px-6 rounded-lg border-2 border-gray-300 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400/50 focus:ring-offset-2"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
