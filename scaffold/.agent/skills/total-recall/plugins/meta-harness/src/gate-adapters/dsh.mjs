/**
 * DeepSeek Harness (DSH) PreToolUse hook adapter.
 * Migrates legacy tr-first.sh / tr-wrapper.sh into managed preflight gate.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { gateCommandWithPath, hasGate, mergeGate, readJsonFile, readJsonQuietly, writeJsonFile } from './hook-files.mjs';

const ACK_COMMAND = 'total-recall tr-preflight --ack --task "<task>" --action read,edit,test';

/**
 * DSH homes in use by processes running now. A development build of the desktop app sets its own.
 * The flags have no dash: on macOS a dashed -e means all processes and hides the environment.
 */
function runningHomes() {
  try {
    const out = execFileSync('ps', ['axeww', '-o', 'command='], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 });
    return [...new Set([...out.matchAll(/\bDSH_HOME=(\/[^\s]+)/g)].map((match) => match[1]))];
  } catch { return []; }
}

/**
 * Every DSH home to cover. DSH's default is ~/.dsh. A home set in the environment or in use by a
 * running process is also covered, and remembered so it stays covered when it is not running.
 * Only the real home folder looks at running processes, so an install into a temporary one
 * cannot touch them. Removal never looks: every home it covered is remembered, and a sandboxed
 * HOME passes the check above, so a test could otherwise strip a real home's gate.
 */
function dshHomes(home, env, { scanProcesses = true } = {}) {
  const record = path.join(home, '.dsh', 'hooks', 'other-homes.json');
  const remembered = readJsonQuietly(record);
  const others = new Set(Array.isArray(remembered) ? remembered : []);
  if (env.DSH_HOME) others.add(path.resolve(env.DSH_HOME));
  // The process list can hold any text, so a running process only counts if it names a real home.
  if (scanProcesses && home === os.homedir()) for (const dir of runningHomes()) if (fs.existsSync(path.join(dir, 'profiles'))) others.add(dir);
  others.delete(path.join(home, '.dsh'));
  const present = [...others].filter((dir) => fs.existsSync(dir));
  return { record, others: present, all: [path.join(home, '.dsh'), ...present] };
}

/**
 * The hook bridge's entry file. A profile cannot always resolve the package by name: a
 * development build carries it only as a dev dependency, and the failure is a warning that
 * leaves no gate. So the mount names the file. The desktop app keeps its runtime beside its
 * home, and the command-line install carries the package inside its own folder.
 */
