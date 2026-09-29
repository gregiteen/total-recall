import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const WORKER_SCRIPT = path.resolve(import.meta.dirname, 'openrouter-plugin-worker.mjs');
const LOG_DIR = path.join(process.cwd(), '.agent', 'logs', 'agents');
const STATE_DIR = path.join(process.cwd(), '.agent', 'state');
fs.mkdirSync(LOG_DIR, { recursive: true });
fs.mkdirSync(STATE_DIR, { recursive: true });

const ACTIVE_WORKERS = [
  {
    repo: '/Users/greg/Github/tr-plugin-phone',
    task: 'Extract Phase 1 shared Telnyx telephony client in src/telnyx.mjs: implement searchNumbers, orderNumber, createCall, hangupCall, verifyWebhook (Ed25519), and normalizeE164. Reference festech-modular/apps/web/lib/telnyx.ts and ultrachat-ai-powered/server/services/asterisk/TelnyxService.ts. Write comprehensive unit tests in test/telnyx.test.mjs with mock fetch. Run node --test to verify.',
  },
  {
    repo: '/Users/greg/Github/tr-plugin-decision',
    task: 'Implement Phase 2 question sets and event recorder: 1. Create registry/extensions/decision.json declaring SSSS primitives decision_questions and decision_made. 2. Implement src/store.mjs to validate questions frontmatter, save decision_questions documents, and emit decision_made events. 3. Write unit tests in test/store.test.mjs. Run node --test to verify.',
  },
];

const spawned = [];

for (const worker of ACTIVE_WORKERS) {
  const name = path.basename(worker.repo);
  const logFile = path.join(LOG_DIR, `${name}.log`);
  const logFd = fs.openSync(logFile, 'w');

  const child = spawn(process.execPath, [
    WORKER_SCRIPT,
    '--repo', worker.repo,
    '--task', worker.task,
    '--model', 'deepseek/deepseek-v4.1-flash',
  ], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });

  child.unref();
  fs.closeSync(logFd);

  spawned.push({
    id: `agent-${name}`,
    repo: name,
    pid: child.pid,
    model: 'deepseek/deepseek-v4.1-flash',
    logFile,
    startedAt: new Date().toISOString(),
    status: 'running',
  });
}

// Update state file
fs.writeFileSync(path.join(STATE_DIR, 'active-agents.json'), JSON.stringify(spawned, null, 2));

// Also mirror to ~/.agent/state/active-agents.json so global total-recall agent list sees them
const homeStateDir = path.join(process.env.HOME || '/Users/greg', '.agent', 'state');
try {
  fs.mkdirSync(homeStateDir, { recursive: true });
  fs.writeFileSync(path.join(homeStateDir, 'active-agents.json'), JSON.stringify(spawned, null, 2));
} catch {}

console.log(JSON.stringify({ ok: true, count: spawned.length, agents: spawned }, null, 2));
