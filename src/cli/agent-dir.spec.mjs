import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import {
  parseLayerFlag,
  getGlobalAgentDir,
  getGlobalBrainDir,
  detectProjectBrain,
  resolveAgentDir,
  resolveBrainDir,
  getBothBrains,
  defaultLayerForCategory,
} from './agent-dir.mjs';

describe('agent-dir.mjs', () => {
  it('exports parseLayerFlag', () => {
    expect(parseLayerFlag).toBeDefined();
  });
  it('exports getGlobalAgentDir', () => {
    expect(getGlobalAgentDir).toBeDefined();
  });
  it('exports getGlobalBrainDir', () => {
    expect(getGlobalBrainDir).toBeDefined();
  });
  it('exports detectProjectBrain', () => {
    expect(detectProjectBrain).toBeDefined();
  });
  it('exports resolveAgentDir', () => {
    expect(resolveAgentDir).toBeDefined();
  });
  it('exports resolveBrainDir', () => {
    expect(resolveBrainDir).toBeDefined();
  });
  it('exports getBothBrains', () => {
    expect(getBothBrains).toBeDefined();
  });
  it('exports defaultLayerForCategory', () => {
    expect(defaultLayerForCategory).toBeDefined();
  });

  it('parseLayerFlag extracts --global / --project', () => {
    expect(parseLayerFlag(['remember', 'fact', 'x', '--global']).layer).toBe('global');
    expect(parseLayerFlag(['forget', 'slug', '--project']).layer).toBe('project');
    expect(parseLayerFlag(['forget', 'slug']).layer).toBe('auto');
  });

  it('resolveBrainDir("global") is always the home brain', () => {
    expect(resolveBrainDir('global')).toBe(getGlobalBrainDir());
  });

  it('resolveBrainDir("project") returns project brain when present in this repo', () => {
    const project = detectProjectBrain(process.cwd());
    if (!project) {
      // CI / bare checkouts may lack a project brain — skip assertion
      expect(project).toBeNull();
      return;
    }
    expect(resolveBrainDir('project')).toBe(project.brainDir);
    expect(resolveBrainDir('project')).not.toBe(getGlobalBrainDir());
    expect(resolveBrainDir('auto')).toBe(project.brainDir);
  });

  it('resolveBrainDir respects AGENT_DIR override', () => {
    const prev = process.env.AGENT_DIR;
    try {
      process.env.AGENT_DIR = path.join(os.tmpdir(), 'tr-agent-override-test');
      expect(resolveBrainDir('project')).toBe(
        path.join(process.env.AGENT_DIR, 'skills', 'total-recall'),
      );
      expect(resolveBrainDir('global')).toBe(
        path.join(process.env.AGENT_DIR, 'skills', 'total-recall'),
      );
    } finally {
      if (prev === undefined) delete process.env.AGENT_DIR;
      else process.env.AGENT_DIR = prev;
    }
  });
});
