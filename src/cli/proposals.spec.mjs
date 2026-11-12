import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import proposals from './proposals.mjs';

describe('proposals.mjs', () => {
  it('exports default', () => {
    expect(proposals).toBeDefined();
  });
  it('keeps stale queries read-only and states that research is explicit', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'proposals-stale-'));
    const vault = path.join(temp, 'skills/total-recall/memory-vault');
    fs.mkdirSync(path.join(vault, 'facts'), { recursive: true });
    const file = path.join(vault, 'facts/stale.md');
    fs.writeFileSync(file, '---\ntype: memory\nslug: stale\ncategory: facts\nstatus: active\nimportance: 4\nlast_accessed: 2020-01-01T00:00:00Z\n---\nOld observation.\n');
    const before = fs.readFileSync(file, 'utf8');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubEnv('AGENT_DIR', temp); vi.stubEnv('_TR_TEST_AGENT_DIR', temp);
    try {
      await proposals(['stale', '--project']);
      const output = log.mock.calls.flat().join('\n');
      expect(output).toContain('stale');
      expect(output).toContain('read-only');
      expect(output).toContain('Request research explicitly');
      expect(output).not.toContain('automatically');
      expect(fs.readFileSync(file, 'utf8')).toBe(before);
      expect(fs.readdirSync(vault)).toEqual(['facts']);
    } finally {
      vi.unstubAllEnvs(); log.mockRestore(); fs.rmSync(temp, { recursive: true, force: true });
    }
  });
});
