import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  // Disable automatic .env file loading to avoid permission issues
  envDir: './tests',
  envPrefix: 'TEST_',
  test: {
    // Environment - using happy-dom for better ESM compatibility
    environment: 'happy-dom',

    // Global setup and teardown
    globalSetup: './tests/setup/global-setup.ts',
    setupFiles: ['./tests/setup/test-setup.ts'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.config.*',
        '**/*.d.ts',
        '**/types.ts',
        'src/env.d.ts',
        'scripts/',
        'drizzle/',
      ],
      // Coverage thresholds (adjust as needed)
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
    
    // Test patterns
    include: [
      'tests/unit/**/*.test.{ts,tsx}',
      'tests/integration/**/*.test.{ts,tsx}',
    ],
    
    // Globals (optional, but useful for cleaner test syntax)
    globals: true,
    
    // Test timeout
    testTimeout: 10000,

    // Hooks timeout
    hookTimeout: 30000, // 30 seconds for container startup

    // Retry failed tests
    retry: 0,

    // Parallel execution
    // Run integration tests sequentially to avoid race conditions with Testcontainers
    // fileParallelism: false,
    pool: 'threads',
    
    // Silent console logs during tests (set to false for debugging)
    silent: false,
    
    // Reporter
    reporters: ['verbose'],
  },
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

