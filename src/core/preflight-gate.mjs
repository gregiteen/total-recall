/**
 * Harness-neutral gate decision. Every harness adapter normalises its native
 * hook payload into `{ tool, command, path, cwd }` and asks `decide`; the answer
 * is the same in every harness.
 *
 * Rules, in order:
 *   1. Tools that only display or discover (`meta`, `ui`) are always open.
 *   2. Reads of skill files are open: reading them is how the preflight is earned.
 *   3. A single plain Total Recall preflight, context, compact, recall, rules or help command is
 *      open, so the gate can always be satisfied or repaired. Chaining, piping,
 *      substitution and redirects are not plain, so the exemption cannot carry
 *      other work and a capsule cannot be truncated through a pipe. Text the shell
 *      keeps literal may hold anything, because task descriptions are written in prose.
 *   4. Everything else needs a fresh receipt, and when the harness sends a session id, this
 *      session must have acknowledged. Another agent's receipt does not count. An agent is not
 *      bound to one repository: its acknowledgement goes with it, and it is told once about each
 *      other project brain it starts working under, including one a folder borrows from a parent.
 *      With no session id there is no agent to follow, so the directory needs its own receipt. Subagents and runs Metaharness started are
 *      delegated, so they never stop to acknowledge.
 *   5. With a receipt, a repository-wide source sweep still needs a recent
 *      Total Recall consult (the rule DSH enforced alone until now).
 *   6. With a receipt, a raw shell command that an installed plugin declares it owns
 *      draws the plugin's command. Plugins declare these in their manifest
 *      (`gate.owned_commands`), so core names no plugin here. Text in quotes or a
 *      heredoc is not a command being run, so a remote command passed to
 *      `total-recall mesh exec` or a commit message never matches.
 *   7. With a receipt, working tools draw the routing command until the task has been
 *      routed since that receipt, when an installed plugin declares a router
 *      (`gate.router`). Reading, searching and native subagents stay open, as does any
 *      plain Total Recall command, so routing can always run. A process the router
 *      started has already been routed. It warns once per receipt, not on every call.
 * Rules 6 and 7 follow a mode (see gate-mode.mjs): `off`, `warn` (the default) or `enforce`.
 * `enforce` blocks only while the owner passes its health check, so a broken plugin can
 * never trap an agent. Warnings are statements of fact, because harnesses treat
 * command-style text from a hook as a possible prompt injection.
 * Any error inside the gate denies work, because most harnesses fail open when a hook crashes.
 * What repairs the gate stays open (see whenGateFails), so a bad edit to this code can never deny
 * the edit that fixes it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_GATE_MODE } from './gate-mode.mjs';
import { ACK_COMMAND } from './preflight-receipt.mjs';

export const TOOL_CLASSES = ['shell', 'read', 'write', 'search', 'web', 'mcp', 'agent', 'meta', 'ui', 'other'];
export const SWEEP_CONSULT_MS = 15 * 60 * 1000;
/** Where a failure in this gate gets fixed: its own package. */
export const GATE_PACKAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const SKILL_PATH = /\/\.(agent|claude)\/skills\//;
const SATISFYING = /^(cd[ \t]+[^\s;&|`<>$()]+[ \t]*&&\s*)?(npx[ \t]+)?(total-recall|node[ \t]+[^\s;&|`<>$()]*bin\/total-recall\.mjs)[ \t]+(tr-preflight|preflight|context|compact|recall|rules|help|--help)([ \t]+[^;&|`<>$()\n]*)?$/;
const LIVE_IN_DOUBLE_QUOTES = /\$\(|\$\{(?!\w+\})|`/;

/**
 * The command with text the shell keeps literal blanked, read the way a POSIX shell reads it.
 * Single-quoted text is always literal. Double-quoted text is literal unless it holds a
 * substitution the shell would still run, which stays visible so a check can refuse it. An
 * escaped quote opens nothing. An unterminated quote returns the command unchanged, so a
 * check fails closed. This is a scanner because a regex misreads `\"` and would let
 * `\" ; rm -rf x ; "` hide a command.
 */
function blankLiterals(command) {
  const text = String(command || '');
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\\') {
      out += text.slice(i, i + 2);
      i += 1;
    } else if (ch === "'") {
      const end = text.indexOf("'", i + 1);
      if (end === -1) return text;
      out += "''";
      i = end;
    } else if (ch === '"') {
      let end = i + 1;
      while (end < text.length && text[end] !== '"') end += text[end] === '\\' ? 2 : 1;
      if (end >= text.length) return text;
      const live = LIVE_IN_DOUBLE_QUOTES.test(text.slice(i + 1, end).replace(/\\[\s\S]/g, ''));
      out += live ? text.slice(i, end + 1) : "''";
      i = end;
    } else {
      out += ch;
    }
  }
  return out;
}

