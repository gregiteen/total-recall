/**
 * total-recall release — publish a package, propagate it, and verify every consumer.
 *
 * The missing capability this fills: publishing to npm and verifying that the
 * published artifact actually reached every registered consumer were manual
 * steps outside any TR command. A release that is only on npm is not released,
 * and a release whose consumers were never verified is a claim, not a fact.
 *
 * Usage:
 *   npx total-recall release plan <pkg> [--version X.Y.Z]
 *   npx total-recall release publish <pkg> [--version X.Y.Z] [--otp N]
 *   npx total-recall release propagate [--apply]
 *   npx total-recall release verify <pkg> [--version X.Y.Z]
 *   npx total-recall release all <pkg> [--version X.Y.Z] [--apply] [--otp N]
 *
 * Never publishes without --apply. Never trusts the publish command's own
 * report: verification reads the registry and each consumer's resolved
 * installation independently.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { BRAIN_PACKAGES, updateAllBrains } from '../core/brain-updates.mjs';
import { listUpdateRoots, rootsFromEnv } from '../core/package-auto-update.mjs';

const DEFAULT_PACKAGES = BRAIN_PACKAGES;

/** @param {string[]} args */
export function parseArgs(args) {
  const opts = {
    action: null,
    packages: [],
    version: null,
    apply: false,
    otp: null,
    json: false,
    help: false,
    root: null,
    timeoutMs: 20 * 60 * 1000,
  };
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--apply') opts.apply = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--version' && args[i + 1]) opts.version = args[++i];
    else if (a === '--otp' && args[i + 1]) opts.otp = args[++i];
    else if (a === '--root' && args[i + 1]) opts.root = args[++i];
    else if (a === '--timeout' && args[i + 1]) opts.timeoutMs = Number(args[++i]);
    else if (!a.startsWith('-')) positional.push(a);
  }
  opts.action = positional.shift() || null;
  opts.packages = positional;
  return opts;
}

const ACTIONS = ['plan', 'publish', 'propagate', 'verify', 'all'];

function printHelp() {
  console.log(`
  total-recall release — publish, propagate and verify a package release

  Usage:
    total-recall release plan <pkg> [--version X.Y.Z]
    total-recall release publish <pkg> [--version X.Y.Z] [--otp N] --apply
    total-recall release propagate [--apply] [--json]
    total-recall release verify <pkg> [--version X.Y.Z] [--json]
    total-recall release all <pkg> [--version X.Y.Z] [--apply] [--otp N] [--json]

  Actions:
    plan        Resolve the release version and report gate/consumer readiness. No writes.
    publish     Run the package's prepublish gate, then npm publish. Requires --apply.
    propagate   Pin the published version across every registered consumer (update --all-brains).
    verify      Independently confirm the registry artifact and each consumer's resolved install.
    all         plan → publish → propagate → verify, stopping at the first failure.

  Rules enforced here:
    • Publishing requires --apply; plan/verify never write.
    • Verification never trusts the publish or propagate report: it re-reads the
      npm registry and each consumer's own resolved package.json.
    • A version that is only on npm is reported as incomplete, not as released.

  Options:
    --apply          Perform writes (required for publish/propagate).
    --version X.Y.Z  Expect or assert a specific version (defaults to the source package.json).
    --otp N          npm one-time password, passed through to npm publish.
    --root PATH      Source repo for the package (defaults to $PWD).
    --json           Machine-readable output.
`);
}

/** Read a package's source metadata without assuming a monorepo layout. */
export function readSourcePackage(root, pkg) {
  const candidates = [path.join(root, 'package.json')];
  // A workspace source may live one level down (packages/<dir>/package.json).
  for (const dir of ['packages', 'apps']) {
    const base = path.join(root, dir);
    if (!fs.existsSync(base)) continue;
    for (const entry of fs.readdirSync(base)) {
      candidates.push(path.join(base, entry, 'package.json'));
    }
  }
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const pkgJson = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (pkgJson.name === pkg) return { file, dir: path.dirname(file), pkgJson };
    } catch {
      /* ignore malformed candidates rather than failing the whole release */
    }
  }
  return null;
}

