import { describe, it, expect, vi } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
import { handleProactiveResearch, writeOrUpdateConsolidatedDraft, saveSynthesizedReportToDraft, handleQuickResearch } from './research.mjs';

describe('research.mjs', () => {
  it('exports handleProactiveResearch', () => {
    expect(handleProactiveResearch).toBeDefined();
  });
  it('exports writeOrUpdateConsolidatedDraft', () => {
    expect(writeOrUpdateConsolidatedDraft).toBeDefined();
  });
  it('exports saveSynthesizedReportToDraft', () => {
    expect(saveSynthesizedReportToDraft).toBeDefined();
  });
  it('exports handleQuickResearch', () => {
    expect(handleQuickResearch).toBeDefined();
  });
});
