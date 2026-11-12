import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { configDir } from './src/paths.mjs';
import { inspectAgents, getActiveAdapters, getCustomAdaptersDirs, loadCustomAdapters, validateCustomAdapter, adapterPath } from './src/worker.mjs';
import { inspectNode, listTargets, executeCommand, executeOnNode } from './src/executor.mjs';
import { DOC_SOURCES, documentationStatus, refreshDocumentation, ensureDocumentation, readDocumentation, searchDocumentation } from './src/documentation.mjs';
import { manageRuntime, validateRuntimeOperation } from './src/runtime.mjs';
import { validateDispatchRequest } from './src/dispatch-request.mjs';
import { setupIntegrations } from './src/setup.mjs';
import { maintainIntegrations } from './src/maintenance.mjs';
import { inspectUpstreamFleet, getAgentChangelog } from './src/tracker.mjs';
import { inspectQuotas, getBenchmarks, routeTask } from './src/router.mjs';
import { coordinateTask } from './src/coordinator.mjs';
import { executeRoutedTask } from './src/cascade.mjs';
import { dispatchWithReceipt } from './src/dispatch.mjs';
import { resolvePool } from './src/pool.mjs';
import { checkAlerts, notifyAlert } from './src/alerts.mjs';
import { learnFromHistory, voidReceipts } from './src/learner.mjs';
import { decomposeTask } from './capability/index.mjs';
import { listThreads, getThread, createThread, updateThread, closeThread, deleteThread, cleanupFixtureThreads } from './src/threads.mjs';
import { readReviews } from './src/reviews.mjs';
import { executeCodeReview } from './src/review.mjs';
import { stopOnTermination, finishCancellation } from './src/termination.mjs';
import { cancellationResult } from './src/worker.mjs';
import { startJob, newJobId, cancelJob, resolveJob } from './src/jobs.mjs';
import { appendCommand, waitingRequests } from './src/control.mjs';
import { sessionOptions } from './src/session/run.mjs';
import { continueJob } from './src/session-jobs.mjs';

import { chatTarget, setChatDefault } from './src/chat.mjs';

const VALUE_FLAGS = ['--result-schema-json', '--goal', '--max-turns', '--max-budget-usd', '--max-tokens', '--result-schema', '--at', '--node', '--mode', '--orchestrator', '--branch', '--reviewer', '--thread', '--status', '--platform', '--agent', '--url', '--query', '--tier', '--threshold', '--author', '--explorer', '--architect', '--implementer', '--verifier', '--title', '--summary', '--cwd', '--tools', '--setting-sources', '--model', '--name', '--tail', '--timeout-ms', '--void', '--reason', '--approvals', '--question-timeout-ms', '--brains'];
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

export async function run(argv = [], { backgroundJobId } = {}) {
  // MCP owns stdin/stdout for its whole lifetime. The CLI result wrapper must stay out of that stream.
  if (argv[3] === 'mcp' && !argv.includes('--help') && !argv.includes('-h')) {
    try { await runOperation(argv); }
    catch (error) { console.error(`Metaharness MCP: ${error.message}`); process.exitCode = 1; }
    return;
  }
  stopOnTermination();
  let job, result;
  const previousJob = process.env.TR_METAHARNESS_JOB;
  try {
    const args = argv.slice(3), operation = args[0];
    if (!args.includes('--help') && !args.includes('-h') && !args.includes('--background') &&
        (['dispatch', 'fork', 'resume'].includes(operation) || (['route', 'coordinate', 'orchestrate'].includes(operation) && args.includes('--execute')))) {
      job = startJob(operation, backgroundJobId ? { id: backgroundJobId } : {});
      process.env.TR_METAHARNESS_JOB = job.job;
    }
    result = await runOperation(argv);
  }
  catch (error) {
    const message = String(error?.message || error);
    result = { ok: false, error: message };
    if (!argv.includes('--json')) console.error(`meta-harness: ${message}`);
    process.exitCode = 1;
  }
  result = finishCancellation(result);
  if (result !== undefined) {
    if (job) {
      if (result.execution?.remote && result.job) result.execution = { ...result.execution, remoteJob: result.job };
      result = { ...result, job: job.job };
    }
    job?.finish(result);
    if (!backgroundJobId) console.log(JSON.stringify(result));
  }
  if (previousJob === undefined) delete process.env.TR_METAHARNESS_JOB;
  else process.env.TR_METAHARNESS_JOB = previousJob;
}

