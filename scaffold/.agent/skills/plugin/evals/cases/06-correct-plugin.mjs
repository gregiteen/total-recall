/**
 * A plugin with native Home, an SSSS block, and Auth-managed credentials.
 *
 * This is the positive case. It must produce no failures.
 */
const HOME = `
export class ExampleHome extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return
    const root = this.attachShadow({ mode: 'open' })
    root.innerHTML =
      '<style>:host{display:block;color:var(--colors-ink);background:var(--colors-paper);padding:16px}' +
      'button{min-height:44px}</style>' +
      '<h2>Service memory</h2><output aria-label="Memory in use">No reading yet</output>' +
      '<p role="status"></p><button type="button">Read memory use</button>'
    root.querySelector('button').addEventListener('click', () => this.read())
  }

  async read() {
    const value = this.shadowRoot.querySelector('output')
    const note = this.shadowRoot.querySelector('[role="status"]')
    const time = new Date().toLocaleTimeString()
    try {
      const payload = await this.host.run('status', ['--json'])
      if (payload?.ok !== true || !Number.isFinite(payload.usedPercent)) throw new Error('No readable memory measurement')
      value.textContent = payload.usedPercent + '%'
      note.textContent = 'Read at ' + time
    } catch {
      value.textContent = 'Unavailable'
      note.textContent = 'Could not read memory use at ' + time
    }
  }
}
customElements.define('tr-example-home', ExampleHome)
`;

const DESIGN = `---
colors:
  ink: "#13241f"
  paper: "#ecf5f0"
  accent: "#047857"
---
# Service memory

Use a quiet green surface for the memory readout. Keep the last attempt beside the measured value.
`;

const STATUS_BLOCK = `---
type: ui-chunk:chunk
plugin: example
id: memory-use
title: Service memory use
description: Reads memory use from the configured service and displays the returned percentage.
timestamp: '2026-11-08T00:00:00Z'
intents:
  - inspect service memory use
surfaces: [page]
operations: [status]
data:
  - 'status:/usedPercent'
panel: home
---
<section>
  <h2>Service memory use</h2>
  <p>Read the current percentage from the service in the live panel.</p>
</section>
`;

const CAPABILITY = `
export async function readStatus({ endpoint, apiKey, fetchImpl = fetch }) {
  if (!endpoint) throw new Error('endpoint is required')
  const res = await fetchImpl(endpoint + '/status', { headers: apiKey ? { Authorization: 'Bearer ' + apiKey } : {} })
  if (!res.ok) throw new Error('status request failed: ' + res.status)
  return res.json()
}
`;

const CLI = `
import { readAuthSecret } from './auth-client.mjs'
import { readStatus } from './capability/index.mjs'

export default async function run([operation]) {
  if (operation !== 'status') {
    process.exitCode = 1
    return console.log(JSON.stringify({ ok: false, error: 'Use the status operation' }))
  }
  try {
    const apiKey = readAuthSecret('EXAMPLE_API_KEY')
    if (!apiKey) throw new Error('Service key unavailable')
    const status = await readStatus({ endpoint: process.env.EXAMPLE_ENDPOINT, apiKey })
    if (!Number.isFinite(status.usedPercent)) throw new Error('Invalid memory reading')
    console.log(JSON.stringify({ ok: true, usedPercent: status.usedPercent }))
  } catch {
    process.exitCode = 1
    console.log(JSON.stringify({ ok: false, error: 'Could not read service memory use' }))
  }
}
`;

export default {
  name: 'correct-plugin',
  why: 'the recipe must accept a plugin that follows it, or it is not a recipe',
  files: {
    'plugin.json': JSON.stringify({
      id: 'example', name: 'Example', version: '1.0.0', description: 'A plugin that follows the recipe exactly.',
      reuse: { commands: ['total-recall auth secret'], owned: 'Reads the service-specific status endpoint.' },
      cli: { command: 'example', handler: './cli.mjs', subcommands: [
        { name: 'status', description: 'Read current status', effect: 'read', output: 'json' },
      ] },
      capability: { entry: 'capability/index.mjs', exports: ['readStatus'] },
      secrets: [{ key: 'EXAMPLE_API_KEY', description: 'Reads the service', required: true }],
      auth: { plugin: 'auth', methods: ['passkey'], session_verification: true },
      status: { command: 'status', refresh_seconds: 30 },
      distribution: { tier: 'official', license: 'open' },
      branding: { name: 'Example', color: '#047857', accent: '#10b981', font: 'inter', density: 'comfortable', radius: 'sm', header: 'plain' },
      ui: { home: 'home', design_tokens: 'DESIGN.md', elements: [
        { id: 'home', kind: 'panel', tag: 'tr-example-home', module: 'ui/home.js' },
      ] },
    }, null, 2),
    'cli.mjs': CLI,
    'auth-client.mjs': "/** Auth-only transport: the plugin holds no credential of its own. */\nimport { spawnSync } from 'node:child_process'\nexport function readAuthSecret(key) {\n  const out = spawnSync('total-recall', ['auth', 'secret', 'get', key, '--json'], { encoding: 'utf8' })\n  const parsed = JSON.parse(out.stdout)\n  return parsed.found ? parsed.value : ''\n}\n",
    'DESIGN.md': DESIGN,
    'ui/home.js': HOME,
    'ui/chunks/memory-use.md': STATUS_BLOCK,
    'capability/index.mjs': CAPABILITY,
  },
  expect: {
    fail: [],
    pass: ['Bundled Auth', 'Home element', 'Owner design', 'SSSS block', 'Operation coverage', 'owner commands resolve', 'loads with Total Recall absent'],
  },
};