/** npm registry read. This is the independent source of truth for "published". */
export function publishedVersion(pkg, { exec = spawnSync } = {}) {
  const res = exec('npm', ['view', pkg, 'version'], { encoding: 'utf8', timeout: 60000 });
  if (res.status !== 0) return { ok: false, version: null, error: (res.stderr || '').trim() || 'npm view failed' };
  return { ok: true, version: (res.stdout || '').trim(), error: null };
}

/** Wait for a just-published version to become readable from the registry. */
export async function awaitPublished(pkg, version, { attempts = 8, delayMs = 20000, exec = spawnSync, sleep } = {}) {
  const pause = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  let last = null;
  for (let i = 0; i < attempts; i++) {
    const read = publishedVersion(pkg, { exec });
    last = read;
    if (read.ok && read.version === version) return { ok: true, version: read.version, attempts: i + 1 };
    if (i < attempts - 1) await pause(delayMs);
  }
  return { ok: false, version: last?.version ?? null, error: last?.error ?? `registry still reports ${last?.version}`, attempts };
}

/**
 * Every consumer root TR knows about: the project registry plus TR_SYNC_REPOS.
 * Used by verify so it never depends on the propagate step's own bookkeeping.
 */
export function consumerRoots(opts = {}) {
  // Explicit roots are authoritative: passing them means "verify exactly these",
  // which is what makes this callable from tests and from --root. Without them,
  // fall back to the whole registered fleet plus TR_SYNC_REPOS.
  const explicit = (opts.roots || []).filter(Boolean);
  const source = explicit.length
    ? explicit
    : [...listUpdateRoots(opts).map((row) => (typeof row === 'string' ? row : row.root)), ...rootsFromEnv()];
  const seen = new Set();
  const out = [];
  for (const root of source) {
    if (!root) continue;
    const resolved = path.resolve(root);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    out.push(resolved);
  }
  return out;
}

/** Read the version a consumer actually resolves for a package (declared + installed). */
export function consumerState(root, pkg, version = null) {
  const declaredFiles = [];
  const pkgFile = path.join(root, 'package.json');
  let declared = null;
  if (fs.existsSync(pkgFile)) {
    try {
      const j = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
      const all = { ...(j.dependencies || {}), ...(j.devDependencies || {}), ...(j.optionalDependencies || {}) };
      declared = all[pkg] ?? null;
      if (declared) declaredFiles.push(pkgFile);
    } catch {
      /* unreadable package.json is reported as unknown, not as satisfied */
    }
  }
  if (!declared) return { root, declared: null, installed: null, satisfied: false, reason: 'not-declared' };

  // Resolve the version a spec pins. Handles plain versions ("0.14.4"),
  // npm: aliases ("npm:@scope/pkg@0.14.4") and ranges. A range is satisfied by
  // the installed version rather than by string equality.
  const spec = String(declared).trim();
  let want = null;
  let range = false;
  if (spec.startsWith('npm:')) {
    const afterAt = spec.slice(4);
    const idx = afterAt.lastIndexOf('@');
    want = idx > 0 ? afterAt.slice(idx + 1) : null;
  } else if (/^[~^]|^[<>]=?|\|\||\s-\s|\*|x$/i.test(spec)) {
    range = true;
  } else {
    want = spec;
  }

  const installedCandidates = [
    path.join(root, 'node_modules', pkg, 'package.json'),
    // npm: aliases install under the alias directory, which is what .bin shims run.
    ...aliasDirs(root, pkg),
  ];
  let installed = null;
  for (const file of installedCandidates) {
    if (!fs.existsSync(file)) continue;
    try {
      installed = JSON.parse(fs.readFileSync(file, 'utf8')).version ?? null;
      if (installed) break;
    } catch {
      /* keep looking */
    }
  }
  const satisfied = range ? Boolean(installed) && installed === version : Boolean(want && installed === want);
  return {
    root,
    declared,
    want,
    range,
    installed,
    satisfied,
    reason: !installed ? 'not-installed' : satisfied ? 'ok' : 'installed-mismatch',
  };
}

