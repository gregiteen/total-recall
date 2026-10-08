import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // The dashboard has its own lockfile; tests must share one React dispatcher.
  resolve: { dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom'] },
  test: {
    environment: 'jsdom',
    // Apply React deduplication to separately installed dashboard dependencies too.
    server: { deps: { inline: [/frontend[\/]node_modules/, 'react-router', 'react-router-dom'] } },
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
    exclude: ['**/node_modules/**', '**/.agent/**', '**/.agents/**', '**/.claude/**', '**/.cursor/**', '**/.gemini/**', '**/.codex/**', '**/knowledge-catalog/**'],
    // The secrets store falls back to the host's Keychain entry and
    // ~/.agent/tr.env when TR_SECRETS_PASSWORD is unset. Specs that clear the
    // variable to test the no-password path must not find the machine's real
    // password, so both fallbacks are off for the suite; the specs that cover
    // them inject their own readers or TR_ENV_FILE.
    env: {
      TR_SECRETS_NO_KEYCHAIN: '1',
      TR_ENV_FILE: '/nonexistent/total-recall-test/tr.env',
      // Plugins ship as standalone repositories; specs use fixed fixtures
      // instead of whatever is installed in the developer's own brain.
      _TR_TEST_BUNDLED_PLUGINS_DIR: fileURLToPath(new URL('./fixtures/bundled-plugins', import.meta.url)),
    },
    setupFiles: ['./scripts/test-memory-root.mjs', './frontend/src/setupTests.ts'],
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
