import { Router } from 'express';
import crypto from 'node:crypto';
import { requireAuth, requireScope } from '../auth.mjs';
import { BRAIN_DIR } from './_shared.mjs';
import { getSecret, setSecret } from '../../core/secrets-store.mjs';
import { findVfsDocumentByPath, listVfsDocumentsUnder } from '../../core/vfs-documents.mjs';
import {
  appendVfsEvent,
  deleteVfsDocument,
  listVfsEvents,
  patchVfsDocument,
  writeVfsDocument,
} from '../../core/ssss-operation-service.mjs';
import { handleWebhook } from '../../core/webhook-handlers.mjs';
import { logger } from '../../core/logger.mjs';

const router = Router();
const PROVIDERS = new Set(['github', 'stripe', 'npm']);
const CONFIGURABLE_PROVIDERS = new Set(['github', 'stripe']);
const STRIPE_TOLERANCE_SECONDS = 300;
const SENSITIVE_KEY = /(authorization|cookie|credential|password|secret|signature|token)/i;
/** Dedicated event workspace — avoid scanning 100MB+ default.jsonl for webhook history. */
const WEBHOOK_EVENT_WORKSPACE = 'webhooks';

function webhookEventOpts(intent) {
  return {
    actorRole: 'system',
    intent,
    workspaceId: WEBHOOK_EVENT_WORKSPACE,
  };
}

async function listWebhookEventsFromStore() {
  return listVfsEvents({ workspaceId: WEBHOOK_EVENT_WORKSPACE });
}

function providerName(value) {
  const provider = String(value || '').trim().toLowerCase();
  if (!PROVIDERS.has(provider)) throw new Error('Unsupported webhook provider');
  return provider;
}

function configPath(provider) {
  return `system/webhook-configs/${provider}.md`;
}

function secretRef(provider) {
  return `${provider.toUpperCase()}_WEBHOOK_SECRET`;
}

async function getWebhookSecret(provider) {
  const ref = secretRef(provider);
  const stored = await getSecret(BRAIN_DIR, ref, { action: 'use', actor: 'webhook-ingress' });
  return stored.found && stored.value ? stored.value : process.env[ref] || null;
}

function publicConfig(doc) {
  const fm = doc.frontmatter;
  return {
    provider: fm.provider,
    status: fm.status || 'inactive',
    secret_ref: fm.secret_ref,
    events: fm.events || [],
    endpoint_url: `/api/webhooks/${fm.provider}`,
  };
}

