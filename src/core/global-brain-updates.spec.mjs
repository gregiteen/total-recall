import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { updateGlobalBrainPackages, findLinkedSourceCheckout } from './global-brain-updates.mjs';

function fakeGlobalRoot() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-global-'));
  const root = path.join(base, 'lib', 'node_modules');
  const checkout = path.join(base, 'src', 'total-recall');
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(path.join(checkout, '.git'), { recursive: true });
  fs.writeFileSync(path.join(checkout, 'package.json'), JSON.stringify({ name: 'total-recall-brain', version: '3.41.1' }));
  return { base, root, checkout };
}

function execFor(root, calls) {
  return (cmd, args) => {
    calls.push([cmd, ...args].join(' '));
    if (args[0] === 'root') return { status: 0, stdout: `${root}\n` };
    return { status: 0, stdout: '' };
  };
}

describe('updateGlobalBrainPackages', () => {
  it('updates a source checkout linked under a legacy name instead of installing over it', () => {
    const { base, root, checkout } = fakeGlobalRoot();
    try {
      fs.symlinkSync(checkout, path.join(root, 'total-recall'));
      expect(findLinkedSourceCheckout(root, 'total-recall-brain')).toBe(fs.realpathSync(checkout));
      const calls = [], sourced = [];
      const result = updateGlobalBrainPackages({
        versions: { 'total-recall-brain': '3.41.2', '@gregiteen/ssss-cli': '0.11.2' },
        exec: execFor(root, calls),
        sourceUpdate: ({ directory }) => { sourced.push(directory); return { ok: true, installed: '3.41.2', commit: 'abc' }; },
      });
      expect(sourced).toEqual([fs.realpathSync(checkout)]);
      const brain = result.results.find((row) => row.package === 'total-recall-brain');
      expect(brain).toMatchObject({ status: 'updated', source: true });
      expect(calls.some((c) => c.includes('install') && c.includes('total-recall-brain@'))).toBe(false);
    } finally { fs.rmSync(base, { recursive: true, force: true }); }
  });

  it('reports a linked checkout a live server runs from as serving, not failed', () => {
    const { base, root, checkout } = fakeGlobalRoot();
    try {
      fs.symlinkSync(checkout, path.join(root, 'total-recall'));
      const result = updateGlobalBrainPackages({
        versions: { 'total-recall-brain': '3.41.2', '@gregiteen/ssss-cli': '0.11.2' },
        exec: execFor(root, []),
        sourceUpdate: () => ({ ok: false, serving: true, error: 'A live server runs from this checkout.' }),
      });
      expect(result.results.find((row) => row.package === 'total-recall-brain')).toMatchObject({ status: 'serving', source: true });
      expect(result.results.find((row) => row.package === 'total-recall-brain').error).toBeUndefined();
    } finally { fs.rmSync(base, { recursive: true, force: true }); }
  });

  it('reports the global root, so a later step can tell what a restart would start', () => {
    const { base, root } = fakeGlobalRoot();
    try {
      const report = updateGlobalBrainPackages({ versions: { 'total-recall-brain': '3.41.2' }, exec: execFor(root, []), sourceUpdate: () => { throw new Error('unexpected'); } });
      expect(report.root).toBe(root);
    } finally { fs.rmSync(base, { recursive: true, force: true }); }
  });

  it('still installs from the registry when no install or source link exists', () => {
    const { base, root } = fakeGlobalRoot();
    try {
      const calls = [];
      updateGlobalBrainPackages({ versions: { 'total-recall-brain': '3.41.2' }, exec: execFor(root, calls), sourceUpdate: () => { throw new Error('unexpected'); } });
      expect(calls.some((c) => c.startsWith('npm install --global') && c.includes('total-recall-brain@3.41.2'))).toBe(true);
    } finally { fs.rmSync(base, { recursive: true, force: true }); }
  });
});
