import { describe, it, expect } from 'vitest';
import { loadResearchConfig, isDailyCapReached, getSearchUsageStats, braveSearch, serperSearch, tavilySearch, exaSearch, webSearch, arxivSearch, npmSearch, npmPackageDetail, githubSearch, wikipediaFetch, wikidataQuery, webFetch, duckduckgoInstant, checkSourceAvailability, playwrightScrape, smartFetch, normalizePublishedDate } from './source-adapters.mjs';

describe('source-adapters.mjs', () => {
  it('exports loadResearchConfig', () => {
    expect(loadResearchConfig).toBeDefined();
  });
  it('exports isDailyCapReached', () => {
    expect(isDailyCapReached).toBeDefined();
  });
  it('exports getSearchUsageStats', () => {
    expect(getSearchUsageStats).toBeDefined();
  });
  it('exports braveSearch', () => {
    expect(braveSearch).toBeDefined();
  });
  it('exports serperSearch', () => {
    expect(serperSearch).toBeDefined();
  });
  it('exports tavilySearch', () => {
    expect(tavilySearch).toBeDefined();
  });
  it('exports exaSearch', () => {
    expect(exaSearch).toBeDefined();
  });
  it('exports webSearch', () => {
    expect(webSearch).toBeDefined();
  });
  it('exports arxivSearch', () => {
    expect(arxivSearch).toBeDefined();
  });
  it('exports npmSearch', () => {
    expect(npmSearch).toBeDefined();
  });
  it('exports npmPackageDetail', () => {
    expect(npmPackageDetail).toBeDefined();
  });
  it('exports githubSearch', () => {
    expect(githubSearch).toBeDefined();
  });
  it('exports wikipediaFetch', () => {
    expect(wikipediaFetch).toBeDefined();
  });
  it('exports wikidataQuery', () => {
    expect(wikidataQuery).toBeDefined();
  });
  it('exports webFetch', () => {
    expect(webFetch).toBeDefined();
  });
  it('exports duckduckgoInstant', () => {
    expect(duckduckgoInstant).toBeDefined();
  });
  it('exports checkSourceAvailability', () => {
    expect(checkSourceAvailability).toBeDefined();
  });
  it('exports playwrightScrape', () => {
    expect(playwrightScrape).toBeDefined();
  });
  it('exports smartFetch', () => {
    expect(smartFetch).toBeDefined();
  });
  it('exports normalizePublishedDate', () => {
    expect(normalizePublishedDate).toBeDefined();
  });
});
