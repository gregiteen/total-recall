#!/usr/bin/env node

/**
 * Pre-Commit Security Check
 *
 * Fast subset of the full audit focused on patterns most likely introduced
 * in new code. Designed to run before every commit.
 *
 * Exit codes:
 *   0 — Clean
 *   1 — Violations found
 *
 * Usage: node .agent/skills/security/scripts/pre-commit-check.mjs [--staged-only]
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const STAGED_ONLY = process.argv.includes('--staged-only');
const violations = [];

function log(...args) { console.error(...args); }

/**
 * Get list of staged files (if --staged-only) or all tracked src files.
 */
function getFiles() {
  if (STAGED_ONLY) {
    try {
      const out = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
        encoding: 'utf8', cwd: ROOT, timeout: 5000,
      });
      return out.trim().split('\n').filter(f => f && (f.endsWith('.mjs') || f.endsWith('.js') || f.endsWith('.html')));
    } catch {
      return [];
    }
  }
  // All source files
  try {
    const out = execFileSync('find', [
      path.join(ROOT, 'src'), '-type', 'f',
      '(', '-name', '*.mjs', '-o', '-name', '*.js', '-o', '-name', '*.html', ')',
    ], { encoding: 'utf8', timeout: 10000 });
    return out.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

const files = getFiles();
if (files.length === 0) {
  log('No files to check.');
  process.exit(0);
}

log(`🔒 Pre-commit security check — ${files.length} files`);
log('');

for (const file of files) {
  const absPath = path.isAbsolute(file) ? file : path.join(ROOT, file);
  if (!fs.existsSync(absPath)) continue;

  const content = fs.readFileSync(absPath, 'utf8');
  const lines = content.split('\n');
  const relPath = path.relative(ROOT, absPath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Skip comments
    if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;

    // 1. execSync with template literal
    if (line.includes('execSync(`') && !line.includes('execFileSync')) {
      violations.push({
        rule: 'no-execSync-interpolation',
        severity: 'CRITICAL',
        file: relPath,
        line: lineNum,
        snippet: line.trim(),
      });
    }

    // 2. innerHTML assignment (not just read)
    if (/\.innerHTML\s*[+=]/.test(line)) {
      violations.push({
        rule: 'no-innerHTML-assignment',
        severity: 'HIGH',
        file: relPath,
        line: lineNum,
        snippet: line.trim(),
      });
    }

    // 3. Hardcoded PAT tokens
    if (/tr_[a-zA-Z0-9]{10,}/.test(line) && !line.includes('token_prefix') && !line.includes('tr_$')) {
      violations.push({
        rule: 'no-hardcoded-tokens',
        severity: 'CRITICAL',
        file: relPath,
        line: lineNum,
        snippet: line.trim().slice(0, 80),
      });
    }

    // 4. path.join with req.params/query/body without prior validation
    if (/path\.join\(.*req\.(params|query|body)/.test(line)) {
      violations.push({
        rule: 'no-unvalidated-path-join',
        severity: 'CRITICAL',
        file: relPath,
        line: lineNum,
        snippet: line.trim(),
      });
    }
  }
}

// Report
if (violations.length === 0) {
  log('  ✅ All checks passed');
  process.exit(0);
}

log(`  ❌ ${violations.length} violation(s) found:`);
log('');
for (const v of violations) {
  log(`  [${v.severity}] ${v.rule}`);
  log(`    ${v.file}:${v.line}`);
  log(`    ${v.snippet}`);
  log('');
}

console.log(JSON.stringify({ violations, count: violations.length }, null, 2));
process.exit(1);
