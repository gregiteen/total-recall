import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { provisionRemoteCustody, runRemoteTotalRecallDeploy, wizardSecretKeys, remoteExecPrefix, localPackageVersion, authBrainDir, readDashboardPasswordStdin, _resetStdinPasswordGuard, retrieveRemoteAccessToken, remoteDeployExtraArgs, assertSshTarget, REMOTE_PAT_SCOPES } from './deploy.mjs';

const CANARY = 'CANARY-core-deploy-9d41';
let BRAIN;
beforeAll(() => { BRAIN = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-deploy-brain-')); });
afterAll(() => fs.rmSync(BRAIN, { recursive: true, force: true }));

// Fake Auth owner: records what core asks and never sees a store.
function fakeOwner({ provision, run } = {}) {
  const seen = { provision: [], run: [] };
  const load = async (_id, name) => {
    if (name === 'secrets-store') return { defaultBrainDir: () => '/fake/brain' };
    return {
      provisionDeployTarget: async (brain, target, opts) => { seen.provision.push({ brain, target, opts }); return provision ?? { ok: true, provisioned: true, keys: opts.keys, count: opts.keys.length }; },
      runRemoteWithStdin: (target, cmd, opts) => { seen.run.push({ target, cmd, opts }); return run ?? { ok: true }; },
    };
  };
  return { load, seen };
}

const paths = {
  localnet: { target: { host: '10.0.0.5', user: 'me', remoteDir: '.agent/skills/total-recall' }, prefix: 'export PATH=x;', extra: [] },
  vm: { target: { host: '203.0.113.9', user: 'root', remoteDir: '/root/.agent/skills/total-recall', sshOpts: ['-i', '/k'] }, prefix: 'export NVM_DIR=x &&', extra: ['--cloudflare-quick'] },
};

describe.each(Object.entries(paths))('remote custody: %s wizard path', (_name, p) => {
  const wizardOpts = { domain: 'example.test', dashboardPassword: CANARY, googleApiKey: CANARY, openaiApiKey: CANARY };

  it('names explicit keys only and never passes wizard values to the owner', async () => {
    const { load, seen } = fakeOwner();
    await provisionRemoteCustody({ brainDir: BRAIN, target: p.target, wizardOpts, load, log() {}, warn() {} });
    expect(seen.provision[0].opts.keys).toEqual(['GOOGLE_API_KEY', 'OPENAI_API_KEY']);
    expect(JSON.stringify(seen.provision)).not.toContain(CANARY);
  });

  it('propagates a fail-closed outcome as a thrown error', async () => {
    const { load } = fakeOwner({ provision: { ok: false, code: 'keys-missing', message: 'Credential(s) not in the Auth store: GOOGLE_API_KEY.', action: 'Store each with: total-recall auth secret set <KEY>.' } });
    await expect(provisionRemoteCustody({ brainDir: BRAIN, target: p.target, wizardOpts, load })).rejects.toThrow(/keys-missing.*auth secret set/);
  });

  it('puts the dashboard password on stdin, not in the remote command', async () => {
    const { load, seen } = fakeOwner();
    await runRemoteTotalRecallDeploy({ target: p.target, prefix: p.prefix, wizardOpts, extraArgs: p.extra, load });
    const { cmd, opts } = seen.run[0];
    expect(cmd).not.toContain(CANARY);
    expect(cmd).toContain('--dashboard-password-stdin');
    expect(cmd).not.toContain('--dashboard-password ');
    expect(opts.stdin).toBe(`${CANARY}\n`);
    for (const a of p.extra) expect(cmd).toContain(a);
  });

  it('throws when the remote deploy fails', async () => {
    const { load } = fakeOwner({ run: { ok: false, code: 'remote-run-failed', message: 'Remote command exited with 1.' } });
    await expect(runRemoteTotalRecallDeploy({ target: p.target, prefix: p.prefix, wizardOpts, load })).rejects.toThrow(/Remote Total Recall deployment failed/);
  });
});

describe('remote custody wiring', () => {
  it('warns instead of silently skipping when no keys are selected', async () => {
    const warnings = [];
    const { load } = fakeOwner({ provision: { ok: true, provisioned: false, code: 'no-keys-selected', message: 'No keys.', action: 'Name them.' } });
    await provisionRemoteCustody({ brainDir: BRAIN, target: paths.vm.target, wizardOpts: {}, load, warn: (m) => warnings.push(m) });
    expect(warnings[0]).toMatch(/No keys/);
    expect(wizardSecretKeys({})).toEqual([]);
  });

  it('keeps whole-store copy, argv dotenv, plaintext fallback and argv password out of deploy.mjs', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/cli/deploy.mjs'), 'utf8');
    expect(src).not.toMatch(/buildDeploySecretsPayload|resolveSecretsPath|base64 -d|--dashboard-password "/);
    expect(src).not.toMatch(/secrets\.enc/);
    expect(src.match(/await provisionRemoteCustody\(/g)).toHaveLength(2);
    expect(src.match(/await runRemoteTotalRecallDeploy\(/g)).toHaveLength(2);
  });
});

describe('dashboard password stdin', () => {
  it('reads one line exactly once and never echoes it in errors', () => {
    _resetStdinPasswordGuard();
    let reads = 0;
    const read = () => { reads++; return `${CANARY}\nignored\n`; };
    expect(readDashboardPasswordStdin({}, read, false)).toBe(CANARY);
    expect(() => readDashboardPasswordStdin({}, read, false)).toThrow(/already consumed/);
    expect(reads).toBe(1);
  });

  it('fails closed on empty input, a terminal and a conflicting argv password', () => {
    _resetStdinPasswordGuard();
    expect(() => readDashboardPasswordStdin({}, () => '\n', false)).toThrow(/no password/);
    _resetStdinPasswordGuard();
    expect(() => readDashboardPasswordStdin({}, () => CANARY, true)).toThrow(/not a terminal/);
    let reads = 0;
    _resetStdinPasswordGuard();
    try { readDashboardPasswordStdin({ dashboardPassword: CANARY }, () => { reads++; return 'x'; }, false); } catch (e) {
      expect(e.message).not.toContain(CANARY);
    }
    expect(reads).toBe(0);
  });

  it.each(Object.entries(paths))('%s: probes remote support before the deploy and reports an unsupported CLI', async (_n, p) => {
    const { load, seen } = fakeOwner();
    await runRemoteTotalRecallDeploy({ target: p.target, prefix: p.prefix, wizardOpts: { dashboardPassword: CANARY }, extraArgs: p.extra, load });
    const cmd = seen.run[0].cmd;
    expect(cmd.indexOf('deploy --help')).toBeGreaterThan(-1);
    expect(cmd.indexOf('deploy --help')).toBeLessThan(cmd.lastIndexOf('deploy --domain'));
    expect(cmd).toContain('exit 97');
    expect(cmd).not.toContain(CANARY);
    const bad = fakeOwner({ run: { ok: false, status: 97, message: 'Remote command exited with 97.' } });
    await expect(runRemoteTotalRecallDeploy({ target: p.target, prefix: p.prefix, wizardOpts: { dashboardPassword: CANARY }, load: bad.load })).rejects.toThrow(/does not support --dashboard-password-stdin/);
  });

  it('no probe is added when no password is sent', async () => {
    const { load, seen } = fakeOwner();
    await runRemoteTotalRecallDeploy({ target: paths.vm.target, prefix: paths.vm.prefix, wizardOpts: {}, load });
    expect(seen.run[0].cmd).not.toContain('--help');
  });

  it('never persists the dashboard password to wizard-config.json', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/cli/deploy.mjs'), 'utf8');
    expect(src).not.toMatch(/\['cfg-dashboard-password'\]\s*=/);
    expect(src).toMatch(/delete current\['cfg-dashboard-password'\]/);
  });
});

describe('pinned remote package and explicit project path', () => {
  const version = '9.8.7';
  it.each(Object.entries(paths))('%s: probe and deploy use the same pinned total-recall-brain via npm exec', async (_n, p) => {
    const { load, seen } = fakeOwner();
    await runRemoteTotalRecallDeploy({ target: p.target, prefix: p.prefix, wizardOpts: { dashboardPassword: CANARY, domain: 'example.test' }, extraArgs: p.extra, load, version });
    const cmd = seen.run[0].cmd;
    const spec = 'npm exec --yes --package=total-recall-brain@9.8.7 -- total-recall';
    expect(cmd.split(spec).length - 1).toBe(2);
    expect(cmd).toContain(`${spec} deploy --help`);
    expect(cmd).toContain(`${spec} deploy --domain 'example.test'`);
    expect(cmd).not.toMatch(/\bnpx\b/);
    expect(cmd).not.toContain(CANARY);
  });

  it('pins to this package version and rejects a malformed one', () => {
    expect(remoteExecPrefix(localPackageVersion())).toMatch(/^npm exec --yes --package=total-recall-brain@\d+\.\d+\.\d+/);
    expect(() => remoteExecPrefix('1.0.0; id')).toThrow(/invalid local version/);
    expect(() => remoteExecPrefix('latest')).toThrow(/invalid local version/);
  });

  it('passes only an explicit absolute project path to the owner, never the cwd', async () => {
    const a = fakeOwner();
    await provisionRemoteCustody({ brainDir: BRAIN, target: paths.vm.target, wizardOpts: { googleApiKey: 'x', projectPaths: ['relative', '/work/repo'] }, load: a.load, log() {}, warn() {} });
    expect(a.seen.provision[0].opts.projectPath).toBe('/work/repo');
    const b = fakeOwner();
    await provisionRemoteCustody({ brainDir: BRAIN, target: paths.vm.target, wizardOpts: { googleApiKey: 'x' }, load: b.load, log() {}, warn() {} });
    expect(b.seen.provision[0].opts.projectPath).toBeUndefined();
  });

  it('keeps generate-pat off the wrong npm package and off the terminal', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/cli/deploy.mjs'), 'utf8');
    expect(src).not.toMatch(/npx total-recall generate-pat/);
    expect((src.match(/remoteExecPrefix\(version\)\} generate-pat/g) || []).length).toBe(1);
    // The token is retrieved by the Auth owner on a private pipe; core never spawns ssh for it.
    expect(src).not.toMatch(/generate-pat --quiet/);
    expect((src.match(/await retrieveRemoteAccessToken\(/g) || []).length).toBe(2);
  });
});

describe('remote access token through Auth (A309)', () => {
  const TOKEN = 'tr_PATCANARY0123456789abcdefABCDEF';
  const target = { host: '10.0.0.5', user: 'me', remoteDir: '.agent/skills/total-recall' };

  function owner(result) {
    const seen = [];
    const load = async (_id, name) => name === 'secrets-store'
      ? { defaultBrainDir: () => '/fake/brain' }
      : { retrieveRemotePat: async (brain, tgt, cmd, opts) => { seen.push({ brain, tgt, cmd, opts }); return result; } };
    return { load, seen };
  }

  it('asks the owner for a pinned, read-only token and reports only the key name and id', async () => {
    const { load, seen } = owner({ ok: true, stored: true, key: 'TR_REMOTE_PAT_10_0_0_5', id: 'abc-123' });
    const said = [];
    const out = await retrieveRemoteAccessToken({ brainDir: BRAIN, target, prefix: 'export X=1;', load, version: '9.8.7', log: (m) => said.push(m) });
    expect(out).toMatchObject({ ok: true, key: 'TR_REMOTE_PAT_10_0_0_5' });
    expect(seen[0].cmd).toBe(`export X=1; npm exec --yes --package=total-recall-brain@9.8.7 -- total-recall generate-pat --name deploy-wizard --scope ${REMOTE_PAT_SCOPES}`);
    expect(seen[0].brain).toBe(BRAIN);
    expect(said.join(' ')).toMatch(/TR_REMOTE_PAT_10_0_0_5.*abc-123/);
    expect(JSON.stringify([said, out])).not.toContain(TOKEN);
  });

  it.each([
    [{ ok: false, code: 'remote-pat-failed', message: 'Remote token command exited with 1.', action: 'Check it.' }, /remote-pat-failed.*exited with 1/],
    [{ ok: false, code: 'pat-store-failed', message: 'could not be stored.', action: 'revoke by id', id: 'abc-123' }, /pat-store-failed/],
  ])('stops with an explicit error instead of reporting success: %j', async (result, pattern) => {
    const { load } = owner(result);
    await expect(retrieveRemoteAccessToken({ brainDir: BRAIN, target, prefix: 'p;', load, version: '1.2.3', log() {} })).rejects.toThrow(pattern);
  });

  it('forwards only the operator-selected HTTPS flags and never a credential', () => {
    expect(remoteDeployExtraArgs({ httpsMethod: 'cloudflare-quick' })).toEqual(['--cloudflare-quick']);
    expect(remoteDeployExtraArgs({ httpsMethod: 'local' })).toEqual(['--allow-insecure-http']);
    expect(remoteDeployExtraArgs({ httpsMethod: 'cloudflare-tunnel', cloudflareToken: TOKEN, duckdnsToken: TOKEN })).toEqual([]);
    expect(remoteDeployExtraArgs()).toEqual([]);
  });

  it('refuses hosts and users that could be read as ssh options', () => {
    expect(() => assertSshTarget('me', '10.0.0.5')).not.toThrow();
    expect(() => assertSshTarget('root', 'host.example')).not.toThrow();
    expect(() => assertSshTarget('me', '-oProxyCommand=touch')).toThrow(/remote host/);
    expect(() => assertSshTarget('-oProxyCommand=x', '10.0.0.5')).toThrow(/remote user/);
    expect(() => assertSshTarget('me', 'a b')).toThrow(/remote host/);
    expect(() => assertSshTarget('me', undefined)).toThrow(/remote host/);
  });
});

describe('remote probe under a real POSIX shell', () => {
  const PASSWORD = 'PWCANARY-probe-1d9e';
  let bin;
  function fakeNpm(body) {
    bin = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-fake-npm-'));
    fs.writeFileSync(path.join(bin, 'npm'), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  }
  async function runProbe(prefix) {
    let command;
    const load = async () => ({ runRemoteWithStdin: (_t, cmd) => { command = cmd; return { ok: true }; } });
    await runRemoteTotalRecallDeploy({ target: { host: 'h', user: 'u' }, prefix, wizardOpts: { dashboardPassword: PASSWORD, domain: 'example.test' }, load, version: '1.2.3' });
    return spawnSync('/bin/sh', ['-c', command], { input: `${PASSWORD}\n`, encoding: 'utf8', env: { PATH: `${bin}:/usr/bin:/bin` } });
  }
  afterEach(() => { if (bin) fs.rmSync(bin, { recursive: true, force: true }); });

  const helpWithFlag = 'case "$*" in *--help*) echo "usage: deploy --dashboard-password-stdin";; *) echo "DEPLOY-RAN $*"; read pw; echo "got:$pw";; esac';

  it.each([['semicolon prefix', 'export A=1;'], ['and-and prefix', 'export A=1 &&']])('runs the deploy once when the flag is supported (%s)', async (_n, prefix) => {
    fakeNpm(helpWithFlag);
    const r = await runProbe(prefix);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`got:${PASSWORD}`);
    expect(r.stdout.match(/DEPLOY-RAN/g)).toHaveLength(1);
    expect(r.stdout + r.stderr).not.toMatch(/--dashboard-password /);
  });

  it('exits 97 and never runs the deploy when the remote lacks the flag', async () => {
    fakeNpm('echo "usage: deploy --domain"');
    const r = await runProbe('export A=1;');
    expect(r.status).toBe(97);
    expect(r.stderr).toMatch(/does not support --dashboard-password-stdin/);
    expect(r.stdout).not.toContain('DEPLOY-RAN');
  });

  it('exits 96 with a different diagnostic when the pinned CLI cannot run at all', async () => {
    fakeNpm('echo "npm error 404" >&2; exit 1');
    const r = await runProbe('export A=1 &&');
    expect(r.status).toBe(96);
    expect(r.stderr).toMatch(/could not run/);
    expect(r.stderr).not.toMatch(/does not support/);
    expect(r.stdout).not.toContain('DEPLOY-RAN');
  });

  it('reports the exit-96 cause distinctly to the caller', async () => {
    const load = async () => ({ runRemoteWithStdin: () => ({ ok: false, status: 96, message: 'Remote command exited with 96.' }) });
    await expect(runRemoteTotalRecallDeploy({ target: { host: 'h' }, prefix: 'p;', wizardOpts: { dashboardPassword: PASSWORD }, load, version: '1.2.3' })).rejects.toThrow(/could not run \(Node, npm or registry access\)/);
  });
});

describe('Auth brain directory selection', () => {
  const URL_BRAIN = 'http://brain.test:3000';
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tr-authdir-'));

  it('never reads TR_BRAIN: it is a brain URL for the startup CLI', () => {
    const fallback = tmp();
    try {
      expect(authBrainDir(undefined, { TR_BRAIN: URL_BRAIN }, fallback)).toBe(fallback);
      expect(authBrainDir(undefined, { TR_BRAIN: '/some/dir/that/must/not/win' }, fallback)).toBe(fallback);
    } finally { fs.rmSync(fallback, { recursive: true, force: true }); }
  });

  it('prefers the selected secrets brain over the global brain', () => {
    const selected = tmp(); const fallback = tmp();
    try { expect(authBrainDir(undefined, { TR_SECRETS_BRAIN: selected }, fallback)).toBe(selected); }
    finally { fs.rmSync(selected, { recursive: true, force: true }); fs.rmSync(fallback, { recursive: true, force: true }); }
  });

  it.each([[URL_BRAIN], ['relative/dir'], ['/definitely/not/here/tr-brain'], [''], [42], ['/tmp/\0x']])('refuses an invalid explicit directory %j', bad => {
    expect(() => authBrainDir(bad, {}, '/tmp')).toThrow(/Auth brain directory/);
  });

  it('refuses a regular file as the directory', () => {
    const dir = tmp(); const file = path.join(dir, 'f');
    fs.writeFileSync(file, 'x');
    try { expect(() => authBrainDir(file, {}, dir)).toThrow(/not a directory/); }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('hands the owner the validated directory even when TR_BRAIN is a URL', async () => {
    const seen = [];
    const load = async () => ({ provisionDeployTarget: async (brain) => { seen.push(brain); return { ok: true, provisioned: true, keys: [], count: 0 }; },
      retrieveRemotePat: async (brain) => { seen.push(brain); return { ok: true, key: 'K', id: 'i' }; } });
    const prev = process.env.TR_BRAIN; const prevSel = process.env.TR_SECRETS_BRAIN;
    process.env.TR_BRAIN = URL_BRAIN; process.env.TR_SECRETS_BRAIN = BRAIN;
    try {
      await provisionRemoteCustody({ target: { host: 'h' }, wizardOpts: {}, load, log() {}, warn() {} });
      await retrieveRemoteAccessToken({ target: { host: 'h' }, prefix: 'p;', load, version: '1.2.3', log() {} });
    } finally {
      if (prev === undefined) delete process.env.TR_BRAIN; else process.env.TR_BRAIN = prev;
      if (prevSel === undefined) delete process.env.TR_SECRETS_BRAIN; else process.env.TR_SECRETS_BRAIN = prevSel;
    }
    expect(seen).toEqual([BRAIN, BRAIN]);
  });

  it('rejects before any owner call when the explicit directory is invalid', async () => {
    let called = false;
    const load = async () => ({ provisionDeployTarget: async () => { called = true; return { ok: true }; }, retrieveRemotePat: async () => { called = true; return { ok: true }; } });
    await expect(provisionRemoteCustody({ brainDir: URL_BRAIN, target: { host: 'h' }, wizardOpts: {}, load })).rejects.toThrow(/Auth brain directory/);
    await expect(retrieveRemoteAccessToken({ brainDir: 'relative', target: { host: 'h' }, prefix: 'p;', load, version: '1.2.3' })).rejects.toThrow(/Auth brain directory/);
    expect(called).toBe(false);
  });
});
