#!/usr/bin/env node
/**
 * validate-vault.mjs
 *
 * Validates all .md files in the memory vault against SSSS schema v2.
 * Checks frontmatter fields, naming conventions, and type boundaries.
 *
 * Usage: node .agent/skills/ssss/scripts/validate-vault.mjs [vault-path]
 * Default vault path: ~/.agent/memory-vault/
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const VAULT_DIR = process.argv[2] || path.join(os.homedir(), '.agent', 'memory-vault');
const REQUIRED_FIELDS = ['type', 'slug', 'category', 'title', 'status', 'schema_version'];
const VALID_STATUSES = ['active', 'superseded', 'deprecated', 'draft'];
const VALID_MODALITIES = ['must', 'must_not', 'should', 'should_not', 'descriptive', 'preference'];

function parseYaml(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w[\w.]*?):\s*(.+)/);
    if (kv) fields[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return fields;
}

function walkMd(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) results = results.concat(walkMd(full));
    else if (full.endsWith('.md')) results.push(full);
  }
  return results;
}

const files = walkMd(VAULT_DIR);
let errors = 0;
let warnings = 0;
let passed = 0;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const fm = parseYaml(content);
  const rel = path.relative(VAULT_DIR, file);
  const fileErrors = [];
  const fileWarnings = [];

  if (!fm) {
    fileErrors.push('No YAML frontmatter found');
  } else {
    for (const f of REQUIRED_FIELDS) {
      if (!fm[f]) fileErrors.push(`Missing required field: ${f}`);
    }

    const expectedSlug = path.basename(file, '.md');
    if (fm.slug && fm.slug !== expectedSlug) {
      fileErrors.push(`slug '${fm.slug}' doesn't match filename '${expectedSlug}'`);
    }

    const expectedCategory = path.basename(path.dirname(file));
    if (fm.category && fm.category !== expectedCategory) {
      fileErrors.push(`category '${fm.category}' doesn't match directory '${expectedCategory}'`);
    }

    if (fm.status && !VALID_STATUSES.includes(fm.status)) {
      fileErrors.push(`Invalid status: ${fm.status}`);
    }

    if (fm.modality && !VALID_MODALITIES.includes(fm.modality)) {
      fileErrors.push(`Invalid modality: ${fm.modality}`);
    }

    if (fm.slug && fm.slug !== fm.slug.toLowerCase()) {
      fileErrors.push(`slug contains uppercase: ${fm.slug}`);
    }
  }

  if (fileErrors.length > 0) {
    console.error(`❌ ${rel}`);
    for (const e of fileErrors) console.error(`   ${e}`);
    errors += fileErrors.length;
  } else {
    passed++;
  }
  warnings += fileWarnings.length;
}

console.error(`\n${files.length} files checked. ${passed} passed. ${files.length - passed} failed. (${errors} errors, ${warnings} warnings)`);
process.exit(errors > 0 ? 1 : 0);
