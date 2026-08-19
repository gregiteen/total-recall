#!/usr/bin/env node
/**
 * sync-repo — refresh this brain's skill definitions from the upstream templates.
 *
 * Replaces a stub that printed "Synced and verified skill: <name>", "Merging core
 * invariants non-destructively" and "Sync Completed Successfully!" without
 * fetching, merging or writing anything — while the skill's Core Directive #4
 * told agents to run it to keep skills current. It also probed
 * <agent>/memory-vault, which is not where a brain lives, so on a correct
 * install it aborted with a misleading "run init first".
 *
 * What it actually does now:
 *   - resolves a real template source (env override, installed package,
 *     running-from-source checkout, or a shallow clone of upstream)
 *   - copies skill files, PRESERVING each destination's compiled
 *     "<!-- BEGIN INJECTED MEMORY -->" block, which is per-repo and must not be
 *     overwritten by a template
 *   - never touches memory-vault/ — that is user memory, not a template
 *   - reports the files it really changed, and exits non-zero if it changed nothing
 *     because it could not find a source
 *
 * Usage: node sync-repo.mjs [--dry-run] [--source <dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes('--dry-run');
const srcFlag = process.argv.indexOf('--source');
const SRC_OVERRIDE = srcFlag !== -1 ? process.argv[srcFlag + 1] : process.env.TR_SCAFFOLD_DIR;

const home = os.homedir();
const AGENT_DIR = process.env.AGENT_DIR || path.join(home, '.agent');
// A brain is <agent>/skills/total-recall — memory-vault, config and the rest all
// live INSIDE it. The old code looked for <agent>/memory-vault and never found one.
const BRAIN_DIR = path.join(AGENT_DIR, 'skills', 'total-recall');
const SKILLS_DIR = path.join(AGENT_DIR, 'skills');

const INJECT_START = '<!-- BEGIN INJECTED MEMORY';
const INJECT_END = '<!-- END INJECTED MEMORY -->';

function log(m) { console.log(m); }
function fail(m) { console.error(`❌ ${m}`); process.exit(1); }

/** Locate real template files. Returns { dir, origin } or null. */
function resolveTemplateSource() {
  if (SRC_OVERRIDE) {
    if (!fs.existsSync(SRC_OVERRIDE)) fail(`--source path does not exist: ${SRC_OVERRIDE}`);
    return { dir: SRC_OVERRIDE, origin: `explicit: ${SRC_OVERRIDE}` };
  }
  // Walk up looking for the package root rather than counting '..' segments:
  // this script legitimately runs from two different depths (a brain at
  // <agent>/skills/total-recall/scripts, and the template copy at
  // <repo>/scaffold/.agent/skills/total-recall/scripts). A fixed relative path
  // is right for one and silently wrong for the other — which resolved to the
  // INSTALLED (older) package and would have reverted newer local templates.
  const fromCheckout = (() => {
    let dir = __dirname;
    for (let i = 0; i < 8; i += 1) {
      const pkg = path.join(dir, 'package.json');
      const scaffold = path.join(dir, 'scaffold', '.agent', 'skills');
      if (fs.existsSync(pkg) && fs.existsSync(scaffold)) {
        try {
          if (JSON.parse(fs.readFileSync(pkg, 'utf8')).name === 'total-recall-brain') return scaffold;
        } catch { /* keep walking */ }
      }
      const up = path.dirname(dir);
      if (up === dir) break;
      dir = up;
    }
    return null;
  })();

  const candidates = [
    [fromCheckout, 'source checkout'],
    [path.join(process.cwd(), 'node_modules', 'total-recall-brain', 'scaffold', '.agent', 'skills'), 'installed package'],
    [path.join(home, 'node_modules', 'total-recall-brain', 'scaffold', '.agent', 'skills'), 'installed package (home)'],
  ];
  for (const [dir, origin] of candidates) {
    if (dir && fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return { dir, origin };
  }
  return null;
}

/** Last resort: shallow-clone upstream into a temp dir. */
function cloneUpstream() {
  let upstream = 'https://github.com/gregiteen/total-recall';
  try {
    const cfg = path.join(BRAIN_DIR, 'config', 'brain.json');
    if (fs.existsSync(cfg)) {
      const parsed = JSON.parse(fs.readFileSync(cfg, 'utf8'));
      if (parsed.upstream) upstream = parsed.upstream;
    }
  } catch { /* default */ }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-sync-'));
  log(`🌐 No local templates — shallow-cloning ${upstream}`);
  try {
    execFileSync('git', ['clone', '--depth', '1', '--quiet', upstream, tmp], { stdio: 'pipe' });
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true });
    fail(`could not clone upstream (${err.message.split('\n')[0]}). Pass --source <dir> to sync offline.`);
  }
  const dir = path.join(tmp, 'scaffold', '.agent', 'skills');
  if (!fs.existsSync(dir)) {
    fs.rmSync(tmp, { recursive: true, force: true });
    fail('upstream clone has no scaffold/.agent/skills — cannot sync.');
  }
  return { dir, origin: `clone of ${upstream}`, cleanup: tmp };
}

