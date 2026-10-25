import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import brain from './brain.mjs';

describe('brain.mjs', () => {
  it('exports default', () => {
    expect(brain).toBeDefined();
  });
  it('registers an immediately usable UUID and refuses a failed provisioning fallback', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-brain-register-'));
    const agent = path.join(root, 'global-agent'), project = path.join(root, 'project');
    const previousCode = process.exitCode;
    vi.stubEnv('AGENT_DIR', agent);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      fs.mkdirSync(project);
      await brain(['register', project]);
      const registry = path.join(agent, 'skills/total-recall/config/project-registry.json');
      const [row] = JSON.parse(fs.readFileSync(registry, 'utf8'));
      const identity = path.join(row.brainDir, 'config/brain.json');
      expect(row.project_id).toBe(JSON.parse(fs.readFileSync(identity, 'utf8')).project_id);
      expect(row.project_id).toMatch(/^[0-9a-f-]{36}$/);
      const before = fs.readFileSync(registry, 'utf8');
      fs.writeFileSync(identity, '{malformed');
      await brain(['register', project]);
      expect(process.exitCode).toBe(1);
      expect(fs.readFileSync(identity, 'utf8')).toBe('{malformed');
      expect(fs.readFileSync(registry, 'utf8')).toBe(before);
    } finally {
      process.exitCode = previousCode;
      log.mockRestore(); error.mockRestore(); vi.unstubAllEnvs();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  it('register keeps brain state out of git, and import restores a vault through validated writes', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-brain-import-'));
    const agent = path.join(root, 'global-agent'), project = path.join(root, 'project'), archive = path.join(root, 'archive');
    const previousCode = process.exitCode;
    vi.stubEnv('AGENT_DIR', agent);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      fs.mkdirSync(project);
      await brain(['register', project]);
      expect(fs.readFileSync(path.join(project, '.gitignore'), 'utf8')).toContain('.agent/skills/total-recall/config/brain.json');

      fs.mkdirSync(path.join(archive, 'facts'), { recursive: true });
      fs.writeFileSync(path.join(archive, 'facts', 'archived-fact.md'),
        '---\ntype: memory\nslug: archived-fact\ntitle: Archived fact\ncategory: facts\nstatus: active\n---\n\nKept with its repository.\n');
      fs.writeFileSync(path.join(archive, 'index.md'), '# index\n');
      const vault = path.join(project, '.agent/skills/total-recall/memory-vault');

      await brain(['import', archive, '--to', project, '--dry-run']);
      expect(fs.existsSync(path.join(vault, 'facts', 'archived-fact.md'))).toBe(false);

      await brain(['import', archive, '--to', project]);
      expect(process.exitCode ?? 0).toBe(previousCode ?? 0);
      const written = fs.readFileSync(path.join(vault, 'facts', 'archived-fact.md'), 'utf8');
      expect(written).toContain('slug: archived-fact');
      expect(written).toContain('Kept with its repository.');

      log.mockClear();
      await brain(['import', archive, '--to', project]);
      expect(log.mock.calls.flat().join(' ')).toContain('Imported 0 node(s)');
    } finally {
      process.exitCode = previousCode;
      log.mockRestore(); error.mockRestore(); vi.unstubAllEnvs();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
