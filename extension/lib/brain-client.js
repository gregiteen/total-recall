// Brain API Client for Total Recall Chrome Extension
// Shared by background.js, popup, sidepanel, and options page.
// Exposed as `self.BrainClient` namespace (no ES-module bundler required).

const DEFAULT_BRAIN_URL = 'http://127.0.0.1:3000';

async function getConfig() {
  const config = await chrome.storage.sync.get(['brainUrl', 'pat']);
  return {
    brainUrl: config.brainUrl || DEFAULT_BRAIN_URL,
    pat: config.pat || ''
  };
}

async function brainFetch(path, options = {}) {
  const { brainUrl, pat } = await getConfig();
  const url = `${brainUrl}${path}`;
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (pat) headers['Authorization'] = `Bearer ${pat}`;

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    throw new Error('Authentication failed — check your PAT token');
  }
  if (!res.ok) throw new Error(`Brain API error: ${res.status}`);
  return res.json();
}

async function share(data) {
  return brainFetch('/api/share', { method: 'POST', body: JSON.stringify(data) });
}

async function search(query, topK = 3) {
  return brainFetch('/api/memory/search/semantic', {
    method: 'POST',
    body: JSON.stringify({ query, top_k: topK })
  });
}

async function chat(messages, options = {}) {
  const { brainUrl, pat } = await getConfig();
  const url = `${brainUrl}/v1/chat/completions`;
  const headers = { 'Content-Type': 'application/json' };
  if (pat) headers['Authorization'] = `Bearer ${pat}`;
  if (options.sessionId) headers['x-session-id'] = options.sessionId;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messages,
      model: options.model || 'gemini',
      brainId: options.brainId || 'global',
      groundingNodes: options.groundingNodes || []
    })
  });
  if (res.status === 401) throw new Error('Authentication failed — check your PAT token');
  if (!res.ok) throw new Error(`Brain API error: ${res.status}`);
  return res.json();
}

// Expose as a global namespace for non-module contexts (service worker, popup, etc.)
self.BrainClient = { getConfig, brainFetch, share, search, healthCheck, chat };
