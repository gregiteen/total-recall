import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(REPO, 'scaffold/.agent/skills/total-recall/scripts/sync-repo.mjs');

// This script shipped for a long time as a stub that printed "Synced and verified
// skill: <name>", "Merging core invariants non-destructively" and "Sync Completed
// Successfully!" while fetching, merging and writing nothing — and the skill's
// Core Directive #4 told agents to run it to keep skills current. These tests pin
// the behaviours that made it fake, so it cannot silently regress.
describe('sync-repo', () => {
  let dir;
  const run = (args = []) =>
    execFileSync('node', [SCRIPT, ...args], {
      encoding: 'utf8',
      env: { ...process.env, AGENT_DIR: path.join(dir, 'agent') },
    });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-syncspec-'));
    fs.mkdirSync(path.join(dir, 'agent/skills/total-recall'), { recursive: true });
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const skillMd = () => path.join(dir, 'agent/skills/total-recall/SKILL.md');

  it('actually writes template content instead of only reporting success', () => {
    fs.writeFileSync(skillMd(), '# stale placeholder\n');
    const out = run();
    expect(out).toMatch(/file\(s\) updated/);
    const after = fs.readFileSync(skillMd(), 'utf8');
    expect(after).not.toContain('stale placeholder');
    expect(after.length).toBeGreaterThan(1000);
  });

  it("preserves the destination's compiled injected-memory block", () => {
    const marker = 'REPO SPECIFIC COMPILED MEMORY';
    fs.writeFileSync(
      skillMd(),
      `# old\n\n<!-- BEGIN INJECTED MEMORY: rebuilt by total-recall surface -->\n${marker}\n<!-- END INJECTED MEMORY -->\n`,
    );
    run();
    const after = fs.readFileSync(skillMd(), 'utf8');
    expect(after).toContain(marker);
    expect(after).not.toContain('# old');
  });

  it('never writes into memory-vault — that is user memory, not a template', () => {
    const vault = path.join(dir, 'agent/skills/total-recall/memory-vault');
    fs.mkdirSync(vault, { recursive: true });
    const node = path.join(vault, 'mine.md');
    fs.writeFileSync(node, 'user authored\n');
    run();
    expect(fs.readFileSync(node, 'utf8')).toBe('user authored\n');
  });

  it('--dry-run reports changes without writing them', () => {
    fs.writeFileSync(skillMd(), '# untouched\n');
    const out = run(['--dry-run']);
    expect(out).toMatch(/would change/);
    expect(fs.readFileSync(skillMd(), 'utf8')).toBe('# untouched\n');
  });

  it('fails loudly when there is no brain rather than claiming success', () => {
    fs.rmSync(path.join(dir, 'agent/skills/total-recall'), { recursive: true, force: true });
    let threw = false;
    try { run(); } catch (e) {
      threw = true;
      expect(`${e.stdout ?? ''}${e.stderr ?? ''}`).toMatch(/no brain at/);
    }
    expect(threw).toBe(true);
  });
});
