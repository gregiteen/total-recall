/**
 * Provision the developer's own Headscale control server on a host they
 * already deploy to. Provider-agnostic: any Debian 12+/Ubuntu 22.04+ host the
 * developer can reach over SSH with their own keys. Steps follow the official
 * Headscale documentation (DEB package, /etc/headscale/config.yaml,
 * `headscale configtest`, systemd) and verify the release checksum.
 */
import dns from 'node:dns/promises';
import net from 'node:net';
import { spawn } from 'node:child_process';

const RELEASES = 'https://api.github.com/repos/juanfont/headscale/releases/latest';
const DOWNLOAD = 'https://github.com/juanfont/headscale/releases/download';
const ARCH = { x86_64: 'amd64', aarch64: 'arm64' };
const HOST_PATTERN = /^[A-Za-z0-9._-]+$/;
const DOMAIN_PATTERN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

export function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

/** The mesh requirements a deployment record must meet. */
export function meshTargetOf(provider) {
  const ssh = provider?.ssh;
  if (!ssh || !HOST_PATTERN.test(ssh.host || '') || !HOST_PATTERN.test(ssh.user || '')) return null;
  const port = Number(ssh.port ?? 22);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  if (!DOMAIN_PATTERN.test(String(provider.domain || '').toLowerCase())) return null;
  return { name: provider.name, host: ssh.host, user: ssh.user, port, domain: provider.domain.toLowerCase() };
}

export function sshExec(target) {
  return (script, { stdin = '' } = {}) => new Promise((resolve, reject) => {
    const remote = target.user === 'root' ? script : `sudo -n sh -c ${shellQuote(script)}`;
    const child = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-p', String(target.port), `${target.user}@${target.host}`, '--', remote], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(stdin);
  });
}

async function must(pending, what) {
  const r = await pending;
  if (r.code !== 0) throw new Error(`${what} failed: ${(r.stderr || r.stdout || `exit ${r.code}`).trim().split('\n').pop()}`);
  return r.stdout;
}

