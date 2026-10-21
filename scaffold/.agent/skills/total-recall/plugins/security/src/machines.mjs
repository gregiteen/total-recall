import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { auditWindows } from './windows.mjs';
import { auditAndroid } from './android.mjs';
import { normalizePlatform } from './devices.mjs';

export function runCheck(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 8000, maxBuffer: 262144, stdio: ['ignore', 'pipe', 'pipe'] });
  // Diagnostics deliberately exclude stderr: system tools can include sensitive configuration.
  return { ok: !result.error && result.status === 0, output: !result.error && result.status === 0 ? result.stdout : '', reason: result.error?.code || (result.status === 0 ? null : 'unavailable-or-insufficient-privilege') };
}

export function parseListeners(output, platform, protocol = 'tcp') {
  const endpoints = new Map();
  for (const line of output.split('\n')) {
    const endpoint = platform === 'darwin' ? (line.startsWith('n') ? line.slice(1).replace(/ \(LISTEN\)$/, '') : '') : line.trim().split(/\s+/)[3];
    if (!endpoint) continue;
    const match = endpoint.match(/^(.*):(\d+)$/);
    if (!match) continue;
    const address = match[1].replace(/^\[|\]$/g, '');
    const port = Number(match[2]);
    if (port < 1 || port > 65535) continue;
    const scope = address === '*' || address === '0.0.0.0' || address === '::' ? 'all-interfaces' : address === '::1' || /^127\./.test(address) ? 'loopback' : 'interface';
    endpoints.set(`${address}:${port}`, { address, port, scope, protocol });
  }
  return [...endpoints.values()];
}

function sshPermissions(home) {
  const directory = path.join(home, '.ssh');
  if (!fs.existsSync(directory)) return { state: 'not-configured', files: [] };
  const root = fs.lstatSync(directory);
  if (root.isSymbolicLink() || !root.isDirectory()) return { state: 'unavailable', reason: 'SSH directory must be a regular directory', files: [] };
  const files = [{ path: directory, expected: 0o700, mode: root.mode & 0o777, directory: true }];
  for (const entry of fs.readdirSync(directory)) {
    const file = path.join(directory, entry);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) continue;
    // Never read private key material; only inspect metadata for recognized SSH files.
    if (stat.isFile() && (/^id_[\w-]+$/.test(entry) || ['config', 'authorized_keys'].includes(entry))) {
      files.push({ path: file, mode: stat.mode & 0o777, expected: 0o600, directory: false });
    }
  }
  return { state: 'observed', files };
}

