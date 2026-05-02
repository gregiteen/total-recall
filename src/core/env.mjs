/**
 * env.mjs — Environment & Secrets Loader
 *
 * Loads environment variables from .env file (if present) and provides
 * typed access to all Total Recall configuration.
 *
 * Priority order:
 *   1. Process environment variables (highest)
 *   2. .env file in repo root
 *   3. ~/.total-recall/.env (global)
 *   4. Defaults (lowest)
 *
 * No external dependencies — parses .env manually.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── .env PARSER ────────────────────────────────────────────────────────────────

/**
 * Parse a .env file into a key-value object.
 * Supports comments (#), empty lines, quotes, and multiline values.
 *
 * @param {string} filePath - Path to .env file
 * @returns {Object<string, string>}
 */
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const content = fs.readFileSync(filePath, 'utf-8');
  const result = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();

    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Remove inline comments (only for unquoted values)
    if (!trimmed.slice(eqIdx + 1).trim().startsWith('"')) {
      const commentIdx = value.indexOf(' #');
      if (commentIdx !== -1) value = value.slice(0, commentIdx).trim();
    }

    result[key] = value;
  }

  return result;
}

// ─── LOAD ENVIRONMENT ───────────────────────────────────────────────────────────

let _loaded = false;
const _env = {};

/**
 * Load environment variables from .env files.
 * Does NOT overwrite existing process.env values.
 *
 * @param {string} [root] - Repo root (for local .env)
 */
export function loadEnv(root) {
  if (_loaded) return;

  // Load in reverse priority order (lowest first, highest last wins)
  const files = [
    path.join(os.homedir(), '.total-recall', '.env'),       // Global
    root ? path.join(root, '.env') : null,                   // Local
  ].filter(Boolean);

  for (const file of files) {
    const parsed = parseEnvFile(file);
    for (const [key, value] of Object.entries(parsed)) {
      // Don't overwrite existing env vars
      if (!process.env[key]) {
        process.env[key] = value;
      }
      _env[key] = process.env[key] || value;
    }
  }

  // Merge current process.env TOTAL_RECALL_ vars
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('TOTAL_RECALL_')) {
      _env[key] = value;
    }
  }

  _loaded = true;
}

// ─── TYPED ACCESSORS ────────────────────────────────────────────────────────────

/**
 * Get an env var by name with optional default.
 * @param {string} key
 * @param {string} [defaultValue]
 * @returns {string|undefined}
 */
export function env(key, defaultValue) {
  return process.env[key] || _env[key] || defaultValue;
}

/**
 * Get all notification-related env vars.
 * @returns {Object}
 */
export function getNotificationConfig() {
  return {
    slack: {
      webhook: env('TOTAL_RECALL_SLACK_WEBHOOK'),
    },
    discord: {
      webhook: env('TOTAL_RECALL_DISCORD_WEBHOOK'),
    },
    email: {
      resendKey: env('TOTAL_RECALL_RESEND_KEY'),
      to: env('TOTAL_RECALL_EMAIL_TO'),
      from: env('TOTAL_RECALL_EMAIL_FROM', 'memory@totalrecall.dev'),
    },
    webpush: {
      publicKey: env('TOTAL_RECALL_VAPID_PUBLIC_KEY'),
      privateKey: env('TOTAL_RECALL_VAPID_PRIVATE_KEY'),
      email: env('TOTAL_RECALL_VAPID_EMAIL'),
    },
  };
}

/**
 * Get all LLM API key env vars.
 * @returns {Object}
 */
export function getLLMConfig() {
  return {
    openai: env('TOTAL_RECALL_OPENAI_KEY'),
    anthropic: env('TOTAL_RECALL_ANTHROPIC_KEY'),
    google: env('TOTAL_RECALL_GOOGLE_KEY'),
    openrouter: env('TOTAL_RECALL_OPENROUTER_KEY'),
  };
}

/**
 * Check if any LLM API keys are configured (enables direct API mode).
 * @returns {boolean}
 */
export function hasDirectAPIKeys() {
  const keys = getLLMConfig();
  return Object.values(keys).some(k => k && k.length > 0);
}

/**
 * Get a summary of configured integrations (for `total-recall status`).
 * @returns {Object<string, boolean>}
 */
export function getConfiguredIntegrations() {
  const notif = getNotificationConfig();
  const llm = getLLMConfig();

  return {
    slack: !!notif.slack.webhook,
    discord: !!notif.discord.webhook,
    email: !!notif.email.resendKey,
    webpush: !!notif.webpush.publicKey,
    openai: !!llm.openai,
    anthropic: !!llm.anthropic,
    google: !!llm.google,
    openrouter: !!llm.openrouter,
  };
}
