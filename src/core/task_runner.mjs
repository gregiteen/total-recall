import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { atomicWrite, safeStringify } from './vault.mjs';
import { logger } from './logger.mjs';

/**
 * Task Runner for Total Recall
 * Reads pending tasks from .agent/scheduler/queue/, sorts by priority, and executes them.
 */

export function loadPendingTasks(queueDir) {
  if (!fs.existsSync(queueDir)) return [];

  const tasks = [];
  const files = fs.readdirSync(queueDir);

  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const filePath = path.join(queueDir, file);
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const { data, content } = matter(raw);
      if (data.type === 'task' && data.status === 'pending') {
        tasks.push({ ...data, body: content.trim(), filepath: filePath });
      }
    } catch (err) {
      logger.warn('task-runner', `Failed to parse task ${file}`, { err: err.message });
    }
  }

  // Sort by priority (higher priority = lower number)
  return tasks.sort((a, b) => a.priority - b.priority);
}

export function updateTaskStatus(task, newStatus, error = null) {
  const { filepath, body, ...frontmatter } = task;
  frontmatter.status = newStatus;
  
  if (error) {
    frontmatter.error = error;
  }

  const raw = safeStringify(body || '', frontmatter);
  atomicWrite(filepath, raw);
  return { ...task, status: newStatus };
}

/**
 * Executes a single task.
 */
export async function executeTask(task, context) {
  logger.info('task-runner', `Executing Task [P${task.priority}]: ${task.target}`);
  updateTaskStatus(task, 'in_progress');

  try {
    // In a real implementation, this would route to specific subagents/workflows
    // based on task.category. For now, we simulate execution.
    switch (task.category) {
      case 'skill-engineering':
        await handleSkillEngineering(task, context);
        break;
      case 'memory-maintenance':
        await handleMemoryMaintenance(task, context);
        break;
      case 'system2-deliberation':
        await handleSystem2Deliberation(task, context);
        break;
      case 'proactive-research':
        logger.info('task-runner', 'Handling Deep Research...');
        const { handleProactiveResearch } = await import('./research.mjs');
        const report = await handleProactiveResearch(task, context);
        task.body = `# Deep Research Report\n\n${report}`;
        break;
      case 'self-evaluation':
      case 'exploration':
        logger.info('task-runner', `Handling ${task.category}...`);
        // Simulated work
        await new Promise(resolve => setTimeout(resolve, 500));
        break;
      default:
        throw new Error(`Unknown task category: ${task.category}`);
    }

    updateTaskStatus(task, 'done');
    logger.info('task-runner', `Completed Task: ${task.target}`);
  } catch (err) {
    logger.error('task-runner', `Failed Task: ${task.target}`, { err: err.message });
    updateTaskStatus(task, 'failed', err.message);
  }
}

async function handleSkillEngineering(task, context) {
  // E.g., spawn an agent with the template to create a skill
  logger.info('task-runner', `Engineering skill: ${task.target}`);
}

async function handleMemoryMaintenance(task, context) {
  logger.info('task-runner', `Running memory maintenance for: ${task.target}`);
}

async function handleSystem2Deliberation(task, context) {
  logger.info('task-runner', `Running System 2 deliberation for: ${task.target}`);
}

import { runCrons } from './crons.mjs';

/**
 * Main loop for the task runner.
 */
export async function runTaskQueue(queueDir, context) {
  logger.info('task-runner', 'Starting Task Runner...');
  
  // Run background daemon crons (examine code, sync, secret management)
  await runCrons(context);

  const pending = loadPendingTasks(queueDir);

  if (pending.length === 0) {
    logger.info('task-runner', 'No pending tasks in queue.');
    return;
  }

  logger.info('task-runner', `Found ${pending.length} pending tasks.`);

  for (const task of pending) {
    await executeTask(task, context);
  }

  logger.info('task-runner', 'Task Runner queue empty.');
}
