import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { detectProjectBrain } from '../core/brain-locate.mjs';
import { globalBrainDirFor, isBrainEnabled } from '../core/brain-registry.mjs';
import { GATE_MODES, gateConfigPath, projectBrainDir, readGateLayers, resolveGateMode, writeGateMode } from '../core/gate-mode.mjs';
import { installHarnessHooks, loadGateAdapters } from '../core/harness-hooks.mjs';
import { ackDirectory, capsuleVerb, decide, isAckCommand, isCheckCommand, isRouteCommand, isSubagentPayload, nativeToolOf, sessionOf, SWEEP_CONSULT_MS, whenGateFails } from '../core/preflight-gate.mjs';
import { ACK_COMMAND, acknowledge, checkAgentReceipt, checkAnyReceipt, findRoot, forgetCapsuleDeliveries, lastArrivalMs, lastCapsuleDelivery, lastConsultMs, lastRoutedMs, lastRouteWarnedMs, lastSessionAck, markArrival, markDelegated, markRouted, markRouteWarned, markSessionAck, noteCaller, recordDecision, sessionHasStanding, sessionKey, readDecisions, takeCaller } from '../core/preflight-receipt.mjs';

const USAGE = `Usage: total-recall preflight <command>
  ack --task "<task>" [--action read,edit,test] [--json]   Record a receipt after context ready:true and rules verify, and print the capsule.
                                                            Prints one line instead when this session received the same rules and skills within 2 hours
  check [--json]                                            Exit 1 unless a fresh receipt covers this agent, wherever it acknowledged.
                                                            Run by hand, it reports this directory's receipt
  gate [--harness <id>]                                     Hook entry: read a call on stdin, answer allow or deny (exit 2 on deny)
  remind [--json]                                           Prompt-hook entry: advisory text when the receipt is missing; always exits 0
  session-start                                             Session-hook entry: after compaction or clear, the next ack prints the capsule; always exits 0
  install [--harness <id>|--all] [--dry-run]                Install the gate for a harness, or for every harness here. Install and update do this. No off switch.
  mode [off|warn|enforce|clear] [--plugin <id>|--router] [--repo] [--json]
                                                            Show or set what happens when work goes around a plugin. Default is warn.
                                                            The preflight receipt itself has no off switch.
  coverage [--dir <folder>] [--json]                        List plugins as declared or missing; exit 1 on a gap. Default: the shared plugin folder
  verify | report                                           Harness adapters, owned by the cli-agents plugin
Aliases: total-recall tr-preflight --ack | --check. A receipt lasts 30 minutes (config preflight_max_age_minutes).
Each session acknowledges for itself where the harness sends a session id, and that goes with it between repositories.
With no session id, each directory needs its own receipt. A repository with no skills of its own uses the machine's shared ones.`;

/** An explicit override only. The configured window is read once, by `ack`, and recorded in the receipt. */
function envMaxAgeMs() {
  const minutes = Number(process.env.TR_PREFLIGHT_MAX_AGE_MIN);
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60000 : undefined;
}

/** Slow path only: the configuration code is heavy, and the gate must not load it on every tool call. */
async function configuredMaxAgeMs() {
  const fromEnv = envMaxAgeMs();
  if (fromEnv) return fromEnv;
  try {
    const { readConfigValue } = await import('./config.mjs');
    const minutes = readConfigValue('preflight_max_age_minutes', 'global');
    return Number.isFinite(minutes) && minutes > 0 ? minutes * 60000 : undefined;
  } catch { return undefined; }
}

/** Hooks pipe their payload in; a person running the command by hand has a terminal, which would block. */
function readStdin() {
  if (process.stdin.isTTY) return '';
  return fs.readFileSync(0, 'utf8') || '';
}