function findBridge(dshHome, env) {
  const roots = [path.join(path.dirname(dshHome), 'project', 'node_modules')];
  for (const dir of String(env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    try {
      const packageRoot = path.dirname(path.dirname(fs.realpathSync(path.join(dir, 'dsh'))));
      roots.push(path.join(packageRoot, 'node_modules'));
      break;
    } catch { /* not in this folder */ }
  }
  for (const root of roots) {
    const entry = path.join(root, '@deepseek-ai', 'dsh-hooks-claude-code', 'lib', 'index.js');
    if (fs.existsSync(entry)) return fs.realpathSync(entry);
  }
  return null;
}

const MOUNT = /(?:^|\n)# Runs the Total Recall gate in every profile\.\n- insert:\n    - id: hooks-claude-code\n      name: '[^'\n]*'\n      config:\n        configPath: [^\n]*\n/;

/**
 * DSH runs hooks only through a bridge plugin that something mounts. The home patch applies to
 * every profile and nothing regenerates it, unlike a profile's own patch, which can be generated.
 */
function mountBridge(dshHome, hooksPath, entry, dryRun) {
  const file = path.join(dshHome, 'cordis.patch.yml');
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const row = `# Runs the Total Recall gate in every profile.\n- insert:\n    - id: hooks-claude-code\n      name: '${entry}'\n      config:\n        configPath: ${hooksPath}\n`;
  if (text.includes(row)) return [];
  const rest = text.replace(MOUNT, '').replace(/\n*$/, '');
  if (!dryRun) {
    fs.mkdirSync(dshHome, { recursive: true });
    fs.writeFileSync(file, rest ? `${rest}\n\n${row}` : row);
  }
  return [`hook bridge in ${file}`];
}

/** A mount an earlier release put in a profile's patch would mount the bridge twice. */
function removeProfileMount(dshHome, dryRun) {
  const removed = [];
  const root = path.join(dshHome, 'profiles');
  let names = [];
  try { names = fs.readdirSync(root); } catch { return removed; }
  const row = /\n*# Runs the Total Recall gate in this profile\.\n- insert:\n    - id: hooks-claude-code\n      name: '@deepseek-ai\/dsh-hooks-claude-code'\n      config:\n        configPath: [^\n]*\n/;
  for (const name of names) {
    const file = path.join(root, name, 'cordis.patch.yml');
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (!row.test(text)) continue;
    if (!dryRun) fs.writeFileSync(file, text.replace(row, '\n'));
    removed.push(`bridge mount in the ${name} profile`);
  }
  return removed;
}

/**
 * DSH's PreToolUse hook can only block, but PostToolUse can attach context. A warning raised
 * before a tool is held here under the call's id and handed over after it runs.
 */
/**
 * DSH's tool names, as it offers them to the model. A tool missing here counts as a working
 * tool, so a read would need a receipt, including the read that earns the receipt.
 */
const TOOL_CLASSES = {
  bash: 'shell', Bash: 'shell', shell: 'shell',
  read: 'read', Read: 'read', read_image: 'read', glob: 'read', Glob: 'read', grep: 'read', Grep: 'read',
  edit: 'write', Edit: 'write', write: 'write', Write: 'write',
  web_fetch: 'web', web_search: 'web',
  subagent: 'agent', subagent_fork: 'agent', send_message: 'agent', list_agents: 'agent', interrupt_agent: 'agent', workflow: 'agent',
  ask_user_question: 'meta', create_goal: 'meta', get_goal: 'meta', update_goal: 'meta', todo_write: 'meta', exit_plan_mode: 'meta',
  skill: 'meta', working_directory: 'meta', job_list: 'meta', job_output: 'meta',
};

const notePath = (id) => path.join(os.tmpdir(), `tr-preflight-${os.userInfo().uid}`, 'dsh-notes', String(id).replace(/[^\w-]/g, '_'));

// DSH runs hooks in its sandbox, which refuses writes to the home folder. A note that cannot be
// held is lost, and that must never affect the tool call.
function holdNote(id, text) {
  if (!id) return;
  try {
    const file = notePath(id);
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, text, { mode: 0o600 });
  } catch { /* the warning is lost, the call still runs */ }
}

function takeNote(id) {
  if (!id) return null;
  const file = notePath(id);
  try {
    const text = fs.readFileSync(file, 'utf8');
    fs.rmSync(file);
    return text;
  } catch { return null; }
}