/** Copy src over dst, carrying dst's compiled injected-memory block across. */
function writePreservingInjectedBlock(srcFile, dstFile) {
  let next = fs.readFileSync(srcFile, 'utf8');
  if (fs.existsSync(dstFile)) {
    const cur = fs.readFileSync(dstFile, 'utf8');
    const s = cur.indexOf(INJECT_START);
    const e = cur.indexOf(INJECT_END);
    if (s !== -1 && e !== -1 && e > s) {
      const block = cur.slice(s, e + INJECT_END.length);
      const ns = next.indexOf(INJECT_START);
      const ne = next.indexOf(INJECT_END);
      next = (ns !== -1 && ne !== -1 && ne > ns)
        ? next.slice(0, ns) + block + next.slice(ne + INJECT_END.length)
        : `${next.replace(/\s*$/, '')}\n\n${block}\n`;
    }
    if (cur === next) return 'identical';
  }
  if (!DRY) {
    fs.mkdirSync(path.dirname(dstFile), { recursive: true });
    fs.writeFileSync(dstFile, next);
  }
  return 'updated';
}

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      // memory-vault is the user's own memory. A template must never overwrite it.
      if (e.name === 'memory-vault' || e.name === 'memory-derived' || e.name === 'sessions') continue;
      if (e.name === '.git' || e.name === 'node_modules') continue;
      out.push(...walk(p));
    } else out.push(p);
  }
  return out;
}

log('🔄 Total Recall — syncing skill definitions from upstream templates');
log(`📂 Brain: ${BRAIN_DIR}`);
if (DRY) log('🔍 DRY RUN — nothing will be written');

if (!fs.existsSync(BRAIN_DIR)) fail(`no brain at ${BRAIN_DIR}. Run "npx total-recall init" first.`);

let source = resolveTemplateSource();
if (!source) source = cloneUpstream();
log(`📦 Template source: ${source.origin}`);

const skills = fs.readdirSync(source.dir, { withFileTypes: true })
  .filter((e) => e.isDirectory()).map((e) => e.name);
if (skills.length === 0) fail(`template source has no skills: ${source.dir}`);

let updated = 0, identical = 0, created = 0;
const touched = [];
for (const skill of skills) {
  const from = path.join(source.dir, skill);
  const to = path.join(SKILLS_DIR, skill);
  const isNew = !fs.existsSync(to);
  for (const f of walk(from)) {
    const rel = path.relative(from, f);
    const res = writePreservingInjectedBlock(f, path.join(to, rel));
    if (res === 'updated') { updated++; touched.push(`${skill}/${rel}`); } else identical++;
  }
  if (isNew) created++;
}

if (source.cleanup) fs.rmSync(source.cleanup, { recursive: true, force: true });

log('');
log(`${DRY ? '🔍' : '✅'} ${updated} file(s) ${DRY ? 'would change' : 'updated'}, ${identical} already current, ${created} new skill(s)`);
for (const t of touched.slice(0, 20)) log(`   ${DRY ? '~' : '↳'} ${t}`);
if (touched.length > 20) log(`   … and ${touched.length - 20} more`);
if (updated === 0) log('   Nothing to do — every skill file already matches the templates.');
log('');
log(DRY ? 'Re-run without --dry-run to apply.' : 'Run "npx total-recall compile" to rebuild the instruction surfaces.');