function flag(args, name) {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

function printFailure(problems) {
  console.error('✖ tr-preflight FAILED — do not begin task work.');
  for (const p of problems) console.error(`  ${p}`);
  console.error('');
  console.error(`  Run: ${ACK_COMMAND}`);
  process.exitCode = 1;
}

function check(args) {
  const root = findRoot();
  // The gate names the session that is asking. Run by hand, this directory's receipt decides.
  const result = checkAgentReceipt(root, takeCaller(root, 'check'), { maxAgeMs: envMaxAgeMs() });
  if (args.includes('--json')) {
    console.log(JSON.stringify({ ok: result.ok, problems: result.problems, root, task: result.receipt?.task ?? null, ageMs: result.ageMs, fix: result.ok ? null : ACK_COMMAND }));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (!result.ok) return printFailure(result.problems);
  console.log(`✔ tr-preflight OK — skills read, context ready:true (${Math.round(result.ageMs / 60000)}m ago), rules verify clean.`);
  console.log(`  task: ${result.receipt.task || '(unspecified)'}`);
}

async function ack(args) {
  const root = findRoot();
  const task = flag(args, '--task') || '';
  const actions = flag(args, '--action') || 'read,edit,test';
  const result = acknowledge({ root, task, actions, maxAgeMs: await configuredMaxAgeMs(), session: takeCaller(root, 'ack', { task }) });
  if (args.includes('--json')) {
    console.log(JSON.stringify({ ok: result.ok, problems: result.problems, receipt: result.file || null, capsule: result.capsule ?? null, unchanged: Boolean(result.unchanged) }));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (!result.ok) return printFailure(result.problems);
  if (result.unchanged) {
    const age = result.unchanged.ageMs < 60000 ? 'less than a minute ago' : `${Math.round(result.unchanged.ageMs / 60000)} minutes ago`;
    console.log(`✔ tr-preflight recorded: rules and skills are unchanged since this session received the capsule ${age}, so there is nothing new to read. If your task is new, or you no longer have the capsule, run: total-recall context "<task>" --action ${actions}`);
    for (const note of result.notes || []) console.log(`  note: ${note}`);
    return;
  }
  if (!task) console.log('note: no --task given; receipt records an unspecified task');
  console.log(`✔ tr-preflight recorded — context ready:true, rules verify ${result.notes ? 'has notes' : 'clean'}.`);
  for (const note of result.notes || []) console.log(`  note: ${note}`);
  for (const file of result.skillFiles) console.log(`  read: ${file.startsWith(`${root}${path.sep}`) ? path.relative(root, file) : file}`);
  console.log(`  receipt: ${result.file}`);
  const router = readGateDeclarations().router;
  if (router) console.log(`  next: ${router.use}`);
  console.log('Your context capsule follows. Read all of it before any other tool call.');
  console.log(result.capsule);
}

// Adapter loading never requires a fully valid manifest: an unrelated schema error in the
// owner plugin would otherwise deny every tool call, including the edit that repairs it.

/**
 * Core's own reading of a native hook payload, used only when the adapter owner cannot load
 * (unparseable manifest, broken adapter code, plugin removed). The receipt still decides, so
 * this keeps enforcement and repair alive; it never opens anything a receipt would not.
 * Returns null for a payload it cannot read, which then fails closed.
 */
export function normalizeNativeCall(input) {
  const name = input?.tool_name ?? input?.toolName;
  if (typeof name !== 'string' || !name) return null;
  const toolInput = (input.tool_input && typeof input.tool_input === 'object') ? input.tool_input : (input.toolInput && typeof input.toolInput === 'object' ? input.toolInput : {});
  const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd();
  const filePath = toolInput.file_path ?? toolInput.notebook_path ?? toolInput.path;
  if (typeof toolInput.command === 'string') return { tool: 'shell', command: toolInput.command, cwd };
  if (typeof filePath === 'string') return { tool: /read|glob|grep/i.test(name) ? 'read' : 'write', path: filePath, cwd };
  return { tool: 'other', cwd };
}

/**
 * Hook entry. It starts at exit 2 and only an explicit allow clears it, so any
 * failure, including one nobody anticipated, denies: most harnesses let the
 * action through when a hook crashes or exits with anything but 2.
 * An adapter returns `{ stdout, exitCode }` in its harness's native form.
 * Every denial also names its reason on stderr: on exit 2 that is the channel harnesses
 * read, and a denial nobody can read is a lockout.
 */
async function gate(args) {
  process.exitCode = 2;
  const explain = (reason, fix = ACK_COMMAND) => process.stderr.write(`${reason}${String(reason).includes(fix) ? '' : ` Fix: ${fix}`}\n`);
  const deny = (rule, reason) => {
    process.stdout.write(`${JSON.stringify({ decision: 'deny', rule, reason, fix: ACK_COMMAND })}\n`);
    explain(reason);
  };
  let call;
  try {
    try { call = JSON.parse(readStdin() || '{}'); } catch (err) { return deny('gate-error', `TR-PREFLIGHT gate could not read its input: ${err.message}`); }
    if (!call || typeof call !== 'object' || Array.isArray(call)) return deny('gate-error', 'TR-PREFLIGHT gate input must be a JSON object.');
    const harness = flag(args, '--harness');
    if (harness) {
      const identity = { session: sessionOf(call), subagent: isSubagentPayload(call), nativeTool: nativeToolOf(call) };
      const { adapters, failures } = await loadGateAdapters(typeof call.cwd === 'string' ? call.cwd : process.cwd());
      const adapter = adapters?.get?.(harness);
      if (!adapter) {
        const native = adapters ? null : normalizeNativeCall(call);
        const cause = adapters
          ? `No gate adapter for harness "${harness}": adapters are owned by the meta-harness plugin and it does not provide one.`
          : `No gate adapter for harness "${harness}": the meta-harness plugin could not load (${failures.join('; ')}).`;
        if (!native) return deny('gate-error', `${cause} The gate fails closed.`);
        const answer = evaluate(native, { harness, ...identity });
        if (answer.decision === 'allow') {
          if (answer.warning) process.stderr.write(`${answer.warning}\n`);
          process.exitCode = 0;
          return;
        }
        return explain(`${answer.reason} ${cause}`, answer.fix || ACK_COMMAND);
      }
      let last = null;
      const out = await adapter.run({ stdin: call, decideWith: (c) => (last = evaluate(c, { harness, ...identity, readablePaths: adapter.readablePaths })) });
      if (out?.stdout) process.stdout.write(out.stdout);
      process.exitCode = Number.isInteger(out?.exitCode) ? out.exitCode : 2;
      if (process.exitCode !== 0) explain(last?.reason || `TR-PREFLIGHT gate: the ${harness} adapter denied this call.`, last?.fix || ACK_COMMAND);
      return;
    }
    const answer = evaluate(call, { harness: 'generic', session: sessionOf(call), subagent: isSubagentPayload(call), nativeTool: nativeToolOf(call) });
    process.stdout.write(`${JSON.stringify(answer)}\n`);
    if (answer.decision === 'allow') process.exitCode = 0;
    else explain(answer.reason, answer.fix || ACK_COMMAND);
  } catch (err) {
    // An adapter failed outside the decision, so its reading of the call is gone. Core reads it instead.
    const answer = whenGateFails(normalizeNativeCall(call) ?? call, err);
    if (answer.decision !== 'allow') return deny(answer.rule, answer.reason);
    process.stderr.write(`${answer.warning}\n`);
    process.exitCode = 0;
  }
}

async function install(args) {
  const harness = flag(args, '--harness') || 'claude';
  const dryRun = args.includes('--dry-run');
  if (args.includes('--remove') || args.includes('--off')) {
    console.error('✖ The preflight gate has no off switch. If it blocks work, fix the cause: `total-recall tr-preflight --ack` names it, and `total-recall rules` stays open to repair it.');
    process.exitCode = 1;
    return;
  }
  if (args.includes('--all')) {
    const result = await installHarnessHooks({ dryRun, log: (line) => console.log(line) });
    if (args.includes('--json')) console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  const { adapters } = await loadGateAdapters();
  if (!adapters) {
    console.error('✖ Gate adapters are owned by the meta-harness (cli-agents) plugin and are not available.');
    process.exitCode = 1;
    return;
  }
  try {
    const res = adapters.install(harness, { dryRun });
    if (res.unsupported) process.exitCode = 1;
    if (args.includes('--json')) {
      console.log(JSON.stringify({ ok: !res.unsupported, harness, action: res.unsupported ? 'unsupported' : (dryRun ? 'would-install' : 'installed'), ...res }));
    } else if (res.unsupported) {
      console.error(`✖ No preflight gate for ${harness}: ${res.unsupported}`);
      if (res.removed?.length) console.log(`  removed: ${res.removed.join(', ')}`);
    } else {
      console.log(`✔ ${dryRun ? 'Would install' : 'Installed'} preflight gate for ${harness}`);
      if (res.added?.length) console.log(`  added: ${res.added.join(', ')}`);
      if (res.removed?.length) console.log(`  removed: ${res.removed.join(', ')}`);
      console.log(`  settings: ${res.settings}`);
      if (res.note) console.log(`  ${res.note}`);
    }
  } catch (err) {
    console.error(`✖ Failed to install preflight gate for ${harness}: ${err.message}`);
    process.exitCode = 1;
  }
}

async function verify(args) {
  const harness = flag(args, '--harness') || 'claude';
  const { adapters } = await loadGateAdapters();
  if (!adapters) {
    console.error('✖ Gate adapters are owned by the meta-harness (cli-agents) plugin and are not available.');
    process.exitCode = 1;
    return;
  }
  try {
    const res = adapters.verify(harness);
    const ok = Boolean(res.installed && res.exercised);
    if (args.includes('--json')) {
      console.log(JSON.stringify({ ok, harness, ...res }));
    } else {
      if (ok) {
        console.log(`✔ Preflight gate for ${harness} is verified (${res.level || 'enforced'})`);
      } else {
        console.error(`✖ Preflight gate for ${harness} verification failed`);
        if (!res.installed) console.error('  hook is not installed in harness configuration');
        if (!res.exercised) console.error('  synthetic deny exercise failed');
      }
    }
    if (!ok) process.exitCode = 1;
  } catch (err) {
    console.error(`✖ Failed to verify preflight gate for ${harness}: ${err.message}`);
    process.exitCode = 1;
  }
}

async function report(args) {
  const { adapters } = await loadGateAdapters();
  if (!adapters) {
    console.error('✖ Gate adapters are owned by the meta-harness (cli-agents) plugin and are not available.');
    process.exitCode = 1;
    return;
  }
  const all = adapters.list();
  const results = all.map(a => ({
    id: a.id,
    level: a.level,
    verification: adapters.verify(a.id)
  }));

  const decisions = readDecisions();
  // A real tool the adapter did not recognize counts as work, so a read or subagent can be gated by mistake.
  const unrecognized = {};
  for (const d of decisions) {
    if (d.tool === 'other' && d.native_tool) (unrecognized[d.harness] ??= {})[d.native_tool] = ((unrecognized[d.harness] ??= {})[d.native_tool] || 0) + 1;
  }
  const summary = {
    unrecognized,
    total: decisions.length,
    allowed: decisions.filter(d => d.decision === 'allow').length,
    denied: decisions.filter(d => d.decision === 'deny').length,
    byHarness: {},
    byRepo: {}
  };
  for (const d of decisions) {
    const h = d.harness || 'generic';
    summary.byHarness[h] ??= { total: 0, allowed: 0, denied: 0 };
    summary.byHarness[h].total++;
    if (d.decision === 'allow') summary.byHarness[h].allowed++;
    else summary.byHarness[h].denied++;

    const r = d.repo || 'unknown';
    summary.byRepo[r] ??= { total: 0, allowed: 0, denied: 0 };
    summary.byRepo[r].total++;
    if (d.decision === 'allow') summary.byRepo[r].allowed++;
    else summary.byRepo[r].denied++;
  }

  if (args.includes('--json')) {
    console.log(JSON.stringify({ adapters: results, compliance: summary }, null, 2));
  } else {
    for (const r of results) {
      console.log(`- ${r.id}: ${r.level} (installed: ${r.verification.installed}, exercised: ${r.verification.exercised})`);
    }
    if (summary.total > 0) {
      console.log(`\nCompliance summary (${summary.total} real gate decisions observed):`);
      const pct = ((summary.allowed / summary.total) * 100).toFixed(1);
      console.log(`  Allowed: ${summary.allowed} | Denied: ${summary.denied} | Rate: ${pct}%`);
      console.log('  By harness:');
      for (const [hId, stats] of Object.entries(summary.byHarness)) {
        const hPct = ((stats.allowed / stats.total) * 100).toFixed(1);
        console.log(`    ${hId.padEnd(14)}: ${stats.allowed}/${stats.total} allowed (${hPct}%)`);
      }
      const gaps = Object.entries(summary.unrecognized);
      if (gaps.length) {
        console.log('  Tools an adapter did not recognize, which count as work:');
        for (const [hId, tools] of gaps) console.log(`    ${hId.padEnd(14)}: ${Object.entries(tools).map(([name, count]) => `${name} (${count})`).join(', ')}`);
      }
    } else {
      console.log('\nCompliance summary:');
      console.log('  No gate decisions recorded yet (live gate traffic has not been observed).');
    }
  }
}

/**
 * What installed plugins declare to the gate. Reads manifests directly because this runs
 * on every tool call. A plugin that cannot be read declares nothing: it must not lock out
 * the edit that repairs it.
 */
export function readGateDeclarations(pluginsDir = path.join(globalBrainDirFor(), 'plugins')) {
  const declared = { owned: [], router: null };
  let names;
  try { names = fs.readdirSync(pluginsDir); } catch { return declared; }
  for (const name of names) {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(pluginsDir, name, 'plugin.json'), 'utf8'));
      const plugin = manifest.id || name;
      for (const row of manifest.gate?.owned_commands || []) {
        if (row?.pattern && row?.use) declared.owned.push({ plugin, pattern: row.pattern, use: row.use });
      }
      const router = manifest.gate?.router;
      if (router?.pattern && router?.use && !declared.router) declared.router = { plugin, ...router };
    } catch { /* unreadable manifest: declares nothing */ }
  }
  return declared;
}

/**
 * Whether the plugin a denial would point at can run. Only a call about to be denied pays for this,
 * and it is not cached, so a repaired plugin counts on the next call. Core answers `--help` for most
 * plugins without running them, so that proves nothing unless the plugin answers for itself. The
 * other proof is its declared status command. With neither, it cannot be shown to work, so the call
 * is not blocked.
 */
function ownerRuns(plugin, use, cwd, pluginsDir = path.join(globalBrainDirFor(), 'plugins')) {
  const namespace = /\btotal-recall\s+([\w-]+)/.exec(use || '')?.[1];
  if (!namespace) return false;
  let manifest = null;
  try {
    for (const name of fs.readdirSync(pluginsDir)) {
      let candidate;
      try { candidate = JSON.parse(fs.readFileSync(path.join(pluginsDir, name, 'plugin.json'), 'utf8')); } catch { continue; }
      if ((candidate.id || name) === plugin) { manifest = candidate; break; }
    }
  } catch { return false; }
  const probe = manifest?.cli?.answers_help === true ? '--help' : manifest?.status?.command;
  if (!probe) return false;
  const result = spawnSync(process.execPath, [process.argv[1], namespace, probe], { cwd, stdio: 'ignore', timeout: 2500 });
  return result.status === 0;
}

/** The repository this call works in. An agent can edit another repository without changing folder. */
function rootOfWork(call, root) {
  const from = call.cwd || process.cwd();
  if (typeof call.path === 'string' && call.path) return findRoot(path.dirname(path.resolve(from, call.path)));
  return call.tool === 'shell' ? findRoot(ackDirectory(call.command, from)) : root;
}

/**
 * The root of the project brain a folder uses, which may be a parent's, or null when only the shared
 * brain applies. The shared brain is in every capsule already, so it is never news.
 */
function projectBrainRoot(dir) {
  const brain = detectProjectBrain(dir);
  return brain && isBrainEnabled(brain.brainDir) ? brain.projectRoot : null;
}

/** The gate's answer to a call. Nothing here may throw, because an answer is all that keeps its repair reachable. */
function evaluate(call, options = {}) {
  try {
    return judge(call, options);
  } catch (err) {
    const answer = whenGateFails(call, err);
    try {
      recordDecision({ harness: options.harness || 'generic', session: options.session ? sessionKey(options.session) : null, tool: call?.tool || 'other', native_tool: options.nativeTool ?? null, decision: answer.decision, rule: answer.rule, reason: answer.reason || err.message });
    } catch { /* bookkeeping never decides anything */ }
    return answer;
  }
}

function judge(call, { harness, readablePaths, session = null, subagent = false, nativeTool = null } = {}) {
  const root = findRoot(call.cwd || process.cwd());
  const limit = envMaxAgeMs();
  const declared = readGateDeclarations();
  const runByRouter = Boolean(process.env.TR_META_HARNESS_RUN);
  // Delegated work answers to whoever started it, and nothing here can say who that was.
  const delegated = runByRouter || subagent;
  const own = session ? lastSessionAck(session) : null;
  const ownAck = own?.at || 0;
  const check = () => (delegated ? checkAnyReceipt(root, { maxAgeMs: limit }) : checkAgentReceipt(root, session, { maxAgeMs: limit }));
  const working = own && !delegated ? rootOfWork(call, root) : null;
  let arrivedAt = null;
  // What this session's route is measured from. Another agent's acknowledgement must not void it.
  const ackedAt = (receipt) => ownAck || Date.parse(receipt?.at || 0);
  let layers;
  const decision = decide(call, {
    readablePaths,
    ownedCommands: () => declared.owned,
    router: () => declared.router,
    routed: (receipt) => lastRoutedMs(root, { session }) >= ackedAt(receipt),
    routeWarned: (receipt) => lastRouteWarnedMs(root, { session }) >= ackedAt(receipt),
    sessionAcknowledged: (result) => runByRouter || subagent || sessionHasStanding(root, session, { limitMs: limit ?? result.limitMs }),
    // Asked only once standing has failed, so an acknowledgement on record means it has expired.
    sessionLapsed: () => Boolean(ownAck),
    arrival: () => {
      if (!working || working === own.root) return null;
      const brain = projectBrainRoot(working);
      if (!brain || brain === projectBrainRoot(own.root) || lastCapsuleDelivery(brain, session) || lastArrivalMs(brain, session)) return null;
      arrivedAt = brain;
      return `Total Recall note: this session is now working under the brain at ${brain}, which has its own rules and skills, and it has not received them. They come from \`cd ${brain} && total-recall context "<task>" --action read,edit,test\`.`;
    },
    mode: (kind, plugin) => {
      layers ??= readGateLayers({ globalBrainDir: globalBrainDirFor(), root });
      return resolveGateMode(layers, kind, plugin);
    },
    ownerHealthy: (plugin, use) => ownerRuns(plugin, use, root),
    // A subagent or a run the router started reports to whoever routed the work.
    dispatched: runByRouter || subagent || Boolean(session && !ownAck),
    check,
    recentConsult: () => {
      const now = Date.now();
      if (now - lastConsultMs(root) < SWEEP_CONSULT_MS) return true;
      const receipt = check().receipt;
      return Boolean(receipt && now - Date.parse(receipt.at) < SWEEP_CONSULT_MS);
    },
  });
  // The decision is made. Nothing after this line may change it, so keep all bookkeeping in this block.
  try {
    if (decision.decision === 'allow' && call.tool === 'shell') {
      if (session && isAckCommand(call.command)) markSessionAck(findRoot(ackDirectory(call.command, call.cwd || process.cwd())), session);
      // A subagent shares its parent's session id and has not seen the parent's capsule.
      const verb = session && !subagent ? (isCheckCommand(call.command) ? 'check' : capsuleVerb(call.command)) : null;
      if (verb) noteCaller(findRoot(ackDirectory(call.command, call.cwd || process.cwd())), session, verb, call.command);
      if (isRouteCommand(call.command, declared.router)) markRouted(root, { session });
    }
    if (decision.warned?.includes('route')) markRouteWarned(root, { session });
    if (arrivedAt && decision.warned?.includes('arrival')) markArrival(arrivedAt, session);
    if (decision.decision === 'allow' && call.tool === 'agent' && !subagent && (!session || ownAck)) markDelegated(root);
    recordDecision({
      harness: harness || call.harness || 'generic',
      session: session ? sessionKey(session) : null,
      cwd: call.cwd || process.cwd(),
      repo: root,
      tool: call.tool || 'other',
      native_tool: nativeTool,
      command: call.command || null,
      path: call.path || null,
      decision: decision.decision,
      rule: decision.rule,
      reason: decision.reason || null
    });
  } catch { /* bookkeeping never decides anything */ }
  return decision;
}

/**
 * Prompt-hook entry (ENFORCE-R1): never blocks the human. Every path exits 0,
 * including an internal error, because a prompt hook that can fail locks the
 * user out of their own session.
 */
function remind(args) {
  try {
    let call = {};
    try { call = JSON.parse(readStdin() || '{}'); } catch { /* the payload is optional here */ }
    const root = findRoot(call.cwd || process.cwd());
    const session = sessionOf(call);
    const result = checkAgentReceipt(root, session, { maxAgeMs: envMaxAgeMs() });
    const standing = !result.ok || isSubagentPayload(call) || sessionHasStanding(root, session, { limitMs: result.limitMs });
    if (result.ok && !standing) {
      result.ok = false;
      result.problems = [lastSessionAck(session)
        ? `this session's acknowledgement lapsed after ${Math.round(result.limitMs / 60000)} minutes, and a newer receipt from another agent does not renew it`
        : 'this session has not acknowledged, and a receipt from another agent does not count'];
    }
    const text = result.ok ? null : `TR-PREFLIGHT FAILED for ${root}: ${result.problems[0]}. Every tool call except the preflight, context and recall commands will be denied until it passes. Run this on its own, with nothing piped, chained or redirected, and read everything it prints: ${ACK_COMMAND}`;
    if (args.includes('--json')) console.log(JSON.stringify({ reminder: text }));
    else if (text) console.log(text);
  } catch { /* advisory only */ }
  process.exitCode = 0;
}

/**
 * Session-hook entry. A session that was compacted or cleared no longer has any capsule it was
 * handed, in any repository, so its next ack prints one. Exits 0 on every path: this hook only ever costs tokens.
 */
function sessionStart() {
  try {
    const call = JSON.parse(readStdin() || '{}');
    const session = sessionOf(call);
    if (session && ['compact', 'clear'].includes(call.source)) forgetCapsuleDeliveries(session);
  } catch { /* the 2-hour ceiling still applies */ }
  process.exitCode = 0;
}

const AGENT_DOC_HEADING = '## Using this from an agent';

/** Which plugins say what work belongs to them, what raw commands they own, and document it. */
function coverage(args) {
  const dir = path.resolve(flag(args, '--dir') || path.join(globalBrainDirFor(), 'plugins'));
  let names = [];
  try { names = fs.readdirSync(dir); } catch { /* reported below as nothing found */ }
  const rows = [];
  for (const name of names.sort()) {
    const folder = path.join(dir, name);
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(path.join(folder, 'plugin.json'), 'utf8')); } catch { continue; }
    let readme = '';
    try { readme = fs.readFileSync(path.join(folder, 'README.md'), 'utf8'); } catch { /* counted as missing */ }
    const tasks = Array.isArray(manifest.gate?.tasks) ? manifest.gate.tasks.filter((task) => typeof task === 'string' && task.trim()) : [];
    const owned = manifest.gate?.owned_commands;
    const missing = [];
    if (!tasks.length) missing.push('tasks');
    if (!Array.isArray(owned)) missing.push('owned commands');
    if (!readme.includes(AGENT_DOC_HEADING)) missing.push('docs');
    rows.push({ plugin: manifest.id || name, tasks: tasks.length, owned: Array.isArray(owned) ? owned.length : 0, router: Boolean(manifest.gate?.router), missing });
  }
  const gaps = rows.filter((row) => row.missing.length);
  if (!rows.length || gaps.length) process.exitCode = 1;
  if (args.includes('--json')) return console.log(JSON.stringify({ ok: rows.length > 0 && !gaps.length, dir, declared: rows.length - gaps.length, missing: gaps.length, plugins: rows }, null, 2));
  if (!rows.length) return console.error(`No plugins found in ${dir}.`);
  for (const row of rows) {
    const detail = row.missing.length ? `missing ${row.missing.join(', ')}` : `${row.tasks} tasks, ${row.owned ? `${row.owned} raw commands` : 'no raw commands'}${row.router ? ', router' : ''}`;
    console.log(`${row.missing.length ? '✖' : '✔'} ${row.plugin}: ${detail}`);
  }
  console.log(`${rows.length - gaps.length} of ${rows.length} plugins declared.`);
}

