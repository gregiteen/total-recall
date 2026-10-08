#!/usr/bin/env node
/** Inspect npm's actual artifact inventory; never publish or modify the package. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const packed = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8' });
if (packed.error || packed.status !== 0) throw new Error(packed.error?.message || packed.stderr);
const inventory = JSON.parse(packed.stdout)[0];
const files = new Set(inventory.files.map(entry => entry.path));
const memoryFiles = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'memory-package-files.json'), 'utf8'));
assert.equal(pkg.bin['total-recall'], 'bin/total-recall.mjs');
assert.equal(pkg.bin['total-recall-memory'], 'bin/total-recall-memory.mjs');
assert.equal(pkg.exports['.'], './src/server/index.mjs');
assert.equal(pkg.exports['./memory'], './src/server/memory-app.mjs');
for (const file of memoryFiles) {
  assert(files.has(file), `Missing declared file: ${file}`);
}
for (const file of ['src/cli/plugin/create.mjs', 'src/cli/update.mjs', 'src/server/routes/update.mjs', 'src/core/package-version.mjs', 'metadata.plugin.schema.json', 'scaffold/.agent/skills/total-recall/SKILL.md', 'scaffold/.agent/skills/total-recall/scripts/brain-state.json', 'frontend/dist/index.html']) {
  assert(files.has(file), `Missing compatible release surface: ${file}`);
}
for (const file of files) {
  assert(!/(^|\/)(node_modules|memory-derived|logs)(\/|$)/.test(file), `Private state in package: ${file}`);
  assert(!/(^|\/)(secrets\.enc|\.env|\.npmrc)$/.test(file), `Credential state in package: ${file}`);
  assert(!/^(src|frontend)\/.*\.(spec|test)\./.test(file), `Runtime test in package: ${file}`);
  if (!file.endsWith('.mjs')) continue;
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  // Literal relative imports only; computed child/template paths are checked below.
  const imports = source.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|^\s*import\s+|\brequire\s*\(\s*)['"](\.[^'"\n]+)['"]/gm);
  for (const [, imported] of imports) {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), imported));
    if (memoryFiles.includes(file)) assert(files.has(target), `Missing memory import: ${file} -> ${target}`);
  }
  assert(!/\/Users\/[a-zA-Z0-9._-]+\//.test(source), `Private path in packed source: ${file}`);
}
for (const required of ['src/core/plugin-runner-child.mjs', 'templates/memory/SKILL.md']) assert(files.has(required));
for (const exported of Object.values(pkg.exports).filter(value => !value.includes('*'))) assert(files.has(exported.replace(/^\.\//, '')));
console.log(JSON.stringify({ ok: true, version: pkg.version, files: files.size, memoryFiles: memoryFiles.length, compatiblePluginScaffold: true, unpackedBytes: inventory.unpackedSize }));
