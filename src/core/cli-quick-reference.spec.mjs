import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLI_QUICK_REFERENCE, CLI_QUICK_REFERENCE_COMMANDS } from './cli-quick-reference.mjs';
import { buildRulesBlock } from './surface.mjs';
import { ruleFingerprint } from './context-policy.mjs';

const bin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../bin/total-recall.mjs');

describe('CLI quick reference', () => {
  it('leads the bootstrap block, before any rule', async () => {
    const rule = { slug: 'short', category: 'invariants', status: 'active', body: 'Historical detail '.repeat(400) };
    const policy = { slug: 'routing', category: 'decisions', status: 'active', tags: ['context:policy'],
      body: JSON.stringify({ rules: { 'project:short': { source_hash: ruleFingerprint(rule), actions: ['universal'], directive: 'Preserve data.' } } }) };
    const block = await buildRulesBlock(null, [rule, policy], { bootstrap: true });
    const ref = block.indexOf('TOTAL RECALL CLI — USE IT FOR EVERYTHING');
    const first = block.indexOf('Preserve data.');
    expect(ref).toBeGreaterThan(-1);
    expect(first).toBeGreaterThan(-1);
    expect(ref).toBeLessThan(first);
  });

  it('lists only commands that exist in total-recall --help', () => {
    const help = execFileSync('node', [bin, '--help'], { encoding: 'utf8' });
    for (const command of CLI_QUICK_REFERENCE_COMMANDS) {
      expect(help, `${command} missing from --help`).toContain(command);
      expect(CLI_QUICK_REFERENCE, `${command} missing from the reference`).toContain(command);
    }
  });

  it('places command inventory before startup instructions', async () => {
    const block = await buildRulesBlock(null, [], { bootstrap: true, total: 20000 });
    expect(block.indexOf('Built-in commands:')).toBeLessThan(block.indexOf('MANDATORY FIRST STEP'));
  });
});
