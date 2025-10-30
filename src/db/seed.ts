import { db } from './index'
import { users } from './schema'
import { hashPassword } from '@/lib/password'
import { eq } from 'drizzle-orm'

async function seed() {
  console.log('🌱 Seeding database...')

  // Konto dietetyka (Paulina)
  let dietitian = await db.query.users.findFirst({
    where: eq(users.email, 'dietoterapia@paulinamaciak.pl'),
  })

  if (!dietitian) {
    const dietitianPasswordHash = await hashPassword('TymczasoweHaslo123!')

    const [created] = await db
      .insert(users)
      .values({
        email: 'dietoterapia@paulinamaciak.pl',
        passwordHash: dietitianPasswordHash,
        role: 'dietitian',
        firstName: 'Paulina',
        lastName: 'Maciak',
        status: 'active',
      })
      .returning()

    dietitian = created

    console.log('✅ Dietitian account created:', dietitian.email)
    console.log('   Email: dietoterapia@paulinamaciak.pl')
    console.log('   Password: TymczasoweHaslo123!')
  } else {
    console.log('ℹ️  Dietitian account already exists:', dietitian.email)
  }
  console.log('')

  // Konto pacjenta testowego
  let patient = await db.query.users.findFirst({
    where: eq(users.email, 'rafalmaciak+diet@gmail.com'),
  })

  if (!patient) {
    const patientPasswordHash = await hashPassword('ramafasa112')

    const [created] = await db
      .insert(users)
      .values({
        email: 'rafalmaciak+diet@gmail.com',
        passwordHash: patientPasswordHash,
        role: 'patient',
        firstName: 'Rafał',
        lastName: 'Maciak',
        status: 'active',
      })
      .returning()

    patient = created

    console.log('✅ Patient account created:', patient.email)
    console.log('   Email: rafalmaciak+diet@gmail.com')
    console.log('   Password: ramafasa112')
  } else {
    console.log('ℹ️  Patient account already exists:', patient.email)
  }
  console.log('')
  console.log('⚠️  WAŻNE: To są konta testowe. Zmień hasła w środowisku produkcyjnym!')

  process.exit(0)
}

seed().catch((error) => {
  console.error('❌ Seed failed:', error)
  process.exit(1)
})
