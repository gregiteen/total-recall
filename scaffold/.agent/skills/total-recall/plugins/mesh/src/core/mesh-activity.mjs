import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getMeshIp, getMeshHostname } from './mesh.mjs';

/**
 * Measure user idle time in seconds on the local operating system.
 * macOS uses IOHIDSystem (HIDIdleTime nanoseconds).
 * Linux falls back to w/proc.
 * @returns {number} Idle duration in seconds
 */
export function getLocalIdleSeconds() {
  const platform = process.platform;

  if (platform === 'darwin') {
    try {
      const res = spawnSync('ioreg', ['-c', 'IOHIDSystem'], {
        encoding: 'utf8',
        timeout: 1000,
        stdio: ['ignore', 'pipe', 'ignore']
      });
      if (res.status === 0 && res.stdout) {
        const match = res.stdout.match(/"HIDIdleTime"\s*=\s*(\d+)/);
        if (match && match[1]) {
          const nanos = BigInt(match[1]);
          const secs = Number(nanos / 1_000_000_000n);
          return Math.max(0, secs);
        }
      }
    } catch {
      // Fallback
    }
  }

  // No reliable HID observation is available on this platform.
  return null;
}

/** Foreground application observation is not available through this adapter. */
export function detectActiveSurface() { return null; }

/**
 * Generate a complete presence heartbeat for the local node.
 * @returns {object} Presence record
 */
export function getLocalPresence() {
  const idleSecs = getLocalIdleSeconds();
  const isActive = idleSecs !== null && idleSecs < 300; // Active if interacted within last 5 minutes
  const now = Date.now();
  const lastInteraction = idleSecs === null ? null : now - (idleSecs * 1000);

  let hostname = 'unknown-node';
  try {
    hostname = getMeshHostname() || os.hostname();
  } catch {
    hostname = os.hostname();
  }

  let meshIp = null;
  try {
    meshIp = getMeshIp();
  } catch {}

  return {
    node_id: hostname,
    mesh_ip: meshIp,
    user_active: isActive,
    idle_seconds: idleSecs,
    last_interaction: lastInteraction,
    active_surface: detectActiveSurface(),
    timestamp: new Date(now).toISOString()
  };
}

/**
 * "Follow the User" dynamic dispatch resolver.
 * Evaluates presence records across mesh nodes to determine the user's currently active device.
 * @param {Array<object>} presenceList - Array of presence records from cluster nodes
 * @returns {object} The most actively interacted node
 */
export function resolveActiveDevice(presenceList = []) {
  if (!Array.isArray(presenceList)) return null;
  const now = Date.now();
  return presenceList.filter(p => {
    const age = now - Date.parse(p?.timestamp);
    return p?.node_id && p.user_active === true && Number.isFinite(p.idle_seconds) && p.idle_seconds >= 0 && Number.isFinite(p.last_interaction) && p.last_interaction <= now + 5000 && age >= -5000 && age <= 60000;
  }).sort((a, b) => b.last_interaction - a.last_interaction)[0] || null;
}
