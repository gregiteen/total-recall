/**
 * email.mjs — Email Notification Channel (via Resend)
 *
 * Sends transactional emails using the Resend API.
 * Requires TOTAL_RECALL_RESEND_KEY and TOTAL_RECALL_EMAIL_TO env vars.
 *
 * Uses native fetch — no npm dependencies.
 */

/**
 * Send an email notification.
 * @param {string} title
 * @param {string} message
 * @param {Object} config - From getNotificationConfig()
 * @returns {Promise<boolean>}
 */
export async function send(title, message, config) {
  const { resendKey, to, from } = config?.email || {};
  if (!resendKey || !to) return false;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from || 'Total Recall <memory@totalrecall.dev>',
        to: Array.isArray(to) ? to : [to],
        subject: `🧠 ${title}`,
        text: message,
        html: `<div style="font-family: -apple-system, sans-serif; padding: 20px;">
  <h2 style="color: #6366f1;">🧠 ${escapeHtml(title)}</h2>
  <p style="color: #374151; line-height: 1.6;">${escapeHtml(message).replace(/\n/g, '<br>')}</p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
  <p style="color: #9ca3af; font-size: 12px;">Sent by Total Recall Memory Engine</p>
</div>`,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
