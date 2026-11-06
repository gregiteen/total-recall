/**
 * OpenClaw hook adapter. OpenClaw runs hooks only from plugin code, so this adapter installs the
 * small plugin in ./openclaw-plugin/, which asks `preflight gate --harness openclaw` about each call.
 * Official docs: https://docs.openclaw.ai/plugins/hooks/tool-policy
 * and https://docs.openclaw.ai/plugins/building-plugins
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { removeDeadGateFile } from './hook-files.mjs';

const ACK_COMMAND = 'total-recall tr-preflight --ack --task "<task>" --action read,edit,test';

const PLUGIN_ID = 'total-recall-gate';
const PLUGIN_SOURCE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'openclaw-plugin');
const PLUGIN_FILES = ['package.json', 'openclaw.plugin.json', 'index.js', 'gate-client.js'];
/** The first version whose hook, session and middleware contract this was tested against. */
const MIN_VERSION = [2026, 11, 1];

const DEAD_FILE = (home) => path.join(home, '.openclaw', 'hooks.json');

/**
 * Every tool in the catalog of OpenClaw 2026.11.1, so the report's "unrecognized" list means
 * something. `mcp` covers external actions with no class of their own; `decide` treats it as
 * `other`. `process` only controls an `exec` the gate already passed. `message` is how the agent
 * talks to its operator. `dispatch_action` runs a tool found by `tool_search`, and OpenClaw wraps
 * that tool with the same hook, so the real call is checked under its real name. Gating the
 * dispatcher too would stop an agent reaching `exec` that way from ever acknowledging.
 */
const TOOLS_BY_CLASS = {
  shell: ['exec', 'code_execution', 'terminal'],
  read: ['ls', 'read', 'memory_get', 'personal_instructions', 'sessions_history', 'skills_read', 'view_image', 'pdf', 'transcripts', 'github_identity_status'],
  write: ['write', 'edit', 'apply_patch', 'skill_workshop'],
  search: ['memory_search', 'sessions_search', 'skills_search'],
  web: ['web_search', 'web_fetch', 'x_search', 'browser'],
  agent: ['sessions_spawn', 'sessions_send', 'sessions_yield', 'subagents', 'agents_wait'],
  meta: ['tool_search', 'tool_describe', 'dispatch_action', 'tool_call', 'structured_output', 'process', 'session_status', 'sessions', 'sessions_list', 'conversations_list', 'presence', 'agents_list', 'get_goal', 'create_goal', 'update_goal', 'progress_card', 'heartbeat_respond', 'suggest_task', 'dismiss_task', 'decision_evaluate', 'theme'],
  ui: ['message', 'ask_user', 'tts', 'show_widget'],
  mcp: ['conversations_send', 'conversations_turn', 'gateway', 'plugins', 'automations', 'cron', 'nodes', 'computer', 'mobile_ui', 'screen', 'canvas', 'dashboard', 'portal', 'secrets', 'image_generate', 'music_generate', 'video_generate', 'github_publish'],
};
const CLASS_OF = new Map(Object.entries(TOOLS_BY_CLASS).flatMap(([cls, names]) => names.map((name) => [name, cls])));

function locate(home, env) {
  const stateDir = env.OPENCLAW_STATE_DIR || path.join(home, '.openclaw');
  return {
    stateDir,
    configPath: env.OPENCLAW_CONFIG_PATH || path.join(stateDir, 'openclaw.json'),
    dir: path.join(stateDir, PLUGIN_ID),
  };
}

const defaultRun = (args, env) => spawnSync('openclaw', args, { env, encoding: 'utf8', timeout: 60000 });

/** Every OpenClaw command runs against this state folder, so a test home never reaches the live one. */
function openclawEnv(home, env, place) {
  return { ...env, HOME: home, OPENCLAW_STATE_DIR: place.stateDir, OPENCLAW_CONFIG_PATH: place.configPath };
}

/** Only the machine's own gateway may be told to reload. A test folder would still reach it over the default port. */
function isLiveState(home, env) {
  return home === os.homedir() && !env.OPENCLAW_STATE_DIR && !env.OPENCLAW_CONFIG_PATH;
}

function realPath(file) {
  try { return fs.realpathSync(file); } catch { return path.resolve(file); }
}

/** @returns {{ ok: true } | { ok: false, why: string }} */
function checkApp(run, env) {
  const out = run(['--version'], env);
  if (out?.error || out?.status !== 0) return { ok: false, why: 'No OpenClaw app runs here.' };
  const version = /\b(\d{4})\.(\d+)\.(\d+)\b/.exec(`${out.stdout || ''}`);
  if (!version) return { ok: false, why: 'The openclaw command here reports no version, so it is not the OpenClaw app.' };
  const parts = version.slice(1).map(Number);
  for (let i = 0; i < MIN_VERSION.length; i += 1) {
    if (parts[i] > MIN_VERSION[i]) return { ok: true };
    if (parts[i] < MIN_VERSION[i]) {
      return { ok: false, why: `OpenClaw ${version[0]} is older than ${MIN_VERSION.join('.')}, the first version this gate was tested against. Update OpenClaw, then run: total-recall preflight install --harness openclaw` };
    }
  }
  return { ok: true };
}

