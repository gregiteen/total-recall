import { logger } from './logger.mjs';

/**
 * Verified webhooks are recorded as SSSS events by the route. They do not run
 * shell commands or deployments. Product-specific automation must subscribe to
 * those events through an explicitly reviewed workflow with its own gates.
 */
export async function handleWebhook(provider, eventType, _payload) {
  const known =
    (provider === 'github' && ['push', 'release'].includes(eventType)) ||
    (provider === 'stripe' && typeof eventType === 'string' && eventType.includes('.'));

  logger.info('webhooks', `Recorded ${provider}.${eventType} webhook`, {
    provider,
    eventType,
    automation: 'disabled',
  });
  return { handled: known, action: known ? 'recorded' : 'ignored' };
}
