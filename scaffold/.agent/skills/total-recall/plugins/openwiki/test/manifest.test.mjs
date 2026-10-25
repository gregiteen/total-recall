import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));

test('manifest identifies the plugin', () => {
  assert.equal(manifest.id, "openwiki");
  assert.match(manifest.version, /^[0-9]+\.[0-9]+\.[0-9]+/);
  assert.equal(manifest.license, 'MIT');
});

test('every file the manifest references exists', () => {
  const refs = [manifest.cli?.handler, manifest.compile?.generator, manifest.ui?.design_tokens, ...(manifest.skills || []).map((s) => s.path), ...(manifest.ui?.elements || []).map((e) => e.module)].filter(Boolean);
  for (const ref of refs) assert.ok(fs.existsSync(path.join(root, ref)), `missing ${ref}`);
});
