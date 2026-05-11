#!/usr/bin/env node

/**
 * dispatch.mjs — Dispatch a prompt to any CLI agent (gemini, claude, codex)
 * 
 * Usage:
 *   node .agent/skills/cli-agents/scripts/dispatch.mjs <agent> "<prompt>" [options]
 * 
 * Examples:
 *   node .agent/skills/cli-agents/scripts/dispatch.mjs gemini "Extract AsteriskCallService" --notify
 *   node .agent/skills/cli-agents/scripts/dispatch.mjs claude "Review this file" --plan
 *   node .agent/skills/cli-agents/scripts/dispatch.mjs codex "Write tests for utils.ts" --notify
 */

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSync, writeFileSync } from 'node:fs';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../../../../');
const NOTIFY_SCRIPT = path.join(ROOT, '.agent/skills/notifications/scripts/notify.mjs');

// Agent binary registry
const AGENTS = {
  gemini: {
    bin: '/Users/greg/.nvm/versions/node/v24.12.0/bin/gemini',
    headlessArgs: (prompt, opts) => {
      const args = ['-p', prompt, '--sandbox=false'];
      if (opts.plan) args.push('--approval-mode', 'plan');
      else args.push('--yolo');
      if (opts.model) args.push('-m', opts.model);
      if (opts.worktree) args.push('-w', opts.worktree);
      if (opts.json) args.push('-o', 'json');
      if (opts.include) {
        const dirs = Array.isArray(opts.include) ? opts.include : [opts.include];
        dirs.forEach(d => args.push('--include-directories', d));
      }
      return args;
    },
  },
  claude: {
    bin: '/Users/greg/.local/bin/claude',
    headlessArgs: (prompt, opts) => {
      const args = ['-p', prompt];
      if (opts.plan) {
        args.push('--permission-mode', 'plan');
      } else {
        args.push('--permission-mode', 'bypassPermissions');
      }
      if (opts.allowedTools) args.push('--allowedTools', opts.allowedTools);
      else if (!opts.plan) args.push('--allowedTools', 'Edit,Write,Bash,Read');
      if (opts.model) args.push('--model', opts.model);
      if (opts.json) args.push('--output-format', 'json');
      if (opts.budget) args.push('--max-budget-usd', String(opts.budget));
      return args;
    },
  },
  codex: {
    bin: '/Users/greg/.nvm/versions/node/v24.12.0/bin/codex',
    headlessArgs: (prompt, opts) => {
      const args = ['exec', prompt, '--full-auto'];
      if (opts.model) args.push('-m', opts.model);
      if (opts.json) args.push('--json');
      if (opts.sandbox) args.push('-s', opts.sandbox);
      return args;
    },
  },
};

async function notify(title, message) {
  try {
    await execFileAsync('node', [NOTIFY_SCRIPT, title, message]);
  } catch (e) {
    console.error('[dispatch] notification failed:', e.message);
  }
}

function dispatch(agentName, prompt, opts = {}) {
  const agent = AGENTS[agentName];
  if (!agent) {
    console.error(`Unknown agent: ${agentName}. Available: ${Object.keys(AGENTS).join(', ')}`);
    process.exit(1);
  }

  const contextualPrompt = `[MANDATORY STARTUP CONTEXT: Read .agent/START.md and HANDOFF.md first] \n\nTask:\n${prompt}`;
  const args = agent.headlessArgs(contextualPrompt, opts);
  console.log(`[dispatch] Spawning ${agentName}: ${agent.bin} ${args.join(' ')}`);
  console.log(`[dispatch] Working directory: ${ROOT}`);

  const isOrchestrator = prompt.includes('AUTONOMOUS ORCHESTRATOR');
  const logPrefix = isOrchestrator ? 'orchestrator' : `${agentName}-dispatch`;
  const logFile = path.join('/tmp', `${logPrefix}-${Date.now()}.log`);
  writeFileSync(logFile, `[PROMPT_START]\n${prompt}\n[PROMPT_END]\n\n`);
  const out = openSync(logFile, 'a');

  const child = spawn(agent.bin, args, {
    cwd: ROOT,
    stdio: opts.background ? ['ignore', out, out] : 'inherit',
    detached: opts.background || false,
  });

  import('node:fs').then(fs => {
    fs.appendFileSync(logFile, `[DISPATCH_PID] ${child.pid}\n`);
  });

  child.on('close', async (code) => {
    const status = code === 0 ? '✅' : '❌';
    const msg = `${agentName} finished with exit code ${code}`;
    console.log(`[dispatch] ${status} ${msg}`);

    await notify(
      `${status} ${agentName.charAt(0).toUpperCase() + agentName.slice(1)} Done`,
      msg
    );
  });

  if (opts.background) {
    child.unref();
    console.log(`[dispatch] ${agentName} dispatched to background (PID: ${child.pid})`);
  }

  // Automatic dispatch notification
  notify(`🚀 ${agentName.charAt(0).toUpperCase() + agentName.slice(1)} Dispatched`, `Task started (PID: ${child.pid})`).catch(() => {});

  return child;
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const agentName = args[0];
  const prompt = args[1];

  if (!agentName || !prompt) {
    console.error('Usage: dispatch.mjs <agent> "<prompt>" [--notify] [--plan] [--json] [--bg] [--model MODEL] [--worktree NAME]');
    process.exit(1);
  }

  const opts = {
    notify: args.includes('--notify'),
    plan: args.includes('--plan'),
    json: args.includes('--json'),
    background: args.includes('--bg'),
    model: args.includes('--model') ? args[args.indexOf('--model') + 1] : undefined,
    worktree: args.includes('--worktree') ? args[args.indexOf('--worktree') + 1] : undefined,
    include: args.includes('--include') ? args[args.indexOf('--include') + 1] : undefined,
    budget: args.includes('--budget') ? args[args.indexOf('--budget') + 1] : undefined,
    sandbox: args.includes('--sandbox') ? args[args.indexOf('--sandbox') + 1] : undefined,
    allowedTools: args.includes('--tools') ? args[args.indexOf('--tools') + 1] : undefined,
  };

  const monitorScript = path.join(ROOT, '.agent/skills/cli-agents/scripts/monitor-server.mjs');
  try {
    const p = spawn('node', [monitorScript], { detached: true, stdio: 'ignore' });
    p.unref();
  } catch (e) {
    // Ignore if already running or fails
  }

  dispatch(agentName, prompt, opts);
}

export { dispatch, AGENTS, notify };
