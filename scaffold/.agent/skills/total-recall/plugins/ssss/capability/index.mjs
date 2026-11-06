import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import toolchain from './toolchain.cjs';

const { canonicalToolchain, listFiles, runCanonical } = toolchain;
export { canonicalToolchain };

/** Generate a complete project in a private sibling directory, then publish it. */
export function scaffoldProject({ directory, name, extension, git = true, generate = runCanonical }) {
  if (!directory || typeof directory !== 'string') throw new Error('A scaffold directory is required');
  const target = path.resolve(directory);
  if (name && (typeof name !== 'string' || name.startsWith('-'))) throw new Error('Invalid SSSS project name');
  const parent = fs.realpathSync(path.dirname(target));
  const destination = path.join(parent, path.basename(target));
  const existing = fs.lstatSync(destination, { throwIfNoEntry: false });
  if (existing && (!existing.isDirectory() || fs.readdirSync(destination).length)) {
    throw new Error('SSSS scaffold destination must be an empty directory: ' + target);
  }
  const stage = fs.mkdtempSync(path.join(parent, '.ssss-project-'));
  const workspace = path.join(stage, 'project');
  try {
    const projectName = name || path.basename(target);
    if (!projectName || projectName.startsWith('-')) throw new Error('Invalid SSSS project name');
    const args = ['new', workspace, '--name', projectName];
    if (!git) args.push('--no-git');
    if (extension) args.push('--extension', extension);
    const result = generate(args);
    if (result.code !== 0) throw new Error(result.stderr.trim() || 'Canonical scaffolding failed');
    const files = listFiles(workspace).filter(file => !file.startsWith('.git/'));
    if (!files.includes('test/ssss-conformance.test.mjs')) throw new Error('Canonical scaffold is incomplete');
    fs.renameSync(workspace, destination);
    return { ok: true, directory: target, files, version: canonicalToolchain().version };
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

/** Validate through the canonical document contract without returning document contents. */
export async function validateDocument({ content, extensions = [] }) {
  const { root } = canonicalToolchain();
  const { createValidator } = await import(pathToFileURL(path.join(root, 'src/validator.mjs')).href);
  const { valid, type, errors, warnings } = createValidator({ extensions }).validateDocument(content);
  return { ok: valid === true, valid, type, errors, warnings };
}

/** Compare the caller's lock against the same effective registry the SSSS CLI composes. */
export async function verifyRegistry({ lock, extensions = [] }) {
  const { root, specVersion } = canonicalToolchain();
  const { loadRegistries, composeRegistryLayers, verifyRegistryLock } =
    await import(pathToFileURL(path.join(root, 'src/registry.mjs')).href);
  const registry = composeRegistryLayers({ core: loadRegistries().core, repository: extensions });
  const result = verifyRegistryLock(registry, lock);
  return { ...result, ok: result.valid === true, specVersion };
}

export function runConformance() {
  const result = runCanonical(['conformance', '--engine'], { timeout: 120000 });
  return { ok: result.code === 0, exitCode: result.code, signal: result.signal,
    output: result.stdout.trim(), error: result.code === 0 ? null : result.stderr.trim() || 'SSSS conformance failed' };
}
