// Total Recall — Brain API client
// Shared by the service worker, side panel and options page (classic scripts,
// no bundler), exposed as `self.BrainClient`.
//
// Every request carries `x-total-recall-brain` so search, capture, listing and
// chat all act on the brain the user selected, not silently on the global one.

(function () {
  'use strict';

  const DEFAULT_BRAIN_URL = 'http://127.0.0.1:3000';
  const DEFAULT_TIMEOUT_MS = 20000;
  const CHAT_TIMEOUT_MS = 300000; // agent-routed answers with tool use can take minutes

  class BrainError extends Error {
    /** @param {'offline'|'unauthorized'|'forbidden'|'http'|'timeout'|'unconfigured'} code */
    constructor(code, message, status) {
      super(message);
      this.name = 'BrainError';
      this.code = code;
      this.status = status || 0;
    }
  }

  function normalizeUrl(raw) {
    const url = String(raw || '').trim().replace(/\/+$/, '');
    return url || DEFAULT_BRAIN_URL;
  }

  async function getConfig() {
    const [local, sync] = await Promise.all([
      chrome.storage.local.get(['brainUrl', 'pat']),
      chrome.storage.sync.get(['brainUrl', 'pat', 'activeBrainId']),
    ]);

    // PATs belong in extension-local storage only; migrate any legacy synced copy.
    if (sync.pat && !local.pat) {
      await chrome.storage.local.set({ pat: sync.pat });
      local.pat = sync.pat;
    }
    if (sync.pat) await chrome.storage.sync.remove('pat');

    return {
      brainUrl: normalizeUrl(local.brainUrl || sync.brainUrl),
      pat: local.pat || '',
      activeBrainId: sync.activeBrainId || 'global',
    };
  }

  function setAuthBadge(broken) {
    if (!chrome.action) return;
    if (broken) {
      chrome.action.setBadgeBackgroundColor({ color: '#f87171' });
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setTitle({ title: 'Total Recall: sign-in needed. Check your access token in Settings.' });
    } else {
      chrome.action.getBadgeText({}).then((text) => {
        if (text === '!') chrome.action.setBadgeText({ text: '' });
      }).catch(() => {});
      chrome.action.setTitle({ title: 'Open Total Recall' });
    }
  }

  /**
   * @param {string} path
   * @param {{method?: string, body?: any, timeoutMs?: number, brainScoped?: boolean, config?: object}} [opts]
   */
  async function request(path, opts = {}) {
    const config = opts.config || await getConfig();
    const headers = { Accept: 'application/json' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (config.pat) headers.Authorization = `Bearer ${config.pat}`;
    if (opts.brainScoped !== false && config.activeBrainId && config.activeBrainId !== 'global') {
      headers['x-total-recall-brain'] = config.activeBrainId;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs || DEFAULT_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(`${config.brainUrl}${path}`, {
        method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'),
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      if (err && err.name === 'AbortError') throw new BrainError('timeout', 'The brain took too long to answer.');
      throw new BrainError('offline', `Can't reach the brain at ${config.brainUrl}.`);
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401) {
      setAuthBadge(true);
      throw new BrainError(config.pat ? 'unauthorized' : 'unconfigured',
        config.pat ? 'The brain rejected your access token.' : 'Add an access token in Settings to connect.', 401);
    }
    if (res.status === 403) {
      throw new BrainError('forbidden', 'Your access token lacks the scope for this action.', 403);
    }

    let data = null;
    const text = await res.text();
    if (text) {
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
    }
    if (!res.ok) {
      const detail = (data && (data.error || data.message)) || `HTTP ${res.status}`;
      throw new BrainError('http', detail, res.status);
    }
    setAuthBadge(false);
    return data;
  }

  // ---- Endpoints ----------------------------------------------------------

  const api = {
    health: (config) => request('/health', { config, brainScoped: false }),
    extensionStatus: () => request('/api/extension/status', { brainScoped: false }),
    listBrains: () => request('/api/brains', { brainScoped: false }),

    async search(query, { topK = 8, includeSessions = false } = {}) {
      try {
        const data = await request('/api/memory/search/semantic', {
          body: { query, top_k: topK, include_sessions: includeSessions },
        });
        return (data && data.results) || [];
      } catch (err) {
        // 503 = embeddings index not built yet: an empty result, not a failure.
        if (err.code === 'http' && err.status === 503) return [];
        throw err;
      }
    },

    async listRecent(limit = 8) {
      const data = await request(`/api/memory?sort=recent&limit=${limit}`);
      const nodes = (data && data.nodes) || [];
      // Older brains ignore sort=recent; order client-side as a fallback.
      return nodes.slice().sort((a, b) => (Date.parse(b.created) || 0) - (Date.parse(a.created) || 0));
    },

    async findByUrl(url) {
      const data = await request(`/api/memory?q=${encodeURIComponent(url)}&limit=5`);
      return (data && data.nodes) || [];
    },

    share: (payload) => request('/api/share', { body: payload }),

    chat(messages, { groundingNodes } = {}) {
      // No `model` field: the brain routes with the user's runtime config. Naming a
      // model here would override that routing for every extension request.
      return request('/v1/chat/completions', {
        body: { messages, groundingNodes: groundingNodes || [] },
        timeoutMs: CHAT_TIMEOUT_MS,
      }).then((data) => {
        const choice = data && data.choices && data.choices[0];
        return {
          content: (choice && choice.message && choice.message.content) || '',
          model: data && data.model,
        };
      });
    },

    async listResearch() {
      // The server lists pending before in_progress; fetch enough to include every
      // running item even behind a long queue.
      const data = await request('/api/research?limit=500', { brainScoped: false });
      return {
        items: (data && (data.items || data.projects)) || [],
        counts: (data && data.counts) || {},
      };
    },
    queueResearch: (topic, notes) => request('/api/research', { body: { topic, notes: notes || '', via: 'extension' }, brainScoped: false }),
    cancelResearch: (id) => request(`/api/research/${encodeURIComponent(id)}`, { method: 'DELETE', brainScoped: false }),

    compile: () => request('/api/vault/compile', { method: 'POST', body: {}, timeoutMs: 120000 }),

    async dashboardUrl(path = '/') {
      const { brainUrl } = await getConfig();
      return `${brainUrl}${path}`;
    },
  };

  self.BrainClient = { DEFAULT_BRAIN_URL, BrainError, getConfig, normalizeUrl, request, ...api };
})();
