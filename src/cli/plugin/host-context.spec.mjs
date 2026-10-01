// @vitest-environment node
import { it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { spawnSync } from 'node:child_process';

it('supplies host context through the real installed-plugin CLI dispatch', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-cli-host-'));
  const packageRoot = fileURLToPath(new URL('../../../', import.meta.url));
  const agent = path.join(root, 'agent');
  const plugin = path.join(agent, 'skills/total-recall/plugins/host-probe');
  try {
    fs.mkdirSync(plugin, { recursive: true });
    fs.writeFileSync(path.join(plugin, 'plugin.json'), JSON.stringify({
      id: 'host-probe', name: 'Host Probe', version: '1.0.0',
      description: 'Synthetic host context verification',
      cli: { command: 'host-probe', handler: './cli.mjs' }
    }));
    fs.writeFileSync(path.join(plugin, 'cli.mjs'), `export function run(argv) {
      console.log(JSON.stringify({ packageRoot: process.env.TR_PACKAGE_ROOT,
        pluginId: process.env.TR_PLUGIN_ID, pluginDir: process.env.TR_PLUGIN_DIR,
        args: argv.slice(2) }));
    }`);
    const result = spawnSync(process.execPath, [path.join(packageRoot, 'bin/total-recall.mjs'), 'host-probe', 'status'], {
      cwd: root, encoding: 'utf8', timeout: 10000,
      env: { ...process.env, AGENT_DIR: agent, _TR_TEST_AGENT_DIR: agent, TR_PACKAGE_ROOT: 'stale-host' }
    });
    expect(result.status, result.stderr).toBe(0);
    const output = result.stdout.trim().split('\n').map(line => { try { return JSON.parse(line); } catch { return null; } }).find(value => value?.pluginId);
    expect(output).toEqual({ packageRoot: path.resolve(packageRoot), pluginId: 'host-probe', pluginDir: plugin, args: ['host-probe', 'status'] });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
