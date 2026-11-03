import fs from 'node:fs';
import { decide, SWEEP_CONSULT_MS } from '../core/preflight-gate.mjs';
import { ACK_COMMAND, acknowledge, checkReceipt, findRoot, lastConsultMs } from '../core/preflight-receipt.mjs';

const USAGE = `Usage: total-recall preflight <command>
  ack --task "<task>" [--action read,edit,test] [--json]   Record a receipt after context ready:true and rules verify
  check [--json]                                            Exit 1 unless a fresh receipt exists for this directory
  gate [--harness <id>]                                     Hook entry: read a call on stdin, answer allow or deny (exit 2 on deny)
  remind [--json]                                           Prompt-hook entry: advisory text when the receipt is missing; always exits 0
  install | verify | report                                 Harness adapters, owned by the cli-agents plugin
Aliases: total-recall tr-preflight --ack | --check. A receipt lasts 30 minutes (config preflight_max_age_minutes).`;

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
  const result = checkReceipt(root, { maxAgeMs: envMaxAgeMs() });
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
  const result = acknowledge({ root, task, actions: flag(args, '--action') || 'read,edit,test', maxAgeMs: await configuredMaxAgeMs() });
  if (args.includes('--json')) {
    console.log(JSON.stringify({ ok: result.ok, problems: result.problems, receipt: result.file || null }));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (!result.ok) return printFailure(result.problems);
  if (!task) console.log('note: no --task given; receipt records an unspecified task');
  console.log('✔ tr-preflight recorded — context ready:true, rules verify clean.');
  console.log('  read: .agent/skills/total-recall/SKILL.md');
  console.log('  read: .agent/skills/ssss/SKILL.md');
  console.log(`  receipt: ${result.file}`);
}

/**
 * Hook entry. It starts at exit 2 and only an explicit allow clears it, so any
 * failure, including one nobody anticipated, denies: most harnesses let the
 * action through when a hook crashes or exits with anything but 2.
 * An adapter returns `{ stdout, exitCode }` in its harness's native form.
 */
async function gate(args) {
  process.exitCode = 2;
  const deny = (rule, reason) => process.stdout.write(`${JSON.stringify({ decision: 'deny', rule, reason, fix: ACK_COMMAND })}\n`);
  try {
    let call;
    try { call = JSON.parse(readStdin() || '{}'); } catch (err) { return deny('gate-error', `TR-PREFLIGHT gate could not read its input: ${err.message}`); }
    if (!call || typeof call !== 'object' || Array.isArray(call)) return deny('gate-error', 'TR-PREFLIGHT gate input must be a JSON object.');
    const harness = flag(args, '--harness');
    if (harness) {
      let adapters;
      try { adapters = await (await import('../core/plugin-runtime.mjs')).loadPluginModule('meta-harness', 'gate-adapters'); } catch { adapters = null; }
      if (!adapters) {
        try { adapters = await (await import('../core/plugin-runtime.mjs')).loadPluginModule('cli-agents', 'gate-adapters'); } catch { adapters = null; }
      }
      const adapter = adapters?.get?.(harness);
      if (!adapter) return deny('gate-error', `No gate adapter for harness "${harness}": adapters are owned by the meta-harness plugin and it does not provide one. The gate fails closed.`);
      const out = await adapter.run({ stdin: call, decideWith: evaluate });
      if (out?.stdout) process.stdout.write(out.stdout);
      process.exitCode = Number.isInteger(out?.exitCode) ? out.exitCode : 2;
      return;
    }
    const answer = evaluate(call);
    process.stdout.write(`${JSON.stringify(answer)}\n`);
    if (answer.decision === 'allow') process.exitCode = 0;
  } catch (err) {
    deny('gate-error', `TR-PREFLIGHT gate error: ${err.message}. The gate fails closed.`);
  }
}

function evaluate(call) {
  const root = findRoot(call.cwd || process.cwd());
  const limit = envMaxAgeMs();
  return decide(call, {
    check: () => checkReceipt(root, { maxAgeMs: limit }),
    recentConsult: () => {
      const now = Date.now();
      if (now - lastConsultMs(root) < SWEEP_CONSULT_MS) return true;
      const receipt = checkReceipt(root, { maxAgeMs: limit }).receipt;
      return Boolean(receipt && now - Date.parse(receipt.at) < SWEEP_CONSULT_MS);
    },
  });
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
    const result = checkReceipt(root, { maxAgeMs: envMaxAgeMs() });
    const text = result.ok ? null : `TR-PREFLIGHT FAILED for ${root}: ${result.problems[0]}. Every tool call except the preflight, context and recall commands will be denied until it passes. First read the full context capsule (never truncate it), then run: ${ACK_COMMAND}`;
    if (args.includes('--json')) console.log(JSON.stringify({ reminder: text }));
    else if (text) console.log(text);
  } catch { /* advisory only */ }
  process.exitCode = 0;
}

export default async function preflight(args = []) {
  const [first = '--help'] = args;
  if (first === '--help' || first === '-h' || first === 'help') return console.log(USAGE);
  // Original `tr-preflight` forms.
  if (first === '--ack' || first === 'ack') return ack(args);
  if (first === '--check' || first === 'check') return check(args);
  if (first === 'gate') return gate(args.slice(1));
  if (first === 'remind') return remind(args);
  if (['install', 'verify', 'report'].includes(first)) {
    console.error(`preflight ${first}: harness adapters are owned by the meta-harness (cli-agents) plugin and are not installed yet (ENFORCE-01 EN-03 onward).`);
    process.exitCode = 1;
    return;
  }
  console.error(`Unknown preflight command: ${first}\n\n${USAGE}`);
  process.exitCode = 1;
}
