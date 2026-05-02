/**
 * slack.mjs — Slack Webhook Notification Channel
 *
 * Sends notifications to a Slack channel via incoming webhook.
 * Requires TOTAL_RECALL_SLACK_WEBHOOK env var.
 */

/**
 * Send a Slack notification.
 * @param {string} title
 * @param {string} message
 * @param {Object} config - From getNotificationConfig()
 * @returns {Promise<boolean>}
 */
export async function send(title, message, config) {
  const webhook = config?.slack?.webhook;
  if (!webhook) return false;

  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `*🧠 ${title}*\n${message}`,
        unfurl_links: false,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
