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

  // Linux or fallback: check w / who idle time
  try {
    const res = spawnSync('w', ['-u'], {
      encoding: 'utf8',
      timeout: 1000,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    if (res.status === 0 && res.stdout) {
      const lines = res.stdout.trim().split('\n').slice(2);
      if (lines.length > 0) {
        // Just report 0 if user is logged into an active TTY session
        return 0;
      }
    }
  } catch {}

  return 0;
}

/**
 * Identify the active editor or developer surface on the local machine.
 * @returns {string} E.g. 'antigravity', 'cursor', 'claude', 'vscode', 'terminal'
 */
export function detectActiveSurface() {
  try {
    const res = spawnSync('ps', ['-ax', '-o', 'comm'], {
      encoding: 'utf8',
      timeout: 1500,
      stdio: ['ignore', 'pipe', 'ignore']
    });

    if (res.status === 0 && res.stdout) {
      const procs = res.stdout.toLowerCase();
      if (procs.includes('antigravity')) return 'antigravity';
      if (procs.includes('cursor')) return 'cursor';
      if (procs.includes('code') || procs.includes('electron')) return 'vscode';
      if (procs.includes('claude')) return 'claude';
    }
  } catch {}

  return 'terminal';
}

/**
 * Generate a complete presence heartbeat for the local node.
 * @returns {object} Presence record
 */
export function getLocalPresence() {
  const idleSecs = getLocalIdleSeconds();
  const isActive = idleSecs < 300; // Active if interacted within last 5 minutes
  const now = Date.now();
  const lastInteraction = now - (idleSecs * 1000);

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
  if (!Array.isArray(presenceList) || presenceList.length === 0) {
    return {
      node_id: 'local',
      mesh_ip: null,
      user_active: true,
      active_surface: 'local'
    };
  }

  // Filter for active nodes
  const activeNodes = presenceList.filter(p => p && p.user_active);

  if (activeNodes.length === 0) {
    // If no nodes are actively interacted with within threshold, select the most recently interacted
    const sorted = [...presenceList].sort((a, b) => (b.last_interaction || 0) - (a.last_interaction || 0));
    return sorted[0] || { node_id: 'local', mesh_ip: null, user_active: false };
  }

  // Return the active node with the most recent interaction timestamp
  activeNodes.sort((a, b) => (b.last_interaction || 0) - (a.last_interaction || 0));
  return activeNodes[0];
}
