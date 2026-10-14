/** `mesh server init|update|status` — the developer's own Headscale control server. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { meshTargetOf, provisionHeadscale, updateHeadscale, updateConsole, sshExec } from '../core/headscale-server.mjs';
import { saveCredential } from '../core/credentials.mjs';
import { brainDir } from '../core/config.mjs';
import { PluginStateStore } from '../ssss-store.mjs';

const TARGET_FILE = 'mesh-server.json';

function flag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export function targetFromArgs(args) {
  const host = flag(args, '--host');
  const target = meshTargetOf({
    name: flag(args, '--name') || host,
    ssh: { host, user: flag(args, '--user') || 'root', port: flag(args, '--port') },
    domain: flag(args, '--domain')
  });
  if (!target) throw new Error('server needs --host, --domain and optionally --user, --port: a valid SSH host and a public domain pointing at it');
  return target;
}

function targetPath(dir) {
  return path.join(dir, TARGET_FILE);
}

export function saveTarget(target, dir = brainDir) {
  if (!meshTargetOf({ name: target?.name, ssh: { host: target?.host, user: target?.user, port: target?.port }, domain: target?.domain })) throw new Error('Invalid mesh server target');
  const store = new PluginStateStore(path.resolve(targetPath(dir)), 'mesh');
  store.read(null); store.write(target);
}

export function loadTarget(dir = brainDir) {
  const file = targetPath(dir);
  const saved = new PluginStateStore(path.resolve(file), 'mesh').read(null);
  if (!saved) return null;
  const target = meshTargetOf({ name: saved.name, ssh: { host: saved.host, user: saved.user, port: saved.port }, domain: saved.domain });
  if (!target) throw new Error('Invalid stored mesh server target');
  return target;
}

/** Join this machine to the new mesh when the Tailscale client is present. */
export function enrollThisMachine(controlUrl, preAuthKey, run = spawnSync) {
  const has = run('tailscale', ['version'], { encoding: 'utf8' });
  if (has.error || has.status !== 0) return { enrolled: false, reason: 'The Tailscale client is not installed on this machine' };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mesh-key-'));
  const keyFile = path.join(dir, 'key');
  try {
    fs.writeFileSync(keyFile, preAuthKey, { mode: 0o600 });
    const r = run('tailscale', ['up', '--login-server', controlUrl, `--authkey=file:${keyFile}`], { encoding: 'utf8' });
    return r.status === 0 ? { enrolled: true } : { enrolled: false, reason: (r.stderr || 'tailscale up failed').trim().split('\n').pop() };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Put a login key on the clipboard instead of the terminal. */
export function copyToClipboard(text, run = spawnSync) {
  for (const [cmd, args] of [['pbcopy', []], ['wl-copy', []], ['xclip', ['-selection', 'clipboard']]]) {
    const r = run(cmd, args, { input: text });
    if (!r.error && r.status === 0) return true;
  }
  return false;
}

export default async function server(args = [], deps = {}) {
  const sub = args[0];
  const dir = deps.dir || brainDir;
  const log = (step) => console.error(`  mesh server: ${step}`);
  if (sub === 'init') {
    const target = targetFromArgs(args);
    const r = await (deps.provision || provisionHeadscale)(target, { email: flag(args, '--email') || '', log });
    await (deps.save || saveCredential)({ key: 'HEADSCALE_API_KEY', value: r.apiKey, configuration: { controlUrl: r.controlUrl } });
    saveTarget(target, dir);
    const joined = (deps.enroll || enrollThisMachine)(r.controlUrl, r.preAuthKey);
    console.log(JSON.stringify({ controlUrl: r.controlUrl, version: r.version, user: r.user, apiKeySaved: true, thisMachine: joined, console: r.consoleError ? { installed: false, error: r.consoleError } : { installed: true, version: r.consoleVersion, image: r.consoleImage } }));
    return;
  }
  if (sub === 'update') {
    const target = args.includes('--host') ? targetFromArgs(args) : loadTarget(dir);
    if (!target) {
      if (args.includes('--if-provisioned')) return;
      throw new Error('No provisioned control server recorded; run `mesh server init` first');
    }
    const r = await (deps.update || updateHeadscale)(target, { checkOnly: args.includes('--check'), log });
    let consoleResult = null;
    if (!args.includes('--check')) {
      try { consoleResult = await (deps.updateConsole || updateConsole)(target, { log }); } catch (err) { consoleResult = { consoleUpdated: false, error: err.message }; }
    }
    console.log(JSON.stringify({ ...r, console: consoleResult }));
    return;
  }
  if (sub === 'console') {
    const target = loadTarget(dir);
    if (!target) throw new Error('No provisioned control server recorded; run `mesh server init` first');
    const localPort = Number(flag(args, '--local-port') || 3000);
    if (!Number.isInteger(localPort) || localPort < 1024 || localPort > 65535) throw new Error('--local-port must be 1024-65535');
    const exec = deps.exec || sshExec(target);
    const key = await exec('headscale apikeys create --expiration 1d');
    if (key.code !== 0) throw new Error(`Could not create a console login key: ${(key.stderr || '').trim().split('\n').pop()}`);
    const copied = (deps.copy || copyToClipboard)(key.stdout.trim().split('\n').pop());
    console.log(JSON.stringify({ url: `http://localhost:${localPort}/admin`, loginKey: copied ? 'copied to clipboard, valid 1 day' : 'no clipboard on this machine; the key was not shown. Create one on the server with: headscale apikeys create --expiration 1d', tunnel: `${target.user}@${target.host}` }));
    if (deps.tunnel) return deps.tunnel(target, localPort);
    const t = spawnSync('ssh', ['-N', '-o', 'ExitOnForwardFailure=yes', '-p', String(target.port), '-L', `${localPort}:127.0.0.1:3000`, `${target.user}@${target.host}`], { stdio: 'inherit' });
    if (t.status !== 0 && t.signal !== 'SIGINT') throw new Error(`SSH tunnel exited ${t.status}`);
    return;
  }
  if (sub === 'status') {
    const target = loadTarget(dir);
    console.log(JSON.stringify(target ? { provisioned: true, domain: target.domain, host: target.host } : { provisioned: false }));
    return;
  }
  throw new Error('server <init --host H --domain D [--user U] [--port P] [--email E] | update [--check] [--if-provisioned] | console [--local-port N] | status>');
}
