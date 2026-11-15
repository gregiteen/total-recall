import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { provisionRemoteCustody, runRemoteTotalRecallDeploy, wizardSecretKeys } from './deploy.mjs';

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
