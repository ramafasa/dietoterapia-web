import { useCallback, useEffect, useState } from 'react';
import { useInfiniteWeightHistory } from '@/hooks/useInfiniteWeightHistory';
import type { HistoryFiltersVM, WeightEntryDTO } from '@/types';
import HistoryFilters from './HistoryFilters';
import WeightEntryList from './WeightEntryList';
import EditWeightModal from './EditWeightModal';
import DeleteConfirmationModal from './DeleteConfirmationModal';
import toast from 'react-hot-toast';

type WeightHistoryViewProps = {
  firstName?: string;
};

export default function WeightHistoryView({ firstName = 'Pacjencie' }: WeightHistoryViewProps) {
  // Filters state (synced with URL query params)
  const [filters, setFilters] = useState<HistoryFiltersVM>({
    startDate: undefined,
    endDate: undefined
  });

  // Modals state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedEntryForEdit, setSelectedEntryForEdit] = useState<WeightEntryDTO | null>(null);
  const [selectedEntryForDelete, setSelectedEntryForDelete] = useState<WeightEntryDTO | null>(null);

  // Infinite scroll hook
  const {
    entries,
    previousById,
    hasMore,
    isLoading,
    error,
    loadNextPage,
    updateEntry,
    removeEntry
  } = useInfiniteWeightHistory({
    filters,
    pageSize: 30
  });

  // Sync filters with URL query params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const startDate = params.get('startDate') || undefined;
    const endDate = params.get('endDate') || undefined;

    if (startDate || endDate) {
      setFilters({ startDate, endDate });
    }
  }, []);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();

    if (filters.startDate) {
      params.set('startDate', filters.startDate);
    }

    if (filters.endDate) {
      params.set('endDate', filters.endDate);
    }

    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;

    window.history.replaceState({}, '', newUrl);
  }, [filters]);

  // Handlers
  const handleFilterChange = useCallback((next: HistoryFiltersVM) => {
    // Validate: startDate <= endDate
    if (next.startDate && next.endDate && next.startDate > next.endDate) {
      return; // Ignore invalid filter change
    }

    setFilters(next);
  }, []);

  const handleEdit = useCallback((entry: WeightEntryDTO) => {
    setSelectedEntryForEdit(entry);
    setEditModalOpen(true);
  }, []);

  const handleDelete = useCallback((entry: WeightEntryDTO) => {
    setSelectedEntryForDelete(entry);
    setDeleteModalOpen(true);
  }, []);

  const handleEditSaved = useCallback(
    (updated: WeightEntryDTO) => {
      updateEntry(updated.id, updated);
      toast.success('Pomiar zaktualizowany');
      setEditModalOpen(false);
      setSelectedEntryForEdit(null);
    },
    [updateEntry]
  );

  const handleDeleted = useCallback(
    (id: string) => {
      removeEntry(id);
      toast.success('Pomiar usunięty');
      setDeleteModalOpen(false);
      setSelectedEntryForDelete(null);
    },
    [removeEntry]
  );

  const handleCloseEditModal = useCallback(() => {
    setEditModalOpen(false);
    setSelectedEntryForEdit(null);
  }, []);

  const handleCloseDeleteModal = useCallback(() => {
    setDeleteModalOpen(false);
    setSelectedEntryForDelete(null);
  }, []);

  const handleConfirmOutlier = useCallback(async (entry: WeightEntryDTO) => {
    const confirmed = !entry.outlierConfirmed; // Toggle

    try {
      const response = await fetch(`/api/weight/${entry.id}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({ confirmed })
      });

      if (!response.ok) {
        let errorMessage = 'Nie udało się potwierdzić anomalii.';

        try {
          const errorBody = await response.json();
          if (errorBody && typeof errorBody.message === 'string') {
            errorMessage = errorBody.message;
          }
        } catch {
          // ignore parsing errors
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();
      updateEntry(entry.id, data.entry);

      toast.success(confirmed ? 'Anomalia potwierdzona' : 'Cofnięto potwierdzenie anomalii');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Wystąpił nieoczekiwany błąd.';
      toast.error(message);
    }
  }, [updateEntry]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-light/50 to-white">
      {/* Header */}
      <header className="bg-white border-b border-neutral-light">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <h1 className="text-2xl font-heading font-bold text-neutral-dark">
            Historia Pomiarów
          </h1>
          <p className="text-sm text-neutral-dark/60 mt-1">
            Witaj, {firstName}! Przeglądaj pełną historię swoich pomiarów wagi.
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-6 py-6">
        {/* Filters */}
        <HistoryFilters value={filters} onChange={handleFilterChange} isLoading={isLoading} />

        {/* Entry List */}
        <WeightEntryList
          entries={entries}
          previousById={previousById}
          hasMore={hasMore}
          isLoading={isLoading}
          error={error}
          onLoadMore={loadNextPage}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onConfirmOutlier={handleConfirmOutlier}
        />
      </main>

      {/* Modals */}
      <EditWeightModal
        isOpen={editModalOpen}
        entry={selectedEntryForEdit}
        onClose={handleCloseEditModal}
        onSaved={handleEditSaved}
      />

      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        entry={selectedEntryForDelete}
        onClose={handleCloseDeleteModal}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
