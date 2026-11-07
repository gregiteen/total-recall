import { describe, it, expect, vi } from 'vitest';
import { runOkfIngest } from './ingest-okf.mjs';
import { loadPluginModule } from '../core/plugin-runtime.mjs';

vi.mock('../core/plugin-runtime.mjs', () => ({ loadPluginModule: vi.fn() }));

describe('ingest-okf.mjs', () => {
  it('exports runOkfIngest', () => {
    expect(runOkfIngest).toBeDefined();
  });

  it('asks the owner to skip colliding slugs by default', async () => {
    const importBundle = vi.fn().mockResolvedValue({ imported: [], skipped: [], errors: [] });
    vi.mocked(loadPluginModule).mockResolvedValue({ importBundle });

    await runOkfIngest(['bundle-path', '--dry-run']);

    expect(importBundle).toHaveBeenCalledWith('bundle-path', expect.any(String), expect.objectContaining({
      dryRun: true,
      onConflict: 'skip',
    }));
  });
});
