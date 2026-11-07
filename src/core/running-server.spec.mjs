import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  compareRunningServer,
  deploymentHealth,
  localServerUrl,
  observeRunningServer,
  runningServerStatus,
} from './running-server.mjs';

const made = [];
afterEach(() => { for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
function brain(config) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-running-server-'));
  made.push(dir);
  if (config) {
    fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'config', 'brain.json'), JSON.stringify(config));
  }
  return dir;
}
const answering = (body, ok = true, status = 200) => async () => ({ ok, status, json: async () => body });
const refused = async () => { const error = new TypeError('fetch failed'); error.cause = { code: 'ECONNREFUSED' }; throw error; };

describe('localServerUrl', () => {
  it('uses the brain configuration when it points at this host', () => {
    expect(localServerUrl({ brainDir: brain({ url: 'http://127.0.0.1:3900' }), env: { TR_PORT: '4000' } })).toBe('http://127.0.0.1:3900');
  });
  it('reports nothing to check when the brain is served from another host', () => {
    expect(localServerUrl({ brainDir: brain({ url: 'http://100.64.0.1:3900' }), env: {} })).toBeNull();
  });
  it('falls back on TR_PORT, then on the default port', () => {
    expect(localServerUrl({ brainDir: brain(), env: { TR_PORT: '3100' } })).toBe('http://127.0.0.1:3100');
    expect(localServerUrl({ brainDir: brain(), env: {} })).toBe('http://127.0.0.1:3000');
  });
});

describe('observeRunningServer', () => {
  it('reads the version the process reports', async () => {
    expect(await observeRunningServer({ url: 'http://127.0.0.1:3900', fetchImpl: answering({ version: '3.43.0' }) }))
      .toEqual({ status: 'running', url: 'http://127.0.0.1:3900', version: '3.43.0' });
  });
  it('treats a slow answer as unknown, because a slow server is not a stopped one', async () => {
    const slow = async () => { const error = new Error('timed out'); error.name = 'TimeoutError'; throw error; };
    expect((await observeRunningServer({ url: 'http://127.0.0.1:3900', fetchImpl: slow })).status).toBe('unknown');
  });
  it('tells a stopped server from a host that has none by the PID file', async () => {
    const dir = brain();
    expect((await observeRunningServer({ brainDir: dir, url: 'http://127.0.0.1:3900', fetchImpl: refused })).status).toBe('none');
    fs.writeFileSync(path.join(dir, 'server.pid'), '123');
    expect((await observeRunningServer({ brainDir: dir, url: 'http://127.0.0.1:3900', fetchImpl: refused })).status).toBe('down');
  });
  it('does not call an unusable answer healthy', async () => {
    expect((await observeRunningServer({ url: 'http://x.test', fetchImpl: answering({}, false, 401) })).status).toBe('unknown');
    expect((await observeRunningServer({ url: 'http://x.test', fetchImpl: answering({ status: 'healthy' }) })).status).toBe('unknown');
  });
});

describe('compareRunningServer', () => {
  const running = version => ({ status: 'running', url: 'http://127.0.0.1:3900', version });
  it('calls an older process stale, which a report reading package.json could never do', () => {
    const row = compareRunningServer(running('3.43.0'), '3.43.2');
    expect(row).toMatchObject({ status: 'stale', running: '3.43.0', latest: '3.43.2' });
    expect(row.reason).toContain('3.43.0');
  });
  it('accepts the release and a newer development build', () => {
    expect(compareRunningServer(running('3.43.2'), '3.43.2').status).toBe('current');
    expect(compareRunningServer(running('3.44.0'), '3.43.2').status).toBe('ahead');
  });
  it('does not guess when the released version is unavailable', () => {
    expect(compareRunningServer(running('3.43.0'), undefined).status).toBe('unknown');
  });
  it('carries through a host with no server', () => {
    expect(compareRunningServer({ status: 'none', reason: 'x' }, '3.43.2')).toEqual({ status: 'none', reason: 'x', latest: '3.43.2' });
  });
  it('runs the comparison end to end through its observer', async () => {
    const observe = async ({ brainDir }) => ({ status: 'running', url: brainDir, version: '1.0.0' });
    expect((await runningServerStatus({ brainDir: '/b', latest: '2.0.0', observe })).status).toBe('stale');
  });
});

describe('deploymentHealth', () => {
  it('gives every instance of one release the same deployment identity', () => {
    const a = deploymentHealth({ name: 'total-recall-brain', version: '3.43.3', pid: 1, port: 3900 });
    const b = deploymentHealth({ name: 'total-recall-brain', version: '3.43.3', pid: 2, port: 3901 });
    expect(a.deploymentId).toBe(b.deploymentId);
    expect(a).toEqual({ status: 'ok', version: '3.43.3', deploymentId: 'total-recall-brain@3.43.3', pid: 1, port: 3900 });
  });
});
