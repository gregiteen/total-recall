import { it, expect, vi } from 'vitest';
vi.mock('./skill-gap.mjs', () => ({ requestSkillGap: vi.fn(async () => ({ success: true, executor: 'skill-manager', output: 'draft filed' })) }));
import { requestSkillGap } from './skill-gap.mjs';
import { dispatchTask } from './task-executors.mjs';
it('routes legacy skill gaps with their recorded topic and session evidence', async () => {
  const result = await dispatchTask({ slug: 'skill-gap-old', category: 'skill-engineering', source_session: 's',
    reason: 'Agent struggled with topic "formatting" during a conversation.' }, { projectRoot: '/fixture' });
  expect(result.success).toBe(true);
  expect(requestSkillGap).toHaveBeenCalledWith('formatting', 'session://s', { projectRoot: '/fixture' });
});
it('does not complete a skill task when its owner rejects the request', async () => {
  requestSkillGap.mockRejectedValueOnce(new Error('Skill-manager gap is unavailable'));
  const result = await dispatchTask({ category: 'skill-engineering', payload: { topic: 'formatting', evidence: 'session://s' } }, {});
  expect(result).toMatchObject({ success: false, executor: 'skill-manager', error: 'Skill-manager gap is unavailable' });
});
