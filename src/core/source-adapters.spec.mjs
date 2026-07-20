import { describe, it, expect, afterEach } from 'vitest';
import { loadResearchConfig, checkSourceAvailability } from './source-adapters.mjs';

describe('searx integration', () => {
  const prevUrl = process.env.SEARX_URL;
  const prevPrefer = process.env.TR_PREFER_SEARX;

  afterEach(() => {
    if (prevUrl === undefined) delete process.env.SEARX_URL;
    else process.env.SEARX_URL = prevUrl;
    if (prevPrefer === undefined) delete process.env.TR_PREFER_SEARX;
    else process.env.TR_PREFER_SEARX = prevPrefer;
  });

  it('loadResearchConfig picks SEARX_URL and prefers searx by default', () => {
    process.env.SEARX_URL = 'http://127.0.0.1:8080/';
    const cfg = loadResearchConfig('/nonexistent/research.yml');
    expect(cfg.searxUrl).toBe('http://127.0.0.1:8080');
    expect(cfg.preferSearx).toBe(true);
    const avail = checkSourceAvailability(cfg);
    expect(avail.available).toContain('searx');
  });

  it('checkSourceAvailability warns without searx or paid keys', () => {
    delete process.env.SEARX_URL;
    const avail = checkSourceAvailability({
      searxUrl: null,
      braveApiKey: null,
      tavilyApiKey: null,
      exaApiKey: null,
      serperApiKey: null,
    });
    expect(avail.unavailable).toContain('searx');
    expect(avail.warnings.some((w) => /SEARX_URL|SearX/i.test(w))).toBe(true);
  });
});
