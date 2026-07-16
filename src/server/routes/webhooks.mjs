import { Router } from 'express';
import crypto from 'crypto';
import { ssssOperationHandler } from './ssss.mjs';

const router = Router();

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
        op: 'event',
        category: 'webhook',
        event_type: `${provider}.${eventType}`,
        payload: payload
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
  
  const rawBody = req.body;
  let parsedBody;
  try {
    parsedBody = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  let eventType = 'unknown';

  if (provider === 'github') {
    const signature = req.headers['x-hub-signature-256'];
    if (secret && !verifyGithubSignature(secret, rawBody, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    eventType = req.headers['x-github-event'] || 'unknown';
  } else if (provider === 'stripe') {
    const signature = req.headers['stripe-signature'];
    if (secret && !verifyStripeSignature(secret, rawBody, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    eventType = parsedBody.type || 'unknown';
  } else if (provider === 'npm') {
    const signature = req.headers['x-npm-signature'];
    if (secret && !verifyNpmSignature(secret, rawBody, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    eventType = parsedBody.event || 'unknown';
  } else {
    return res.status(400).json({ error: 'Unknown provider' });
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
