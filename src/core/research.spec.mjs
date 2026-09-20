import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// writeNode is imported dynamically by the promotion helper; keep the rest real.
vi.mock('./vault.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, writeNode: vi.fn(async () => ({ success: true })) };
});

import { handleProactiveResearch, writeOrUpdateConsolidatedDraft, saveSynthesizedReportToDraft, handleQuickResearch, promoteDraftToVault, VAULT_PROMOTION_MIN_CONFIDENCE } from './research.mjs';
import { writeNode } from './vault.mjs';

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
  it('exports promoteDraftToVault', () => {
    expect(promoteDraftToVault).toBeDefined();
  });
});

describe('promoteDraftToVault', () => {
  const TOPIC = 'Widget Rendering Pipeline';
  const SLUG = 'research-report-widget-rendering-pipeline';
  let inbox;
  let vault;

  const writeDraft = (confidence) => {
    // NOTE: the title MUST be quoted — an unquoted colon inside a YAML scalar
    // ("Report: Foo") is a parse error, which would make matter() throw and every
    // assertion below pass for the wrong reason.
    const body = `---\ntype: memory\nslug: ${SLUG}\ncategory: facts\ntitle: "Consolidated Research Report: ${TOPIC}"\nstatus: draft\nconfidence: ${confidence}\nimportance: 4\n---\n\n# Report\n\nFindings here.\n`;
    fs.writeFileSync(path.join(inbox, `${SLUG}.md`), body, 'utf8');
  };

  beforeEach(() => {
    vi.clearAllMocks();
    inbox = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-promote-inbox-'));
    vault = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-promote-vault-'));
  });

  it('returns null when there is no draft to promote', async () => {
    expect(await promoteDraftToVault(TOPIC, inbox, vault)).toBeNull();
    expect(writeNode).not.toHaveBeenCalled();
  });

  it('promotes a confident report into the vault as an ACTIVE node', async () => {
    // Without this the Phase 2/5 deliberation cycle — which resolves its target
    // with getNodes(vaultDir).find(n => n.slug === nodeSlug) — can never see the
    // report, and the five-phase pipeline stalls at step 2 forever.
    writeDraft(0.9);
    expect(await promoteDraftToVault(TOPIC, inbox, vault)).toBe(SLUG);

    expect(writeNode).toHaveBeenCalledTimes(1);
    const [node, dir] = vi.mocked(writeNode).mock.calls[0];
    expect(node.slug).toBe(SLUG);
    expect(node.status).toBe('active');
    expect(node.category).toBe('facts');
    expect(node.body).toContain('Findings here.');
    expect(dir).toBe(vault);
  });

  it('leaves a low-confidence report staged in the inbox for review', async () => {
    writeDraft(0.3);
    expect(await promoteDraftToVault(TOPIC, inbox, vault)).toBeNull();
    expect(writeNode).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(inbox, `${SLUG}.md`))).toBe(true);
  });

  it('treats the confidence threshold as inclusive', async () => {
    writeDraft(VAULT_PROMOTION_MIN_CONFIDENCE);
    expect(await promoteDraftToVault(TOPIC, inbox, vault)).toBe(SLUG);
  });

  it('does not throw when the vault write is rejected', async () => {
    writeDraft(0.9);
    vi.mocked(writeNode).mockRejectedValueOnce(new Error('writeNode contract failure'));
    expect(await promoteDraftToVault(TOPIC, inbox, vault)).toBeNull();
  });
});
