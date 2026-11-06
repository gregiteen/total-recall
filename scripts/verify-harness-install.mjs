#!/usr/bin/env node
/**
 * Proves a fresh install sets up every harness and that installing never damages a vault. It packs
 * this package, installs the tarball into a temporary folder, runs `init` on an empty home with
 * each harness's command present, and checks through the installed gate that a hook is in place
 * and answers. It then adds memories, edits a seeded one, runs every install path again, and
 * compares every vault file byte for byte. Nothing outside the temporary folder is touched.
 *
 * Usage: node scripts/verify-harness-install.mjs [--tarball <file>] [--keep]
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1]; };
const keep = args.includes('--keep');

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tr-harness-install-')));
const home = path.join(root, 'home');
const prefix = path.join(root, 'prefix');
const fakeBin = path.join(root, 'bin');
const project = path.join(root, 'project');
for (const dir of [home, prefix, fakeBin, project]) fs.mkdirSync(dir, { recursive: true });

// Only what a fresh machine would have: no inherited Total Recall state, keys or harness homes.
const env = {
  HOME: home,
  TMPDIR: path.join(root, 'tmp'),
  PATH: [path.join(prefix, 'bin'), fakeBin, path.dirname(process.execPath), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(path.delimiter),
  npm_config_cache: process.env.npm_config_cache || path.join(os.homedir(), '.npm'),
  npm_config_audit: 'false',
  npm_config_fund: 'false',
};
fs.mkdirSync(env.TMPDIR, { recursive: true });

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) failures.push(name);
};
function run(command, argv, options = {}) {
  const result = spawnSync(command, argv, { encoding: 'utf8', env, maxBuffer: 256 * 1024 * 1024, timeout: 600000, ...options });
  return { code: result.status, out: result.stdout || '', err: result.stderr || '' };
}

/** A stand-in for each harness's command. The installer only needs to find it. */
function fakeHarnesses() {
  for (const name of ['claude', 'codex', 'agy', 'hermes', 'pi', 'cursor-agent', 'devin', 'grok']) {
    fs.writeFileSync(path.join(fakeBin, name), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  }
  // dsh is laid out like its command-line install, with the hook bridge inside.
  const dsh = path.join(root, 'dsh-install', '@deepseek-ai', 'dsh');
  const bridge = path.join(dsh, 'node_modules', '@deepseek-ai', 'dsh-hooks-claude-code', 'lib', 'index.js');
  fs.mkdirSync(path.dirname(bridge), { recursive: true });
  fs.writeFileSync(bridge, '');
  fs.mkdirSync(path.join(dsh, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(dsh, 'lib', 'bin.js'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  fs.symlinkSync(path.join(dsh, 'lib', 'bin.js'), path.join(fakeBin, 'dsh'));
}

/** Every file in a folder and the hash of its bytes. */
function snapshot(dir, base = dir, into = new Map()) {
  if (!fs.existsSync(dir)) return into;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) snapshot(file, base, into);
    else if (entry.isFile()) into.set(path.relative(base, file), crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
  }
  return into;
}

/** Runs every install path over existing vaults. A changed or missing vault file fails the check. */
function verifyVaultsSurvive(bin) {
  const vaults = {
    machine: path.join(home, '.agent', 'skills', 'total-recall', 'memory-vault'),
    project: path.join(project, '.agent', 'skills', 'total-recall', 'memory-vault'),
  };
  const projectInit = run(bin, ['init', '--project', '--yes'], { cwd: project });
  check('project init finished', projectInit.code === 0, projectInit.code === 0 ? '' : (projectInit.err || projectInit.out).trim().split('\n').slice(-3).join(' | '));

  // Real memories, written the supported way, and a seeded rule the owner has edited.
  const stored = run(bin, ['remember', 'fact', 'Vault survival check: the owner wrote this machine memory.', '--global'], { cwd: project });
  check('machine memory stored', stored.code === 0);
  const storedProject = run(bin, ['remember', 'fact', 'Vault survival check: the owner wrote this project memory.', '--project'], { cwd: project });
  check('project memory stored', storedProject.code === 0);
  const seeded = path.join(vaults.machine, 'invariants', 'operating-instructions.md');
  check('a seeded rule exists to edit', fs.existsSync(seeded));
  if (fs.existsSync(seeded)) fs.appendFileSync(seeded, '\nThe owner edited this rule.\n');
  const seededProject = path.join(vaults.project, 'invariants', 'operating-instructions.md');
  if (fs.existsSync(seededProject)) fs.appendFileSync(seededProject, '\nThe owner edited this project rule.\n');
  fs.mkdirSync(path.join(vaults.machine, 'owner-notes'), { recursive: true });
  fs.writeFileSync(path.join(vaults.machine, 'owner-notes', 'not-a-standard-folder.md'), 'Nothing should touch this.\n');

  const paths = [
    ['init again', ['init', '--yes']],
    ['project init again', ['init', '--project', '--yes']],
    ['init --force', ['init', '--yes', '--force']],
    ['project init --force', ['init', '--project', '--yes', '--force']],
    ['hook install', ['preflight', 'install', '--all']],
    ['update', ['update', '--all-brains', '--apply']],
  ];
  for (const [label, argv] of paths) {
    const before = Object.fromEntries(Object.entries(vaults).map(([name, dir]) => [name, snapshot(dir)]));
    const done = run(bin, argv, { cwd: project });
    if (done.code !== 0) console.log(`  note: ${label} exited ${done.code}: ${(done.err || done.out).trim().split('\n').slice(-2).join(' | ').slice(0, 200)}`);
    for (const [name, dir] of Object.entries(vaults)) {
      const after = snapshot(dir);
      const changed = [...before[name]].filter(([file, hash]) => after.get(file) !== hash).map(([file]) => file);
      const added = [...after.keys()].filter((file) => !before[name].has(file));
      check(`${label} leaves the ${name} vault intact`, changed.length === 0, changed.length ? `changed or removed: ${changed.slice(0, 5).join(', ')}` : `${after.size} files${added.length ? `, ${added.length} added` : ''}`);
    }
  }
  check('the edited rule kept its edit', !fs.existsSync(seeded) || fs.readFileSync(seeded, 'utf8').includes('The owner edited this rule.'));
}

let exitCode = 1;
try {
  let tarball = flag('--tarball');
  if (!tarball) {
    const packed = run('npm', ['pack', '--silent', '--pack-destination', root, '--ignore-scripts'], { cwd: repo });
    if (packed.code !== 0) throw new Error(`npm pack failed: ${packed.err.trim().split('\n').slice(-3).join(' | ')}`);
    tarball = path.join(root, packed.out.trim().split('\n').pop());
  }
  console.log(`Installing ${path.basename(tarball)} into a temporary folder`);
  const installed = run('npm', ['install', '-g', '--prefix', prefix, tarball]);
  if (installed.code !== 0) throw new Error(`npm install failed: ${installed.err.trim().split('\n').slice(-5).join(' | ')}`);

  fakeHarnesses();
  const bin = path.join(prefix, 'bin', 'total-recall');
  const init = run(bin, ['init', '--yes'], { cwd: project });
  check('init finished', init.code === 0, init.code === 0 ? '' : (init.err || init.out).trim().split('\n').slice(-4).join(' | '));
  const line = (init.out + init.err).split('\n').find((text) => text.includes('Harness hooks'));
  console.log(`  ${line ? line.trim() : 'init printed no harness hook line'}`);

  const expected = {
    claude: [['.claude', 'settings.json'], 'preflight gate --harness claude'],
    codex: [['.codex', 'hooks.json'], 'preflight gate --harness codex'],
    agy: [['.gemini', 'config', 'hooks.json'], 'preflight gate --harness agy'],
    dsh: [['.dsh', 'hooks', 'hooks.json'], 'preflight gate --harness dsh'],
    hermes: [['.hermes', 'config.yaml'], 'preflight gate --harness hermes'],
    pi: [['.pi', 'agent', 'extensions', 'total-recall-preflight.ts'], 'preflight'],
    cursor: [['.cursor', 'hooks.json'], 'preflight gate --harness cursor'],
    devin: [['.config', 'devin', 'config.json'], 'preflight gate --harness devin'],
    grok: [['.grok', 'hooks', 'total-recall-preflight.json'], 'preflight gate --harness grok'],
  };
  for (const [harness, [parts, text]] of Object.entries(expected)) {
    const file = path.join(home, ...parts);
    const found = fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(text);
    check(`${harness} hook installed by init`, found, found ? '' : `nothing in ${parts.join('/')}`);
  }
  const patch = path.join(home, '.dsh', 'cordis.patch.yml');
  check('dsh hook bridge mounted', fs.existsSync(patch) && fs.readFileSync(patch, 'utf8').includes('dsh-hooks-claude-code'));

  const mode = JSON.parse(run(bin, ['preflight', 'mode', '--json'], { cwd: project }).out || '{}');
  check('gate warns by default', mode.router?.mode === 'warn' && (mode.plugins || []).every((row) => row.mode === 'warn'), JSON.stringify(mode.router || null));
  check('harness adapters load from the install', (mode.harnesses || []).length >= 9, `${(mode.harnesses || []).length} adapters`);
  const unwired = (mode.harnesses || []).filter((row) => row.delivery === undefined);
  check('every adapter reports whether it can warn', unwired.length === 0);

  const coverage = JSON.parse(run(bin, ['preflight', 'coverage', '--json'], { cwd: project }).out || '{}');
  const gaps = (coverage.plugins || []).filter((row) => row.missing.length).map((row) => `${row.plugin}: ${row.missing.join(', ')}`);
  check('every bundled plugin says what work belongs to it', coverage.ok === true, gaps.length ? gaps.join(' | ') : `${coverage.declared} plugins`);

  // Asking for help does no work, even on the command that removes everything.
  const uninstallHelp = run(bin, ['uninstall', '--help'], { cwd: project });
  check('uninstall --help prints help', uninstallHelp.code === 0 && uninstallHelp.out.includes('--purge'));
  check('uninstall --help removes nothing', fs.existsSync(path.join(home, '.agent', 'skills', 'total-recall', 'plugins', 'auth', 'plugin.json')));
  const typo = run(bin, ['uninstall', '--hlep'], { cwd: project });
  check('uninstall refuses a mistyped option', typo.code !== 0 && fs.existsSync(path.join(home, '.agent', 'skills', 'total-recall', 'plugins', 'auth', 'plugin.json')));

  // A plugin that answers for itself still gives its full help from a fresh install.
  const secretHelp = run(bin, ['auth', 'secret', '--help'], { cwd: project });
  check('auth secret --help lists its commands', secretHelp.code === 0 && secretHelp.out.includes('rotate'));

  // The installed gate answers in each harness's own shape: no receipt, so a real write is refused.
  const denied = {
    claude: { tool_name: 'Write', tool_input: { file_path: 'a' }, hook_event_name: 'PreToolUse' },
    codex: { tool_name: 'Bash', tool_input: { command: 'touch a' }, hook_event_name: 'PreToolUse' },
    agy: { toolCall: { name: 'run_command', args: { CommandLine: 'touch a' } } },
    dsh: { tool_name: 'bash', tool_input: { command: 'touch a' }, hook_event_name: 'PreToolUse', tool_use_id: 'x' },
    hermes: { tool_name: 'terminal', tool_input: { command: 'touch a' }, hook_event_name: 'pre_tool_call' },
    pi: { event: 'tool_call', toolName: 'bash', input: { command: 'touch a' } },
    cursor: { tool_name: 'Shell', tool_input: { command: 'touch a' }, hook_event_name: 'preToolUse' },
    devin: { tool_name: 'exec', tool_input: { command: 'touch a' }, hook_event_name: 'PreToolUse' },
    grok: { toolName: 'Bash', toolInput: { command: 'touch a' }, hookEventName: 'PreToolUse' },
    openclaw: { event: 'before_tool_call', toolName: 'exec', params: { command: 'touch a' } },
  };
  const bare = path.join(root, 'bare');
  fs.mkdirSync(bare);
  for (const [harness, payload] of Object.entries(denied)) {
    const answer = run(bin, ['preflight', 'gate', '--harness', harness], { cwd: bare, input: JSON.stringify({ cwd: bare, ...payload }) });
    check(`${harness} gate refuses work with no receipt`, answer.code === 2, answer.code === 2 ? '' : `exit ${answer.code}`);
  }
  verifyVaultsSurvive(bin);

  // Uninstall takes the gate out of every harness, so no fail-closed hook outlives Total Recall.
  // Only that step runs here: the rest of uninstall reaches this machine's crontab and processes.
  const hooksModule = pathToFileURL(path.join(fs.realpathSync(bin), '..', '..', 'src', 'core', 'harness-hooks.mjs')).href;
  const removal = run(process.execPath, ['--input-type=module', '-e', `const { removeHarnessHooks } = await import(${JSON.stringify(hooksModule)}); const result = await removeHarnessHooks({ projectRoot: process.cwd() }); process.exit(result.ok ? 0 : 1);`], { cwd: project });
  check('uninstall can remove every hook', removal.code === 0, removal.code === 0 ? '' : (removal.err || removal.out).trim().split('\n').slice(-3).join(' | '));
  for (const [harness, [parts, text]] of Object.entries(expected)) {
    const file = path.join(home, ...parts);
    const left = fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(text);
    check(`${harness} hook removed for uninstall`, !left, left ? `still in ${parts.join('/')}` : '');
  }
  const unmounted = !fs.existsSync(patch) || !fs.readFileSync(patch, 'utf8').includes('dsh-hooks-claude-code');
  check('dsh hook bridge unmounted', unmounted);
  exitCode = failures.length ? 1 : 0;
} catch (err) {
  console.error(`✖ ${err.message}`);
} finally {
  if (keep) console.log(`Kept ${root}`);
  else fs.rmSync(root, { recursive: true, force: true });
}
console.log(exitCode === 0 ? 'Fresh install sets up every harness, and installing leaves vaults intact.' : `Failed: ${failures.join(', ') || 'see above'}`);
process.exit(exitCode);
