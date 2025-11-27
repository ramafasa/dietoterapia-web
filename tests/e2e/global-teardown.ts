/**
 * Playwright Global Teardown
 *
 * This file runs once after all e2e tests complete.
 * It stops and removes the PostgreSQL container created during global setup.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default async function globalTeardown() {
  console.log('\n🧹 Starting E2E Global Teardown...\n')

  try {
    // Read container info saved during setup
    const containerInfoPath = path.join(__dirname, '.container-info.json')

    if (!fs.existsSync(containerInfoPath)) {
      console.log('⚠️  No container info found. Container may have already been stopped.')
      return
    }

    const containerInfo = JSON.parse(fs.readFileSync(containerInfoPath, 'utf-8'))
    const containerId = containerInfo.id

    console.log(`🛑 Stopping PostgreSQL container (ID: ${containerId.substring(0, 12)}...)`)

    // Stop the container using its ID
    // Note: We can't use the StartedPostgreSqlContainer instance directly
    // because this runs in a separate process, so we use Docker commands
    try {
      const { execSync } = await import('child_process')
      execSync(`docker stop ${containerId}`, { stdio: 'ignore' })
      execSync(`docker rm ${containerId}`, { stdio: 'ignore' })
      console.log('✅ PostgreSQL container stopped and removed')
    } catch (dockerError) {
      console.warn('⚠️  Error stopping container via Docker CLI:', dockerError)
      console.log('   Container may have already been stopped')
    }

    // Clean up the container info file
    fs.unlinkSync(containerInfoPath)
    console.log('✅ Container info file cleaned up')

    // Give async cleanup operations time to complete
    await new Promise((resolve) => setTimeout(resolve, 100))

    console.log('\n✅ E2E Global Teardown Complete!\n')
  } catch (error) {
    console.error('❌ E2E Global Teardown Failed:', error)
    // Don't throw - teardown errors shouldn't fail the test run
  }
}
