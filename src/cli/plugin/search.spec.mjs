import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchCatalog } from './search.mjs';
import { CURATED_CATALOG } from '../../server/routes/plugins.mjs';

// The previous version of this spec asserted a `searchPlugins` export that the
// module never had — no commit ever added it — so the test could only ever
// fail. Cover the real surface instead: searchCatalog.
describe('search.mjs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports searchCatalog as a function', () => {
    expect(searchCatalog).toBeDefined();
    expect(typeof searchCatalog).toBe('function');
  });

  it('prints the whole catalog as JSON when --json is passed', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await searchCatalog(['--json']);

    expect(log).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(log.mock.calls[0][0]);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(CURATED_CATALOG.length);
  });

  it('filters the catalog by id', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await searchCatalog(['scientific-frontiers', '--json']);

    const parsed = JSON.parse(log.mock.calls[0][0]);
    expect(parsed.map(p => p.id)).toContain('scientific-frontiers');
    expect(parsed.length).toBeLessThan(CURATED_CATALOG.length);
  });

  it('says so when nothing matches', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await searchCatalog(['zzz-no-such-plugin']);

    const output = log.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('No plugins found');
  });
});
