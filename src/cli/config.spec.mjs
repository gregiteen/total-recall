import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'yaml';
import configCommand from './config.mjs';

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
          enforce_local_only: true,
          allow_frontier_export: 'ask_per_skill'
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

    // Flat key yolo_mode
    await configCommand(['get', 'yolo_mode']);
    expect(consoleSpy).toHaveBeenLastCalledWith(false);

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

    // Set yolo_mode to true (casts to boolean)
    await configCommand(['set', 'yolo_mode', 'true']);
    
    const securityFilePath = path.join(tmpAgentDir, 'skills', 'total-recall', 'config', 'security.yml');
    let securityData = yaml.parse(fs.readFileSync(securityFilePath, 'utf8'));
    expect(securityData.yolo_mode).toBe(true);

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

    // Invalid value for allow_frontier_export
    await configCommand(['set', 'allow_frontier_export', 'sometimes']);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Must be one of: always, ask_per_skill, never'));
    expect(exitSpy).toHaveBeenCalledWith(1);

    consoleSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('returns all keys when no key is specified in get', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await configCommand(['get']);
    const allLogs = consoleSpy.mock.calls.flat().join('\n');
    expect(allLogs).toContain('yolo_mode');
    expect(allLogs).toContain('daily_cap_usd');
    expect(allLogs).toContain('allowed_origins');

    consoleSpy.mockRestore();
  });
});
