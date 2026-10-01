import { describe, it, expect, vi, afterEach } from 'vitest';
import { validateConfig } from './config.mjs';
import { searchSearXNG } from './cli.mjs';
import { generateContext } from './generator.mjs';

afterEach(() => vi.unstubAllGlobals());

describe('portable SearXNG settings', () => {
  it('has no host default and rejects credentials, unsupported protocols and malformed settings', () => {
    expect(validateConfig({}).searxngUrl).toBe('');
    for (const searxngUrl of ['file:///tmp/search', 'https://user:password@example.org', 'https://example.org/?key=x']) expect(() => validateConfig({ searxngUrl })).toThrow();
    expect(() => validateConfig({ timeoutMs: 0 })).toThrow();
    expect(() => validateConfig({ maxResults: NaN })).toThrow();
    expect(() => validateConfig({ unknown: true })).toThrow();
  });

  it('makes no request when unset and honors the configured instance and bounded search', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{ title: 'one' }, { title: 'two' }] }) });
    vi.stubGlobal('fetch', fetcher);
    await expect(searchSearXNG('query', { config: validateConfig({}) })).rejects.toThrow('Configure');
    expect(fetcher).not.toHaveBeenCalled();
    const result = await searchSearXNG('query & test', { categories: ['science', 'news'], config: validateConfig({ searxngUrl: 'https://search.example.org/base/', maxResults: 1 }) });
    expect(result.results).toHaveLength(1);
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.pathname).toBe('/base/search');
    expect(url.searchParams.get('categories')).toBe('science,news');
    expect(url.searchParams.get('q')).toBe('query & test');
    expect(fetcher.mock.calls[0][1].signal).toBeDefined();
    fetcher.mockResolvedValue({ ok: true, json: async () => ({}) });
    await expect(searchSearXNG('query', { config: validateConfig({ searxngUrl: 'https://search.example.org' }) })).rejects.toThrow('JSON results');
  });

  it('does not run network health probes while compiling context', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect(await generateContext()).toContain('configuration unavailable');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
