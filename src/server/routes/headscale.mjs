import express from 'express';
import { requireAuth } from '../auth.mjs';
import { getSecretsCatalog, getSecret } from '../../core/secrets-store.mjs';
import { BRAIN_DIR } from './_shared.mjs';
import { logger } from '../../core/logger.mjs';

const router = express.Router();

router.use(requireAuth);

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
    url: headscaleKey.headscale_url || 'http://localhost:8081',
    token: got.value
  };
}

async function fetchHeadscale(path, options = {}) {
  const { url, token } = await getHeadscaleConfig();
  
  // Strip trailing slash from url if present, and leading slash from path
  const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const targetUrl = `${baseUrl}${cleanPath}`;

  logger.info('headscale', `Proxying request to Headscale: ${options.method || 'GET'} ${targetUrl}`);

  const res = await fetch(targetUrl, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Headscale API error (${res.status} ${res.statusText}): ${errorText || 'No detail provided'}`);
  }

  // Certain responses might be empty (e.g. 204 or DELETE success)
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return { success: true };
}

router.get('/node', async (req, res) => {
  try {
    const data = await fetchHeadscale('/api/v1/node');
    res.json(data);
  } catch (err) {
    logger.error('headscale', `GET /node failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/node/:id', async (req, res) => {
  try {
    // According to headscale docs, node deletion is DELETE /api/v1/node/:id
    const data = await fetchHeadscale(`/api/v1/node/${req.params.id}`, { method: 'DELETE' });
    res.json(data);
  } catch (err) {
    logger.error('headscale', `DELETE /node/${req.params.id} failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

router.get('/preauthkey', async (req, res) => {
  try {
    // headscale requires a user parameter for preauth keys, query all or default
    const user = req.query.user || 'default';
    const data = await fetchHeadscale(`/api/v1/preauthkey?user=${user}`);
    res.json(data);
  } catch (err) {
    logger.error('headscale', `GET /preauthkey failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

router.post('/preauthkey', async (req, res) => {
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

router.get('/user', async (req, res) => {
  try {
    const data = await fetchHeadscale('/api/v1/user');
    res.json(data);
  } catch (err) {
    logger.error('headscale', `GET /user failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

export default router;
