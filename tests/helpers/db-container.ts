import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as schema from '@/db/schema';
import type { Database } from '@/db';

let container: StartedPostgreSqlContainer | null = null;
let db: Database | null = null;
let sql: ReturnType<typeof postgres> | null = null;

/**
 * Start a PostgreSQL container for testing
 * This should be called once per test suite in beforeAll
 */
export async function startTestDatabase(): Promise<{ db: Database; container: StartedPostgreSqlContainer }> {
  if (container && db) {
    return { db, container };
  }

  console.log('🐳 Starting PostgreSQL container...');
  
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('test_db')
    .withUsername('test_user')
    .withPassword('test_password')
    .start();

  const connectionString = container.getConnectionUri();
  
  // Create connection
  sql = postgres(connectionString, { max: 1 });
  db = drizzle(sql, { schema });

  // Run migrations
  console.log('🔄 Running migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('✅ Database ready');

  return { db, container };
}

/**
 * Stop the PostgreSQL container
 * This should be called once per test suite in afterAll
 */
export async function stopTestDatabase() {
  try {
    if (sql) {
      // Close SQL connection with timeout
      await sql.end({ timeout: 5 });
      sql = null;
    }
  } catch (error) {
    // Suppress SQL connection close errors (e.g., from ssh2 crypto cleanup)
    console.warn('Warning: Error closing SQL connection:', error);
  }

  try {
    if (container) {
      console.log('🛑 Stopping PostgreSQL container...');
      await container.stop();
      container = null;
      db = null;
    }
  } catch (error) {
    // Suppress container stop errors
    console.warn('Warning: Error stopping container:', error);
    container = null;
    db = null;
  }

  // Give async cleanup operations time to complete
  // This helps prevent unhandled rejections from ssh2 crypto cleanup
  await new Promise(resolve => setTimeout(resolve, 100));
}

/**
 * Clean all tables in the database
 * This should be called in beforeEach to ensure test isolation
 */
export async function cleanDatabase(database: Database) {
  // Delete in order to respect foreign key constraints
  // audit_log references users, so it must be deleted first
  await database.delete(schema.auditLog);
  await database.delete(schema.events);
  await database.delete(schema.passwordResetTokens);
  await database.delete(schema.sessions);
  await database.delete(schema.weightEntries);
  await database.delete(schema.consents);
  await database.delete(schema.invitations);
  await database.delete(schema.pushSubscriptions);
  await database.delete(schema.users);
}

/**
 * Get the current test database instance
 */
export function getTestDatabase(): Database {
  if (!db) {
    throw new Error('Test database not initialized. Call startTestDatabase() first.');
  }
  return db;
}

