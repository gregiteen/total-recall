/**
 * src/core/ollama-embeddings.mjs
 *
 * Local / mesh Ollama embedding provider.
 *
 * Two properties here are load-bearing:
 *
 *   1. No hardcoded host. The endpoint comes from explicit config, then the
 *      loopback default, then live mesh discovery. A machine name baked into
 *      product code would leak one operator's topology into every install.
 *
 *   2. No hardcoded model. The model is selected from what the server actually
 *      reports — filtered by its declared capability and matched against the
 *      vault's vector width. Pinning a name would break the day it is renamed,
 *      unpulled, or superseded by a better one.
 *
 * Calls go through plain fetch rather than throttledFetch: this is local
 * infrastructure on the operator's own mesh, not a rate-limited third-party
 * API, and it must keep working when the outbound network policy is strict.
 */

import { logger } from './logger.mjs';

const OLLAMA_DEFAULT_PORT = 11434;
const PROBE_TIMEOUT_MS = 2500;
const SHOW_TIMEOUT_MS = 5000;
const EMBED_TIMEOUT_MS = 30000;
const DISCOVERY_TTL_MS = 5 * 60_000;

/** fetch with a hard deadline. Manual controller — AbortSignal.timeout has bitten this file before. */
async function fetchWithDeadline(url, options = {}, timeoutMs = PROBE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Accepts `host`, `host:port`, or a full URL — OLLAMA_HOST is used all three ways in the wild. */
export function normalizeBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const u = new URL(withScheme);
    if (!u.port && !/:\d+$/.test(u.host)) u.port = String(OLLAMA_DEFAULT_PORT);
    return u.origin;
  } catch {
    return null;
  }
}

/** Explicitly configured endpoints, highest precedence first. */
function configuredBaseUrls() {
  return [process.env.TR_OLLAMA_URL, process.env.OLLAMA_HOST]
    .map(normalizeBaseUrl)
    .filter(Boolean);
}

/**
 * Online mesh peers, as endpoint candidates. Discovery, not configuration —
 * this is how a laptop finds the box that actually holds the models without
 * anyone writing an address into the repo.
 */
async function meshCandidateUrls() {
  try {
    const { readTailscaleStatus } = await import('./mesh-enroll.mjs');
    const status = readTailscaleStatus();
    if (!status) return [];
    const peers = Object.values(status.Peer || {});
    return peers
      .filter((p) => p?.Online)
      .flatMap((p) => (p.TailscaleIPs || []).filter((ip) => !ip.includes(':')))
      .map((ip) => normalizeBaseUrl(`${ip}:${OLLAMA_DEFAULT_PORT}`))
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** @returns {Promise<Array<object>|null>} the server's model list, or null when it is not an Ollama endpoint. */
export async function listOllamaModels(baseUrl) {
  try {
    const res = await fetchWithDeadline(`${baseUrl}/api/tags`, {}, PROBE_TIMEOUT_MS);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.models) ? data.models : null;
  } catch {
    return null;
  }
}

/** @type {{url: string, at: number}|null} */
let endpointCache = null;

/**
 * Resolve a reachable Ollama endpoint: configured → loopback → mesh peers.
 * @param {{force?: boolean}} [opts]
 * @returns {Promise<string|null>}
 */
export async function resolveOllamaEndpoint({ force = false } = {}) {
  if (!force && endpointCache && Date.now() - endpointCache.at < DISCOVERY_TTL_MS) {
    return endpointCache.url;
  }

  const configured = configuredBaseUrls();
  const candidates = [
    ...configured,
    normalizeBaseUrl(`127.0.0.1:${OLLAMA_DEFAULT_PORT}`),
    // Mesh discovery is last and only consulted when nothing local answers, so
    // the common case costs one loopback probe rather than a network sweep.
    ...(configured.length ? [] : await meshCandidateUrls()),
  ];

  const seen = new Set();
  for (const url of candidates) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const models = await listOllamaModels(url);
    if (models) {
      endpointCache = { url, at: Date.now() };
      logger.debug('embeddings: resolved Ollama endpoint', { url, models: models.length });
      return url;
    }
  }

  endpointCache = null;
  return null;
}

/** Full metadata for one model, including declared capabilities. */
async function describeModel(baseUrl, name) {
  try {
    const res = await fetchWithDeadline(
      `${baseUrl}/api/show`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: name }),
      },
      SHOW_TIMEOUT_MS,
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * The embedding width a model actually produces.
 *
 * Read the family-scoped key exactly. Generative models publish several
 * *.embedding_length entries (a vision tower's width, an audio tower's width)
 * and a loose regex will happily match one of those — picking a chat model
 * that cannot embed at all.
 */
export function embeddingWidth(info) {
  const family = info?.details?.family;
  const modelInfo = info?.model_info || {};
  if (family && Number.isFinite(modelInfo[`${family}.embedding_length`])) {
    return modelInfo[`${family}.embedding_length`];
  }
  return null;
}

/** Ollama declares this explicitly; trust it over any name-based heuristic. */
export function canEmbed(info) {
  return Array.isArray(info?.capabilities) && info.capabilities.includes('embedding');
}

/** @type {Map<string, string|null>} */
const modelCache = new Map();

