import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  loadConfigSchema,
  setConfigValue,
  listCollections,
  parseCollectionItem,
  writeSkillConfig,
} from './skill-config.mjs';

const CLI = path.resolve('bin/total-recall.mjs');

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['language', 'gates'],
  properties: {
    language: { type: 'string', enum: ['node', 'python'], description: 'Primary language' },
    default_tier: { type: 'string', enum: ['fast', 'full'], default: 'fast' },
    gates: {
      type: 'array',
      'x-collection': 'gate',
      'x-key': 'name',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'command', 'tier'],
        properties: {
          name: { type: 'string', pattern: '^[a-z][a-z0-9-]*$' },
          command: { type: 'string', minLength: 1 },
          tier: { type: 'string', enum: ['fast', 'full'] },
        },
      },
    },
  },
};

const DETECT = `import fs from 'node:fs';
import path from 'node:path';
export function detect({ repoRoot }) {
  const python = fs.existsSync(path.join(repoRoot, 'pyproject.toml'));
  return {
    language: python ? 'python' : 'node',
    gates: [{ name: 'test', command: python ? 'pytest' : 'npm test', tier: 'full' }],
  };
}
`;

function cli(cwd, ...args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  let json = null;
  try { json = JSON.parse(result.stdout.trim().split('\n').at(-1)); } catch { /* text output */ }
  return { ...result, json };
}

