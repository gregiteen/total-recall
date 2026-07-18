import express from 'express';
import { requireAuth, requireScope } from '../auth.mjs';
import { getSecretsCatalog, getSecret } from '../../core/secrets-store.mjs';
import { BRAIN_DIR } from './_shared.mjs';
import { logger } from '../../core/logger.mjs';
import { throttledFetch } from '../../core/throttled-fetch.mjs';

const router = express.Router();

router.use('/api/headscale', requireAuth);

async function getHeadscaleConfig() {
  const catalog = await getSecretsCatalog(BRAIN_DIR);
  const headscaleKey = catalog.keys.find(k => k.provider === 'headscale');
  if (!headscaleKey) {
    throw new Error('Headscale API Key not configured in ApiKeysPage');
  }
  
  const got = await getSecret(BRAIN_DIR, headscaleKey.key, {
    action: 'use',
    actor: 'headscale-proxy'
  });
  if (!got.found || !got.value) {
    throw new Error('Headscale API Key token value is empty or not set');
  }

  return {
    url: headscaleKey.headscale_url || 'https://headscale.ultrachat.app',
    token: got.value
  };
}

async function fetchHeadscale(path, options = {}) {
  const { url, token } = await getHeadscaleConfig();
  const parsedBase = new URL(url);
  const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(parsedBase.hostname);
  if (parsedBase.protocol !== 'https:' && !(isLoopback && parsedBase.protocol === 'http:')) {
    throw new Error('Headscale URL must use HTTPS (HTTP is allowed only for loopback development)');
  }
  
  // Strip trailing slash from url if present, and leading slash from path
  const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const targetUrl = `${baseUrl}${cleanPath}`;

  logger.info('headscale', `Proxying request to Headscale: ${options.method || 'GET'} ${targetUrl}`);

  const res = await throttledFetch(targetUrl, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  }, 10_000);

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    const error = new Error(`Headscale API error (${res.status} ${res.statusText})`);
    error.status = res.status;
    error.detail = errorText.slice(0, 500);
    throw error;
  }

  // Certain responses might be empty (e.g. 204 or DELETE success)
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return { success: true };
}

async function fetchHeadscaleWithLegacyFallback(currentPath, legacyPath, options) {
  try {
    return await fetchHeadscale(currentPath, options);
  } catch (err) {
    if (err.status !== 404 || !legacyPath) throw err;
    return fetchHeadscale(legacyPath, options);
  }
}

router.get('/api/headscale/node', requireScope('config:read'), async (req, res) => {
  try {
    const data = await fetchHeadscaleWithLegacyFallback('/api/v1/node', '/api/v1/machine');
    res.json(data);
  } catch (err) {
    logger.error('headscale', `GET /node failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/headscale/node/:id', requireScope('config:write'), async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid node id' });
    const data = await fetchHeadscaleWithLegacyFallback(
      `/api/v1/node/${req.params.id}`,
      `/api/v1/machine/${req.params.id}`,
      { method: 'DELETE' },
    );
    res.json(data);
  } catch (err) {
    logger.error('headscale', `DELETE /node/${req.params.id} failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/headscale/preauthkey', requireScope('config:read'), async (req, res) => {
  try {
    const user = req.query.user ? String(req.query.user) : '';
    const data = await fetchHeadscale(`/api/v1/preauthkey${user ? `?user=${encodeURIComponent(user)}` : ''}`);
    res.json(data);
  } catch (err) {
    logger.error('headscale', `GET /preauthkey failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/headscale/preauthkey', requireScope('config:write'), async (req, res) => {
  try {
    const data = await fetchHeadscale('/api/v1/preauthkey', {
      method: 'POST',
      body: JSON.stringify(req.body)
    });
    res.json(data);
  } catch (err) {
    logger.error('headscale', `POST /preauthkey failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/headscale/user', requireScope('config:read'), async (req, res) => {
  try {
    const data = await fetchHeadscale('/api/v1/user');
    res.json(data);
  } catch (err) {
    logger.error('headscale', `GET /user failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

export default router;
