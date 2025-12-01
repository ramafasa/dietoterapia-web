import { useRef } from 'react'
import InvitationForm from './InvitationForm'
import InvitationsList from './InvitationsList'
import type { GetInvitationsResponse, CreateInvitationResponse } from '@/types'

interface InvitationsPageAppProps {
  initialData?: GetInvitationsResponse
}

/**
 * InvitationsPageApp - Wrapper component dla strony zaproszeń
 *
 * Zarządza komunikacją między InvitationForm i InvitationsList:
 * - Po wysłaniu nowego zaproszenia (onSuccess) → odśwież listę
 */
export default function InvitationsPageApp({ initialData }: InvitationsPageAppProps) {
  // Ref do funkcji refresh listy
  const refreshListRef = useRef<(() => void) | null>(null)

  // Handler sukcesu wysłania zaproszenia
  const handleInvitationSuccess = (invitation: CreateInvitationResponse['invitation']) => {
    // Wywołaj refresh listy (jeśli dostępny)
    if (refreshListRef.current) {
      refreshListRef.current()
    }
  }

  return (
    <>
      {/* Invitation Form Section */}
      <section className="bg-white rounded-lg shadow-sm p-6 mb-8">
        <InvitationForm onSuccess={handleInvitationSuccess} />
      </section>

      {/* Invitations List Section */}
      <section className="bg-white rounded-lg shadow-sm p-6">
        <InvitationsList
          initialData={initialData}
          onRefreshReady={(refresh) => {
            refreshListRef.current = refresh
          }}
        />
      </section>
    </>
  )
}