/** Replace exactly one matching line, so a changed example fails loudly. */
export function patchConfig(example, { serverUrl, domain, baseDomain, email }) {
  const edits = [
    [/^server_url: .*$/m, `server_url: ${serverUrl}`],
    [/^listen_addr: .*$/m, 'listen_addr: 0.0.0.0:443'],
    [/^tls_letsencrypt_hostname: .*$/m, `tls_letsencrypt_hostname: "${domain}"`],
    [/^acme_email: .*$/m, `acme_email: "${email || ''}"`],
    [/^policy:\n(?:(?:  #.*|)\n)*?  mode: file$/m, null],
    [/^  base_domain: .*$/m, `  base_domain: ${baseDomain}`]
  ];
  let out = example;
  for (const [re, to] of edits) {
    if (to === null) {
      if ((out.match(/^  mode: file$/gm) || []).length !== 1) throw new Error('config example changed: policy mode line not found exactly once');
      out = out.replace(/^  mode: file$/m, '  mode: database');
      continue;
    }
    if ((out.match(new RegExp(re.source, 'gm')) || []).length !== 1) throw new Error(`config example changed: ${re.source} not found exactly once`);
    out = out.replace(re, to);
  }
  return out;
}

export function parseChecksum(checksums, file) {
  const line = checksums.split('\n').find((l) => l.trim().endsWith(`  ${file}`));
  const sha = line && line.trim().split(/\s+/)[0];
  if (!/^[0-9a-f]{64}$/.test(sha || '')) throw new Error(`No checksum for ${file}`);
  return sha;
}

async function resolvesToHost(target) {
  const wanted = net.isIP(target.host) ? [target.host] : (await dns.lookup(target.host, { all: true })).map((a) => a.address);
  const got = (await dns.lookup(target.domain, { all: true }).catch(() => [])).map((a) => a.address);
  if (!got.length) throw new Error(`${target.domain} does not resolve yet; point it at the host before provisioning (Let's Encrypt needs it)`);
  if (!got.some((a) => wanted.includes(a))) throw new Error(`${target.domain} resolves to ${got.join(', ')}, not to ${target.host}`);
}

export async function provisionHeadscale(target, { exec = sshExec(target), fetchJson = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); }), fetchText = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.text(); }), checkDns = resolvesToHost, user = 'owner', email = '', log = () => {}, wait = (ms) => new Promise((r) => setTimeout(r, ms)), installConsoleFn = null } = {}) {
  if (!meshTargetOf({ name: target.name, ssh: { host: target.host, user: target.user, port: target.port }, domain: target.domain })) throw new Error('Deployment lacks the host, SSH user and domain mesh requires');
  await checkDns(target);

  log('preflight');
  const probe = Object.fromEntries((await must(exec('. /etc/os-release; echo "OS=$ID $VERSION_ID"; echo "ARCH=$(uname -m)"; echo "UID=$(id -u)"; echo "HEADSCALE=$(command -v headscale)"; test -e /etc/headscale/config.yaml && echo "CONFIG=1" || echo "CONFIG=0"; echo "SYSTEMD=$(command -v systemctl)"'), 'Preflight')).split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
  const [id, version = ''] = (probe.OS || '').split(' ');
  const arch = ARCH[probe.ARCH];
  const okOs = (id === 'debian' && Number(version) >= 12) || (id === 'ubuntu' && Number(version.split('.')[0]) >= 22);
  if (!okOs) throw new Error(`Unsupported host OS ${id} ${version}; Headscale's packages need Debian 12+ or Ubuntu 22.04+`);
  if (!arch) throw new Error(`Unsupported architecture ${probe.ARCH}`);
  if (!probe.SYSTEMD) throw new Error('The host has no systemd; Headscale\'s package runs as a systemd service');
  if (probe.HEADSCALE || probe.CONFIG === '1') throw new Error('Headscale is already installed or configured on this host; refusing to overwrite it');

  log('release');
  const tag = (await fetchJson(RELEASES)).tag_name;
  if (!/^v\d+\.\d+\.\d+$/.test(tag || '')) throw new Error(`Unexpected release tag ${tag}`);
  const file = `headscale_${tag.slice(1)}_linux_${arch}.deb`;
  const sha = parseChecksum(await fetchText(`${DOWNLOAD}/${tag}/checksums.txt`), file);

  log('install');
  await must(exec(`set -e; cd /tmp; curl -fsSL -o ${file} ${DOWNLOAD}/${tag}/${file}; echo "${sha}  ${file}" | sha256sum -c -; DEBIAN_FRONTEND=noninteractive apt-get install -y ./${file}; rm -f ${file}`), 'Install');

  log('configure');
  const example = await must(exec('cat /usr/share/doc/headscale/examples/config-example.yaml'), 'Reading the shipped example config');
  const baseDomain = `mesh.${target.domain}`;
  const config = patchConfig(example, { serverUrl: `https://${target.domain}`, domain: target.domain, baseDomain, email });
  await must(exec('cat > /etc/headscale/config.yaml && chmod 640 /etc/headscale/config.yaml && chown root:headscale /etc/headscale/config.yaml', { stdin: config }), 'Writing config');
  await must(exec('headscale configtest'), 'headscale configtest');

  log('start');
  // The package starts Headscale at install with the example config (loopback :8080);
  // `enable --now` leaves that process running, so restart to load the written config.
  await must(exec('systemctl enable headscale && systemctl restart headscale'), 'Starting Headscale');
  let healthy = false;
  // The first start also obtains the Let's Encrypt certificate, so allow it about a minute.
  for (let i = 0; i < 40 && !healthy; i++) {
    healthy = (await exec(`curl -fsS https://${target.domain}/health`)).code === 0;
    if (!healthy) await wait(1500);
  }
  if (!healthy) throw new Error(`Headscale started but https://${target.domain}/health is not answering; check ports 80/443 and DNS on the host`);

  log('bootstrap');
  await must(exec(`headscale users create ${shellQuote(user)}`), 'Creating the first user');
  const users = JSON.parse(await must(exec('headscale users list -o json'), 'Listing users'));
  const owner = users.find((u) => u.name === user);
  if (!owner) throw new Error('Created user not found in the user list');
  const apiKey = String(await must(exec('headscale apikeys create -o json'), 'Creating the API key')).trim().replace(/^"|"$/g, '');
  const pre = JSON.parse(await must(exec(`headscale preauthkeys create --user ${Number(owner.id)} --expiration 1h -o json`), 'Creating the pre-auth key'));
  const result = { controlUrl: `https://${target.domain}`, version: tag, user, userId: owner.id, apiKey, preAuthKey: pre.key };
  // The admin console is optional: a console failure is reported, never allowed to undo a working control server.
  try {
    Object.assign(result, await (installConsoleFn || installConsole)(target, { exec, fetchJson, wait, log }));
  } catch (err) {
    result.consoleError = err.message;
  }
  return result;
}

const STATE = '/var/lib/headscale';
const STAGE = `${STATE}/staging`;
const KEEP = `${STATE}/rollback`;

function versionOf(text) {
  const m = /v(\d+\.\d+\.\d+)/.exec(text || '');
  return m ? m[1] : null;
}

function newer(a, b) {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

/**
 * Update the provisioned server to the latest release without downtime for
 * established connections: stage beside the running version, test against a
 * copy of the real database, switch only when healthy, restore on failure.
 * The switch restarts the single control process, so the control plane pauses
 * for a few seconds; WireGuard traffic between nodes continues.
 */
export async function updateHeadscale(target, { exec = sshExec(target), fetchJson = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); }), fetchText = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.text(); }), checkOnly = false, log = () => {}, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const probe = (await must(exec('headscale version; uname -m; systemctl is-active headscale || true'), 'Reading the installed version')).split('\n');
  const current = versionOf(probe[0]);
  const arch = ARCH[probe.find((l) => ARCH[l])];
  if (!current) throw new Error('Headscale is not installed on this host');
  if (!arch) throw new Error('Unsupported architecture');
  const tag = (await fetchJson(RELEASES)).tag_name;
  if (!/^v\d+\.\d+\.\d+$/.test(tag || '')) throw new Error(`Unexpected release tag ${tag}`);
  const latest = tag.slice(1);
  if (!newer(latest, current)) return { updated: false, current, latest };
  if (checkOnly) return { updated: false, current, latest, available: true };

  const file = `headscale_${latest}_linux_${arch}.deb`;
  const sha = parseChecksum(await fetchText(`${DOWNLOAD}/${tag}/checksums.txt`), file);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `${KEEP}/db-${current}-${stamp}.sqlite`;
  const oldBinary = `${KEEP}/headscale-${current}`;

  log('stage');
  const staged0 = await exec(`set -e; rm -rf ${STAGE}; mkdir -p ${STAGE}/x ${KEEP}; cd ${STAGE}; curl -fsSL -o ${file} ${DOWNLOAD}/${tag}/${file}; echo "${sha}  ${file}" | sha256sum -c -; dpkg-deb -x ${file} x; cp /usr/bin/headscale ${oldBinary}; command -v sqlite3 >/dev/null || { apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y sqlite3; }; sqlite3 ${STATE}/db.sqlite ".backup '${backup}'"; cp ${backup} ${STAGE}/db.sqlite`);
  if (staged0.code !== 0) {
    await exec(`rm -rf ${STAGE}`);
    throw new Error(`Staging the new version failed: ${(staged0.stderr || staged0.stdout || `exit ${staged0.code}`).trim().split('\n').pop()}`);
  }

  log('test');
  const stagingConfig = `set -e; sed -e 's|^server_url: .*|server_url: http://127.0.0.1:18443|' -e 's|^listen_addr: .*|listen_addr: 127.0.0.1:18443|' -e 's|^metrics_listen_addr: .*|metrics_listen_addr: 127.0.0.1:19443|' -e 's|^grpc_listen_addr: .*|grpc_listen_addr: 127.0.0.1:15443|' -e 's|^tls_letsencrypt_hostname: .*|tls_letsencrypt_hostname: ""|' -e 's|${STATE}|${STAGE}|g' -e 's|/var/run/headscale|${STAGE}|g' /etc/headscale/config.yaml > ${STAGE}/config.yaml`;
  await must(exec(stagingConfig), 'Building the staging config');
  const before = JSON.parse(await must(exec('headscale users list -o json'), 'Counting users')).length;
  const trial = await exec(`cd ${STAGE}; (${STAGE}/x/usr/bin/headscale -c ${STAGE}/config.yaml serve > ${STAGE}/serve.log 2>&1 & echo $! > ${STAGE}/pid); ok=1; for i in 1 2 3 4 5 6 7 8 9 10; do sleep 1; curl -fsS http://127.0.0.1:18443/health >/dev/null 2>&1 && ok=0 && break; done; n=$(${STAGE}/x/usr/bin/headscale -c ${STAGE}/config.yaml users list -o json 2>/dev/null | grep -c '"name"'); kill $(cat ${STAGE}/pid) 2>/dev/null; echo "users=$n"; exit $ok`);
  await exec(`rm -rf ${STAGE}`);
  const staged = /users=(\d+)/.exec(trial.stdout)?.[1];
  if (trial.code !== 0 || Number(staged) !== before) {
    return { updated: false, current, latest, aborted: 'The new version failed its trial against a copy of the database; the running server was not touched' };
  }

  log('switch');
  const sw = await exec(`set -e; cd /tmp; curl -fsSL -o ${file} ${DOWNLOAD}/${tag}/${file}; echo "${sha}  ${file}" | sha256sum -c -; DEBIAN_FRONTEND=noninteractive apt-get install -y ./${file}; rm -f ${file}; systemctl restart headscale`);
  let healthy = false;
  if (sw.code === 0) {
    for (let i = 0; i < 20 && !healthy; i++) {
      healthy = (await exec(`curl -fsS https://${target.domain}/health`)).code === 0;
      if (!healthy) await wait(1500);
    }
    if (healthy) {
      const after = await exec('headscale users list -o json; headscale version');
      healthy = after.code === 0 && versionOf(after.stdout.split('\n').pop() || after.stdout) === latest;
    }
  }
  if (healthy) return { updated: true, current, latest };

  log('rollback');
  const rb = await exec(`set -e; systemctl stop headscale; cp ${oldBinary} /usr/bin/headscale; cp ${backup} ${STATE}/db.sqlite; rm -f ${STATE}/db.sqlite-wal ${STATE}/db.sqlite-shm; chown headscale:headscale ${STATE}/db.sqlite; systemctl start headscale`);
  if (rb.code !== 0) {
    throw new Error(`Update to ${latest} failed its health check and the rollback commands failed (${(rb.stderr || rb.stdout || `exit ${rb.code}`).trim().split('\n').pop()}); the saved binary and database are in ${KEEP}`);
  }
  let restored = false;
  for (let i = 0; i < 20 && !restored; i++) {
    restored = (await exec(`curl -fsS https://${target.domain}/health`)).code === 0;
    if (!restored) await wait(1500);
  }
  throw new Error(`Update to ${latest} failed its health check; restored ${current} from ${KEEP} ${restored ? 'and verified it' : 'but its public health check is not answering, so check ports 80/443 and DNS'}`);
}

