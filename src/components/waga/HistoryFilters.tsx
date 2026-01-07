import type { HistoryFiltersVM } from '@/types';

type HistoryFiltersProps = {
  value: HistoryFiltersVM;
  onChange: (next: HistoryFiltersVM) => void;
  isLoading?: boolean;
};

export default function HistoryFilters({ value, onChange, isLoading = false }: HistoryFiltersProps) {
  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStartDate = e.target.value || undefined;
    onChange({ ...value, startDate: newStartDate });
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEndDate = e.target.value || undefined;
    onChange({ ...value, endDate: newEndDate });
  };

  const handleClear = () => {
    onChange({ startDate: undefined, endDate: undefined });
  };

  // Validation: startDate <= endDate
  const hasValidationError =
    value.startDate && value.endDate && value.startDate > value.endDate;

  const hasActiveFilters = value.startDate || value.endDate;

  return (
    <div className="bg-white border border-neutral-light rounded-xl p-4 mb-4">
      <h2 className="text-sm font-heading font-semibold text-neutral-dark mb-3">
        Filtruj według daty
      </h2>

      <div className="flex flex-col sm:flex-row gap-3">
        {/* Start Date */}
        <div className="flex-1">
          <label htmlFor="startDate" className="block text-xs font-medium text-neutral-dark/70 mb-1">
            Od
          </label>
          <input
            type="date"
            id="startDate"
            value={value.startDate || ''}
            onChange={handleStartDateChange}
            disabled={isLoading}
            className="w-full px-3 py-2 border border-neutral-light rounded-lg text-sm
                     focus:outline-none focus:ring-2 focus:ring-primary/50
                     disabled:bg-neutral-light/50 disabled:cursor-not-allowed"
          />
        </div>

        {/* End Date */}
        <div className="flex-1">
          <label htmlFor="endDate" className="block text-xs font-medium text-neutral-dark/70 mb-1">
            Do
          </label>
          <input
            type="date"
            id="endDate"
            value={value.endDate || ''}
            onChange={handleEndDateChange}
            disabled={isLoading}
            className="w-full px-3 py-2 border border-neutral-light rounded-lg text-sm
                     focus:outline-none focus:ring-2 focus:ring-primary/50
                     disabled:bg-neutral-light/50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Clear Button */}
        {hasActiveFilters && (
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleClear}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-semibold text-neutral-dark/70
                       hover:text-primary transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Wyczyść
            </button>
          </div>
        )}
      </div>

      {/* Validation Error */}
      {hasValidationError && (
        <p className="mt-2 text-xs text-rose-600 font-medium">
          Data &ldquo;Od&rdquo; nie może być późniejsza niż data &ldquo;Do&rdquo;
        </p>
      )}
    </div>
  );
}
