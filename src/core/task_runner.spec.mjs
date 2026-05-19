import fs from 'fs';
import os from 'os';
import path from 'path';
import matter from 'gray-matter';
import { describe, expect, it } from 'vitest';
import { executeTask, loadPendingTasks, updateTaskStatus } from './task_runner.mjs';
import { TaskSchema } from './schema.mjs';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'total-recall-task-runner-'));
}

function writeTask(dir, frontmatter, body = 'Task body') {
  const filepath = path.join(dir, `${frontmatter.target || 'task'}.md`);
  fs.writeFileSync(filepath, matter.stringify(body, frontmatter), 'utf8');
  return filepath;
}

describe('task runner', () => {
  it('writes schema-valid status values', () => {
    const dir = tempDir();
    const filepath = writeTask(dir, {
      type: 'task',
      priority: 1,
      category: 'system2-deliberation',
      target: 'status-test',
      status: 'pending',
      x_memory_layer: 'system2',
    });

    const [task] = loadPendingTasks(dir);
    updateTaskStatus(task, 'in_progress');
    let parsed = matter(fs.readFileSync(filepath, 'utf8')).data;
    expect(TaskSchema.safeParse(parsed).success).toBe(true);

    updateTaskStatus({ ...task, status: 'in_progress' }, 'done');
    parsed = matter(fs.readFileSync(filepath, 'utf8')).data;
    expect(TaskSchema.safeParse(parsed).success).toBe(true);
  });

  it('executes System 2 deliberation tasks to done', async () => {
    const dir = tempDir();
    const filepath = writeTask(dir, {
      type: 'task',
      priority: 1,
      category: 'system2-deliberation',
      target: 'layer-plan',
      status: 'pending',
      x_memory_layer: 'system2',
    });

    const [task] = loadPendingTasks(dir);
    await executeTask(task, {});

    const parsed = matter(fs.readFileSync(filepath, 'utf8')).data;
    expect(parsed.status).toBe('done');
    expect(TaskSchema.safeParse(parsed).success).toBe(true);
  });
});
