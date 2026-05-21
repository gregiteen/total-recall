/**
 * Projection smoke tests — Phase 5
 *
 * Verifies that `connect` writes the correct projection file or symlink
 * for Cursor, Claude Code, and Codex clients, and registers the client
 * in clients.json.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// We need to control cwd and AGENT_DIR so connect writes to a safe temp dir
let tmpProject;
let tmpAgentDir;
let origCwd;
let origAgentDir;

beforeEach(() => {
  tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-connect-proj-'));
  tmpAgentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-connect-agent-'));
  origCwd = process.cwd();
  origAgentDir = process.env.AGENT_DIR;
  process.chdir(tmpProject);
  process.env.AGENT_DIR = tmpAgentDir;

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
  fs.rmSync(tmpProject, { recursive: true, force: true });
  fs.rmSync(tmpAgentDir, { recursive: true, force: true });
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
      fs.readFileSync(path.join(tmpAgentDir, 'config', 'clients.json'), 'utf8')
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
      fs.readFileSync(path.join(tmpAgentDir, 'config', 'clients.json'), 'utf8')
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
      fs.readFileSync(path.join(tmpAgentDir, 'config', 'clients.json'), 'utf8')
    );
    expect(registry.clients.codex).toBeDefined();
    expect(registry.clients.codex.mode).toBe('symlink');
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
    expect(fs.existsSync(path.join(skillPath, 'references', 'architecture-reference.md'))).toBe(true);
    expect(fs.existsSync(path.join(skillPath, 'evals', 'evals.json'))).toBe(true);
  }, 30000);
});

