/**
 * A valid native Home package that still ships legacy presentation artifacts.
 *
 * Observed: core enforced a closed allowlist of seven layouts, and 24 of 34
 * plugins shared a byte-identical card signature.
 */
import correct from './06-correct-plugin.mjs';

const manifest = JSON.parse(correct.files['plugin.json']);
manifest.card_layout = { template: 'ledger', regions: [{ widget: 'status' }] };

export default {
  ...correct,
  name: 'declared-template',
  why: 'Keeping the legacy template or asset ships an unsupported presentation alongside native Home.',
  flags: ['--manifest'],
  files: {
    ...correct.files,
    'plugin.json': JSON.stringify(manifest),
    'ui/card.js': "customElements.define('tr-example-card', class extends HTMLElement {})\n",
  },
  expect: {
    fail: ['contract', 'native presentation only'],
  },
};
