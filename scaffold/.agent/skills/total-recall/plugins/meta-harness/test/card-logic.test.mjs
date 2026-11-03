import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('cli-agents card face defines element and contains zero template artifacts', () => {
  const cardPath = path.resolve(__dirname, '..', 'ui', 'card.js');
  const source = fs.readFileSync(cardPath, 'utf8');

  // Verify custom element definition
  assert.ok(source.includes("customElements.define('command-fleet-card'"), 'Defines command-fleet-card');

  // Verify template classes are eradicated
  assert.ok(!source.includes('telemetry-row'), 'Must not contain .telemetry-row metric strip');
  assert.ok(!source.includes('terminal-deck'), 'Must not contain .terminal-deck');
  assert.ok(!source.includes('terminal-readout'), 'Must not contain .terminal-readout');
  assert.ok(!source.includes('id="card-out"'), 'Must not contain #card-out text sink');

  // Verify bespoke functional components exist
  assert.ok(source.includes('wordmark-badge'), 'Includes Command Fleet wordmark');
  assert.ok(source.includes('node-bar'), 'Includes Mesh node selector bar');
  assert.ok(source.includes('roster-card'), 'Includes agent roster matrix');
  assert.ok(source.includes('inspector-panel'), 'Includes structured agent inspector');
  assert.ok(source.includes('prefers-reduced-motion'), 'Includes reduced motion styling');
  assert.ok(source.includes('min-height: 44px'), 'Includes 44px minimum touch targets');
});
