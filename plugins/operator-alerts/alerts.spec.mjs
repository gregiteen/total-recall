import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let home;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'notify-'));
  process.env.TR_NOTIFY_HOME = home;
  process.env.NOTIFY_TEST_KEY = 'k-123';
  vi.resetModules();
});
afterEach(() => {
  delete process.env.TR_NOTIFY_HOME;
  delete process.env.NOTIFY_TEST_KEY;
  vi.restoreAllMocks();
  fs.rmSync(home, { recursive: true, force: true });
});

const config = {
  email: { key_secret: 'NOTIFY_TEST_KEY', to: 'op@example.com', from: 'alerts@example.com' },
  sms: { key_secret: 'NOTIFY_TEST_KEY', to: '+15550001111', from: '+15550002222' },
  slack: {},
};

async function core() { return import('./notify-core.mjs'); }

describe('operator-alerts core', () => {
  it('dry-run resolves config and sends nothing', async () => {
    const f = vi.spyOn(globalThis, 'fetch');
    const { sendNotification } = await core();
    const r = await sendNotification({ title: 't', message: 'm', channels: ['email', 'sms'], dry: true, config });
    expect(r.map((x) => x.status)).toEqual(['dry-run', 'dry-run']);
    expect(f).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(home, 'sent.jsonl'))).toBe(false);
  });

  it('sends via SMTP2GO with the key in a header and dedupes by event id', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: { succeeded: 1, email_id: 'e1' } }), { status: 200 }));
    const { sendNotification } = await core();
    const opts = { title: 't', message: 'm', channels: ['email'], eventId: 'x:1', config };
    const a = await sendNotification(opts);
    const b = await sendNotification(opts);
    expect(a[0]).toMatchObject({ status: 'accepted', provider_id: 'e1' });
    expect(b[0].status).toBe('duplicate');
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][1].headers['X-Smtp2go-Api-Key']).toBe('k-123');
    expect(f.mock.calls[0][1].body).not.toContain('k-123');
  });

  it('reports provider failure and keeps going on other channels', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('nope', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'm1' } }), { status: 200 }));
    const { sendNotification } = await core();
    const r = await sendNotification({ title: 't', message: 'm', channels: ['email', 'sms'], config });
    expect(r[0].status).toBe('failed');
    expect(r[1]).toMatchObject({ status: 'accepted', provider_id: 'm1' });
  });

  it('suppresses non-critical sends in quiet hours but not critical ones', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: { succeeded: 1 } }), { status: 200 }));
    const h = new Date().getHours();
    const quiet = `${h}-${(h + 1) % 24}`;
    const { sendNotification } = await core();
    const low = await sendNotification({ title: 't', message: 'm', channels: ['email'], quietHours: quiet, config });
    const crit = await sendNotification({ title: 't', message: 'm', channels: ['email'], quietHours: quiet, severity: 'critical', config });
    expect(low[0].status).toBe('suppressed');
    expect(crit[0].status).toBe('accepted');
  });

  it('stub channels send nothing and are not recorded', async () => {
    const f = vi.spyOn(globalThis, 'fetch');
    const { sendNotification } = await core();
    const r = await sendNotification({ title: 't', message: 'm', channels: ['slack'], eventId: 's:1', config });
    expect(r[0].status).toBe('stub');
    expect(f).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(home, 'sent.jsonl'))).toBe(false);
  });

  it('fails clearly on an unknown channel or missing sender', async () => {
    const { sendNotification } = await core();
    const r = await sendNotification({ title: 't', message: 'm', channels: ['pigeon', 'email'], config: { email: { to: 'a@b.c' } } });
    expect(r[0]).toMatchObject({ status: 'failed', error: 'unknown channel' });
    expect(r[1].error).toMatch(/missing from/);
  });
});

describe('operator-alerts manifest', () => {
  it('declares the CLI it implements', async () => {
    const m = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'plugins/operator-alerts/plugin.json'), 'utf8'));
    const cli = await import('./cli.mjs');
    expect(m.id).toBe('operator-alerts');
    expect(typeof cli.run).toBe('function');
    expect(m.cli.subcommands.map((s) => s.name)).toEqual(['send', 'test', 'config', 'log']);
  });
});
