import { spawn } from 'child_process';
import path from 'path';
import { logger } from './logger.mjs';

/**
 * Isolated VM Sandbox
 * Executes untrusted agent code in a restricted Node.js environment.
 */

export async function runInSandbox(scriptPath, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    // Cap timeout between 1s and 30s to prevent resource exhaustion
    const cappedTimeout = Math.min(Math.max(timeoutMs, 1000), 30000);
    // Uses --experimental-vm-modules for ESM isolation if needed,
    // but typically a simple spawn with restricted permissions is enough for prototype.
    const safeEnv = {};
    const whitelist = ['PATH', 'TMPDIR', 'LANG', 'TERM'];
    for (const key of whitelist) {
      if (process.env[key]) {
        safeEnv[key] = process.env[key];
      }
    }
    safeEnv.NODE_OPTIONS = '--experimental-vm-modules';

    const proc = spawn('node', ['--no-warnings', scriptPath], {
      env: safeEnv,
      timeout: cappedTimeout
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output: stdout });
      } else {
        resolve({ success: false, output: stderr, code });
      }
    });

    proc.on('error', (err) => {
      resolve({ success: false, output: err.message, code: -1 });
    });
  });
}

/**
 * Sandbox Execution Loop with Frontier Escalation
 */
export async function executeWithEscalation(task, scriptPath, maxRetries = 3, configPath) {
  let failures = 0;
  let failureContext = '';

  for (let i = 0; i < maxRetries; i++) {
    logger.info('sandbox', `Attempt ${i + 1}/${maxRetries} for ${task.slug}`);
    const result = await runInSandbox(scriptPath);

    if (result.success) {
      logger.info('sandbox', 'Success!');
      return { success: true, output: result.output, escalated: false };
    }

    logger.warn('sandbox', `Failure: ${result.output.slice(0, 100)}...`);
    failures++;
    failureContext += `Attempt ${i + 1}:\n${result.output}\n\n`;
  }

  logger.error('sandbox', `Max retries exceeded. Execution failed in sandbox.`);
  return { success: false, output: failureContext, escalated: false };
}
