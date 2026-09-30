import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import run from './help.mjs';
afterEach(() => vi.restoreAllMocks());
describe('offline CLI help', () => {
  it('ships the reference required by installed help', () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../package.json')));
    expect(manifest.files).toContain('docs/reference/cli-reference.md');
  });
  it.each(['daemon', 'server', 'startup', 'research'])('returns usable JSON for %s', async topic => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('help failed'); });
    await run([topic, '--json']);
    expect(exit).not.toHaveBeenCalled();
    const result = JSON.parse(log.mock.calls[0][0]);
    expect(result.documentation).toContain('total-recall');
  });
});
