#!/usr/bin/env node

/**
 * Secret Scanner
 *
 * Scans source files, compiled instruction files, and optionally git history
 * for leaked tokens, API keys, and credentials.
 *
 * Exit codes:
 *   0 — No secrets found
 *   1 — Secrets detected
 *
 * Usage:
 *   node .agent/skills/security/scripts/scan-secrets.mjs              # source + instruction files
 *   node .agent/skills/security/scripts/scan-secrets.mjs --git-history # also scan git log
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const SCAN_GIT = process.argv.includes('--git-history');
const leaks = [];

function log(...args) { console.error(...args); }

// Token patterns with descriptions
const TOKEN_PATTERNS = [
  { name: 'Total Recall PAT', regex: /tr_[a-zA-Z0-9_-]{20,}/ },
  { name: 'DigitalOcean PAT', regex: /dop_v1_[a-f0-9]{64}/ },
  { name: 'OpenAI API Key', regex: /sk-[a-zA-Z0-9]{20,}/ },
  { name: 'GitHub PAT', regex: /ghp_[a-zA-Z0-9]{36,}/ },
  { name: 'GitHub OAuth', regex: /gho_[a-zA-Z0-9]{36,}/ },
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'Anthropic API Key', regex: /sk-ant-[a-zA-Z0-9_-]{20,}/ },
  { name: 'Google API Key', regex: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'Cloudflare Token', regex: /[a-zA-Z0-9_-]{40}/ }, // too broad — only check .env files
];

/**
 * Scan a file for token patterns.
 */
function scanFile(filePath, patterns) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const relPath = path.relative(ROOT, filePath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments and the scan script itself
    if (line.trimStart().startsWith('//') || line.trimStart().startsWith('#')) continue;
    if (relPath.includes('scan-secrets')) continue;

    for (const pat of patterns) {
      if (pat.regex.test(line)) {
        // Skip template patterns and hash references
        if (line.includes('token_prefix') || line.includes('token_hash') || line.includes('<YOUR_PAT_TOKEN>')) continue;
        if (line.includes('tr_$') || line.includes("tr_${")) continue; // template construction
        if (line.includes("'tr_'") || line.includes('"tr_"')) continue; // prefix string

        leaks.push({
          type: pat.name,
          file: relPath,
          line: i + 1,
          snippet: line.trim().slice(0, 100),
        });
      }
    }
  }
}

log('🔐 Secret Scanner');
log('');

// 1. Scan source files (skip broad Cloudflare pattern)
log('📁 Scanning source files...');
const sourcePatterns = TOKEN_PATTERNS.filter(p => p.name !== 'Cloudflare Token');

function walkDir(dir, extensions) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    if (entry.isDirectory()) {
      results.push(...walkDir(full, extensions));
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

const srcFiles = walkDir(path.join(ROOT, 'src'), ['.mjs', '.js', '.html', '.json']);
for (const f of srcFiles) {
  scanFile(f, sourcePatterns);
}
log(`  Scanned ${srcFiles.length} source files`);

// 2. Scan compiled instruction files
log('📄 Scanning instruction files...');
const instructionFiles = [
  'AGENTS.md', 'GEMINI.md', 'CLAUDE.md', 'INSTRUCTIONS.md',
  '.cursorrules', '.windsurfrules',
].map(f => path.join(ROOT, f));

for (const f of instructionFiles) {
  scanFile(f, sourcePatterns);
}

// 3. Scan .env files (include Cloudflare pattern here)
log('🔑 Scanning environment files...');
const envFiles = ['.env', '.env.local', '.env.production']
  .map(f => path.join(ROOT, f))
  .filter(f => fs.existsSync(f));

for (const f of envFiles) {
  scanFile(f, TOKEN_PATTERNS);
}

// 4. Scan config files
log('⚙️  Scanning config files...');
const configDir = path.join(ROOT, '.agent', 'config');
if (fs.existsSync(configDir)) {
  const configFiles = walkDir(configDir, ['.json', '.yml', '.yaml', '.jsonl']);
  for (const f of configFiles) {
    // Skip keys.jsonl — it stores hashed tokens by design
    if (f.endsWith('keys.jsonl')) continue;
    scanFile(f, sourcePatterns);
  }
}

// 5. Optionally scan git history
if (SCAN_GIT) {
  log('📜 Scanning git history (last 100 commits)...');
  try {
    const gitLog = execFileSync('git', [
      'log', '--all', '-n', '100', '-p', '--',
      '.env', '.env.*', '*.key', '*.pem', '*.p12',
    ], { encoding: 'utf8', timeout: 30000, cwd: ROOT });

    const gitLines = gitLog.split('\n');
    for (let i = 0; i < gitLines.length; i++) {
      const line = gitLines[i];
      if (!line.startsWith('+')) continue; // only additions
      for (const pat of sourcePatterns) {
        if (pat.regex.test(line)) {
          leaks.push({
            type: `${pat.name} (git history)`,
            file: 'git log',
            line: i,
            snippet: line.slice(0, 100),
          });
        }
      }
    }
  } catch {
    log('  ⚠️  git history scan failed');
  }
}

// Report
log('');
log('═'.repeat(60));
if (leaks.length === 0) {
  log('✅ No secrets found');
} else {
  log(`❌ ${leaks.length} potential secret(s) found:`);
  log('');
  for (const l of leaks) {
    log(`  [${l.type}] ${l.file}:${l.line}`);
    log(`    ${l.snippet}`);
    log('');
  }
}

console.log(JSON.stringify({ leaks, count: leaks.length }, null, 2));
process.exit(leaks.length > 0 ? 1 : 0);
