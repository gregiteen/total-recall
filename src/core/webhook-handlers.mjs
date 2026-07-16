import { buildTaskEnvelope } from './task-envelope.mjs';
import { persistTaskToDisk } from './scheduler.mjs';
import { brainDir } from './config.mjs';
import path from 'node:path';
import { logger } from './logger.mjs';

const QUEUE_DIR = path.join(brainDir, 'scheduler', 'queue');

export async function handleWebhook(provider, eventType, payload) {
  logger.info({ subsystem: 'webhooks', message: `Handling ${provider}.${eventType} webhook` });

  if (provider === 'github' && eventType === 'push') {
    // Emit deploy event via task queue
    const env = buildTaskEnvelope({
      intent: 'Auto-deploy triggered by push',
      slug: `deploy-${Date.now().toString(36)}`,
      kind: 'system',
      executor: 'command',
      category: 'deployment',
      priority: 80,
      system: true,
      origin: { agent: 'daemon', created_by: 'webhook-github' },
      capabilities: ['vault:read'],
      payload: { command: 'bash bin/deploy.sh' }
    });
    persistTaskToDisk(env, QUEUE_DIR);
    logger.info({ subsystem: 'webhooks', message: 'Queued deploy task' });
  } else if (provider === 'github' && eventType === 'release') {
    // Emit skill-sync event
    const env = buildTaskEnvelope({
      intent: 'Skill sync triggered by release',
      slug: `skillsync-${Date.now().toString(36)}`,
      kind: 'system',
      executor: 'command',
      category: 'sync',
      priority: 70,
      system: true,
      origin: { agent: 'daemon', created_by: 'webhook-github' },
      capabilities: ['vault:read'],
      payload: { command: 'npx total-recall skill sync' }
    });
    persistTaskToDisk(env, QUEUE_DIR);
    logger.info({ subsystem: 'webhooks', message: 'Queued skill-sync task' });
  } else if (provider === 'npm' && eventType === 'package-publish') {
    // NPM publish event (using 'package-publish' as assumed event type)
    const env = buildTaskEnvelope({
      intent: 'Package update triggered by npm publish',
      slug: `npm-${Date.now().toString(36)}`,
      kind: 'system',
      executor: 'command',
      category: 'package',
      priority: 60,
      system: true,
      origin: { agent: 'daemon', created_by: 'webhook-npm' },
      capabilities: ['vault:read'],
      payload: { command: 'npm update' }
    });
    persistTaskToDisk(env, QUEUE_DIR);
    logger.info({ subsystem: 'webhooks', message: 'Queued npm update task' });
  } else {
    logger.info({ subsystem: 'webhooks', message: `No specific handler for ${provider}.${eventType}` });
  }
}
