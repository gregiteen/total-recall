import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { run } from './index.mjs';

describe('App Capability Deployment CLI (cli/app/index.mjs)', () => {
  let logSpy;
  let errSpy;
  let exitSpy;
  let tmpTarget;

  beforeEach(() => {
    tmpTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-app-cli-'));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    exitSpy.mockRestore();
    if (fs.existsSync(tmpTarget)) {
      fs.rmSync(tmpTarget, { recursive: true, force: true });
    }
  });

  it('prints help message when called without args or with --help', async () => {
    await run(['app', '--help']);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Total Recall — App Capability Deployment'));
  });

  it('exits with code 1 when plan is called without source', async () => {
    await expect(run(['app', 'plan'])).rejects.toThrow('process.exit(1)');
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Missing capability source'));
  });

  it('computes plan and exits with 0 for valid capability in clean target', async () => {
    await expect(run(['app', 'plan', 'code-quality', '--target', tmpTarget, '--json'])).rejects.toThrow('process.exit(0)');
    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.valid).toBe(true);
    expect(parsed.plan_hash).toBeDefined();
    expect(parsed.capabilities[0].id).toBe('code-quality');
  });

  it('exits with code 2 when protected file conflict is detected', async () => {
    // Put a conflicting README.md in target
    fs.writeFileSync(path.join(tmpTarget, 'README.md'), 'Conflicting content');
    await expect(run(['app', 'plan', 'code-quality', '--target', tmpTarget, '--json'])).rejects.toThrow('process.exit(2)');
    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.valid).toBe(false);
    expect(parsed.conflicts.length).toBeGreaterThan(0);
  });

  it('exits with code 3 for incompatible adapter', async () => {
    const pluginDir = path.join(tmpTarget, 'incompatible-plugin');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
      id: 'only-flask',
      name: 'Only Flask',
      version: '1.0.0',
      description: 'Flask only',
      deploy: { targets: ['flask'] }
    }));
    await expect(
      run(['app', 'plan', pluginDir, '--adapter', 'react'])
    ).rejects.toThrow('process.exit(3)');
  });

  it('executes app add with --dry-run without mutating target', async () => {
    await expect(
      run(['app', 'add', 'code-quality', '--target', tmpTarget, '--dry-run', '--json'])
    ).rejects.toThrow('process.exit(0)');
    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
    expect(parsed.dryRun).toBe(true);
    expect(fs.readdirSync(tmpTarget).length).toBe(0);
  });

  it('executes app add, writes files, and can be verified with app verify', async () => {
    // 1. Add capability to target app
    await expect(
      run(['app', 'add', 'code-quality', '--target', tmpTarget, '--json'])
    ).rejects.toThrow('process.exit(0)');
    const addOutput = logSpy.mock.calls[0][0];
    const addResult = JSON.parse(addOutput);
    expect(addResult.success).toBe(true);
    expect(addResult.capabilities).toContain('code-quality');

    // 2. Verify target app with app verify (expect exit 0)
    logSpy.mockClear();
    await expect(
      run(['app', 'verify', '--target', tmpTarget, '--json'])
    ).rejects.toThrow('process.exit(0)');
    const verifyOutput = logSpy.mock.calls[0][0];
    const verifyReport = JSON.parse(verifyOutput);
    expect(verifyReport.valid).toBe(true);
    expect(verifyReport.capabilities[0].id).toBe('code-quality');

    // 3. Tamper with a file and expect app verify to exit 2 (drift detected)
    logSpy.mockClear();
    fs.writeFileSync(path.join(tmpTarget, 'cli.mjs'), 'tampered content');
    await expect(
      run(['app', 'verify', '--target', tmpTarget, '--json'])
    ).rejects.toThrow('process.exit(2)');
    const tamperedOutput = logSpy.mock.calls[0][0];
    const tamperedReport = JSON.parse(tamperedOutput);
    expect(tamperedReport.valid).toBe(false);
  });

  it('creates a new standalone app via app create', async () => {
    const newAppDir = path.join(tmpTarget, 'standalone-child');
    await expect(
      run(['app', 'create', newAppDir, '--plugin', 'code-quality', '--json'])
    ).rejects.toThrow('process.exit(0)');
    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
    expect(parsed.targetDir).toBe(newAppDir);
    expect(fs.existsSync(path.join(newAppDir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(newAppDir, 'index.mjs'))).toBe(true);
  });
});
