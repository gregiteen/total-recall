// A fixed evaluation corpus. Used only by specs; never an operational brain.
import fs from 'node:fs';
import path from 'node:path';
import { buildLocalSearchIndex } from '../../src/core/fast-recall.mjs';
import { saveEmbeddingToIndex } from '../../src/core/embeddings.mjs';
import { safeStringify } from '../../src/core/vault.mjs';
import { recordAccess } from '../../src/core/access-ledger.mjs';

export function createFieldFixture(root) {
  const vaultDir = path.join(root, 'memory-vault');
  const derivedDir = path.join(root, 'memory-derived');
  const definitions = [
    ['a-stale-guide', 'Deployment reference', 'deploy rollback', 1, [1, 0]],
    ['b-current-guide', 'Release reference', 'deploy rollback', 5, [1, .1]],
    ['c-recovery-policy', 'Recovery reference', 'rollback restore', 5, [.9, .1]],
    ['d-storage-guide', 'Storage reference', 'backups restore storage', 3, [0, 1]],
    ['e-unembedded', 'Missing reference', 'deploy missing', 2, null],
    ['f-archived', 'Archived reference', 'deploy old', 5, [1, 0]],
  ];
  const nodes = definitions.map(([slug, title, body, importance, vector]) => {
    const category = slug === 'c-recovery-policy' ? 'invariants' : 'facts';
    const node = { type: 'memory', slug, title, body, category, importance, priority: 'normal',
      status: slug === 'f-archived' ? 'archived' : 'active', tags: [],
      created: '2026-01-01T00:00:00Z', updated: '2026-01-01T00:00:00Z',
      last_accessed: '2026-01-01T00:00:00Z', decay: { half_life_days: 30, access_count: 0 } };
    const file = path.join(vaultDir, category, `${slug}.md`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, safeStringify(body, node));
    if (vector) saveEmbeddingToIndex(derivedDir, slug, [...vector, ...Array(766).fill(0)]);
    return { ...node, _filePath: file };
  });
  for (const day of ['2026-11-07', '2026-11-08', '2026-11-09']) {
    recordAccess(derivedDir, ['d-storage-guide'], new Date(`${day}T12:00:00Z`));
  }
  for (let count = 0; count < 10; count++) {
    recordAccess(derivedDir, ['b-current-guide'], new Date('2026-11-09T12:00:00Z'));
  }
  buildLocalSearchIndex(nodes, { vaultDir, derivedDir });
  return { vaultDir, derivedDir, nodes };
}
