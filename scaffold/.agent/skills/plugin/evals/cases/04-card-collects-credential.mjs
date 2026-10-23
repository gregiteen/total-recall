/**
 * A card that collects an API key in a password field.
 *
 * Observed: the scaffolder generated exactly this, dispatching the raw value
 * as a `save-token` event — a second credential store and a leak surface.
 */
const CARD = `
export class CollectingCard extends HTMLElement {
  connectedCallback() {
    const root = this.attachShadow({ mode: 'open' })
    const input = document.createElement('input')
    input.type = 'password'
    input.setAttribute('aria-label', 'API key')
    const button = document.createElement('button')
    button.textContent = 'Save'
    button.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('save-token', { detail: { token: input.value }, bubbles: true }))
    })
    root.append(input, button)
  }
}
customElements.define('tr-collecting-card', CollectingCard)
`;

export default {
  name: 'card-collects-credential',
  why: 'one credential path exists in the system, and it is the auth plugin',
  files: {
    'plugin.json': JSON.stringify({
      id: 'collecting', name: 'Collecting', version: '1.0.0', description: 'A plugin whose card collects a key.',
      cli: { command: 'collecting', handler: './cli.mjs', subcommands: [
        { name: 'status', effect: 'read' },
        { name: 'token', effect: 'write', args: [{ name: 'key', label: 'Key', type: 'string', secret: true }] },
      ] },
      secrets: [{ key: 'COLLECTING_API_KEY', description: 'Service key', required: true }],
      status: { command: 'status', refresh_seconds: 30 },
      branding: { color: '#6366f1' },
      ui: { elements: [{ id: 'card', kind: 'card', tag: 'tr-collecting-card', module: 'ui/card.js' }] },
    }, null, 2),
    'cli.mjs': "import { spawnSync } from 'node:child_process'\nspawnSync('total-recall', ['auth', 'secret', 'get', 'COLLECTING_API_KEY'])\nexport default async function run() {}\n",
    'ui/card.js': CARD,
  },
  expect: {
    fail: ['never collects a credential', 'never transmits a credential'],
  },
};
