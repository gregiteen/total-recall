/**
 * Fleet OpenWiki refresh.
 *
 * The generated `openwiki/` pages are a per-repository projection: they are
 * written into <repo>/openwiki/ and describe that repository's code. They rot
 * silently, because nothing in the repository is obliged to regenerate them —
 * repositories have carried pages three months and 78-149 commits out of date
 * while still looking authoritative.
 *
 * The driver belongs here rather than in every repository: the plugin is one of
 * the bundled defaults served from the shared brain, so one implementation
 * covers every registered project and every mesh node that resolves it. No host
 * runtime is required — this reads the project registry and shells out to the
 * `openwiki` CLI, which is the tool that owns page generation.
 *
 * Refreshing needs a model credential, so the key is read through the auth
 * plugin (`auth secret get`). The bare `secret` form is a dead end in some
 * releases; both are tried and the failure is explicit.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { loadOpenWikiConfig } from './config.mjs';

const PLUGIN_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Registry written by the core when a project is registered. */
const RETENTION_NOTE = 'pages are a projection, not canonical memory';
const DEFAULT_LOCK_MS = 6 * 60 * 60 * 1000;

const gitRun = (_command, args, options) => spawnSync('total-recall', ['git', ...args], options);

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/** An unfinished init must resume as init, even after it has written pages. */
export function generationMode(root) {
  const state = readJson(path.join(root, 'openwiki', '.run.json'));
  if (state?.mode === 'init' && state.phase && !['complete', 'idle'].includes(state.phase)) return 'init';
  return hasWiki(root) ? 'update' : 'init';
}

export function registryPath(home = os.homedir()) {
  return path.join(home, '.agent', 'skills', 'total-recall', 'config', 'project-registry.json');
}

/**
 * Read the registered projects. The registry is the same source the updater
 * uses to reach every consumer, so fleet scope is defined in exactly one place.
 */
