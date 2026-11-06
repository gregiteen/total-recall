'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { canonicalToolchain, digest, listFiles } = require('../capability/toolchain.cjs');

const RECEIPT = '.ssss-scaffold.json';
const ENGINE = '@gregiteen/ssss-cli';
const NPM_ENTRIES = new Set(['node_modules', 'package-lock.json']);
const ROUTE = '\n\n<!-- total-recall:managed-core-route:v1 -->\nRead the [maintained portable core](core/SKILL.md) for the current SSSS contracts.\n';
const stat = file => fs.lstatSync(file, { throwIfNoEntry: false });
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function safeRelative(file) {
  return typeof file === 'string' && /^[\w.-]+(?:\/[\w.-]+)*$/.test(file) &&
    !file.split('/').some(part => part === '.' || part === '..' || part === '.git');
}

function requireDirectory(dir) {
  if (!stat(dir)?.isDirectory()) throw new Error('Missing or unsafe SSSS directory: ' + dir);
}

function regularPath(root, relative) {
  if (!safeRelative(relative)) throw new Error('Invalid SSSS asset path: ' + relative);
  const file = path.join(root, relative);
  let dir = path.dirname(file);
  while (dir !== root) {
    if (stat(dir) && !stat(dir).isDirectory()) throw new Error('Unsafe SSSS asset directory: ' + dir);
    dir = path.dirname(dir);
  }
  if (stat(file) && !stat(file).isFile()) throw new Error('Unsafe SSSS asset: ' + file);
  return file;
}

function payload() {
  const runtime = canonicalToolchain();
  const bundle = readJson(path.join(__dirname, '../assets/scaffold.json'));
  if (bundle.version !== runtime.version) throw new Error('SSSS scaffold and engine versions differ');
  const required = ['.gitignore', 'package.json', 'README.md', 'CLAUDE.md', 'docs/design.md',
    'test/ssss-conformance.test.mjs', 'vault/rules/welcome.md', 'vault/workflows/onboarding.md',
    'vault/assistants/concierge.md', 'vault/tasks/first-task.md'];
  for (const file of required) {
    if (!Object.hasOwn(bundle.files, file)) throw new Error('Missing canonical scaffold file: ' + file);
  }
  for (const [file, { content, sha256 }] of Object.entries(bundle.files)) {
    if (!safeRelative(file) || typeof content !== 'string' || digest(content) !== sha256) {
      throw new Error('Invalid canonical scaffold asset: ' + file);
    }
  }
  const skillRoot = path.join(runtime.root, 'skills/ssss');
  for (const file of ['SKILL.md', 'core/SKILL.md', 'core/references/ssss-spec.md',
    'core/references/core-registry.json', 'core/scripts/maintain.mjs', 'scripts/validate-schema.mjs']) {
    if (!Object.hasOwn(bundle.skill, file)) throw new Error('Missing canonical skill asset: ' + file);
  }
  requireDirectory(skillRoot);
  if (JSON.stringify(listFiles(skillRoot)) !== JSON.stringify(Object.keys(bundle.skill).sort())) {
    throw new Error('Canonical SSSS skill inventory is incomplete or changed');
  }
  for (const [file, hash] of Object.entries(bundle.skill)) {
    if (digest(fs.readFileSync(regularPath(skillRoot, file))) !== hash) {
      throw new Error('Invalid canonical SSSS skill asset: ' + file);
    }
  }
  return { ...runtime, ...bundle, skillRoot };
}

function locations({ brainDir }) {
  if (!path.isAbsolute(brainDir || '')) throw new Error('An absolute Total Recall brain path is required');
  return { skill: path.join(path.dirname(brainDir), 'ssss'), scaffold: path.join(brainDir, 'scaffolds/ssss') };
}

function checkRoot(dir) {
  const entry = stat(dir);
  if (entry && !entry.isDirectory()) throw new Error('Unsafe SSSS install directory: ' + dir);
}

function compareFiles(root, files, { permitMissing = false } = {}) {
  for (const [relative, hash] of Object.entries(files)) {
    const file = regularPath(root, relative);
    if (!stat(file)) {
      if (permitMissing) continue;
      throw new Error('Missing SSSS file: ' + file);
    }
    if (digest(fs.readFileSync(file)) !== hash) throw new Error('SSSS file changed: ' + file);
  }
}

function scaffoldReceipt(source) {
  return { version: source.version, files: Object.fromEntries(Object.entries(source.files).map(([file, entry]) => [file, entry.sha256])) };
}

