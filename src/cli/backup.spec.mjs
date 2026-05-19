import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import backup from './backup.mjs';
import * as cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0, stdout: Buffer.from(''), stderr: Buffer.from('') })),
}));

describe('CLI Backup — tarball mode', () => {
  it('calls tar command for unencrypted backup', async () => {
    const backupSpy = vi.spyOn(cp, 'spawnSync');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const fsExistsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const fsStatSpy = vi.spyOn(fs, 'statSync').mockReturnValue({ size: 1024 });
    const fsMkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {});

    await backup(['--no-encrypt', '--output', '/tmp/test.tar.gz']);

    expect(backupSpy).toHaveBeenCalled();
    const shCall = backupSpy.mock.calls.find(c => c[0] === 'sh');
    expect(shCall[1][1]).toContain('tar -czf "/tmp/test.tar.gz"');

    exitSpy.mockRestore();
    consoleSpy.mockRestore();
    fsExistsSpy.mockRestore();
    fsStatSpy.mockRestore();
    fsMkdirSpy.mockRestore();
  });
});

describe('CLI Backup — --push-git mode', () => {
  let tmpHome;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-'));
    fs.mkdirSync(path.join(tmpHome, '.agent'), { recursive: true });
    vi.spyOn(os, 'homedir').mockReturnValue(tmpHome);
  });

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('initialises a git repo and pushes when .git is absent', async () => {
    const spawnMock = vi.spyOn(cp, 'spawnSync').mockImplementation((cmd, args) => {
      // Simulate: which git → ok; all git subcommands succeed
      if (cmd === 'which') return { status: 0, stdout: Buffer.from('/usr/bin/git'), stderr: Buffer.from('') };
      if (cmd === 'git') {
        // status --porcelain should return non-empty so commit is attempted
        if (args.includes('--porcelain')) return { status: 0, stdout: Buffer.from('M file.md'), stderr: Buffer.from('') };
        // remote get-url → fail (no remote yet)
        if (args.includes('get-url')) return { status: 1, stdout: Buffer.from(''), stderr: Buffer.from('') };
        return { status: 0, stdout: Buffer.from(''), stderr: Buffer.from('') };
      }
      return { status: 0, stdout: Buffer.from(''), stderr: Buffer.from('') };
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await backup(['--push-git', 'git@github.com:test/brain.git']);

    const gitCalls = spawnMock.mock.calls.filter(c => c[0] === 'git');
    const subcommands = gitCalls.map(c => c[1].find(a => !a.startsWith('-') && a !== 'git'));
    expect(subcommands).toContain('init');
    expect(subcommands).toContain('add');
    expect(subcommands).toContain('push');

    consoleSpy.mockRestore();
    spawnMock.mockRestore();
  });

  it('skips commit and push when vault is unchanged', async () => {
    const spawnMock = vi.spyOn(cp, 'spawnSync').mockImplementation((cmd, args) => {
      if (cmd === 'which') return { status: 0, stdout: Buffer.from('/usr/bin/git'), stderr: Buffer.from('') };
      if (cmd === 'git') {
        if (args.includes('--porcelain')) return { status: 0, stdout: Buffer.from(''), stderr: Buffer.from('') };
        if (args.includes('get-url')) return { status: 0, stdout: Buffer.from('git@github.com:test/brain.git'), stderr: Buffer.from('') };
        return { status: 0, stdout: Buffer.from(''), stderr: Buffer.from('') };
      }
      return { status: 0, stdout: Buffer.from(''), stderr: Buffer.from('') };
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await backup(['--push-git', 'git@github.com:test/brain.git']);

    const gitCalls = spawnMock.mock.calls.filter(c => c[0] === 'git');
    const subcommands = gitCalls.map(c => c[1][0]);
    expect(subcommands).not.toContain('push');

    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('unchanged');

    consoleSpy.mockRestore();
    spawnMock.mockRestore();
  });
});
