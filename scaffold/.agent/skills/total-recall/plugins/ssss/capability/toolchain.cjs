'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { dependencies } = require('../package.json');
const NAME = '@gregiteen/ssss-cli';

const digest = value => createHash('sha256').update(value).digest('hex');

/**
 * The pinned engine. An engine installed elsewhere on the machine (a global npm install beside
 * the host, for example) is resolvable too and must not shadow the pinned one, so every candidate
 * is read and the one at the pinned version is used.
 */
function canonicalToolchain() {
  const wanted = dependencies[NAME];
  let packageFile;
  let found = null;
  for (const name of [NAME, '@ssss/cli']) {
    let candidate;
    try { candidate = require.resolve(name + '/package.json'); }
    catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; continue; }
    const manifest = JSON.parse(fs.readFileSync(candidate, 'utf8'));
    if (manifest.name === NAME && manifest.version === wanted) { packageFile = candidate; break; }
    found ||= `${manifest.name}@${manifest.version} at ${path.dirname(candidate)}`;
  }
  if (!packageFile) throw new Error(found
    ? `Canonical SSSS package must match ${wanted}; found ${found}`
    : 'The pinned canonical SSSS package is missing');
  const manifest = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  const root = path.dirname(packageFile);
  const entry = path.join(root, 'scripts', 'ssss.mjs');
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'registry/core.json'), 'utf8'));
  for (const file of [entry, path.join(root, 'src/validator.mjs'), path.join(root, 'src/engine.mjs'),
    path.join(root, 'conformance/fixtures.json'), path.join(root, 'conformance/reference-bundle.ucw.json')]) {
    if (!fs.statSync(file).isFile()) throw new Error('Incomplete canonical SSSS package: ' + path.basename(file));
  }
  return { root, entry, version: manifest.version, specVersion: registry.spec_version };
}

function runCanonical(args, { cwd, timeout = 30000 } = {}) {
  const { entry } = canonicalToolchain();
  const result = spawnSync(process.execPath, [entry, ...args], {
    cwd, encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw new Error('SSSS ' + args[0] + ' failed: ' + result.error.message);
  return { code: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr };
}

function listFiles(root, skipRootEntries = new Set()) {
  const files = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (dir === root && skipRootEntries.has(entry.name)) continue;
      const child = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) files.push(path.relative(root, child).split(path.sep).join('/'));
      else throw new Error('Unsafe file in SSSS payload: ' + path.relative(root, child));
    }
  }
  visit(root);
  return files.sort();
}

module.exports = { canonicalToolchain, digest, listFiles, runCanonical };
