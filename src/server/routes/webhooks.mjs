import { Router } from 'express';
import crypto from 'crypto';
import { ssssOperationHandler } from './ssss.mjs';
import { getNodes } from '../../core/vault-cache.mjs';

const router = Router();

// --- Configuration Management ---

router.get('/configs', async (req, res) => {
  try {
    const nodes = await getNodes();
    const configs = nodes
      .filter(n => n.frontmatter?.type === 'webhook_config')
      .map(n => ({
        provider: n.frontmatter.provider,
        status: n.frontmatter.status || 'inactive',
        secret: n.frontmatter.secret, // Provide secret (masked in UI, but needed for rotate validation check)
        events: n.frontmatter.events || [],
        endpoint_url: `/api/webhooks/${n.frontmatter.provider}`
      }));
    res.json(configs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/configs', async (req, res) => {
  try {
    const config = req.body;
    if (!config.provider) return res.status(400).json({ error: 'provider is required' });

    const mockReq = {
      body: {
        op: 'memory',
        category: 'system',
        content: `Webhook Configuration for ${config.provider}`,
        slug: `webhook-configs-${config.provider}`,
        metadata: {
          type: 'webhook_config',
          provider: config.provider,
          status: config.status || 'active',
          secret: config.secret || '',
          events: config.events || []
        }
      },
      user: req.user || { username: 'daemon-webhook' }
    };

    const mockRes = {
      json: (data) => res.json(data),
      status: (code) => ({
        json: (data) => res.status(code).json(data)
      })
    };

    await ssssOperationHandler(mockReq, mockRes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/configs/:provider', async (req, res) => {
  try {
    const mockReq = {
      body: {
        op: 'forget',
        slug: `webhook-configs-${req.params.provider}`
      },
      user: req.user || { username: 'daemon-webhook' }
    };
    
    const mockRes = {
      json: (data) => res.json(data),
      status: (code) => ({
        json: (data) => res.status(code).json(data)
      })
    };

    await ssssOperationHandler(mockReq, mockRes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Event Log Management ---

router.get('/events', async (req, res) => {
  try {
    const nodes = await getNodes();
    let events = nodes
      .filter(n => n.frontmatter?.type === 'webhook_event')
      .map(n => ({
        id: n.slug,
        provider: n.frontmatter.provider,
        event_type: n.frontmatter.event_type,
        received_at: n.frontmatter.received_at,
        payload: n.frontmatter.payload
      }));
      
    if (req.query.provider) {
      events = events.filter(e => e.provider === req.query.provider);
    }
    
    events.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
    res.json(events.slice(0, 50));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/test/:provider', async (req, res) => {
  try {
    await emitSsssEvent(req.params.provider, 'test_ping', { message: 'Test webhook payload' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mock function to retrieve secrets (in reality we would read from secrets.enc VFS or env)
async function getWebhookSecret(provider) {
  // Try to load from webhook VFS config docs
  try {
    const { getNodes } = await import('../../core/vault-cache.mjs');
    const nodes = await getNodes();
    const config = nodes.find(n => n.frontmatter?.type === 'webhook_config' && n.frontmatter?.provider === provider);
    if (config?.frontmatter?.secret) {
      return config.frontmatter.secret;
    }
  } catch (err) {
    // ignore
  }
  return process.env[`${provider.toUpperCase()}_WEBHOOK_SECRET`];
}

async function emitSsssEvent(provider, eventType, payload) {
  return new Promise((resolve, reject) => {
    const mockReq = {
      body: {
        op: 'memory',
        category: 'webhook',
        content: `Webhook event ${provider}.${eventType}`,
        slug: `webhook-event-${provider}-${Date.now()}`,
        metadata: {
          type: 'webhook_event',
          provider: provider,
          event_type: eventType,
          received_at: new Date().toISOString(),
          payload: payload
        }
      },
      user: { username: 'daemon-webhook' }
    };
    const mockRes = {
      json: (data) => resolve(data),
      status: (code) => ({
        json: (data) => reject(new Error(data.error || 'Unknown error'))
      })
    };
    ssssOperationHandler(mockReq, mockRes).catch(reject);
  });
}

function verifyGithubSignature(secret, payload, signature) {
  if (!signature) return false;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const expectedSignature = `sha256=${hmac.digest('hex')}`;
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

function verifyStripeSignature(secret, payload, signatureHeader) {
  if (!signatureHeader) return false;
  const parts = signatureHeader.split(',').reduce((acc, part) => {
    const [k, v] = part.split('=');
    acc[k] = v;
    return acc;
  }, {});
  
  if (!parts.t || !parts.v1) return false;
  
  const signedPayload = `${parts.t}.${payload}`;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(signedPayload);
  const expectedSignature = hmac.digest('hex');
  
  const sigBuf = Buffer.from(parts.v1);
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

function verifyNpmSignature(secret, payload, signature) {
  if (!signature) return false;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const expectedSignature = `sha256=${hmac.digest('hex')}`;
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

// We need raw body for signature verification, so we parse it here if not already parsed
import bodyParser from 'body-parser';

router.post('/:provider', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  const { provider } = req.params;
  const secret = await getWebhookSecret(provider);
  
  let parsedBody = {};
  if (req.body && req.body.length > 0) {
    try {
      parsedBody = JSON.parse(req.body.toString('utf8'));
    } catch (err) {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }
  }

  let eventType = 'unknown';

  if (provider === 'github') {
    const signature = req.headers['x-hub-signature-256'];
    if (secret && !verifyGithubSignature(secret, req.body, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    eventType = req.headers['x-github-event'] || 'unknown';
  } else if (provider === 'stripe') {
    const signature = req.headers['stripe-signature'];
    if (secret && !verifyStripeSignature(secret, req.body, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    eventType = parsedBody.type || 'unknown';
  } else if (provider === 'npm') {
    const signature = req.headers['x-npm-signature'];
    if (secret && !verifyNpmSignature(secret, req.body, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    eventType = parsedBody.event || 'unknown';
  } else {
    // allow generic providers without signature enforcement for testing
    eventType = parsedBody.event || parsedBody.type || 'generic_event';
  }

  try {
    await emitSsssEvent(provider, eventType, parsedBody);
    
    // Attempt to route to handler (Phase 3D)
    try {
      const { handleWebhook } = await import('../../core/webhook-handlers.mjs');
      await handleWebhook(provider, eventType, parsedBody);
    } catch (handlerErr) {
      // handlers module might not exist yet, or failed
    }

    res.json({ success: true, event: `${provider}.${eventType}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
