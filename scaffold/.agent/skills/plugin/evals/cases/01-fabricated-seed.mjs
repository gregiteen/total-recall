/**
 * A native Home that displays seeded telemetry.
 *
 * Observed: system-monitor held a literal hostname, uptime, load average and
 * `usedPercent: 99.1` before any command ran, with the comment
 * "// Retain fallback telemetry".
 */
import correct from './06-correct-plugin.mjs';

const HOME = `
export class SeededHome extends HTMLElement {
  constructor() {
    super();
    this.sample = {
      hostname: 'build-box.local',
      platform: 'darwin',
      uptimeSeconds: 566924,
      loadAvg: [3.34, 3.76, 5.00],
      memory: { total: 17179869184, free: 159334400, usedPercent: 99.1 }
    };
  }
  connectedCallback() {
    const root = this.attachShadow({ mode: 'open' })
    const value = document.createElement('output')
    value.textContent = this.sample.memory.usedPercent + '%'
    root.append(value)
  }
}
customElements.define('tr-example-home', SeededHome)
`;

export default {
  ...correct,
  name: 'fabricated-seed',
  why: 'Operators may act on a reading that no service returned.',
  files: { ...correct.files, 'ui/home.js': HOME },
  expect: {
    fail: ['no seeded values'],
  },
};
