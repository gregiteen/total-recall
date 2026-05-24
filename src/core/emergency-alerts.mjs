/**
 * Total Recall Emergency Alert System
 *
 * When a catastrophic failure occurs (daemon crash, LLM unreachable, model missing),
 * this module writes an alert to ~/.agent/alerts/emergency.md.
 *
 * The surface compiler reads this file and injects it at the TOP of every
 * compiled instruction file (INSTRUCTIONS.md, AGENTS.md, GEMINI.md, etc.).
 * This means EVERY agent in EVERY IDE will see the alert on their next turn
 * and be compelled to notify the user immediately.
 *
 * Alert lifecycle:
 *   1. writeEmergencyAlert(msg) — appends a timestamped alert
 *   2. Surface compiler injects alerts at top of all instruction files
 *   3. clearEmergencyAlerts() — called when the issue is resolved (e.g. daemon restarts healthy)
 */

import fs from 'fs';
import path from 'path';
import { agentDir } from './config.mjs';
import { logger } from './logger.mjs';
import { sendSystemNotification } from './notifications.mjs';

const AGENT_DIR = agentDir;
const ALERTS_DIR = path.join(AGENT_DIR, 'alerts');
const EMERGENCY_FILE = path.join(ALERTS_DIR, 'emergency.md');

// ─── Core Alert Operations ──────────────────────────────────────────────────────

/**
 * Write an emergency alert. Multiple alerts append to the same file.
 * Each alert is timestamped and will be injected into all IDE instruction files.
 *
 * @param {string} message  Human-readable description of the catastrophic failure
 */
export function writeEmergencyAlert(message) {
  if (!fs.existsSync(ALERTS_DIR)) {
    fs.mkdirSync(ALERTS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  const isNewFile = !fs.existsSync(EMERGENCY_FILE);

  const lines = [];
  if (isNewFile) {
    lines.push(
      '<!-- EMERGENCY ALERT -->',
      '## 🚨 CRITICAL SYSTEM FAILURE — NOTIFY THE USER IMMEDIATELY',
      '',
      '> **You MUST tell the user about this alert before doing anything else.**',
      '> Do NOT proceed with normal work until the user acknowledges this.',
      '',
    );
  }

  lines.push(`**[${timestamp}]** ${message}`, '');

  fs.appendFileSync(EMERGENCY_FILE, lines.join('\n'));

  logger.info({
    subsystem: 'emergency-alerts',
    message: `EMERGENCY ALERT WRITTEN: ${message}`,
  });

  // Fire macOS notification — this is the loudest channel
  sendSystemNotification('🚨 TOTAL RECALL EMERGENCY', message, {
    open: EMERGENCY_FILE,
    sound: 'Sosumi',
    subtitle: 'Critical Failure Detected',
    group: 'total-recall-emergency'
  }).catch((err) => {
    logger.debug('emergency-alerts: notification failed', { err: err.message });
  });
}

/**
 * Clear all emergency alerts. Called when the system recovers
 * (e.g. daemon starts successfully with a healthy LLM connection).
 */
export function clearEmergencyAlerts() {
  if (fs.existsSync(EMERGENCY_FILE)) {
    fs.unlinkSync(EMERGENCY_FILE);
    logger.info({
      subsystem: 'emergency-alerts',
      message: 'Emergency alerts cleared — system recovered.',
    });
  }
}

/**
 * Read current emergency alerts. Returns empty string if none.
 * Used by the surface compiler to inject alerts at the top of instruction files.
 */
export function readEmergencyAlerts() {
  if (!fs.existsSync(EMERGENCY_FILE)) return '';
  try {
    return fs.readFileSync(EMERGENCY_FILE, 'utf8');
  } catch {
    return '';
  }
}

// ─── Startup Health Check ───────────────────────────────────────────────────────

/**
 * Run a basic health check on startup.
 * Verifies filesystem structure is intact. No LLM checks — daemon is deterministic.
 *
 * @returns {{ healthy: boolean, issues: string[] }}
 */
export async function runStartupHealthCheck() {
  const issues = [];

  // Check: Does the vault directory exist?
  const vaultDir = path.join(AGENT_DIR, 'memory-vault');
  if (!fs.existsSync(vaultDir)) {
    issues.push(`Memory vault directory not found at ${vaultDir}. Run: npx total-recall init`);
  }

  // Check: Does the skills directory exist?
  const skillsDir = path.join(AGENT_DIR, 'skills');
  if (!fs.existsSync(skillsDir)) {
    issues.push(`Skills directory not found at ${skillsDir}. Run: npx total-recall init`);
  }

  // Verdict
  if (issues.length > 0) {
    for (const issue of issues) {
      writeEmergencyAlert(issue);
    }
    return { healthy: false, issues };
  }

  // All good — clear any stale alerts from previous failures
  clearEmergencyAlerts();
  return { healthy: true, issues: [] };
}