export function readProjects({ registry = registryPath() } = {}) {
  let raw;
  try {
    raw = fs.readFileSync(registry, 'utf8');
  } catch {
    throw new Error(`Project registry not readable: ${registry}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Project registry is not valid JSON: ${registry}`);
  }
  if (!Array.isArray(parsed)) throw new Error('Project registry must be an array');
  const projects = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const root = entry.path;
    if (typeof root !== 'string' || !path.isAbsolute(root)) continue;
    projects.push({ name: String(entry.name || path.basename(root)), root });
  }
  // One project per root: the registry has historically held duplicates.
  const seen = new Set();
  return projects.filter((p) => {
    const key = path.resolve(p.root);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Does this project carry generated Markdown pages? */
export function hasWiki(root) {
  const dir = path.join(root, 'openwiki');
  const stat = fs.lstatSync(dir, { throwIfNoEntry: false });
  if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) return false;
  return fs.readdirSync(dir).some((name) => name.endsWith('.md'));
}

/**
 * How far behind is one project? Commits touching anything outside openwiki/
 * since the recorded generation, which is the same measure the per-repo driver
 * used. Uncommitted work is not counted, so an open edit does not read as drift.
 */
export function isGitRepo(root, { git = gitRun } = {}) {
  if (fs.existsSync(path.join(root, '.git'))) return true;
  const res = git('git', ['-C', root, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
  if (res.error || res.status !== 0 || String(res.stdout).trim() !== 'true') return false;
  const top = git('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (top.error || top.status !== 0) return false;
  return fs.realpathSync(root) === fs.realpathSync(String(top.stdout).trim());
}

export function staleness(root, { git = gitRun } = {}) {
  if (!isGitRepo(root, { git })) {
    return { root, head: '', generationCommit: null, generationTime: null, generatedAt: null, generatedStatus: null, files: null, lastCodeChange: null, commitsSince: 0, stale: false };
  }
  const marker = path.join(root, 'openwiki', '.last-update.json');
  let head = '';
  const headRun = git('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  if (!headRun.error && headRun.status === 0) head = String(headRun.stdout || '').trim();

  let generatedAt = null;
  let generatedStatus = null;
  try {
    const parsed = JSON.parse(fs.readFileSync(marker, 'utf8'));
    generatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null;
    generatedStatus = typeof parsed.status === 'string' ? parsed.status : null;
  } catch { /* no marker: never generated, or unreadable */ }
  const receipt = readJson(path.join(root, 'openwiki', '.generation.json'));
  const validReceipt = typeof receipt?.commit === 'string' && /^[a-f0-9]{7,64}$/i.test(receipt.commit)
    && typeof receipt.completedAt === 'string' && Number.isFinite(Date.parse(receipt.completedAt));
  const generationCommit = validReceipt ? receipt.commit : null;
  const generationTime = validReceipt ? receipt.completedAt : null;

  // The page contents, so a refresh can be judged on what it actually rewrote.
  // openwiki writes its marker when generation begins, so the marker alone
  // cannot tell a completed refresh from one killed moments later.
  let files = null;
  try {
    const dir = path.join(root, 'openwiki');
    files = {};
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      files[entry.name] = fs.readFileSync(path.join(dir, entry.name), 'utf8');
    }
  } catch { files = null; }

  const log = git('git', ['-C', root, 'log', '-1', '--format=%cI', '--', '.', ':!openwiki'], { encoding: 'utf8' });
  const lastCodeChange = !log.error && log.status === 0 ? String(log.stdout || '').trim() || null : null;

  let commitsSince = null;
  if (generationCommit || generatedAt) {
    const range = generationCommit ? [`${generationCommit}..HEAD`] : [`--since=${generatedAt}`, 'HEAD'];
    const count = git('git', ['-C', root, 'rev-list', '--count', ...range, '--', '.', ':!openwiki'], { encoding: 'utf8' });
    const value = String(count.stdout || '').trim();
    if (!count.error && count.status === 0 && /^\d+$/.test(value)) commitsSince = Number(value);
  }
  const incomplete = generatedStatus === 'interrupted' || stillGenerating(root);
  const stale = incomplete || generatedAt === null || commitsSince === null || commitsSince > 0;
  return { root, head, generationCommit, generationTime, generatedAt, generatedStatus, files, lastCodeChange, commitsSince, stale, mode: generationMode(root) };
}

/**
 * Resolve a model credential through the auth plugin.
 *
 * `total-recall secret get` is refused in releases where the bare name is
 * blocked, and the refusal exits 0 while printing advice, so an empty value is
 * the only symptom. Try the owning namespace, then the bare form for older
 * CLIs, and report failure rather than refreshing without a key.
 */
export function resolveKey({ provider = null, keys = null, run = spawnSync } = {}) {
  const activeProvider = provider || (typeof loadOpenWikiConfig === 'function' ? loadOpenWikiConfig().provider : 'openrouter');
  const candidateKeys = keys || (activeProvider === 'google'
    ? ['GOOGLE_API_KEY', 'GEMINI_API_KEY']
    : ['OPENROUTER_API_KEY', 'JSN_OPENROUTER_API_KEY']);

  for (const form of [['auth', 'secret', 'get'], ['secret', 'get']]) {
    for (const name of candidateKeys) {
      const result = run('total-recall', [...form, name], { encoding: 'utf8', timeout: 90_000 });
      if (result.error || result.status !== 0) continue;
      const value = String(result.stdout || '').trim().split('\n').pop()?.trim();
      if (value && !/^Credential commands belong/.test(value)) return { key: value, from: `${form.join(' ')} ${name}` };
    }
  }
  return { key: null, from: null };
}

/**
 * Refresh one project's pages.
 *
 * `openwiki --update` regenerates in place and needs a TTY: it is an Ink app,
 * so a headless run must be detached from stdio or it dies on raw mode. The
 * command is asserted to have rewritten the marker afterwards rather than
 * trusting its exit code, because the failure mode this replaces was a refresh
 * that reported success while changing nothing.
 */
/**
 * Locate the page generator.
 *
 * `openwiki` is not installed on PATH on most machines — it is fetched or run
 * through npx — so assuming the bare name produced `spawnSync openwiki ENOENT`
 * for every project that did have pages.
 *
 * npx is the last resort, not the fallback: `npx openwiki` re-resolves against
 * the registry and a slow or unreachable network fails the whole refresh with
 * `spawnSync npx ETIMEDOUT`. A previously fetched copy already sits in the npx
 * cache, so use that before going to the network, and only reach for `--yes`
 * when nothing cached exists.
 */
export function resolveGenerator({ pluginRoot = null, run = spawnSync, env = process.env, home = os.homedir(), targetVersion = null, requireBundled = false } = {}) {
  const root = pluginRoot !== null ? pluginRoot : PLUGIN_ROOT;
  if (root) {
    const bundled = path.join(root, 'vendor', 'openwiki.mjs');
    if (fs.existsSync(bundled)) {
      return { command: process.execPath, args: [bundled], via: 'bundled plugin generator' };
    }
    if (requireBundled) return { command: null, args: [], via: null };
    const candidate = path.join(root, 'node_modules', '.bin', 'openwiki');
    if (fs.existsSync(candidate)) return { command: candidate, args: [], via: 'plugin local node_modules/.bin' };
  }

  if (pluginRoot === null) {
    const localBundled = path.join(process.cwd(), 'vendor', 'openwiki.mjs');
    if (fs.existsSync(localBundled)) {
      return { command: process.execPath, args: [localBundled], via: 'bundled plugin generator' };
    }
    const local = path.join(process.cwd(), 'node_modules', '.bin', 'openwiki');
    if (fs.existsSync(local)) return { command: local, args: [], via: 'local node_modules/.bin' };
  }

  const onPath = run('which', ['openwiki'], { encoding: 'utf8' });
  if (!onPath.error && onPath.status === 0) {
    const found = String(onPath.stdout || '').trim().split('\n').pop();
    if (found) return { command: found, args: [], via: 'PATH' };
  }

  // A cached npx install is a real binary and needs no network.
  const cacheRoot = path.join(home, '.npm', '_npx');
  try {
    const entries = fs.readdirSync(cacheRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => path.join(cacheRoot, e.name, 'node_modules', '.bin', 'openwiki'))
      .filter((candidate) => fs.existsSync(candidate))
      .map((candidate) => ({ candidate, mtime: fs.statSync(candidate).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (entries.length) return { command: entries[0].candidate, args: [], via: 'npx cache' };
  } catch { /* no cache directory */ }

  const npx = run('which', ['npx'], { encoding: 'utf8' });
  if (!npx.error && npx.status === 0) {
    const versionTag = targetVersion || '0.7.3';
    return { command: 'npx', args: ['--yes', `openwiki@${versionTag}`], via: `npx openwiki@${versionTag} (network)` };
  }
  return { command: null, args: [], via: null };
}

/**
 * Which pages did the run actually rewrite?
 *
 * Byte comparison against the previous content is the only honest measure: the
 * marker advances when generation BEGINS, so it cannot distinguish a completed
 * refresh from one killed seconds later.
 */
export function pagesWritten(before, after) {
  if (!before.files || !after.files) return 0;
  let n = 0;
  for (const [name, content] of Object.entries(after.files)) {
    if (before.files[name] !== content) n += 1;
  }
  return n;
}

/** Is a generation run still in progress, per its own run state? */
export function stillGenerating(root) {
  try {
    const run = JSON.parse(fs.readFileSync(path.join(root, 'openwiki', '.run.json'), 'utf8'));
    return typeof run.phase === 'string' && run.phase !== 'complete' && run.phase !== 'idle';
  } catch {
    return false;
  }
}

function writeReceipt(root, name, value) {
  const dir = path.join(root, 'openwiki');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, name);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    fs.renameSync(tmp, target);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

function redact(value, key) {
  let text = String(value || '');
  if (key) text = text.split(key).join('[REDACTED]');
  return text.replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]').replace(/\bsk-[\w-]+/g, '[REDACTED]');
}

function finishRefresh(project, { before, result, git, key, mode, startedAt, via, clock }) {
  const after = staleness(project.root, { git });
  const exitCode = result.error ? (result.error.code || 1) : result.signal ? 1 : result.status;
  const completedAt = new Date(clock()).toISOString();
  const stdout = redact(result.stdout, key), stderr = redact(result.stderr, key);
  const error = redact(result.error?.message, key);
  const clean = text => String(text || '').replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/)
    .map(line => line.trim().replace(/^\[ERR\]\s*/, '')).filter(line => line && line !== 'Error Diagnostics');
  const errLines = clean(stderr), outLines = clean(stdout);
  const diagnostic = [...errLines, ...outLines].find(line => /context_length_exceeded|Provider returned error|exited without|Could not restore|interrupted OpenWiki|fetch failed/.test(line));
  // The generator's own first error line names the cause; a trailing "Status: 400" does not.
  const reason = error || (result.signal ? `generator stopped by ${result.signal}` : diagnostic || errLines[0] || outLines.at(-1) || `exit ${exitCode}`);
  const wrote = pagesWritten(before, after) || (!before.files && hasWiki(project.root) ? 1 : 0);
  const advanced = after.generatedAt !== before.generatedAt;
  let action, failureReason;
  if (after.generatedStatus === 'interrupted' || stillGenerating(project.root)) {
    action = 'partial';
    failureReason = `${wrote} page(s) rewritten, but the run did not finish; it resumes on the next refresh (${reason})`;
  } else if (exitCode !== 0) {
    action = 'failed'; failureReason = reason;
  } else if (!advanced && !wrote) {
    action = 'failed'; failureReason = 'command exited 0 and no page changed';
  } else if (!before.head) {
    action = 'failed'; failureReason = 'Cannot record generation without a source commit';
  } else {
    action = mode === 'init' ? 'initialized' : 'refreshed';
  }
  const logPath = path.join(project.root, 'openwiki', '.refresh-attempt.json');
  const report = { ...project, ...after, action, reason: failureReason, exitCode, signal: result.signal || null, from: before.generatedAt, to: after.generatedAt, durationMs: clock() - startedAt, via, mode, logPath };
  try {
    writeReceipt(project.root, '.refresh-attempt.json', { startedAt: new Date(startedAt).toISOString(), completedAt, sourceCommit: before.head || null, action, mode, exitCode, signal: result.signal || null, error, stdout, stderr });
    if (action === 'initialized' || action === 'refreshed') {
      writeReceipt(project.root, '.generation.json', { commit: before.head, completedAt });
      report.generationCommit = before.head;
      report.generationTime = completedAt;
      report.commitsSince = after.head === before.head ? 0 : null;
      report.stale = after.head !== before.head;
    } else if (before.generationCommit && before.generationTime) {
      // Init can replace openwiki/ before it fails. Retain the last success.
      writeReceipt(project.root, '.generation.json', { commit: before.generationCommit, completedAt: before.generationTime });
      report.generationCommit = before.generationCommit;
      report.generationTime = before.generationTime;
    }
  } catch (error) {
    report.action = 'failed'; report.reason = `Could not save refresh receipt: ${error.message}`;
  }
  return report;
}

export function refreshProject(project, {
  key, model = null, provider = null, binary = null, binaryArgs = [], timeoutMs = 30 * 60 * 1000, run = spawnSync, now = Date.now(), clock = Date.now, targetVersion = null, pluginRoot = PLUGIN_ROOT,
} = {}) {
  const git = run === spawnSync ? gitRun : run;
  if (!isGitRepo(project.root, { git })) {
    return { ...project, action: 'skipped', reason: 'not a git repository' };
  }
  const before = staleness(project.root, { git });
  const uninitialized = !hasWiki(project.root);
  const mode = generationMode(project.root);

  let command = binary, args = binaryArgs, via = binary ? 'explicit' : null;
  if (!command) {
    const resolved = resolveGenerator({ run, targetVersion, pluginRoot, requireBundled: uninitialized });
    if (!resolved.command) {
      const reason = uninitialized ? 'OpenWiki initialization requires the bundled plugin generator' : 'no openwiki generator available (no local .bin, no PATH entry, no npx)';
      return { ...project, action: 'failed', reason, ...before };
    }
    ({ command, args, via } = resolved);
  }

  const config = typeof loadOpenWikiConfig === 'function' ? loadOpenWikiConfig() : { model: 'deepseek/deepseek-chat', provider: 'openrouter' };
  const selectedModel = model || config.model;
  const selectedProvider = provider || config.provider;

  const modeFlag = `--${mode}`;
  const cmdArgs = [...args, modeFlag, '-p'];
  if (selectedModel) {
    cmdArgs.push('--modelId', selectedModel);
  }

  const childEnv = { ...process.env };
  if (selectedProvider === 'google') {
    childEnv.GOOGLE_API_KEY = key;
    childEnv.GEMINI_API_KEY = key;
    childEnv.OPENWIKI_PROVIDER = 'gemini';
    delete childEnv.OPENAI_API_KEY;
    delete childEnv.OPENROUTER_API_KEY;
  } else {
    childEnv.OPENROUTER_API_KEY = key;
    childEnv.OPENWIKI_PROVIDER = 'openrouter';
    if (config.max_tokens) {
      childEnv.OPENWIKI_OPENROUTER_MAX_TOKENS = String(config.max_tokens);
      childEnv.OPENWIKI_MAX_OUTPUT_TOKENS = String(config.max_tokens);
    }
    delete childEnv.OPENAI_API_KEY;
  }

  const startedAt = now;
  const result = run(command, cmdArgs, {
    cwd: project.root,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: timeoutMs,
  });

  return finishRefresh(project, { before, result, git, key, mode, startedAt, via, clock });
}

export async function refreshProjectAsync(project, {
  key, model = null, provider = null, binary = null, binaryArgs = [], timeoutMs = 30 * 60 * 1000, now = Date.now(), clock = Date.now, targetVersion = null, pluginRoot = PLUGIN_ROOT, git = gitRun, spawnProcess = spawn,
} = {}) {
  if (!isGitRepo(project.root, { git })) {
    return { ...project, action: 'skipped', reason: 'not a git repository' };
  }
  const before = staleness(project.root, { git });
  const uninitialized = !hasWiki(project.root);
  const mode = generationMode(project.root);
  let command = binary, args = binaryArgs, via = binary ? 'explicit' : null;
  if (!command) {
    const resolved = resolveGenerator({ run: spawnSync, targetVersion, pluginRoot, requireBundled: uninitialized });
    if (!resolved.command) {
      const reason = uninitialized ? 'OpenWiki initialization requires the bundled plugin generator' : 'no openwiki generator available (no local .bin, no PATH entry, no npx)';
      return { ...project, action: 'failed', reason, ...before };
    }
    ({ command, args, via } = resolved);
  }

  const config = typeof loadOpenWikiConfig === 'function' ? loadOpenWikiConfig() : { model: 'deepseek/deepseek-chat', provider: 'openrouter' };
  const selectedModel = model || config.model;
  const selectedProvider = provider || config.provider;

  const modeFlag = `--${mode}`;
  const cmdArgs = [...args, modeFlag, '-p'];
  if (selectedModel) {
    cmdArgs.push('--modelId', selectedModel);
  }

  const childEnv = { ...process.env };
  if (selectedProvider === 'google') {
    childEnv.GOOGLE_API_KEY = key;
    childEnv.GEMINI_API_KEY = key;
    childEnv.OPENWIKI_PROVIDER = 'gemini';
    delete childEnv.OPENAI_API_KEY;
    delete childEnv.OPENROUTER_API_KEY;
  } else {
    childEnv.OPENROUTER_API_KEY = key;
    childEnv.OPENWIKI_PROVIDER = 'openrouter';
    if (config.max_tokens) {
      childEnv.OPENWIKI_OPENROUTER_MAX_TOKENS = String(config.max_tokens);
      childEnv.OPENWIKI_MAX_OUTPUT_TOKENS = String(config.max_tokens);
    }
    delete childEnv.OPENAI_API_KEY;
  }

  const startedAt = now;
  const result = await new Promise((resolve) => {
    const proc = spawnProcess(command, cmdArgs, {
      cwd: project.root,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });
    let stdout = '', stderr = '', error = null;
    proc.stdout?.on('data', (d) => { stdout += d; });
    proc.stderr?.on('data', (d) => { stderr += d; });
    proc.on('error', (err) => { error = err; });
    proc.on('close', (status, signal) => resolve({ error, status, signal, stdout, stderr }));
  });
  return finishRefresh(project, { before, result, git, key, mode, startedAt, via, clock });
}

/** Is a refresh due for this project under the configured interval? */
export function isDue(project, { lockMs = DEFAULT_LOCK_MS, now = Date.now(), git = gitRun, force = false } = {}) {
  if (!isGitRepo(project.root, { git })) {
    return { due: false, skipped: true, reason: 'not a git repository' };
  }
  const state = staleness(project.root, { git });
  if (force) return { due: true, uninitialized: !hasWiki(project.root), ...state };
  if (!hasWiki(project.root)) {
    return { due: true, uninitialized: true, reason: 'uninitialized (missing openwiki/ pages)', ...state };
  }
  if (!state.stale) return { due: false, ...state };
  if (state.generatedStatus === 'interrupted' || stillGenerating(project.root)) return { due: true, reason: 'resume incomplete generation', ...state };
  if (state.generatedAt) {
    const at = Date.parse(state.generatedAt);
    if (Number.isFinite(at) && now - at < lockMs) return { due: false, reason: 'refreshed recently', ...state };
  }
  return { due: true, ...state };
}

export function describeRetention() {
  return `OpenWiki ${RETENTION_NOTE}; refresh rewrites openwiki/ only and never vault content.`;
}
