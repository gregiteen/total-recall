import { it, expect, vi } from 'vitest';
import { requestSkillGap } from './skill-gap.mjs';

it('fails clearly until skill-manager declares the gap operation', async () => {
  const run = vi.fn();
  await expect(requestSkillGap('topic', 'session://s', { discover: () => [], run })).rejects.toThrow('total-recall skill-manager gap');
  expect(run).not.toHaveBeenCalled();
});
it('calls the owner CLI with literal topic and evidence arguments and propagates failures', async () => {
  const plugin = { id: 'skill-manager', valid: true, manifest: { cli: { subcommands: [{ name: 'gap' }] } } };
  const run = vi.fn(async () => ({ ok: true, stdout: 'queued' }));
  const opts = { discover: () => [plugin], run, projectRoot: '/fixture' };
  expect((await requestSkillGap('$(literal topic)', 'session://s/turns/1-10', opts)).success).toBe(true);
  expect(run).toHaveBeenCalledWith(plugin, { subcommand: 'gap', args: ['$(literal topic)', '--evidence', 'session://s/turns/1-10'], cwd: '/fixture' });
  run.mockResolvedValue({ ok: false, stderr: 'owner failed' });
  await expect(requestSkillGap('topic', 'session://s', opts)).rejects.toThrow('owner failed');
});
