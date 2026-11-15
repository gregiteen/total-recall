import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { provisionRemoteCustody, runRemoteTotalRecallDeploy, wizardSecretKeys, remoteExecPrefix, localPackageVersion, readDashboardPasswordStdin, _resetStdinPasswordGuard } from './deploy.mjs';

const CANARY = 'CANARY-core-deploy-9d41';

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
    await provisionRemoteCustody({ target: p.target, wizardOpts, load, log() {}, warn() {} });
    expect(seen.provision[0].opts.keys).toEqual(['GOOGLE_API_KEY', 'OPENAI_API_KEY']);
    expect(JSON.stringify(seen.provision)).not.toContain(CANARY);
  });

  it('propagates a fail-closed outcome as a thrown error', async () => {
    const { load } = fakeOwner({ provision: { ok: false, code: 'keys-missing', message: 'Credential(s) not in the Auth store: GOOGLE_API_KEY.', action: 'Store each with: total-recall auth secret set <KEY>.' } });
    await expect(provisionRemoteCustody({ target: p.target, wizardOpts, load })).rejects.toThrow(/keys-missing.*auth secret set/);
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
    await provisionRemoteCustody({ target: paths.vm.target, wizardOpts: {}, load, warn: (m) => warnings.push(m) });
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
    await provisionRemoteCustody({ target: paths.vm.target, wizardOpts: { googleApiKey: 'x', projectPaths: ['relative', '/work/repo'] }, load: a.load, log() {}, warn() {} });
    expect(a.seen.provision[0].opts.projectPath).toBe('/work/repo');
    const b = fakeOwner();
    await provisionRemoteCustody({ target: paths.vm.target, wizardOpts: { googleApiKey: 'x' }, load: b.load, log() {}, warn() {} });
    expect(b.seen.provision[0].opts.projectPath).toBeUndefined();
  });

  it('keeps generate-pat off the wrong npm package', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/cli/deploy.mjs'), 'utf8');
    expect(src).not.toMatch(/npx total-recall generate-pat/);
    expect((src.match(/remoteExecPrefix\(localPackageVersion\(\)\)\} generate-pat/g) || []).length).toBe(2);
  });
});
