import { useEffect, useRef } from 'react';
import WeightEntryWidget from './WeightEntryWidget';

type AddWeightModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onWeightAdded: () => void;
};

/**
 * AddWeightModal - modal for adding weight entry from history page
 * Wraps WeightEntryWidget in a modal dialog
 */
export default function AddWeightModal({ isOpen, onClose, onWeightAdded }: AddWeightModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Escape handler and body scroll lock
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const handleWeightAdded = () => {
    onWeightAdded();
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-weight-modal-title"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />

      {/* Modal */}
      <div
        ref={modalRef}
        className="relative bg-white rounded-2xl shadow-soft-lg max-w-2xl w-full my-8"
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-dark/60 hover:text-neutral-dark transition-colors z-10"
          aria-label="Zamknij modal"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Content - WeightEntryWidget */}
        <div className="p-6 md:p-8">
          <WeightEntryWidget onSuccess={handleWeightAdded} showSkipButton={false} />
        </div>
      </div>
    </div>
  );
}
