/**
 * Intelligent enqueue for "new secret → learn the real API" research.
 *
 * Old behavior searched the web for the raw env var name (e.g. "TR_MESH_SYNC_TOKEN"),
 * which fails for internal tokens, passwords, SSO secrets, and most real vendors.
 *
 * New behavior:
 *  1. Classify the secret (api key vs password vs internal vs webhook…)
 *  2. Resolve the product via provider catalog + structured name heuristics
 *  3. Only enqueue research for third-party *integration APIs* with a product-focused brief
 *  4. Skip internal TR keys, passwords, mesh tokens, SSO secrets, etc.
 */

import { getProvider, providerForKeyName, PROVIDER_CATALOG } from './provider-catalog.mjs';

/** Env prefixes that are packaging noise, not the product. */
const STRIP_PREFIXES =
  /^(DEVELOPER_|VITE_|NEXT_PUBLIC_|PUBLIC_|NUXT_PUBLIC_|PORTFOLIO_|ULTRACHAT_|TOTAL_RECALL_|TR_)/i;

/** Suffixes that mark non–public-API credentials. */
const SKIP_SUFFIX_RE =
  /(PASSWORD|PASSWD|SSO_SECRET|CLIENT_SECRET|WEBHOOK_SECRET|PRIVATE_KEY|JWT_SECRET|SESSION_SECRET|COOKIE_SECRET|ENCRYPTION_KEY|MASTER_PASSWORD|DOVECOT|ARI_PASSWORD|DB_PASSWORD|SMTP_PASSWORD)$/i;

/** Explicit internal / mesh / infra keys that are not third-party product APIs. */
const INTERNAL_KEY_RE =
  /^(TR_|TOTAL_RECALL_|MESH_|HEADSCALE_.*AUTH|ADMIN_API_|BETTER_AUTH|SESSION_|COOKIE_|ENCRYPTION_)/i;

/**
 * @param {string} key
 * @returns {string} uppercased key with packaging prefixes removed
 */
export function normalizeSecretKeyName(key) {
  let k = String(key || '').trim();
  // peel packaging prefixes repeatedly
  for (let i = 0; i < 4; i++) {
    const next = k.replace(STRIP_PREFIXES, '');
    if (next === k) break;
    k = next;
  }
  return k.toUpperCase();
}

/**
 * @param {string} key
 * @param {{ provider?: string|null }} [meta]
 * @returns {{
 *   kind: 'api_key'|'password'|'oauth_client'|'webhook'|'private_key'|'internal'|'unknown',
 *   product_slug: string|null,
 *   product_name: string|null,
 *   provider: object|null,
 *   researchable: boolean,
 *   skip_reason: string|null,
 * }}
 */
