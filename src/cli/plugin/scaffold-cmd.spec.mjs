import { afterEach, expect, it, vi } from 'vitest';

const { createPlugin, runCodexPackage } = vi.hoisted(() => ({ createPlugin: vi.fn(), runCodexPackage: vi.fn() }));
vi.mock('./create.mjs', () => ({ createPlugin }));
vi.mock('./codex-package.mjs', () => ({ runCodexPackage }));
import scaffold, { run } from './scaffold-cmd.mjs';

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

it('prints standalone and nested scaffold help without creating a plugin', async () => {
  const output = vi.spyOn(console, 'log').mockImplementation(() => {});
  await run(['node', 'total-recall', 'scaffold-plugin', '--help']);
  await scaffold(['plugin', 'fixture', '-h']);
  expect(output).toHaveBeenCalledTimes(2);
  expect(output.mock.calls[0][0]).toContain('scaffold-plugin <id>');
  expect(createPlugin).not.toHaveBeenCalled();
});

it('preserves normal create and Codex-package delegation', async () => {
  await scaffold(['plugin', 'fixture', '--no-install']);
  await run(['node', 'total-recall', 'scaffold', 'codex-plugin', '--help']);
  expect(createPlugin).toHaveBeenCalledWith(['fixture', '--no-install']);
  expect(runCodexPackage).toHaveBeenCalledWith(['--help']);
});
