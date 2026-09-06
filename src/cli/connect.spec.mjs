/**
 * Projection smoke tests — Phase 5
 *
 * Verifies that `connect` writes the correct projection file or symlink
 * for Cursor, Claude Code, and Codex clients, and registers the client
 * in clients.json.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('../core/surface.mjs', () => ({
  compileSurface: vi.fn().mockImplementation(async ({ instructionsFile }) => {
    const fs = await import('node:fs');
    fs.writeFileSync(instructionsFile, '# Curated Instructions\n', 'utf8');
    return {
      nodesProcessed: 0,
      skillsInjected: 0,
      semanticIndexed: 0,
      semanticUnavailable: true
    };
  })
}));

// We need to control cwd, AGENT_DIR, and HOME so connect writes to a safe temp dir
let tmpProject;
let tmpAgentDir;
let tmpHome;
let origCwd;
let origAgentDir;
let origHome;

beforeEach(() => {
  tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-connect-proj-'));
  tmpAgentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-connect-agent-'));
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-connect-home-'));
  origCwd = process.cwd();
  origAgentDir = process.env.AGENT_DIR;
  origHome = process.env.HOME;
  process.chdir(tmpProject);
  process.env.AGENT_DIR = tmpAgentDir;
  process.env.HOME = tmpHome;

  // INSTRUCTIONS.md must exist for file/symlink projections
  fs.writeFileSync(
    path.join(tmpProject, 'INSTRUCTIONS.md'),
    '# Total Recall\n\nFIXTURE_CONTENT\n',
    'utf8'
  );
});

afterEach(() => {
  process.chdir(origCwd);
  if (origAgentDir === undefined) delete process.env.AGENT_DIR;
  else process.env.AGENT_DIR = origAgentDir;
  if (origHome === undefined) delete process.env.HOME;
  else process.env.HOME = origHome;
  fs.rmSync(tmpProject, { recursive: true, force: true });
  fs.rmSync(tmpAgentDir, { recursive: true, force: true });
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

async function runConnect(clientArgs) {
  // Fresh import each time (vitest caches, so we use a dynamic import with cache-bust)
  const { default: connect } = await import('./connect.mjs');
  await connect(clientArgs);
}

describe('connect — Cursor projection', () => {
  it('creates .cursor/rules/total-recall.mdc with YAML frontmatter', async () => {
    await runConnect(['cursor']);
    const targetPath = path.join(tmpProject, '.cursor', 'rules', 'total-recall.mdc');
    expect(fs.existsSync(targetPath)).toBe(true);
    const content = fs.readFileSync(targetPath, 'utf8');
    expect(content).toContain('alwaysApply: true');
    expect(content).toContain('FIXTURE_CONTENT');
  });

  it('registers cursor in clients.json', async () => {
    await runConnect(['cursor']);
    const registry = JSON.parse(
      fs.readFileSync(path.join(tmpAgentDir, 'skills', 'total-recall', 'config', 'clients.json'), 'utf8')
    );
    expect(registry.clients.cursor).toBeDefined();
    expect(registry.clients.cursor.mode).toBe('file');
    expect(registry.clients.cursor.projectionPath).toContain('.cursor');
  });

  it('skips overwrite without --force when file already exists', async () => {
    await runConnect(['cursor']);
    const targetPath = path.join(tmpProject, '.cursor', 'rules', 'total-recall.mdc');
    fs.writeFileSync(targetPath, 'ORIGINAL', 'utf8');
    await runConnect(['cursor']); // no --force
    expect(fs.readFileSync(targetPath, 'utf8')).toBe('ORIGINAL');
  });
});

describe('connect — Cline projection', () => {
  it('creates .clinerules/total-recall.md with plain markdown (no frontmatter)', async () => {
    await runConnect(['cline']);
    const targetPath = path.join(tmpProject, '.clinerules', 'total-recall.md');
    expect(fs.existsSync(targetPath)).toBe(true);
    const content = fs.readFileSync(targetPath, 'utf8');
    expect(content).toContain('FIXTURE_CONTENT');
    expect(content.startsWith('---')).toBe(false);
  });

  it('registers cline in clients.json', async () => {
    await runConnect(['cline']);
    const registryPath = path.join(tmpAgentDir, 'skills', 'total-recall', 'config', 'clients.json');
    expect(fs.existsSync(registryPath)).toBe(true);
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    expect(registry.clients.cline).toBeDefined();
    expect(registry.clients.cline.mode).toBe('file');
    expect(registry.clients.cline.projectionPath).toContain('.clinerules');
  });
});

describe('connect — Claude Code projection', () => {
  it('creates CLAUDE.md as a symlink to INSTRUCTIONS.md', async () => {
    await runConnect(['claude-code']);
    const targetPath = path.join(tmpProject, 'CLAUDE.md');
    expect(fs.existsSync(targetPath)).toBe(true);
    const stat = fs.lstatSync(targetPath);
    expect(stat.isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(targetPath)).toBe('INSTRUCTIONS.md');
  });

  it('registers claude-code in clients.json', async () => {
    await runConnect(['claude-code']);
    const registry = JSON.parse(
      fs.readFileSync(path.join(tmpAgentDir, 'skills', 'total-recall', 'config', 'clients.json'), 'utf8')
    );
    expect(registry.clients['claude-code']).toBeDefined();
    expect(registry.clients['claude-code'].mode).toBe('symlink');
  });
});

describe('connect — Codex projection', () => {
  it('creates AGENTS.md as a symlink to INSTRUCTIONS.md', async () => {
    await runConnect(['codex']);
    const targetPath = path.join(tmpProject, 'AGENTS.md');
    expect(fs.existsSync(targetPath)).toBe(true);
    const stat = fs.lstatSync(targetPath);
    expect(stat.isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(targetPath)).toBe('INSTRUCTIONS.md');
  });

  it('registers codex in clients.json', async () => {
    await runConnect(['codex']);
    const registry = JSON.parse(
      fs.readFileSync(path.join(tmpAgentDir, 'skills', 'total-recall', 'config', 'clients.json'), 'utf8')
    );
    expect(registry.clients.codex).toBeDefined();
    expect(registry.clients.codex.mode).toBe('symlink');
  });
});

describe('connect — repo skills projected as slash commands', () => {
  // Seed two repo skills in the agent dir (the connect skills source)
  function seedSkill(name, description) {
    const dir = path.join(tmpAgentDir, 'skills', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'SKILL.md'),
      `---\nname: ${name}\ndescription: "${description}"\n---\n\nBody for ${name}.\n`,
      'utf8'
    );
    return dir;
  }

  it('claude-code: symlinks each repo skill into <project>/.claude/skills/', async () => {
    const pushDir = seedSkill('push', 'Deploy to production');
    seedSkill('repo-expert', 'Understand the repo');
    await runConnect(['claude-code']);

    const link = path.join(tmpProject, '.claude', 'skills', 'push');
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(path.resolve(fs.readlinkSync(link))).toBe(path.resolve(pushDir));
    expect(fs.existsSync(path.join(link, 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpProject, '.claude', 'skills', 'repo-expert'))).toBe(true);
  });

  it('antigravity: projects repo skills into <project>/.agents/skills/', async () => {
    seedSkill('test', 'Run the test suite');
    await runConnect(['antigravity']);
    const link = path.join(tmpProject, '.agents', 'skills', 'test');
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
  });

  it('self-heals a stale/broken skill symlink without --force', async () => {
    const dir = seedSkill('push', 'Deploy to production');
    const destDir = path.join(tmpProject, '.claude', 'skills');
    fs.mkdirSync(destDir, { recursive: true });
    // Pre-create a broken symlink pointing at a moved/old location
    fs.symlinkSync('/nonexistent/old/repo/.agent/skills/push', path.join(destDir, 'push'));

    await runConnect(['claude-code']); // no --force
    const link = path.join(destDir, 'push');
    expect(fs.existsSync(link)).toBe(true); // resolves now
    expect(path.resolve(fs.readlinkSync(link))).toBe(path.resolve(dir));
  });
});

describe('connect — Hermes Agent projection', () => {
  it('writes MEMORY.md to ~/.hermes/memories/MEMORY.md and local .hermes/memories/MEMORY.md', async () => {
    await runConnect(['hermes']);
    const localTarget = path.join(tmpProject, '.hermes', 'memories', 'MEMORY.md');
    expect(fs.existsSync(localTarget)).toBe(true);
    const content = fs.readFileSync(localTarget, 'utf8');
    expect(content).toContain('FIXTURE_CONTENT');
  });

  it('registers hermes in clients.json', async () => {
    await runConnect(['hermes']);
    const registry = JSON.parse(
      fs.readFileSync(path.join(tmpAgentDir, 'skills', 'total-recall', 'config', 'clients.json'), 'utf8')
    );
    expect(registry.clients.hermes).toBeDefined();
    expect(registry.clients.hermes.mode).toBe('hermes');
  });
});

describe('connect — DeepSeek Harness (dsh) projection', () => {
  it('creates AGENTS.md as a symlink and writes ~/.dsh/memory/MEMORY.md', async () => {
    await runConnect(['dsh']);
    const targetPath = path.join(tmpProject, 'AGENTS.md');
    expect(fs.existsSync(targetPath)).toBe(true);
    const stat = fs.lstatSync(targetPath);
    expect(stat.isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(targetPath)).toBe('INSTRUCTIONS.md');
  });

  it('projects repo skills to <project>/.agents/skills for dsh', async () => {
    const dir = path.join(tmpAgentDir, 'skills', 'test-skill');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'SKILL.md'),
      '---\nname: test-skill\ndescription: "A test skill"\n---\nBody.\n',
      'utf8'
    );
    await runConnect(['dsh']);
    const link = path.join(tmpProject, '.agents', 'skills', 'test-skill');
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
  });

  it('registers dsh in clients.json', async () => {
    await runConnect(['dsh']);
    const registry = JSON.parse(
      fs.readFileSync(path.join(tmpAgentDir, 'skills', 'total-recall', 'config', 'clients.json'), 'utf8')
    );
    expect(registry.clients.dsh).toBeDefined();
    expect(registry.clients.dsh.mode).toBe('dsh');
  });
});

describe('connect — Core skills seeding', () => {
  it('seeds the master total-recall skill folder during connection bootstrap', async () => {
    // Delete pre-created instructions to trigger connection bootstrapping
    fs.rmSync(path.join(tmpProject, 'INSTRUCTIONS.md'), { force: true });

    await runConnect(['cursor']);
    const skillPath = path.join(tmpAgentDir, 'skills', 'total-recall');
    expect(fs.existsSync(skillPath)).toBe(true);
    expect(fs.existsSync(path.join(skillPath, 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(skillPath, "references", "architecture-reference.md"))).toBe(true);
    expect(fs.existsSync(path.join(skillPath, "evals", "evals.json"))).toBe(true);
  }, 30000);
});


