import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureRequiredPlugins, inspectRequiredPlugins } from './required-plugins.mjs';

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function fixture() { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'required-auth-')); roots.push(root); return root; }

describe('required native auth installation', () => {
  it('rejects an incomplete package instead of manufacturing auth', () => {
    const root = fixture();
    expect(() => ensureRequiredPlugins(root, { sourceDir: path.join(root, 'missing-package') })).toThrow(/bundled auth/);
  });
  it('seeds a fresh brain from the packaged source and preserves an existing install', () => {
    const root = fixture();
    expect(inspectRequiredPlugins(root).status).toBe('failed');
    expect(ensureRequiredPlugins(root).status).toBe('ready');
    const file = path.join(root, 'plugins/auth/cli.mjs');
    fs.appendFileSync(file, '\n// retained owner customization\n');
    ensureRequiredPlugins(root);
    expect(fs.readFileSync(file, 'utf8')).toContain('retained owner customization');
  });
  it('fails on invalid manifests and missing executable modules without replacing them', () => {
    const root = fixture(); ensureRequiredPlugins(root);
    fs.rmSync(path.join(root, 'plugins/auth/src/secrets-store.mjs'));
    expect(inspectRequiredPlugins(root).status).toBe('failed');
    expect(() => ensureRequiredPlugins(root)).toThrow(/auth file/);
    fs.writeFileSync(path.join(root, 'plugins/auth/plugin.json'), '{}');
    expect(() => ensureRequiredPlugins(root)).toThrow(/auth plugin/);
  });
});