/**
 * Choose an embedding model from what the server reports.
 *
 * @param {string} baseUrl
 * @param {{dims: number, preferred?: string|null, force?: boolean}} opts
 *   `dims` is the vault's vector width — a model of any other width cannot be
 *   stored in the existing index, so width is a hard filter, not a preference.
 * @returns {Promise<string|null>}
 */
export async function selectEmbeddingModel(baseUrl, { dims, preferred = null, force = false } = {}) {
  const cacheKey = `${baseUrl}|${dims}|${preferred || ''}`;
  if (!force && modelCache.has(cacheKey)) return modelCache.get(cacheKey);

  const models = await listOllamaModels(baseUrl);
  if (!models?.length) {
    modelCache.set(cacheKey, null);
    return null;
  }

  const names = models.map((m) => m.name || m.model).filter(Boolean);
  // An operator-pinned model still has to prove it can embed at the right
  // width; a stale pin should fall through to discovery, not hard-fail.
  const ordered = preferred
    ? [...names.filter((n) => n === preferred || n.split(':')[0] === preferred), ...names]
    : names;

  const bySize = new Map(models.map((m) => [m.name || m.model, m.size || Number.MAX_SAFE_INTEGER]));
  const viable = [];

  for (const name of [...new Set(ordered)]) {
    const info = await describeModel(baseUrl, name);
    if (!info || !canEmbed(info)) continue;
    const width = embeddingWidth(info);
    if (width !== dims) {
      logger.debug('embeddings: skipping Ollama model on width mismatch', { name, width, want: dims });
      continue;
    }
    if (preferred && (name === preferred || name.split(':')[0] === preferred)) {
      modelCache.set(cacheKey, name);
      return name;
    }
    viable.push(name);
  }

  // Smallest viable model wins: embedding models at equal width are near-equal
  // in quality, and the small one keeps recall latency down.
  viable.sort((a, b) => (bySize.get(a) || 0) - (bySize.get(b) || 0));
  const chosen = viable[0] || null;
  if (chosen) logger.debug('embeddings: selected Ollama model', { model: chosen, dims });
  modelCache.set(cacheKey, chosen);
  return chosen;
}

/**
 * Embed one string. Returns the vector, or throws with a reason the caller can log.
 *
 * @param {string} text
 * @param {{baseUrl: string, model: string, dims: number}} opts
 * @returns {Promise<number[]>}
 */
export async function getOllamaEmbedding(text, { baseUrl, model, dims }) {
  const res = await fetchWithDeadline(
    `${baseUrl}/api/embeddings`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
    },
    EMBED_TIMEOUT_MS,
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Ollama embedding error ${res.status}: ${body || 'no response body'}`);
  }

  const data = await res.json();
  const embedding = data?.embedding;
  if (!Array.isArray(embedding) || !embedding.length) {
    throw new Error('Ollama returned no embedding vector');
  }
  // Storing a wrong-width vector corrupts the index silently; fail loudly instead.
  if (Number.isFinite(dims) && embedding.length !== dims) {
    throw new Error(`Ollama model ${model} returned ${embedding.length} dims, vault requires ${dims}`);
  }
  return embedding;
}

/**
 * Every model the server holds, annotated for an operator choosing one:
 * whether it can embed at all, how wide its vectors are, and whether that
 * width fits the vault index. Models that cannot be used are still returned,
 * with the reason visible, so the UI can explain the absence rather than
 * silently showing an empty list.
 *
 * @param {string} baseUrl
 * @param {{dims?: number}} [opts]
 */
export async function describeEmbeddingCandidates(baseUrl, { dims } = {}) {
  const models = await listOllamaModels(baseUrl);
  if (!models?.length) return [];

  const out = [];
  for (const m of models) {
    const name = m.name || m.model;
    if (!name) continue;
    const info = await describeModel(baseUrl, name);
    const embeds = info ? canEmbed(info) : false;
    const width = info ? embeddingWidth(info) : null;
    out.push({
      name,
      size: m.size ?? null,
      family: info?.details?.family ?? null,
      capabilities: info?.capabilities ?? [],
      embedding: embeds,
      dims: width,
      compatible: Boolean(embeds && Number.isFinite(dims) && width === dims),
    });
  }
  return out;
}

/**
 * Current state of the local/mesh embedding provider, for display.
 * Never throws — an unreachable endpoint is a reportable state, not an error.
 *
 * @param {{dims: number, preferred?: string|null}} opts
 */
export async function getOllamaProviderStatus({ dims, preferred = null } = {}) {
  const endpoint = await resolveOllamaEndpoint();
  if (!endpoint) {
    return {
      available: false,
      endpoint: null,
      selected: null,
      preferred,
      dims,
      candidates: [],
      reason: 'No Ollama endpoint answered on this host or any online mesh peer.',
    };
  }

  const candidates = await describeEmbeddingCandidates(endpoint, { dims });
  const selected = await selectEmbeddingModel(endpoint, { dims, preferred });
  return {
    available: Boolean(selected),
    endpoint,
    selected,
    preferred,
    dims,
    candidates,
    reason: selected ? null : `No model on ${endpoint} embeds at ${dims} dims.`,
  };
}

/** Reset memoised discovery — used by tests and after a topology change. */
export function resetOllamaDiscovery() {
  endpointCache = null;
  modelCache.clear();
}
