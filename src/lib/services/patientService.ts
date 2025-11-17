import { patientRepository } from '../repositories/patientRepository'
import { eventRepository } from '../repositories/eventRepository'
import type { GetPatientsResponse, PatientListItemDTO, OffsetPagination } from '../../types'

/**
 * Service Layer dla logiki biznesowej pacjentów
 *
 * Odpowiedzialności:
 * - Orchestracja operacji pobierania listy pacjentów
 * - Mapowanie danych z repository → DTO dla API
 * - Obliczenie metadanych paginacji (hasMore)
 * - Asynchroniczne logowanie zdarzeń analytics (best-effort)
 */
export class PatientService {
  /**
   * Pobiera listę pacjentów z informacjami operacyjnymi
   *
   * Flow:
   * 1. Pobranie całkowitej liczby pacjentów spełniających kryteria (dla paginacji)
   * 2. Pobranie strony wyników z repository (limit, offset)
   * 3. Mapowanie wyników → PatientListItemDTO
   * 4. Obliczenie hasMore (czy są kolejne strony)
   * 5. Best-effort analytics event (view_patients_list)
   * 6. Zwrot GetPatientsResponse
   *
   * @param params - { status, limit, offset }
   * @param dietitianId - ID dietetyka (dla analytics, opcjonalnie)
   * @returns Promise<GetPatientsResponse> - Lista pacjentów + paginacja
   */
  async getPatientsList(
    params: { status: string; limit: number; offset: number },
    dietitianId?: string
  ): Promise<GetPatientsResponse> {
    try {
      const { status, limit, offset } = params

      // 1. Policz całkowitą liczbę pacjentów
      const total = await patientRepository.countPatients({ status })

      // 2. Pobierz stronę wyników
      const patients = await patientRepository.findPatients({ status, limit, offset })

      // 3. Mapowanie → PatientListItemDTO
      const patientDTOs: PatientListItemDTO[] = patients.map((patient) => ({
        id: patient.id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email,
        age: patient.age,
        gender: patient.gender,
        status: patient.status,
        createdAt: patient.createdAt,
        lastWeightEntry: patient.lastWeightEntry,
        weeklyObligationMet: patient.weeklyObligationMet,
      }))

      // 4. Oblicz hasMore
      const hasMore = offset + patients.length < total

      // 5. Best-effort analytics (nie blokuje odpowiedzi)
      if (dietitianId) {
        eventRepository
          .create({
            userId: dietitianId,
            eventType: 'view_patients_list',
            properties: { status, limit, offset, total },
          })
          .catch((err) => {
            console.error('[PatientService] Failed to log analytics event:', err)
          })
      }

      // 6. Zwróć odpowiedź
      const pagination: OffsetPagination = {
        total,
        limit,
        offset,
        hasMore,
      }

      return {
        patients: patientDTOs,
        pagination,
      }
    } catch (error) {
      console.error('[PatientService] Error getting patients list:', error)
      throw error
    }
  }
}

// Export singleton instance
export const patientService = new PatientService()
