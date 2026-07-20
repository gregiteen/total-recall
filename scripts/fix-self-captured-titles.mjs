#!/usr/bin/env node
/**
 * One-shot: strip legacy "Self-captured memory:" title prefixes from vault nodes.
 * Provenance → tags + source; title → clean first sentence from body when echo.
 *
 * Usage:
 *   node scripts/fix-self-captured-titles.mjs           # all registered vaults + global
 *   node scripts/fix-self-captured-titles.mjs --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import matter from 'gray-matter';
import { normalizeMemoryTitle } from '../src/core/memory-title.mjs';

const dryRun = process.argv.includes('--dry-run');

function collectVaults() {
  const roots = new Set();
  const candidates = [
    path.join(os.homedir(), '.agent/skills/total-recall/memory-vault'),
    path.join(process.cwd(), '.agent/skills/total-recall/memory-vault'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) roots.add(path.resolve(c));
  }
  const regPath = path.join(os.homedir(), '.agent/skills/total-recall/config/project-registry.json');
  if (fs.existsSync(regPath)) {
    try {
      const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
      for (const r of reg) {
        if (r.brainDir) {
          const v = path.join(r.brainDir, 'memory-vault');
          if (fs.existsSync(v)) roots.add(path.resolve(v));
        }
      }
    } catch {
      /* ignore */
    }
  }
  return [...roots];
}

function maybeUnescapeLiteralNewlines(raw) {
  // Some nodes were written as a single line with "\n" sequences instead of real newlines
  if (raw.includes('\\n') && !raw.includes('\n---\n') && raw.startsWith('---')) {
    return raw.replace(/\\n/g, '\n');
  }
  return raw;
}

/**
 * Strip legacy prefix from free-text fields (title, description, citation titles).
 * Does not rewrite openwiki body dumps of old instruction surfaces.
 */
function cleanField(value, body = '') {
  if (value == null) return { value, changed: false };
  if (typeof value !== 'string') return { value, changed: false };
  if (!/Self-captured memory/i.test(value)) return { value, changed: false };
  const next = normalizeMemoryTitle(value, body || value);
  return { value: next, changed: next !== value };
}

function fixFile(filePath) {
  let raw = fs.readFileSync(filePath, 'utf8');
  if (!raw.includes('Self-captured memory')) return null;
  raw = maybeUnescapeLiteralNewlines(raw);

  let data;
  let content;
  try {
    ({ data, content } = matter(raw));
  } catch {
    return { file: filePath, error: 'parse failed' };
  }

  const body = (content || '').trim();
  let changed = false;
  const changes = [];

  // Title
  const titleFix = cleanField(data.title, body);
  if (titleFix.changed) {
    changes.push({ field: 'title', from: String(data.title).slice(0, 80), to: titleFix.value.slice(0, 80) });
    data.title = titleFix.value;
    changed = true;
  }

  // Description (often a truncated copy of the old title)
  const descFix = cleanField(data.description, body);
  if (descFix.changed) {
    changes.push({ field: 'description', from: String(data.description).slice(0, 80), to: descFix.value.slice(0, 80) });
    data.description = descFix.value;
    changed = true;
  }

  // x_citations[].title
  if (Array.isArray(data.x_citations)) {
    for (let i = 0; i < data.x_citations.length; i++) {
      const c = data.x_citations[i];
      if (!c || typeof c !== 'object') continue;
      const citFix = cleanField(c.title, body);
      if (citFix.changed) {
        changes.push({ field: `x_citations[${i}].title`, from: String(c.title).slice(0, 80), to: citFix.value.slice(0, 80) });
        c.title = citFix.value;
        changed = true;
      }
    }
  }

  // Body: only if the body itself is a single memory line that starts with the prefix
  // (do not rewrite openwiki snapshots of full instruction files)
  let newBody = body;
  if (/^Self-captured memory:\s*/i.test(body) && body.split('\n').length <= 3) {
    newBody = body.replace(/^Self-captured memory:\s*/i, '').trim();
    if (newBody !== body) {
      changes.push({ field: 'body', from: body.slice(0, 80), to: newBody.slice(0, 80) });
      changed = true;
    }
  }

  if (!changed) return null;

  data.updated = new Date().toISOString();

  // Provenance tags / source
  const tags = Array.isArray(data.tags) ? [...data.tags] : [];
  if (!tags.includes('self-captured')) tags.push('self-captured');
  data.tags = tags;
  if (!data.source || typeof data.source !== 'object') {
    data.source = { type: 'remember-cli', evidence_count: 1 };
  }
  if (!data.source.type) data.source.type = 'remember-cli';
  if (!data.source.capture) data.source.capture = 'self';

  if (!dryRun) {
    const out = matter.stringify(newBody ? `${newBody}\n` : '', data);
    fs.writeFileSync(filePath, out, 'utf8');
  }

  return {
    file: filePath,
    oldTitle: changes[0]?.from || String(data.title || '').slice(0, 80),
    newTitle: changes[0]?.to || String(data.title || '').slice(0, 80),
    fields: changes.map((c) => c.field),
  };
}

function main() {
  const vaults = collectVaults();
  let changed = 0;
  let errors = 0;
  const samples = [];

  for (const vault of vaults) {
    let vaultCount = 0;
    for (const dirent of walkMd(vault)) {
      const r = fixFile(dirent);
      if (!r) continue;
      if (r.error) {
        errors++;
        console.error('ERR', r.file, r.error);
        continue;
      }
      changed++;
      vaultCount++;
      if (samples.length < 12) samples.push(r);
    }
    console.log(`${dryRun ? 'would fix' : 'fixed'} ${vaultCount} in ${vault}`);
  }

  console.log(`\n${dryRun ? 'DRY-RUN ' : ''}TOTAL ${changed} nodes, ${errors} errors`);
  for (const s of samples) {
    console.log(`  · ${path.basename(s.file)}`);
    console.log(`    - ${s.oldTitle}`);
    console.log(`    + ${s.newTitle}`);
  }
}

function* walkMd(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) yield* walkMd(p);
    else if (name.endsWith('.md')) yield p;
  }
}

main();
