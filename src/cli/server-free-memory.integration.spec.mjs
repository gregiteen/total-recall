// @vitest-environment node
import { it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeInvokeChild, invokeEnvironment } from '../server/invoke-execution.mjs';

it('writes, recalls and loads ready context with no reachable HTTP server', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-server-free-'));
  const entry = fileURLToPath(new URL('../../bin/total-recall.mjs', import.meta.url));
  const agentDir = path.join(dir, '.agent');
  const brain = path.join(agentDir, 'skills/total-recall');
  fs.mkdirSync(brain, { recursive: true });
  fs.writeFileSync(path.join(brain, 'SKILL.md'), '---\nname: total-recall\ndescription: Disposable server-free acceptance brain\n---\n# Memory\n');
  const env = { ...invokeEnvironment(false), HOME: dir, AGENT_DIR: agentDir,
    TR_BRAIN: 'http://127.0.0.1:1', TR_ENV_FILE: path.join(dir, 'absent.env'), TR_SECRETS_NO_KEYCHAIN: '1' };
  const run = args => executeInvokeChild({ entry, args, cwd: dir, env });
  try {
    const write = await run(['remember', 'fact', 'serverless-acceptance-proof records portable local memory', '--project']);
    expect(write.exit_code, write.stderr).toBe(0);
    expect(write.stdout).toContain('Permanent SSSS memory node created');
    const recall = await run(['recall', 'serverless-acceptance-proof', '--project', '--local', '--format', 'json', '--no-sessions']);
    expect(recall.exit_code, recall.stderr).toBe(0);
    expect(recall.stdout).toContain('portable local memory');
    const context = await run(['context', 'serverless-acceptance-proof', '--action', 'read']);
    expect(context.exit_code, context.stderr).toBe(0);
    expect(context.stdout).toContain('ready:true');
    expect(fs.readdirSync(path.join(brain, 'memory-vault/facts')).some(name => name.endsWith('.md'))).toBe(true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}, 30000);
