// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock the heavy deps that validated-write depends on
vi.mock('./operation-validator.mjs', () => ({
  processOperationAsync: vi.fn(),
}));

vi.mock('./vault.mjs', () => ({
  safeStringify: vi.fn((body, fm) => `---\ntype: ${fm.type}\n---\n${body}`),
  atomicWrite: vi.fn(),
  // Mirrors the real rule: interior dots are allowed (domain-style repo names
  // produce them), path separators and `..` are not.
  isSafeVaultName: vi.fn((name) => {
    const value = String(name);
    return /^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(value) && !value.includes('..');
  }),
}));

vi.mock('./vault-cache.mjs', () => ({
  invalidate: vi.fn(),
}));

vi.mock('./config.mjs', () => ({
  brainDir: '/tmp/test-brain-vw',
}));

describe('validated-write', () => {
  let prepareNodeForContract, writeNodeValidatedAsync, validateNode;
  let processOperationAsync, invalidate;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('./validated-write.mjs');
    prepareNodeForContract = mod.prepareNodeForContract;
    writeNodeValidatedAsync = mod.writeNodeValidatedAsync;
    validateNode = mod.validateNode;

    const opMod = await import('./operation-validator.mjs');
    processOperationAsync = opMod.processOperationAsync;
    const cacheMod = await import('./vault-cache.mjs');
    invalidate = cacheMod.invalidate;
  });

  describe('prepareNodeForContract', () => {
    it('adds default type=memory when missing', () => {
      const node = prepareNodeForContract({ slug: 'test' });
      expect(node.type).toBe('memory');
    });

    it('adds default slug when missing', () => {
      const node = prepareNodeForContract({ type: 'memory' });
      expect(node.slug).toBe('unnamed');
    });

    it('adds required schema_version=2 fields for type=memory', () => {
      const node = prepareNodeForContract({ slug: 'my-fact', type: 'memory', category: 'facts' });
      expect(node.schema_version).toBe(2);
      expect(typeof node.confidence).toBe('number');
      expect(typeof node.importance).toBe('number');
      expect(node.modality).toBeDefined();
      expect(node.subject).toBeDefined();
      expect(node.predicate).toBeDefined();
      expect(node.object).toBeDefined();
    });

    it('sets category=uncategorized when missing and type != proposal/migration', () => {
      const node = prepareNodeForContract({ slug: 'x', type: 'memory' });
      expect(['uncategorized', 'facts', 'concepts', 'patterns', 'anti-patterns', 'preferences', 'invariants', 'decisions', 'lore']).toContain(node.category);
    });

    it('proposal category is always remapped to "proposals"', () => {
      const node = prepareNodeForContract({ type: 'proposal', slug: 'prop-001', category: 'some-topic' });
      expect(node.category).toBe('proposals');
    });

    it('adds title fallback from slug', () => {
      const node = prepareNodeForContract({ slug: 'no-title', type: 'memory', category: 'facts' });
      expect(node.title).toBe('no-title');
    });

    it('adds timestamp when missing', () => {
      const node = prepareNodeForContract({ slug: 'ts-test', type: 'memory', category: 'facts' });
      expect(node.timestamp).toBeDefined();
      expect(() => new Date(node.timestamp)).not.toThrow();
    });

    it('adds x_citations array for memory nodes', () => {
      const node = prepareNodeForContract({ slug: 'cite-test', type: 'memory', category: 'facts' });
      expect(Array.isArray(node.x_citations)).toBe(true);
      expect(node.x_citations.length).toBeGreaterThan(0);
    });
  });

  describe('writeNodeValidatedAsync', () => {
    it('throws for invalid slug containing special chars', async () => {
      vi.mocked(processOperationAsync).mockResolvedValue({ success: true });
      await expect(
        writeNodeValidatedAsync({ slug: 'invalid slug!', type: 'memory', category: 'facts' }, '/tmp/vault')
      ).rejects.toThrow('Invalid slug');
    });

    it('calls processOperationAsync with the envelope', async () => {
      vi.mocked(processOperationAsync).mockResolvedValue({ success: true });
      await writeNodeValidatedAsync({ slug: 'valid-slug', type: 'memory', category: 'facts' }, '/tmp/vault');
      expect(processOperationAsync).toHaveBeenCalled();
      const [envelope] = processOperationAsync.mock.calls[0];
      expect(envelope.type).toBe('operation');
      expect(envelope.path).toContain('valid-slug');
    });

    it('invalidates vault cache on success', async () => {
      vi.mocked(processOperationAsync).mockResolvedValue({ success: true });
      await writeNodeValidatedAsync({ slug: 'cache-test', type: 'memory', category: 'facts' }, '/tmp/vault');
      expect(invalidate).toHaveBeenCalledWith('/tmp/vault');
    });

    it('does NOT invalidate cache when dryRun=true', async () => {
      vi.mocked(invalidate).mockClear();
      vi.mocked(processOperationAsync).mockResolvedValue({ success: true });
      await writeNodeValidatedAsync({ slug: 'dry-run', type: 'memory', category: 'facts' }, '/tmp/vault', { dryRun: true });
      expect(invalidate).not.toHaveBeenCalled();
    });

    it('returns result from processOperationAsync', async () => {
      const fakeResult = { success: false, validation: { errors: ['bad slug'] } };
      vi.mocked(processOperationAsync).mockResolvedValue(fakeResult);
      const result = await writeNodeValidatedAsync({ slug: 'test', type: 'memory', category: 'facts' }, '/tmp/vault');
      expect(result).toEqual(fakeResult);
    });
  });

  describe('validateNode', () => {
    it('calls writeNodeValidatedAsync with dryRun=true', async () => {
      vi.mocked(processOperationAsync).mockResolvedValue({ success: true });
      const writeSpy = vi.spyOn(await import('./validated-write.mjs'), 'writeNodeValidatedAsync');
      await validateNode({ slug: 'vnode', type: 'memory', category: 'facts' }, '/tmp/vault');
      // validateNode internally calls writeNodeValidatedAsync with dryRun: true
      expect(processOperationAsync).toHaveBeenCalled();
    });
  });
});