function inspectScaffold(dir, source) {
  requireDirectory(dir);
  const current = readJson(regularPath(dir, RECEIPT));
  const expected = scaffoldReceipt(source);
  if (JSON.stringify(current) !== JSON.stringify(expected)) throw new Error('SSSS scaffold receipt is stale or invalid');
  compareFiles(dir, expected.files);
  if (listFiles(dir).length !== Object.keys(expected.files).length + 1) throw new Error('Unexpected files in the managed SSSS scaffold');
  return { ok: true, path: dir, files: Object.keys(expected.files).length };
}

function skillRootFor(target, sharedBrainDir) {
  if (!stat(target)?.isSymbolicLink()) return target;
  const sharedSkill = sharedBrainDir && path.join(path.dirname(sharedBrainDir), 'ssss');
  const resolved = fs.realpathSync(target);
  if (!sharedSkill || resolved !== sharedSkill) throw new Error('SSSS skill points outside the shared skill installation');
  return resolved;
}

function inspectSkill(target, source, sharedBrainDir) {
  const dir = skillRootFor(target, sharedBrainDir);
  requireDirectory(dir);
  const wrapper = fs.readFileSync(regularPath(dir, 'SKILL.md'), 'utf8');
  if (!/^name:\s*['"]?ssss['"]?\s*$/m.test(wrapper) || !wrapper.includes('core/SKILL.md')) {
    throw new Error('SSSS skill entry does not reference its portable core');
  }
  const files = Object.keys(source.skill);
  for (const relative of files) {
    const file = regularPath(dir, relative);
    if (!stat(file)) throw new Error('Missing SSSS skill file: ' + file);
    if (relative.startsWith('core/') && digest(fs.readFileSync(file)) !== source.skill[relative]) {
      throw new Error('SSSS portable core is stale: ' + file);
    }
  }
  return { ok: true, path: target, files: files.length };
}

function publishDirectory(target, populate, replace = false, keepPrevious = false) {
  const parent = path.dirname(target);
  checkRoot(parent);
  fs.mkdirSync(parent, { recursive: true });
  const stage = fs.mkdtempSync(path.join(parent, '.ssss-install-'));
  const next = path.join(stage, 'next');
  const previous = path.join(stage, 'previous');
  let displaced = false;
  let preserveStage = false;
  try {
    fs.mkdirSync(next);
    populate(next);
    if (replace && stat(target)) { fs.renameSync(target, previous); displaced = true; }
    fs.renameSync(next, target);
    if (displaced && keepPrevious) {
      preserveStage = true;
      return previous;
    }
  } catch (error) {
    if (displaced) {
      try { fs.renameSync(previous, target); }
      catch (restoreError) {
        preserveStage = true;
        throw new Error('SSSS install failed and could not restore the previous files at ' +
          previous + ': ' + restoreError.message, { cause: error });
      }
    }
    throw error;
  } finally {
    if (!preserveStage) fs.rmSync(stage, { recursive: true, force: true });
  }
}

function writeAsset(root, relative, content) {
  const file = regularPath(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, { flag: 'wx' });
}

function installSkill(target, source, sharedBrainDir) {
  const dir = skillRootFor(target, sharedBrainDir);
  if (dir !== target) return inspectSkill(target, source, sharedBrainDir);
  checkRoot(dir);
  const exists = Boolean(stat(dir));
  // Stage the complete skill so a failed source read cannot leave a partial skill.
  if (exists) {
    const wrapper = regularPath(dir, 'SKILL.md');
    if (stat(wrapper) && !/^name:\s*['"]?ssss['"]?\s*$/m.test(fs.readFileSync(wrapper, 'utf8'))) {
      throw new Error('Existing skill directory belongs to another skill: ' + dir);
    }
    listFiles(dir);
  }
  publishDirectory(dir, stage => {
    if (exists) fs.cpSync(dir, stage, { recursive: true });
    fs.rmSync(path.join(stage, 'core'), { recursive: true, force: true });
    for (const relative of Object.keys(source.skill)) {
      if (!stat(regularPath(stage, relative))) {
        writeAsset(stage, relative, fs.readFileSync(regularPath(source.skillRoot, relative)));
      }
    }
    const wrapper = path.join(stage, 'SKILL.md');
    if (!fs.readFileSync(wrapper, 'utf8').includes('core/SKILL.md')) fs.appendFileSync(wrapper, ROUTE);
    inspectSkill(stage, source);
  }, exists);
}

function hasUpdaterDrift(dir, source, receipt) {
  const manifest = regularPath(dir, 'package.json');
  if (!stat(manifest)) return false;
  const content = fs.readFileSync(manifest);
  const nodeModules = stat(path.join(dir, 'node_modules'));
  const lock = stat(path.join(dir, 'package-lock.json'));
  if (nodeModules && !nodeModules.isDirectory() || lock && !lock.isFile()) return false;
  if (digest(content) === receipt.files['package.json']) return Boolean(nodeModules || lock);
  let current;
  try { current = JSON.parse(content); } catch { return false; }
  const pin = current?.dependencies?.[ENGINE];
  if (typeof pin !== 'string' || !/^\d+\.\d+\.\d+$/.test(pin)) return false;
  current.dependencies[ENGINE] = JSON.parse(source.files['package.json'].content).dependencies[ENGINE];
  return digest(JSON.stringify(current, null, 2) + '\n') === receipt.files['package.json'];
}

function installScaffold(dir, source, repair) {
  checkRoot(path.dirname(dir));
  checkRoot(dir);
  const exists = Boolean(stat(dir));
  let updaterDrift = false;
  if (exists) {
    const receipt = readJson(regularPath(dir, RECEIPT));
    const files = Object.keys(receipt.files || {});
    if (!receipt.version || !files.length || files.includes(RECEIPT)) {
      throw new Error('Invalid managed SSSS scaffold receipt: ' + dir);
    }
    updaterDrift = hasUpdaterDrift(dir, source, receipt);
    if (listFiles(dir, updaterDrift ? NPM_ENTRIES : undefined)
      .some(file => file !== RECEIPT && !Object.hasOwn(receipt.files, file))) {
      throw new Error('Refusing to replace unmanaged files in the SSSS scaffold: ' + dir);
    }
    const verifiedFiles = { ...receipt.files };
    if (updaterDrift) delete verifiedFiles['package.json'];
    compareFiles(dir, verifiedFiles, { permitMissing: repair });
  }
  return publishDirectory(dir, stage => {
    for (const [file, entry] of Object.entries(source.files)) writeAsset(stage, file, entry.content);
    writeAsset(stage, RECEIPT, JSON.stringify(scaffoldReceipt(source), null, 2) + '\n');
    inspectScaffold(stage, source);
  }, exists, updaterDrift);
}

function inspectSource() {
  const source = payload();
  return { ok: true, version: source.version, specVersion: source.specVersion,
    skillFiles: Object.keys(source.skill).length, scaffoldFiles: Object.keys(source.files).length };
}

function inspectInstalled(options, source) {
  const { skill, scaffold } = locations(options);
  const check = (target, inspect) => {
    try { return inspect(); }
    catch (error) { return { ok: false, path: target, error: error.message }; }
  };
  const observed = {
    skill: check(skill, () => inspectSkill(skill, source, options.sharedBrainDir)),
    scaffold: check(scaffold, () => {
      checkRoot(options.brainDir);
      checkRoot(path.dirname(scaffold));
      return inspectScaffold(scaffold, source);
    }),
  };
  return { ok: observed.skill.ok && observed.scaffold.ok, version: source.version,
    specVersion: source.specVersion, ...observed };
}

function inspectInstallation(options) {
  return inspectInstalled(options, payload());
}

function ensureInstallation(options) {
  const source = payload();
  const { skill, scaffold } = locations(options);
  checkRoot(path.dirname(options.brainDir));
  checkRoot(options.brainDir);
  const current = inspectInstalled(options, source);
  const recoveredFrom = current.scaffold.ok ? undefined : installScaffold(scaffold, source, options.repair === true);
  if (!current.skill.ok) installSkill(skill, source, options.sharedBrainDir);
  const installed = inspectInstalled(options, source);
  if (!installed.ok) throw new Error([installed.skill.error, installed.scaffold.error].filter(Boolean).join('; '));
  return recoveredFrom ? { ...installed, recoveredFrom } : installed;
}

async function maintain({ brainDir, entries, apply, run }) {
  const entry = entries.ssss;
  if (!entry || !entry.layered || entry.source_type !== 'portable-owner-package') {
    return { skipped: true, reason: 'no-enrolled-portable-source', failed: 0, results: [] };
  }
  const { skillRoot } = payload();
  const script = regularPath(skillRoot, 'core/scripts/maintain.mjs');
  const result = await run(process.execPath, [script, '--source', skillRoot, '--brain', brainDir,
    ...(apply ? ['--apply'] : [])], { timeoutMs: 300000, maxBytes: 8 * 1024 * 1024 });
  try {
    const report = JSON.parse(result.output);
    return { ...report, failed: Math.max(report.failed || 0, result.code === 0 ? 0 : 1) };
  } catch {
    return { failed: 1, results: [], error: result.reason || result.output || 'Portable skill verification returned no report' };
  }
}

module.exports = { inspectSource, inspectInstallation, ensureInstallation, maintain };
