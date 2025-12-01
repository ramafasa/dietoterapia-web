import type { WeightEntryDTO } from '@/types';
import { isWithinEditWindow } from '@/utils/editWindow';

type WeightEntryHistoryCardProps = {
  entry: WeightEntryDTO;
  previous?: WeightEntryDTO;
  onEdit: (entry: WeightEntryDTO) => void;
  onDelete: (entry: WeightEntryDTO) => void;
  onConfirmOutlier: (entry: WeightEntryDTO) => void;
};

export default function WeightEntryHistoryCard({
  entry,
  previous,
  onEdit,
  onDelete,
  onConfirmOutlier
}: WeightEntryHistoryCardProps) {
  const measurementDate = new Date(entry.measurementDate).toLocaleDateString('pl-PL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const delta = previous != null ? Number(entry.weight) - Number(previous.weight) : undefined;

  // Determine available actions
  const canMutate = isWithinEditWindow(entry.measurementDate) && entry.source === 'patient';
  const canConfirmOutlier = entry.isOutlier === true;

  return (
    <article className="bg-neutral-light/70 border border-neutral-light rounded-xl p-4">
      {/* Header: Date + Weight + Delta */}
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

      {/* Badges */}
      <div className="mt-3 flex flex-wrap gap-2">
        {entry.isBackfill && <Badge label="Backfill" variant="info" />}
        {entry.isOutlier && (
          <Badge
            label={entry.outlierConfirmed ? 'Anomalia potwierdzona' : 'Anomalia'}
            variant="warning"
          />
        )}
        <Badge
          label={entry.source === 'dietitian' ? '👩‍⚕️ Dietetyk' : '👤 Pacjent'}
          variant="neutral"
        />
      </div>

      {/* Note */}
      {entry.note && (
        <p className="mt-3 text-sm text-neutral-dark/70 border-t border-neutral-light/80 pt-3">
          {entry.note}
        </p>
      )}

      {/* Action Buttons */}
      {(canMutate || canConfirmOutlier) && (
        <div className="mt-4 pt-4 border-t border-neutral-light/80 flex flex-wrap gap-2">
          {canMutate && (
            <>
              <button
                type="button"
                onClick={() => onEdit(entry)}
                className="px-3 py-1.5 text-xs font-semibold text-primary border border-primary
                         rounded-lg hover:bg-primary hover:text-white transition-colors"
              >
                Edytuj
              </button>
              <button
                type="button"
                onClick={() => onDelete(entry)}
                className="px-3 py-1.5 text-xs font-semibold text-rose-600 border border-rose-600
                         rounded-lg hover:bg-rose-600 hover:text-white transition-colors"
              >
                Usuń
              </button>
            </>
          )}

          {canConfirmOutlier && (
            <button
              type="button"
              onClick={() => onConfirmOutlier(entry)}
              className="px-3 py-1.5 text-xs font-semibold text-amber-700 border border-amber-700
                       rounded-lg hover:bg-amber-700 hover:text-white transition-colors"
            >
              {entry.outlierConfirmed ? 'Cofnij potwierdzenie' : 'Potwierdź anomalię'}
            </button>
          )}
        </div>
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