/** Shows the gate's modes and what each harness can do with a warning, or changes one mode. */
async function mode(args) {
  const root = findRoot();
  const value = args.find((arg) => !arg.startsWith('--') && arg !== flag(args, '--plugin'));
  const declared = readGateDeclarations();
  const plugins = [...new Set(declared.owned.map((row) => row.plugin))];
  const fail = (message) => { console.error(message); process.exitCode = 1; };
  const repo = args.includes('--repo');
  const brain = repo ? projectBrainDir(root) : globalBrainDirFor();
  if (value !== undefined) {
    if (value !== 'clear' && !GATE_MODES.includes(value)) return fail(`Unknown mode "${value}". Choose ${GATE_MODES.join(', ')} or clear.`);
    const plugin = flag(args, '--plugin');
    const router = args.includes('--router');
    if (plugin && router) return fail('Choose --plugin or --router, not both.');
    if (plugin && !plugins.includes(plugin)) return fail(`No plugin here declares raw commands under "${plugin}". Declared: ${plugins.join(', ') || 'none'}.`);
    if (router && !declared.router) return fail('No plugin here declares a router.');
    if (repo && !fs.existsSync(brain)) return fail(`${root} has no project brain to hold this setting. Run total-recall init there, or leave off --repo.`);
    writeGateMode(brain, { mode: value === 'clear' ? null : value, plugin, router });
  }
  const layers = readGateLayers({ globalBrainDir: globalBrainDirFor(), root });
  const { adapters } = await loadGateAdapters(root);
  const report = {
    settings: { machine: gateConfigPath(globalBrainDirFor()), repo: gateConfigPath(projectBrainDir(root)) },
    router: declared.router ? { plugin: declared.router.plugin, mode: resolveGateMode(layers, 'router') } : null,
    plugins: plugins.map((plugin) => ({ plugin, mode: resolveGateMode(layers, 'owned', plugin) })),
    harnesses: adapters ? adapters.list().map((adapter) => ({ harness: adapter.id, ...(adapter.warnings || { delivery: 'none', via: null }) })) : null,
  };
  if (args.includes('--json')) return console.log(JSON.stringify(report, null, 2));
  console.log('Gate modes. The preflight receipt is always required and has no mode.');
  console.log(`  machine settings: ${report.settings.machine}`);
  console.log(`  repo settings:    ${report.settings.repo}`);
  if (report.router) console.log(`  routing (${report.router.plugin}): ${report.router.mode}`);
  for (const row of report.plugins) console.log(`  ${row.plugin}: ${row.mode}`);
  console.log('Whether a warning can reach the agent:');
  if (!report.harnesses) return console.log('  unknown: the harness adapters could not load.');
  for (const row of report.harnesses) console.log(`  ${row.harness}: ${row.delivery}${row.via ? ` (${row.via})` : ''}`);
}

export default async function preflight(args = []) {
  const [first = '--help'] = args;
  if (first === '--help' || first === '-h' || first === 'help') return console.log(USAGE);
  // Original `tr-preflight` forms.
  if (first === '--ack' || first === 'ack') return ack(args);
  if (first === '--check' || first === 'check') return check(args);
  // Help never performs the subcommand: `install --help` once rewrote the harness settings (C-019).
  if (args.includes('--help') || args.includes('-h')) return console.log(USAGE);
  if (first === 'gate') return gate(args.slice(1));
  if (first === 'remind') return remind(args);
  if (first === 'session-start') return sessionStart();
  if (first === 'install') return install(args.slice(1));
  if (first === 'mode') return mode(args.slice(1));
  if (first === 'coverage') return coverage(args.slice(1));
  if (first === 'verify') return verify(args.slice(1));
  if (first === 'report') return report(args.slice(1));
  console.error(`Unknown preflight command: ${first}\n\n${USAGE}`);
  process.exitCode = 1;
}
