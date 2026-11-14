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

/**
 * Paths outside every wiki. Total Recall rewrites them in every repository on each
 * release (version pins in lockfiles, compiled agent instructions, copied skills), so
 * counting them as changes paid a model to re-check pages after every release.
 * `.openwikiignore` syntax: a leading "/" anchors at the repository root, a trailing
 * "/" names a directory, a bare name matches at any depth.
 */
export const DEFAULT_IGNORES = Object.freeze([
  'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb',
  '/CLAUDE.md', '/AGENTS.md', '/GEMINI.md', '/INSTRUCTIONS.md',
  '/.cursorrules', '/.windsurfrules', '/.clinerules',
  '/.cursor/rules/total-recall.mdc', '/.github/copilot-instructions.md', '/.agents/rules/AGENTS.md',
  '/.agent/skills/total-recall/', '/.agent/skills/ssss/', '/.claude/skills/total-recall/', '/.claude/skills/ssss/',
]);
const IGNORE_BLOCK_START = '# >>> total-recall openwiki defaults (managed; add your own rules outside this block)';
const IGNORE_BLOCK_END = '# <<< total-recall openwiki defaults';

/** Does a DEFAULT_IGNORES pattern cover this repository-relative file path? */
export function ignoreMatches(pattern, file) {
  if (pattern.startsWith('/')) {
    const body = pattern.slice(1);
    return body.endsWith('/') ? file.startsWith(body) : file === body;
  }
  return file === pattern || file.endsWith(`/${pattern}`);
}

/**
 * Repository paths the existing wiki cites as evidence (claims and page sources).
 * OpenWiki refuses a run whose evidence path is ignored ("Evidence path is excluded
 * by .openwikiignore"), so a cited path is never ignored.
 */
