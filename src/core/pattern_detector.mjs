import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { atomicWrite, safeStringify } from './vault.mjs';

/**
 * Pattern Detection Module
 * Scans session logs for repeated failures, questions, or missing knowledge,
 * and generates Proactive Research or Skill Engineering tasks.
 */

export function scanForMissingKnowledge(sessionsDir, existingSkills) {
  if (!fs.existsSync(sessionsDir)) return [];

  const missingKnowledgeSignals = [];
  const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));

  for (const file of files) {
    const lines = fs.readFileSync(path.join(sessionsDir, file), 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type !== 'observation' && entry.type !== 'task') continue;

        const content = (entry.content || '').toLowerCase();
        
        // Heuristic: Does the agent repeatedly fail to find a tool or skill?
        if (
          content.includes('i don\'t know how to') ||
          content.includes('missing skill') ||
          content.includes('no instructions found for') ||
          content.includes('unfamiliar with')
        ) {
          missingKnowledgeSignals.push({
            topic: extractTopic(content),
            session: entry.id,
            ts: entry.ts,
            raw: entry.content
          });
        }
      } catch (err) {
        // Skip malformed
      }
    }
  }

  return aggregateSignals(missingKnowledgeSignals, existingSkills);
}

/**
 * Very basic heuristic to pull out the topic from a failure message.
 */
function extractTopic(text) {
  const match = text.match(/(?:missing skill|no instructions found for|unfamiliar with)\s+([a-zA-Z0-9_-]+)/i);
  return match ? match[1].toLowerCase() : 'unknown-topic';
}

/**
 * Group signals and threshold them to generate tasks.
 */
function aggregateSignals(signals, existingSkills) {
  const frequency = new Map();
  for (const sig of signals) {
    if (sig.topic === 'unknown-topic') continue;
    // Don't generate tasks for skills that already exist
    if (existingSkills.some(s => s.name === sig.topic)) continue;

    const count = frequency.get(sig.topic) || 0;
    frequency.set(sig.topic, count + 1);
  }

  const tasks = [];
  for (const [topic, count] of frequency.entries()) {
    if (count >= 2) { // Threshold: User/Agent tripped over this 2+ times
      tasks.push(generateSkillTask(topic, count));
    }
  }

  return tasks;
}

function generateSkillTask(topic, count) {
  const slug = `learn-${topic}-${Date.now().toString(36)}`;
  return {
    type: 'task',
    slug,
    priority: 50, // Mid-priority
    category: 'skill-engineering',
    target: `skills/${topic}-expert.md`,
    estimated_calls: 15,
    deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    created_by: 'pattern-detector',
    reason: `Agent failed to execute workflows related to '${topic}' ${count} times. Missing skill.`,
    status: 'pending',
    progress: 0,
    body: `## Objective\nResearch and build a new skill module for ${topic}.\n\n## Steps\n1. Web search ${topic} docs.\n2. Write draft SKILL.md.\n3. Validate against SSSS schema.`
  };
}

export function writeTasksToQueue(tasks, queueDir) {
  if (!fs.existsSync(queueDir)) {
    fs.mkdirSync(queueDir, { recursive: true });
  }

  for (const task of tasks) {
    const filePath = path.join(queueDir, `${task.slug}.md`);
    const { body, slug, ...frontmatter } = task;
    const raw = safeStringify(body, frontmatter);
    atomicWrite(filePath, raw);
    console.log(`[Pattern Detector] Created Task: ${slug}`);
  }
}
