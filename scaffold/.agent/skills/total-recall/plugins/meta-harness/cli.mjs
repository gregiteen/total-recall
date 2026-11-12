import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { configDir } from './src/paths.mjs';
import { inspectAgents, getActiveAdapters, getCustomAdaptersDirs, loadCustomAdapters, validateCustomAdapter, adapterPath } from './src/worker.mjs';
import { inspectNode, listTargets, executeCommand, executeOnNode } from './src/executor.mjs';
import { DOC_SOURCES, documentationStatus, refreshDocumentation, ensureDocumentation, maintainDocumentation, readDocumentation, searchDocumentation } from './src/documentation.mjs';
import { manageRuntime, validateRuntimeOperation } from './src/runtime.mjs';
import { validateDispatchRequest } from './src/dispatch-request.mjs';
import { setupIntegrations } from './src/setup.mjs';
import { inspectUpstreamFleet, getAgentChangelog } from './src/tracker.mjs';
import { inspectQuotas, getBenchmarks, routeTask } from './src/router.mjs';
import { coordinateTask } from './src/coordinator.mjs';
import { executeRoutedTask } from './src/cascade.mjs';
import { dispatchWithReceipt } from './src/dispatch.mjs';
import { resolvePool } from './src/pool.mjs';
import { checkAlerts, notifyAlert } from './src/alerts.mjs';
import { learnFromHistory, voidReceipts } from './src/learner.mjs';
import { decomposeTask } from './capability/index.mjs';
import { listThreads, getThread, createThread, updateThread, closeThread, deleteThread } from './src/threads.mjs';
import { executeCodeReview } from './src/review.mjs';
import { stopOnTermination } from './src/termination.mjs';
import { chatTarget, setChatDefault } from './src/chat.mjs';

const VALUE_FLAGS = ['--node', '--mode', '--orchestrator', '--branch', '--reviewer', '--thread', '--status', '--platform', '--agent', '--url', '--brains', '--query', '--tier', '--threshold', '--author', '--explorer', '--architect', '--implementer', '--verifier', '--title', '--summary', '--cwd', '--tools', '--setting-sources', '--model', '--name', '--tail', '--timeout-ms', '--void', '--reason'];
export function parseArguments(args) {
  const positional = [];
  for (let index = 1; index < args.length; index += 1) {
    if (VALUE_FLAGS.includes(args[index])) { index += 1; continue; }
    if (!args[index].startsWith('--')) positional.push(args[index]);
  }
  const value = name => {
    const index = args.indexOf(name);
    if (index < 0) return undefined;
    if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${name} requires a value`);
    return args[index + 1];
  };
  return { positional, value, has: name => args.includes(name) };
}

export async function run(argv = []) {
  stopOnTermination();
  try { await runOperation(argv); }
  catch (error) {
    const message = String(error?.message || error);
    if (argv.includes('--json')) console.log(JSON.stringify({ ok: false, error: message }));
    else console.error(`meta-harness: ${message}`);
    process.exitCode = 1;
  }
}

/** The host stops a plugin command after 10 minutes, so long runs detach and report through their thread and log. */
async function detachRun(argv) {
  const directory = path.join(configDir(), 'jobs');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const log = path.join(directory, `${Date.now().toString(36)}.log`);
  const output = fs.openSync(log, 'a', 0o600);
  const entry = new URL('./cli.mjs', import.meta.url).href;
  const child = spawn(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(entry)}).then(m=>m.run(${JSON.stringify(argv.filter(arg => arg !== '--background'))}))`], { cwd: process.cwd(), detached: true, stdio: ['ignore', output, output], env: process.env });
  try {
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    child.unref();
  } finally { fs.closeSync(output); }
  return { ok: true, background: true, pid: child.pid, log, follow: `The final JSON result is written to ${log}; a pipeline also records a thread.` };
}

