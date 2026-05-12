import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { atomicWrite } from './vault.mjs';

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
      console.warn(`Failed to parse task ${file}: ${err.message}`);
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

  const raw = matter.stringify(body || '', frontmatter);
  atomicWrite(filepath, raw);
  return { ...task, status: newStatus };
}

/**
 * Executes a single task.
 */
export async function executeTask(task, context) {
  console.log(`[Task Runner] Executing Task [P${task.priority}]: ${task.target}`);
  updateTaskStatus(task, 'in-progress');

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
      case 'proactive-research':
        console.log(`[Task Runner] Handling Deep Research...`);
        const { handleProactiveResearch } = await import('./research.mjs');
        const report = await handleProactiveResearch(task, context);
        task.body = `# Deep Research Report\n\n${report}`;
        break;
      case 'self-evaluation':
      case 'exploration':
        console.log(`[Task Runner] Handling ${task.category}...`);
        // Simulated work
        await new Promise(resolve => setTimeout(resolve, 500));
        break;
      default:
        throw new Error(`Unknown task category: ${task.category}`);
    }

    updateTaskStatus(task, 'completed');
    console.log(`[Task Runner] ✅ Completed Task: ${task.target}`);
  } catch (err) {
    console.error(`[Task Runner] ❌ Failed Task: ${task.target}`, err.message);
    updateTaskStatus(task, 'failed', err.message);
  }
}

async function handleSkillEngineering(task, context) {
  // E.g., spawn an agent with the template to create a skill
  console.log(`   Engineering skill: ${task.target}`);
}

async function handleMemoryMaintenance(task, context) {
  console.log(`   Running memory maintenance for: ${task.target}`);
}

/**
 * Main loop for the task runner.
 */
export async function runTaskQueue(queueDir, context) {
  console.log('\n🚀 Starting Task Runner...');
  const pending = loadPendingTasks(queueDir);

  if (pending.length === 0) {
    console.log('   No pending tasks in queue.');
    return;
  }

  console.log(`   Found ${pending.length} pending tasks.`);

  for (const task of pending) {
    await executeTask(task, context);
  }

  console.log('🛑 Task Runner queue empty.');
}
