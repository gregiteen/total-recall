import { afterEach, describe, expect, it, vi } from 'vitest';
const { loadPluginModule, exportBundle, importBundle } = vi.hoisted(() => ({
  loadPluginModule: vi.fn(), exportBundle: vi.fn(), importBundle: vi.fn(),
}));
vi.mock('../core/plugin-runtime.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, loadPluginModule: (...args) => args[0] === 'okf' ? loadPluginModule(...args) : actual.loadPluginModule(...args) };
});
import exportCommand from './export.mjs';
import { runOkfIngest } from './ingest-okf.mjs';

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); process.exitCode = 0; });
describe('OKF compatibility commands delegate to the active owner', () => {
  it('exports through the installed module and selected brain', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    exportBundle.mockResolvedValue({ exported: [] });
    loadPluginModule.mockResolvedValue({ exportBundle });
    await exportCommand(['/tmp/unused-okf-export', '--okf', '--project']);
    expect(loadPluginModule).toHaveBeenCalledWith('okf', 'adapter', { activeRequired: true });
    expect(exportBundle).toHaveBeenCalledWith(expect.stringContaining('memory-vault'), '/tmp/unused-okf-export', { format: 'dir', stripSsss: false });
  });
  it('imports through the owner without compiling a dry run', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    importBundle.mockResolvedValue({ imported: [], skipped: [], errors: [] });
    loadPluginModule.mockResolvedValue({ importBundle });
    await runOkfIngest(['/tmp/unused-okf-bundle', '--dry-run', '--project']);
    expect(loadPluginModule).toHaveBeenCalledWith('okf', 'adapter', { activeRequired: true });
    expect(importBundle).toHaveBeenCalledWith('/tmp/unused-okf-bundle', expect.stringContaining('memory-vault'), expect.objectContaining({ dryRun: true }));
  });
  it('a missing owner fails import and export without a built-in fallback', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    loadPluginModule.mockRejectedValue(new Error('OKF owner unavailable'));
    await expect(runOkfIngest(['/tmp/unused-okf-bundle', '--dry-run'])).rejects.toThrow('OKF owner unavailable');
    await exportCommand(['/tmp/unused-okf-export', '--okf']);
    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('OKF owner unavailable'));
    expect(exportBundle).not.toHaveBeenCalled();
    expect(importBundle).not.toHaveBeenCalled();
  });
});