export const dshAdapter = {
  id: 'dsh',
  level: 'enforced',
  warnings: {
    delivery: 'documented',
    via: 'additionalContext on PostToolUse, after the tool runs',
    source: 'deepseek-harness/packages/experimental/hooks-claude-code/README.md',
    afterTool: true,
  },
  source: {
    note: 'DeepSeek Harness hook configuration in ~/.dsh/hooks/hooks.json',
    retrieved: '2026-11-04'
  },
  limits: [
    'Claude-compatible PreToolUse contract: exit code 2 blocks execution',
    'Repository sweep checks enforce Total Recall consult requirement'
  ],

  parse(input = {}) {
    const event = input.hook_event_name || input.event || 'PreToolUse';
    const toolName = input.tool_name || input.toolName || '';
    const toolInput = input.tool_input || input.toolInput || {};
    const cwd = input.cwd || process.cwd();

    const tool = TOOL_CLASSES[toolName] || 'other';
    let command;
    let filePath;

    if (tool === 'shell') command = toolInput.command || toolInput.cmd || '';
    else if (tool === 'write' || tool === 'read') filePath = toolInput.file_path || toolInput.path || '';

    return {
      event,
      tool,
      command,
      path: filePath,
      cwd,
      raw: input
    };
  },

  emit(decision, event, cwd = process.cwd()) {
    if (decision?.decision === 'allow') {
      return { stdout: '', exitCode: 0 };
    }

    const reason = decision?.reason || `TR-PREFLIGHT gate: action denied. Run: ${decision?.fix || ACK_COMMAND}`;
    const payload = {
      decision: 'deny',
      permissionDecision: 'deny',
      reason,
      fix: decision?.fix || ACK_COMMAND
    };
    return { stdout: `${JSON.stringify(payload)}\n`, exitCode: 2 };
  },

  async run({ stdin, decideWith }) {
    const parsed = this.parse(stdin);
    if (parsed.event === 'PostToolUse') {
      const note = takeNote(stdin?.tool_use_id);
      if (!note) return { stdout: '', exitCode: 0 };
      const payload = { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: note } };
      return { stdout: `${JSON.stringify(payload)}\n`, exitCode: 0 };
    }
    const decision = decideWith({
      tool: parsed.tool,
      command: parsed.command,
      path: parsed.path,
      cwd: parsed.cwd
    });
    if (decision?.decision === 'allow' && decision.warning) holdNote(stdin?.tool_use_id, decision.warning);
    return this.emit(decision, parsed.event, parsed.cwd);
  },

  install({ home = os.homedir(), env = process.env, dryRun = false, remove = false, off = false } = {}) {
    const homes = dshHomes(home, env, { scanProcesses: !(remove || off) });
    const added = [];
    const removed = [];
    const command = gateCommandWithPath('dsh', env);
    let settings = null;
    const unmounted = [];
    for (const dshHome of homes.all) {
      const hooksPath = path.join(dshHome, 'hooks', 'hooks.json');
      settings = settings || hooksPath;
      const config = readJsonFile(hooksPath, { hooks: {} });
      config.hooks = config.hooks || {};
      const options = { remove: remove || off, command };
      const before = mergeGate(config.hooks.PreToolUse, 'dsh', options);
      const after = mergeGate(config.hooks.PostToolUse, 'dsh', options);
      config.hooks.PreToolUse = before.groups;
      config.hooks.PostToolUse = after.groups;
      if (!dryRun && (before.added.length || before.removed.length || after.added.length || after.removed.length)) writeJsonFile(hooksPath, config);
      added.push(...before.added, ...after.added.map(() => 'managed PostToolUse note delivery'));
      removed.push(...before.removed, ...after.removed);
      removed.push(...removeProfileMount(dshHome, dryRun));
      if (remove || off) {
        const patch = path.join(dshHome, 'cordis.patch.yml');
        if (fs.existsSync(patch) && MOUNT.test(fs.readFileSync(patch, 'utf8'))) {
          if (!dryRun) fs.writeFileSync(patch, fs.readFileSync(patch, 'utf8').replace(MOUNT, ''));
          removed.push(`hook bridge in ${patch}`);
        }
        continue;
      }
      const entry = findBridge(dshHome, env);
      if (entry) added.push(...mountBridge(dshHome, hooksPath, entry, dryRun));
      else unmounted.push(dshHome);
    }
    if (!dryRun && homes.others.length) writeJsonFile(homes.record, homes.others);
    return {
      settings,
      added,
      removed,
      ...(unmounted.length ? { unsupported: `The DSH hook bridge package was not found for ${unmounted.join(', ')}, so the gate will not run there.` } : {})
    };
  },

  verify({ home = os.homedir(), env = process.env } = {}) {
    const installed = dshHomes(home, env).all.every((dshHome) => {
      const hooks = readJsonQuietly(path.join(dshHome, 'hooks', 'hooks.json')).hooks;
      const patch = path.join(dshHome, 'cordis.patch.yml');
      return hasGate(hooks?.PreToolUse, 'dsh') && hasGate(hooks?.PostToolUse, 'dsh')
        && fs.existsSync(patch) && MOUNT.test(fs.readFileSync(patch, 'utf8'));
    });
    const out = this.emit({ decision: 'deny', reason: 'receipt missing', fix: ACK_COMMAND }, 'PreToolUse', '/nonexistent-directory-without-receipt');
    return {
      installed,
      exercised: out.exitCode === 2 && out.stdout.includes('"decision":"deny"'),
      level: this.level,
      native: out.stdout.trim()
    };
  }

};

export default dshAdapter;
