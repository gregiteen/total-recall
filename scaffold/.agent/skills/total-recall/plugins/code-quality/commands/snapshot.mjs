/**
 * total-recall code-quality snapshot (--node <name> | --host <user@host>) [--port N] [--identity <file>] [--name <dir>] [--install] [--dry-run] [--json]
 *
 * Put the exact source under test on the sanctioned test node. The file list
 * comes from git (tracked plus untracked files git does not ignore) in this
 * repository and in the real repository behind each linked plugin, so ignored
 * private state such as .env, the brain folder and node_modules never leaves
 * the machine. A second deny list stops the snapshot if a secret-looking file
 * is tracked anyway. A SHA-256 manifest is written beside the source so the
 * node can prove which source it tested.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const PLUGINS_REL = path.join('.agent', 'skills', 'total-recall', 'plugins');

export const DENY = [
  /(^|\/)\.env$/,
  /(^|\/)\.env\.(?!example$)[^/]+$/,
  /(^|\/)tr\.env$/,
  /(^|\/)secrets\.enc$/,
  /\.(pem|key|p12|pfx)$/,
  /(^|\/)id_(rsa|ed25519|ecdsa)(\.pub)?$/,
  /(^|\/)browser-profile\//,
  // The live brain at the repository root; the scaffold's curated seeds under scaffold/.agent ship on purpose.
  /^\.agent\/skills\/total-recall\/(config|logs|memory-[^/]+|plugin-state)\//,
];

export function isDenied(rel) {
  const unix = rel.split(path.sep).join('/');
  return DENY.some((re) => re.test(unix));
}

/** Files git would ship from one repository: tracked and untracked-not-ignored, present on disk. */
export function listRepoFiles(repoDir, run = spawnSync) {
  let r;
  // EAGAIN means the machine is briefly out of processes, not that the repository is unreadable.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    r = run('git', ['-C', repoDir, 'ls-files', '-co', '--exclude-standard', '-z'], { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 });
    if (r.error?.code !== 'EAGAIN') break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200 * (attempt + 1));
  }
  if (r.error || r.status !== 0) throw new Error(`${repoDir} is not a readable git repository: ${(r.stderr || '').toString().trim() || r.error?.message}`);
  return r.stdout.toString('utf8').split('\0').filter(Boolean)
    .filter((rel) => { try { return fs.lstatSync(path.join(repoDir, rel)).isFile(); } catch { return false; } });
}

/**
 * Files the npm package ships. They are public by definition, and some (such as a
 * bundled scaffold) are git-ignored, so the git list alone misses them.
 */
