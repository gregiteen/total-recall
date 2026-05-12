import { describe, it, expect, vi } from 'vitest';
import backup from './backup.mjs';
import * as cp from 'node:child_process';
import fs from 'node:fs';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0 })),
  execSync: vi.fn(() => true)
}));

describe('CLI Backup', () => {
  it('calls tar command for unencrypted backup', async () => {
    const backupSpy = vi.spyOn(cp, 'spawnSync');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const fsExistsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const fsStatSpy = vi.spyOn(fs, 'statSync').mockReturnValue({ size: 1024 });
    const fsCopySpy = vi.spyOn(fs, 'copyFileSync').mockImplementation(() => {});
    const fsMkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {});

    await backup(['--no-encrypt', '--output', '/tmp/test.tar.gz']);

    expect(backupSpy).toHaveBeenCalled();
    const calls = backupSpy.mock.calls;
    const shCall = calls.find(call => call[0] === 'sh');
    expect(shCall[1][1]).toContain('tar -czf "/tmp/test.tar.gz"');

    exitSpy.mockRestore();
    consoleSpy.mockRestore();
    fsExistsSpy.mockRestore();
    fsStatSpy.mockRestore();
    fsCopySpy.mockRestore();
    fsMkdirSpy.mockRestore();
  });
});