/** The host stops a plugin command after 10 minutes, so long runs detach and report through their thread and log. */
async function detachRun(argv) {
  const directory = path.join(configDir(), 'jobs');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const id = newJobId();
  const log = path.join(directory, `${id}.log`);
  const output = fs.openSync(log, 'a', 0o600);
  const entry = new URL('./cli.mjs', import.meta.url).href;
  const input = argv[3] === 'dispatch' ? fs.readFileSync(0, 'utf8') : null;
  const child = spawn(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(entry)}).then(m=>m.run(${JSON.stringify(argv.filter(arg => arg !== '--background'))}, {backgroundJobId:${JSON.stringify(id)}}))`], { cwd: process.cwd(), detached: true, stdio: [input === null ? 'ignore' : 'pipe', output, output], env: process.env });
  if (input !== null) { child.stdin.on('error', () => {}); child.stdin.end(input); }
  try {
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    const deadline = Date.now() + 10_000;
    while (!fs.statSync(log).size) {
      if (child.exitCode !== null || Date.now() > deadline) {
        child.kill('SIGTERM');
        throw new Error(`The background job did not record its PID. Log: ${log}`);
      }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    child.unref();
  } finally { fs.closeSync(output); }
  return { ok: true, background: true, job: id, pid: child.pid, log, follow: `The final JSON result is written to ${log}; a pipeline also records a thread.` };
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
  if (has('--background') && (['dispatch', 'fork', 'resume'].includes(operation) || (['route', 'coordinate', 'orchestrate'].includes(operation) && has('--execute')))) return detachRun(argv);
  const controls = () => sessionOptions({ cwd: value('--cwd') || process.cwd(),
    ...(value('--result-schema-json') !== undefined ? { resultSchema: JSON.parse(value('--result-schema-json')) } : {}),
    ...Object.fromEntries([['goal', '--goal'], ['maxTurns', '--max-turns'], ['maxBudgetUsd', '--max-budget-usd'], ['maxTokens', '--max-tokens'],
      ['resultSchema', '--result-schema'], ['approvalPolicy', '--approvals'], ['questionTimeoutMs', '--question-timeout-ms']]
      .filter(([, flag]) => value(flag) !== undefined).map(([key, flag]) => [key, ['maxTurns', 'maxBudgetUsd', 'maxTokens', 'questionTimeoutMs'].includes(key) ? Number(value(flag)) : value(flag)])) });
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
    const options = { ...controls(), jev: has('--jev'), preferLocal: has('--prefer-local'), preferFrontier: has('--prefer-frontier'), node: value('--node'), cwd: value('--cwd'), allowUnknownAuth: has('--allow-unknown-auth'), ...remoteTimeout() };
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
      ...controls(), mode: value('--mode') || 'pipeline', execute: has('--execute'), orchestrator: value('--orchestrator'), explorer: value('--explorer'), architect: value('--architect'), implementer: value('--implementer'), verifier: value('--verifier'),
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
    } else if (sub === 'cleanup-fixtures') {
      result = cleanupFixtureThreads({ dryRun: has('--dry-run') });
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
  else if (operation === 'reviews') result = { ok: true, reviews: readReviews() };
  else if (operation === 'review') {
    result = await executeCodeReview({ target: positional[0] || null, reviewer: value('--reviewer'), author: value('--author'), threadId: value('--thread'), staged: has('--staged'), node: value('--node') || 'local', cwd: value('--cwd'), allowUnknownAuth: has('--allow-unknown-auth'), ...remoteTimeout() });
    if (!result.ok) process.exitCode = 1;
  }
  else if (operation === 'learn') {
    if (has('--emit')) throw new Error('learn --emit was removed. Routing reads run receipts directly.');
    result = value('--void') !== undefined
      ? await voidReceipts({ ids: String(value('--void')).split(',').map(id => id.trim()).filter(Boolean), reason: value('--reason') })
      : await learnFromHistory();
    if (!result.ok) process.exitCode = 1;
  }
  else if (operation === 'alerts') {
    const sub = positional[0] || 'check';
    if (sub === 'check') {
      const { quotas } = await inspectQuotas({});
      result = await checkAlerts({ quotas, threshold: Number(value('--threshold')) || 85, dryRun: has('--dry-run') });
    } else if (sub === 'test') result = await notifyAlert({ title: 'Metaharness: test alert', message: 'Alert delivery check.', dryRun: has('--dry-run') });
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
        result=await maintainIntegrations(options);
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
  else if (operation === 'fork' || operation === 'resume') {
    if (positional.length !== (operation === 'fork' ? 1 : 2)) throw new Error(`${operation} requires a job${operation === 'resume' ? ' and quoted text' : ''}.`);
    result = await continueJob(positional[0], operation === 'fork' ? 'Continue from this session.' : positional[1], { fork: operation === 'fork', atTurn: value('--at') });
    if (!result.ok) process.exitCode = 1;
  }
  else if (operation === 'cancel') {
    result = await cancelJob(positional[0]);
  }
  else if (['reply', 'approve', 'interrupt', 'goal'].includes(operation)) {
    if (!positional[0]) throw new Error(`${operation} requires a job ID.`);
    if (positional.length !== (operation === 'approve' ? 3 : operation === 'interrupt' ? 1 : 2)) {
      throw new Error(`${operation}: supply a job${operation === 'approve' ? ', request ID, and allow or deny' : operation === 'interrupt' ? '' : ' and quoted text'}.`);
    }
    result = await appendCommand(positional[0], { type: operation,
      ...(operation === 'approve' ? { requestId: positional[1], value: positional[2] } : operation === 'interrupt' ? {} : { text: positional[1] }) },
    { local: has('--local-delivery') });
  }
  else if (operation === 'mcp') {
    const { runMcpServer, QUESTION_TIMEOUT_MS } = await import('./src/mcp-server.mjs');
    await runMcpServer({ approvalPolicy: value('--approvals') || 'auto',
      questionTimeoutMs: value('--question-timeout-ms') === undefined ? QUESTION_TIMEOUT_MS : Number(value('--question-timeout-ms')) });
    return;
  }
  else if (operation === 'watch') {
    // A-107: a dispatched agent's live status and latest events, by log path or job prefix.
    const target = positional[0];
    const jobs = path.join(configDir(), 'jobs');
    let file = target && target.endsWith('.events.jsonl') ? path.resolve(target) : null;
    if (target && !file) {
      try {
        const job = resolveJob(target);
        const canonical = path.join(jobs, `${job.id}.events.jsonl`);
        if (fs.existsSync(canonical)) file = canonical;
      } catch (error) {
        if (!error.message.startsWith('No job log matches')) throw error;
      }
    }
    if (!file) {
      const names = fs.existsSync(jobs) ? fs.readdirSync(jobs).filter(name => name.endsWith('.events.jsonl') && (!target || name.startsWith(target))) : [];
      const newest = names.map(name => ({ name, at: fs.statSync(path.join(jobs, name)).mtimeMs })).sort((a, b) => b.at - a.at)[0];
      if (!newest) throw new Error(target ? `No job log matches ${target}` : 'No dispatched job has a live log yet');
      file = path.join(jobs, newest.name);
    }
    const { readProgress } = await import('./src/worker.mjs');
    result = { ok: true, file, ...readProgress(file, Number(value('--tail') || 20)), waiting: waitingRequests(file) };
  }
  else if(operation==='dispatch') {
    if(!args.includes('--stdin'))throw new Error('Task requests must arrive through stdin: pass --stdin with JSON {agent, cwd, prompt}');
    const input=fs.readFileSync(0,'utf8');if(Buffer.byteLength(input)>65536)throw new Error('Task request too large');
    const request=validateDispatchRequest({...JSON.parse(input),...controls()});
    // A-107: a local dispatch streams its agent's events to a live log, announced before it starts.
    const progressFile=(request.node||'local')==='local'?path.join(configDir(),'jobs',`${process.env.TR_METAHARNESS_JOB || `dispatch-${Date.now().toString(36)}-${request.agent}`}.events.jsonl`):undefined;
    if(progressFile)console.error(JSON.stringify({progress:progressFile,agent:request.agent}));
    result=await dispatchWithReceipt(progressFile?{...request,progressFile}:request,{node:request.node || 'local',role:'Dispatch',manageWrites:true});
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
  if (cancellationResult()) process.exitCode = cancellationResult().exitCode;
  return result;
}
export default run;