describe('layered skill repo-layer config', () => {
  let repo;
  let skillDir;
  let configFile;

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-skill-config-'));
    skillDir = path.join(repo, '.agent', 'skills', 'quality');
    fs.mkdirSync(path.join(skillDir, 'core'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: quality\n---\n# Quality\n');
    fs.writeFileSync(path.join(skillDir, 'core', 'config.schema.json'), JSON.stringify(SCHEMA));
    fs.writeFileSync(path.join(skillDir, 'core', 'detect.mjs'), DETECT);
    configFile = path.join(skillDir, 'config.json');
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('initializes from schema defaults plus detection through the real CLI', () => {
    fs.writeFileSync(path.join(repo, 'pyproject.toml'), '[project]\nname = "x"\n');
    const init = cli(repo, 'skill', 'config', 'quality', 'init', '--yes', '--json');
    expect(init.status).toBe(0);
    expect(JSON.parse(fs.readFileSync(configFile, 'utf8'))).toEqual({
      language: 'python',
      default_tier: 'fast',
      gates: [{ name: 'test', command: 'pytest', tier: 'full' }],
    });
    const again = cli(repo, 'skill', 'config', 'quality', 'init', '--json');
    expect(again.status).toBe(1);
    expect(again.json.error).toMatch(/already exists/);
  });

  it('validates every set and leaves config.json byte-identical on rejection', () => {
    expect(cli(repo, 'skill', 'config', 'quality', 'init', '--yes').status).toBe(0);
    expect(cli(repo, 'skill', 'config', 'quality', 'set', 'default_tier', 'full').status).toBe(0);
    expect(JSON.parse(fs.readFileSync(configFile, 'utf8')).default_tier).toBe('full');

    const before = fs.readFileSync(configFile);
    const badEnum = cli(repo, 'skill', 'config', 'quality', 'set', 'default_tier', 'slow', '--json');
    expect(badEnum.status).toBe(2);
    expect(badEnum.json.issues.join('\n')).toMatch(/default_tier/);
    const unknownKey = cli(repo, 'skill', 'config', 'quality', 'set', 'surprise', '1', '--json');
    expect(unknownKey.status).toBe(2);
    const dropRequired = cli(repo, 'skill', 'config', 'quality', 'unset', 'language', '--json');
    expect(dropRequired.status).toBe(2);
    const proto = cli(repo, 'skill', 'config', 'quality', 'set', '__proto__.polluted', 'true', '--json');
    expect(proto.status).toBe(2);
    expect(fs.readFileSync(configFile).equals(before)).toBe(true);
    expect(fs.readdirSync(skillDir).filter((f) => f.endsWith('.tmp'))).toEqual([]);

    const got = cli(repo, 'skill', 'config', 'quality', 'get', 'gates', '--json');
    expect(got.json.value).toEqual([{ name: 'test', command: 'npm test', tier: 'full' }]);
  });

  it('exposes x-collection arrays as add/remove/list verbs', () => {
    expect(cli(repo, 'skill', 'config', 'quality', 'init', '--yes').status).toBe(0);
    const added = cli(repo, 'skill', 'config', 'quality', 'gate', 'add', 'name=lint', 'command=npm run lint', 'tier=fast', '--json');
    expect(added.status).toBe(0);
    const dup = cli(repo, 'skill', 'config', 'quality', 'gate', 'add', '{"name":"lint","command":"x","tier":"fast"}', '--json');
    expect(dup.status).toBe(2);
    const invalid = cli(repo, 'skill', 'config', 'quality', 'gate', 'add', 'name=types', 'command=tsc', '--json');
    expect(invalid.status).toBe(2); // missing required tier
    const listed = cli(repo, 'skill', 'config', 'quality', 'gate', 'list', '--json');
    expect(listed.json.items.map((g) => g.name)).toEqual(['test', 'lint']);
    expect(cli(repo, 'skill', 'config', 'quality', 'gate', 'remove', 'test').status).toBe(0);
    expect(cli(repo, 'skill', 'config', 'quality', 'gate', 'remove', 'test', '--json').status).toBe(1);
    expect(JSON.parse(fs.readFileSync(configFile, 'utf8')).gates.map((g) => g.name)).toEqual(['lint']);
  });

  it('detect proposes without writing and refuses to overwrite without --force', () => {
    const proposed = cli(repo, 'skill', 'config', 'quality', 'detect', '--json');
    expect(proposed.status).toBe(0);
    expect(proposed.json.valid).toBe(true);
    expect(fs.existsSync(configFile)).toBe(false);

    expect(cli(repo, 'skill', 'config', 'quality', 'detect', '--apply').status).toBe(0);
    expect(cli(repo, 'skill', 'config', 'quality', 'set', 'default_tier', 'full').status).toBe(0);
    expect(cli(repo, 'skill', 'config', 'quality', 'detect', '--apply', '--json').status).toBe(1);
    expect(JSON.parse(fs.readFileSync(configFile, 'utf8')).default_tier).toBe('full');
    expect(cli(repo, 'skill', 'config', 'quality', 'detect', '--apply', '--force').status).toBe(0);
    expect(JSON.parse(fs.readFileSync(configFile, 'utf8')).default_tier).toBe('fast');
  });

  it('fails init non-interactively when required fields stay missing', () => {
    fs.rmSync(path.join(skillDir, 'core', 'detect.mjs'));
    const init = cli(repo, 'skill', 'config', 'quality', 'init', '--json');
    expect(init.status).toBe(2);
    expect(init.json.error).toMatch(/language, gates/);
    expect(fs.existsSync(configFile)).toBe(false);
  });

  it('refuses a skill without a contract and a symlinked config.json', () => {
    const noContract = path.join(repo, '.agent', 'skills', 'plain');
    fs.mkdirSync(noContract, { recursive: true });
    const missing = cli(repo, 'skill', 'config', 'plain', 'get', '--json');
    expect(missing.status).toBe(1);
    expect(missing.json.error).toMatch(/config\.schema\.json/);

    const outside = path.join(repo, 'outside.json');
    fs.writeFileSync(outside, '{}');
    fs.symlinkSync(outside, configFile);
    const linked = cli(repo, 'skill', 'config', 'quality', 'set', 'default_tier', 'full', '--json');
    expect(linked.status).toBe(1);
    expect(fs.readFileSync(outside, 'utf8')).toBe('{}');
  });

  it('generates a per-skill command in the repo and dispatches it through the CLI', () => {
    const brain = path.join(repo, '.agent', 'skills', 'total-recall');
    fs.mkdirSync(brain, { recursive: true });
    fs.writeFileSync(path.join(brain, 'SKILL.md'), '# Test brain\n');
    const created = cli(repo, 'command', 'create', 'quality', '--config-for-skill', 'quality');
    expect(created.status).toBe(0);
    expect(fs.existsSync(path.join(repo, '.agent', 'commands', 'quality.mjs'))).toBe(true);

    expect(cli(repo, 'quality', 'init', '--yes').status).toBe(0);
    expect(cli(repo, 'quality', 'gate', 'add', 'name=lint', 'command=npm run lint', 'tier=fast').status).toBe(0);
    const listed = cli(repo, 'quality', 'gate', 'list', '--json');
    expect(listed.status).toBe(0);
    expect(listed.json.items.map((g) => g.name)).toEqual(['test', 'lint']);
    const bad = cli(repo, 'quality', 'config', 'set', 'language', 'rust', '--json');
    expect(bad.status).toBe(2);
    const help = cli(repo, 'quality', 'help');
    expect(help.stdout).toContain('total-recall quality gate list|add|remove');

    const noSkill = cli(repo, 'command', 'create', 'other', '--config-for-skill', 'missing-skill');
    expect(noSkill.status).toBe(1);
    expect(fs.existsSync(path.join(repo, '.agent', 'commands', 'other.mjs'))).toBe(false);
  });

  it('keeps helper semantics narrow', () => {
    const contract = loadConfigSchema(skillDir);
    expect(listCollections(contract.schema)).toEqual({ gate: { property: 'gates', key: 'name' } });
    expect(parseCollectionItem(['name=a', 'nested.depth=2'])).toEqual({ name: 'a', nested: { depth: 2 } });
    expect(() => setConfigValue({ a: 'x' }, 'a.b', 1)).toThrow(/non-object/);
    expect(() => setConfigValue({}, 'constructor.prototype', 1)).toThrow(/Invalid config path/);
    expect(() => writeSkillConfig(skillDir, contract, { language: 'node' })).toThrow(/gates/);
    expect(fs.existsSync(configFile)).toBe(false);
  });
});
