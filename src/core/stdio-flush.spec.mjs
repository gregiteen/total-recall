import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Regression: `total-recall auth secret list --json | python3 -c 'json.load…'` failed
// on macOS with an unterminated string. The host wrote the plugin's output and called
// process.exit() in the same tick; a pipe takes 64 KiB at once and the rest was lost,
// with exit status 0. A file redirect hid it, because file writes are synchronous.
// These go through a real shell pipe: spawn's own 'pipe' stdio is a socket pair.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BIN = path.join(ROOT, 'bin', 'total-recall.mjs');
const FLUSH = path.join(ROOT, 'src', 'core', 'stdio-flush.mjs');
const SIZE = 438 * 1024;
const quote = (value) => `'${String(value).replaceAll("'", `'\\''`)}'`;

function throughPipe(command, { cwd, env = {}, reader = 'cat' } = {}) {
  return spawnSync('sh', ['-c', `${command} | ${reader}`], {
    cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env: { ...process.env, ...env },
  });
}

describe('stdout survives process exit through a pipe', () => {
  let root;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-stdio-flush-'));
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function installPlugin(project, source) {
    const dir = path.join(project, '.agent', 'skills', 'total-recall', 'plugins', 'bulk');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'cli.mjs'), source);
    fs.mkdirSync(path.join(dir, 'ui'));
    fs.writeFileSync(path.join(dir, 'ui', 'card.js'), 'export {};\n');
    fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({
      id: 'bulk', name: 'Bulk', version: '1.0.0', description: 'Prints a large report.',
      ui: { elements: [{ id: 'card', kind: 'card', tag: 'tr-bulk-card', module: 'ui/card.js' }] },
      cli: { command: 'bulk', handler: './cli.mjs', subcommands: [{ name: 'report', description: 'Print' }] },
    }));
  }

  it('a plugin command piped from the host CLI arrives whole and parses', () => {
    const project = path.join(root, 'host');
    installPlugin(project, `export async function run() { console.log(JSON.stringify({ keys: 'x'.repeat(${SIZE}) })); }`);
    const r = throughPipe(`${quote(process.execPath)} ${quote(BIN)} bulk report`, { cwd: project, env: { AGENT_DIR: path.join(root, 'agent') } });
    expect(r.stderr).not.toContain('Unknown command');
    expect(JSON.parse(r.stdout).keys.length).toBe(SIZE);
  }, 60_000);

  it('a plugin that exits non-zero keeps its output and its exit status', () => {
    const project = path.join(root, 'failing');
    installPlugin(project, `export async function run() { console.log(JSON.stringify({ keys: 'x'.repeat(${SIZE}) })); process.exitCode = 3; }`);
    const r = throughPipe(`{ ${quote(process.execPath)} ${quote(BIN)} bulk report; echo "status=$?" >&2; }`, { cwd: project, env: { AGENT_DIR: path.join(root, 'agent') } });
    expect(JSON.parse(r.stdout).keys.length).toBe(SIZE);
    expect(r.stderr).toContain('status=3');
  }, 60_000);

  function script(name, body) {
    const file = path.join(root, name);
    fs.writeFileSync(file, `import { exitAfterFlush } from ${JSON.stringify(FLUSH)};\n${body}\n`);
    return `${quote(process.execPath)} ${quote(file)}`;
  }

  it('exitAfterFlush delivers everything, stops the caller and sets the status', () => {
    const cmd = script('whole.mjs', `process.stdout.write('x'.repeat(${SIZE}));\nawait exitAfterFlush(7);\nconsole.log('unreachable');`);
    const r = spawnSync('sh', ['-c', `{ ${cmd}; echo "status=$?" >&2; } | cat`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    expect(r.stdout.length).toBe(SIZE);
    expect(r.stderr).toContain('status=7');
  });

  it('exitAfterFlush still exits when a held-open handle would keep the process alive', () => {
    const cmd = script('handle.mjs', `setInterval(() => {}, 1000);\nprocess.stdout.write('x'.repeat(${SIZE}));\nawait exitAfterFlush(0);`);
    const r = spawnSync('sh', ['-c', `${cmd} | cat`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 20_000 });
    expect(r.error).toBeUndefined();
    expect(r.stdout.length).toBe(SIZE);
  });

  it('exitAfterFlush exits cleanly when the reader goes away early', () => {
    const cmd = script('closed.mjs', `process.stdout.write('x'.repeat(${SIZE}));\nawait exitAfterFlush(0);`);
    const r = spawnSync('sh', ['-c', `{ ${cmd}; echo "status=$?" >&2; } | head -c 10`], { encoding: 'utf8', timeout: 20_000 });
    expect(r.error).toBeUndefined();
    expect(r.stdout.length).toBe(10);
    expect(r.stderr).toContain('status=0');
    expect(r.stderr).not.toContain('EPIPE');
  });
});
