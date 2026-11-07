/**
 * What the server on this host actually runs, against what was released.
 *
 * A moved checkout proves nothing until the process serving it has been replaced.
 * Update reports used to read package.json on disk, so a server left on an old
 * release read as `up_to_date` for as long as nobody looked at /health. This module
 * only reads: replacing a production server is a deploy, and a deploy is a decision.
 */
import fs from 'node:fs';
import path from 'node:path';
import { comparePackageVersions } from './package-version.mjs';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** Identity a deploy compares to tell one release from another. */
export function deploymentHealth({ name, version, pid = process.pid, port = null }) {
  return { status: 'ok', version, deploymentId: `${name}@${version}`, pid, port };
}

/**
 * The address of the server this host runs, or null when its brain is served
 * elsewhere. The brain's own configuration decides; TR_PORT covers a host with none.
 */
export function localServerUrl({ brainDir, env = process.env } = {}) {
  try {
    const { url } = JSON.parse(fs.readFileSync(path.join(brainDir, 'config', 'brain.json'), 'utf8'));
    if (url) {
      const parsed = new URL(url);
      return LOOPBACK.has(parsed.hostname) ? parsed.origin : null;
    }
  } catch { /* no configuration: fall through to the port */ }
  const port = Number(env.TR_PORT);
  return `http://127.0.0.1:${Number.isInteger(port) && port > 0 ? port : 3000}`;
}

/**
 * Read /health once. A server that does not answer in time is `unknown`, never
 * `down`: under load /health can take seconds, and a slow answer is not an outage.
 */
export async function observeRunningServer({ brainDir, url, fetchImpl = fetch, timeoutMs = 10000, exists = fs.existsSync, env = process.env } = {}) {
  const target = url === undefined ? localServerUrl({ brainDir, env }) : url;
  if (!target) return { status: 'none', reason: 'This brain is served from another host.' };
  try {
    const response = await fetchImpl(new URL('/health', target), { redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return { status: 'unknown', url: target, reason: `/health answered HTTP ${response.status}` };
    const body = await response.json();
    if (typeof body?.version !== 'string') return { status: 'unknown', url: target, reason: '/health did not report a version' };
    return { status: 'running', url: target, version: body.version };
  } catch (error) {
    if (error?.name === 'TimeoutError') return { status: 'unknown', url: target, reason: `/health gave no answer within ${timeoutMs} ms` };
    if (error?.cause?.code !== 'ECONNREFUSED') return { status: 'unknown', url: target, reason: error?.cause?.code || error?.message || 'unreadable /health' };
    return exists(path.join(brainDir || '', 'server.pid'))
      ? { status: 'down', url: target, reason: 'A server PID file exists and nothing answers.' }
      : { status: 'none', url: target, reason: 'No server runs on this host.' };
  }
}

/** Compare an observation with a released version. `stale` is the only state that needs a replacement. */
export function compareRunningServer(observed, latest) {
  if (observed.status !== 'running') return { ...observed, latest: latest ?? null };
  const { url, version: running } = observed;
  const order = comparePackageVersions(running, latest);
  if (order === null) return { status: 'unknown', url, running, latest: latest ?? null, reason: 'The versions could not be compared.' };
  const status = order === 0 ? 'current' : order < 0 ? 'stale' : 'ahead';
  return {
    status,
    url,
    running,
    latest,
    ...(status === 'stale' ? { reason: `The server on this host runs ${running} and the release is ${latest}. Files moving does not replace a running process.` } : {}),
  };
}

export async function runningServerStatus({ brainDir, latest, observe = observeRunningServer, ...options } = {}) {
  return compareRunningServer(await observe({ brainDir, ...options }), latest);
}