function findOnPath(name, env) {
  for (const dir of String(env.PATH || '').split(path.delimiter)) {
    const candidate = path.join(dir || '.', name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch { /* keep looking */ }
  }
  return null;
}

/**
 * This machine's paths for the plugin. A gateway starts with its own PATH, which can put another
 * Node first, so the gate runs on the Node found here. Stable PATH folders survive a Node upgrade;
 * `process.execPath` would not.
 */
function gateSettings(env) {
  const command = findOnPath('total-recall', env);
  const node = findOnPath('node', env);
  return {
    command: command || 'total-recall',
    path: node ? [path.dirname(node)] : [],
    package: command ? path.resolve(path.dirname(realPath(command)), '..') : null,
    tools: {
      open: ['meta', 'ui', 'read', 'search'].flatMap((cls) => TOOLS_BY_CLASS[cls]),
      shell: TOOLS_BY_CLASS.shell,
      write: TOOLS_BY_CLASS.write,
    },
  };
}

function wantedFiles(env) {
  const files = new Map(PLUGIN_FILES.map((name) => [name, fs.readFileSync(path.join(PLUGIN_SOURCE, name), 'utf8')]));
  files.set('gate.json', `${JSON.stringify(gateSettings(env), null, 2)}\n`);
  return files;
}

function readText(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

/** Replaced in one step: the gateway may load this folder at any moment. */
function writeAtomically(file, text) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, text);
  fs.renameSync(temporary, file);
}

/** A disabled plugin counts as absent, because the gate has no off switch. An unreadable config does too. */
function isRegistered(configPath, dir) {
  let config;
  try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { return false; }
  const wanted = realPath(dir);
  const paths = config?.plugins?.load?.paths;
  return Array.isArray(paths)
    && paths.some((entry) => realPath(entry) === wanted)
    && config?.plugins?.entries?.[PLUGIN_ID]?.enabled !== false;
}

function failure(out, doing) {
  const detail = `${out?.stderr || ''} ${out?.stdout || ''}`.trim().split('\n').filter(Boolean).at(-1) || out?.error?.message || `exit ${out?.status}`;
  return new Error(`OpenClaw could not ${doing}: ${detail.slice(0, 300)}`);
}

/** A running gateway reads a new plugin when told to. A gateway that is down reads it when it starts. */
function applyToGateway(run, env) {
  const out = run(['plugins', 'reload', PLUGIN_ID, '--accept-capabilities', '--json'], env);
  return out?.status === 0
    ? 'Loaded into the running gateway.'
    : 'Takes effect when the gateway next starts: total-recall openclaw gateway restart';
}

function removePlugin({ home, env, dryRun, run, place, removed }) {
  const present = fs.existsSync(place.dir);
  const registered = isRegistered(place.configPath, place.dir);
  if (!present && !registered) return { settings: null, added: [], removed };
  if (dryRun) return { settings: place.dir, added: [], removed: [...removed, 'managed before_tool_call plugin'] };
  const cliEnv = openclawEnv(home, env, place);
  let note;
  if (registered) {
    const out = run(['plugins', 'uninstall', PLUGIN_ID, '--force'], cliEnv);
    if (out?.status !== 0) note = `OpenClaw still lists the plugin (${failure(out, 'remove it').message}). Run: openclaw plugins uninstall ${PLUGIN_ID}`;
  }
  fs.rmSync(place.dir, { recursive: true, force: true });
  if (!note && isLiveState(home, env)) note = 'Restart the gateway to unload it: total-recall openclaw gateway restart';
  return { settings: place.dir, added: [], removed: [...removed, 'managed before_tool_call plugin'], ...(note ? { note } : {}) };
}

