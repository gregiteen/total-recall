/** Read-only observations and explicitly requested local managed startup. No persistent state. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readProcessCommand } from './pid-lock.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const cliEntry = path.join(packageRoot, 'bin/total-recall.mjs');

export function runBounded(binary, args, { cwd = process.cwd(), timeoutMs = 15000, maxBytes = 262144 } = {}) {
  return new Promise(resolve => {
    let child, output = '', size = 0, reason = null, settled = false, timer, escalation;
    const finish = code => { if (settled) return; settled = true; clearTimeout(timer); resolve({ code, output, reason }); };
    const kill = signal => { try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal); else child.kill(signal); } catch {} };
    const stop = why => { if (reason || settled) return; reason = why; kill('SIGTERM'); escalation = setTimeout(() => { kill('SIGKILL'); finish(null); }, 500); };
    try { child = spawn(binary, args, { cwd, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch { reason = 'spawn-failed'; finish(null); return; }
    timer = setTimeout(() => stop('timeout'), timeoutMs);
    child.on('error', () => { reason = 'spawn-failed'; clearTimeout(escalation); finish(null); });
    child.stdout.on('data', chunk => { size += chunk.length; if (size <= maxBytes) output += chunk.toString(); else stop('output-limit'); });
    child.stderr.on('data', chunk => { size += chunk.length; if (size > maxBytes) stop('output-limit'); });
    child.on('close', code => { if (!reason) finish(code); });
  });
}

export async function verifyListener(pid, url, { run = runBounded, cwd = process.cwd() } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  const result = await run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fp'], { cwd, timeoutMs: 5000 });
  return result.code === 0 && !result.reason && result.output.split(/\r?\n/).includes(`p${pid}`);
}

export function processIdentity(pidFile, hint, { alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } }, command = readProcessCommand } = {}) {
  let pid;
  try { pid = Number(fs.readFileSync(pidFile, 'utf8').trim()); } catch { return { status: 'not-started' }; }
  if (!Number.isInteger(pid) || pid <= 0 || !alive(pid)) return { status: 'stopped' };
  const cmd = command(pid);
  if (!cmd) return { status: 'unknown', reason: 'process-identity-unavailable' };
  const script = cmd.trim().match(/^(?:\S*node(?:\s+--[^ ]+)*)\s+(\S+)/)?.[1];
  let matches = false;
  try { matches = Boolean(script) && fs.realpathSync(script) === fs.realpathSync(hint); } catch {}
  return matches ? { status: 'running', pid } : { status: 'conflict', reason: 'foreign-pid' };
}

export function healthVerdict(body) {
  if (!body || typeof body.version !== 'string' || !Number.isFinite(body.uptime_seconds)
      || !Object.hasOwn(body, 'embedding_coverage') || !Object.hasOwn(body, 'daemon') || !body.vfs) {
    return { status: 'unknown', reason: 'unrecognized-health-response' };
  }
  if (body.vfs.exists !== true || body.vfs.skill_exists !== true) return { status: 'degraded', reason: 'vfs-unavailable' };
  if (body.status !== 'healthy') return { status: 'degraded', reason: 'server-reports-degraded' };
  return { status: 'ready', version: body.version };
}

export function appVerdict(result) {
  if (result.reason || result.code !== 0) return { status: 'failed', reason: result.reason || 'check-exit-failed' };
  let body;
  try { body = JSON.parse(result.output); } catch { return { status: 'unknown', reason: 'invalid-check-json' }; }
  return body?.ok === true && ['ready', 'healthy', 'running'].includes(body.status)
    ? { status: 'ready' } : { status: 'failed', reason: 'app-not-ready' };
}

function projectCommand(cwd, name) {
  const dispatcher = fs.readFileSync(cliEntry, 'utf8').match(/^const COMMANDS = \{([\s\S]*?)^\};/m)?.[1] || '';
  const reserved = new Set([...dispatcher.matchAll(/^\s+'?([a-z][a-z0-9-]*)'?\s*:/gm)].map(m => m[1]));
  if (reserved.has(name) || !/^[a-z][a-z0-9-]{0,63}$/.test(name || '')) return false;
  const file = path.join(cwd, '.agent', 'commands', name + '.mjs');
  try { return fs.statSync(file).isFile() && fs.realpathSync(file).startsWith(fs.realpathSync(cwd) + path.sep) ? file : false; } catch { return false; }
}

// Retry only transport failures, once. HTTP/auth failures are returned unchanged.
export async function fetchStartup(url, options = {}, fetchImpl = fetch) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await fetchImpl(url, { ...options, signal: AbortSignal.timeout(10000) }); }
    catch (error) { if (attempt === 1) throw error; }
  }
}

export async function startupHealth({ cwd = process.cwd(), brainDir, brainUrl = null, token = null, brainId = null, ensure = false,
  appCheck = null, appStart = null, run = runBounded, fetchImpl = fetch, listener = verifyListener, platform = process.platform, home = os.homedir(), identity = processIdentity } = {}) {
  const actions = [];
  const daemonFile = path.join(brainDir, 'daemon.pid');
  const serverFile = path.join(brainDir, 'server.pid');
  const report = { checked_at: new Date().toISOString(), server: { status: 'not-configured' }, brain: { status: 'unknown' }, daemon: { status: 'unknown' },
    ssss: { status: 'unknown', role: 'document-engine-tooling; no standalone daemon required' }, app: { status: 'not-declared' }, actions };
  let local = false, remoteDaemon = { status: 'unknown', source: 'remote-health' };
  try { const url = new URL(brainUrl); local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname); if (url.username || url.password || !['http:', 'https:'].includes(url.protocol)) throw new Error(); }
  catch { brainUrl = null; }
  const probeServer = async () => {
    if (!brainUrl) return { status: 'not-configured' };
    try {
      const response = await fetchStartup(new URL('/health', brainUrl), { headers: token ? { Authorization: `Bearer ${token}` } : {}, redirect: 'error' }, fetchImpl);
      if (!response.ok) return { status: 'failed', reason: 'health-http-failure' };
      const body = await response.json();
      const verdict = healthVerdict(body);
      remoteDaemon = { status: body.daemon === 'running' ? 'running' : ['dead', 'stopped', 'not-started'].includes(body.daemon) ? 'stopped' : 'unknown', source: 'remote-health' };
      if (local) {
        const own = identity(serverFile, path.join(packageRoot, 'src', 'server', 'index.mjs'));
        if (own.status !== 'running') return { status: own.status === 'conflict' ? 'conflict' : 'unknown', reason: 'server-process-unverified' };
        if (!await listener(own.pid, new URL(brainUrl), { run, cwd })) return { status: 'unknown', reason: 'server-listener-unverified' };
      }
      return { ...verdict, source: local ? 'local-verified-listener' : 'remote-health' };
    } catch { return { status: 'offline', reason: 'health-unreachable' }; }
  };
  report.server = await probeServer();
  report.daemon = local ? { ...identity(daemonFile, path.join(packageRoot, 'src', 'core', 'daemon-loop.mjs')), source: 'local-pid' } : remoteDaemon;
  const serverIdentity = local ? identity(serverFile, path.join(packageRoot, 'src', 'server', 'index.mjs')) : null;
  if (ensure && local && report.server.status === 'offline' && ['not-started', 'stopped'].includes(serverIdentity.status)) {
    const plist = path.join(home, 'Library', 'LaunchAgents', 'com.totalrecall.server.plist');
    if (platform === 'darwin' && fs.existsSync(plist)) {
      let started = await run('launchctl', ['start', 'com.totalrecall.server'], { cwd });
      if (started.code !== 0) started = await run('launchctl', ['load', plist], { cwd });
      actions.push({ component: 'server', action: 'existing-user-service-start', accepted: started.code === 0 && !started.reason });
      if (started.code === 0 && !started.reason) for (let i = 0; i < 10; i++) {
        report.server = await probeServer(); if (report.server.status !== 'offline') break;
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } else actions.push({ component: 'server', action: 'not-started', reason: 'no-existing-user-service' });
  }
  if (ensure && local && report.server.status === 'ready' && ['not-started', 'stopped'].includes(report.daemon.status)) {
    // Delegate lifecycle to the existing CLI. Never restart a live/unknown process.
    if (platform === 'linux' && fs.existsSync('/run/systemd/system')) actions.push({ component: 'daemon', action: 'not-started', reason: 'system-service-needs-owning-deploy' });
    else {
      const result = await run(process.execPath, [cliEntry, 'daemon', 'start'], { cwd });
      actions.push({ component: 'daemon', action: 'cli-start', accepted: result.code === 0 && !result.reason });
      for (let i = 0; i < 10; i++) {
        report.daemon = { ...identity(daemonFile, path.join(packageRoot, 'src', 'core', 'daemon-loop.mjs')), source: 'local-pid' }; if (report.daemon.status === 'running') break;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  }
  if (brainUrl) {
    try {
      const url = new URL('/api/instructions', brainUrl);
      if (brainId) url.searchParams.set('brain', brainId);
      const response = await fetchStartup(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, redirect: 'error' }, fetchImpl);
      if (!response.ok) report.brain = { status: 'failed', reason: `instructions-http-${response.status}` };
      else {
        const text = await response.text();
        const type = response.headers?.get?.('content-type') || '';
        let valid = text.trim().length > 0 && !type.includes('html') && !/^\s*<(?:!doctype|html)/i.test(text);
        if (type.includes('json')) { try { const body = JSON.parse(text); valid = typeof body.content === 'string' && body.content.length > 0; } catch { valid = false; } }
        report.brain = { status: valid ? 'ready' : 'unknown', scope: 'instructions-access-only; selected project identity not independently verified', reason: valid ? undefined : 'unrecognized-instructions-response' };
      }
    } catch { report.brain = { status: 'offline', reason: 'instructions-unreachable' }; }
  }
  const candidates = [path.join(cwd, 'ssss'), path.join(cwd, 'node_modules', '.bin', 'ssss')];
  const tool = candidates.find(file => { try { fs.accessSync(file, fs.constants.X_OK); return fs.statSync(file).isFile(); } catch { return false; } }) || 'ssss';
  const tooling = await run(tool, ['--help'], { cwd });
  report.ssss = { status: tooling.code === 0 && !tooling.reason && /ssss/i.test(tooling.output) ? 'available' : 'unavailable', role: report.ssss.role };
  const runApp = async name => {
    const file = projectCommand(cwd, name);
    if (!file) return { code: 1, reason: 'invalid-current-repo-command', output: '' };
    const invoke = `import { pathToFileURL } from 'node:url'; const file = process.argv[1]; const name = process.argv[2]; const handler = await import(pathToFileURL(file)); if (typeof handler.run === 'function') await handler.run([process.execPath,file,name,'--json']); else if (typeof handler.default === 'function') await handler.default(['--json']); else throw new Error('Missing command handler');`;
    return run(process.execPath, ['--input-type=module', '-e', invoke, file, name], { cwd });
  };
  if (appCheck) {
    if (!projectCommand(cwd, appCheck)) report.app = { status: 'not-configured', reason: 'check-not-current-repo-command' };
    else {
      report.app = appVerdict(await runApp(appCheck));
      if (ensure && report.app.status !== 'ready' && appStart && projectCommand(cwd, appStart)) {
        const started = await runApp(appStart);
        actions.push({ component: 'app', action: 'declared-command-start', accepted: started.code === 0 && !started.reason });
        report.app = appVerdict(await runApp(appCheck));
      }
    }
  }
  report.shared_ready = report.server.status === 'ready' && report.brain.status === 'ready' && report.daemon.status === 'running' && report.ssss.status === 'available';
  report.ready_scope = appCheck ? 'shared-and-declared-current-repo-app' : 'shared-runtime-only';
  report.ready = report.shared_ready && (!appCheck || report.app.status === 'ready');
  return report;
}
