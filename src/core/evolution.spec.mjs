import { describe, it, expect } from 'vitest';
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
