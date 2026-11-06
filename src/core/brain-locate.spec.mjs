import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { detectProjectBrain as located } from './brain-locate.mjs';
import { detectProjectBrain as configured } from './local-config.mjs';

describe('brain-locate', () => {
  it('imports nothing but Node, because the gate runs it on tool calls', () => {
    const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'brain-locate.mjs'), 'utf8');
    const imports = [...source.matchAll(/^import .* from '([^']+)';$/gm)].map((match) => match[1]);
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.every((name) => name.startsWith('node:'))).toBe(true);
  });
  it('is the one implementation the config module also exports', () => {
    expect(configured).toBe(located);
  });
});
