import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// Suppress unhandled rejections from ssh2 crypto cleanup
// These are background operations from testcontainers/postgres that can't be awaited
process.on('unhandledRejection', (reason: any) => {
  const errorMessage = String(reason);
  // Ignore ssh2 crypto cleanup errors
  if (errorMessage.includes('poly1305') || errorMessage.includes('ssh2')) {
    return;
  }
  // Log other unhandled rejections
  console.error('Unhandled Rejection:', reason);
});

// Mock the database module to prevent it from loading .env.local
vi.mock('@/db', () => ({
  db: {},
  Database: {},
}));

// Cleanup after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Mock environment variables for tests
beforeEach(() => {
  // Set default test environment variables
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  
  // Mock Astro-specific globals if needed
  // @ts-ignore
  global.Astro = {
    locals: {},
    request: {},
    url: new URL('http://localhost:4321'),
  };
});

// Mock fetch globally
global.fetch = vi.fn();

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as any;

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as any;

