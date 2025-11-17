import { useState } from 'react'
import { Toaster } from 'react-hot-toast'
import { usePatientDetails } from '../../../hooks/dietitian/usePatientDetails'
import PatientHeader from './PatientHeader'
import PatientStats from './PatientStats'
import WeightChart from './WeightChart'
import WeightHistoryTabs from './WeightHistoryTabs'
import ChangeStatusModal from './ChangeStatusModal'
import AddWeightForPatientModal from './AddWeightForPatientModal'

type PatientDetailsPageProps = {
  patientId: string
}

export default function PatientDetailsPage({ patientId }: PatientDetailsPageProps) {
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false)
  const [isAddWeightModalOpen, setIsAddWeightModalOpen] = useState(false)

  // Fetch patient details
  const { data: patientDetails, isLoading, error, refetch } = usePatientDetails(patientId)

  // Handle successful mutations
  const handleMutationSuccess = () => {
    refetch()
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-light py-8 px-4 md:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary"></div>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-neutral-light py-8 px-4 md:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-12 text-center">
            <h1 className="text-2xl font-heading font-bold text-red-800 mb-4">
              Wystąpił błąd
            </h1>
            <p className="text-red-600 mb-6">{error}</p>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => refetch()}
                className="px-6 py-3 rounded-lg bg-primary text-white font-semibold hover:bg-primary/90 transition-colors"
              >
                Spróbuj ponownie
              </button>
              <a
                href="/dietetyk/dashboard"
                className="px-6 py-3 rounded-lg border border-neutral-dark/20 text-neutral-dark font-semibold hover:bg-neutral-dark/5 transition-colors"
              >
                Wróć do listy
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // No data state (shouldn't happen if error is handled properly)
  if (!patientDetails) {
    return null
  }

  return (
    <>
      <Toaster position="top-right" />
      <div className="min-h-screen bg-neutral-light py-8 px-4 md:px-6">
        <div className="max-w-7xl mx-auto">
        {/* Patient Header */}
        <PatientHeader
          patient={patientDetails.patient}
          onChangeStatus={() => setIsStatusModalOpen(true)}
          onAddWeight={() => setIsAddWeightModalOpen(true)}
        />

        {/* Patient Statistics */}
        <PatientStats statistics={patientDetails.statistics} />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Chart */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <WeightChart patientId={patientId} defaultPeriod={30} />
          </div>

          {/* Right Column - History */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-heading font-semibold text-neutral-dark mb-4">
              Historia wpisów
            </h2>
            <WeightHistoryTabs patientId={patientId} defaultView="week" />
          </div>
        </div>

        {/* Modals */}
        <ChangeStatusModal
          isOpen={isStatusModalOpen}
          onClose={() => setIsStatusModalOpen(false)}
          patientId={patientId}
          currentStatus={patientDetails.patient.status}
          onSuccess={handleMutationSuccess}
        />

        <AddWeightForPatientModal
          isOpen={isAddWeightModalOpen}
          onClose={() => setIsAddWeightModalOpen(false)}
          patientId={patientId}
          onSuccess={handleMutationSuccess}
        />
        </div>
      </div>
    </>
  )
}