export async function auditMachine({ platform = process.platform, hostname = os.hostname(), home = os.homedir(), execute = runCheck } = {}) {
  if (platform === 'win32') return auditWindows({ execute, hostname });
  if (platform === 'android') return auditAndroid({ execute, hostname });
  const checks = [];
  const add = (id, result, classify, remediation) => {
    const state = result.ok ? classify(result.output) : 'unavailable';
    checks.push({ id, state, severity: state === 'fail' ? 'HIGH' : state === 'review' ? 'MEDIUM' : null, remediation: state === 'pass' ? null : remediation, ...(result.ok ? {} : { reason: result.reason || 'check-unavailable' }) });
  };
  if (!['darwin', 'linux'].includes(platform)) return { schema: 'security-machine/v1', hostname, platform, timestamp: new Date().toISOString(), status: 'incomplete', checks: [], listeners: [], coverage: { complete: false, reason: 'unsupported-platform' } };
  if (platform === 'darwin') {
    add('firewall', execute('/usr/libexec/ApplicationFirewall/socketfilterfw', ['--getglobalstate']), text => /enabled/i.test(text) ? 'pass' : /disabled/i.test(text) ? 'fail' : 'unavailable', 'Enable the application firewall in System Settings → Network → Firewall; review application exceptions and verify again.');
    add('disk-encryption', execute('/usr/bin/fdesetup', ['status']), text => /FileVault is On/.test(text) ? 'pass' : /FileVault is Off/.test(text) ? 'fail' : 'unavailable', 'Enable FileVault in Privacy & Security after verifying recovery-key custody and a current backup.');
    add('gatekeeper', execute('/usr/sbin/spctl', ['--status']), text => /assessments enabled/.test(text) ? 'pass' : /assessments disabled/.test(text) ? 'fail' : 'unavailable', 'Enable application assessment; investigate why it was disabled before accepting unsigned software.');
    add('system-integrity', execute('/usr/bin/csrutil', ['status']), text => /status: enabled/.test(text) ? 'pass' : /status: disabled/.test(text) ? 'fail' : 'unavailable', 'Restore System Integrity Protection through macOS Recovery with physical access and a verified backup.');
    add('automatic-updates', execute('/usr/sbin/softwareupdate', ['--schedule']), text => /turned on/.test(text) ? 'pass' : /turned off/.test(text) ? 'review' : 'unavailable', 'Enable automatic security updates and verify the installed OS is supported.');
  } else {
    add('firewall', execute('ufw', ['status']), text => /Status: active/.test(text) ? 'pass' : /Status: inactive/.test(text) ? 'fail' : 'unavailable', 'Inspect the active firewall backend with administrator access. Preserve verified SSH/mesh access, review allow rules and default inbound policy, then verify from a second connection. UFW unavailable does not establish absence of nftables/firewalld protection.');
    const root = execute('findmnt', ['-n', '-o', 'SOURCE', '/']);
    const source = root.output?.trim();
    const disk = root.ok && source?.startsWith('/dev/') ? execute('lsblk', ['-s', '-n', '-o', 'TYPE', source]) : { ok: false, reason: 'root-storage-encryption-not-observable' };
    add('disk-encryption', disk, text => /(^|\n)crypt(\n|$)/.test(text.trim()) ? 'pass' : 'review', 'Verify root-volume encryption and provider storage policy; this check cannot prove encryption of every volume or remote storage.');
    add('automatic-updates', execute('systemctl', ['is-enabled', 'unattended-upgrades.service']), text => /^(enabled|static)\s*$/.test(text) ? 'review' : 'unavailable', 'Inspect your distribution security-update timers and last successful run. A configured service alone does not prove patches are installed.');
  }
  const ssh = execute('/usr/sbin/sshd', ['-T']);
  const settings = Object.fromEntries(ssh.ok ? ssh.output.split('\n').map(line => line.trim().split(/\s+/, 2)).filter(parts => parts.length === 2) : []);
  for (const [setting, expected] of [['permitrootlogin', 'no'], ['passwordauthentication', 'no'], ['permitemptypasswords', 'no'], ['pubkeyauthentication', 'yes']]) {
    add(`ssh-${setting}`, { ok: ssh.ok && Object.hasOwn(settings, setting), output: settings[setting] || '', reason: ssh.reason || 'effective-setting-unavailable' }, value => value === expected ? 'pass' : 'fail', `Review effective SSH ${setting}=${expected}, including Match blocks. Validate sshd -t and a second key-authenticated session before any reload; retain rollback access.`);
  }
  const listening = platform === 'darwin' ? execute('/usr/sbin/lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fn']) : execute('ss', ['-H', '-lnt']);
  const listeners = listening.ok ? parseListeners(listening.output, platform) : [];
  add('listening-ports', listening, () => listeners.some(item => item.scope !== 'loopback') ? 'review' : 'pass', 'Review every non-loopback listener. Bind private services to loopback or the mesh interface and verify firewall rules plus an authorized external vantage. Bind scope alone does not prove Internet exposure.');
  const udp = platform === 'darwin' ? execute('/usr/sbin/lsof', ['-nP', '-iUDP', '-Fn']) : execute('ss', ['-H', '-lnu']);
  const udpListeners = udp.ok ? parseListeners(udp.output, platform, 'udp') : [];
  add('udp-bindings', udp, () => udpListeners.some(item => item.scope !== 'loopback') ? 'review' : 'pass', 'Review UDP bindings and firewall rules, including discovery and DNS services. A local binding alone does not establish remote reachability.');
  listeners.push(...udpListeners);
  let permissions;
  try { permissions = sshPermissions(home); } catch { permissions = { state: 'unavailable', files: [], reason: 'SSH metadata inspection failed' }; }
  checks.push({ id: 'ssh-file-permissions', state: permissions.state === 'observed' ? permissions.files.some(file => (file.mode & ~file.expected) !== 0) ? 'fail' : 'pass' : permissions.state === 'not-configured' ? 'not-applicable' : 'unavailable', severity: permissions.files.some(file => (file.mode & ~file.expected) !== 0) ? 'HIGH' : null, remediation: 'Use security machine --apply-permissions to restrict recognized local SSH files; symbolic links are never modified.' });
  const complete = checks.every(check => check.state !== 'unavailable');
  return { schema: 'security-machine/v1', hostname, platform, timestamp: new Date().toISOString(), status: checks.some(check => check.state === 'fail') ? 'at-risk' : !complete ? 'incomplete' : checks.some(check => check.state === 'review') ? 'review-required' : 'passed', coverage: { complete, observed: checks.filter(check => !['unavailable', 'not-applicable'].includes(check.state)).length, total: checks.length, limitations: ['Scope is the current OS runtime; a Linux container does not certify its Chromebook, Windows or other host', 'TCP/UDP bindings visible to current user only', 'No external reachability or patch-currency certification', 'SSH Match blocks require connection-specific review'] }, checks, listeners, permissions };
}