export function listPackageFiles(root, run = spawnSync) {
  if (!fs.existsSync(path.join(root, 'package.json'))) return [];
  const r = run('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw new Error(`npm pack --dry-run failed in ${root}: ${(r.stderr || '').trim().split('\n').pop() || r.error?.message}`);
  const text = String(r.stdout || '');
  const parsed = JSON.parse(text.slice(text.indexOf('[')));
  return (parsed[0]?.files || []).map((f) => f.path.split('/').join(path.sep))
    .filter((rel) => { try { return fs.lstatSync(path.join(root, rel)).isFile(); } catch { return false; } });
}

/** Every file to copy, as { src, rel }. Linked plugins contribute their own repository's files. */
export function buildSnapshot(root, { run = spawnSync, includePackage = true } = {}) {
  const own = new Set(listRepoFiles(root, run));
  if (includePackage) for (const rel of listPackageFiles(root, run)) own.add(rel);
  const entries = [...own].sort()
    .filter((rel) => !rel.startsWith(PLUGINS_REL + path.sep) && !rel.split(path.sep).includes('node_modules'))
    .map((rel) => ({ src: path.join(root, rel), rel }));
  const warnings = [];
  // The gate list is repo state that git ignores; the test node needs it to run the same gates.
  const gateConfig = path.join('.agent', 'skills', 'code-quality', 'config.json');
  if (fs.existsSync(path.join(root, gateConfig))) entries.push({ src: path.join(root, gateConfig), rel: gateConfig });
  const pluginsDir = path.join(root, PLUGINS_REL);
  if (fs.existsSync(pluginsDir)) {
    for (const name of fs.readdirSync(pluginsDir).sort()) {
      if (name.startsWith('.')) continue;
      const linkPath = path.join(pluginsDir, name);
      let real;
      try { real = fs.realpathSync(linkPath); } catch { warnings.push(`${name}: link target is missing; skipped`); continue; }
      if (!fs.existsSync(path.join(real, '.git'))) { warnings.push(`${name}: not a git repository; skipped rather than guessing which files are safe`); continue; }
      for (const rel of listRepoFiles(real, run)) entries.push({ src: path.join(real, rel), rel: path.join(PLUGINS_REL, name, rel) });
    }
  }
  const denied = entries.filter((e) => isDenied(e.rel)).map((e) => e.rel);
  return { entries, denied, warnings };
}

export function manifestOf(entries) {
  return entries
    .map((e) => `${crypto.createHash('sha256').update(fs.readFileSync(e.src)).digest('hex')}  ${e.rel.split(path.sep).join('/')}`)
    .sort((a, b) => (a.slice(66) < b.slice(66) ? -1 : 1))
    .join('\n') + '\n';
}

function flag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

/** Resolve the node through Total Recall's recorded mesh access, never a guessed login. */
export function resolveTarget(args, run = spawnSync) {
  const host = flag(args, '--host');
  if (host) {
    if (!/^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$/.test(host)) throw new Error('--host must be user@host');
    const [user, h] = host.split('@');
    return { user, host: h, port: Number(flag(args, '--port') || 22), identity: flag(args, '--identity') || null };
  }
  const node = flag(args, '--node');
  if (!node) throw new Error('snapshot needs --node <name> (recorded mesh access) or --host <user@host>');
  const r = run('total-recall', ['mesh', 'access', node], { encoding: 'utf8' });
  const text = String(r.stdout || '');
  const start = text.indexOf('{\n');
  let access = null;
  try { access = JSON.parse(text.slice(start, text.lastIndexOf('}') + 1)); } catch { /* reported below */ }
  if (r.status !== 0 || !access?.user || !access?.host) throw new Error(`No recorded mesh access for ${node}; record it with: total-recall mesh access ${node} --user <login>`);
  return { user: access.user, host: access.host, port: Number(access.port || 22), identity: access.identity_file || null };
}

export default function snapshot(args = [], { root = process.cwd(), run = spawnSync } = {}) {
  const repoRoot = String(run('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout || '').trim() || root;
  const name = flag(args, '--name') || `${path.basename(repoRoot)}-${new Date().toISOString().slice(0, 10)}`;
  if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error('--name may contain letters, digits, dot, dash and underscore only');
  const { entries, denied, warnings } = buildSnapshot(repoRoot, { run });
  if (denied.length) throw new Error(`Refusing to snapshot: secret-looking files are tracked or not ignored:\n  ${denied.join('\n  ')}`);
  const result = { name, files: entries.length, warnings };
  if (args.includes('--dry-run')) return { ...result, dryRun: true };

  const target = resolveTarget(args, run);
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'cq-snapshot-'));
  try {
    for (const e of entries) {
      const out = path.join(stage, e.rel);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.copyFileSync(e.src, out);
      const sourceStat = fs.statSync(e.src);
      fs.chmodSync(out, sourceStat.mode & 0o777);
      // Freshness gates compare source and bundle times. Copying in path order
      // must not make a current bundle appear older than its sources.
      fs.utimesSync(out, sourceStat.atime, sourceStat.mtime);
    }
    const manifest = manifestOf(entries);
    fs.writeFileSync(path.join(stage, 'source.sha256'), manifest);
    const ssh = ['ssh', '-o', 'BatchMode=yes', '-p', String(target.port), ...(target.identity ? ['-i', target.identity] : [])].join(' ');
    const dest = `tr-checks/${name}/`;
    const mk = run('ssh', ['-o', 'BatchMode=yes', '-p', String(target.port), ...(target.identity ? ['-i', target.identity] : []), `${target.user}@${target.host}`, `mkdir -p ${dest}`], { encoding: 'utf8' });
    if (mk.status !== 0) throw new Error(`Could not prepare ${dest} on ${target.host}: ${(mk.stderr || '').trim()}`);
    // --delete keeps the node copy identical to the source list; node_modules installed there are preserved.
    const rs = run('rsync', ['-a', '--delete', '--exclude', 'node_modules', '-e', ssh, `${stage}/`, `${target.user}@${target.host}:${dest}`], { encoding: 'utf8' });
    if (rs.status !== 0) throw new Error(`rsync to ${target.host} failed: ${(rs.stderr || '').trim()}`);
    if (args.includes('--install')) {
      // The snapshot carries source only; the gates need the dependencies installed beside it.
      const inst = run('ssh', ['-o', 'BatchMode=yes', '-p', String(target.port), ...(target.identity ? ['-i', target.identity] : []), `${target.user}@${target.host}`, `export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH; cd ${dest} && npm ci --include=dev --no-audit --no-fund`], { encoding: 'utf8' });
      if (inst.status !== 0) throw new Error(`npm ci on ${target.host} failed: ${(inst.stderr || inst.stdout || '').trim().slice(-400)}`);
      result.installed = true;
    }
    return { ...result, node: `${target.user}@${target.host}`, dest: `~/${dest}`, manifestSha256: crypto.createHash('sha256').update(manifest).digest('hex') };
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}
