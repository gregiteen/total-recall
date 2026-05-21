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
import { execFileSync } from 'node:child_process';
import { agentDir } from './config.mjs';
import { logger } from './logger.mjs';

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
  const sanitized = message.replace(/[^ -~]/g, '').replace(/["'`$\\]/g, '').slice(0, 200);
  try {
    execFileSync('osascript', [
      '-e', `display notification "${sanitized}" with title "🚨 TOTAL RECALL EMERGENCY" sound name "Sosumi"`,
    ], { timeout: 3000 });
  } catch { /* non-macOS or notification failure — non-fatal */ }
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
 * Run a comprehensive health check on startup.
 * If anything is catastrophically wrong, writes emergency alerts.
 * If everything is healthy, clears any stale alerts.
 *
 * @param {object} runtimeConfig  The loaded runtime configuration
 * @returns {{ healthy: boolean, issues: string[] }}
 */
export async function runStartupHealthCheck(runtimeConfig) {
  const issues = [];

  // Import the base URL helper from runtime.mjs
  const { getOllamaBaseUrl } = await import('./runtime.mjs');

  // Check 1: Is the LLM runtime reachable?
  try {
    let healthUrl;
    if (runtimeConfig.runtime === 'ollama') {
      const baseUrl = getOllamaBaseUrl(runtimeConfig);
      healthUrl = `${baseUrl}/api/tags`;
    } else {
      healthUrl = runtimeConfig.health_endpoint || 'http://127.0.0.1:8080/health';
    }

    const resp = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) {
      issues.push(`LLM runtime (${runtimeConfig.runtime}) returned HTTP ${resp.status} at ${healthUrl} — the brain cannot think.`);
    } else if (runtimeConfig.runtime === 'ollama') {
      // Check 2: Is the configured model pulled?
      const data = await resp.json();
      const models = data.models || [];
      const hasModel = models.some(m =>
        m.name === runtimeConfig.model || m.name.startsWith(runtimeConfig.model)
      );
      if (!hasModel) {
        const modelNames = models.map(m => m.name).join(', ') || '(none)';
        issues.push(
          `Ollama model "${runtimeConfig.model}" is NOT pulled. Available models: ${modelNames}. ` +
          `Run: ollama pull ${runtimeConfig.model}`
        );
      }
    }
  } catch (err) {
    issues.push(
      `Cannot reach LLM runtime (${runtimeConfig.runtime || 'ollama'}) at configured endpoint: ${err.message}. ` +
      `Check that the runtime is running and the endpoint in runtime.yml is correct.`
    );
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
