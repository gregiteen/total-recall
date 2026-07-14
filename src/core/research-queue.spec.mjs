import { describe, it, expect } from 'vitest';
import { compileResearchProjectSummary, syncResearchProjectNode, loadQueue, saveQueue, listQueue, addToQueue, updateQueueItem, removeFromQueue } from './research-queue.mjs';

describe('research-queue.mjs', () => {
  it('exports compileResearchProjectSummary', () => {
    expect(compileResearchProjectSummary).toBeDefined();
  });
  it('exports syncResearchProjectNode', () => {
    expect(syncResearchProjectNode).toBeDefined();
  });
  it('exports loadQueue', () => {
    expect(loadQueue).toBeDefined();
  });
  it('exports saveQueue', () => {
    expect(saveQueue).toBeDefined();
  });
  it('exports listQueue', () => {
    expect(listQueue).toBeDefined();
  });
  it('exports addToQueue', () => {
    expect(addToQueue).toBeDefined();
  });
  it('exports updateQueueItem', () => {
    expect(updateQueueItem).toBeDefined();
  });
  it('exports removeFromQueue', () => {
    expect(removeFromQueue).toBeDefined();
  });
});
