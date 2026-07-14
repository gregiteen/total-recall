import { describe, it, expect } from 'vitest';
import { parseLayerFlag, getGlobalAgentDir, getGlobalBrainDir, detectProjectBrain, resolveAgentDir, resolveBrainDir, getBothBrains, defaultLayerForCategory } from './agent-dir.mjs';

describe('agent-dir.mjs', () => {
  it('exports parseLayerFlag', () => {
    expect(parseLayerFlag).toBeDefined();
  });
  it('exports getGlobalAgentDir', () => {
    expect(getGlobalAgentDir).toBeDefined();
  });
  it('exports getGlobalBrainDir', () => {
    expect(getGlobalBrainDir).toBeDefined();
  });
  it('exports detectProjectBrain', () => {
    expect(detectProjectBrain).toBeDefined();
  });
  it('exports resolveAgentDir', () => {
    expect(resolveAgentDir).toBeDefined();
  });
  it('exports resolveBrainDir', () => {
    expect(resolveBrainDir).toBeDefined();
  });
  it('exports getBothBrains', () => {
    expect(getBothBrains).toBeDefined();
  });
  it('exports defaultLayerForCategory', () => {
    expect(defaultLayerForCategory).toBeDefined();
  });
});
