import fs from 'fs';
import path from 'path';
import os from 'os';
import { updateBlackboardState } from './src/core/blackboard.mjs';
import { writeTasksToQueue } from './src/core/pattern_detector.mjs';
import { runTaskQueue } from './src/core/task_runner.mjs';

const HOME = os.homedir();
const AGENT_DIR = path.join(HOME, '.agent');
const QUEUE_DIR = path.join(AGENT_DIR, 'scheduler', 'queue');
const BLACKBOARD_DIR = path.join(AGENT_DIR, 'blackboard');

console.log('🧪 Testing End-to-End Skill Generation Task');

// 1. Simulate Pattern Detector generating a task
const task = {
  type: 'task',
  slug: `learn-stripe-${Date.now()}`,
  priority: 10,
  category: 'skill-engineering',
  target: 'skills/stripe-expert.md',
  estimated_calls: 15,
  deadline: new Date(Date.now() + 86400000).toISOString(),
  created_by: 'test-runner',
  reason: 'Agent failed to implement Stripe checkout 3 times.',
  status: 'pending',
  progress: 0,
  body: 'Research Stripe Checkout API and generate a skill.'
};

writeTasksToQueue([task], QUEUE_DIR);

// 2. Simulate Blackboard state during the task
const boardId = `workflow-${task.slug}`;
updateBlackboardState(boardId, BLACKBOARD_DIR, { phase: 'research', queries: ['stripe checkout quickstart'] });
updateBlackboardState(boardId, BLACKBOARD_DIR, { phase: 'drafting', draftPath: path.join(AGENT_DIR, 'skills', 'stripe-expert', 'SKILL.md') });

// 3. Run the Task Scheduler
await runTaskQueue(QUEUE_DIR, { simulated: true });

console.log('✅ End-to-End task execution verified.');
