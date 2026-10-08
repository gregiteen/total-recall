#!/usr/bin/env node

import { detectHarnesses, detectHarnessesWithAuth, queryHarnessUsage, dispatchTask, runCouncil, HARNESS_SPECS } from '../core/meta-harness.mjs';

function printHelp() {
  console.log(`
🎮 Total Recall — Meta Harness & Multi-Agent Management Layer

Usage:
  npx total-recall harness <command> [options]

Commands:
  list                      Inspect all external developer harnesses, versions & auth
  usage                     Query harness account APIs for 5h & weekly quota remaining %
  dispatch <id> "<task>"    Headlessly invoke a specific agent harness
                            Options: --node <name> to execute remotely on a mesh node
  council "<task>"          Run concurrent multi-harness consensus deliberation

Available Harness IDs:
  agy                       Google Antigravity CLI (Frontier reasoning, AI Ultra)
  claude                    Claude Code CLI (Deep codebase refactoring & Unix execution)
  codex                     OpenAI Codex CLI (Program synthesis & sandbox execution)
  grok                      xAI Grok Build CLI (Autonomous coding, inspection, shell execution)
  gemini                    Google Gemini CLI (Fast utilities & completion chaining)
  ollama                    Ollama Local LLM (Local neural reasoning, zero API cost)

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
    const reports = await queryHarnessUsage();
    if (asJson) {
      console.log(JSON.stringify(reports, null, 2));
      return;
    }

    console.log(`\n🎮 Total Recall — Connected Agent Harnesses, Versions & Quotas\n`);

    const pad = (s, l) => String(s || '').padEnd(l).slice(0, l);
    console.log('┌──────────────┬──────────────────────────────┬──────────────┬──────────────┬──────────────────────────┬──────────────────────┬──────────────────────┬──────────────┐');
    console.log(`│ ${pad('Harness ID', 12)} │ ${pad('Name', 28)} │ ${pad('Version', 12)} │ ${pad('Current?', 12)} │ ${pad('Auth Route', 24)} │ ${pad('5h Quota Rem. %', 20)} │ ${pad('Weekly Rem. %', 20)} │ ${pad('Status', 12)} │`);
    console.log('├──────────────┼──────────────────────────────┼──────────────┼──────────────┼──────────────────────────┼──────────────────────┼──────────────────────┼──────────────┤');

    for (const h of reports) {
      const ver = h.version || '—';
      const cur = h.isCurrent ? 'Current ✅   ' : (h.latestVersion ? `Update (${h.latestVersion.slice(0, 5)})` : 'Check ⚠️     ');
      const auth = h.authRoute || '—';
      const q5h = h.rolling5hRemainingPct || '—';
      const qWeek = h.weeklyRemainingPct || '—';
      let statusStr = '\x1b[31mNot Found ❌\x1b[0m';
      if (h.available) {
        if (h.status === 'ready') statusStr = '\x1b[32mReady ✅\x1b[0m     ';
        else if (h.status === 'update_available') statusStr = '\x1b[33mUpdate 🔄\x1b[0m   ';
        else statusStr = '\x1b[33mNo Auth ⚠️\x1b[0m   ';
      }
      console.log(`│ \x1b[1m${pad(h.id, 12)}\x1b[0m │ ${pad(h.name, 28)} │ ${pad(ver, 12)} │ ${pad(cur, 12)} │ ${pad(auth, 24)} │ ${pad(q5h, 20)} │ ${pad(qWeek, 20)} │ ${statusStr} │`);
    }
    console.log('└──────────────┴──────────────────────────────┴──────────────┴──────────────┴──────────────────────────┴──────────────────────┴──────────────────────┴──────────────┘\n');
    return;
  }

  if (command === 'dispatch') {
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

    const harnessId = filteredRest[0];
    const task = filteredRest.slice(1).join(' ').trim();
    if (!harnessId || !task) {
      console.error('Error: Please specify harness ID and task prompt.');
      console.error('Usage: npx total-recall harness dispatch <id> [--node <node>] "<task>"');
      process.exit(1);
    }

    const nodeStr = targetNode ? ` on mesh node \x1b[1;33m${targetNode}\x1b[0m` : '';
    console.log(`\n🚀 Dispatching task to \x1b[1;36m${harnessId}\x1b[0m${nodeStr}...`);
    try {
      const res = await dispatchTask(harnessId, task, { node: targetNode });
      console.log(`\n--- [Response from ${res.harnessName}${targetNode ? ' (' + targetNode + ')' : ''}] ---\n`);
      console.log(res.response);
      console.log(`\n✅ Exit code: ${res.exitCode}`);
    } catch (err) {
      console.error(`\n❌ Dispatch failed: ${err.message}`);
      process.exit(1);
    }
    return;
  }

  if (command === 'council') {
    const task = rest.join(' ').trim();
    if (!task) {
      console.error('Error: Please specify task prompt for council deliberation.');
      console.error('Usage: npx total-recall harness council "<task>"');
      process.exit(1);
    }

    console.log(`\n🏛️  Convening Multi-Agent Council across all available harnesses...`);
    console.log(`   Task: "${task}"\n`);

    try {
      const councilRes = await runCouncil(task);
      console.log(`Participating Harnesses: ${councilRes.participants.join(', ')}\n`);

      for (const r of councilRes.results) {
        console.log(`================================================================`);
        console.log(`● Harness: \x1b[1;36m${r.harnessName}\x1b[0m (${r.harnessId})`);
        console.log(`================================================================`);
        if (r.success) {
          console.log(r.response);
        } else {
          console.log(`\x1b[31mError: ${r.error || r.stderr || 'Execution failed'}\x1b[0m`);
        }
        console.log('');
      }
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
