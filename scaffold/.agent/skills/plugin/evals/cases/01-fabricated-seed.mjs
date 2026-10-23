/**
 * A card that seeds a telemetry reading in its constructor.
 *
 * Observed: system-monitor held a literal hostname, uptime, load average and
 * `usedPercent: 99.1` before any command ran, with the comment
 * "// Retain fallback telemetry".
 */
const CARD = `
export class SeededCard extends HTMLElement {
  constructor() {
    super();
    this.sample = {
      hostname: 'Gregorys-Mac-mini.local',
      platform: 'darwin',
      uptimeSeconds: 566924,
      loadAvg: [3.34, 3.76, 5.00],
      memory: { total: 17179869184, free: 159334400, usedPercent: 99.1 }
    };
  }
  connectedCallback() { this.attachShadow({ mode: 'open' }) }
}
customElements.define('tr-seeded-card', SeededCard)
`;

export default {
  name: 'fabricated-seed',
  why: 'a fabricated reading on the face is the most consequential kind of lie',
  files: {
    'plugin.json': JSON.stringify({
      id: 'seeded', name: 'Seeded', version: '1.0.0', description: 'A plugin that fabricates a reading.',
      cli: { command: 'seeded', handler: './cli.mjs', subcommands: [{ name: 'sample', effect: 'read' }] },
      status: { command: 'sample', refresh_seconds: 30 },
      branding: { color: '#059669' },
      ui: { elements: [{ id: 'card', kind: 'card', tag: 'tr-seeded-card', module: 'ui/card.js' }] },
    }, null, 2),
    'cli.mjs': 'export default async function run() {}\n',
    'ui/card.js': CARD,
  },
  expect: {
    fail: ['no seeded values'],
  },
};
