import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getActiveAdapters, loadCustomAdapters, getCustomAdaptersDirs } from '../src/worker.mjs';
import { getInstalledVersion, getLatestVersion, getAgentChangelog, inspectUpstreamFleet } from '../src/tracker.mjs';

test('extensible adapter registry includes built-in adapters and loads user custom definitions', t => {
  const active = getActiveAdapters();
  assert.ok(active.length >= 15);
  const ids = active.map(a => a.id);
  assert.ok(ids.includes('agy'));
  assert.ok(ids.includes('claude'));
  assert.ok(ids.includes('codex'));
  assert.ok(ids.includes('ollama'));
  assert.ok(ids.includes('openclaw'));
  assert.ok(ids.includes('aider'));
  assert.ok(ids.includes('goose'));

  // Test dynamic custom adapter loading
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const customSpec = {
    id: 'test-custom-agent',
    name: 'Test Custom Agent',
    binary: 'test-custom',
    args: ['-p'],
    docs: 'https://example.com/test'
  };
  fs.writeFileSync(path.join(tmpDir, 'test-custom.json'), JSON.stringify(customSpec));

  const origBrain = process.env.TR_SECRETS_BRAIN;
  process.env.TR_SECRETS_BRAIN = tmpDir;
  fs.mkdirSync(path.join(tmpDir, 'config/harnesses'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'config/harnesses/my-agent.json'), JSON.stringify(customSpec));

  try {
    const custom = loadCustomAdapters();
    assert.ok(custom.some(c => c.id === 'test-custom-agent'));
    const merged = getActiveAdapters();
    assert.ok(merged.some(m => m.id === 'test-custom-agent'));
  } finally {
    process.env.TR_SECRETS_BRAIN = origBrain;
  }
});

test('upstream tracker probes versions and changelogs safely', async () => {
  const agyVersion = getInstalledVersion('agy');
  if (agyVersion) {
    assert.match(agyVersion, /^\d+\.\d+/);
  }

  // agy changelog check
  const changelog = getAgentChangelog('agy', 2);
  if (changelog.ok) {
    assert.match(changelog.changelog, /\d+\.\d+\.\d+:/);
  }

  // latest version resolver avoids downgrade traps
  const latestAgy = await getLatestVersion('agy', '1.4.10');
  assert.match(latestAgy, /^\d+\.\d+/);
});
