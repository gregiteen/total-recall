import { describe, it, expect } from 'vitest';
import {
  classifySecretForIntegration,
  buildIntegrationResearchBrief,
  normalizeSecretKeyName,
} from './secret-integration-research.mjs';

describe('secret-integration-research', () => {
  it('normalizes packaging prefixes', () => {
    expect(normalizeSecretKeyName('DEVELOPER_BRAVE_SEARCH_API_KEY')).toBe('BRAVE_SEARCH_API_KEY');
    expect(normalizeSecretKeyName('PORTFOLIO_DOCUMENSO_SSO_SECRET')).toMatch(/DOCUMENSO/);
  });

  it('skips internal mesh / TR tokens', () => {
    const c = classifySecretForIntegration('TR_MESH_SYNC_TOKEN');
    expect(c.researchable).toBe(false);
    expect(c.kind).toBe('internal');
    expect(buildIntegrationResearchBrief('TR_MESH_SYNC_TOKEN')).toBeNull();
  });

  it('skips passwords and SSO secrets', () => {
    expect(classifySecretForIntegration('PORTFOLIO_WEBMAIL_PASSWORD').researchable).toBe(false);
    expect(classifySecretForIntegration('DOCUMENSO_SSO_SECRET').researchable).toBe(false);
    expect(classifySecretForIntegration('GITHUB_WEBHOOK_SECRET').researchable).toBe(false);
  });

  it('builds a product-level brief for Headscale API key', () => {
    const brief = buildIntegrationResearchBrief('HEADSCALE_API_KEY');
    expect(brief).not.toBeNull();
    expect(brief.topic).toMatch(/Headscale/i);
    expect(brief.topic).not.toMatch(/HEADSCALE_API_KEY/);
    expect(brief.notes).toMatch(/official/i);
    expect(brief.notes).not.toMatch(/Scrape the official API documentation for "HEADSCALE_API_KEY"/);
  });

  it('builds a product-level brief for OpenAI', () => {
    const brief = buildIntegrationResearchBrief('OPENAI_API_KEY');
    expect(brief.topic).toMatch(/OpenAI/i);
    expect(brief.notes).toMatch(/platform\.openai\.com|docs/i);
  });

  it('resolves DEVELOPER_BRAVE_SEARCH_API_KEY to Brave', () => {
    const c = classifySecretForIntegration('DEVELOPER_BRAVE_SEARCH_API_KEY');
    expect(c.researchable).toBe(true);
    expect(c.provider?.id).toBe('brave');
  });
});
