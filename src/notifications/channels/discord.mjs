/**
 * discord.mjs — Discord Webhook Notification Channel
 *
 * Sends notifications to a Discord channel via webhook.
 * Requires TOTAL_RECALL_DISCORD_WEBHOOK env var.
 */

/**
 * Send a Discord notification.
 * @param {string} title
 * @param {string} message
 * @param {Object} config - From getNotificationConfig()
 * @returns {Promise<boolean>}
 */
export async function send(title, message, config) {
  const webhook = config?.discord?.webhook;
  if (!webhook) return false;

  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `**🧠 ${title}**\n${message}`,
      }),
    });
    // Discord returns 204 on success
    return response.ok || response.status === 204;
  } catch {
    return false;
  }
}
