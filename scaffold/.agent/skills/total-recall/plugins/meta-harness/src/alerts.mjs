/**
 * Operator Alerts Dispatcher
 * Bridges to Total Recall alerts plugin or system notifications.
 */

import { execFileSync } from 'node:child_process';

export async function notifyAlert(alert = {}) {
  const { title = 'Meta Harness Notification', message = '', severity = 'info' } = alert;

  // Attempt to invoke total-recall alerts if present
  try {
    const totalRecallBin = process.env.TOTAL_RECALL_BIN || 'total-recall';
    execFileSync(totalRecallBin, ['alerts', 'send', '--title', title, '--message', message, '--severity', severity], {
      stdio: 'pipe',
      timeout: 5000
    });
    return { ok: true, dispatchedVia: 'total-recall-alerts' };
  } catch {
    // Fallback: console log without crashing
    return { ok: true, dispatchedVia: 'fallback-logged', logged: { title, message, severity } };
  }
}
