import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import matter from 'gray-matter';
import {
  loadConfigSchema,
  setConfigValue,
  listCollections,
  parseCollectionItem,
  writeSkillConfig,
  resolveCommand,
  collectCommandValues,
  checkSkillLayerContract,
} from './skill-config.mjs';
import { emptyRegistry, saveRegistry, skillStatus } from './skills-registry.mjs';
import { verifyApplication } from './app-deploy/verify.mjs';

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
          command: { type: 'string', minLength: 1, 'x-command': true },
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
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, AGENT_DIR: path.join(cwd, '.agent'), NO_COLOR: '1' } });
  let json = null;
  try { json = JSON.parse(result.stdout.trim().split('\n').at(-1)); } catch { /* text output */ }
  return { ...result, json };
}

describe('layered skill repo-layer config', () => {
  let repo;
  let skillDir;
  let configFile;
  let recordFile;

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-skill-config-'));
    skillDir = path.join(repo, '.agent', 'skills', 'quality');
    fs.mkdirSync(path.join(skillDir, 'core'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: quality\n---\n# Quality\n');
    fs.writeFileSync(path.join(skillDir, 'core', 'config.schema.json'), JSON.stringify(SCHEMA));
    fs.writeFileSync(path.join(skillDir, 'core', 'detect.mjs'), DETECT);
    configFile = path.join(skillDir, 'config.json');
    const brain = path.join(repo, '.agent', 'skills', 'total-recall');
    fs.mkdirSync(brain, { recursive: true });
    fs.writeFileSync(path.join(brain, 'SKILL.md'), '# Test brain\n');
    recordFile = path.join(brain, 'memory-vault', 'system', 'skills', 'quality.md');
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

  it('commits a skill_config record through the operation service and projects config.json from it', () => {
    expect(cli(repo, 'skill', 'config', 'quality', 'init', '--yes').status).toBe(0);
    const record = matter(fs.readFileSync(recordFile, 'utf8')).data;
    expect(record.type).toBe('skill_config');
    expect(record.skill_id).toBe('quality');
    expect(record.schema_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(record.config).toEqual(JSON.parse(fs.readFileSync(configFile, 'utf8')));
    const events = path.join(repo, '.agent', 'skills', 'total-recall', 'memory-vault', '.events');
    expect(fs.existsSync(events)).toBe(true);

    expect(cli(repo, 'skill', 'config', 'quality', 'set', 'default_tier', 'full').status).toBe(0);
    const updated = matter(fs.readFileSync(recordFile, 'utf8')).data;
    expect(updated.config.default_tier).toBe('full');
    expect(updated.updated_at).toBeTruthy();
    expect(new Date(updated.created_at).toISOString()).toBe(new Date(record.created_at).toISOString());
    expect(cli(repo, 'skill', 'config', 'quality', 'validate', '--json').json).toMatchObject({ ok: true, in_sync: true });
  });

  it('reports a hand-edited config.json as drift and rebuilds it from the record', () => {
    expect(cli(repo, 'skill', 'config', 'quality', 'init', '--yes').status).toBe(0);
    const canonical = fs.readFileSync(configFile, 'utf8');
    fs.writeFileSync(configFile, JSON.stringify({ language: 'python', gates: [] }));
    const drift = cli(repo, 'skill', 'config', 'quality', 'validate', '--json');
    expect(drift.status).toBe(1);
    expect(drift.json.error).toMatch(/drifted/);
    // Reads come from the record, not the hand-edited projection.
    expect(cli(repo, 'skill', 'config', 'quality', 'get', 'language', '--json').json.value).toBe('node');
    expect(cli(repo, 'skill', 'config', 'quality', 'rebuild').status).toBe(0);
    expect(fs.readFileSync(configFile, 'utf8')).toBe(canonical);
  });

  it('adopts an existing config.json with import', () => {
    const existing = { language: 'python', default_tier: 'full', gates: [{ name: 'lint', command: 'flake8', tier: 'fast' }] };
    fs.writeFileSync(configFile, JSON.stringify(existing));
    const before = cli(repo, 'skill', 'config', 'quality', 'validate', '--json');
    expect(before.status).toBe(1);
    expect(before.json.error).toMatch(/config import/);
    expect(cli(repo, 'skill', 'config', 'quality', 'import', '--json').json).toMatchObject({ ok: true, imported: true });
    expect(matter(fs.readFileSync(recordFile, 'utf8')).data.config).toEqual(existing);
    expect(cli(repo, 'skill', 'config', 'quality', 'import', '--json').json.imported).toBe(false);
    expect(cli(repo, 'skill', 'config', 'quality', 'validate').status).toBe(0);
  });

  it('refuses to write without the repo\'s own project brain', () => {
    fs.rmSync(path.join(repo, '.agent', 'skills', 'total-recall'), { recursive: true });
    const init = cli(repo, 'skill', 'config', 'quality', 'init', '--yes', '--json');
    expect(init.status).toBe(1);
    expect(init.json.error).toMatch(/init --project/);
    expect(fs.existsSync(configFile)).toBe(false);
  });

  it('passes contract checks for a recorded, valid, in-sync config with resolvable gates', () => {
    expect(cli(repo, 'skill', 'config', 'quality', 'init', '--yes').status).toBe(0);
    expect(cli(repo, 'skill', 'config', 'quality', 'set', 'gates', JSON.stringify([{ name: 'probe', command: 'node --version', tier: 'fast' }])).status).toBe(0);
    const check = cli(repo, 'skill', 'config', 'quality', 'check', '--json');
    expect(check.status).toBe(0);
    expect(check.json.ok).toBe(true);
    expect(check.json.checks.map((c) => c.id)).toEqual(['contract', 'record', 'config', 'contract-version', 'projection', 'command:gates.0.command']);
  });

  it('fails contract checks for unresolvable gates and drift, and warns on a changed core contract', () => {
    fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ scripts: { lint: 'true' } }));
    expect(cli(repo, 'skill', 'config', 'quality', 'init', '--yes').status).toBe(0);
    const gates = [
      { name: 'ok-script', command: 'npm run lint', tier: 'fast' },
      { name: 'no-script', command: 'npm run nope', tier: 'fast' },
      { name: 'no-binary', command: 'CI=1 tr-no-such-binary-xyz --check', tier: 'fast' },
      { name: 'no-file', command: './scripts/missing.sh', tier: 'full' },
    ];
    expect(cli(repo, 'skill', 'config', 'quality', 'set', 'gates', JSON.stringify(gates)).status).toBe(0);
    fs.writeFileSync(configFile, '{}');
    const schemaFile = path.join(skillDir, 'core', 'config.schema.json');
    fs.writeFileSync(schemaFile, `${fs.readFileSync(schemaFile, 'utf8')}\n`);

    const report = checkSkillLayerContract(skillDir);
    expect(report.ok).toBe(false);
    const failed = Object.fromEntries(report.checks.filter((c) => !c.ok).map((c) => [c.id, c]));
    expect(Object.keys(failed).sort()).toEqual([
      'command:gates.1.command', 'command:gates.2.command', 'command:gates.3.command', 'contract-version', 'projection',
    ]);
    expect(failed['contract-version'].level).toBe('warn');
    expect(failed['command:gates.1.command'].message).toMatch(/no 'nope' script/);
    expect(failed['command:gates.2.command'].message).toMatch(/tr-no-such-binary-xyz/);
    expect(cli(repo, 'skill', 'config', 'quality', 'check').status).toBe(1);
  });

  it('reports unconfigured and unrecorded repo layers as contract failures', () => {
    expect(checkSkillLayerContract(skillDir).checks.at(-1)).toMatchObject({ id: 'record', ok: false });
    fs.writeFileSync(configFile, JSON.stringify({ language: 'node', gates: [] }));
    const report = checkSkillLayerContract(skillDir);
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.id === 'record').message).toMatch(/import/);
  });

  it('surfaces the same contract check in skillStatus and app verify', async () => {
    const brainDir = path.join(repo, 'brain');
    saveRegistry(brainDir, { ...emptyRegistry(), installs: [{ skill_id: 'quality', path: skillDir, layered: true }] });
    let status = skillStatus(brainDir, 'quality');
    expect(status.any_contract_failure).toBe(true);
    expect(status.installs[0].contract.ok).toBe(false);

    expect(cli(repo, 'skill', 'config', 'quality', 'init', '--yes').status).toBe(0);
    expect(cli(repo, 'skill', 'config', 'quality', 'set', 'gates', '[]').status).toBe(0);
    status = skillStatus(brainDir, 'quality');
    expect(status.any_contract_failure).toBe(false);

    fs.writeFileSync(configFile, '{}');
    const verified = await verifyApplication(repo, { checkFiles: false });
    expect(verified.valid).toBe(false);
    expect(verified.skills.map((r) => r.skill_id)).toEqual(['quality']);
    expect(verified.errors.join('\n')).toMatch(/Skill 'quality' contract: config\.json has drifted/);
  });

  it('resolves gate programs without running them', () => {
    expect(resolveCommand('node -e "process.exit(1)"', repo).ok).toBe(true);
    expect(resolveCommand(process.execPath, repo).ok).toBe(true);
    expect(resolveCommand('../outside.sh', repo).ok).toBe(false);
    expect(resolveCommand('   ', repo).ok).toBe(false);
    expect(resolveCommand(['node', '--version'], repo).ok).toBe(true);
    expect(resolveCommand(['CI=1', 'tr-no-such-binary-xyz'], repo).ok).toBe(false);
    const argvSchema = { type: 'object', properties: { cmd: { type: 'array', 'x-command': true, items: { type: 'string' } } } };
    expect(collectCommandValues(argvSchema, { cmd: ['npm', 'test'] })).toEqual([{ path: 'cmd', command: ['npm', 'test'] }]);
    expect(collectCommandValues(argvSchema, { cmd: [] })).toEqual([]);
  });

  it('keeps helper semantics narrow', async () => {
    const contract = loadConfigSchema(skillDir);
    expect(listCollections(contract.schema)).toEqual({ gate: { property: 'gates', key: 'name' } });
    expect(parseCollectionItem(['name=a', 'nested.depth=2'])).toEqual({ name: 'a', nested: { depth: 2 } });
    expect(() => setConfigValue({ a: 'x' }, 'a.b', 1)).toThrow(/non-object/);
    expect(() => setConfigValue({}, 'constructor.prototype', 1)).toThrow(/Invalid config path/);
    await expect(writeSkillConfig(skillDir, contract, { language: 'node' })).rejects.toThrow(/gates/);
    expect(fs.existsSync(recordFile)).toBe(false);
    expect(fs.existsSync(configFile)).toBe(false);
  });
});
