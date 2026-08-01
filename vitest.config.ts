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
    // Run spec FILES one at a time (each still gets a fresh module registry).
    //
    // Several specs assert on wall-clock behaviour — queue depth after a
    // rate-limit interval, fs watchers firing, file permissions — and those
    // assertions are only valid when the machine isn't saturated by other spec
    // files running concurrently. Measured over repeated full runs, that
    // contention made throttled-fetch (3 tests) and secrets-store (1 test)
    // fail intermittently while passing 15/15 in isolation. This trades a
    // slower suite for a deterministic one; a flaky suite is worth nothing
    // because nobody can tell a real regression from noise.
    fileParallelism: false,
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
