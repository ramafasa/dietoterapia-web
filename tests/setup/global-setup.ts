import { config } from 'dotenv';
import path from 'path';
import { existsSync } from 'fs';

export default async function setup() {
  // Load test environment variables if .env.test exists
  const envTestPath = path.resolve(__dirname, '../../.env.test');
  
  if (existsSync(envTestPath)) {
    config({ path: envTestPath });
    console.log('🧪 Loaded .env.test');
  } else {
    console.log('⚠️  .env.test not found, using default test environment');
    // Set default test environment variables
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    process.env.LUCIA_SESSION_SECRET = 'test-session-secret-key-for-testing-only-min-32-chars';
  }
  
  console.log('🧪 Global test setup complete');
}

