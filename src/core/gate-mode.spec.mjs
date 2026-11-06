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
  it('warns when nothing is set', () => {
    expect(DEFAULT_GATE_MODE).toBe('warn');
    expect(modeOf('router')).toBe('warn');
    expect(modeOf('owned', 'mesh')).toBe('warn');
  });
  it('reads machine settings, with a plugin or router setting over the default', () => {
    write(globalBrainDir, { default: 'off', router: 'enforce', plugins: { mesh: 'enforce' } });
    expect(modeOf('router')).toBe('enforce');
    expect(modeOf('owned', 'mesh')).toBe('enforce');
    expect(modeOf('owned', 'git-sentinel')).toBe('off');
  });
  it('lets the repository win over the machine', () => {
    write(globalBrainDir, { default: 'enforce', plugins: { mesh: 'enforce' } });
    write(projectBrainDir(root), { default: 'off' });
    expect(modeOf('owned', 'mesh')).toBe('off');
    expect(modeOf('router')).toBe('off');
  });
  it('follows the machine for anything the repository leaves unset', () => {
    write(globalBrainDir, { plugins: { mesh: 'enforce' } });
    write(projectBrainDir(root), { plugins: { 'git-sentinel': 'off' } });
    expect(modeOf('owned', 'mesh')).toBe('enforce');
    expect(modeOf('owned', 'git-sentinel')).toBe('off');
  });
  it('treats a bad file or unknown value as unset, so settings can never be what blocks work', () => {
    for (const bad of ['{ not json', '[]', 'null', '{"default":"block","router":7,"plugins":{"mesh":"yes"}}']) {
      write(globalBrainDir, bad);
      expect(modeOf('router'), bad).toBe('warn');
      expect(modeOf('owned', 'mesh'), bad).toBe('warn');
    }
  });
});

describe('writeGateMode', () => {
  it('changes one setting and leaves the rest', () => {
    write(globalBrainDir, { default: 'warn', plugins: { mesh: 'off' } });
    writeGateMode(globalBrainDir, { mode: 'enforce', plugin: 'git-sentinel' });
    writeGateMode(globalBrainDir, { mode: 'off', router: true });
    expect(JSON.parse(fs.readFileSync(gateConfigPath(globalBrainDir), 'utf8'))).toEqual({ default: 'warn', router: 'off', plugins: { mesh: 'off', 'git-sentinel': 'enforce' } });
  });
  it('removes a setting so that level follows the next layer again', () => {
    write(globalBrainDir, { default: 'enforce' });
    writeGateMode(projectBrainDir(root), { mode: 'off', plugin: 'mesh' });
    expect(modeOf('owned', 'mesh')).toBe('off');
    writeGateMode(projectBrainDir(root), { mode: null, plugin: 'mesh' });
    expect(modeOf('owned', 'mesh')).toBe('enforce');
  });
  it('creates the config folder when it is missing', () => {
    const file = writeGateMode(globalBrainDir, { mode: 'off' });
    expect(file).toBe(gateConfigPath(globalBrainDir));
    expect(modeOf('router')).toBe('off');
  });
});
