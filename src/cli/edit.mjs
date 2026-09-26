import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { resolveBrainDir, parseLayerFlag, getBothBrains } from './agent-dir.mjs';
import { writeNodeValidatedAsync } from '../core/validated-write.mjs';
import { isSafeVaultName } from '../core/vault.mjs';

const PRIORITIES = ['absolute', 'high', 'normal', 'low'];
const MODALITIES = ['must', 'must_not', 'should', 'should_not', 'descriptive', 'preference'];
const STATUSES = ['active', 'archived', 'deprecated'];

function printHelp() {
  console.log(`
  total-recall edit — Change an existing memory node in place (same slug)

  Usage: total-recall edit <slug> ["<new content>"] [options]

    Options:
    --title <text>            Replace the title
    --importance, -i <1-5>    Replace the importance
    --priority, -p <level>    absolute | high | normal | low
    --modality, -m <type>     must | must_not | should | should_not | descriptive | preference
    --tags, -t <list>         Replace the tags (comma-separated)
    --status <status>         active | archived | deprecated
    --global                  Edit the node in the global brain
    --project                 Edit the node in the project brain
    --no-compile              Skip auto-recompilation after the edit
    --help, -h                Show this help

  Pass "-" as the content to read the new body from stdin. Omit the content to
  keep the body and change only the options given.

  If neither --global nor --project is specified, the node is looked up in the
  project brain first (if one exists), then in the global brain.

  Examples:
    npx total-recall edit anti-patterns-7a7fb6a5 "Never run tests on the MacBook."
    npx total-recall edit my-rule --priority absolute --modality must --global
    cat new-body.md | npx total-recall edit my-fact -
`);
}

/** Path of `<slug>.md` inside any category directory of `vaultDir`, or null. */
export function findNodeFile(slug, vaultDir) {
  if (!isSafeVaultName(slug) || !fs.existsSync(vaultDir)) return null;
  for (const entry of fs.readdirSync(vaultDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const filePath = path.join(vaultDir, entry.name, `${slug}.md`);
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
}

/**
 * Parse edit arguments into { slug, body, changes, noCompile }.
 * Throws with a user-facing message on invalid input.
 */
export function parseEditArgs(args) {
  const result = { slug: null, body: undefined, changes: {}, noCompile: false };
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = () => {
      const value = args[++i];
      if (value === undefined) throw new Error(`${arg} requires a value.`);
      return value;
    };
    if (arg === '--no-compile') result.noCompile = true;
    else if (arg === '--title') result.changes.title = next();
    else if (arg === '--importance' || arg === '-i') {
      const value = Number(next());
      if (!Number.isInteger(value) || value < 1 || value > 5) {
        throw new Error('--importance must be an integer from 1 to 5.');
      }
      result.changes.importance = value;
    } else if (arg === '--priority' || arg === '-p') {
      const value = next().toLowerCase();
      if (!PRIORITIES.includes(value)) throw new Error(`--priority must be one of: ${PRIORITIES.join(', ')}.`);
      result.changes.priority = value;
    } else if (arg === '--modality' || arg === '-m') {
      const value = next().toLowerCase();
      if (!MODALITIES.includes(value)) throw new Error(`--modality must be one of: ${MODALITIES.join(', ')}.`);
      result.changes.modality = value;
    } else if (arg === '--tags' || arg === '-t') {
      result.changes.tags = next().split(',').map((t) => t.trim()).filter(Boolean);
    } else if (arg === '--status') {
      const value = next().toLowerCase();
      if (!STATUSES.includes(value)) throw new Error(`--status must be one of: ${STATUSES.join(', ')}.`);
      result.changes.status = value;
    } else if (/^--?[a-z]/i.test(arg)) {
      throw new Error(`Unknown option: ${arg}`);
    } else positional.push(arg);
  }
  if (positional.length > 2) throw new Error('Quote the new content as a single argument.');
  [result.slug, result.body] = positional;
  return result;
}

/**
 * Apply an edit to a parsed node. Returns the updated node and the list of
 * changed field names. `immutable` follows `priority`, as in `remember`.
 */
export function applyEdit(node, { body, changes }, now = new Date().toISOString()) {
  const updated = { ...node };
  const changed = [];
  if (body !== undefined && body.trim() !== (node.body || '').trim()) {
    updated.body = body.trim();
    changed.push('body');
  }
  for (const [key, value] of Object.entries(changes)) {
    if (JSON.stringify(node[key]) === JSON.stringify(value)) continue;
    updated[key] = value;
    changed.push(key);
  }
  if (changed.includes('title') && node.description === node.title) {
    updated.description = updated.title;
  }
  if (changed.includes('priority')) {
    if (updated.priority === 'absolute') updated.immutable = true;
    else delete updated.immutable;
  }
  if (changed.length) updated.updated = now;
  return { node: updated, changed };
}

function locate(slug, explicitLayer) {
  const layers = explicitLayer === 'auto' ? ['project', 'global'] : [explicitLayer];
  const brains = getBothBrains();
  for (const layer of layers) {
    if (layer === 'project' && !brains.project) continue;
    const vaultDir = path.join(resolveBrainDir(layer), 'memory-vault');
    const filePath = findNodeFile(slug, vaultDir);
    if (filePath) return { layer, vaultDir, filePath };
  }
  return null;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export default async function edit(args) {
  const { layer: explicitLayer, remainingArgs } = parseLayerFlag(args);
  if (!remainingArgs.length || remainingArgs.includes('--help') || remainingArgs.includes('-h')) {
    printHelp();
    return;
  }

  let parsed;
  try {
    parsed = parseEditArgs(remainingArgs);
  } catch (err) {
    console.error(`  ❌ ${err.message}`);
    process.exitCode = 1;
    return;
  }
  if (parsed.body === '-') parsed.body = await readStdin();
  if (parsed.body !== undefined && !parsed.body.trim()) {
    console.error('  ❌ The new content is empty. Use `total-recall forget` to delete a node.');
    process.exitCode = 1;
    return;
  }

  const found = locate(parsed.slug, explicitLayer);
  if (!found) {
    const where = explicitLayer === 'auto' ? 'project or global' : explicitLayer;
    console.error(`  ❌ Node "${parsed.slug}" not found in the ${where} vault.`);
    process.exitCode = 1;
    return;
  }

  const { data, content } = matter(fs.readFileSync(found.filePath, 'utf8'));
  const { node, changed } = applyEdit({ ...data, body: content.trim() }, parsed);
  const layerLabel = `[${found.layer}]`;
  const relPath = path.relative(path.dirname(found.vaultDir), found.filePath);

  if (!changed.length) {
    console.log(`  ℹ️  Nothing to change in ${layerLabel} ${relPath}.`);
    return;
  }

  const result = await writeNodeValidatedAsync(node, found.vaultDir);
  if (!result.success) {
    const errors = result.validation?.errors || [result.error || 'unknown validation failure'];
    console.error(`  ❌ Validation failed: ${errors.join('; ')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`  ✅ Updated ${layerLabel} ${relPath} (${changed.join(', ')})`);

  if (parsed.noCompile) return;
  console.log('  ⏳ Recompiling active memory surfaces and indexes in the background...');
  try {
    const { spawn } = await import('node:child_process');
    const child = spawn(process.argv[0], [process.argv[1], 'compile', `--${found.layer}`], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    console.log('  ✅ Background compilation started.');
  } catch (err) {
    console.warn(`  ⚠️  Node updated, but background recompilation spawn failed: ${err.message}`);
  }
}
