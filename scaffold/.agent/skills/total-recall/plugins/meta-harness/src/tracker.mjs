/**
 * Upstream agent harness tracking: live versions, changelogs, and contracts.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { findBinary } from './worker.mjs';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const versionCache = new Map();

/**
 * Dynamically resolves the currently installed version for an agent binary.
 */
export function getInstalledVersion(agentId, binaryPath = null) {
  const binary = binaryPath || findBinary(agentId === 'cursor' ? 'cursor-agent' : agentId);
  if (!binary) return null;

  try {
    if (agentId === 'claude') {
      const updateResult = path.join(os.homedir(), '.claude', '.last-update-result.json');
      if (fs.existsSync(updateResult)) {
        try {
          const data = JSON.parse(fs.readFileSync(updateResult, 'utf8'));
          if (data.version_to) return data.version_to;
        } catch {}
      }
    }
    const res = spawnSync(binary, ['--version'], { timeout: 2500, encoding: 'utf8' });
    const output = (res.stdout || res.stderr || '').trim();
    const match = output.match(/\b\d+\.\d+(?:\.\d+)?\b/);
    return match ? match[0] : null;
  } catch {
    return null;
  }
}

/**
 * Retrieves the latest upstream version for a harness without hardcoded downgrade traps.
 */
export async function getLatestVersion(agentId, installedVersion = null) {
  const cached = versionCache.get(agentId);
  if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
    return cached.version;
  }

  let latest = installedVersion || 'unknown';

  try {
    if (agentId === 'claude') {
      const res = await fetch('https://registry.npmjs.org/@anthropic-ai/claude-code/latest', {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.version) latest = data.version;
      }
    } else if (agentId === 'codex') {
      const res = await fetch('https://registry.npmjs.org/@openai/codex/latest', {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.version) latest = data.version;
      }
    } else if (agentId === 'agy') {
      const bin = findBinary('agy');
      if (bin) {
        const res = spawnSync(bin, ['changelog'], { timeout: 3000, encoding: 'utf8' });
        const output = res.stdout || '';
        const match = output.match(/^(\d+\.\d+\.\d+):/m);
        if (match) latest = match[1];
        else if (installedVersion) latest = installedVersion;
      }
    } else if (installedVersion) {
      latest = installedVersion;
    }
  } catch {
    if (installedVersion) latest = installedVersion;
  }

  versionCache.set(agentId, { version: latest, ts: Date.now() });
  return latest;
}

/**
 * Returns recent changelog highlights for a harness.
 */
export function getAgentChangelog(agentId, maxVersions = 3) {
  if (agentId === 'agy') {
    const bin = findBinary('agy');
    if (!bin) return { ok: false, error: 'Antigravity binary not found' };

    try {
      const res = spawnSync(bin, ['changelog'], { timeout: 4000, encoding: 'utf8' });
      const raw = (res.stdout || '').trim();
      if (!raw) return { ok: false, error: 'Changelog empty' };

      const sections = raw.split(/\n\n(?=\d+\.\d+\.\d+:)/);
      const recent = sections.slice(0, maxVersions).join('\n\n');
      return { ok: true, agent: 'agy', changelog: recent };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  return { ok: false, error: `Direct changelog not implemented for ${agentId}` };
}

/**
 * Comprehensive upstream status report across all supported adapters.
 */
export async function inspectUpstreamFleet(adapters) {
  const reports = [];

  for (const adapter of adapters) {
    const installed = getInstalledVersion(adapter.id);
    const latest = await getLatestVersion(adapter.id, installed);
    const updateAvailable = installed && latest && latest !== 'unknown' && installed !== latest;

    reports.push({
      id: adapter.id,
      name: adapter.name,
      installed: installed || null,
      latest: latest || null,
      updateAvailable: Boolean(updateAvailable),
      docs: adapter.docs || null,
    });
  }

  return reports;
}
