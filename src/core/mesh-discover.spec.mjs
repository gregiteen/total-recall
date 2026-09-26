import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import {
  candidateUsers,
  classifyProbeFailure,
  discoverNodeAccess,
  localPrivateKeys,
  probeLogin,
} from './mesh-discover.mjs';

const NODE = { hostname: 'box.mesh.example', ip: '100.64.0.2', access: {} };

describe('candidateUsers', () => {
  it('tries the recorded account, then the ssh config one, then the local one — once each', () => {
    const config = 'Host box\n  User fromconfig\n';
    expect(
      candidateUsers({ ...NODE, access: { ssh_user: 'recorded' } }, { sshConfigText: config, localUser: 'me' }),
    ).toEqual(['recorded', 'fromconfig', 'me']);
    expect(candidateUsers(NODE, { sshConfigText: '', localUser: 'me' })).toEqual(['me']);
    expect(
      candidateUsers({ ...NODE, access: { ssh_user: 'me' } }, { sshConfigText: '', localUser: 'me' }),
    ).toEqual(['me']);
  });
});

describe('localPrivateKeys', () => {
  let dir;
  afterEach(() => dir && fs.rmSync(dir, { recursive: true, force: true }));

  it('lists private keys that have a .pub beside them, then the ssh default', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-keys-'));
    for (const name of ['id_b', 'id_b.pub', 'id_a', 'id_a.pub', 'orphan.pub', 'config', 'known_hosts']) {
      fs.writeFileSync(path.join(dir, name), 'x');
    }
    expect(localPrivateKeys(dir)).toEqual([path.join(dir, 'id_a'), path.join(dir, 'id_b'), null]);
  });

  it('falls back to the ssh default when there is no ~/.ssh', () => {
    expect(localPrivateKeys('/nonexistent/tr-ssh')).toEqual([null]);
  });
});

describe('classifyProbeFailure', () => {
  it('separates host keys, credentials and reachability', () => {
    expect(classifyProbeFailure('Host key verification failed.')).toBe('host-key');
    expect(classifyProbeFailure('me@100.64.0.2: Permission denied (publickey).')).toBe('auth');
    expect(classifyProbeFailure('ssh: connect to host x port 22: Connection timed out')).toBe('unreachable');
    expect(classifyProbeFailure('something else')).toBe('unknown');
  });
});

describe('probeLogin', () => {
  function fakeSpawn(code, stderr = '') {
    const calls = [];
    const impl = (cmd, args) => {
      calls.push([cmd, args]);
      const proc = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.kill = () => {};
      setImmediate(() => {
        if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
        proc.emit('close', code);
      });
      return proc;
    };
    return { impl, calls };
  }

  it('runs a non-interactive login and pins the key when one is given', async () => {
    const { impl, calls } = fakeSpawn(0);
    const result = await probeLogin(
      { user: 'me', host: '100.64.0.2', port: 2222, identity: '/k/id' },
      { spawnImpl: impl, timeoutMs: 5000 },
    );
    expect(result.ok).toBe(true);
    expect(calls[0][1]).toEqual([
      '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5',
      '-p', '2222', '-i', '/k/id', '-o', 'IdentitiesOnly=yes',
      'me@100.64.0.2', 'true',
    ]);
    // Host keys are never auto-accepted.
    expect(calls[0][1].join(' ')).not.toMatch(/StrictHostKeyChecking/);
  });

  it('reports why a login failed', async () => {
    const { impl } = fakeSpawn(255, 'me@100.64.0.2: Permission denied (publickey).');
    expect(await probeLogin({ user: 'me', host: '100.64.0.2' }, { spawnImpl: impl })).toMatchObject({
      ok: false,
      reason: 'auth',
    });
  });
});

describe('discoverNodeAccess', () => {
  it('records the first account/key pair that logs in, verified', async () => {
    const tried = [];
    const saved = [];
    const result = await discoverNodeAccess(NODE, {
      sshConfigText: 'Host box\n  User fromconfig\n',
      keys: ['/k/one', '/k/two', null],
      probe: async (attempt) => {
        tried.push(`${attempt.user}:${attempt.identity}`);
        return attempt.user === 'fromconfig' && attempt.identity === '/k/two'
          ? { ok: true }
          : { ok: false, reason: 'auth' };
      },
      save: async (hostname, access) => {
        saved.push({ hostname, access });
        return { written: true };
      },
    });

    expect(result).toMatchObject({ found: true, written: true, access: { ssh_user: 'fromconfig', identity_file: '/k/two' } });
    expect(saved[0].access.source).toBe('discovered');
    expect(saved[0].access.verified_at).toBeTruthy();
    expect(tried.at(-1)).toBe('fromconfig:/k/two');
  });

  it('does not record a key path when the ssh default did the work', async () => {
    const result = await discoverNodeAccess(NODE, {
      sshConfigText: '',
      keys: ['/k/one', null],
      probe: async (attempt) => (attempt.identity === null ? { ok: true } : { ok: false, reason: 'auth' }),
      save: async () => ({ written: true }),
    });
    expect(result.found).toBe(true);
    expect(result.access).not.toHaveProperty('identity_file');
  });

  // Every account and key fails the same way on these, so going on would only
  // spray the far end's auth log.
  it.each(['host-key', 'unreachable'])('stops at the first %s failure', async (reason) => {
    let attempts = 0;
    const result = await discoverNodeAccess(NODE, {
      sshConfigText: 'Host box\n  User other\n',
      keys: ['/k/one', '/k/two', null],
      probe: async () => {
        attempts += 1;
        return { ok: false, reason };
      },
      save: async () => ({ written: true }),
    });
    expect(result).toMatchObject({ found: false, reason, attempts: 1 });
    expect(attempts).toBe(1);
  });

  it('reports a node with no address without trying anything', async () => {
    const result = await discoverNodeAccess({ hostname: 'ghost' }, { probe: async () => ({ ok: true }) });
    expect(result).toMatchObject({ found: false, reason: 'no-address', attempts: 0 });
  });
});
