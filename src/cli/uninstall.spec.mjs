/**
 * Unit tests for Total Recall uninstaller
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import uninstall from './uninstall.mjs';

vi.mock('./backup.mjs', () => {
  return {
    default: vi.fn().mockImplementation(async (args) => {
      if (args && args.some(arg => arg.includes('fail'))) {
        throw new Error('Push failed');
      }
      return { status: 0 };
    })
  };
});

vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    spawnSync: vi.fn().mockImplementation((cmd, args, opts) => {
      if (cmd === 'git' && args && args[0] === 'remote' && args[1] === 'get-url') {
        if (args.includes('fail') || (opts && opts.cwd && opts.cwd.includes('fail'))) {
          return { status: 1, stderr: Buffer.from('No remote found\n') };
        }
        return { status: 0, stdout: Buffer.from('git@github.com:gregiteen/backup-test.git\n') };
      }
      return original.spawnSync(cmd, args, opts);
    })
  };
});

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

async function runUninstall(args = []) {
  await uninstall(args);
}

describe('uninstall command', () => {
  it('removes total-recall brain from global ~/.agent', async () => {
    const globalAgent = path.join(tmpHome, '.agent');
    const globalBrain = path.join(globalAgent, 'skills', 'total-recall');
    fs.mkdirSync(path.join(globalBrain, 'memory-vault'), { recursive: true });
    fs.writeFileSync(path.join(globalBrain, 'memory-vault', 'node.md'), 'data', 'utf8');

    await runUninstall();

    // .agent/ stays, brain is removed
    expect(fs.existsSync(globalAgent)).toBe(true);
    expect(fs.existsSync(globalBrain)).toBe(false);
  });

  it('removes only total-recall brain and runtime shims, preserves .agent/ and other skills', async () => {
    const localAgent = path.join(tmpProject, '.agent');
    
    // Create the brain inside skills/total-recall/
    const brainDir = path.join(localAgent, 'skills', 'total-recall');
    fs.mkdirSync(path.join(brainDir, 'memory-vault'), { recursive: true });
    fs.writeFileSync(path.join(brainDir, 'memory-vault', 'test.md'), 'brain data', 'utf8');
    
    // Create another user skill that should NOT be touched
    fs.mkdirSync(path.join(localAgent, 'skills', 'my-custom-skill'), { recursive: true });
    fs.writeFileSync(path.join(localAgent, 'skills', 'my-custom-skill', 'SKILL.md'), 'custom', 'utf8');
    
    // Create an INSTRUCTIONS.md with injected blocks — should be stripped, not deleted
    const injectedContent = 'User rules\n<!-- BEGIN INJECTED MEMORY: do not edit -->' +
      '\ninjected stuff\n<!-- END INJECTED MEMORY -->\nMore user rules';
    fs.writeFileSync(path.join(localAgent, 'INSTRUCTIONS.md'), injectedContent, 'utf8');

    await runUninstall();

    // .agent/ and .agent/skills/ always stay
    expect(fs.existsSync(localAgent)).toBe(true);
    expect(fs.existsSync(path.join(localAgent, 'skills'))).toBe(true);
    
    // Other user skills stay
    expect(fs.readFileSync(path.join(localAgent, 'skills', 'my-custom-skill', 'SKILL.md'), 'utf8')).toBe('custom');
    
    // Brain removed
    expect(fs.existsSync(brainDir)).toBe(false);
    
    // INSTRUCTIONS.md stays but injected blocks are stripped
    expect(fs.existsSync(path.join(localAgent, 'INSTRUCTIONS.md'))).toBe(true);
    const cleaned = fs.readFileSync(path.join(localAgent, 'INSTRUCTIONS.md'), 'utf8');
    expect(cleaned).toContain('User rules');
    expect(cleaned).toContain('More user rules');
    expect(cleaned).not.toContain('injected stuff');
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

  it("cleans injected memory blocks from rule files", async () => {
    const cursorRules = path.join(tmpProject, ".cursorrules");
    const originalContent = "original user rule here\n<!-- BEGIN INJECTED MEMORY -->\ninjected memory\n<!-- END INJECTED MEMORY -->\nmore user rules";
    fs.writeFileSync(cursorRules, originalContent, "utf8");

    await runUninstall();

    expect(fs.existsSync(cursorRules)).toBe(true);
    const cleaned = fs.readFileSync(cursorRules, "utf8");
    expect(cleaned).toContain("original user rule here");
    expect(cleaned).toContain("more user rules");
    expect(cleaned).not.toContain("injected memory");
  });

  it("removes brain when git remote is detected", async () => {
    const localAgent = path.join(tmpProject, ".agent");
    const brainDir = path.join(localAgent, "skills", "total-recall");
    fs.mkdirSync(brainDir, { recursive: true });
    fs.mkdirSync(path.join(brainDir, ".git"), { recursive: true });

    await runUninstall([]);

    // .agent/ stays, brain is removed
    expect(fs.existsSync(localAgent)).toBe(true);
    expect(fs.existsSync(brainDir)).toBe(false);
  });

  it("removes brain with --purge flag", async () => {
    const localAgent = path.join(tmpProject, ".agent");
    const brainDir = path.join(localAgent, "skills", "total-recall");
    fs.mkdirSync(brainDir, { recursive: true });
    fs.writeFileSync(path.join(brainDir, "test.md"), "data", "utf8");

    await runUninstall(["--purge"]);

    // .agent/ stays, brain is removed
    expect(fs.existsSync(localAgent)).toBe(true);
    expect(fs.existsSync(brainDir)).toBe(false);
  });

  it("falls back to local tarball and proceeds when git push fails", async () => {
    const localAgent = path.join(tmpProject, ".agent");
    fs.mkdirSync(localAgent, { recursive: true });
    fs.mkdirSync(path.join(localAgent, "skills", "total-recall"), { recursive: true });
    fs.mkdirSync(path.join(localAgent, "skills", "total-recall", ".git"), { recursive: true });

    await runUninstall(["--push-git", "fail"]);

    // Tarball fallback succeeds, so uninstall proceeds — .agent/ stays, brain removed
    expect(fs.existsSync(localAgent)).toBe(true);
    expect(fs.existsSync(path.join(localAgent, 'skills', 'total-recall'))).toBe(false);
  });
});