async function runOperation(argv) {
  const args = argv.slice(3); const operation = args[0] || 'status';
  const { positional, value, has } = parseArguments(args);
  const remoteTimeout = () => {
    const raw = value('--timeout-ms');
    if (raw === undefined) return {};
    const timeoutMs = Number(raw);
    if (!Number.isInteger(timeoutMs)) throw new Error('--timeout-ms must be a whole number of milliseconds');
    return { timeoutMs };
  };
  // Help anywhere in the arguments prints usage; it must never run an operation.
  if (operation === 'help' || args.some(arg => arg === '--help' || arg === '-h')) {
    const manifest=JSON.parse(fs.readFileSync(new URL('./plugin.json',import.meta.url),'utf8'));
    console.log('Usage: total-recall meta-harness <operation> [options]  (alias: cli-agents)\nEvery agent receives Total Recall bootstrap before dispatch. Runtime syntax: runtime <agent> <maintenance-command...> [--node ID].\n');
    for(const command of manifest.cli.subcommands)console.log(`  ${command.name} ${(command.args || []).map(arg=>arg.flag?`${arg.flag} <${arg.name}>`:`<${arg.name}>`).join(' ')} — ${command.description}`);
    return;
  }
  if (has('--background') && ['route', 'coordinate', 'orchestrate'].includes(operation) && has('--execute')) { console.log(JSON.stringify(await detachRun(argv))); return; }
  let result;
  if (operation === 'status') result = {...await inspectNode(value('--node') || 'local'),documentation:documentationStatus()};
  else if (operation === 'catalog') result = { adapters: getActiveAdapters(), permissions: ['read', 'write', 'send', 'destructive'] };
  else if (operation === 'chat-target') result = chatTarget(value('--brains'));
  else if (operation === 'chat-default') result = setChatDefault(positional[0], value('--url'));
  else if (operation === 'nodes') result = await listTargets();
  else if (operation === 'adoption') {
    const node = value('--node');
    if (node && has('--all')) throw new Error('Choose either --node or --all');
    const { inspectLocalAdoption, inspectFleetAdoption } = await import('./src/adoption.mjs');
    result = has('--all') || (node && node !== 'local') ? await inspectFleetAdoption({ node }) : await inspectLocalAdoption();
    if (!result.ok) process.exitCode = 1;
  }
  else if (operation === 'quota') result = await inspectQuotas({ node: value('--node') || 'local' });
  else if (operation === 'openrouter-bind') {
    const { bindOpenRouter } = await import('./src/included-usage.mjs');
    result = await bindOpenRouter(positional[0], positional[1], value('--model'));
  }
  else if (['included-status', 'included-enforce', 'included-bind-claude', 'included-bind-claude-plan'].includes(operation)) {
    const usage = await import('./src/included-usage.mjs');
    if (operation === 'included-status') result = await usage.includedUsageStatus({ probe: has('--probe') });
    else if (operation === 'included-enforce') result = await usage.enforceIncludedUsage();
    else {
      if (!has('--stdin')) throw new Error('Pass verified Claude billing evidence as JSON on stdin.');
      const input = fs.readFileSync(0, 'utf8');
      if (Buffer.byteLength(input) > 4096) throw new Error('Claude billing evidence is too large.');
      const evidence = JSON.parse(input);
      result = await (operation === 'included-bind-claude-plan' ? usage.bindClaudeMaxPlan : usage.bindClaudeIncludedKey)(evidence);
    }
  }
  else if (['usage-queue', 'usage-retry', 'usage-cancel'].includes(operation)) {
    const queue = await import('./src/usage-queue.mjs');
    if (operation === 'usage-queue') result = { ok: true, jobs: await queue.listIncludedJobs() };
    else if (!positional[0]) throw new Error('Choose a queued job ID.');
    else if (operation === 'usage-cancel') result = { ok: true, job: await queue.cancelIncludedJob(positional[0]) };
    else result = await queue.retryIncludedJob(positional[0]);
    if (!result.ok) process.exitCode = 1;
  }
  else if (operation === 'benchmarks') result = await getBenchmarks();
  else if (operation === 'route') {
    const task = positional.join(' ');
    if (!task) throw new Error('route requires a task description');
    const options = { jev: has('--jev'), preferLocal: has('--prefer-local'), preferFrontier: has('--prefer-frontier'), node: value('--node'), cwd: value('--cwd'), allowUnknownAuth: has('--allow-unknown-auth'), ...remoteTimeout() };
    result = has('--execute') ? await executeRoutedTask(task, { ...options, gate: has('--gate'), gateOptions: { tier: value('--tier') || 'fast' } }) : await routeTask(task, options);
    if (!result.ok) process.exitCode = 1;
  }
  else if (operation === 'decompose') {
    const task = positional.join(' ');
    if (!task) throw new Error('decompose requires a task description');
    const pool = await resolvePool({ allowUnknownAuth: has('--allow-unknown-auth') });
    result = { ...decomposeTask(task, { availableHarnesses: pool.ready.map(h => h.id) }), excluded: pool.excluded };
  }
  else if (operation === 'coordinate' || operation === 'orchestrate') {
    const task = positional.join(' ');
    if (!task) throw new Error(`${operation} requires a task description`);
    result = await coordinateTask(task, {
      mode: value('--mode') || 'pipeline', execute: has('--execute'), orchestrator: value('--orchestrator'), explorer: value('--explorer'), architect: value('--architect'), implementer: value('--implementer'), verifier: value('--verifier'),
      branch: value('--branch'), subagents: !has('--no-subagents'), autoReview: has('--auto-review'), gate: has('--gate'), gateOptions: { tier: value('--tier') || 'fast' }, allowSameFamily: has('--allow-same-family'), reviewer: value('--reviewer'),
      node: value('--node') || 'local', cwd: value('--cwd'), allowUnknownAuth: has('--allow-unknown-auth'), ...remoteTimeout(),
    });
    if (!result.ok) process.exitCode = 1;
  }
  else if (operation === 'threads') {
    const sub = args[1] || 'list';
    if (sub === 'list') {
      const statusIdx = args.indexOf('--status');
      const platformIdx = args.indexOf('--platform');
      result = listThreads({
        status: statusIdx >= 0 ? args[statusIdx + 1] : undefined,
        platform: platformIdx >= 0 ? args[platformIdx + 1] : undefined
      });
    } else if (sub === 'show' || sub === 'get') {
      const id = args[2];
      if (!id) throw new Error('threads show requires a thread id');
      result = getThread(id);
      if (!result) throw new Error(`Thread not found: ${id}`);
    } else if (sub === 'create') {
      const title = value('--title') || positional.slice(1).join(' ');
      result = createThread({
        title: title || 'New Agent Thread',
        platform: value('--platform') || 'universal',
        branch: value('--branch') || null
      });
    } else if (sub === 'update') {
      const id = positional[1];
      if (!id) throw new Error('threads update requires a thread id');
      const patch = Object.fromEntries(['title', 'status', 'platform', 'branch', 'summary'].map(key => [key, value(`--${key}`)]).filter(([, entry]) => entry !== undefined));
      if (!Object.keys(patch).length) throw new Error('threads update requires at least one field');
      result = updateThread(id, patch);
    } else if (sub === 'close') {
      const id = args[2];
      if (!id) throw new Error('threads close requires a thread id');
      result = closeThread(id);
    } else if (sub === 'delete') {
      const id = args[2];
      if (!id) throw new Error('threads delete requires a thread id');
      result = { ok: deleteThread(id) };
    } else {
      throw new Error(`Unsupported threads operation: ${sub}`);
    }
  }
  else if (operation === 'review') {
    result = await executeCodeReview({ target: positional[0] || null, reviewer: value('--reviewer'), author: value('--author'), threadId: value('--thread'), staged: has('--staged'), node: value('--node') || 'local', cwd: value('--cwd'), allowUnknownAuth: has('--allow-unknown-auth'), ...remoteTimeout() });
    if (!result.ok) process.exitCode = 1;
  }
  else if (operation === 'learn') {
    result = value('--void') !== undefined
      ? await voidReceipts({ ids: String(value('--void')).split(',').map(id => id.trim()).filter(Boolean), reason: value('--reason') })
      : await learnFromHistory({ emit: has('--emit') });
    if (!result.ok) process.exitCode = 1;
  }
  else if (operation === 'alerts') {
    const sub = positional[0] || 'check';
    if (sub === 'check') {
      const { quotas } = await inspectQuotas({});
      result = await checkAlerts({ quotas, threshold: Number(value('--threshold')) || 85, dryRun: has('--dry-run') });
    } else if (sub === 'test') result = await notifyAlert({ title: 'Meta Harness: test alert', message: 'Alert delivery check.', dryRun: has('--dry-run') });
    else throw new Error(`Unsupported alerts operation: ${sub}`);
    if (!result.ok) process.exitCode = 1;
  }
  else if (operation === 'upstream') result = await inspectUpstreamFleet(getActiveAdapters());
  else if (operation === 'changelog') result = getAgentChangelog(args[1] || 'agy');
  else if (operation === 'adapter') {
    const sub = args[1] || 'list';
    if (sub === 'list') {
      result = { active: getActiveAdapters(), custom: loadCustomAdapters() };
    } else if (sub === 'add') {
      const target = args[2];
      if (!target) throw new Error('adapter add requires a JSON spec or file path');
      let spec;
      try {
        spec = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : JSON.parse(target);
      } catch {
        throw new Error('Invalid adapter JSON specification');
      }
      spec = validateCustomAdapter(spec);
      const dirs = getCustomAdaptersDirs();
      fs.mkdirSync(dirs[0], { recursive: true });
      const dest = adapterPath(dirs[0], spec.id);
      fs.writeFileSync(dest, JSON.stringify(spec, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      result = { ok: true, added: spec.id, path: dest };
    } else if (sub === 'remove') {
      const id = args[2];
      if (!id) throw new Error('adapter remove requires an adapter identifier');
      const dirs = getCustomAdaptersDirs();
      let removed = false;
      for (const d of dirs) {
        const dest = adapterPath(d, id);
        if (fs.existsSync(dest)) {
          fs.unlinkSync(dest);
          removed = true;
        }
      }
      result = { ok: removed, removed: id };
      if (!removed) process.exitCode = 1;
    } else throw new Error(`Unsupported adapter operation: ${sub}`);
  }
  else if(operation==='docs-sources')result={sources:DOC_SOURCES};
  else if(operation==='docs-read' || operation==='docs-search') {
    const option=name=>{const i=args.indexOf(name);if(i<0)return undefined;if(!args[i+1] || args[i+1].startsWith('--'))throw new Error(`${name} requires a value`);return args[i+1];};
    result=operation==='docs-read'?readDocumentation({agent:option('--agent'),url:option('--url')}):searchDocumentation({agent:option('--agent'),query:option('--query')});
  }
  else if(operation==='setup') {
    const index=args.indexOf('--node');
    if(index>=0 && (!args[index+1] || args[index+1].startsWith('-')))throw new Error('--node requires a recorded node');
    result=await setupIntegrations({node:index>=0?args[index+1]:undefined});
  }
  else if (['docs-status','docs-refresh','docs-ensure','maintenance'].includes(operation)) {
    const selected = args.indexOf('--agent');
    if (selected>=0 && (!args[selected+1] || args[selected+1].startsWith('-'))) throw new Error('--agent requires an adapter identifier');
    const options = selected>=0 ? {agent:args[selected+1]} : {};
    if(operation==='maintenance') {
      if (has('--models')) {
        const { syncModelCatalog } = await import('./src/model-catalog.mjs');
        result = await syncModelCatalog();
      } else {
        const setup=await setupIntegrations();
        const { installAll } = await import('./src/gate-adapters/index.mjs');
        const gates=await installAll();
        const docs=await maintainDocumentation(options);
        result={...docs,ok:docs.ok!==false&&gates.ok,setup,gates};
      }
    } else result = operation==='docs-status' ? documentationStatus(options) : operation==='docs-ensure' ? await ensureDocumentation(options) : await refreshDocumentation(options);
    if(!result.ok)process.exitCode=1;
  }
  else if (operation === 'runtime') {
    const runtimeArgs=args.slice(1).filter(arg=>arg!=='--json'), agent=runtimeArgs.shift();
    const index=runtimeArgs.indexOf('--node'); let node='local';
    if(index>=0){node=runtimeArgs[index+1];if(!node || node.startsWith('-'))throw new Error('--node requires an identifier');runtimeArgs.splice(index,2);}
    const command = validateRuntimeOperation(agent, runtimeArgs);
    result = node==='local' ? await manageRuntime(agent,command) : await executeOnNode(node,{operation:'direct',useHome:true,argv:['total-recall','meta-harness','runtime',agent,...command,'--json']});
    if(!result.ok)process.exitCode=1;
  }
  else if (operation === 'process') {
    const processes = await import('./src/process-manager.mjs');
    const [action = 'list', target, ...task] = positional;
    if (action === 'list') result = { ok: true, agents: processes.listAgents() };
    else if (action === 'status') {
      result = processes.listAgents().find(record => record.id === target || String(record.pid) === target);
      if (!result) throw new Error('Managed process not found');
    } else if (action === 'spawn') {
      if (!target || !task.length) throw new Error('process spawn requires a harness and task');
      result = await processes.spawnAgent(target, task.join(' '), {
        node: value('--node') || 'local', cwd: value('--cwd'), name: value('--name'),
        tools: value('--tools'), settingSources: value('--setting-sources'), model: value('--model'),
        detach: !has('--no-detach'), write: !has('--read-only'), allowUnknownAuth: has('--allow-unknown-auth'),
      });
      if (result.status === 'failed') process.exitCode = 1;
    } else if (action === 'kill') {
      if (!target) throw new Error('process kill requires a managed process id');
      result = await processes.killAgent(target);
    } else if (action === 'logs') {
      if (!target) throw new Error('process logs requires a managed process id');
      result = { ok: true, logs: await processes.getAgentLogs(target, Number(value('--tail') || 50)) };
    } else throw new Error(`Unsupported process operation: ${action}`);
  }
  else if(operation==='dispatch') {
    if(!args.includes('--stdin'))throw new Error('Task requests must arrive through stdin: pass --stdin with JSON {agent, cwd, prompt}');
    const input=fs.readFileSync(0,'utf8');if(Buffer.byteLength(input)>65536)throw new Error('Task request too large');
    const request=validateDispatchRequest(JSON.parse(input));
    result=await dispatchWithReceipt(request,{node:request.node || 'local',role:'Dispatch'});
    if(!result.ok)process.exitCode=1;
  }
  else if (operation === 'inspect') {
    const index = args.indexOf('--node');
    if (index >= 0 && (!args[index + 1] || args[index + 1].startsWith('--'))) throw new Error('--node requires a recorded node identifier');
    result = await inspectNode(index >= 0 ? args[index + 1] : 'local');
  }
  else if (operation === 'run-command') {
    if (!args.includes('--stdin')) throw new Error('Supply the command request through stdin');
    const input = fs.readFileSync(0, 'utf8'); if (Buffer.byteLength(input) > 65536) throw new Error('Command request is too large');
    const request = JSON.parse(input);
    const root = process.env.TR_PACKAGE_ROOT;
    if (!root) throw new Error('Native host context required');
    if (!path.isAbsolute(root)) throw new Error('Absolute native host context required');
    if (JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name !== 'total-recall-brain') throw new Error('Native host identity mismatch');
    const { getPlugin } = await import(pathToFileURL(path.join(root, 'src/core/plugin-loader.mjs')));
    const plugin = getPlugin(request.pluginId, request.projectRoot || process.cwd());
    result = await executeCommand({ ...request, plugin });
    if (!result.ok) process.exitCode = 1;
  } else throw new Error(`Unknown operation: ${operation}`);
  console.log(JSON.stringify(result));
}
export default run;
