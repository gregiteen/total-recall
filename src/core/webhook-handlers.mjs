import fs from 'node:fs';
import path from 'node:path';
import { buildTaskEnvelope } from './task-envelope.mjs';
import { persistTaskToDisk } from './scheduler.mjs';
import { brainDir } from './config.mjs';
import { logger } from './logger.mjs';

const QUEUE_DIR = path.join(brainDir, 'scheduler', 'queue');

/** Fixed slug so re-pushes overwrite one card instead of flooding the queue. */
const DEPLOY_SLUG = 'deploy-auto';
const SKILL_SYNC_SLUG = 'skillsync-auto';
const NPM_UPDATE_SLUG = 'npm-update-auto';

/**
 * True when a queue file already exists for this slug (pending/in-progress).
 * Avoids N× "Auto-deploy" cards for every GitHub push delivery / multi-ref push.
 */
function hasPendingTask(slug) {
  try {
    return fs.existsSync(path.join(QUEUE_DIR, `${slug}.md`));
  } catch {
    return false;
  }
}

/**
 * GitHub may fire multiple push webhooks (multi-repo, multi-ref, redeliveries).
 * Only production/main refs matter for deploy notices; always coalesce to one task.
 */
function pushRefIsDeployable(payload = {}) {
  const ref = String(payload.ref || '');
  if (!ref) return true; // tests / bare payload still queue once
  return (
    ref === 'refs/heads/production' ||
    ref === 'refs/heads/main' ||
    ref.endsWith('/production') ||
    ref.endsWith('/main')
  );
}

export async function handleWebhook(provider, eventType, payload = {}) {
  logger.info({ subsystem: 'webhooks', message: `Handling ${provider}.${eventType} webhook` });

  if (provider === 'github' && eventType === 'push') {
    if (!pushRefIsDeployable(payload)) {
      logger.info({
        subsystem: 'webhooks',
        message: `Skipping deploy queue for non-deploy ref ${payload.ref || '(none)'}`,
      });
      return { queued: false, reason: 'ref_not_deployable' };
    }
    if (hasPendingTask(DEPLOY_SLUG)) {
      logger.info({
        subsystem: 'webhooks',
        message: 'Deploy task already pending — not queuing another (coalesce)',
      });
      return { queued: false, reason: 'already_pending', slug: DEPLOY_SLUG };
    }
    // Notify-only card: real production deploy is the droplet watcher on push to production.
    // Do NOT run bin/deploy.sh here — that caused multi-deploy spam and wrong deploy path.
    const env = buildTaskEnvelope({
      intent: 'Auto-deploy triggered by push',
      slug: DEPLOY_SLUG,
      kind: 'system',
      executor: 'command',
      category: 'deployment',
      priority: 80,
      system: true,
      origin: { agent: 'daemon', created_by: 'webhook-github' },
      capabilities: ['vault:read'],
      payload: {
        command: 'echo "Deploy notice only — production droplet auto-deploy handles the real ship"',
        ref: payload.ref || null,
        after: payload.after || null,
        repository: payload.repository?.full_name || null,
      },
    });
    persistTaskToDisk(env, QUEUE_DIR);
    logger.info({ subsystem: 'webhooks', message: 'Queued single coalesced deploy notice task' });
    return { queued: true, slug: DEPLOY_SLUG };
  }

  if (provider === 'github' && eventType === 'release') {
    if (hasPendingTask(SKILL_SYNC_SLUG)) {
      return { queued: false, reason: 'already_pending', slug: SKILL_SYNC_SLUG };
    }
    const env = buildTaskEnvelope({
      intent: 'Skill sync triggered by release',
      slug: SKILL_SYNC_SLUG,
      kind: 'system',
      executor: 'command',
      category: 'sync',
      priority: 70,
      system: true,
      origin: { agent: 'daemon', created_by: 'webhook-github' },
      capabilities: ['vault:read'],
      payload: { command: 'npx total-recall skill sync' },
    });
    persistTaskToDisk(env, QUEUE_DIR);
    logger.info({ subsystem: 'webhooks', message: 'Queued skill-sync task' });
    return { queued: true, slug: SKILL_SYNC_SLUG };
  }

  if (provider === 'npm' && eventType === 'package-publish') {
    if (hasPendingTask(NPM_UPDATE_SLUG)) {
      return { queued: false, reason: 'already_pending', slug: NPM_UPDATE_SLUG };
    }
    const env = buildTaskEnvelope({
      intent: 'Package update triggered by npm publish',
      slug: NPM_UPDATE_SLUG,
      kind: 'system',
      executor: 'command',
      category: 'package',
      priority: 60,
      system: true,
      origin: { agent: 'daemon', created_by: 'webhook-npm' },
      capabilities: ['vault:read'],
      payload: { command: 'npm update' },
    });
    persistTaskToDisk(env, QUEUE_DIR);
    logger.info({ subsystem: 'webhooks', message: 'Queued npm update task' });
    return { queued: true, slug: NPM_UPDATE_SLUG };
  }

  logger.info({ subsystem: 'webhooks', message: `No specific handler for ${provider}.${eventType}` });
  return { queued: false, reason: 'no_handler' };
}
