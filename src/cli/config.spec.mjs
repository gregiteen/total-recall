import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'yaml';
import configCommand from './config.mjs';
import { globalPluginsDir } from '../core/plugin-loader.mjs';

describe('config CLI command', () => {
  let tmpAgentDir;
  let origAgentDir;
  let origEnv;

  beforeEach(() => {
    tmpAgentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-config-test-'));
    origAgentDir = process.env.AGENT_DIR;
    origEnv = { ...process.env };
    process.env.AGENT_DIR = tmpAgentDir;

    // Create config folder in active brain
    const configDir = path.join(tmpAgentDir, 'skills', 'total-recall', 'config');
    fs.mkdirSync(configDir, { recursive: true });

    // Seed mock configs
    fs.writeFileSync(
      path.join(configDir, 'security.yml'),
      yaml.stringify({
        yolo_mode: false,
        privacy: {
          enforce_local_only: true
        },
        dashboard: {
          session_ttl_hours: 24
        },
        network: {
          allowed_origins: ['http://localhost:3000']
        }
      }),
      'utf8'
    );

    fs.writeFileSync(
      path.join(configDir, 'budget.yml'),
      yaml.stringify({
        budget: {
          daily_cap_usd: 5.0,
          weekly_cap_usd: 25.0,
          enabled: true
        }
      }),
      'utf8'
    );
  });

  afterEach(() => {
    if (origAgentDir === undefined) delete process.env.AGENT_DIR;
    else process.env.AGENT_DIR = origAgentDir;
    process.env = origEnv;
    fs.rmSync(tmpAgentDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('correctly retrieves individual keys', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Dotted key dashboard.session_ttl_hours
    await configCommand(['get', 'dashboard.session_ttl_hours']);
    expect(consoleSpy).toHaveBeenLastCalledWith(24);

    // Dotted key budget.daily_cap_usd
    await configCommand(['get', 'budget.daily_cap_usd']);
    expect(consoleSpy).toHaveBeenLastCalledWith(5.0);

    // Flat key alias daily_cap_usd
    await configCommand(['get', 'daily_cap_usd']);
    expect(consoleSpy).toHaveBeenLastCalledWith(5.0);

    consoleSpy.mockRestore();
  });

  it('correctly sets individual keys and preserves types', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await configCommand(['set', 'session_ttl_hours', '12']);
    
    const securityFilePath = path.join(tmpAgentDir, 'skills', 'total-recall', 'config', 'security.yml');
    let securityData = yaml.parse(fs.readFileSync(securityFilePath, 'utf8'));
    expect(securityData.dashboard.session_ttl_hours).toBe(12);

    // Set daily_cap_usd to 15.5 (casts to number, goes to budget.yml)
    await configCommand(['set', 'daily_cap_usd', '15.5']);

    const budgetFilePath = path.join(tmpAgentDir, 'skills', 'total-recall', 'config', 'budget.yml');
    let budgetData = yaml.parse(fs.readFileSync(budgetFilePath, 'utf8'));
    expect(budgetData.budget.daily_cap_usd).toBe(15.5);

    // Set allowed_origins using a comma-separated list (casts to array)
    await configCommand(['set', 'allowed_origins', 'http://localhost:5173,http://localhost:8080']);
    securityData = yaml.parse(fs.readFileSync(securityFilePath, 'utf8'));
    expect(securityData.network.allowed_origins).toEqual(['http://localhost:5173', 'http://localhost:8080']);

    consoleSpy.mockRestore();
  });

  it('correctly validates allowed values', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});

    // Invalid value for session_ttl_hours
    await configCommand(['set', 'session_ttl_hours', 'sometimes']);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid number value: "sometimes"'));
    expect(exitSpy).toHaveBeenCalledWith(1);

    consoleSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('returns all keys when no key is specified in get', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await configCommand(['get']);
    const allLogs = consoleSpy.mock.calls.flat().join('\n');
    expect(allLogs).not.toContain('password_hash');
    expect(allLogs).toContain('daily_cap_usd');
    expect(allLogs).toContain('allowed_origins');

    consoleSpy.mockRestore();
  });

  it('rejects credential reads, writes, parent reads and prototype paths without changing files', async () => {
    const file = path.join(tmpAgentDir, 'skills/total-recall/config/security.yml');
    const before = fs.readFileSync(file, 'utf8');
    for (const key of ['password_hash', 'dashboard.password_hash', 'force_password_reset', 'api.pats', 'SESSION_SECRET', '__proto__.polluted']) {
      await expect(configCommand(['get', key])).rejects.toThrow('auth plugin');
      await expect(configCommand(['set', key, 'fixture'])).rejects.toThrow('auth plugin');
    }
    await expect(configCommand(['get', 'dashboard'])).rejects.toThrow('individual');
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });

  it('exposes drawer history and restore with explicit CAS versions and selected-brain isolation', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = () => JSON.parse(output.mock.calls.at(-1)[0]);
    process.env.TR_BRAIN = path.join(tmpAgentDir, 'selected-brain');
    const file = path.join(tmpAgentDir, 'layout.json');
    fs.writeFileSync(file, JSON.stringify({ html: 'First' }));
    await expect(configCommand(['drawer', 'right', '--file', file])).rejects.toThrow('--version');
    await configCommand(['drawer', 'right', '--file', file, '--version', 'null']);
    const first = result();
    fs.writeFileSync(file, JSON.stringify({ html: 'Second' }));
    await configCommand(['drawer', 'right', '--file', file, '--version', first.version]);
    const second = result();
    await configCommand(['drawer', 'right', '--history']);
    expect(result()).toMatchObject({ version: second.version, history: [{ version: first.version, config: first.config }] });
    await expect(configCommand(['drawer', 'right', '--restore', first.version, '--version', first.version])).rejects.toThrow('version conflict');
    await configCommand(['drawer', 'right', '--restore', first.version, '--version', second.version]);
    expect(result().config).toEqual(first.config);
    await configCommand(['drawer', 'bottom', '--history']);
    expect(result()).toEqual({ history: [], version: null });
    await configCommand(['drawer', 'right', '--global']);
    expect(result().version).toBe(null);
    await expect(configCommand(['drawer', 'right', '--restore', first.version, '--file', file, '--version', second.version])).rejects.toThrow('Invalid drawer');
    await expect(configCommand(['drawer', 'right', '--version', second.version, '--version', second.version])).rejects.toThrow('Invalid workspace');
  });

  it('chooses and removes bounded DESIGN.md content without changing the owner or executing code', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = () => JSON.parse(output.mock.calls.at(-1)[0]);
    process.env.TR_BRAIN = path.join(tmpAgentDir, 'selected-brain');
    const owner = path.join(globalPluginsDir(), 'design-cli');
    fs.mkdirSync(owner, { recursive: true });
    fs.writeFileSync(path.join(owner, 'plugin.json'), JSON.stringify({ id: 'design-cli', name: 'Design CLI', description: 'Owner', version: '1.0.0' }));
    fs.writeFileSync(path.join(owner, 'DESIGN.md'), '# Owner\n');
    const file = path.join(tmpAgentDir, 'DESIGN.md');
    const markdown = '---\ncolors:\n  primary: "#abcdef"\n---\n<script>throw new Error("must not execute")</script>\n';
    fs.writeFileSync(file, markdown);
    await configCommand(['design', 'design-cli']);
    expect(result()).toEqual({ markdown: null, version: null });
    await configCommand(['design', 'design-cli', '--file', file, '--version', 'null']);
    const selected = result();
    expect(selected.markdown).toBe(markdown);
    expect(fs.readFileSync(path.join(owner, 'DESIGN.md'), 'utf8')).toBe('# Owner\n');
    await expect(configCommand(['design', 'design-cli', '--remove', '--version', 'null'])).rejects.toThrow('version conflict');
    await configCommand(['design', 'design-cli', '--global']);
    expect(result().markdown).toBe(null);
    await configCommand(['design', 'design-cli', '--remove', '--version', selected.version]);
    expect(result().markdown).toBe(null);
    const removed = result();
    fs.writeFileSync(file, 'x'.repeat(65537));
    await expect(configCommand(['design', 'design-cli', '--file', file, '--version', removed.version])).rejects.toThrow('bounded regular file');
    const link = path.join(tmpAgentDir, 'linked.md');
    fs.symlinkSync(file, link);
    await expect(configCommand(['design', 'design-cli', '--file', link, '--version', removed.version])).rejects.toThrow();
    await configCommand(['design', 'design-cli']);
    expect(result()).toEqual(removed);
  });
});
