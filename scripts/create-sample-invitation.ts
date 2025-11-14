/**
 * Skrypt do tworzenia przykładowego zaproszenia w bazie danych (development only)
 *
 * Usage: npx tsx scripts/create-sample-invitation.ts
 */

import { db } from '../src/db/index'
import { invitations, users } from '../src/db/schema'
import { randomBytes } from 'crypto'
import { addDays } from 'date-fns'
import { eq } from 'drizzle-orm'

async function createSampleInvitation() {
  try {
    // 1. Sprawdź czy istnieje dietetyk w bazie (potrzebny do createdBy)
    const [dietitian] = await db
      .select()
      .from(users)
      .where(eq(users.role, 'dietitian'))
      .limit(1)

    let dietitianId: string

    if (!dietitian) {
      console.log('⚠️  Brak dietetyka w bazie. Tworzę przykładowego dietetyka...')

      // Utwórz przykładowego dietetyka
      const [newDietitian] = await db
        .insert(users)
        .values({
          email: 'dietitian@example.com',
          passwordHash: '$2a$10$dummyHashForTestingOnly1234567890', // Dummy hash
          role: 'dietitian',
          firstName: 'Paulina',
          lastName: 'Maciak',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning()

      dietitianId = newDietitian.id
      console.log('✅ Utworzono przykładowego dietetyka:', newDietitian.email)
    } else {
      dietitianId = dietitian.id
      console.log('✅ Znaleziono dietetyka:', dietitian.email)
    }

    // 2. Wygeneruj unikalny token
    const token = randomBytes(32).toString('hex')

    // 3. Ustaw datę wygaśnięcia (+7 dni)
    const expiresAt = addDays(new Date(), 7)

    // 4. Email pacjenta (przykładowy)
    const patientEmail = 'pacjent@example.com'

    // 5. Utwórz zaproszenie
    const [invitation] = await db
      .insert(invitations)
      .values({
        email: patientEmail,
        token,
        createdBy: dietitianId,
        expiresAt,
        createdAt: new Date(),
      })
      .returning()

    // 6. Wyświetl wyniki
    console.log('\n✅ Utworzono przykładowe zaproszenie!\n')
    console.log('📧 Email:', invitation.email)
    console.log('🔑 Token:', invitation.token)
    console.log('⏰ Wygasa:', invitation.expiresAt.toISOString())
    console.log('\n🔗 Link do rejestracji (localhost):')
    console.log(`   http://localhost:4321/auth/signup?token=${invitation.token}`)
    console.log('\n🔗 Link do walidacji tokenu (API):')
    console.log(`   http://localhost:4321/api/invitations/${invitation.token}`)
    console.log('\n📋 Testowy curl do walidacji:')
    console.log(`   curl -s http://localhost:4321/api/invitations/${invitation.token} | jq`)
    console.log('\n')

    process.exit(0)
  } catch (error) {
    console.error('❌ Błąd podczas tworzenia zaproszenia:', error)
    process.exit(1)
  }
}

createSampleInvitation()
