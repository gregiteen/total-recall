import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
vi.mock('./logger.mjs', () => ({ logger: { info() {}, warn() {}, error() {} } }));
vi.mock('./session-watcher.mjs', () => ({ scanAndIngest: vi.fn(() => ({ ingested: 0 })) }));
vi.mock('./surface.mjs', () => ({ compileSurface: vi.fn(async () => {}) }));
vi.mock('./optimizer.mjs', () => ({
  generateMemoryCleanupProposals: vi.fn(async () => []), generateStaleKnowledgeRefreshProposals: vi.fn(async () => []),
  evaluateProposalGate: vi.fn(), dedupeProposals: vi.fn(p => ({ kept: p, suppressed: 0 })), runSmartDecay: vi.fn(async () => []),
}));
vi.mock('./proposal-applier.mjs', () => ({ applyAcceptedProposals: vi.fn(async () => ({})) }));
vi.mock('./vault-cache.mjs', () => ({ getNodes: vi.fn(() => []) }));
vi.mock('./vault.mjs', async original => ({ ...await original(), writeNode: vi.fn(async () => {}) }));
vi.mock('./research-queue.mjs', () => ({ loadQueue: vi.fn(() => []) }));
import { runDreamCycle } from './dream.mjs';
import { scanAndIngest } from './session-watcher.mjs';
import { compileSurface } from './surface.mjs';
import { runSmartDecay } from './optimizer.mjs';
import { writeNode } from './vault.mjs';

describe('dream brain isolation and failures', () => {
  let tmp;
  beforeEach(() => { tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dream-cycle-'))); vi.clearAllMocks(); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });
  function options(name) {
    const brain = path.join(tmp, name);
    const opts = { vaultDir: path.join(brain, 'memory-vault'), derivedDir: path.join(brain, 'memory-derived'),
      conflictsDir: path.join(brain, 'memory-inbox/conflicts'), skillsDir: path.join(brain, 'skills'), instructionsFile: path.join(tmp, name, 'INSTRUCTIONS.md') };
    fs.mkdirSync(opts.vaultDir, { recursive: true });
    return opts;
  }
  it('binds sessions, REM candidates, decay and compilation to each supplied brain', async () => {
    for (const name of ['a', 'b']) {
      const opts = options(name);
      const inbox = path.join(tmp, name, 'memory-inbox/pending'); fs.mkdirSync(inbox, { recursive: true });
      fs.writeFileSync(path.join(inbox, 'candidate.md'), `---\nslug: candidate-${name}\nstatus: draft\nconfidence: 1\nimportance: 3\n---\nBrain ${name} fact\n`);
      expect(await runDreamCycle(opts)).toEqual({ status: 'success' });
      expect(scanAndIngest).toHaveBeenLastCalledWith(path.join(tmp, name, 'sessions'));
      expect(runSmartDecay).toHaveBeenLastCalledWith(opts.vaultDir, undefined, undefined, { derivedDir: opts.derivedDir });
      expect(compileSurface).toHaveBeenLastCalledWith({ vaultDir: opts.vaultDir, skillsDir: opts.skillsDir, derivedDir: opts.derivedDir, instructionsFile: opts.instructionsFile });
      expect(writeNode).toHaveBeenCalledWith(expect.objectContaining({ slug: `candidate-${name}` }), opts.vaultDir);
    }
  });
  it('reports a phase failure instead of returning success', async () => {
    compileSurface.mockRejectedValueOnce(new Error('compile denied'));
    const result = await runDreamCycle(options('failed'));
    expect(result).toMatchObject({ status: 'failed', errors: ['Deep Sleep compile failed: compile denied'] });
    expect(runSmartDecay).toHaveBeenCalled();
  });
});