const CONSOLE_RELEASES = 'https://api.github.com/repos/tale/headplane/releases/latest';
const CONSOLE_IMAGE = 'ghcr.io/tale/headplane';
const CONSOLE_PORT = 3000;

/** Headplane config: loopback only, reached through an SSH tunnel; the cookie secret lives in its own root-only file. */
export function consoleConfig(domain) {
  return [
    'server:',
    '  host: "127.0.0.1"',
    `  port: ${CONSOLE_PORT}`,
    `  base_url: "http://localhost:${CONSOLE_PORT}"`,
    '  cookie_secret_path: "/etc/headplane/cookie_secret"',
    '  cookie_secure: false',
    '  data_path: "/var/lib/headplane"',
    'headscale:',
    `  url: "https://${domain}"`,
    'integration:',
    '  proc:',
    '    enabled: false',
    ''
  ].join('\n');
}

async function consoleTag(fetchJson) {
  const tag = (await fetchJson(CONSOLE_RELEASES)).tag_name;
  if (!/^v\d+\.\d+\.\d+$/.test(tag || '')) throw new Error(`Unexpected console release tag ${tag}`);
  return tag;
}

function runConsole(image, domain) {
  // --add-host keeps the console's API calls on this machine (no hairpin through the public address) while the certificate still matches the domain.
  return `docker rm -f headplane >/dev/null 2>&1 || true; docker run -d --name headplane --restart unless-stopped --network host --add-host ${domain}:127.0.0.1 -v /etc/headplane/config.yaml:/etc/headplane/config.yaml:ro -v /etc/headplane/cookie_secret:/etc/headplane/cookie_secret:ro -v /var/lib/headplane:/var/lib/headplane ${image}`;
}

