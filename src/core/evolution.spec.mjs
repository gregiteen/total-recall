import { describe, it, expect, vi } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
import { runSsssEvalWorkflow, proposeSchemaUpgrades, applySchemaUpgrade } from './evolution.mjs';

describe('evolution.mjs', () => {
  it('exports runSsssEvalWorkflow', () => {
    expect(runSsssEvalWorkflow).toBeDefined();
  });
  it('exports proposeSchemaUpgrades', () => {
    expect(proposeSchemaUpgrades).toBeDefined();
  });
  it('exports applySchemaUpgrade', () => {
    expect(applySchemaUpgrade).toBeDefined();
  });
});
