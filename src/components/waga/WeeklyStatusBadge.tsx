import type { WeightEntryDTO } from '@/types';

type WeeklyStatusBadgeProps = {
  entries: WeightEntryDTO[];
  isLoading?: boolean;
  error?: string | null;
};

export default function WeeklyStatusBadge({ entries, isLoading, error }: WeeklyStatusBadgeProps) {
  const hasEntries = entries.length > 0;

  return (
    <section className="bg-white rounded-2xl shadow-lg p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-neutral-dark/60 font-semibold">
            Obowiązek tygodniowy
          </p>
          <h2 className="text-2xl font-heading font-bold text-neutral-dark mt-1">
            {isLoading
              ? 'Ładowanie...'
              : error
              ? 'Nie udało się pobrać danych'
              : hasEntries
              ? 'Świetna robota!'
              : 'Dodaj pierwszy wpis'}
          </h2>
          <p className={`mt-2 ${error ? 'text-rose-600' : 'text-neutral-dark/70'}`}>
            {isLoading
              ? 'Sprawdzamy twoje wpisy z ostatniego tygodnia.'
              : error
              ? error
              : hasEntries
              ? 'Na podstawie ostatnich wpisów ocenimy, czy obowiązek został spełniony.'
              : 'Zacznij od dodania swojej aktualnej wagi.'}
          </p>
        </div>
        <div className="flex-shrink-0">
          <span
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${
              error
                ? 'bg-rose-100 text-rose-700'
                : hasEntries
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-amber-100 text-amber-700'
            }`}
          >
            {error ? '⚠️ Błąd' : hasEntries ? '✅ W trakcie oceny' : '⏳ Oczekuje na wpis'}
          </span>
        </div>
      </div>
    </section>
  );
}

