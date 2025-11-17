import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import InvitationStatusBadge from './InvitationStatusBadge'
import ResendInvitationButton from './ResendInvitationButton'
import type {
  GetInvitationsResponse,
  InvitationListItemDTO,
  ApiError,
} from '@/types'

interface InvitationsListProps {
  initialData?: GetInvitationsResponse
  pageSize?: number
  onRefreshReady?: (refresh: () => void) => void
}

/**
 * InvitationsList - Lista zaproszeń z paginacją
 *
 * Features:
 * - Tabela z kolumnami: Email, Status, Created, Expires, Actions
 * - Paginacja offsetowa (Previous/Next)
 * - Akcja "Wyślij ponownie" (ResendInvitationButton)
 * - Loading states i error handling
 * - Puste stany (brak zaproszeń)
 */
export default function InvitationsList({
  initialData,
  pageSize = 50,
  onRefreshReady,
}: InvitationsListProps) {
  const [invitations, setInvitations] = useState<InvitationListItemDTO[]>(
    initialData?.invitations || []
  )
  const [pagination, setPagination] = useState({
    total: initialData?.pagination.total || 0,
    limit: initialData?.pagination.limit || pageSize,
    offset: initialData?.pagination.offset || 0,
    hasMore: initialData?.pagination.hasMore || false,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Oblicz numer strony (1-based)
  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1
  const totalPages = Math.ceil(pagination.total / pagination.limit)

  /**
   * Fetch invitations from API
   */
  const fetchInvitations = async (offset: number) => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/dietitian/invitations?limit=${pageSize}&offset=${offset}`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )

      if (response.ok) {
        const data = (await response.json()) as GetInvitationsResponse
        setInvitations(data.invitations)
        setPagination(data.pagination)
      } else if (response.status === 401) {
        toast.error('Sesja wygasła. Zaloguj się ponownie.')
        setTimeout(() => {
          window.location.href = '/logowanie'
        }, 2000)
      } else {
        const apiError = (await response.json()) as ApiError
        setError(apiError.message || 'Nie udało się pobrać listy zaproszeń')
        toast.error('Nie udało się pobrać listy zaproszeń')
      }
    } catch (err) {
      console.error('Error fetching invitations:', err)
      setError('Błąd połączenia z serwerem')
      toast.error('Błąd połączenia z serwerem')
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Handle page change
   */
  const handlePageChange = (direction: 'next' | 'prev') => {
    const newOffset =
      direction === 'next'
        ? pagination.offset + pagination.limit
        : pagination.offset - pagination.limit

    if (newOffset >= 0 && newOffset < pagination.total) {
      fetchInvitations(newOffset)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  /**
   * Handle successful resend - update invitation in list
   */
  const handleResendSuccess = (updated: InvitationListItemDTO) => {
    setInvitations((prev) =>
      prev.map((inv) => (inv.id === updated.id ? updated : inv))
    )
  }

  /**
   * Refresh list (called from parent after creating new invitation)
   */
  const refreshList = () => {
    fetchInvitations(0) // Reset to page 1
  }

  // Expose refreshList to parent via callback
  useEffect(() => {
    if (onRefreshReady) {
      onRefreshReady(refreshList)
    }
  }, [onRefreshReady])

  /**
   * Format date to Polish locale
   */
  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date
    return d.toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Empty state - no invitations
  if (!isLoading && invitations.length === 0 && !error) {
    return (
      <div className="text-center py-12">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">
          Brak zaproszeń
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          Wyślij pierwsze zaproszenie, aby rozpocząć pracę z pacjentem.
        </p>
      </div>
    )
  }

  // Error state
  if (error && !isLoading) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-4">
          <svg
            className="mx-auto h-12 w-12"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h3 className="mt-2 text-sm font-medium text-gray-900">
          Wystąpił błąd
        </h3>
        <p className="mt-1 text-sm text-gray-500">{error}</p>
        <button
          onClick={() => fetchInvitations(pagination.offset)}
          className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:bg-primary/90"
        >
          Spróbuj ponownie
        </button>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-xl font-heading font-semibold text-neutral-dark mb-4">
        Historia zaproszeń
      </h2>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Email
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Status
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Utworzono
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Wygasa
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Akcje
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {isLoading ? (
              // Loading skeleton
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-6 py-4">
                    <div className="h-4 bg-gray-200 rounded animate-pulse" />
                  </td>
                  <td className="px-6 py-4">
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-20" />
                  </td>
                  <td className="px-6 py-4">
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-32" />
                  </td>
                  <td className="px-6 py-4">
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-32" />
                  </td>
                  <td className="px-6 py-4">
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-24 ml-auto" />
                  </td>
                </tr>
              ))
            ) : (
              invitations.map((invitation) => (
                <tr key={invitation.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {invitation.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <InvitationStatusBadge status={invitation.status} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(invitation.createdAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(invitation.expiresAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <ResendInvitationButton
                      invitationId={invitation.id}
                      email={invitation.email}
                      onSuccess={handleResendSuccess}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <nav
          aria-label="Paginacja zaproszeń"
          className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200"
        >
          {/* Info */}
          <div className="text-sm text-gray-700">
            Strona <span className="font-medium">{currentPage}</span> z{' '}
            <span className="font-medium">{totalPages}</span> (łącznie{' '}
            <span className="font-medium">{pagination.total}</span> zaproszeń)
          </div>

          {/* Buttons */}
          <div className="flex space-x-2">
            <button
              onClick={() => handlePageChange('prev')}
              disabled={pagination.offset === 0}
              className={`
                px-4 py-2 text-sm font-medium rounded-md
                transition-colors duration-200
                ${
                  pagination.offset === 0
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-primary text-white hover:bg-primary/90'
                }
              `}
              aria-label="Poprzednia strona"
            >
              Poprzednia
            </button>
            <button
              onClick={() => handlePageChange('next')}
              disabled={!pagination.hasMore}
              className={`
                px-4 py-2 text-sm font-medium rounded-md
                transition-colors duration-200
                ${
                  !pagination.hasMore
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-primary text-white hover:bg-primary/90'
                }
              `}
              aria-label="Następna strona"
            >
              Następna
            </button>
          </div>
        </nav>
      )}
    </div>
  )
}
