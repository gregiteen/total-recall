#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { runConformance, validateDocument, verifyRegistry } from './capability/index.mjs';
import { scaffoldProjectForHost } from './runtime/project-scaffold.mjs';
import installation from './runtime/installation.cjs';

const scope = { type: 'string' };
const extension = { type: 'string', multiple: true };
const OPTIONS = {
  status: { scope },
  repair: { scope },
  validate: { file: { type: 'string' }, extension },
  registry: { lock: { type: 'string' }, extension },
  scaffold: { directory: { type: 'string' }, extension: { type: 'string' }, 'with-total-recall': { type: 'boolean' } },
  conformance: {},
};

const HELP = [
  'Usage: total-recall ssss <operation> [options] [--json]',
  '',
  '  status [--scope auto|global|project]    Inspect engine, skill and scaffold.',
  '  repair [--scope auto|global|project]    Restore missing or previously repinned managed installation files.',
  '  validate --file <document> [--extension <registry>]  Validate SSSS frontmatter.',
  '  registry --lock <file> [--extension <registry>]      Verify the effective registry lock.',
  '  scaffold --directory <dir> [--extension <name>] [--with-total-recall]',
  '  conformance                            Run the reference engine suite.',
].join('\n');

function scopedPath(value, label, { newDirectory = false } = {}) {
  if (!value) throw new Error(label + ' is required');
  const root = fs.realpathSync(process.cwd());
  const file = path.resolve(root, value);
  const inside = resolved => resolved.startsWith(root + path.sep);
  if (!inside(file)) throw new Error(label + ' must be inside the current workspace');
  const resolved = fs.realpathSync(newDirectory ? path.dirname(file) : file);
  if (resolved !== root && !inside(resolved)) throw new Error(label + ' resolves outside the current workspace');
  if (!newDirectory && !fs.statSync(resolved).isFile()) throw new Error(label + ' must be a file');
  return file;
}

async function brainOptions(layer = 'auto') {
  if (!['auto', 'global', 'project'].includes(layer)) throw new Error('Invalid brain scope: ' + layer);
  const host = process.env.TR_PACKAGE_ROOT;
  if (!host) throw new Error('Run installation operations through total-recall ssss');
  const { resolveBrainDir, getGlobalBrainDir } = await import(
    pathToFileURL(path.join(host, 'src/cli/agent-dir.mjs')).href);
  const brainDir = resolveBrainDir(layer);
  const sharedBrainDir = getGlobalBrainDir();
  const hostInstaller = path.join(host, 'src/core/required-plugins.mjs');
  const resolvePaths = fs.existsSync(hostInstaller)
    ? (await import(pathToFileURL(hostInstaller).href)).resolveRequiredInstallationPaths : undefined;
  const options = resolvePaths?.(brainDir, sharedBrainDir) ?? { brainDir, sharedBrainDir };
  if (!fs.existsSync(path.join(options.brainDir, 'SKILL.md'))) throw new Error('Initialize the selected Total Recall brain first');
  return options;
}

async function execute(operation, options) {
  switch (operation) {
    case 'status': return installation.inspectInstallation(await brainOptions(options.scope));
    case 'repair': return installation.ensureInstallation({ ...await brainOptions(options.scope), repair: true });
    case 'scaffold':
      return scaffoldProjectForHost({
        directory: scopedPath(options.directory, '--directory', { newDirectory: true }),
        extension: options.extension, withTotalRecall: options['with-total-recall'] === true,
      });
    case 'conformance': return runConformance();
    default: {
      const extensions = (options.extension || []).map(file =>
        JSON.parse(fs.readFileSync(scopedPath(file, '--extension'), 'utf8')));
      if (operation === 'registry') {
        const lock = JSON.parse(fs.readFileSync(scopedPath(options.lock, '--lock'), 'utf8'));
        return verifyRegistry({ lock, extensions });
      }
      const content = fs.readFileSync(scopedPath(options.file, '--file'), 'utf8');
      return validateDocument({ content, extensions });
    }
  }
}

async function main(args) {
  if (args.includes('--help') || args.includes('-h') || args[0] === 'help') {
    console.log(HELP);
    return;
  }
  const operation = args[0] && !args[0].startsWith('--') ? args[0] : 'status';
  const flags = args[0] === operation ? args.slice(1) : args;
  let result;
  try {
    if (!Object.hasOwn(OPTIONS, operation)) throw new Error('Unknown SSSS operation: ' + operation);
    const { values } = parseArgs({ args: flags, options: { ...OPTIONS[operation], json: { type: 'boolean' } } });
    result = { ...await execute(operation, values), checkedAt: new Date().toISOString() };
  } catch (error) {
    result = { ok: false, error: error.message, checkedAt: new Date().toISOString() };
  }
  if (flags.includes('--json')) console.log(JSON.stringify(result));
  else if (result.output) console.log(result.output);
  else console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    const details = result.error || result.errors?.join('\n') ||
      [result.skill?.error, result.scaffold?.error].filter(Boolean).join('\n');
    console.error(details || (operation === 'registry' ? 'Effective SSSS registry does not match its lock' : 'SSSS check failed'));
    process.exitCode = 1;
  }
}

export async function run(argv) {
  return main(argv.slice(3));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main(process.argv.slice(2));
}
