import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_GATE_MODE, gateConfigPath, projectBrainDir, readGateLayers, resolveGateMode, writeGateMode } from './gate-mode.mjs';

let dir;
let globalBrainDir;
let root;

const write = (brain, value) => {
  fs.mkdirSync(path.join(brain, 'config'), { recursive: true });
  fs.writeFileSync(gateConfigPath(brain), typeof value === 'string' ? value : JSON.stringify(value));
};
const modeOf = (kind, plugin) => resolveGateMode(readGateLayers({ globalBrainDir, root }), kind, plugin);

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-gate-mode-'));
  globalBrainDir = path.join(dir, 'global');
  root = path.join(dir, 'repo');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('gate modes', () => {
  it('enforces by default', () => {
    expect(DEFAULT_GATE_MODE).toBe('enforce');
    expect(modeOf('router')).toBe('enforce');
    expect(modeOf('owned', 'mesh')).toBe('enforce');
  });
  it('ignores off/warn overrides and stays enforced', () => {
    write(globalBrainDir, { default: 'off', router: 'warn', plugins: { mesh: 'off', 'git-sentinel': 'warn' } });
    write(projectBrainDir(root), { default: 'off', plugins: { mesh: 'off' } });
    expect(modeOf('router')).toBe('enforce');
    expect(modeOf('owned', 'mesh')).toBe('enforce');
    expect(modeOf('owned', 'git-sentinel')).toBe('enforce');
  });
  it('treats a bad file or unknown value as enforce', () => {
    for (const bad of ['{ not json', '[]', 'null', '{"default":"block","router":7,"plugins":{"mesh":"yes"}}']) {
      write(globalBrainDir, bad);
      expect(modeOf('router'), bad).toBe('enforce');
      expect(modeOf('owned', 'mesh'), bad).toBe('enforce');
    }
  });
});

describe('writeGateMode', () => {
  it('accepts enforce and leaves other settings intact', () => {
    write(globalBrainDir, { default: 'enforce', plugins: { mesh: 'enforce' } });
    const file = writeGateMode(globalBrainDir, { mode: 'enforce', plugin: 'git-sentinel' });
    expect(file).toBe(gateConfigPath(globalBrainDir));
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ default: 'enforce', plugins: { mesh: 'enforce', 'git-sentinel': 'enforce' } });
  });
  it('refuses off, warn, or null overrides', () => {
    for (const mode of ['off', 'warn', null]) {
      expect(() => writeGateMode(globalBrainDir, { mode, plugin: 'mesh' })).toThrow(/permanently enforced/);
      expect(() => writeGateMode(projectBrainDir(root), { mode, router: true })).toThrow(/permanently enforced/);
    }
  });
  it('creates the config folder when writing enforce', () => {
    const file = writeGateMode(globalBrainDir, { mode: 'enforce' });
    expect(file).toBe(gateConfigPath(globalBrainDir));
    expect(modeOf('router')).toBe('enforce');
  });
});
