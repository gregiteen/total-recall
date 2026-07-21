import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // Default 5000ms is too tight for CPU-bound work (scrypt key derivation, module
    // imports doing real init) under contention from the rest of the suite running
    // concurrently — several unrelated tests intermittently timed out at exactly 5000ms
    // with no logic error, only under load. Individual slow tests can still override this.
    testTimeout: 20000,
    exclude: ['**/node_modules/**', '**/.agent/**', '**/.agents/**', '**/.claude/**', '**/.cursor/**'],
    setupFiles: ['./frontend/src/setupTests.ts'],
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      }
    }
  },
})
