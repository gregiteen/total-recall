import { describe, it, expect } from 'vitest';
import runAgent, { parseSpawnArgs } from './agent.mjs';

describe('agent.mjs', () => {
  it('exports default function', () => {
    expect(runAgent).toBeDefined();
    expect(typeof runAgent).toBe('function');
  });
});

describe('parseSpawnArgs', () => {
  it('keeps option values out of the task text', () => {
    const p = parseSpawnArgs(['agy', 'Crawl', 'preprints', '--name', 'Quantum Scout', '--node', 'build-box']);
    expect(p).toMatchObject({ harness: 'agy', task: 'Crawl preprints', name: 'Quantum Scout', targetNode: 'build-box' });
  });

  it('accepts --cwd, --tools (including an empty value) and their aliases', () => {
    expect(parseSpawnArgs(['claude', 't', '--cwd', '/w', '--tools', ''])).toMatchObject({ cwd: '/w', tools: '' });
    expect(parseSpawnArgs(['claude', 't', '--allow-tools=Bash,Read'])).toMatchObject({ tools: 'Bash,Read' });
    expect(parseSpawnArgs(['claude', 't', '--no-tools'])).toMatchObject({ tools: 'none' });
    expect(parseSpawnArgs(['claude', 't', '--setting-sources', 'local', '--no-detach', '--json'])).toMatchObject({
      settingSources: 'local', detach: false, isJson: true,
    });
  });

  it('rejects unknown options and missing values instead of folding them into the task', () => {
    expect(() => parseSpawnArgs(['claude', 't', '--bogus'])).toThrow(/Unknown option/);
    expect(() => parseSpawnArgs(['claude', 't', '--cwd'])).toThrow(/requires a value/);
  });
});
