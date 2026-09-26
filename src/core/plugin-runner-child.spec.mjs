import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const childEntry = path.resolve('src/core/plugin-runner-child.mjs');

describe('plugin runner child entry', () => {
  let root;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-plugin-child-'));
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('calls a default handler with only its arguments', () => {
    const handler = path.join(root, 'default.mjs');
    fs.writeFileSync(handler, 'export default (args) => console.log(JSON.stringify(args));');
    const result = spawnSync(process.execPath, [childEntry, handler, 'plugin', 'status'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual(['status']);
  });

  it('fails clearly when the handler exports no entry point', () => {
    const handler = path.join(root, 'empty.mjs');
    fs.writeFileSync(handler, 'export const value = 1;');
    const result = spawnSync(process.execPath, [childEntry, handler, 'plugin'], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('exports neither run() nor a default function');
  });
});
