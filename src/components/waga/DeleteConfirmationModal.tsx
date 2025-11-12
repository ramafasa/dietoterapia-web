import { useState, useCallback } from 'react';
import type { WeightEntryDTO } from '@/types';
import ConfirmModal from '@/components/ui/ConfirmModal';

type DeleteConfirmationModalProps = {
  isOpen: boolean;
  entry: WeightEntryDTO | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
};

export default function DeleteConfirmationModal({
  isOpen,
  entry,
  onClose,
  onDeleted
}: DeleteConfirmationModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = useCallback(async () => {
    if (!entry) return;

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/weight/${entry.id}`, {
        method: 'DELETE',
        headers: {
          Accept: 'application/json'
        }
      });

      if (!response.ok) {
        let errorMessage = 'Nie udało się usunąć wpisu.';

        try {
          const errorBody = await response.json();
          if (errorBody && typeof errorBody.message === 'string') {
            errorMessage = errorBody.message;
          }

          // Handle specific error codes
          if (response.status === 400 && errorBody?.error === 'edit_window_expired') {
            errorMessage = 'Czas na usunięcie tego wpisu już minął.';
          }
        } catch {
          // ignore parsing errors
        }

        throw new Error(errorMessage);
      }

      onDeleted(entry.id);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Wystąpił nieoczekiwany błąd.';
      setError(message);
    } finally {
      setIsDeleting(false);
    }
  }, [entry, onDeleted, onClose]);

  const handleCancel = useCallback(() => {
    if (!isDeleting) {
      setError(null);
      onClose();
    }
  }, [isDeleting, onClose]);

  if (!entry) return null;

  const measurementDate = new Date(entry.measurementDate).toLocaleDateString('pl-PL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // If there's an error, show error modal instead
  if (error) {
    return (
      <ConfirmModal
        isOpen={isOpen}
        title="Wystąpił błąd"
        message={error}
        confirmText="Zamknij"
        cancelText=""
        variant="danger"
        onConfirm={() => {
          setError(null);
          onClose();
        }}
        onCancel={() => {
          setError(null);
          onClose();
        }}
      />
    );
  }

  return (
    <ConfirmModal
      isOpen={isOpen}
      title="Usuń pomiar"
      message={`Czy na pewno chcesz usunąć pomiar z dnia ${measurementDate}? Tej operacji nie można cofnąć.`}
      confirmText={isDeleting ? 'Usuwanie...' : 'Usuń'}
      cancelText="Anuluj"
      variant="danger"
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );
}
