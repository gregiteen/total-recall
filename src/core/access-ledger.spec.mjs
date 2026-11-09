import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recordAccess, readAccess, lastUsedMs, activeDays, activeDaysSince } from './access-ledger.mjs';
import { recordCapsuleAccess } from './context-compiler.mjs';

describe('memory access ledger (DECAY-01)', () => {
  const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tr-ledger-'));

  it('records each use with its time and count, and reads a missing or damaged ledger as empty', () => {
    const dir = temp();
    expect(readAccess(dir)).toEqual({});
    expect(recordAccess(dir, ['a', 'b', 'a'], new Date('2026-11-01T00:00:00Z'))).toBe(true);
    expect(recordAccess(dir, ['a'], new Date('2026-11-02T00:00:00Z'))).toBe(true);
    const ledger = readAccess(dir);
    expect(ledger.a).toEqual({ last_accessed: '2026-11-02T00:00:00.000Z', count: 2 });
    expect(ledger.b).toEqual({ last_accessed: '2026-11-01T00:00:00.000Z', count: 1 });
    expect(activeDays(ledger)).toEqual(['2026-11-01', '2026-11-02']);
    expect(activeDaysSince(ledger, new Date('2026-11-01T12:00:00Z').getTime())).toBe(1);
    fs.writeFileSync(path.join(dir, 'access-ledger.json'), '{ broken');
    expect(readAccess(dir)).toEqual({});
    expect(recordAccess(null, ['a'])).toBe(false);
    expect(recordAccess(dir, [])).toBe(false);
  });

  it('takes the latest of the ledger and the memory\'s own stamps', () => {
    const node = { slug: 'x', created: '2026-01-01T00:00:00Z', last_accessed: '2026-02-01T00:00:00Z' };
    expect(lastUsedMs(node, {})).toBe(new Date('2026-02-01T00:00:00Z').getTime());
    expect(lastUsedMs(node, { x: { last_accessed: '2026-03-01T00:00:00Z' } })).toBe(new Date('2026-03-01T00:00:00Z').getTime());
  });

  it('a capsule records project memories in its own brain and global rules in the global brain', () => {
    const project = temp(), global = temp();
    recordCapsuleAccess(project, [{ slug: 'own-rule' }, { slug: 'shared-rule', _layer: 'global' }],
      [{ id: 'vault:project:own-fact' }, { id: 'vault:global:shared-fact' }, { id: 'plugin:openwiki:page.md:1' }], global);
    const memories = ledger => Object.keys(ledger).filter(key => key !== '_active_days').sort();
    expect(memories(readAccess(project))).toEqual(['own-fact', 'own-rule']);
    expect(memories(readAccess(global))).toEqual(['shared-fact', 'shared-rule']);
    expect(activeDays(readAccess(project))).toHaveLength(1);
    expect(activeDays(readAccess(global))).toHaveLength(1);
  });
});
