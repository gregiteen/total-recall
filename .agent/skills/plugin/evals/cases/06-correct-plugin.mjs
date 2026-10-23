/**
 * A plugin that satisfies the recipe: one bespoke face, real data only,
 * credentials through auth, values the caller supplies.
 *
 * This is the positive case. It must produce no failures.
 */
const CARD = `
const DASH = '\\u2014'

export class ExampleCard extends HTMLElement {
  constructor() {
    super()
    this.state = 'idle'
    this.reading = null
    this.lastError = null
    this.lastAttempt = null
    this.screen = 'status'
  }
  get screens() { return [{ id: 'status', label: 'Status' }] }
  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' })
    this.render()
    void this.read()
  }
  async read() {
    this.lastAttempt = new Date()
    try {
      const payload = await this.host.run('status', ['--json'])
      this.reading = payload && typeof payload === 'object' ? payload : null
      if (!this.reading) throw new Error('The status command returned nothing readable')
      this.lastError = null
      this.state = 'ready'
    } catch (err) {
      this.reading = null
      this.lastError = err && err.message ? err.message : String(err)
      this.state = 'error'
    } finally {
      this.paint()
    }
  }
  paint() {
    const value = this.shadowRoot.querySelector('#value')
    const note = this.shadowRoot.querySelector('#note')
    if (value) value.textContent = this.reading ? String(this.reading.usedPercent ?? DASH) : DASH
    if (note) note.textContent = this.lastError ? this.lastError + ' at ' + this.lastAttempt.toLocaleTimeString() : ''
  }
  render() {
    this.shadowRoot.innerHTML = '<style>:host{display:block;color:var(--text-primary);border:1px solid var(--border);padding:14px}' +
      'button{min-height:44px}</style>' +
      '<h2>Example</h2><span id="value">' + DASH + '</span><p id="note"></p><button type="button">Read</button>'
  }
}
customElements.define('tr-example-card', ExampleCard)
`;

const CAPABILITY = `
export async function readStatus({ endpoint, apiKey, fetchImpl = fetch }) {
  if (!endpoint) throw new Error('endpoint is required')
  const res = await fetchImpl(endpoint + '/status', { headers: apiKey ? { Authorization: 'Bearer ' + apiKey } : {} })
  if (!res.ok) throw new Error('status request failed: ' + res.status)
  return res.json()
}
`;

export default {
  name: 'correct-plugin',
  why: 'the recipe must accept a plugin that follows it, or it is not a recipe',
  files: {
    'plugin.json': JSON.stringify({
      id: 'example', name: 'Example', version: '1.0.0', description: 'A plugin that follows the recipe exactly.',
      cli: { command: 'example', handler: './cli.mjs', subcommands: [
        { name: 'status', description: 'Read current status', effect: 'read', output: 'json' },
        { name: 'set-key', description: 'Store the service key', effect: 'write',
          args: [{ name: 'apiKey', label: 'API key', type: 'string', secret: true }] },
      ] },
      capability: { entry: 'capability/index.mjs', exports: ['readStatus'] },
      secrets: [{ key: 'EXAMPLE_API_KEY', description: 'Reads the service', required: true }],
      status: { command: 'status', refresh_seconds: 30 },
      distribution: { tier: 'official', license: 'open' },
      branding: { name: 'Example', color: '#047857', accent: '#10b981', font: 'inter', density: 'comfortable', radius: 'sm', header: 'plain' },
      ui: { design_tokens: 'ui/DESIGN.md', elements: [{ id: 'card', kind: 'card', tag: 'tr-example-card', module: 'ui/card.js' }] },
    }, null, 2),
    'cli.mjs': "import { readAuthSecret } from './auth-client.mjs'\nimport { readStatus } from './capability/index.mjs'\nexport default async function run() {\n  return readStatus({ endpoint: process.env.EXAMPLE_ENDPOINT, apiKey: readAuthSecret('EXAMPLE_API_KEY') })\n}\n",
    'auth-client.mjs': "/** Auth-only transport: the plugin holds no credential of its own. */\nimport { spawnSync } from 'node:child_process'\nexport function readAuthSecret(key) {\n  const out = spawnSync('total-recall', ['auth', 'secret', 'get', key, '--json'], { encoding: 'utf8' })\n  const parsed = JSON.parse(out.stdout)\n  return parsed.found ? parsed.value : ''\n}\n",
    'ui/DESIGN.md': '# DESIGN.md — Example\n\n```yaml\ntokens:\n  brand-name: "Example"\n  color-primary: "#047857"\n```\n\nOne screen: the status reading.\n',
    'ui/card.js': CARD,
    'capability/index.mjs': CAPABILITY,
  },
  expect: {
    fail: [],
  },
};
