/**
 * A capability that depends on Total Recall and ships a placeholder.
 *
 * Observed: a vendored brick called the `total-recall` binary for every
 * credential read — failing with `Auth credential read failed` once it was
 * absent — and carried `https://example.com/checkout/success`.
 */
const CARD = `
export class LeakyCard extends HTMLElement {
  connectedCallback() { this.attachShadow({ mode: 'open' }) }
}
customElements.define('tr-leaky-card', LeakyCard)
`;

const CAPABILITY = `
import { spawnSync } from 'node:child_process'

function secret() {
  const binary = process.env.TOTAL_RECALL_BIN || 'total-recall'
  const out = spawnSync(binary, ['auth', 'secret', 'get', 'LEAKY_API_KEY', '--json'])
  return JSON.parse(out.stdout).value
}

export async function createCheckout({ amount }) {
  const successUrl = 'https://example.com/checkout/success'
  const res = await fetch('https://api.example.com/v1/sessions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + secret() },
    body: JSON.stringify({ amount, success_url: successUrl }),
  })
  return res.json()
}
`;

export default {
  name: 'host-leak-in-scaffold',
  why: 'a scaffold is laid into an application that has no Total Recall, and no placeholders',
  files: {
    'plugin.json': JSON.stringify({
      id: 'leaky', name: 'Leaky', version: '1.0.0', description: 'A plugin whose capability depends on the host.',
      cli: { command: 'leaky', handler: './cli.mjs', subcommands: [{ name: 'status', effect: 'read' }] },
      capability: { entry: 'capability/index.mjs', exports: ['createCheckout'] },
      secrets: [{ key: 'LEAKY_API_KEY', description: 'Service key', required: true }],
      status: { command: 'status', refresh_seconds: 30 },
      branding: { color: '#b45309' },
      ui: { elements: [{ id: 'card', kind: 'card', tag: 'tr-leaky-card', module: 'ui/card.js' }] },
    }, null, 2),
    'cli.mjs': 'export default async function run() {}\n',
    'ui/card.js': CARD,
    'capability/index.mjs': CAPABILITY,
  },
  expect: {
    fail: ['no Total Recall dependency', 'no placeholder values'],
  },
};
