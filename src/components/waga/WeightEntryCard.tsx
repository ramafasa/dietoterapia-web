import type { WeightEntryDTO } from '@/types';

type WeightEntryCardProps = {
  entry: WeightEntryDTO;
  previous?: WeightEntryDTO;
};

export default function WeightEntryCard({ entry, previous }: WeightEntryCardProps) {
  const measurementDate = new Date(entry.measurementDate).toLocaleDateString('pl-PL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const delta =
    previous != null ? Number(entry.weight) - Number(previous.weight) : undefined;

  return (
    <article className="bg-neutral-light/70 border border-neutral-light rounded-xl p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-neutral-dark/60 font-medium">{measurementDate}</p>
          <p className="text-2xl font-heading font-bold text-neutral-dark">{entry.weight} kg</p>
        </div>
        {delta != null && (
          <span
            className={`text-sm font-semibold ${
              delta > 0 ? 'text-rose-600' : delta < 0 ? 'text-emerald-600' : 'text-neutral-dark/60'
            }`}
          >
            {delta > 0 ? '+' : ''}
            {delta.toFixed(1)} kg
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {entry.isBackfill && <Badge label="Backfill" variant="info" />}
        {entry.isOutlier && <Badge label="Anomalia" variant="warning" />}
        <Badge label={entry.source === 'dietitian' ? '👩‍⚕️ Dietetyk' : '👤 Pacjent'} variant="neutral" />
      </div>

      {entry.note && (
        <p className="mt-3 text-sm text-neutral-dark/70 border-t border-neutral-light/80 pt-3">
          {entry.note}
        </p>
      )}
    </article>
  );
}

type BadgeProps = {
  label: string;
  variant: 'info' | 'warning' | 'neutral';
};

function Badge({ label, variant }: BadgeProps) {
  const styles: Record<BadgeProps['variant'], string> = {
    info: 'bg-blue-100 text-blue-700',
    warning: 'bg-amber-100 text-amber-700',
    neutral: 'bg-neutral-light/80 text-neutral-dark/70'
  };

  return (
    <span className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full ${styles[variant]}`}>
      {label}
    </span>
  );
}