/** True when the whole command is one plain Total Recall invocation that satisfies or repairs the gate. */
export function isSatisfyingCommand(command) {
  return SATISFYING.test(blankLiterals(String(command || '').trim()));
}

const PLAIN_TR = /^(cd\s+\S+\s*&&\s*)?(npx\s+)?(total-recall|node\s+\S*bin\/total-recall\.mjs)\s/;

/** One Total Recall command with nothing chained after it. Quoted arguments may hold anything. */
export function isPlainTotalRecall(command) {
  const text = String(command || '').trim();
  return PLAIN_TR.test(text) && !/[;&|`\n<>]|\$\(/.test(runnableText(text).replace(PLAIN_TR, ''));
}

/** True when the command routes work through the declared router. */
export function isRouteCommand(command, router) {
  if (!router?.pattern || !isPlainTotalRecall(command)) return false;
  try { return new RegExp(`\\s(?:${router.pattern})(\\s|$)`).test(runnableText(command)); } catch { return false; }
}

/** The harness's session id from a raw hook payload, or null when it sends none. */
export function sessionOf(payload) {
  for (const key of ['session_id', 'sessionId', 'conversation_id', 'conversationId']) {
    const value = payload?.[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

/** The tool's own name in the harness, so a tool an adapter does not recognize can be found. */
export function nativeToolOf(payload) {
  for (const value of [payload?.tool_name, payload?.toolName, payload?.toolCall?.name, payload?.tool]) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

/** True when the harness marks this hook call as coming from a subagent. */
export function isSubagentPayload(payload) {
  return [payload?.agent_id, payload?.agentId].some((value) => typeof value === 'string' && value.trim());
}

/** True when the command is one plain acknowledgement, whatever its quoted task says. */
export function isAckCommand(command) {
  return isSatisfyingCommand(command)
    && /total-recall(?:\.mjs)?[ \t]+(?:tr-preflight|preflight)[ \t]+(?:--ack|ack)(?:[ \t]|$)/.test(blankLiterals(String(command || '').trim()));
}

/** The command that hands an agent the capsule, when it runs alone so all of its output arrives. */
export function capsuleVerb(command) {
  if (!isSatisfyingCommand(command)) return null;
  if (isAckCommand(command)) return 'ack';
  return /total-recall(?:\.mjs)?[ \t]+context(?:[ \t]|$)/.test(blankLiterals(String(command || '').trim())) ? 'context' : null;
}

/** True when the command asks whether this agent may work, which it cannot answer unless the gate names the agent. */
export function isCheckCommand(command) {
  return isSatisfyingCommand(command)
    && /total-recall(?:\.mjs)?[ \t]+(?:tr-preflight|preflight)[ \t]+(?:--check|check)(?:[ \t]|$)/.test(blankLiterals(String(command || '').trim()));
}

/** The folder an acknowledgement applies to, when it starts by changing into one. */
export function ackDirectory(command, cwd) {
  const target = /^\s*cd\s+("[^"]*"|'[^']*'|\S+)\s*&&/.exec(String(command || ''))?.[1];
  return target ? path.resolve(cwd || process.cwd(), target.replace(/^(["'])([\s\S]*)\1$/, '$2')) : cwd;
}

/** A repository-wide search used to answer a question, as the DSH `tr-first.sh` rule defined it. */
export function isRepoSweep(command) {
  const c = String(command || '');
  if (c.includes('total-recall')) return false;
  const sweep = /(^|[\s;&|(])(rg|ripgrep|ag)\s/.test(c)
    || /(^|[\s;&|(])grep\s+(-[A-Za-z]*[rR][A-Za-z]*|--recursive)(\s|$)/.test(c)
    || /(^|[\s;&|(])find\s+(\.|\/Users)/.test(c)
    || /(^|[\s;&|(])git\s+grep(\s|$)/.test(c);
  if (!sweep) return false;
  if (/\|\s*(grep|rg|ag)(\s|$)/.test(c)) return false; // filtering command output is not a source question
  if (/node_modules|\.agent\/skills|\/tmp\/|\.git\//.test(c)) return false;
  return true;
}

/** The command as the shell would run it: quoted text and heredoc bodies removed. */
function runnableText(command) {
  return String(command || '')
    .replace(/<<-?\s*['"]?(\w+)['"]?[\s\S]*?\n\s*\1(?=\n|$)/g, ' ')
    .replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, "''");
}

/**
 * The first declared owner of this command, or null. A pattern matches at the start of
 * a command: the start of the line, after a separator, or after a shell keyword. A
 * declaration whose pattern does not compile is skipped, so one plugin's bad manifest
 * cannot deny every call on the machine.
 * @param {string} command
 * @param {{ plugin: string, pattern: string, use: string }[]} owned
 */
export function findOwnedCommand(command, owned = []) {
  const text = runnableText(command);
  for (const row of owned) {
    let re;
    try { re = new RegExp(`(^|\\n|[;&|(]\\s*|\\b(?:do|then|else)\\s+)\\s*(?:${row.pattern})`); } catch { continue; }
    if (re.test(text)) return row;
  }
  return null;
}

const allow = (rule) => ({ decision: 'allow', rule });
const deny = (rule, reason, fix = ACK_COMMAND) => ({ decision: 'deny', rule, reason, fix });

const GATE_VERB = /(?:^|[\s;&|(])(?:npx[ \t]+)?(?:total-recall|\S*bin\/total-recall\.mjs)[ \t]+(tr-preflight|preflight|context|compact|recall|rules|help)\b/;
const CD_PREFIX = /^cd[ \t]+[^\s;&|`<>$()]+[ \t]*&&\s*/;
const SHELL_CONSTRUCT = /\|\||&&|[;&|`\n<>()]|\$\(|\$\{|\$/;
const minutes = (ms) => Math.round(ms / 60000);

/** What a preflight command carried that cost it the exemption, or null when the call is not one. */
function whyNotExempt(call) {
  if (call?.tool !== 'shell') return null;
  const text = blankLiterals(String(call.command || '').trim());
  const verb = GATE_VERB.exec(text)?.[1];
  const construct = verb ? SHELL_CONSTRUCT.exec(text.replace(CD_PREFIX, ''))?.[0] : null;
  return construct ? { verb, construct } : null;
}

/**
 * What a denied agent needs. The reason has to carry the command: adapters send the reason and
 * use the fix only when there is none, and a harness that reads a JSON decision ignores stderr.
 */
function nextStep(call) {
  const refused = whyNotExempt(call);
  let why = '';
  if (refused) {
    const named = refused.construct === '\n' ? 'a line break' : `\`${refused.construct}\``;
    const live = ['$(', '${', '`'].includes(refused.construct);
    why = `This \`${refused.verb}\` command was refused because it contains ${named}. `
      + (live ? 'The shell would run that even inside double quotes. Single quotes keep it literal. '
        : 'Preflight commands are exempt only when each runs alone. Text in quotes may hold anything. ');
  }
  return `${why}Run this on its own, with nothing piped, chained or redirected, and read everything it prints: ${ACK_COMMAND}`;
}

/** Why a receipt is stale, in numbers, so an expected expiry does not read as a fault. */
const staleness = (receipt) => (receipt.ageMs > receipt.limitMs
  ? ` It is ${minutes(receipt.ageMs)} minutes old and a receipt lasts ${minutes(receipt.limitMs)}.` : '');

/**
 * What a rule that steers work toward a plugin does with a call it matched: nothing (null),
 * a denial, or a warning to carry.
 */
function steer(deps, { kind, plugin, name, reason, note, use }) {
  const mode = deps.mode ? deps.mode(kind, plugin) : DEFAULT_GATE_MODE;
  if (mode === 'off') return null;
  if (mode !== 'enforce') return { name, warning: note };
  if (!deps.ownerHealthy || deps.ownerHealthy(plugin, use)) return deny(name, reason, use);
  return { name, warning: `${note} The ${plugin} plugin failed its health check, so this call was not blocked.` };
}

/**
 * The gate itself failed, so it has no verdict. Work stays denied, because most harnesses fail open
 * on a crash and this is all that holds the line. What can repair the gate stays open, or a bad edit
 * to this code would deny the edit that fixes it: displaying, reading and searching, any plain
 * Total Recall command, and changes inside this gate's own package.
 */
/** A command that starts by changing into the gate's package: `cd <package> && ...`. */
function cdIntoPackage(command, inPackage) {
  const match = typeof command === 'string' && command.match(/^\s*cd\s+("([^"]+)"|'([^']+)'|(\S+))\s*(&&|;|$)/);
  if (!match) return false;
  const target = (match[2] || match[3] || match[4]).replace(/^~(?=$|\/)/, os.homedir());
  return inPackage(target);
}

/**
 * The gate's own package with its dependency tree deleted (what `npm ci` leaves while it runs, or a
 * failed install). Every total-recall command fails then, so a stale receipt cannot be renewed;
 * this is a gate failure, and the repair must stay open. Cheap: one stat per call.
 */
export function gatePackageBroken(root = GATE_PACKAGE) {
  if (!fs.existsSync(path.join(root, 'package-lock.json'))) return null;
  if (fs.existsSync(path.join(root, 'node_modules', '.package-lock.json'))) return null;
  return `the Total Recall package at ${root} has no installed dependencies; run 'npm install' there`;
}

export function whenGateFails(call, err) {
  const from = typeof call?.cwd === 'string' ? call.cwd : process.cwd();
  const inPackage = (target) => {
    const full = path.resolve(from, target);
    return full === GATE_PACKAGE || full.startsWith(`${GATE_PACKAGE}${path.sep}`);
  };
  const open = ['meta', 'ui', 'read', 'search'].includes(call?.tool)
    || (call?.tool === 'write' && typeof call.path === 'string' && inPackage(call.path))
    || (call?.tool === 'shell' && (isPlainTotalRecall(call.command) || inPackage(from) || cdIntoPackage(call.command, inPackage)));
  if (open) {
    return { decision: 'allow', rule: 'gate-error:repair', warned: ['gate-error'],
      warning: `Total Recall note: the preflight gate failed (${err.message}), so it made no decision. This call is open because it can repair the gate, which lives in ${GATE_PACKAGE}. Other work stays denied until that is fixed.` };
  }
  return deny('gate-error', `TR-PREFLIGHT gate error: ${err.message}. The gate fails closed. Reading, plain Total Recall commands and changes inside ${GATE_PACKAGE} stay open so it can be repaired.`,
    `repair the gate in ${GATE_PACKAGE}`);
}

/**
 * @param {{ tool: string, command?: string, path?: string, cwd?: string }} call
 * @param {{ check: () => { ok: boolean, problems: string[], ageMs?: number|null, limitMs?: number }, recentConsult?: () => boolean, readablePaths?: RegExp[], ownedCommands?: () => { plugin: string, pattern: string, use: string }[], router?: () => ({ plugin: string, pattern: string, use: string } | null), routed?: (receipt: object) => boolean, routeWarned?: (receipt: object) => boolean, sessionAcknowledged?: (receipt: object) => boolean, sessionLapsed?: () => boolean, arrival?: () => (string | null), dispatched?: boolean, mode?: (kind: 'router'|'owned', plugin: string) => string, ownerHealthy?: (plugin: string, use: string) => boolean }} deps
 */
export function decide(call, deps) {
  try {
    const tool = TOOL_CLASSES.includes(call?.tool) ? call.tool : 'other';
    if (tool === 'meta' || tool === 'ui') return allow(`class:${tool}`);
    if (tool === 'read') {
      const target = String(call.path || '');
      if (SKILL_PATH.test(target)) return allow('read:skill-file');
      // Persisted output of an allowed command is readable; each adapter names its host's paths (audit F-019).
      if ((deps.readablePaths || []).some((re) => re.test(target))) return allow('read:persisted-output');
    }
    if (tool === 'shell' && isSatisfyingCommand(call.command)) return allow('shell:satisfying-command');

    const receipt = deps.check();
    if (!receipt.ok) {
      return deny('receipt', `TR-PREFLIGHT gate: ${receipt.problems[0] || 'check failed'} (directory: ${call.cwd || 'unknown'}).${staleness(receipt)} `
        + `No work may start until it passes. ${nextStep(call)}`);
    }
    if (tool !== 'agent' && deps.sessionAcknowledged && !deps.sessionAcknowledged(receipt)) {
      const lapsed = deps.sessionLapsed ? deps.sessionLapsed() : false;
      const state = lapsed
        ? `this session's acknowledgement lapsed${receipt.limitMs ? ` after ${minutes(receipt.limitMs)} minutes` : ''} (directory: ${call.cwd || 'unknown'}). A newer receipt from another agent does not renew it.`
        : `this session has not acknowledged (directory: ${call.cwd || 'unknown'}). A receipt from another agent does not count.`;
      return deny('receipt:session', `TR-PREFLIGHT gate: ${state} ${nextStep(call)}`);
    }
    if (tool === 'shell' && isRepoSweep(call.command) && !(deps.recentConsult ? deps.recentConsult() : false)) {
      return deny('sweep', 'TR-PREFLIGHT gate: do not sweep the repository for an answer; Total Recall owns it. Run `total-recall help "<task>"` to find the owning command, or `total-recall recall "<topic>" --local`, then repeat this call.',
        'total-recall help "<task>"');
    }
    const notes = [];
    const arrival = deps.arrival ? deps.arrival() : null;
    if (arrival) notes.push({ name: 'arrival', warning: arrival });
    const router = deps.router ? deps.router() : null;
    if (router && !deps.dispatched) {
      const open = ['read', 'search', 'web', 'agent'].includes(tool) || (tool === 'shell' && isPlainTotalRecall(call.command));
      if (!open && !(deps.routed ? deps.routed(receipt.receipt) : false)) {
        const result = steer(deps, {
          kind: 'router',
          plugin: router.plugin,
          name: 'route',
          reason: `TR-PREFLIGHT gate: every task goes through ${router.plugin}. Run \`${router.use}\` for this task first.`,
          note: `Total Recall note: this task has not been routed through ${router.plugin}. The routing command is \`${router.use}\`.`,
          use: router.use,
        });
        if (result?.decision === 'deny') return result;
        if (result && !(deps.routeWarned ? deps.routeWarned(receipt.receipt) : false)) notes.push(result);
      }
    }
    if (tool === 'shell') {
      const owner = findOwnedCommand(call.command, deps.ownedCommands ? deps.ownedCommands() : []);
      if (owner) {
        const result = steer(deps, {
          kind: 'owned',
          plugin: owner.plugin,
          name: `owned:${owner.plugin}`,
          reason: `TR-PREFLIGHT gate: the ${owner.plugin} plugin owns this. Run \`${owner.use}\` instead of the raw command.`,
          note: `Total Recall note: the ${owner.plugin} plugin owns this command. Its equivalent is \`${owner.use}\`.`,
          use: owner.use,
        });
        if (result?.decision === 'deny') return result;
        if (result) notes.push(result);
      }
    }
    if (!notes.length) return allow('receipt:fresh');
    const warned = notes.map((note) => note.name);
    return { decision: 'allow', rule: `warn:${warned.join(',')}`, warned, warning: notes.map((note) => note.warning).join(' ') };
  } catch (err) {
    return whenGateFails(call, err);
  }
}
