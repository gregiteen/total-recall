/**
 * Unit tests for Total Recall uninstaller
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import uninstall from './uninstall.mjs';

let tmpHome;
let tmpProject;
let origCwd;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-uninstall-home-'));
  tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-uninstall-proj-'));
  origCwd = process.cwd();
  process.chdir(tmpProject);
  
  // Set up mock process.env.HOME
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome);
});

afterEach(() => {
  process.chdir(origCwd);
  fs.rmSync(tmpHome, { recursive: true, force: true });
  fs.rmSync(tmpProject, { recursive: true, force: true });
});

async function runUninstall() {
  await uninstall();
}

describe('uninstall command', () => {
  it('purges global ~/.agent directory', async () => {
    const globalAgent = path.join(tmpHome, '.agent');
    fs.mkdirSync(globalAgent, { recursive: true });
    fs.writeFileSync(path.join(globalAgent, 'some-file.txt'), 'data', 'utf8');

    expect(fs.existsSync(globalAgent)).toBe(true);

    await runUninstall();

    expect(fs.existsSync(globalAgent)).toBe(false);
  });

  it('cleans up local .agent runtime folders but preserves skills and memory-vault if present', async () => {
    const localAgent = path.join(tmpProject, '.agent');
    fs.mkdirSync(localAgent, { recursive: true });
    
    // Create runtime subdirectories
    fs.mkdirSync(path.join(localAgent, 'sessions'), { recursive: true });
    fs.mkdirSync(path.join(localAgent, 'logs'), { recursive: true });
    fs.writeFileSync(path.join(localAgent, 'logs', 'daemon.pid'), '12345', 'utf8');
    
    // Create user subdirectories that should be preserved
    fs.mkdirSync(path.join(localAgent, 'skills'), { recursive: true });
    fs.writeFileSync(path.join(localAgent, 'skills', 'custom.md'), 'custom skill', 'utf8');

    await runUninstall();

    // Runtime folders should be deleted
    expect(fs.existsSync(path.join(localAgent, 'sessions'))).toBe(false);
    expect(fs.existsSync(path.join(localAgent, 'logs'))).toBe(false);
    
    // skills should be preserved
    expect(fs.existsSync(path.join(localAgent, 'skills'))).toBe(true);
    expect(fs.readFileSync(path.join(localAgent, 'skills', 'custom.md'), 'utf8')).toBe('custom skill');
  });

  it('removes symlink rule shims pointing to .agent or INSTRUCTIONS.md', async () => {
    fs.mkdirSync(path.join(tmpProject, '.agent'), { recursive: true });
    fs.writeFileSync(path.join(tmpProject, 'INSTRUCTIONS.md'), 'instructions', 'utf8');

    // Create a target rules symlink
    const claudeRules = path.join(tmpProject, 'CLAUDE.md');
    fs.symlinkSync('INSTRUCTIONS.md', claudeRules);

    // Create a symlink pointing elsewhere
    const unrelatedRules = path.join(tmpProject, 'unrelated.md');
    fs.writeFileSync(path.join(tmpProject, 'some-target.md'), 'target', 'utf8');
    fs.symlinkSync('some-target.md', unrelatedRules);

    await runUninstall();

    // Total Recall symlink should be removed
    expect(fs.existsSync(claudeRules)).toBe(false);
    
    // Unrelated symlink should be preserved
    expect(fs.existsSync(unrelatedRules)).toBe(true);
  });

  it('cleans injected memory blocks from rule files', async () => {
    const cursorRules = path.join(tmpProject, '.cursorrules');
    const originalContent = 'original user rule here\n<!-- BEGIN INJECTED MEMORY -->\ninjected memory\n<!-- END INJECTED MEMORY -->\nmore user rules';
    fs.writeFileSync(cursorRules, originalContent, 'utf8');

    await runUninstall();

    expect(fs.existsSync(cursorRules)).toBe(true);
    const cleaned = fs.readFileSync(cursorRules, 'utf8');
    expect(cleaned).toContain('original user rule here');
    expect(cleaned).toContain('more user rules');
    expect(cleaned).not.toContain('injected memory');
  });
});
