// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { composedCommandDirectories, resolveComposedCommand } from './composed-command-resolution.mjs';
import { globalAgentDir } from './config.mjs';
import { listSurfaceCommands } from './command-surface.mjs';
import { commandDirsFor } from './surface.mjs';

let dir, saved;
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'composed-resolution-'));
  saved = { AGENT_DIR: process.env.AGENT_DIR, _TR_TEST_AGENT_DIR: process.env._TR_TEST_AGENT_DIR };
  delete process.env.AGENT_DIR; delete process.env._TR_TEST_AGENT_DIR;
});
afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  for (const name of ['resolution-team', 'resolution-other']) {
    fs.rmSync(path.join(globalAgentDir, 'skills/total-recall/groups', `${name}.md`), { force: true });
    fs.rmSync(path.join(globalAgentDir, 'commands/groups', name), { recursive: true, force: true });
  }
});

describe('shared composed execution scopes', () => {
  it.each(['.agent', '.agents'])('binds nested execution to %s and exact groups without importing code', agentName => {
    const agent = path.join(dir, agentName), nested = path.join(dir, 'src/nested');
    fs.mkdirSync(nested, { recursive: true });
    fs.mkdirSync(path.join(agent, 'skills/total-recall/memory-vault'), { recursive: true });
    write(path.join(agent, 'skills/total-recall/config/brain.json'), '{"project_id":"resolution-id"}');
    for (const [name, member] of [['resolution-team', 'resolution-id'], ['resolution-other', 'resolution-id-longer']]) {
      write(path.join(globalAgentDir, 'skills/total-recall/groups', `${name}.md`), `---\nmembers: [${member}]\n---\n`);
      write(path.join(globalAgentDir, 'commands/groups', name, 'resolution-proof.mjs'), 'throw new Error("discovery must not import");');
    }
    const dirs = composedCommandDirectories(nested);
    expect(dirs.map(row => row.scope)).toEqual(['project', 'group', 'global']);
    expect(dirs[0].dir).toBe(path.join(agent, 'commands'));
    expect(commandDirsFor(path.join(agent, 'skills'))).toEqual(dirs);
    const groupFile = path.join(globalAgentDir, 'commands/groups/resolution-team/resolution-proof.mjs');
    expect(resolveComposedCommand('resolution-proof', dirs)).toBe(groupFile);
    expect(listSurfaceCommands(dirs).find(row => row.name === 'resolution-proof')?.scope).toBe('group');
    write(path.join(agent, 'commands/resolution-proof.mjs'), 'throw new Error("still static");');
    expect(resolveComposedCommand('resolution-proof', dirs)).toBe(path.join(agent, 'commands/resolution-proof.mjs'));
    fs.rmSync(path.join(globalAgentDir, 'skills/total-recall/groups/resolution-team.md'));
    fs.rmSync(path.join(agent, 'commands/resolution-proof.mjs'));
    expect(resolveComposedCommand('resolution-proof', composedCommandDirectories(nested))).toBeNull();
  });

  it('preserves explicit root selection and refuses traversal names', () => {
    process.env.AGENT_DIR = globalAgentDir;
    expect(composedCommandDirectories(dir)[0]).toEqual({ scope: 'project', dir: path.join(globalAgentDir, 'commands') });
    expect(resolveComposedCommand('../outside', [{ dir }])).toBeNull();
    expect(resolveComposedCommand('constructor', [{ dir }])).toBeNull();
  });
});
