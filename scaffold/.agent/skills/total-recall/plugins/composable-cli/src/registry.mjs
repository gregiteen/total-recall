/**
 * Command Registry — cli_command SSSS documents, history, rollback
 *
 * Each registered command has a sibling <name>.md SSSS document beside its
 * <name>.mjs file. History is kept in <scope dir>/commands/.history/<name>/<version>.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { EXIT_CODES } from './contract.mjs';
import { validateRisk } from './risk.mjs';
import { writeCommandDocument, parseDocument } from './ssss-documents.mjs';


/**
 * Write the cli_command SSSS document for a command.
 *
 * @param {object} options
 * @param {string} options.name - Command name
 * @param {string} options.commandsDir - Directory containing the command
 * @param {'project'|'group'|'global'} [options.scope]
 * @param {string} [options.ownerProject]
 * @param {string} [options.group]
 * @param {string} [options.risk]
 * @param {number} [options.version]
 * @param {string} [options.author]
 * @param {string} [options.description]
 * @param {boolean} [options.background]
 * @param {string} [options.source]
 * @returns {object} The written registry document
 */
export function writeRegistry(options = {}) {
  const {
    name,
    commandsDir,
    scope = 'project',
    ownerProject,
    group,
    risk = 'write',
    version = 1,
    author = process.env.AGENT_ID || 'unknown',
    description = '',
    background = false,
    source = 'inline',
  } = options;

  const cmdFile = path.join(commandsDir, `${name}.mjs`);
  if (!fs.existsSync(cmdFile)) {
    const err = new Error(`Command '${name}' does not exist in ${commandsDir}.`);
    err.exitCode = EXIT_CODES.ERROR;
    throw err;
  }

  validateRisk(risk);

  const now = new Date().toISOString();
  const previous = readRegistry(name, commandsDir);
  const code = fs.readFileSync(cmdFile, 'utf8');
  const sha = crypto.createHash('sha256').update(code).digest('hex');

  const doc = {
    ...previous,
    type: 'cli_command',
    id: previous?.id || randomUUID(),
    name,
    scope,
    risk,
    version,
    author,
    created: previous?.created || now,
    updated: now,
    description,
    background_allowed: background,
    code_sha256: sha,
    source,
  };

  // Optional fields
  if (ownerProject) doc.owner_project = ownerProject;
  if (group) doc.group = group;

  const docPath = path.join(commandsDir, `${name}.md`);
  fs.mkdirSync(commandsDir, { recursive: true });
  const prose = fs.existsSync(docPath) ? parseDocument(fs.readFileSync(docPath, 'utf8')).body : `# Command: ${name}\n\n${description}\n`;
  writeCommandDocument(docPath, doc, prose);
  return doc;
}

/**
 * Read the cli_command document for a command, if present.
 *
 * @param {string} name
 * @param {string} commandsDir
 * @returns {object | null}
 */
export function readRegistry(name, commandsDir) {
  const docPath = path.join(commandsDir, `${name}.md`);
  if (!fs.existsSync(docPath)) return null;
  const content = fs.readFileSync(docPath, 'utf8');
  const doc = parseDocument(content).data;
  // Only return if it's a cli_command
  if (doc.type !== 'cli_command') return null;
  delete doc.description_if_present;
  return doc;
}

/**
 * Snapshot the currently registered version of a command before an update.
 *
 * @param {string} name
 * @param {string} commandsDir
 * @returns {number|null} The version number that was snapshotted, or null if none
 */
export function snapshotForHistory(name, commandsDir) {
  const cmdFile = path.join(commandsDir, `${name}.mjs`);
  if (!fs.existsSync(cmdFile)) return null;

  const doc = readRegistry(name, commandsDir);
  const version = doc?.version || 1;

  const historyDir = path.join(commandsDir, '.history', name);
  fs.mkdirSync(historyDir, { recursive: true });

  const snapFile = path.join(historyDir, `v${version}.mjs`);
  if (!fs.existsSync(snapFile)) {
    fs.copyFileSync(cmdFile, snapFile);
  }
  return version;
}

/**
 * List history versions for a command.
 *
 * @param {string} name
 * @param {string} commandsDir
 * @returns {number[]} Sorted list of version numbers
 */
export function listHistory(name, commandsDir) {
  const histDir = path.join(commandsDir, '.history', name);
  if (!fs.existsSync(histDir)) return [];
  return fs.readdirSync(histDir)
    .filter((f) => /^v\d+\.mjs$/.test(f))
    .map((f) => parseInt(f.replace(/\.mjs$/, '').replace('v', ''), 10))
    .sort((a, b) => a - b);
}

/**
 * Roll back a command to a previous version.
 *
 * @param {string} name
 * @param {number} version - Target version to restore
 * @param {string} commandsDir
 * @returns {number} The restored version
 */
export function rollback(name, version, commandsDir) {
  const snapFile = path.join(commandsDir, '.history', name, `v${version}.mjs`);
  if (!fs.existsSync(snapFile)) {
    const err = new Error(`Version ${version} of '${name}' does not exist in history.`);
    err.exitCode = EXIT_CODES.ERROR;
    throw err;
  }

  const cmdFile = path.join(commandsDir, `${name}.mjs`);
  if (!fs.existsSync(cmdFile)) {
    const err = new Error(`Command '${name}' does not exist.`);
    err.exitCode = EXIT_CODES.ERROR;
    throw err;
  }

  // Snapshot current before rollback
  snapshotForHistory(name, commandsDir);

  // Restore the target version
  fs.copyFileSync(snapFile, cmdFile);

  // Bump the registry version to reflect the rollback
  const doc = readRegistry(name, commandsDir);
  if (doc) {
    const newVersion = (doc.version || 0) + 1;
    fm(path.join(commandsDir, `${name}.md`), { ...doc, version: newVersion, updated: new Date().toISOString() });
  }

  return version;
}

/** Internal: rewrite a registry doc file with updated fields. */
function fm(docPath, doc) {
  const body = parseDocument(fs.readFileSync(docPath, 'utf8')).body;
  const code = fs.readFileSync(docPath.replace(/\.md$/, '.mjs'), 'utf8');
  writeCommandDocument(docPath, { ...doc, code_sha256: crypto.createHash('sha256').update(code).digest('hex') }, body);
}
