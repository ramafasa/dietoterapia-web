import WeightEntryWidget from '@/components/waga/WeightEntryWidget';
import RecentEntriesList from '@/components/waga/RecentEntriesList';
import { useWeightHistory } from '@/hooks/useWeightHistory';

type WeightDashboardProps = {
  firstName: string;
};

export default function WeightDashboard({ firstName }: WeightDashboardProps) {
  const { entries, isLoading, error, reload } = useWeightHistory({ limit: 4 });

  return (
    <div className="min-h-screen bg-neutral-light">
      <div className="container mx-auto px-4 max-w-6xl pt-12 pb-24">
        <header className="mb-10">
          <h1 className="text-4xl font-heading font-bold text-neutral-dark mb-2">
            Witaj, {firstName}! 👋
          </h1>
          <p className="text-lg text-neutral-dark/70">
            Monitoruj swoją wagę i dodawaj nowe pomiary.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-8">
          <div className="space-y-8">
            <WeightEntryWidget onSuccess={reload} showSkipButton={false} />
          </div>

          <aside className="lg:sticky lg:top-24 flex flex-col gap-8">
            <RecentEntriesList entries={entries} isLoading={isLoading} error={error} />

            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h2 className="text-xl font-heading font-semibold text-neutral-dark mb-2">
                Statystyki (wkrótce)
              </h2>
              <p className="text-neutral-dark/70 text-sm">
                W tym miejscu pojawią się szczegółowe statystyki twoich pomiarów.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

