import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'node:fs';
import os from 'node:os';
import dotenv from 'dotenv';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../../../../');

// Load environment variables for multi-channel support
dotenv.config({ path: path.join(ROOT, '.env.development.local') });

/**
 * sendNotification
 * @param {string} title - The notification title
 * @param {string} message - The notification message
 * @param {object} options - Options containing channels. Default is ['os'].
 *                           Possible channels: 'os', 'email', 'sms', 'github'
 */
const NOTIFY_LOG = path.join(os.homedir(), '.total-recall', 'notifications', 'notification-log.md');

/** Auto-detect file paths in a string and convert to markdown links */
function linkifyPaths(text) {
  // Match absolute paths like /Users/... or ~/...
  return String(text).replace(/(\/[^\s,;:'")\]]+|~\/[^\s,;:'")\]]+)/g, (match) => {
    const abs = match.startsWith('~') ? match.replace('~', os.homedir()) : match;
    return `[${match}](file://${abs})`;
  });
}

function appendNotificationLog(title, message, channels, severity = 'info', source = '') {
  try {
    fs.mkdirSync(path.dirname(NOTIFY_LOG), { recursive: true });
    const ts = new Date().toISOString();
    const ch = Array.isArray(channels) ? channels.join(', ') : String(channels);
    const linkedMsg = linkifyPaths(message);
    const meta = [severity, source].filter(Boolean).join(' · ');
    const entry = [
      `### [${ts}] ${title}`,
      `> ${linkedMsg}`,
      ``,
      `*${meta} | Channels: ${ch}*`,
      ``,
      `---`,
      ``,
    ].join('\n');
    const existing = fs.existsSync(NOTIFY_LOG) ? fs.readFileSync(NOTIFY_LOG, 'utf8') : '';
    fs.writeFileSync(NOTIFY_LOG, entry + existing);
  } catch {
    // Logging is best-effort — never block a notification
  }
}

export async function sendNotification(title, message, options = {}) {
  const {
    channels = ['os'],
    severity = 'info',   // 'error' | 'warning' | 'success' | 'info'
    source = '',         // e.g. 'health.mjs', 'deploy', 'code-quality'
  } = options;
  const results = [];

  // Severity config
  const SEVERITY = {
    error:   { emoji: '🔴', sound: 'Basso',   prefix: '[ERROR] ' },
    warning: { emoji: '🟡', sound: 'Glass',   prefix: '[WARN] '  },
    success: { emoji: '✅', sound: 'Hero',    prefix: ''          },
    info:    { emoji: 'ℹ️',  sound: 'default', prefix: ''          },
  };
  const sev = SEVERITY[severity] || SEVERITY.info;
  const displayTitle = `${sev.emoji} ${sev.prefix}${title}`;

  // Timestamp for subtitle (local time HH:MM)
  const now = new Date();
  const ts = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const subtitle = [source, ts, 'Click to view log'].filter(Boolean).join(' · ');

  // Group by source (or severity if no source) so notifications replace instead of stack
  const group = `ultrachat-${source || severity}`;

  // Persist to audit log before firing (never lost, even if OS popup fails)
  appendNotificationLog(displayTitle, message, channels, severity, source);

  for (const channel of channels) {
    try {
      if (channel === 'os') {
        // terminal-notifier: persistent alerts, click opens log, severity-differentiated sounds
        try {
          await execFileAsync('terminal-notifier', [
            '-title',       displayTitle,
            '-message',     message,
            '-subtitle',    subtitle,
            '-open',        `file://${NOTIFY_LOG}`,
            '-sound',       sev.sound,
            '-group',       group,
            '-actions',     'View Log',
            '-closeLabel',  'Dismiss',
          ]);
        } catch {
          // Fallback to plain osascript if terminal-notifier unavailable
          await execFileAsync('osascript', [
            '-e',
            `display notification "${message.replace(/"/g, '\\"')}" with title "${displayTitle.replace(/"/g, '\\"')}"`
          ]);
        }
        results.push({ channel, success: true });
      }

      if (channel === 'email') {
        const apiKey = process.env.DEVELOPER_SMTP2GO_API_KEY;
        const toEmail = process.env.DEVELOPER_NOTIFICATION_EMAIL || "admin@ultrachat.app";
        if (!apiKey) {
          console.warn('[notify] Skipping email: DEVELOPER_SMTP2GO_API_KEY not set.');
          continue;
        }

        const res = await fetch('https://api.smtp2go.com/v3/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: apiKey,
            to: [toEmail],
            sender: "system@ultrachat.app",
            subject: `[UltraChat Alert] ${title}`,
            text_body: message
          })
        });

        if (!res.ok) throw new Error(`SMTP2GO API Error: ${res.statusText}`);
        results.push({ channel, success: true });
      }

      if (channel === 'sms') {
        const apiKey = process.env.DEVELOPER_TELNYX_API_KEY;
        const fromPhone = process.env.DEVELOPER_TELNYX_PHONE_NUMBER || "+15555555555";
        const toPhone = process.env.DEVELOPER_NOTIFICATION_PHONE || "+15555555555";
        if (!apiKey) {
          console.warn('[notify] Skipping SMS: DEVELOPER_TELNYX_API_KEY not set.');
          continue;
        }

        const res = await fetch('https://api.telnyx.com/v2/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            from: fromPhone,
            to: toPhone,
            text: `[${title}]\n${message}`
          })
        });

        if (!res.ok) throw new Error(`Telnyx API Error: ${res.statusText}`);
        results.push({ channel, success: true });
      }

      if (channel === 'github') {
        const token = process.env.DEVELOPER_GITHUB_PAT;
        const repo = process.env.DEVELOPER_GITHUB_REPO || "gregiteen/ultrachat-ai-powered";
        if (!token) {
          console.warn('[notify] Skipping GitHub: DEVELOPER_GITHUB_PAT not set.');
          continue;
        }

        const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: `[System Alert] ${title}`,
            body: `${message}\n\n_Auto-generated by UltraChat Notifications Dev Skill._`,
            labels: ["system-alert"]
          })
        });

        if (!res.ok) throw new Error(`GitHub API Error: ${res.statusText}`);
        results.push({ channel, success: true });
      }

    } catch (error) {
      console.error(`[notify] Failed to send notification via ${channel}:`, error.message);
      results.push({ channel, success: false, error: error.message });
    }
  }

  return results;
}

// Support CLI execution: node notify.mjs "Title" "Message" "os,email"
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const title = args[0] || 'UltraChat';
  const message = args[1] || 'Notification triggered.';
  const channels = args[2] ? args[2].split(',') : ['os'];
  
  sendNotification(title, message, { channels })
    .then((results) => {
      const failed = results.filter(r => !r.success);
      if (failed.length > 0) process.exit(1);
    })
    .catch(() => process.exit(1));
}