function redactPayload(value, depth = 0) {
  if (depth > 12) return '[depth-limit]';
  if (Array.isArray(value)) return value.slice(0, 500).map((item) => redactPayload(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const redacted = {};
  for (const [key, item] of Object.entries(value).slice(0, 500)) {
    redacted[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redactPayload(item, depth + 1);
  }
  return redacted;
}

function getConfig(provider) {
  return findVfsDocumentByPath(configPath(provider));
}

router.get(
  '/api/webhooks/configs',
  requireAuth,
  requireScope('config:read'),
  async (_req, res) => {
    try {
      const configs = listVfsDocumentsUnder('system/webhook-configs')
        .filter((doc) => doc.type === 'webhook_config')
        .map(publicConfig);
      res.json(await Promise.all(configs.map(async (config) => ({
        ...config,
        has_secret: !!(await getWebhookSecret(config.provider)),
      }))));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

router.post(
  '/api/webhooks/configs',
  requireAuth,
  requireScope('config:write'),
  async (req, res) => {
    try {
      const provider = providerName(req.body?.provider);
      if (!CONFIGURABLE_PROVIDERS.has(provider)) {
        return res.status(422).json({ error: 'npm webhook ingress is disabled because no official signing contract is configured' });
      }
      const ref = secretRef(provider);
      if (req.body?.secret) {
        await setSecret(BRAIN_DIR, ref, req.body.secret, {
          provider,
          scope: 'global',
          actor: 'webhook-config',
          notes: `Signing secret for ${provider} webhook ingress`,
        });
      } else if (!(await getWebhookSecret(provider))) {
        return res.status(400).json({ error: 'A signing secret is required' });
      }

      const events = Array.isArray(req.body?.events)
        ? req.body.events.filter((event) => typeof event === 'string').slice(0, 50)
        : [];
      const existing = getConfig(provider);
      const timestamp = new Date().toISOString();
      if (existing) {
        await patchVfsDocument(configPath(provider), {
          status: req.body?.status === 'inactive' ? 'inactive' : 'active',
          secret_ref: ref,
          events,
          timestamp,
        }, { actorRole: 'admin', intent: `Update ${provider} webhook configuration` });
      } else {
        await writeVfsDocument(configPath(provider), {
          type: 'webhook_config',
          title: `${provider} Webhook Configuration`,
          description: `Signed ${provider} webhook ingress configuration`,
          timestamp,
          provider,
          status: req.body?.status === 'inactive' ? 'inactive' : 'active',
          secret_ref: ref,
          events,
        }, 'The secret value is stored only in the encrypted Total Recall secrets store.', {
          actorRole: 'admin',
          intent: `Create ${provider} webhook configuration`,
        });
      }
      res.status(existing ? 200 : 201).json({
        provider,
        status: req.body?.status === 'inactive' ? 'inactive' : 'active',
        has_secret: true,
        events,
        endpoint_url: `/api/webhooks/${provider}`,
      });
    } catch (err) {
      const status = /Unsupported|signing secret|required/.test(err.message) ? 400 : 500;
      res.status(status).json({ error: err.message });
    }
  },
);

router.delete(
  '/api/webhooks/configs/:provider',
  requireAuth,
  requireScope('config:write'),
  async (req, res) => {
    try {
      const provider = providerName(req.params.provider);
      const existing = getConfig(provider);
      if (!existing) return res.status(404).json({ error: 'Webhook configuration not found' });
      await deleteVfsDocument(configPath(provider), {
        actorRole: 'admin',
        intent: `Delete ${provider} webhook configuration`,
      });
      res.json({ success: true, provider });
    } catch (err) {
      res.status(/Unsupported/.test(err.message) ? 400 : 500).json({ error: err.message });
    }
  },
);

router.get(
  '/api/webhooks/events',
  requireAuth,
  requireScope('config:read'),
  async (req, res) => {
    try {
      let events = (await listWebhookEventsFromStore())
        .filter((event) => event.payload?.kind === 'webhook_event')
        .map((event) => ({ id: event.event_id, ...event.payload }));
      if (req.query.provider) events = events.filter((event) => event.provider === req.query.provider);
      events.sort((a, b) => new Date(b.received_at) - new Date(a.received_at));
      res.json(events.slice(0, 50));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

/**
 * Re-run handler for a previously recorded webhook event (dashboard re-deliver).
 * Uses the redacted stored payload — suitable for replaying handleWebhook side effects,
 * not for reconstructing raw signed ingress.
 */
router.post(
  '/api/webhooks/events/:id/redeliver',
  requireAuth,
  requireScope('config:write'),
  async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'Event id is required' });
      const all = await listWebhookEventsFromStore();
      const match = all.find((event) => event.event_id === id && event.payload?.kind === 'webhook_event');
      if (!match) return res.status(404).json({ error: 'Webhook event not found' });
      const p = match.payload || {};
      const provider = providerName(p.provider);
      const eventType = p.event_type || 'unknown';
      const handled = await handleWebhook(provider, eventType, p.payload || {});
      const at = new Date().toISOString();
      await appendVfsEvent(`webhooks/${provider}/redeliver-${crypto.randomUUID()}`, {
        kind: 'webhook_event',
        provider,
        event_type: eventType,
        received_at: at,
        delivery_id: p.delivery_id || null,
        parent_event_id: id,
        payload: p.payload ?? null,
        delivery_status: handled?.handled ? 'redelivered' : 'redelivered_recorded',
      }, webhookEventOpts(`Re-deliver ${provider} webhook event`));
      res.json({
        success: true,
        handled: !!handled?.handled,
        parent_event_id: id,
        delivery_status: handled?.handled ? 'redelivered' : 'redelivered_recorded',
      });
    } catch (err) {
      res.status(/Unsupported/.test(err.message) ? 400 : 500).json({ error: err.message });
    }
  },
);

router.post(
  '/api/webhooks/test/:provider',
  requireAuth,
  requireScope('config:write'),
  async (req, res) => {
    try {
      const provider = providerName(req.params.provider);
      await appendVfsEvent(`webhooks/${provider}/test`, {
        kind: 'webhook_event',
        provider,
        event_type: 'test_ping',
        received_at: new Date().toISOString(),
        payload: { message: 'Test webhook payload' },
        delivery_status: 'test',
      }, webhookEventOpts('Record dashboard webhook test'));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

function timingSafeTextEqual(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function verifyGithubSignature(secret, payload, signature) {
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
  return timingSafeTextEqual(signature, expected);
}

function verifyStripeSignature(secret, payload, signatureHeader, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!signatureHeader) return false;
  const parts = signatureHeader.split(',').map((part) => part.split('=', 2));
  const timestamp = Number(parts.find(([key]) => key === 't')?.[1]);
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > STRIPE_TOLERANCE_SECONDS) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return signatures.some((signature) => timingSafeTextEqual(signature, expected));
}

router.post('/api/webhooks/:provider', async (req, res) => {
  let provider;
  try {
    provider = providerName(req.params.provider);
  } catch {
    return res.status(404).json({ error: 'Unsupported webhook provider' });
  }

  if (provider === 'npm') {
    return res.status(501).json({ error: 'npm webhook ingress is disabled until a documented signing contract is configured' });
  }

  const payload = req.rawBody || (Buffer.isBuffer(req.body) ? req.body : null);
  if (!payload) return res.status(400).json({ error: 'Raw webhook body is unavailable' });

  const config = getConfig(provider);
  if (!config || config.frontmatter?.status !== 'active') {
    return res.status(503).json({ error: 'Webhook provider is not actively configured' });
  }

  const secret = await getWebhookSecret(provider);
  if (!secret) return res.status(503).json({ error: 'Webhook signing secret is not configured' });

  let parsedBody;
  try {
    parsedBody = JSON.parse(payload.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  let eventType;
  let valid;
  if (provider === 'github') {
    eventType = req.headers['x-github-event'] || 'unknown';
    valid = verifyGithubSignature(secret, payload, req.headers['x-hub-signature-256']);
  } else {
    eventType = parsedBody.type || 'unknown';
    valid = verifyStripeSignature(secret, payload, req.headers['stripe-signature']);
  }
  if (!valid) return res.status(401).json({ error: 'Invalid or expired signature' });

  const subscribedEvents = Array.isArray(config.frontmatter?.events) ? config.frontmatter.events : [];
  if (subscribedEvents.length > 0 && !subscribedEvents.includes(String(eventType))) {
    return res.status(202).json({ accepted: true, handled: false, reason: 'event-not-subscribed' });
  }

  const delivery_id = provider === 'github'
    ? String(req.headers['x-github-delivery'] || '')
    : String(parsedBody.id || '');
  if (delivery_id) {
    const priorEvents = await listWebhookEventsFromStore();
    const duplicate = priorEvents.some((event) => (
      event.payload?.kind === 'webhook_event' &&
      event.payload?.provider === provider &&
      event.payload?.delivery_id === delivery_id
    ));
    if (duplicate) return res.json({ success: true, duplicate: true, handled: false });
  }

  try {
    const handled = await handleWebhook(provider, eventType, parsedBody);
    await appendVfsEvent(`webhooks/${provider}/${crypto.randomUUID()}`, {
      kind: 'webhook_event',
      provider,
      event_type: eventType,
      received_at: new Date().toISOString(),
      delivery_id: delivery_id || null,
      payload: redactPayload(parsedBody),
      delivery_status: handled?.handled ? 'handled' : 'recorded',
    }, webhookEventOpts(`Record verified ${provider} webhook`));
    res.json({ success: true, event: `${provider}.${eventType}`, handled: !!handled?.handled });
  } catch (err) {
    logger.error('webhooks', 'Verified webhook processing failed', { provider, eventType, error: err.message });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