export function citedPaths(root) {
  const cited = new Set();
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(json|md)$/.test(entry.name)) {
        let text;
        try { text = fs.readFileSync(full, 'utf8'); } catch { continue; }
        for (const match of text.matchAll(/repo:\/\/([^\s"'#)\]]+)/g)) cited.add(match[1].replace(/^\/+/, ''));
      }
    }
  };
  walk(path.join(root, 'openwiki'));
  return cited;
}

/** The default ignores that apply to this repository: every one no wiki evidence cites. */
export function effectiveIgnores(root, cited = citedPaths(root)) {
  return DEFAULT_IGNORES.filter((pattern) => ![...cited].some((file) => ignoreMatches(pattern, file)));
}

/** Git pathspecs that leave the ignored paths out of a commit count. */
export function ignorePathspecs(patterns) {
  return patterns.map((pattern) => (pattern.startsWith('/')
    ? `:(exclude)${pattern.slice(1).replace(/\/$/, '')}`
    : `:(exclude,glob)**/${pattern}`));
}

/**
 * Keep the managed default block in the repository's `.openwikiignore`, leaving
 * every other line as the owner wrote it. Writes only when the block changes.
 */
export function ensureDefaultIgnores(root, patterns = effectiveIgnores(root)) {
  const file = path.join(root, '.openwikiignore');
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const start = current.indexOf(IGNORE_BLOCK_START);
  const end = current.indexOf(IGNORE_BLOCK_END);
  const outside = start >= 0 && end > start ? current.slice(0, start) + current.slice(end + IGNORE_BLOCK_END.length) : current;
  const block = [
    IGNORE_BLOCK_START,
    '# Rewritten in every repository by each Total Recall release: lockfiles, compiled agent',
    '# instructions and copied skills. A path the existing wiki cites is left out of this list.',
    ...patterns,
    IGNORE_BLOCK_END,
  ].join('\n');
  const rest = outside.replace(/^\n+|\n+$/g, '');
  const next = `${rest ? `${rest}\n\n` : ''}${block}\n`;
  if (next === current) return { file, written: false, patterns };
  fs.writeFileSync(file, next);
  return { file, written: true, patterns };
}

const VERSION_LINE = /^[+-]\s*"([^"]+)"\s*:\s*"([^"]*)"\s*,?\s*$/;
const VERSION_SPEC = /^(?:npm:(?:@[^/\s]+\/)?[^@\s]+@)?[~^<>=\s]*v?\d+(?:\.\d+)*(?:[-+][\w.-]+)?$/;

/**
 * How many commits in `git log -p -U0 --format=%x1eCOMMIT %H` output changed
 * nothing but version strings in package.json files. A Total Recall release pins
 * its new version into every repository this way; that is not a change to the code
 * the wiki documents. Any other edit to package.json (a script, a new dependency)
 * still counts.
 */
export function versionOnlyCommits(logPatch) {
  let total = 0;
  for (const chunk of logPatch.split('\x1eCOMMIT ').slice(1)) {
    const files = [...chunk.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].map((m) => m[2]);
    if (!files.length || files.some((file) => path.posix.basename(file) !== 'package.json')) continue;
    const changed = chunk.split('\n').filter((line) => /^[+-]/.test(line) && !/^(\+\+\+|---) /.test(line));
    const removed = [], added = [];
    let versionsOnly = changed.length > 0;
    for (const line of changed) {
      const match = VERSION_LINE.exec(line);
      if (!match || !VERSION_SPEC.test(match[2].trim())) { versionsOnly = false; break; }
      (line[0] === '-' ? removed : added).push(match[1]);
    }
    if (versionsOnly && removed.sort().join('\n') === added.sort().join('\n')) total += 1;
  }
  return total;
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
export function readProjects({ registry = registryPath(), exclude = null } = {}) {
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
  const excluded = new Set((exclude ?? loadOpenWikiConfig().exclude ?? []).map((root) => path.resolve(root)));
  return projects.filter((p) => {
    const key = path.resolve(p.root);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((p) => ({ ...p, excluded: excluded.has(path.resolve(p.root)) }));
}

export const EXCLUDED = "excluded from OpenWiki (total-recall openwiki exclude --remove <name> to include it)";
export const NO_WIKI = "no finished wiki; the nightly refresh only updates existing wikis. Create one with: total-recall openwiki generate --repo <name>";

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

  // A commit that touches only the ignored paths (a release's version pins and
  // compiled instructions) is not a change to document.
  const scope = ['--', '.', ':!openwiki', ...ignorePathspecs(effectiveIgnores(root))];
  const log = git('git', ['-C', root, 'log', '-1', '--format=%cI', ...scope], { encoding: 'utf8' });
  const lastCodeChange = !log.error && log.status === 0 ? String(log.stdout || '').trim() || null : null;

  let commitsSince = null;
  if (generationCommit || generatedAt) {
    const range = generationCommit ? [`${generationCommit}..HEAD`] : [`--since=${generatedAt}`, 'HEAD'];
    const count = git('git', ['-C', root, 'rev-list', '--count', ...range, ...scope], { encoding: 'utf8' });
    const value = String(count.stdout || '').trim();
    if (!count.error && count.status === 0 && /^\d+$/.test(value)) commitsSince = Number(value);
    if (commitsSince > 0) {
      const patches = git('git', ['-C', root, 'log', '-p', '-U0', '--no-color', '--no-ext-diff', '--format=%x1eCOMMIT %H', ...range, ...scope], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      if (!patches.error && patches.status === 0) commitsSince = Math.max(0, commitsSince - versionOnlyCommits(String(patches.stdout || '')));
    }
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

export const CREDIT_REFUSAL = /\b402\b|insufficient credits|requires more credits|credit limit/i;

export function redact(value, key) {
  let text = String(value || '');
  if (key) text = text.split(key).join('[REDACTED]');
  return text.replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]').replace(/\bsk-[\w-]+/g, '[REDACTED]');
}

// The model is the operator's choice; models and prices change too often for a default here.
export const NO_MODEL = 'No OpenWiki model is configured. Check current OpenRouter models and prices, then run: total-recall openwiki config set model <model-id>';

export function buildGeneratorInvocation({ baseArgs = [], mode = 'update', config = {}, key = '' } = {}) {
  const selectedModel = String(config.model || '').trim();
  if (!selectedModel) throw new Error(NO_MODEL);
  const selectedProvider = config.provider || 'openrouter';
  const cmdArgs = [...baseArgs, `--${mode}`, '-p', '--modelId', selectedModel];
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
  if (config.timeout_ms) {
    childEnv.OPENWIKI_TIMEOUT = String(config.timeout_ms);
  }
  return { cmdArgs, childEnv, selectedModel, selectedProvider };
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

  const config = loadOpenWikiConfig();
  const { cmdArgs, childEnv } = buildGeneratorInvocation({
    baseArgs: args,
    mode,
    config: { ...config, model: model || config.model, provider: provider || config.provider },
    key,
  });

  ensureDefaultIgnores(project.root);
  const startedAt = now;
  writeReceipt(project.root, '.refresh-started.json', { startedAt: new Date(startedAt).toISOString(), sourceCommit: before.head || null });
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

  const config = loadOpenWikiConfig();
  const { cmdArgs, childEnv } = buildGeneratorInvocation({
    baseArgs: args,
    mode,
    config: { ...config, model: model || config.model, provider: provider || config.provider },
    key,
  });

  ensureDefaultIgnores(project.root);
  const startedAt = now;
  writeReceipt(project.root, '.refresh-started.json', { startedAt: new Date(startedAt).toISOString(), sourceCommit: before.head || null });
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

/**
 * Start time (ms) of the latest generation attempt, or NaN when none is recorded.
 * `.refresh-started.json` is written before the generator runs, so an attempt
 * the task runner killed still counts; the other two are written by the
 * generator when it begins and by the driver when an attempt ends.
 */
export function lastAttemptStart(root, generatedAt = null) {
  const times = [
    readJson(path.join(root, 'openwiki', '.refresh-started.json'))?.startedAt,
    readJson(path.join(root, 'openwiki', '.refresh-attempt.json'))?.startedAt,
    generatedAt,
  ].map((value) => (typeof value === 'string' ? Date.parse(value) : NaN)).filter(Number.isFinite);
  return times.length ? Math.max(...times) : NaN;
}

/**
 * Is a refresh due for this project under the configured interval?
 *
 * Every attempt, including a retry of an interrupted or failed one, waits the
 * full interval after the previous attempt began. Retrying an interrupted run
 * on every scheduler slot spent about $10 a day on 2026-11-12/13: the task
 * runner killed the same generations every 30 minutes and they never finished.
 */
export function isDue(project, { lockMs = DEFAULT_LOCK_MS, now = Date.now(), git = gitRun, force = false } = {}) {
  if (project.excluded) return { due: false, excluded: true, reason: EXCLUDED };
  if (!isGitRepo(project.root, { git })) {
    return { due: false, skipped: true, reason: 'not a git repository' };
  }
  const state = staleness(project.root, { git });
  // Creating a wiki is the most expensive run there is, and a registered
  // repository may be someone else's code. Only an explicit `openwiki generate`
  // creates one or finishes an interrupted creation; refresh, --force included,
  // only updates finished wikis.
  if (generationMode(project.root) === 'init') {
    return { due: false, uninitialized: true, ...state, reason: NO_WIKI };
  }
  if (force) return { due: true, uninitialized: false, ...state };
  const last = lastAttemptStart(project.root, state.generatedAt);
  const retryAt = Number.isFinite(last) && now - last < lockMs ? new Date(last + lockMs).toISOString() : null;
  if (!state.stale) return { due: false, ...state };
  const incomplete = state.generatedStatus === 'interrupted' || stillGenerating(project.root);
  if (retryAt) {
    return incomplete
      ? { due: false, held: true, reason: `incomplete generation attempted recently; resumes after ${retryAt}`, ...state }
      : { due: false, reason: 'refreshed recently', ...state };
  }
  if (incomplete) return { due: true, reason: 'resume incomplete generation', ...state };
  return { due: true, ...state };
}

export function describeRetention() {
  return `OpenWiki ${RETENTION_NOTE}; refresh rewrites openwiki/ only and never vault content.`;
}
