import { db } from './index'
import { seedPzk } from './seeds/pzk-seed'

async function main() {
  console.log('🌱 Starting database seeding...\n')

  try {
    // Seed PZK (Przestrzeń Zdrowej Kobiety)
    await seedPzk(db)

    console.log('\n✅ All seeds completed successfully!')
    process.exit(0)
  } catch (error) {
    console.error('\n❌ Seeding failed:', error)
    process.exit(1)
  }
}

main()