export function classifySecretForIntegration(key, meta = {}) {
  const raw = String(key || '');
  const normalized = normalizeSecretKeyName(raw);
  const catalog =
    getProvider(meta.provider) ||
    providerForKeyName(raw) ||
    providerForKeyName(normalized) ||
    matchCatalogFuzzy(normalized);

  if (INTERNAL_KEY_RE.test(raw) || /^TR_/i.test(raw) || /MESH_SYNC/i.test(raw)) {
    return {
      kind: 'internal',
      product_slug: catalog?.id || null,
      product_name: catalog?.name || 'Total Recall internal',
      provider: catalog,
      researchable: false,
      skip_reason: 'Internal Total Recall / mesh credential — not a third-party public API to scrape by key name',
    };
  }

  if (SKIP_SUFFIX_RE.test(normalized) || SKIP_SUFFIX_RE.test(raw)) {
    let kind = 'password';
    if (/WEBHOOK_SECRET/i.test(normalized)) kind = 'webhook';
    else if (/PRIVATE_KEY/i.test(normalized)) kind = 'private_key';
    else if (/CLIENT_SECRET|SSO_SECRET/i.test(normalized)) kind = 'oauth_client';
    return {
      kind,
      product_slug: catalog?.id || inferProductSlug(normalized),
      product_name: catalog?.name || humanizeSlug(inferProductSlug(normalized)),
      provider: catalog,
      researchable: false,
      skip_reason: `Credential type "${kind}" is not researched as a public REST API via the key name`,
    };
  }

  // Looks like an API token/key
  const looksApi =
    /API[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|PERSONAL[_-]?ACCESS|API[_-]?TOKEN|BEARER/i.test(
      normalized + '_' + raw,
    ) || Boolean(catalog);

  if (!looksApi && !catalog) {
    return {
      kind: 'unknown',
      product_slug: inferProductSlug(normalized),
      product_name: humanizeSlug(inferProductSlug(normalized)),
      provider: null,
      researchable: false,
      skip_reason: 'Does not look like a third-party API key (and no catalog match)',
    };
  }

  const product_slug = catalog?.id || inferProductSlug(normalized);
  const product_name = catalog?.name || humanizeSlug(product_slug);

  // Headscale etc. in catalog — researchable with known docs
  return {
    kind: 'api_key',
    product_slug,
    product_name,
    provider: catalog,
    researchable: true,
    skip_reason: null,
  };
}

function matchCatalogFuzzy(normalizedKey) {
  const n = normalizedKey.toLowerCase().replace(/-/g, '_');
  for (const p of PROVIDER_CATALOG) {
    const id = p.id.toLowerCase().replace(/-/g, '_');
    if (n.includes(id) || n.startsWith(id + '_')) return p;
    for (const pat of p.key_patterns || []) {
      const base = pat.toUpperCase().replace(/_API_KEY$|_TOKEN$|_KEY$/i, '');
      if (normalizedKey.includes(base) || base.includes(normalizedKey.split('_')[0])) {
        return p;
      }
    }
  }
  return null;
}

function inferProductSlug(normalizedKey) {
  const stripped = normalizedKey
    .replace(
      /(_?API_?KEY|_?API_?TOKEN|_?ACCESS_?TOKEN|_?AUTH_?TOKEN|_?TOKEN|_?KEY)$/i,
      '',
    )
    .replace(/^_+|_+$/g, '');
  if (!stripped) return null;
  const parts = stripped.toLowerCase().split(/_+/).filter(Boolean);
  const noise = new Set(['api', 'app', 'service', 'role', 'admin', 'user', 'test', 'public', 'private', 'access']);
  const useful = parts.filter((p) => !noise.has(p));
  const take = useful.length ? useful : parts;
  if (!take.length) return null;
  if (take[0] === 'digital' && take[1] === 'ocean') return 'digitalocean';
  if (take[0].length <= 3 && take.length >= 2) return `${take[0]}-${take[1]}`;
  return take.slice(0, 2).join('-');
}

function humanizeSlug(slug) {
  if (!slug) return 'Unknown service';
  return String(slug)
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Build a research topic + notes that target the *product*, not the env var name.
 * @returns {{ topic: string, notes: string, priority: string } | null}
 */
export function buildIntegrationResearchBrief(key, meta = {}) {
  const classified = classifySecretForIntegration(key, meta);
  if (!classified.researchable) return null;

  const product = classified.product_name || 'the provider';
  const docs = classified.provider?.docs_url || null;
  const consoleUrl = classified.provider?.console_url || null;
  const auth = classified.provider?.schema?.auth || null;
  const envKeys = classified.provider?.schema?.env_keys || [];

  const topic = `${product} public API: authentication, base URL, and primary endpoints`;
  const notes = [
    `A secret named \`${key}\` was added to the vault.`,
    `Treat this as a **${product}** credential (env-style name is not the product).`,
    classified.product_slug ? `Product slug: \`${classified.product_slug}\`.` : null,
    docs ? `Start from official docs: ${docs}` : `Find and open the official ${product} API documentation (not a page about the string "${key}").`,
    consoleUrl ? `Developer console / key management: ${consoleUrl}` : null,
    auth ? `Catalog auth style: ${auth}.` : null,
    envKeys.length ? `Common env keys: ${envKeys.join(', ')}.` : null,
    '',
    'Research goals (be specific; cite official docs only):',
    '1. Base URL(s) and API versioning.',
    '2. How to authenticate with this key type (headers/query).',
    '3. 5–10 highest-value endpoints relevant to automation/agents.',
    '4. Rate limits, free-tier gotchas, and required headers.',
    '5. Whether Total Recall already integrates this provider; if not, what minimal wiring would look like (no invented product paths).',
    '',
    'Do **not** search for the raw env var name as if it were a product.',
    'Do **not** attempt to rotate or print the secret value.',
  ]
    .filter(Boolean)
    .join('\n');

  return { topic, notes, priority: 'low' };
}

/**
 * Enqueue integration research when appropriate.
 * @returns {Promise<{ enqueued: boolean, item?: object, skipped?: string }>}
 */
export async function maybeEnqueueIntegrationResearch(brainDir, key, meta = {}) {
  const brief = buildIntegrationResearchBrief(key, meta);
  if (!brief) {
    const c = classifySecretForIntegration(key, meta);
    return { enqueued: false, skipped: c.skip_reason || 'not researchable' };
  }

  const { addToQueue } = await import('./research-queue.mjs');
  const item = addToQueue({
    topic: brief.topic,
    priority: brief.priority,
    notes: brief.notes,
    brainDir,
  });
  return { enqueued: true, item };
}

/**
 * Cancel pending queue items that used the old "Automated API Integration Build: KEY" pattern
 * for non-researchable secrets (passwords, internal tokens, etc.).
 */
export function cancelBogusApiIntegrationQueueItems(overrideBrainDir) {
  // lazy require to avoid cycles in tests
  return import('./research-queue.mjs').then(({ loadQueue, updateQueueItem }) => {
    const items = loadQueue(overrideBrainDir);
    let cancelled = 0;
    for (const item of items) {
      if (item.status !== 'pending' && item.status !== 'in_progress') continue;
      const m = String(item.topic || '').match(/^Automated API Integration Build:\s*(.+)$/i);
      if (!m) continue;
      const key = m[1].trim();
      const c = classifySecretForIntegration(key, {});
      if (!c.researchable) {
        updateQueueItem(
          item.id,
          {
            status: 'failed',
            notes: `${item.notes || ''}\n\n[auto-cancelled] ${c.skip_reason}`,
            research_phase: 'cancelled',
          },
          overrideBrainDir,
        );
        cancelled += 1;
      }
    }
    return { cancelled };
  });
}
