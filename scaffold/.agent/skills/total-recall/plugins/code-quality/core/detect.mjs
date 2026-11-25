#!/usr/bin/env node
/**
 * code-quality / core/detect.mjs — probe a repo and propose a repo config.
 *
 * A bootstrap, not the source of truth. It reports what the repo actually has;
 * the repo's real gate list (conformance suites, contract tests, grep gates for
 * its own invariants) is repo knowledge added afterwards through the CLI:
 *
 *   total-recall skill config code-quality detect            # show the proposal
 *   total-recall skill config code-quality detect --apply    # record it
 *   total-recall skill config code-quality gate add id=… tier=fast cmd='["npm","test"]'
 *
 * Run directly (`node detect.mjs`) it only prints facts and the proposal.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Extensions the fallback check scans when a repository has no other gate.
const FLOOR_EXTENSIONS = ['.md', '.txt', '.json', '.yml', '.yaml', '.toml', '.sh', '.html', '.css', '.sql', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs', '.swift', '.java'];
const JS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

const SSSS_VERIFICATION_NAME = /^ssss:(?:validate|verify|check|conformance|test|lint)(?::[a-z0-9_-]+)*$/;

// `ssss <verb>` run by a script, whatever the script is called.
const SSSS_VERIFICATION_COMMAND = /(?:^|[\s&|;])ssss\s+(?:conformance|validate|verify|check|lint)(?=\s|$)/;

function isSsssVerificationScript([name, command]) {
  if (typeof command !== 'string' || !command.trim()) return false;
  const launcher = /^(?:(?:npx|pnpm exec|npm exec --)\s+)?ssss(?:\s+(?:help|version)(?:\s+.*)?)?$/;
  if (launcher.test(command.trim()) || /(?:^|\s)(?:--help|-h|--version|-v)(?:\s|$)/.test(command)) return false;
  return SSSS_VERIFICATION_NAME.test(name) || SSSS_VERIFICATION_COMMAND.test(command);
}

/** Gate id for an ssss script: `ssss:validate` keeps its old id, `validate` becomes `ssss-validate`. */
function ssssGateId(name) {
  const id = name.startsWith('ssss:') ? name.slice(5) : name.replace(/^ssss-/, '');
  return `ssss-${id}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
}

/** The test runner a Python repository already declares, or null. */
function pytestDeclared(readText, has) {
  if (!['tests', 'test'].some((dir) => has(dir))) return false;
  return has('pytest.ini') || has('tox.ini') && /\[pytest\]/.test(readText('tox.ini'))
    || /\[tool\.pytest/.test(readText('pyproject.toml'))
    || ['requirements.txt', 'requirements-dev.txt', 'pyproject.toml'].some((file) => /(^|[\s"'])pytest\b/m.test(readText(file)));
}

export function detectFacts(repoRoot) {
  const has = (p) => existsSync(path.join(repoRoot, p));
  const readText = (p) => { try { return readFileSync(path.join(repoRoot, p), 'utf8'); } catch { return ''; } };
  const readJson = (p) => { try { return JSON.parse(readText(p)); } catch { return null; } };
  const pkg = readJson('package.json');
  const scripts = pkg?.scripts || {};
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  return {
    scripts,
    packageJson: !!pkg,
    packageManager: has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : pkg ? 'npm' : null,
    workspace: has('pnpm-workspace.yaml') || !!pkg?.workspaces,
    // A library that uses the compiler as a dependency has nothing for tsc to check.
    typescript: has('tsconfig.json') || (!!deps.typescript && !!scripts.typecheck),
    tsProjectRefs: readJson('tsconfig.json')?.references?.length || 0,
    eslint: !!deps.eslint || ['.eslintrc', '.eslintrc.json', '.eslintrc.cjs', 'eslint.config.js', 'eslint.config.mjs'].some(has),
    biome: !!deps['@biomejs/biome'] || has('biome.json') || has('biome.jsonc'),
    python: has('requirements.txt') || has('pyproject.toml') || has('setup.py'),
    venvPython: has('.venv/bin/python'),
    flake8: has('.flake8') || has('setup.cfg') || has('tox.ini'),
    mypy: has('mypy.ini') || has('.mypy_cache'),
    black: /\[tool\.black\]/.test(readText('pyproject.toml')),
    ruff: has('ruff.toml') || has('.ruff.toml') || /\[tool\.ruff/.test(readText('pyproject.toml')),
    pytest: pytestDeclared(readText, has),
    go: has('go.mod'),
    rust: has('Cargo.toml'),
    pluginManifest: has('plugin.json'),
    ssssScripts: Object.entries(scripts).filter(isSsssVerificationScript).map(([name]) => name),
  };
}

/** Propose a config satisfying core/config.schema.json. */
export function detect({ repoRoot }) {
  const facts = detectFacts(repoRoot);
  const { scripts, packageManager: pm } = facts;
  const run = (script) => (pm === 'pnpm' ? ['pnpm', 'run', script] : pm === 'yarn' ? ['yarn', script] : ['npm', 'run', script]);
  const python = facts.venvPython ? '.venv/bin/python' : 'python3';
  const checks = [];

  if (facts.typescript && scripts.typecheck) {
    checks.push({ id: 'types', tier: 'fast', cmd: run('typecheck'), parser: 'tsc' });
  } else if (facts.typescript) {
    checks.push({ id: 'types', tier: 'fast', cmd: ['npx', 'tsc', facts.tsProjectRefs > 0 ? '--build' : '--noEmit', '--pretty', 'false'], parser: 'tsc' });
  }
  if (facts.biome && scripts.lint) checks.push({ id: 'lint', tier: 'fast', cmd: run('lint'), parser: 'generic' });
  else if (facts.eslint && scripts.lint) checks.push({ id: 'lint', tier: 'fast', cmd: run('lint'), parser: 'eslint-stylish' });
  // The repository's own lint script, whichever linter it runs.
  else if (scripts.lint) checks.push({ id: 'lint', tier: 'fast', cmd: run('lint'), parser: 'generic' });
  if (facts.flake8) checks.push({ id: 'flake8', tier: 'fast', cmd: [python, '-m', 'flake8', '.'], parser: 'flake8' });
  if (facts.black) checks.push({ id: 'black-check', tier: 'fast', cmd: [python, '-m', 'black', '--check', '.'], parser: 'black' });
  if (facts.mypy) checks.push({ id: 'mypy', tier: 'fast', cmd: [python, '-m', 'mypy', '.'], parser: 'mypy' });
  if (facts.ruff) checks.push({ id: 'ruff', tier: 'fast', cmd: [python, '-m', 'ruff', 'check', '.'], parser: 'generic' });
  if (facts.go) checks.push({ id: 'go-vet', tier: 'fast', cmd: ['go', 'vet', './...'], parser: 'generic' });
  if (facts.rust) checks.push({ id: 'cargo-check', tier: 'fast', cmd: ['cargo', 'check', '--workspace', '--all-targets'], parser: 'generic' });
  for (const s of facts.ssssScripts) {
    // `ssss:*` scripts keep their tiers; a script found by its command is one cheap engine pass.
    const tier = s.includes('validate') || !SSSS_VERIFICATION_NAME.test(s) ? 'fast' : 'full';
    checks.push({ id: ssssGateId(s), tier, cmd: run(s), parser: 'generic' });
  }
  if (facts.pluginManifest) {
    checks.push({ id: 'plugin-compliance', tier: 'fast', cmd: ['total-recall', 'code-quality', 'plugin-check'], parser: 'generic' });
  }
  if (scripts.test) checks.push({ id: 'test', tier: 'full', cmd: run('test'), parser: 'generic' });
  if (facts.pytest) checks.push({ id: 'pytest', tier: 'full', cmd: [python, '-m', 'pytest', '-q'], parser: 'generic' });
  if (facts.go) checks.push({ id: 'go-test', tier: 'full', cmd: ['go', 'test', './...'], parser: 'generic' });
  if (facts.rust) checks.push({ id: 'cargo-test', tier: 'full', cmd: ['cargo', 'test', '--workspace'], parser: 'generic' });

  // A repository with none of the above still needs one real gate: leftover merge-conflict markers.
  const floor = checks.length === 0;
  if (floor) checks.push({
    id: 'conflict-markers', tier: 'fast', kind: 'grep-forbid',
    extensions: FLOOR_EXTENSIONS,
    patterns: [{ pattern: '^(?:<<<<<<< |>>>>>>> )', code: 'CONFLICT-MARKER', message: 'Unresolved merge conflict marker.' }],
  });

  const toolchain = facts.python && !facts.typescript ? 'python'
    : facts.typescript ? 'typescript'
      : facts.packageJson ? 'javascript'
        : facts.go ? 'go' : facts.rust ? 'rust' : floor ? 'generic' : 'javascript';
  const sourceExtensions = floor ? FLOOR_EXTENSIONS
    : facts.python ? ['.py']
      : facts.packageJson ? JS_EXTENSIONS
        : facts.go ? ['.go'] : facts.rust ? ['.rs'] : JS_EXTENSIONS;
  return {
    version: 3,
    toolchain,
    globalLock: true,
    lock: { staleAfterMinutes: 45 },
    sourceExtensions,
    checks,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
  const { scripts, ...facts } = detectFacts(repoRoot);
  console.log(`\n code-quality detect — ${repoRoot}\n`);
  for (const [k, v] of Object.entries(facts)) {
    const val = Array.isArray(v) ? (v.length ? v.join(', ') : '—') : v === true ? 'yes' : v === false ? 'no' : (v ?? '—');
    console.log(`  ${k.padEnd(16)} ${val}`);
  }
  console.log('\n── proposed config ──');
  console.log(JSON.stringify(detect({ repoRoot }), null, 2));
  console.log('\nNothing written. Record it with: total-recall skill config code-quality detect --apply');
}
