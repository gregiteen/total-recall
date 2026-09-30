import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import skillCli from './skill.mjs';
import { registerSkill, loadRegistry, saveRegistry, resolveRegistryPath } from '../core/skills-registry.mjs';

describe('targeted skill sync collision reporting', () => {
  it.each(['push', 'sync', 'pull'])('%s reports refusal without success or writes', async (verb) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-sync-cli-'));
    const agentDir = path.join(root, 'agent');
    const brain = path.join(agentDir, 'skills', 'total-recall');
    const source = path.join(root, 'source', 'test-global');
    const install = path.join(root, 'install', 'test-global');
    const priorExit = process.exitCode;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('AGENT_DIR', agentDir);
    vi.stubEnv('TR_SYNC_REPOS', '');
    try {
      for (const [dir, description] of [[source, 'canonical'], [install, 'divergent']]) {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: test-global\ndescription: ${description}\n---\n${description}\n`);
      }
      registerSkill(brain, source, { authoritative_scope: true });
      const registry = loadRegistry(brain);
      registry.installs.push({ skill_id: 'test-global', path: install, discovered: true });
      saveRegistry(brain, registry);
      const paths = [resolveRegistryPath(brain), path.join(source, 'SKILL.md'), path.join(install, 'SKILL.md')];
      const before = paths.map(file => fs.readFileSync(file, 'utf8'));
      process.exitCode = 0;
      await skillCli([verb, 'test-global', '--global', '--skip-discover', '--dry-run']);
      expect(process.exitCode).toBe(1);
      expect(error.mock.calls.flat().join('\n')).toMatch(/unadopted same-name skill collision/);
      expect(log.mock.calls.flat().join('\n')).not.toMatch(/Winner:|no copies needed|already in sync/);
      expect(paths.map(file => fs.readFileSync(file, 'utf8'))).toEqual(before);
    } finally {
      process.exitCode = priorExit;
      vi.unstubAllEnvs();
      log.mockRestore();
      error.mockRestore();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
