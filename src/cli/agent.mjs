#!/usr/bin/env node

import { listAgents, spawnAgent, killAgent, getAgentLogs } from '../core/agent-manager.mjs';
import { detectHarnesses } from '../core/meta-harness.mjs';

function printHelp() {
  console.log(`
🤖 Total Recall — CLI Agent Management & Process Controller

Usage:
  npx total-recall agent <command> [options]

Commands:
  list                      List all running and recent agent processes
  spawn <harness> "<task>"  Spawn a background or foreground agent task
  status [id]               Show detailed status of an agent
  logs <id> [--tail 50]     Inspect streaming logs of a spawned agent
  kill <id|pid>             Terminate an active agent process

Options:
  --node <name>             Target a remote mesh node (macmini, cloud, etc.)
  --json                    Output machine-readable JSON for Unix pipelines
  --detach                  Spawn process detached in background (default: true)
  --name <label>            Assign a human-readable name to the agent session
  --tail <lines>            Number of log lines to inspect (default: 50)

Available Harnesses:
  agy, claude, codex, gemini

Examples:
  npx total-recall agent list
  npx total-recall agent spawn claude "Refactor src/cli/harness.mjs error handling"
  npx total-recall agent spawn agy "Crawl recent preprints on quantum shuttling" --name "Quantum Scout"
  npx total-recall agent logs agent-claude-xyz --tail 100
  npx total-recall agent kill agent-claude-xyz
`);
}

export async function run(argv) {
  let args = argv;
  if (Array.isArray(args) && args[0]?.endsWith('node')) {
    args = args.slice(2);
  }
  if (args[0] === 'agent' || args[0] === 'agents') {
    args = args.slice(1);
  }

  const command = args[0];
  const rest = args.slice(1);

  if (!command || command === 'list') {
    const isJson = rest.includes('--json');
    const agents = listAgents();

    if (isJson) {
      console.log(JSON.stringify(agents, null, 2));
      return;
    }

    console.log(`\n🤖 Total Recall — Active Agent Process Registry\n`);
    if (agents.length === 0) {
      console.log('No agents currently active or tracked.');
      console.log('Spawn an agent with: npx total-recall agent spawn <harness> "<task>"\n');
      return;
    }

    const pad = (s, l) => String(s || '').padEnd(l).slice(0, l);
    console.log('┌────────────────────────┬──────────────┬────────┬────────────┬────────────────────────────┬─────────────────────────────┐');
    console.log(`│ ${pad('Agent ID', 22)} │ ${pad('Harness', 12)} │ ${pad('PID', 6)} │ ${pad('Status', 10)} │ ${pad('Started At', 26)} │ ${pad('Task Intent', 27)} │`);
    console.log('├────────────────────────┼──────────────┼────────┼────────────┼────────────────────────────┼─────────────────────────────┤');

    for (const a of agents) {
      const statusBadge = a.status === 'running' ? '\x1b[32mrunning\x1b[0m   ' : (a.status === 'completed' ? '\x1b[36mcompleted\x1b[0m ' : '\x1b[90mstopped\x1b[0m   ');
      const time = (a.startedAt || '').replace('T', ' ').slice(0, 19);
      console.log(`│ \x1b[1m${pad(a.id, 22)}\x1b[0m │ ${pad(a.harness, 12)} │ ${pad(a.pid, 6)} │ ${statusBadge} │ ${pad(time, 26)} │ ${pad(a.task, 27)} │`);
    }
    console.log('└────────────────────────┴──────────────┴────────┴────────────┴────────────────────────────┴─────────────────────────────┘\n');
    return;
  }

  if (command === 'spawn') {
    let targetNode = null;
    const filteredRest = [];
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '--node' || rest[i] === '-n') {
        targetNode = rest[i + 1];
        i++;
      } else {
        filteredRest.push(rest[i]);
      }
    }

    const harness = filteredRest[0];
    const task = filteredRest.filter(r => !r.startsWith('--')).slice(1).join(' ').trim();
    const detach = !filteredRest.includes('--no-detach');
    const isJson = filteredRest.includes('--json');
    const nameIdx = filteredRest.indexOf('--name');
    const name = nameIdx !== -1 ? filteredRest[nameIdx + 1] : null;

    if (!harness || !task) {
      console.error('Error: Please specify harness ID and task prompt.');
      console.error('Usage: npx total-recall agent spawn <harness> "<task>" [--name "..."] [--node <node>]');
      process.exit(1);
    }

    const nodeStr = targetNode ? ` on mesh node \x1b[1;33m${targetNode}\x1b[0m` : '';
    if (!isJson) console.log(`\n🚀 Spawning agent on harness: \x1b[1;36m${harness}\x1b[0m${nodeStr}...`);
    try {
      const record = await spawnAgent(harness, task, { detach, name, node: targetNode });
      if (isJson) {
        console.log(JSON.stringify(record, null, 2));
        return;
      }
      console.log(`✅ Agent session spawned successfully!`);
      console.log(`   Session ID: \x1b[1m${record.id}\x1b[0m (PID: ${record.pid || 'remote'})`);
      console.log(`   Status:     \x1b[32m${record.status}\x1b[0m`);
      if (record.node) console.log(`   Mesh Node:  ${record.node}`);
      if (record.logFile) console.log(`   Log File:   ${record.logFile}`);
      console.log(`\nMonitor logs with: \x1b[36mnpx total-recall agent logs ${record.id}\x1b[0m\n`);
    } catch (err) {
      console.error(`\n❌ Failed to spawn agent: ${err.message}\n`);
      process.exit(1);
    }
    return;
  }

  if (command === 'logs') {
    const id = rest.find(r => !r.startsWith('--'));
    if (!id) {
      console.error('Error: Please specify agent ID or PID.');
      console.error('Usage: npx total-recall agent logs <id> [--tail 50]');
      process.exit(1);
    }

    const tailIdx = rest.indexOf('--tail');
    const tailLines = tailIdx !== -1 ? parseInt(rest[tailIdx + 1], 10) : 50;

    try {
      const logs = await getAgentLogs(id, tailLines);
      console.log(`\n📜 Logs for Agent [${id}]:\n`);
      console.log(logs || '(Log is empty)');
      console.log('');
    } catch (err) {
      console.error(`\n❌ ${err.message}\n`);
      process.exit(1);
    }
    return;
  }

  if (command === 'kill') {
    const id = rest.find(r => !r.startsWith('--'));
    if (!id) {
      console.error('Error: Please specify agent ID or PID to terminate.');
      console.error('Usage: npx total-recall agent kill <id|pid>');
      process.exit(1);
    }

    try {
      const res = await killAgent(id);
      console.log(`\n✅ ${res.message}\n`);
    } catch (err) {
      console.error(`\n❌ ${err.message}\n`);
      process.exit(1);
    }
    return;
  }

  printHelp();
}

export default async function (args) {
  await run(args);
}
