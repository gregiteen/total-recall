import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { run, receipt, plugin } = vi.hoisted(() => ({
  run: vi.fn(), receipt: vi.fn(), plugin: { id: 'meta-harness', valid: true },
}));
vi.mock('../core/plugin-loader.mjs', () => ({ getPlugin: vi.fn(() => plugin) }));
vi.mock('../core/plugin-runner.mjs', () => ({ runPluginCommand: run }));
vi.mock('../core/preflight-receipt.mjs', () => ({ checkAnyReceipt: receipt, findRoot: () => '/fixture', ACK_COMMAND: 'total-recall tr-preflight --ack' }));
import runHarness from './harness.mjs';

let messages, originalExitCode;
beforeEach(() => {
  messages = []; originalExitCode = process.exitCode; process.exitCode = undefined;
  vi.clearAllMocks();
  receipt.mockReturnValue({ ok: true });
  run.mockResolvedValue({ ok: true, output: JSON.stringify({ ok: true, response: 'owner answer' }) });
  vi.spyOn(console, 'log').mockImplementation(text => messages.push(text));
  vi.spyOn(console, 'error').mockImplementation(text => messages.push(text));
});
afterEach(() => { process.exitCode = originalExitCode; vi.restoreAllMocks(); });

describe('legacy harness command delegates', () => {
  it('refuses dispatch before invoking the plugin when preflight is stale', async () => {
    receipt.mockReturnValue({ ok: false, problems: ['receipt stale'] });
    await runHarness(['dispatch', 'codex', 'task', '--json']);
    expect(run).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(JSON.parse(messages.join('\n'))).toMatchObject({ ok: false, error: expect.stringContaining('TR-PREFLIGHT gate') });
  });
  it('defaults unknown-auth permission off and emits only JSON', async () => {
    await runHarness(['dispatch', 'codex', 'task', '--json']);
    expect(JSON.parse(run.mock.calls[0][1].stdinRequest)).toMatchObject({ allowUnknownAuth: false, permissions: { read: true, write: false } });
    expect(JSON.parse(messages.join('\n'))).toEqual({ ok: true, response: 'owner answer' });
  });
  it('forwards explicit unknown-auth and write permission', async () => {
    await runHarness(['dispatch', 'codex', 'task', '--allow-unknown-auth', '--write', '--json']);
    expect(JSON.parse(run.mock.calls[0][1].stdinRequest)).toMatchObject({ allowUnknownAuth: true, permissions: { read: true, write: true } });
  });
  it('propagates owner list and council failures as nonzero JSON', async () => {
    for (const args of [['list', '--json'], ['council', 'task', '--json']]) {
      messages = [];
      run.mockResolvedValue({ ok: false, output: JSON.stringify({ ok: false, votes: [], error: 'fixture owner failure' }) });
      await runHarness(args);
      expect(process.exitCode).toBe(1);
      expect(JSON.parse(messages.join('\n'))).toMatchObject({ ok: false, error: 'fixture owner failure' });
    }
  });
  it('forwards target selection without treating flag values as task text', async () => {
    await runHarness(['dispatch', 'codex', 'task', '--node', 'fixture-node', '--cwd', '/fixture/remote', '--json']);
    expect(JSON.parse(run.mock.calls[0][1].stdinRequest)).toMatchObject({ prompt: 'task', node: 'fixture-node', cwd: '/fixture/remote' });
  });
  it('requires the remote workspace before invoking a plugin', async () => {
    await runHarness(['dispatch', 'codex', 'task', '--node', 'fixture-node', '--json']);
    expect(run).not.toHaveBeenCalled();
    expect(JSON.parse(messages.join('\n'))).toMatchObject({ ok: false, error: expect.stringContaining('explicit absolute --cwd') });
  });
  it('help never invokes execution or preflight', async () => {
    await runHarness(['dispatch', 'codex', 'task', '--help']);
    expect(run).not.toHaveBeenCalled(); expect(receipt).not.toHaveBeenCalled();
  });
});
