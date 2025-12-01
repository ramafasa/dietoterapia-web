import { config } from 'dotenv'
import { resolve } from 'path'
import postgres from 'postgres'
import { randomBytes } from 'crypto'

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') })

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

const sql = postgres(DATABASE_URL, { max: 1 })

async function createInvitation() {
  try {
    // Generate token
    const token = randomBytes(32).toString('hex')
    const email = 'test@example.com'
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now

    // Check if there's a dietitian user
    const dietitians = await sql`
      SELECT id FROM users WHERE role = 'dietitian' LIMIT 1
    `

    let dietitianId = dietitians[0]?.id

    if (!dietitianId) {
      // Create a placeholder dietitian for testing
      const newDietitians = await sql`
        INSERT INTO users (email, password_hash, role, first_name, last_name, status, created_at, updated_at)
        VALUES ('dietitian@test.com', 'placeholder', 'dietitian', 'Test', 'Dietitian', 'active', NOW(), NOW())
        RETURNING id
      `
      dietitianId = newDietitians[0].id
      console.log('Created placeholder dietitian:', dietitianId)
    }

    // Create invitation
    const invitations = await sql`
      INSERT INTO invitations (email, token, created_by, expires_at, created_at)
      VALUES (${email.toLowerCase()}, ${token}, ${dietitianId}, ${expiresAt}, NOW())
      RETURNING *
    `

    const invitation = invitations[0]

    console.log('\n✅ Invitation created successfully!')
    console.log('📧 Email:', invitation.email)
    console.log('🔑 Token:', invitation.token)
    console.log('📅 Expires at:', invitation.expires_at)
    console.log('\n🔗 Registration link:')
    console.log(`http://localhost:4321/auth/signup?token=${invitation.token}`)

    await sql.end()
  } catch (error) {
    console.error('Error creating invitation:', error)
    await sql.end()
    process.exit(1)
  }
}

createInvitation()
