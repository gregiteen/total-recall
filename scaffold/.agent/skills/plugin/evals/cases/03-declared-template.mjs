/**
 * A manifest that declares a shared layout template.
 *
 * Observed: core enforced a closed allowlist of seven layouts, and 24 of 34
 * plugins shared a byte-identical card signature.
 */
const CARD = `
export class TemplatedCard extends HTMLElement {
  connectedCallback() { this.attachShadow({ mode: 'open' }) }
}
customElements.define('tr-templated-card', TemplatedCard)
`;

export default {
  name: 'declared-template',
  why: 'a shared layout vocabulary is the mechanism that made unrelated plugins look alike',
  files: {
    'plugin.json': JSON.stringify({
      id: 'templated', name: 'Templated', version: '1.0.0', description: 'A plugin that declares a layout template.',
      cli: { command: 'templated', handler: './cli.mjs', subcommands: [{ name: 'status', effect: 'read' }] },
      status: { command: 'status', refresh_seconds: 30 },
      branding: { color: '#475569' },
      card_layout: { template: 'ledger', regions: [{ widget: 'status' }, { widget: 'table', source: { command: 'status' } }] },
      ui: { elements: [{ id: 'card', kind: 'card', tag: 'tr-templated-card', module: 'ui/card.js' }] },
    }, null, 2),
    'cli.mjs': 'export default async function run() {}\n',
    'ui/card.js': CARD,
  },
  expect: {
    fail: ['no template', 'card_layout'],
  },
};
