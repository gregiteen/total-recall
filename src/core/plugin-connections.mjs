/**
 * Owner-reported plugin connection state.
 *
 * The host never decides that a plugin is connected. A plugin may declare a
 * `connections` runtime module whose `readConnection({ brainDir, projectRoot })`
 * returns what its own recorded evidence shows, with no probe, spend, refresh or
 * credential access. The host validates that answer strictly and reports only
 * curated values: a configured, active or key-bearing plugin stays unreported
 * until its owner says otherwise.
 */
import { loadPluginModule } from './plugin-runtime.mjs';
import { pluginActivation } from './plugin-state.mjs';

export const CONNECTION_STATUSES = ['connected', 'failed', 'unknown'];
export const CONNECTION_METHODS = ['api-key', 'oauth', 'dashboard-session', 'none', 'unknown'];
/** Owner failure codes and the only words the host will show for them. */
export const CONNECTION_FAILURES = {
  'credential-missing': 'The provider credential is missing.',
  'credential-rejected': 'The provider rejected the credential.',
  'provider-unavailable': 'The provider could not be reached.',
  'rate-limited': 'The provider is rate limiting requests.',
  timeout: 'The provider did not answer in time.',
  'request-failed': 'The last provider request failed.',
};
export const CONNECTION_UNREPORTED = {
  'plugin-unavailable': 'This plugin is unavailable in the selected brain.',
  inactive: 'This plugin is not active in the selected brain.',
  'no-report': 'This plugin does not report a provider connection.',
  'owner-unavailable': 'The plugin could not read its connection evidence.',
  'invalid-report': 'The plugin returned a connection report the host could not accept.',
};
/** Evidence older than this reads as stale; only a newer owner receipt refreshes it. */
export const CONNECTION_STALE_MS = 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;
const OWNER_TIMEOUT_MS = 3000;
const ALLOWED_KEYS = new Set(['status', 'method', 'checkedAt', 'failure']);
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

const unreported = (pluginId, reason) => ({ pluginId, reported: false, reason, message: CONNECTION_UNREPORTED[reason] });

function plain(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Accept exactly the documented fields; return a fresh object or null. */
function validate(report, now) {
  if (!plain(report) || Object.keys(report).some(key => !ALLOWED_KEYS.has(key))) return null;
  const { status, method, checkedAt, failure } = report;
  if (!CONNECTION_STATUSES.includes(status) || !CONNECTION_METHODS.includes(method)) return null;
  if (status === 'unknown') return checkedAt === undefined && failure === undefined ? { status, method } : null;
  if (typeof checkedAt !== 'string' || !ISO_UTC.test(checkedAt)) return null;
  const at = Date.parse(checkedAt);
  if (!Number.isFinite(at) || at > now + CLOCK_SKEW_MS) return null;
  if (status === 'connected') return failure === undefined ? { status, method, checkedAt, at } : null;
  return Object.hasOwn(CONNECTION_FAILURES, failure) ? { status, method, checkedAt, failure, at } : null;
}

async function withTimeout(work, ms) {
  let timer;
  try {
    return await Promise.race([work, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); })]);
  } finally { clearTimeout(timer); }
}

/**
 * Read one plugin's cached connection evidence for one resolved brain target.
 * The caller authorizes the brain; this reads nothing else.
 * @param {object} plugin A discovered plugin.
 * @param {{ brainDir: string, projectRoot: string|null }} target
 */
export async function readPluginConnection(plugin, target, { now = Date.now(), load = loadPluginModule, timeoutMs = OWNER_TIMEOUT_MS } = {}) {
  if (!plugin?.valid) return unreported(plugin?.id ?? 'unknown', 'plugin-unavailable');
  const id = plugin.id;
  if (!pluginActivation(plugin, target).enabled) return unreported(id, 'inactive');
  if (!plugin.manifest.runtime?.modules?.connections) return unreported(id, 'no-report');
  let report;
  try {
    const owner = await load(id, 'connections', { activeRequired: true, projectRoot: target.projectRoot });
    if (typeof owner.readConnection !== 'function') return unreported(id, 'no-report');
    report = await withTimeout(Promise.resolve().then(() => owner.readConnection({ brainDir: target.brainDir, projectRoot: target.projectRoot })), timeoutMs);
  } catch {
    return unreported(id, 'owner-unavailable');
  }
  const accepted = validate(report, now);
  if (!accepted) return unreported(id, 'invalid-report');
  if (accepted.status === 'unknown') {
    return { pluginId: id, reported: true, status: 'unknown', method: accepted.method, checkedAt: null, freshness: 'none' };
  }
  const stale = now - accepted.at > CONNECTION_STALE_MS;
  return {
    pluginId: id,
    reported: true,
    status: stale ? 'stale' : accepted.status,
    ...(stale ? { lastStatus: accepted.status } : {}),
    method: accepted.method,
    checkedAt: accepted.checkedAt,
    freshness: stale ? 'stale' : 'fresh',
    ...(accepted.failure ? { failure: { code: accepted.failure, message: CONNECTION_FAILURES[accepted.failure] } } : {}),
  };
}
