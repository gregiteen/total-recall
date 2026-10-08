/** Run on the sanctioned test host against the candidate CLI and an existing plugin artifact. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginSource = process.argv[2];
if (!pluginSource) throw new Error('Usage: node scripts/verify-memory-plugin-lifecycle.mjs <git-sentinel-artifact-directory>');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-native-memory-'));
const cwd = path.join(fixture, 'repository');
const agentDir = path.join(fixture, 'agent');
const brainDir = path.join(agentDir, 'skills', 'total-recall');
const env = { ...process.env, HOME: fixture, AGENT_DIR: agentDir, _TR_TEST_AGENT_DIR: agentDir,
  TR_EMBEDDINGS_DISABLED: '1', TR_SECRETS_NO_KEYCHAIN: '1', TR_ENV_FILE: '/nonexistent/tr-test.env' };
const cli = process.argv[3] ? path.resolve(process.argv[3]) : path.join(root, 'bin', 'total-recall-memory.mjs');
const results = [];
async function command(args, expected = 0, commandEnv = env, commandCwd = cwd) {
  let result;
  try { result = { ...await exec(process.execPath, [cli, ...args], { cwd: commandCwd, env: commandEnv, timeout: 45_000 }), code: 0 }; }
  catch (err) { result = { stdout: err.stdout || '', stderr: err.stderr || '', code: err.code }; }
  assert.equal(result.code, expected, `${args.join(' ')}: ${result.stderr}`);
  results.push({ command: args[0], exit: result.code });
  return result;
}
try {
  fs.mkdirSync(cwd);
  await command(['init', '--dry-run']);
  assert.equal(fs.existsSync(brainDir), false);
  await command(['init']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(brainDir, 'config', 'brain.json'), 'utf8')).role, 'global');
  for (const feature of ['scheduler', 'sessions', 'openwiki', 'skills-registry']) {
    assert.equal(fs.existsSync(path.join(brainDir, feature)), false, `Memory init created feature state: ${feature}`);
  }
  await exec('git', ['init', '-q'], { cwd, env });
  await exec('git', ['-c', 'user.name=Verification', '-c', 'user.email=verification@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'Fixture'], { cwd, env });
  await command(['remember', 'fact', 'The lifecycle fixture preserves its memory.', '--slug', 'preserved-fixture', '--global']);
  const before = await command(['recall', 'preserved-fixture', '--local', '--format', 'json', '--global']);
  assert.match(before.stdout, /The lifecycle fixture preserves its memory/);
  const identityPath = path.join(brainDir, 'config', 'brain.json');
  const identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
  fs.writeFileSync(identityPath, JSON.stringify({ ...identity, name: 'Authored brain name', custom_field: 'preserved' }));
  await command(['init']);
  const repeatedIdentity = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
  assert.equal(repeatedIdentity.name, 'Authored brain name');
  assert.equal(repeatedIdentity.custom_field, 'preserved');
  assert.equal(repeatedIdentity.created_at, identity.created_at);
  assert.match((await command(['recall', 'preserved-fixture', '--local', '--format', 'json', '--global'])).stdout,
    /The lifecycle fixture preserves its memory/);
  // A project gets its own brain; its memory never appears in the global one.
  const projectEnv = { ...env, AGENT_DIR: undefined, _TR_TEST_AGENT_DIR: undefined, HOME: fixture };
  await command(['init', '--project'], 0, projectEnv);
  await command(['remember', 'fact', 'Only the project owns this fixture.', '--slug', 'project-fixture', '--project'], 0, projectEnv);
  assert.match((await command(['recall', 'project-fixture', '--local', '--format', 'json', '--project'], 0, projectEnv)).stdout,
    /Only the project owns this fixture/);
  assert.doesNotMatch((await command(['recall', 'project-fixture', '--local', '--format', 'json', '--global'])).stdout,
    /Only the project owns this fixture/);
  await exec('git', ['add', '.'], { cwd, env });
  await exec('git', ['-c', 'user.name=Verification', '-c', 'user.email=verification@example.invalid', 'commit', '-q', '-m', 'Initialized project fixture'], { cwd, env });
  await command(['remember', 'invariant', 'Always inspect the selected brain.', '--slug', 'required-fixture', '--tags', 'context:universal', '--global']);
  const capsule = JSON.parse((await command(['context', 'Inspect memory', '--action', 'test', '--format', 'json', '--global'])).stdout);
  assert.equal(capsule.ready, true);
  assert.match(capsule.context, /Always inspect the selected brain/);
  assert.equal(capsule.stats.required_count, 1);
  const overflow = JSON.parse((await command(['context', 'Inspect memory', '--budget', '1', '--format', 'json', '--global'], 2)).stdout);
  assert.equal(overflow.ready, false);
  await command(['plugin', 'install', path.resolve(pluginSource), '--global']);
  const installed = JSON.parse((await command(['plugin', 'info', 'git-sentinel', '--json'])).stdout);
  assert.equal(installed.modified_since_install, false);
  assert.equal(installed.sha256, installed.installed_sha256);
  await command(['git-sentinel', 'audit', '--json'], 1, env, fixture);
  const rejectedPlugin = path.join(fixture, 'rejected-plugin');
  fs.mkdirSync(rejectedPlugin);
  fs.writeFileSync(path.join(rejectedPlugin, 'plugin.json'), JSON.stringify({
    id: 'rejected-plugin', name: 'Rejected plugin', version: '1.0.0',
    description: 'Invalid confined CLI fixture', cli: { command: 'rejected-plugin', handler: '../outside.mjs' },
  }));
  await command(['plugin', 'install', rejectedPlugin, '--global'], 1);
  assert.equal(JSON.parse((await command(['plugin', 'info', 'git-sentinel', '--json'])).stdout).sha256, installed.sha256);
  const audit = JSON.parse((await command(['git-sentinel', 'audit', '--json'])).stdout);
  assert.equal(audit.isClean, true);
  fs.writeFileSync(path.join(cwd, 'changed.txt'), 'Real untracked fixture\n');
  assert.equal(JSON.parse((await command(['git-sentinel', 'audit', '--json'])).stdout).untrackedFiles, 1);
  await command(['plugin', 'remove', 'git-sentinel', '--global']);
  const declaredPlugin = path.join(fixture, 'declared-plugin');
  fs.mkdirSync(declaredPlugin);
  fs.writeFileSync(path.join(declaredPlugin, 'plugin.json'), JSON.stringify({
    id: 'declared-plugin', name: 'Declared plugin', version: '1.0.0', description: 'Declared command fixture',
    commands: [{ name: 'declared-verb', handler: './handler.mjs', description: 'Invoke the declared fixture.', background: true }],
  }));
  fs.writeFileSync(path.join(declaredPlugin, 'handler.mjs'),
    'export function run(argv) { return { exitCode: 7, data: { args: argv.slice(3) } }; }\n');
  await command(['plugin', 'install', declaredPlugin, '--global']);
  assert.match((await command(['--help'])).stdout, /declared-verb/);
  assert.match((await command(['declared-verb', '--help'])).stdout, /Invoke the declared fixture/);
  const declaredResult = JSON.parse((await command(['declared-verb', 'hello', '--json'], 7)).stdout);
  assert.deepEqual(declaredResult, { ok: false, exit_code: 7, result: { args: ['hello'] } });
  await command(['declared-verb', '--background'], 1);
  await command(['plugin', 'remove', 'declared-plugin', '--global']);
  await command(['declared-verb', '--json'], 1);
  await command(['git-sentinel', 'audit', '--json'], 1);
  const preserved = await command(['recall', 'preserved-fixture', '--local', '--format', 'json', '--global']);
  assert.match(preserved.stdout, /The lifecycle fixture preserves its memory/);
  await command(['plugin', 'install', path.resolve(pluginSource), '--global']);
  const restored = JSON.parse((await command(['plugin', 'info', 'git-sentinel', '--json'])).stdout);
  assert.equal(restored.sha256, installed.sha256);
  await command(['git-sentinel', 'audit', '--json']);
  await command(['plugin', 'remove', 'git-sentinel', '--global']);
  await command(['edit', 'preserved-fixture', 'The lifecycle fixture has updated memory.', '--global']);
  assert.match((await command(['recall', 'preserved-fixture', '--local', '--format', 'json', '--global'])).stdout,
    /The lifecycle fixture has updated memory/);
  await command(['forget', 'preserved-fixture', '--global']);
  const gone = await command(['recall', 'preserved-fixture', '--local', '--format', 'json', '--global']);
  assert.doesNotMatch(gone.stdout, /The lifecycle fixture has updated memory/);
  const importedRules = path.join(fixture, 'rules-source');
  fs.mkdirSync(importedRules);
  fs.writeFileSync(path.join(importedRules, 'AGENTS.md'), 'Preserve the imported nebula rule verbatim.\n');
  await command(['import', '--dir', importedRules, '--dry-run', '--global']);
  assert.doesNotMatch((await command(['recall', 'nebula', '--local', '--format', 'json', '--global'])).stdout, /imported nebula rule/);
  await command(['import', '--dir', importedRules, '--global']);
  assert.match((await command(['recall', 'nebula', '--local', '--format', 'json', '--global'])).stdout, /Preserve the imported nebula rule verbatim/);
  await command(['lint', '--global']);
  console.log(JSON.stringify({ ok: true, plugin: { id: installed.id, version: installed.version, sha256: installed.sha256 },
    offline: true, required_rules: capsule.stats.required_count, capsule_tokens: capsule.stats.total_tokens,
    overflow_rejected: true, memory_preserved_on_remove: true, artifact_restored: true,
    installed_plugin_failure_propagated: true, invalid_plugin_rejected: true, imported_rules_immediately_recalled: true,
    declared_command_exit_and_data_preserved: true, custom_identity_preserved: true,
    commands: results }, null, 2));
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