/** Alias install dirs for a package, e.g. @ssss/cli -> node_modules/@ssss/cli. */
function aliasDirs(root, pkg) {
  const dirs = [];
  const nm = path.join(root, 'node_modules');
  if (!fs.existsSync(nm)) return dirs;
  // Known alias pair for the SSSS CLI: the alias dir is what .bin/ssss executes.
  if (pkg === '@gregiteen/ssss-cli') {
    dirs.push(path.join(nm, '@ssss', 'cli', 'package.json'));
  }
  return dirs;
}

export function verifyConsumers(pkg, version, opts = {}) {
  const roots = consumerRoots(opts);
  const states = roots.map((root) => consumerState(root, pkg, version));
  const relevant = states.filter((s) => s.declared);
  const failing = relevant.filter((s) => !s.satisfied);
  return {
    pkg,
    version,
    roots_considered: roots.length,
    consumers: relevant.length,
    failing: failing.length,
    failures: failing.map((s) => ({ root: s.root, declared: s.declared, installed: s.installed, reason: s.reason })),
  };
}

function runPrepublish(dir, pkgJson, { exec = spawnSync, timeoutMs } = {}) {
  if (!pkgJson?.scripts?.prepublishOnly) return { ok: true, skipped: true };
  const manager = fs.existsSync(path.join(dir, 'pnpm-lock.yaml')) ? 'pnpm' : 'npm';
  const res = exec(manager, ['run', 'prepublishOnly'], { cwd: dir, encoding: 'utf8', stdio: 'pipe', timeout: timeoutMs });
  return { ok: res.status === 0, skipped: false, output: `${res.stdout || ''}${res.stderr || ''}`.trim() };
}

