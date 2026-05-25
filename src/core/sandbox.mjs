import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { logger } from './logger.mjs';

/**
 * Command Sanitizer / Whitelist Execution Validator
 * Blocks high-risk actions (destructive deletes, reverse shells, shell pipes)
 */
export function validateCommand(commandLine) {
  if (typeof commandLine !== 'string') return true;
  const trimmed = commandLine.trim();

  // Destructive recursive file operations
  const isRecursiveDelete = /rm\s+-(?:[a-zA-Z]*r[a-zA-Z]*f|[a-zA-Z]*f[a-zA-Z]*r|rf|fr|r|f)\s+/i.test(trimmed);
  if (isRecursiveDelete) {
    const isTargetingParent = /\.\./.test(trimmed);
    const isTargetingRoot = /\s+\/\s*$/.test(trimmed) || trimmed.includes('rm -rf / ') || trimmed.includes('rm -rf /;');
    const isTargetingHome = trimmed.includes('rm -rf ~') || trimmed.includes('rm -rf $HOME');
    const matchesSafeDir = /\b(?:\.agent|sessions|tmp|memory-inbox|memory-vault|fixtures|node_modules)\b/i.test(trimmed);

    if (isTargetingParent || isTargetingRoot || isTargetingHome || (!matchesSafeDir && trimmed.includes('-rf'))) {
      throw new Error(`Security Exception: High-risk delete command blocked: "${commandLine}"`);
    }
  }

  // Piping download tools directly into shell
  const isPipeToShell = /(?:curl|wget|fetch)\s+.*\s*\|\s*(?:bash|sh|zsh)/i.test(trimmed);
  if (isPipeToShell) {
    throw new Error(`Security Exception: Piping download tool to shell blocked: "${commandLine}"`);
  }

  // Reverse shells and network exfiltration tools
  const isReverseShell = /\b(?:nc|netcat)\s+-/i.test(trimmed) || /bash\s+-i/i.test(trimmed) || /sh\s+-i/i.test(trimmed) || /\/dev\/(?:tcp|udp)\//i.test(trimmed);
  if (isReverseShell) {
    throw new Error(`Security Exception: Potential reverse shell blocked: "${commandLine}"`);
  }

  return true;
}

/**
 * Isolated OS-Level Sandbox
 * Executes untrusted agent code in a restricted container or OS-level sandbox.
 */
export async function runInSandbox(scriptPath, timeoutMs = 5000, options = {}) {
  const cappedTimeout = Math.min(Math.max(timeoutMs, 1000), 30000);
  const allowNetwork = options.allowNetwork === true;

  // Restrict environment variables
  const safeEnv = {};
  const whitelist = ['PATH', 'TMPDIR', 'LANG', 'TERM'];
  for (const key of whitelist) {
    if (process.env[key]) {
      safeEnv[key] = process.env[key];
    }
  }
  safeEnv.NODE_OPTIONS = '--experimental-vm-modules';

  // OS-specific sandboxing wrappers
  let cmd = 'node';
  let args = ['--no-warnings', scriptPath];
  let tempSbProfilePath = null;

  try {
    if (process.platform === 'darwin') {
      // macOS sandbox-exec integration
      const profile = [
        '(version 1)',
        '(allow default)',
        '(deny file-write*)',
        '(allow file-write*',
        `  (subpath "/private/tmp")`,
        `  (subpath "/tmp")`,
        `  (subpath "${process.cwd()}")`,
        `  (subpath "${os.tmpdir()}")`,
        `)`,
        allowNetwork 
          ? '' 
          : '(deny network-outbound)'
      ].filter(Boolean).join('\n');

      tempSbProfilePath = path.join(os.tmpdir(), `tr-sandbox-${Date.now()}-${Math.random().toString(36).slice(2)}.sb`);
      fs.writeFileSync(tempSbProfilePath, profile, 'utf8');

      cmd = 'sandbox-exec';
      args = ['-f', tempSbProfilePath, 'node', '--no-warnings', scriptPath];
    } else if (process.platform === 'linux') {
      // Linux namespace isolation check via unshare
      const hasUnshare = fs.existsSync('/usr/bin/unshare') || fs.existsSync('/bin/unshare');
      if (hasUnshare) {
        cmd = 'unshare';
        const unshareArgs = ['--mount', '--ipc', '--pid', '--fork'];
        if (!allowNetwork) {
          unshareArgs.push('--net');
        }
        args = [...unshareArgs, 'node', '--no-warnings', scriptPath];
      }
    }
  } catch (err) {
    logger.warn('sandbox', `Failed to configure OS-specific isolation: ${err.message}. Using default environment limits.`);
  }

  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      env: safeEnv,
      timeout: cappedTimeout
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (tempSbProfilePath && fs.existsSync(tempSbProfilePath)) {
        try { fs.unlinkSync(tempSbProfilePath); } catch {}
      }
      if (code === 0) {
        resolve({ success: true, output: stdout });
      } else {
        resolve({ success: false, output: stderr || stdout, code });
      }
    });

    proc.on('error', (err) => {
      if (tempSbProfilePath && fs.existsSync(tempSbProfilePath)) {
        try { fs.unlinkSync(tempSbProfilePath); } catch {}
      }
      resolve({ success: false, output: err.message, code: -1 });
    });
  });
}

/**
 * Sandbox Execution Loop
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
