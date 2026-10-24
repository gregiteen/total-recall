// @vitest-environment node
import { it, expect, vi } from 'vitest';
import { executeInvokeChild, invokeEnvironment, requireSuccessfulRun } from './invoke-execution.mjs';
const run = (code, options = {}) => executeInvokeChild({ entry: '-e', args: [code], cwd: process.cwd(), env: invokeEnvironment(false), ...options });
it('strips preload, credentials and brain selectors from restricted child env', () => {
  const env = invokeEnvironment(false, { PATH: '/bin', HOME: '/private', AGENT_DIR: '/private', NODE_OPTIONS: '--import evil', TR_PAT: 'secret', TR_SECRETS_PASSWORD: 'secret' });
  expect(env).toEqual({ PATH: '/bin', FORCE_COLOR: '0', NO_COLOR: '1' });
});
it('allows only explicit host auth configuration for full execution', () => {
  expect(invokeEnvironment(true, { HOME: '/home', TR_SECRETS_PASSWORD: 'x', NODE_OPTIONS: 'evil', OPENAI_API_KEY: 'x' })).toEqual({ HOME: '/home', TR_SECRETS_PASSWORD: 'x', FORCE_COLOR: '0', NO_COLOR: '1' });
});
it('reports nonzero exit and signal faithfully', async () => {
  const result = await run('process.exit(9)');
  expect(result.exit_code).toBe(9); expect(result.timed_out).toBe(false);
  expect(() => requireSuccessfulRun(result)).toThrow('Execution did not complete');
});
it('clamps a caller timeout to the server ceiling', async () => {
  const result = await run('setInterval(() => {}, 1000)', { timeoutMs: 1000000, limits: { timeoutMs: 100, outputBytes: 1024 } });
  expect(result.timed_out).toBe(true); expect(result.signal).toBe('SIGKILL');
});
it.each([0, -1, 'bad', Infinity])('rejects invalid timeout %s', async timeoutMs => {
  await expect(run('', { timeoutMs })).rejects.toThrow('positive and finite');
});
it('caps combined stdout/stderr exactly and terminates overflow', async () => {
  const result = await run("process.stdout.write('a'.repeat(5000)); process.stderr.write('b'.repeat(5000))", { limits: { timeoutMs: 2000, outputBytes: 120 } });
  expect(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr)).toBe(120);
  expect(result.truncated).toBe(true); expect(result.termination_reason).toBe('output-limit');
});
it('cancels active children and refuses already-ended authority', async () => {
  const controller = new AbortController();
  const promise = run('setInterval(() => {}, 1000)', { signal: controller.signal });
  controller.abort();
  expect((await promise).termination_reason).toBe('authority-ended');
  await expect(run('', { signal: controller.signal })).rejects.toThrow('authority ended');
});
it('retires descendants when their parent exits normally', async () => {
  const result = await run(`const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); process.stdout.write(String(child.pid)); child.unref();`);
  expect(result.exit_code).toBe(0);
  const pid = Number(result.stdout);
  expect(Number.isInteger(pid) && pid > 0).toBe(true);
  await vi.waitFor(() => expect(() => process.kill(pid, 0)).toThrow(), { timeout: 2000 });
});