export function hardenSshPermissions({ home = os.homedir() } = {}) {
  const inspection = sshPermissions(home);
  if (inspection.state !== 'observed') throw new Error('SSH directory cannot be safely hardened');
  const actions = [];
  for (const file of inspection.files) {
    if ((file.mode & ~file.expected) === 0) continue;
    let fd;
    try {
      // Lock to the inspected inode; refuse symlink/ownership changes instead of following them.
      const parent = fs.lstatSync(path.join(home, '.ssh'));
      if (parent.isSymbolicLink() || !parent.isDirectory()) throw new Error('SSH directory changed');
      fd = fs.openSync(file.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      const before = fs.fstatSync(fd);
      const current = fs.lstatSync(file.path);
      if (before.ino !== current.ino || before.dev !== current.dev || before.uid !== process.getuid()) throw new Error('Ownership or identity changed');
      fs.fchmodSync(fd, file.expected);
      if ((fs.fstatSync(fd).mode & 0o777) !== file.expected) throw new Error('Verification failed');
      actions.push({ path: file.path, before: file.mode.toString(8), after: file.expected.toString(8), status: 'verified' });
    } catch { actions.push({ path: file.path, status: 'failed', reason: 'Unsafe path, ownership, or permission verification failure' }); }
    finally { if (fd !== undefined) fs.closeSync(fd); }
  }
  return { status: actions.some(action => action.status === 'failed') ? 'failed' : 'verified', changed: actions.filter(action => action.status === 'verified').length, actions };
}

export async function loadOwner(id, name) {
  const host = process.env.TR_PACKAGE_ROOT;
  const runtime = host ? await import(pathToFileURL(path.join(host, 'src/core/plugin-runtime.mjs')).href) : await import('total-recall-brain/src/core/plugin-runtime.mjs');
  return runtime.loadPluginModule(id, name);
}

export async function auditFleet({ mesh, target, auditLocal = auditMachine } = {}) {
  mesh ||= await loadOwner('mesh', 'mesh');
  if (!mesh.isMeshAvailable()) throw new Error('Mesh runtime is unavailable; fleet coverage cannot be established');
  const nodes = mesh.getMeshPeers({ includeSelf: true });
  const selected = target ? nodes.filter(node => node.hostname === target || node.ip === target) : nodes;
  if (!selected.length) throw new Error('No matching discovered mesh machines');
  const reports = [];
  // Sequential bounded execution avoids exhausting every peer at once.
  for (const node of selected) {
    if (!node.online) { reports.push({ hostname: node.hostname, state: 'unavailable', reason: 'mesh-peer-offline' }); continue; }
    let devicePlatform;
    try { devicePlatform = normalizePlatform(String(node.os || '').toLowerCase()); } catch { /* native machine path */ }
    if (!node.self && ['ios', 'ipados', 'android', 'chromeos', 'chromeos-flex'].includes(devicePlatform)) {
      reports.push({ hostname: node.hostname, state: 'unavailable', reason: 'No authenticated native posture collector is connected for this device', assessment: { platform: devicePlatform, command: 'security device', evidence: 'manual-review-required' } }); continue;
    }
    try {
      let report;
      let transportIdentity = node.hostname;
      if (node.self) report = await auditLocal();
      else {
        const response = await mesh.execMeshCommand(node.hostname, 'total-recall security machine --json', { timeoutMs: 120000 });
        // A collector exit 1 is an actual risk/incomplete report, not a transport success.
        if (![0, 1].includes(response.exitCode)) throw new Error('remote-collector-failed');
        transportIdentity = response.hostname;
        report = JSON.parse(response.stdout);
      }
      const age = Date.now() - Date.parse(report.timestamp);
      // Mesh authenticates the target; OS hostname may differ from its registered mesh name.
      if (transportIdentity !== node.hostname || report.schema !== 'security-machine/v1' || typeof report.hostname !== 'string' || !report.hostname || !Array.isArray(report.checks) || !['passed', 'at-risk', 'incomplete', 'review-required'].includes(report.status) || typeof report.coverage?.complete !== 'boolean' || !Number.isFinite(age) || age < -5000 || age > 180000) throw new Error('remote-report-identity-schema-or-freshness-invalid');
      const states = new Set(['pass', 'fail', 'review', 'unavailable', 'not-applicable']);
      if (report.checks.some(check => typeof check.id !== 'string' || !states.has(check.state))) throw new Error('invalid-check-state');
      if (report.checks.length) {
        const complete = report.checks.every(check => check.state !== 'unavailable');
        const observed = report.checks.filter(check => !['unavailable', 'not-applicable'].includes(check.state)).length;
        const expectedStatus = report.checks.some(check => check.state === 'fail') ? 'at-risk' : !complete ? 'incomplete' : report.checks.some(check => check.state === 'review') ? 'review-required' : 'passed';
        if (report.coverage.complete !== complete || report.coverage.total !== report.checks.length || report.coverage.observed !== observed || report.status !== expectedStatus) throw new Error('inconsistent-report-claims');
      } else if (report.status !== 'incomplete' || report.coverage.complete) throw new Error('empty-report-cannot-pass');
      reports.push({ hostname: node.hostname, state: 'observed', report });
    } catch { reports.push({ hostname: node.hostname, state: 'unavailable', reason: 'Remote collector unavailable, invalid, or insufficiently authorized' }); }
  }
  const complete = reports.every(item => item.state === 'observed' && item.report.coverage.complete);
  return { schema: 'security-fleet/v1', timestamp: new Date().toISOString(), status: reports.some(item => item.report?.status === 'at-risk') ? 'at-risk' : !complete ? 'incomplete' : reports.some(item => item.report.status !== 'passed') ? 'review-required' : 'passed', coverage: { complete, discovered: nodes.length, selected: selected.length, observed: reports.filter(item => item.state === 'observed').length }, machines: reports };
}
