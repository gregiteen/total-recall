import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import { discoverPlugins } from './src/core/plugin-loader.mjs'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// ── HARD GUARD: the suite is REMOTE ONLY ─────────────────────────────────────
// 'npm test' / 'npx vitest' runs on the sanctioned test node (the Mac mini),
// never on the laptop — a full local run once pinned this 8 GB machine at load
// 600+. `.agent/skills/code-quality/config.json` is machine-local (git-ignored)
// and declares remoteNode/remoteRepo for exactly the machines that must obey
// this, so the guard is inert for anyone without that config. Escape hatch for a
// deliberate, isolated run: TR_ALLOW_LOCAL_TESTS=1.
{
  const hostRoot = fileURLToPath(new URL('.', import.meta.url))
  const configFile = path.join(hostRoot, '.agent/skills/code-quality/config.json')
  let remoteNode = ''
  let remoteRepo = ''
  try {
    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'))
    remoteNode = String(cfg.remoteNode || '')
    remoteRepo = String(cfg.remoteRepo || '')
  } catch {
    // No machine-local gate config: this is not a gated host. Stay inert.
  }

  if (remoteNode && process.env.TR_ALLOW_LOCAL_TESTS !== '1') {
    let onSanctionedNode = false
    try {
      onSanctionedNode = fs.realpathSync(hostRoot).startsWith(fs.realpathSync(remoteRepo))
    } catch {
      onSanctionedNode = false
    }
    if (!onSanctionedNode) {
      console.error(
        '\n❌ REFUSING to run the test suite on this machine.\n' +
          "   'npm test' / 'npx vitest' is REMOTE ONLY — it runs on the sanctioned test\n" +
          `   node ("${remoteNode}"), never on the laptop.\n` +
          '   Run the gate instead:  node scripts/code-quality-gate.mjs   (drives the remote node)\n' +
          `   …or run the suite inside the sanctioned snapshot: ${remoteRepo}\n` +
          '   Deliberate local run:  TR_ALLOW_LOCAL_TESTS=1 npm test\n'
      )
      process.exit(1)
    }
  }
}

// Owner repositories are installed ESM packages, outside the host module graph.
const pluginPackages = discoverPlugins(fileURLToPath(new URL('.', import.meta.url)))
  .filter(plugin => plugin.valid)
  .map(plugin => new RegExp('^' + fs.realpathSync(plugin.dir).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/'))

export default defineConfig({
  plugins: [react()],
  // The dashboard has its own lockfile; tests must share one React dispatcher.
  resolve: { dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom'] },
  test: {
    environment: 'jsdom',
    // Apply React deduplication to separately installed dashboard dependencies too.
    server: { deps: { external: pluginPackages, inline: [/frontend[\/]node_modules/, 'react-router', 'react-router-dom'] } },
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
