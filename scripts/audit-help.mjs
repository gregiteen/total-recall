#!/usr/bin/env node
/**
 * Checks that `--help` does no work, on macOS, in a sandbox that denies network, file writes and
 * other programs. The sandbox matters: a command that ignores the flag does its real work, and
 * these include commands that send messages and spend money.
 *
 * Core answers for most plugins from their manifests. This proves that holds, that every plugin
 * marked `cli.answers_help` really answers from each of its commands, and that built-in commands do.
 *
 * Usage: node scripts/audit-help.mjs [--builtins] [--json]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CLI_COMMANDS } from '../src/core/cli-commands.mjs';
import { discoverPlugins } from '../src/core/plugin-loader.mjs';

if (process.platform !== 'darwin') { console.log('Skipped: this audit uses sandbox-exec, which is macOS only.'); process.exit(0); }
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN = path.join(repo, 'bin', 'total-recall.mjs');
const args = process.argv.slice(2);
const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tr-help-audit-')));
const profile = path.join(work, 'deny.sb');
const execs = [process.execPath, '/usr/bin/security'].map((file) => `(literal "${file}")`).join(' ');
fs.writeFileSync(profile, `(version 1)
(allow default)
(deny network*)
(deny file-write*)
(allow file-write* (regex #"^/dev/") (subpath "${work}"))
(deny process-exec)
(allow process-exec ${execs})
`);

function probe(argv) {
  return new Promise((resolve) => {
    const child = spawn('sandbox-exec', ['-f', profile, process.execPath, BIN, ...argv, '--help'], { cwd: repo, env: { ...process.env, TMPDIR: work }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const take = (chunk) => { if (out.length < 20000) out += chunk; };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve({ code: 'timeout', out }); }, 15000);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out }); });
  });
}

const printedHelp = ({ code, out }) => {
  const text = out.split('\n').filter((line) => !line.startsWith('{"timestamp"')).join('\n').trim().slice(0, 1200);
  return { help: code === 0 && /\busage\b|^commands:|\boptions:|^\s*(npx\s+)?total-recall\s+[\w-]/im.test(text), first: text.split('\n').find(Boolean)?.slice(0, 100) || '' };
};

async function runAll(jobs, workers = 2) {
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: workers }, async () => {
    while (next < jobs.length) { const job = jobs[next++]; results.push({ ...job, ...printedHelp(await probe(job.argv)) }); }
  }));
  return results;
}

const plugins = discoverPlugins(repo).filter((plugin) => plugin.valid && plugin.manifest.cli?.handler);
const jobs = [];
for (const plugin of plugins) {
  const ns = plugin.manifest.cli.command;
  jobs.push({ plugin: plugin.id, verified: plugin.manifest.cli.answers_help === true, argv: [ns] });
  for (const sub of plugin.manifest.cli.subcommands || []) jobs.push({ plugin: plugin.id, verified: plugin.manifest.cli.answers_help === true, argv: [ns, sub.name] });
}
// `help` is the help command, so asking it for help proves nothing.
for (const name of Object.keys(CLI_COMMANDS)) if (name !== 'help') jobs.push({ builtin: name, argv: [name] });

const results = await runAll(args.includes('--builtins') ? jobs.filter((job) => job.builtin) : jobs);
fs.rmSync(work, { recursive: true, force: true });
const failing = results.filter((row) => !row.help && (row.verified || row.builtin || row.plugin));
if (args.includes('--json')) console.log(JSON.stringify({ ok: failing.length === 0, checked: results.length, failing, results }, null, 2));
else {
  console.log(`Checked ${results.length} commands: ${results.length - failing.length} printed help.`);
  for (const row of failing) console.log(`✖ ${row.argv.join(' ')} (exit status unclear or work attempted): ${row.first}`);
}
process.exit(failing.length ? 1 : 0);