/** Headplane's /admin/healthz answers 200 only when the console can reach Headscale, so this proves the pair works, not just that a page renders. */
async function consoleHealthy(exec, wait) {
  for (let i = 0; i < 20; i++) {
    const r = await exec(`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${CONSOLE_PORT}/admin/healthz`);
    if (r.stdout.trim() === '200') return true;
    await wait(1500);
  }
  return false;
}

/** Install the Headplane admin console beside Headscale. */
export async function installConsole(target, { exec = sshExec(target), fetchJson = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); }), wait = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {} } = {}) {
  const tag = await consoleTag(fetchJson);
  const image = `${CONSOLE_IMAGE}:${tag.slice(1)}`;
  log('console');
  await must(exec('command -v docker >/dev/null || { apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io; }; systemctl enable --now docker'), 'Installing Docker for the console');
  await must(exec(`set -e; umask 077; mkdir -p /etc/headplane /var/lib/headplane; test -s /etc/headplane/cookie_secret || head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \\n' > /etc/headplane/cookie_secret; cat > /etc/headplane/config.yaml`, { stdin: consoleConfig(target.domain) }), 'Writing the console config');
  await must(exec(`docker pull -q ${image}`), 'Pulling the console image');
  await must(exec(runConsole(image, target.domain)), 'Starting the console');
  if (!(await consoleHealthy(exec, wait))) throw new Error('The console started but cannot reach Headscale (/admin/healthz is not 200 on 127.0.0.1:3000)');
  const digest = (await exec(`docker image inspect ${image} --format '{{index .RepoDigests 0}}'`)).stdout.trim();
  return { consoleVersion: tag, consoleImage: digest || image };
}

/** Move the console to the latest release; the control plane is untouched, and the previous image is restored if the new one fails. */
export async function updateConsole(target, { exec = sshExec(target), fetchJson = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); }), wait = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {} } = {}) {
  const running = (await exec("docker inspect headplane --format '{{.Config.Image}}'")).stdout.trim();
  if (!running.startsWith(`${CONSOLE_IMAGE}:`)) return { consoleUpdated: false, reason: 'No console installed' };
  const tag = await consoleTag(fetchJson);
  const image = `${CONSOLE_IMAGE}:${tag.slice(1)}`;
  if (image === running) return { consoleUpdated: false, consoleVersion: tag };
  log('console update');
  await must(exec(`docker pull -q ${image}`), 'Pulling the new console image');
  await must(exec(runConsole(image, target.domain)), 'Starting the new console');
  if (await consoleHealthy(exec, wait)) return { consoleUpdated: true, consoleVersion: tag };
  await must(exec(runConsole(running, target.domain)), 'Restoring the previous console');
  throw new Error(`Console ${tag} did not answer; restored ${running}`);
}
