#!/usr/bin/env node

import { checkReceipt, findRoot, ACK_COMMAND } from '../core/preflight-receipt.mjs';

/** Harness work belongs to the meta-harness plugin. These commands are a thin door to it. */
async function callPlugin(subcommand, args, options = {}) {
  const { getPlugin } = await import('../core/plugin-loader.mjs');
  const plugin = getPlugin('meta-harness', process.cwd());
  if (!plugin?.valid) throw new Error('The meta-harness plugin is not installed. Run: total-recall plugin install meta-harness');
  const { runPluginCommand } = await import('../core/plugin-runner.mjs');
  const result = await runPluginCommand(plugin, { subcommand, args: [...args, '--json'], timeoutMs: 600000, ...options });
  let data = null;
  try { data = JSON.parse(result.output); } catch { /* reported below */ }
  if (!data) throw new Error(`meta-harness ${subcommand} returned no result: ${String(result.output).trim().slice(0, 300)}`);
  return { ok: result.ok, data };
}

function printHelp() {
  console.log(`
🎮 Total Recall — Meta Harness & Multi-Agent Management Layer

Usage:
  npx total-recall harness <command> [options]

Commands:
  list, usage               Harness readiness, versions and measured usage
  dispatch <id> "<task>"    Headlessly invoke a specific agent harness (read-only by default)
                            Options: --node <name> to execute remotely on a mesh node
                                     --write to let the agent change files
  council "<task>"          Run concurrent multi-harness consensus deliberation

Available Harness IDs:
  agy                       Google Antigravity CLI (Frontier reasoning, AI Ultra)
  claude                    Claude Code CLI (Deep codebase refactoring & Unix execution)
  codex                     OpenAI Codex CLI (Program synthesis & sandbox execution)
  grok                      xAI Grok Build CLI (Autonomous coding, inspection, shell execution)
  ollama                    Ollama Local LLM (Local neural reasoning, zero API cost)
  hermes                    Hermes Agent Runtime (Autonomous supervisor & messaging gateway)
  dsh                       DeepSeek Harness DSH (High-throughput reasoning engine)
  openclaw                  OpenClaw Agent Bridge (Multi-channel messaging & tool execution)

Examples:
  npx total-recall harness list
  npx total-recall harness usage
  npx total-recall harness dispatch claude "Review and run code quality checks on src/core/"
  npx total-recall harness dispatch ollama --node build-box "What is test-time compute scaling?"
  npx total-recall harness council "Propose architecture for decentralized research mesh"
`);
}

export async function run(argv) {
  let args = argv;
  if (Array.isArray(args) && args[0]?.endsWith('node')) {
    args = args.slice(2);
  }
  if (args[0] === 'harness') {
    args = args.slice(1);
  }

  const command = args[0];
  const rest = args.slice(1);
  const asJson = args.includes('--json');

  if (!command || command === 'list' || command === 'status' || command === 'usage') {
    let report;
    try { ({ data: report } = await callPlugin('quota', [])); }
    catch (err) { console.error(`\n❌ ${err.message}`); process.exit(1); }
    if (asJson) { console.log(JSON.stringify(report, null, 2)); return; }
    const pad = (value, width) => String(value ?? '—').padEnd(width).slice(0, width);
    console.log(`\n🎮 Total Recall — Agent Harnesses (${report.node})\n`);
    console.log(`${pad('Harness', 12)} ${pad('Version', 12)} ${pad('Status', 14)} ${pad('5h used', 9)} ${pad('Week used', 10)} Note`);
    for (const [id, quota] of Object.entries(report.quotas || {})) {
      if (id === 'system' || id === 'metered') continue;
      console.log(`${pad(id, 12)} ${pad(quota.version, 12)} ${pad(quota.status, 14)} ${pad(quota.rolling5hUsedPercent, 9)} ${pad(quota.weeklyUsedPercent, 10)} ${quota.quotaNote || ''}`);
    }
    console.log('');
    return;
  }

  if (command === 'dispatch') {
    let targetNode = null;
    let write = false;
    const filteredRest = [];
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '--node' || rest[i] === '-n') {
        targetNode = rest[i + 1];
        i++;
      } else if (rest[i] === '--write') {
        write = true;
      } else if (rest[i] !== '--json') {
        filteredRest.push(rest[i]);
      }
    }

    const harnessId = filteredRest[0];
    const task = filteredRest.slice(1).join(' ').trim();
    if (!harnessId || !task) {
      console.error('Error: Please specify harness ID and task prompt.');
      console.error('Usage: npx total-recall harness dispatch <id> [--node <node>] "<task>"');
      process.exit(1);
    }

    if (!targetNode) {
      const root = findRoot(process.cwd());
      const receipt = checkReceipt(root);
      if (!receipt.ok) {
        console.error(`\n❌ Dispatch refused by TR-PREFLIGHT gate: ${receipt.problems[0] || 'check failed'} (directory: ${root}).`);
        console.error(`   Read the complete context capsule, then run: ${ACK_COMMAND}\n`);
        process.exit(1);
      }
    }

    const nodeStr = targetNode ? ` on mesh node \x1b[1;33m${targetNode}\x1b[0m` : '';
    console.log(`\n🚀 Dispatching task to \x1b[1;36m${harnessId}\x1b[0m${nodeStr}...`);
    try {
      const { ok, data } = await callPlugin('dispatch', [], { stdinText: JSON.stringify({ agent: harnessId, cwd: process.cwd(), prompt: task, node: targetNode || 'local', permissions: { read: true, write }, allowUnknownAuth: true }) });
      if (asJson) { console.log(JSON.stringify(data, null, 2)); if (!ok) process.exit(1); return; }
      if (!ok) throw new Error(data.error || 'The agent failed');
      console.log(`\n--- [Response from ${harnessId}${targetNode ? ' (' + targetNode + ')' : ''}] ---\n`);
      console.log(data.response);
    } catch (err) {
      console.error(`\n❌ Dispatch failed: ${err.message}`);
      process.exit(1);
    }
    return;
  }

  if (command === 'council') {
    const root = findRoot(process.cwd());
    const receipt = checkReceipt(root);
    if (!receipt.ok) {
      console.error(`\n❌ Council deliberation refused by TR-PREFLIGHT gate: ${receipt.problems[0] || 'check failed'} (directory: ${root}).`);
      console.error(`   Read the complete context capsule, then run: ${ACK_COMMAND}\n`);
      process.exit(1);
    }
    const task = rest.filter(arg => arg !== '--json').join(' ').trim();
    if (!task) {
      console.error('Error: Please specify task prompt for council deliberation.');
      console.error('Usage: npx total-recall harness council "<task>"');
      process.exit(1);
    }

    console.log(`\n🏛️  Convening Multi-Agent Council across all available harnesses...`);
    console.log(`   Task: "${task}"\n`);

    try {
      const { data } = await callPlugin('coordinate', [task, '--mode', 'council', '--execute']);
      if (!data.votes) throw new Error(data.error || 'No votes returned');
      if (asJson) { console.log(JSON.stringify(data, null, 2)); return; }
      for (const vote of data.votes) {
        console.log(`● \x1b[1;36m${vote.harness}\x1b[0m: ${vote.vote}${vote.error ? ` (${vote.error})` : ''}`);
        if (vote.feedback) console.log(`${vote.feedback}\n`);
      }
      console.log(`Consensus: ${data.consensus}`);
    } catch (err) {
      console.error(`\n❌ Council deliberation failed: ${err.message}`);
      process.exit(1);
    }
    return;
  }

  printHelp();
}

export default async function (args) {
  await run(args);
}
