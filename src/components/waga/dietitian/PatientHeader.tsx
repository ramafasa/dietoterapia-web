import type { GetPatientDetailsResponse } from '../../../types'
import StatusBadge from './StatusBadge'

type PatientHeaderProps = {
  patient: GetPatientDetailsResponse['patient']
  onChangeStatus: () => void
  onAddWeight: () => void
}

/**
 * Patient Header
 * Displays patient name, email, status badge and action buttons
 */
export default function PatientHeader({
  patient,
  onChangeStatus,
  onAddWeight,
}: PatientHeaderProps) {
  const isEnded = patient.status === 'ended'
  const fullName = `${patient.firstName || ''} ${patient.lastName || ''}`.trim()

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Patient Info */}
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl md:text-3xl font-heading font-bold text-neutral-dark">
              {fullName || 'Nieznany pacjent'}
            </h1>
            <StatusBadge status={patient.status as 'active' | 'paused' | 'ended'} onClick={onChangeStatus} />
          </div>
          <p className="text-neutral-dark/60">{patient.email}</p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={onChangeStatus}
            className="px-4 py-2 rounded-lg border border-neutral-dark/20 text-neutral-dark font-semibold hover:bg-neutral-dark/5 transition-colors"
          >
            Zmień status
          </button>
          <button
            onClick={onAddWeight}
            disabled={isEnded}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              isEnded
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-primary text-white hover:bg-primary/90'
            }`}
            title={isEnded ? 'Nie można dodawać wpisów dla zakończonego pacjenta' : 'Dodaj wpis wagi'}
          >
            Dodaj wagę
          </button>
        </div>
      </div>
    </div>
  )
}
