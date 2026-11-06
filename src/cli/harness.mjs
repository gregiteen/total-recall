#!/usr/bin/env node
/** Legacy command door. Native harness behavior is owned by the Meta Harness plugin. */
import { checkAnyReceipt, findRoot, ACK_COMMAND } from '../core/preflight-receipt.mjs';
import path from 'node:path';

async function callPlugin(subcommand, args, options = {}) {
  const { getPlugin } = await import('../core/plugin-loader.mjs');
  const plugin = getPlugin('meta-harness', process.cwd());
  if (!plugin?.valid) throw new Error('The meta-harness plugin is not installed');
  const { runPluginCommand } = await import('../core/plugin-runner.mjs');
  const result = await runPluginCommand(plugin, { subcommand, args: [...args, '--json'], timeoutMs: 600000, ...options });
  let data;
  try { data = JSON.parse(result.output); }
  catch { throw new Error(`Meta Harness returned invalid JSON for ${subcommand}`); }
  if (!result.ok || data?.ok === false) {
    const error = new Error(data?.error || `Meta Harness ${subcommand} failed`);
    error.result = data;
    throw error;
  }
  return data;
}

function requireReceipt() {
  const receipt = checkAnyReceipt(findRoot(process.cwd()));
  if (!receipt.ok) throw new Error(`TR-PREFLIGHT gate: ${receipt.problems[0] || 'check failed'}. Read the complete context capsule, then run: ${ACK_COMMAND}`);
}

export async function run(argv = []) {
  let args = argv;
  if (args[0]?.endsWith('node')) args = args.slice(2);
  if (args[0] === 'harness') args = args.slice(1);
  const asJson = args.includes('--json');
  try {
    if (args.includes('--help') || args.includes('-h') || args[0] === 'help') {
      console.log('Usage: total-recall harness list|usage [--node ID] [--json] | dispatch <id> <task> [--node ID --cwd /remote/workspace] [--write] [--allow-unknown-auth] [--json] | council <task> [--allow-unknown-auth] [--json]. Harness operations delegate to the Meta Harness plugin.');
      return;
    }
    const command = args[0] || 'list', positional = [];
    let node = 'local', cwd, write = false, allowUnknownAuth = false;
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--json') continue;
      if (arg === '--node' || arg === '-n') {
        node = args[++i];
        if (!node || node.startsWith('-')) throw new Error('--node requires an identifier');
      } else if (arg === '--cwd') {
        cwd = args[++i];
        if (!cwd || cwd.startsWith('-')) throw new Error('--cwd requires a workspace');
      } else if (arg === '--write') write = true;
      else if (arg === '--allow-unknown-auth') allowUnknownAuth = true;
      else if (arg.startsWith('-')) throw new Error(`Unknown harness option: ${arg}`);
      else positional.push(arg);
    }
    let data;
    if (['list', 'status', 'usage'].includes(command)) {
      if (positional.length || cwd || write || allowUnknownAuth) throw new Error('Unexpected harness usage arguments');
      data = await callPlugin('quota', node === 'local' ? [] : ['--node', node]);
    } else if (command === 'dispatch') {
      const [agent, ...words] = positional, prompt = words.join(' ').trim();
      if (!agent || !prompt) throw new Error('Usage: total-recall harness dispatch <id> <task>');
      if (node !== 'local' && (typeof cwd !== 'string' || (!path.posix.isAbsolute(cwd) && !path.win32.isAbsolute(cwd)))) throw new Error('Remote dispatch requires an explicit absolute --cwd');
      requireReceipt();
      data = await callPlugin('dispatch', [], { stdinRequest: JSON.stringify({ agent, cwd: cwd || process.cwd(), prompt, node, permissions: { read: true, write }, allowUnknownAuth }) });
    } else if (command === 'council') {
      const prompt = positional.join(' ').trim();
      if (!prompt || cwd || write) throw new Error('Council requires a read-only task in this workspace');
      requireReceipt();
      data = await callPlugin('coordinate', [prompt, '--mode', 'council', '--execute', ...(node !== 'local' ? ['--node', node] : []), ...(allowUnknownAuth ? ['--allow-unknown-auth'] : [])]);
    } else throw new Error(`Unknown harness command: ${command}`);
    if (asJson) console.log(JSON.stringify(data, null, 2));
    else if (command === 'dispatch') console.log(data.response || '');
    else if (command === 'council') {
      for (const vote of data.votes || []) console.log(`${vote.harness}: ${vote.vote}${vote.error ? ' (' + vote.error + ')' : ''}`);
      console.log(`Consensus: ${data.consensus}`);
    } else {
      console.log(`Harnesses on ${data.node || node}`);
      for (const [id, quota] of Object.entries(data.quotas || {})) if (!['system', 'metered'].includes(id)) console.log(`${id}: ${quota.status || 'unknown'}; ${quota.quotaNote || 'no usage source'}`);
    }
  } catch (error) {
    process.exitCode = 1;
    if (asJson) console.log(JSON.stringify({ ...(error.result && typeof error.result === 'object' ? error.result : {}), ok: false, error: error.message }));
    else console.error(error.message);
  }
}
export default run;