export const openclawAdapter = {
  id: 'openclaw',
  level: 'enforced',
  warnings: {
    delivery: 'documented',
    via: 'tool-result middleware, from the installed plugin',
    source: 'https://docs.openclaw.ai/plugins/building-plugins',
  },
  source: {
    url: 'https://docs.openclaw.ai/plugins/hooks/tool-policy',
    retrieved: '2026-11-06',
    note: 'A before_tool_call hook and tool-result middleware in an installed plugin. Tool names, context fields and the install contract were read from OpenClaw 2026.11.1, and proved by real agent turns through its gateway.',
  },
  limits: [
    'OpenClaw blocks a call when a before_tool_call hook throws or runs out of time, so the plugin holds the repair exceptions itself',
    'Returns { block: true, blockReason } on deny',
    'An operator can always run `openclaw plugins disable total-recall-gate`; the next install or update turns it back on',
  ],

  parse(input = {}) {
    const toolName = input.toolName || input.tool_name || '';
    const params = input.params || {};
    const base = input.cwd || process.cwd();
    const tool = input.toolKind === 'code_mode_exec' ? 'shell' : (CLASS_OF.get(toolName) || 'other');
    const workdir = typeof params.workdir === 'string' && params.workdir.trim()
      ? params.workdir.replace(/^~(?=$|\/)/, os.homedir())
      : null;
    return {
      event: input.event || 'before_tool_call',
      tool,
      command: tool === 'shell' && typeof params.command === 'string' ? params.command : undefined,
      path: params.path || params.file_path || params.filePath || input.derivedPaths?.[0] || undefined,
      cwd: tool === 'shell' && workdir ? path.resolve(base, workdir) : base,
      raw: input,
    };
  },

  emit(decision, event, cwd = process.cwd()) {
    if (decision?.decision === 'allow') {
      const payload = decision.warning ? { block: false, warning: decision.warning } : { block: false };
      return { stdout: `${JSON.stringify(payload)}\n`, exitCode: 0 };
    }

    const reason = decision?.reason || `TR-PREFLIGHT gate: action denied. Run: ${decision?.fix || ACK_COMMAND}`;
    const payload = {
      block: true,
      blockReason: reason,
      fix: decision?.fix || ACK_COMMAND,
    };
    return { stdout: `${JSON.stringify(payload)}\n`, exitCode: 2 };
  },

  async run({ stdin, decideWith }) {
    const parsed = this.parse(stdin);
    const decision = decideWith({
      tool: parsed.tool,
      command: parsed.command,
      path: parsed.path,
      cwd: parsed.cwd,
    });
    return this.emit(decision, parsed.event, parsed.cwd);
  },

  install({ home = os.homedir(), env = process.env, dryRun = false, remove = false, off = false, run = defaultRun } = {}) {
    const place = locate(home, env);
    const removed = removeDeadGateFile(DEAD_FILE(home), 'openclaw', { dryRun });
    if (remove || off) return removePlugin({ home, env, dryRun, run, place, removed });

    const cliEnv = openclawEnv(home, env, place);
    const app = checkApp(run, cliEnv);
    if (!app.ok) return { settings: null, added: [], removed, unsupported: app.why };

    const files = wantedFiles(env);
    const changed = [...files].filter(([name, text]) => readText(path.join(place.dir, name)) !== text);
    const registered = isRegistered(place.configPath, place.dir);
    if (!changed.length && registered) return { settings: place.dir, added: [], removed };
    const added = ['managed before_tool_call plugin'];
    if (dryRun) return { settings: place.dir, added, removed };

    fs.mkdirSync(place.dir, { recursive: true });
    for (const [name, text] of changed) writeAtomically(path.join(place.dir, name), text);
    if (!registered) {
      // Consent is given here because this is the owner's own plugin, from the owner's own installer.
      const out = run(['plugins', 'install', place.dir, '--link', '--force', '--accept-capabilities'], cliEnv);
      if (out?.status !== 0) throw failure(out, 'install the gate plugin');
    }
    const note = isLiveState(home, env) ? applyToGateway(run, cliEnv) : null;
    return { settings: place.dir, added, removed, ...(note ? { note } : {}) };
  },

  verify({ home = os.homedir(), env = process.env, run = defaultRun } = {}) {
    const place = locate(home, env);
    const out = this.emit({ decision: 'deny', reason: 'receipt missing', fix: ACK_COMMAND }, 'before_tool_call', '/nonexistent-directory-without-receipt');
    const exercised = out.exitCode === 2 && out.stdout.includes('"block":true');
    const base = { exercised, level: this.level, native: out.stdout.trim() };
    if (!isRegistered(place.configPath, place.dir) || !fs.existsSync(path.join(place.dir, 'gate.json'))) {
      return { ...base, installed: false, note: 'The gate plugin is not installed. Run: total-recall preflight install --harness openclaw' };
    }
    const inspected = run(['plugins', 'inspect', PLUGIN_ID, '--runtime', '--json'], openclawEnv(home, env, place));
    let report = null;
    try {
      const text = String(inspected?.stdout || '');
      report = JSON.parse(text.slice(text.indexOf('{')));
    } catch { /* reported below */ }
    const loaded = report?.plugin?.status === 'loaded' && (report?.typedHooks || []).some((hook) => hook?.name === 'before_tool_call');
    return {
      ...base,
      installed: loaded,
      ...(loaded ? {} : { note: `OpenClaw did not load the gate plugin: ${report?.plugin?.error || failure(inspected, 'inspect it').message}` }),
    };
  },
};

export default openclawAdapter;
