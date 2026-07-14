/**
 * Tests for github-sync.mjs
 */

// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks must be hoisted before any imports that use the mocked modules ─────

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('./secrets-store.mjs', () => ({
  getSecret: vi.fn(),
}));

vi.mock('./logger.mjs', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('./task-envelope.mjs', () => ({
  addTask: vi.fn(),
  resolveQueueDir: vi.fn((brainDir) => `${brainDir}/scheduler/queue`),
}));

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import { getSecret } from './secrets-store.mjs';
import { addTask } from './task-envelope.mjs';
import { getGitHubSyncStatus, runGitHubSync, initGitHubSync } from './github-sync.mjs';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let tmpDir;

beforeEach(() => {
  vi.clearAllMocks();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-gh-sync-test-'));

  // Default: getSecret returns not-found
  getSecret.mockResolvedValue({ found: false, key: 'github_token' });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const brainDir = () => tmpDir;
const vaultDir = () => path.join(tmpDir, 'memory-vault');

// ─── getGitHubSyncStatus ──────────────────────────────────────────────────────

describe('getGitHubSyncStatus', () => {
  it('returns not_configured when no state file and git remote throws', async () => {
    // git remote get-url throws → not configured
    execFileSync.mockImplementation(() => { throw new Error('fatal: No such remote'); });

    const status = await getGitHubSyncStatus({ brainDir: brainDir(), vaultDir: vaultDir() });
    expect(status.configured).toBe(false);
    expect(status.lastSync).toBeNull();
    expect(status.remoteUrl).toBeNull();
    expect(status.status).toBe('not_configured');
  });

  it('returns configured when remote exists and state file is present', async () => {
    execFileSync.mockReturnValue('https://github.com/owner/repo.git\n');

    // Write a fake state file
    const stateFile = path.join(brainDir(), '.github-sync-state.json');
    fs.mkdirSync(brainDir(), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({ lastSync: '2024-01-01T00:00:00.000Z' }));

    const status = await getGitHubSyncStatus({ brainDir: brainDir(), vaultDir: vaultDir() });
    expect(status.configured).toBe(true);
    expect(status.lastSync).toBe('2024-01-01T00:00:00.000Z');
    expect(status.status).toBe('ok');
  });

  it('returns configured_never_synced when remote exists but no state', async () => {
    execFileSync.mockReturnValue('https://github.com/owner/repo.git\n');
    fs.mkdirSync(brainDir(), { recursive: true });

    const status = await getGitHubSyncStatus({ brainDir: brainDir(), vaultDir: vaultDir() });
    expect(status.configured).toBe(true);
    expect(status.lastSync).toBeNull();
    expect(status.status).toBe('configured_never_synced');
  });
});

// ─── runGitHubSync ─────────────────────────────────────────────────────────────

describe('runGitHubSync', () => {
  it('returns not-configured when git remote is absent', async () => {
    execFileSync.mockImplementation(() => { throw new Error('fatal: No such remote'); });

    const result = await runGitHubSync({ brainDir: brainDir(), vaultDir: vaultDir() });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/No remote configured/);
  });

  it('calls git pull and git push on the happy path with changes', async () => {
    fs.mkdirSync(brainDir(), { recursive: true });

    getSecret.mockResolvedValue({ found: true, key: 'github_token', value: 'ghp_test123' });

    // execFileSync call sequence:
    // 1. remote get-url → remote URL
    // 2. remote set-url (inject token)
    // 3. git pull
    // 4. git add -A
    // 5. git status --porcelain → "M file.md"
    // 6. git config user.email
    // 7. git config user.name
    // 8. git commit
    // 9. git push
    // 10. git remote set-url (restore)
    const calls = [];
    execFileSync.mockImplementation((_cmd, args) => {
      calls.push(args);
      if (args[0] === 'remote' && args[1] === 'get-url') return 'https://github.com/owner/repo.git\n';
      if (args[0] === 'status') return 'M memory-vault/fact/node.md\n';
      return '';
    });

    const result = await runGitHubSync({ brainDir: brainDir(), vaultDir: vaultDir() });

    expect(result.success).toBe(true);
    expect(result.pushed).toBe(true);

    const argLists = calls.map((a) => a.join(' '));
    expect(argLists.some((a) => a.startsWith('pull'))).toBe(true);
    expect(argLists.some((a) => a.startsWith('push'))).toBe(true);
    expect(argLists.some((a) => a.startsWith('add'))).toBe(true);
    expect(argLists.some((a) => a.startsWith('commit'))).toBe(true);
  });

  it('does not push when there are no changes', async () => {
    fs.mkdirSync(brainDir(), { recursive: true });

    execFileSync.mockImplementation((_cmd, args) => {
      if (args[0] === 'remote' && args[1] === 'get-url') return 'https://github.com/owner/repo.git\n';
      if (args[0] === 'status') return ''; // nothing changed
      return '';
    });

    const result = await runGitHubSync({ brainDir: brainDir(), vaultDir: vaultDir() });

    expect(result.success).toBe(true);
    expect(result.pushed).toBe(false);
    expect(result.message).toMatch(/nothing to push/i);
  });

  it('handles git errors gracefully and returns success: false', async () => {
    fs.mkdirSync(brainDir(), { recursive: true });

    execFileSync.mockImplementation((_cmd, args) => {
      if (args[0] === 'remote' && args[1] === 'get-url') return 'https://github.com/owner/repo.git\n';
      if (args[0] === 'pull') throw new Error('network error: could not resolve host');
      if (args[0] === 'add') throw new Error('git add failed');
      return '';
    });

    const result = await runGitHubSync({ brainDir: brainDir(), vaultDir: vaultDir() });
    // Should not throw, just return failure
    expect(result.success).toBe(false);
  });

  it('detects diverged remote and surfaces a Task Inbox item', async () => {
    fs.mkdirSync(brainDir(), { recursive: true });

    execFileSync.mockImplementation((_cmd, args) => {
      if (args[0] === 'remote' && args[1] === 'get-url') return 'https://github.com/owner/repo.git\n';
      if (args[0] === 'remote' && args[1] === 'set-url') return '';
      if (args[0] === 'pull') {
        throw new Error('fatal: Not possible to fast-forward, aborting. diverged');
      }
      return '';
    });

    const result = await runGitHubSync({ brainDir: brainDir(), vaultDir: vaultDir() });

    expect(result.success).toBe(false);
    expect(result.conflicts).toBe(true);
    expect(result.message).toMatch(/Diverged remote/i);
    expect(addTask).toHaveBeenCalledOnce();
    const taskArg = addTask.mock.calls[0][0];
    expect(taskArg.kind).toBe('system');
    expect(taskArg.intent).toMatch(/conflict/i);
  });
});

// ─── initGitHubSync ──────────────────────────────────────────────────────────

describe('initGitHubSync', () => {
  it('returns error when remoteUrl is missing', async () => {
    const result = await initGitHubSync({ brainDir: brainDir(), vaultDir: vaultDir(), remoteUrl: '' });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/remoteUrl is required/i);
  });

  it('initializes git and sets remote', async () => {
    fs.mkdirSync(brainDir(), { recursive: true });
    const callArgs = [];

    execFileSync.mockImplementation((_cmd, args) => {
      callArgs.push([...args]);
      // remote get-url throws → no existing remote
      if (args[0] === 'remote' && args[1] === 'get-url') {
        throw new Error('fatal: No such remote');
      }
      return '';
    });

    const result = await initGitHubSync({
      brainDir: brainDir(),
      vaultDir: vaultDir(),
      remoteUrl: 'https://github.com/owner/repo.git',
      token: 'ghp_test',
    });

    expect(result.success).toBe(true);
    const joined = callArgs.map((a) => a.join(' '));
    expect(joined.some((a) => a.startsWith('init'))).toBe(true);
    expect(joined.some((a) => a.startsWith('remote add'))).toBe(true);

    // State file should be written
    const stateFile = path.join(brainDir(), '.github-sync-state.json');
    expect(fs.existsSync(stateFile)).toBe(true);
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    expect(state.remoteUrl).toBe('https://github.com/owner/repo.git');
    expect(state.initialized).toBe(true);
  });
});
