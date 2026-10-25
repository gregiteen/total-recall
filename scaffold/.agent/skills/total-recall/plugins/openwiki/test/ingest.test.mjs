import test from 'node:test';
import assert from 'node:assert/strict';
import { runOpenWikiIngest } from '../src/ingest.mjs';

test('runOpenWikiIngest is a callable function', () => {
  assert.equal(typeof runOpenWikiIngest, 'function');
});

test('runOpenWikiIngest handles help flag gracefully', async () => {
  const result = await runOpenWikiIngest(['--help']);
  assert.equal(result.ok, true);
  assert.equal(result.imported, 0);
});
