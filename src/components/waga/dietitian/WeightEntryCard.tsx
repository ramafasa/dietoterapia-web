import type { WeightEntryDTO } from '../../../types'

type WeightEntryCardProps = {
  entry: WeightEntryDTO
}

/**
 * Weight Entry Card
 * Displays single weight entry with badges (source, backfill, outlier)
 */
export default function WeightEntryCard({ entry }: WeightEntryCardProps) {
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('pl-PL', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  }

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('pl-PL', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const sourceLabelMap = {
    patient: 'Pacjent',
    dietitian: 'Dietetyk',
  }

  return (
    <div className="bg-white border border-neutral-dark/10 rounded-lg p-4 hover:shadow-md transition-shadow">
      {/* Date and Weight */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm text-neutral-dark/60 mb-1">
            {formatDate(entry.measurementDate)}
          </p>
          <p className="text-2xl font-heading font-bold text-neutral-dark">
            {entry.weight} kg
          </p>
        </div>
        <p className="text-xs text-neutral-dark/40">
          Dodano: {formatTime(entry.createdAt)}
        </p>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {/* Source Badge */}
        <span
          className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${
            entry.source === 'dietitian'
              ? 'bg-blue-100 text-blue-800'
              : 'bg-gray-100 text-gray-800'
          }`}
        >
          {sourceLabelMap[entry.source]}
        </span>

        {/* Backfill Badge */}
        {entry.isBackfill && (
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-orange-100 text-orange-800">
            Uzupełniony
          </span>
        )}

        {/* Outlier Badge */}
        {entry.isOutlier && (
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-red-100 text-red-800">
            Anomalia
          </span>
        )}
      </div>

      {/* Note */}
      {entry.note && (
        <div className="bg-neutral-light rounded p-3 border-l-4 border-primary">
          <p className="text-sm text-neutral-dark/80 italic">
            {entry.note}
          </p>
        </div>
      )}
    </div>
  )
}
