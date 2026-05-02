/**
 * dispatcher.mjs — Multi-Channel Notification Dispatcher
 *
 * Routes notifications through configured channels.
 * Each channel is a simple function: (title, message, config) => Promise<boolean>
 *
 * Channels are auto-detected from env vars — if a webhook/key is set,
 * that channel is enabled. No channel config = macOS-only (local default).
 */

import { loadEnv, getNotificationConfig } from '../core/env.mjs';
import * as macos from './channels/macos.mjs';
import * as slack from './channels/slack.mjs';
import * as discord from './channels/discord.mjs';
import * as email from './channels/email.mjs';

// ─── CHANNEL REGISTRY ───────────────────────────────────────────────────────────

const CHANNELS = {
  macos: {
    send: macos.send,
    isConfigured: () => process.platform === 'darwin',
    label: 'macOS Desktop',
  },
  slack: {
    send: slack.send,
    isConfigured: () => {
      const config = getNotificationConfig();
      return !!config.slack.webhook;
    },
    label: 'Slack',
  },
  discord: {
    send: discord.send,
    isConfigured: () => {
      const config = getNotificationConfig();
      return !!config.discord.webhook;
    },
    label: 'Discord',
  },
  email: {
    send: email.send,
    isConfigured: () => {
      const config = getNotificationConfig();
      return !!config.email.resendKey && !!config.email.to;
    },
    label: 'Email',
  },
};

// ─── DISPATCHER ─────────────────────────────────────────────────────────────────

/**
 * Send a notification through all configured channels.
 *
 * @param {string} title - Notification title
 * @param {string} message - Notification body
 * @param {Object} [options]
 * @param {string[]} [options.channels] - Override: only send to these channels
 * @param {string} [options.type='note'] - Alert type: tip|caution|important|note
 * @param {boolean} [options.silent=false] - If true, skip macOS desktop
 * @returns {Promise<{ sent: string[], failed: string[] }>}
 */
export async function dispatch(title, message, options = {}) {
  loadEnv();

  const config = getNotificationConfig();
  const sent = [];
  const failed = [];

  // Determine which channels to use
  let channelNames;
  if (options.channels) {
    channelNames = options.channels;
  } else {
    // Auto-detect: use all configured channels
    channelNames = Object.keys(CHANNELS).filter(name => {
      if (name === 'macos' && options.silent) return false;
      return CHANNELS[name].isConfigured();
    });
  }

  // If nothing configured, fall back to macOS if available
  if (channelNames.length === 0 && process.platform === 'darwin' && !options.silent) {
    channelNames = ['macos'];
  }

  // Send to all channels in parallel
  const promises = channelNames.map(async (name) => {
    const channel = CHANNELS[name];
    if (!channel) {
      failed.push(name);
      return;
    }

    try {
      const success = await channel.send(title, message, config);
      if (success) {
        sent.push(name);
      } else {
        failed.push(name);
      }
    } catch {
      failed.push(name);
    }
  });

  await Promise.allSettled(promises);
  return { sent, failed };
}

/**
 * List all channels and their configuration status.
 * @returns {Object<string, { configured: boolean, label: string }>}
 */
export function listChannels() {
  loadEnv();
  const result = {};
  for (const [name, channel] of Object.entries(CHANNELS)) {
    result[name] = {
      configured: channel.isConfigured(),
      label: channel.label,
    };
  }
  return result;
}

/**
 * Register a custom notification channel.
 * @param {string} name
 * @param {{ send: Function, isConfigured: Function, label: string }} channel
 */
export function registerChannel(name, channel) {
  CHANNELS[name] = channel;
}
