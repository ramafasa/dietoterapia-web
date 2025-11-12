import type { WeightEntryDTO } from '@/types';
import WeightEntryCard from '@/components/waga/WeightEntryCard';

type RecentEntriesListProps = {
  entries: WeightEntryDTO[];
  isLoading?: boolean;
  error?: string | null;
};

export default function RecentEntriesList({ entries, isLoading, error }: RecentEntriesListProps) {
  return (
    <section className="bg-white rounded-2xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-heading font-bold text-neutral-dark">Ostatnie pomiary</h2>
        <a
          href="/waga/historia"
          className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          Zobacz wszystkie
        </a>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="animate-pulse">
              <div className="h-20 bg-neutral-light/60 rounded-xl" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-100 text-rose-700 rounded-xl p-6">
          <p className="font-semibold mb-1">Nie udało się pobrać historii pomiarów.</p>
          <p className="text-sm text-rose-600/80">{error}</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-neutral-light/60 rounded-xl p-6 text-center">
          <p className="text-neutral-dark/70">
            Nie masz jeszcze zapisanych pomiarów. Dodaj pierwszy pomiar, aby zobaczyć historię.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {entries.slice(0, 4).map((entry, index) => (
            <WeightEntryCard
              key={entry.id}
              entry={entry}
              previous={index < entries.length - 1 ? entries[index + 1] : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}