function doPublish(dir, { otp, exec = spawnSync, timeoutMs } = {}) {
  const args = ['publish'];
  if (otp) args.push('--otp', otp);
  const res = exec('npm', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe', timeout: timeoutMs });
  return { ok: res.status === 0, output: `${res.stdout || ''}${res.stderr || ''}`.trim() };
}

/**
 * @param {string[]} argv full process argv (bin convention)
 */
export async function run(argv = process.argv, deps = {}) {
  const opts = parseArgs(argv.slice(3));
  const log = opts.json ? () => {} : (...a) => console.log(...a);
  const emit = (obj) => { if (opts.json) console.log(JSON.stringify(obj, null, 2)); };

  if (opts.help || !opts.action) {
    printHelp();
    if (!opts.action && !opts.help) process.exitCode = 1;
    return;
  }
  if (!ACTIONS.includes(opts.action)) {
    console.error(`Unknown release action: ${opts.action}. Expected one of: ${ACTIONS.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const report = { action: opts.action, packages: {}, ok: false, steps: [] };
  const fail = (message) => {
    report.error = message;
    report.ok = false;
    if (opts.json) emit(report); else console.error(`\n  ✗ ${message}\n`);
    process.exitCode = 1;
  };

  // propagate and verify act on the whole fleet and need no package argument.
  if (opts.action === 'propagate') {
    const dryRun = !opts.apply;
    log(`\n  Propagating ${DEFAULT_PACKAGES.join(' + ')} across every registered consumer${dryRun ? ' (plan)' : ''}...`);
    const summary = await (deps.updateAllBrains || updateAllBrains)({ dryRun, force: !dryRun, skipThrottle: !dryRun });
    report.steps.push({ step: 'propagate', dryRun, summary });
    report.ok = (summary.failed || 0) === 0;
    if (opts.json) { emit(report); return; }
    log(`\n  roots: ${summary.root_count ?? '—'}  consumers: ${summary.consumer_count ?? '—'}  failed: ${summary.failed ?? 0}`);
    if (dryRun) log('  Run with --apply to install.\n');
    if (!report.ok) process.exitCode = 1;
    return;
  }

  const packages = opts.packages.length ? opts.packages : DEFAULT_PACKAGES;
  if (!packages.length) return fail('No package given.');

  for (const pkg of packages) {
    const root = opts.root || process.cwd();
    const source = readSourcePackage(root, pkg);
    const entry = { pkg, root, source: source?.file ?? null };
    report.packages[pkg] = entry;

    if (opts.action === 'verify') {
      const version = opts.version || source?.pkgJson?.version;
      if (!version) return fail(`${pkg}: no --version and no source package.json found under ${root}`);
      entry.version = version;
      const reg = await awaitPublished(pkg, version, { attempts: 1, delayMs: 0 });
      entry.registry = reg;
      const consumers = verifyConsumers(pkg, version, { roots: opts.root ? [opts.root] : [] });
      entry.consumers = consumers;
      if (!reg.ok) return fail(`${pkg}@${version} is not readable from the npm registry (${reg.error}).`);
      if (consumers.failing > 0) {
        return fail(`${pkg}@${version}: ${consumers.failing}/${consumers.consumers} consumers not satisfied. First: ${consumers.failures[0].root} (${consumers.failures[0].installed ?? 'not installed'}).`);
      }
      log(`  ✓ ${pkg}@${version} verified: registry + ${consumers.consumers}/${consumers.consumers} consumers`);
      continue;
    }

    if (!source) return fail(`${pkg}: source package.json not found under ${root}. Pass --root <repo>.`);
    const version = opts.version || source.pkgJson.version;
    entry.version = version;
    if (opts.version && source.pkgJson.version !== opts.version) {
      return fail(`${pkg}: source is ${source.pkgJson.version} but --version ${opts.version} was requested. Bump the source first.`);
    }

    if (opts.action === 'plan') {
      const reg = publishedVersion(pkg);
      entry.registry = reg;
      entry.gates = source.pkgJson.scripts?.prepublishOnly ? 'present' : 'absent';
      entry.alreadyPublished = reg.ok && reg.version === version;
      log(`  ${pkg}: source ${version}, registry ${reg.version ?? '—'}${entry.alreadyPublished ? ' (already published)' : ''}, prepublish gate ${entry.gates}`);
      continue;
    }

    if (opts.action === 'publish' || opts.action === 'all') {
      const reg = publishedVersion(pkg);
      entry.registry_before = reg;
      if (reg.ok && reg.version === version) {
        log(`  · ${pkg}@${version} already published — skipping publish`);
        entry.published = 'already';
      } else {
        if (!opts.apply) return fail(`publish requires --apply (would publish ${pkg}@${version}).`);
        const gate = runPrepublish(source.dir, source.pkgJson, { timeoutMs: opts.timeoutMs });
        entry.gate = gate.ok ? 'passed' : 'failed';
        report.steps.push({ step: 'prepublish', pkg, ok: gate.ok, skipped: gate.skipped });
        if (!gate.ok) return fail(`${pkg}: prepublishOnly gate failed.\n${gate.output}`);
        const pub = doPublish(source.dir, { otp: opts.otp, timeoutMs: opts.timeoutMs });
        entry.publish_output = pub.output;
        if (!pub.ok) return fail(`${pkg}: npm publish failed.\n${pub.output}`);
        const confirmed = await (deps.awaitPublished || awaitPublished)(pkg, version, deps);
        entry.registry_after = confirmed;
        if (!confirmed.ok) return fail(`${pkg}@${version} published but the registry still reports ${confirmed.version}. Treat as NOT released.`);
        entry.published = 'yes';
        log(`  ✓ ${pkg}@${version} published and confirmed on the registry`);
      }
      if (opts.action === 'publish') continue;
    }

    if (opts.action === 'all') {
      const dryRun = !opts.apply;
      const summary = await (deps.updateAllBrains || updateAllBrains)({ dryRun, force: !dryRun, skipThrottle: !dryRun });
      report.steps.push({ step: 'propagate', pkg, summary });
      if ((summary.failed || 0) > 0) return fail(`${pkg}: propagation reported ${summary.failed} failure(s).`);
      const consumers = verifyConsumers(pkg, version, {});
      entry.consumers = consumers;
      if (consumers.failing > 0) {
        return fail(`${pkg}@${version}: ${consumers.failing}/${consumers.consumers} consumers still not satisfied after propagation.`);
      }
      log(`  ✓ ${pkg}@${version}: registry + ${consumers.consumers}/${consumers.consumers} consumers`);
    }
  }

  report.ok = true;
  if (opts.json) emit(report);
  else if (opts.action === 'plan') log('\n  Plan only — nothing published or changed.\n');
  else log('');
}
