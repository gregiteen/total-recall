#!/usr/bin/env node

/**
 * Security Audit Runner
 *
 * Runs automated security checks against the Total Recall codebase.
 * Outputs structured JSON to stdout and human-readable summary to stderr.
 *
 * Exit codes:
 *   0 — Clean audit (no findings, all mitigations verified)
 *   1 — Findings detected or mitigations missing
 *
 * Usage: node .agent/skills/security/scripts/run-audit.mjs [--json-only]
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const JSON_ONLY = process.argv.includes('--json-only');

const findings = [];
const log = (...args) => { if (!JSON_ONLY) console.error(...args); };

// ─── Vulnerability Pattern Checks ─────────────────────────────────────────────

/**
 * Runs grep safely using execFileSync with argument arrays (no shell injection).
 * Returns matching lines or empty array.
 */
function grepCheck(pattern, searchDirs, opts = {}) {
  const dirs = searchDirs
    .map(d => path.join(ROOT, d))
    .filter(d => fs.existsSync(d));
  if (dirs.length === 0) return [];

  try {
    const args = ['-rn', ...(opts.extended ? ['-E'] : []), pattern, ...dirs];
    const result = execFileSync('grep', args, {
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return result.trim().split('\n').filter(Boolean);
  } catch (err) {
    // grep exits 1 when no matches found — that's fine
    if (err.status === 1) return [];
    // Real errors (timeout, etc.)
    log(`  ⚠️  grep failed for pattern "${pattern}": ${err.message}`);
    return [];
  }
}

function check(name, severity, pattern, dirs, description, opts = {}) {
  // Exclude lines that are comments, test fixtures, or this script itself
  const excludeSelf = opts.excludeSelf ?? true;
  let matches = grepCheck(pattern, dirs, opts);

  if (excludeSelf) {
    matches = matches.filter(line =>
      !line.includes('run-audit.mjs') &&
      !line.includes('pre-commit-check.mjs') &&
      !line.includes('scan-secrets.mjs') &&
      !line.includes('.spec.') &&
      !line.includes('.test.')
    );
  }

  if (opts.excludePattern) {
    matches = matches.filter(line => !opts.excludePattern.test(line));
  }

  if (matches.length > 0) {
    findings.push({
      name,
      severity,
      description,
      matches: matches.length,
      locations: matches.slice(0, 8),
    });
  }
}

log('🔒 Total Recall Security Audit');
log('');

// 1. Command injection — execSync with template literals
check(
  'command-injection-execSync',
  'CRITICAL',
  'execSync(`',
  ['src'],
  'execSync with template literal — potential command injection',
  { excludePattern: /\/\// }  // skip commented lines
);

// 2. Path traversal — user input in path.join
check(
  'path-traversal-risk',
  'CRITICAL',
  'path\\.join.*req\\.(params|query|body)',
  ['src'],
  'User input in path.join without validation — potential path traversal',
  { extended: true }
);

// 3. XSS — innerHTML assignments
check(
  'innerHTML-xss',
  'HIGH',
  'innerHTML',
  ['src', 'frontend'],
  'innerHTML assignment — potential XSS if data is user-controlled'
);

// 4. Hardcoded tokens — real PATs in source
check(
  'hardcoded-tokens',
  'CRITICAL',
  'tr_[a-zA-Z0-9]\\{10,\\}',
  ['src'],
  'Hardcoded Total Recall PAT token found in source'
);

// 5. Token leaks in compiled instruction files
check(
  'token-leak-instructions',
  'CRITICAL',
  'tr_[a-zA-Z0-9]\\{10,\\}',
  ['AGENTS.md', 'GEMINI.md', 'CLAUDE.md', 'INSTRUCTIONS.md'],
  'Real PAT token leaked into compiled instruction file',
  { excludeSelf: false }
);

// 6. eval usage
check(
  'eval-usage',
  'HIGH',
  'eval(',
  ['src'],
  'eval() usage — potential code injection',
  { excludePattern: /\/\/|timingSafeEqual/ }
);

// 7. new Function()
check(
  'new-function-usage',
  'HIGH',
  'new Function(',
  ['src'],
  'new Function() — potential code injection'
);

// 8. curl | bash patterns
check(
  'curl-pipe-bash',
  'MEDIUM',
  'curl.*|.*sh',
  ['src', 'scripts'],
  'curl piped to shell — supply chain risk'
);

// 9. Math.random for security
check(
  'weak-prng',
  'MEDIUM',
  'Math\\.random',
  ['src'],
  'Math.random() used — check if security-sensitive (use crypto.randomBytes instead)',
  { extended: true }
);

// 10. X-Forwarded-For trust
check(
  'forwarded-header-trust',
  'HIGH',
  'x-forwarded-for',
  ['src'],
  'X-Forwarded-For header referenced — verify it is NOT trusted for auth decisions'
);

// ─── Mitigation Verification ──────────────────────────────────────────────────

log('📋 Verifying mitigations...');
log('');

const mitigations = [
  {
    name: 'safeConfigName() in rest.mjs',
    file: 'src/server/rest.mjs',
    pattern: 'safeConfigName',
  },
  {
    name: 'SAFE_NAME regex in vault.mjs',
    file: 'src/core/vault.mjs',
    pattern: 'SAFE_NAME',
  },
  {
    name: 'xrunSafe() in tools.mjs',
    file: 'src/server/tools.mjs',
    pattern: 'xrunSafe',
  },
  {
    name: 'execFileSync for osascript in daemon-loop.mjs',
    file: 'src/core/daemon-loop.mjs',
    pattern: 'execFileSync',
  },
  {
    name: 'Restricted sandbox env whitelist',
    file: 'src/core/sandbox.mjs',
    pattern: "'PATH', 'TMPDIR', 'LANG', 'TERM'",
  },
  {
    name: 'JWT secret persistence to session-secret',
    file: 'src/server/auth.mjs',
    pattern: 'session-secret',
  },
  {
    name: 'Brain export excludes security.yml',
    file: 'src/server/rest.mjs',
    pattern: '--exclude=security.yml',
  },
  {
    name: 'Generic error messages in serverError()',
    file: 'src/server/rest.mjs',
    pattern: 'Internal server error',
  },
];

let mitigationsPassed = 0;
for (const m of mitigations) {
  const filePath = path.join(ROOT, m.file);
  if (!fs.existsSync(filePath)) {
    log(`  ❌ ${m.name} — file not found: ${m.file}`);
    findings.push({
      name: `missing-mitigation:${m.name}`,
      severity: 'HIGH',
      description: `Mitigation file not found: ${m.file}`,
      matches: 1,
      locations: [m.file],
    });
    continue;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(m.pattern)) {
    log(`  ✅ ${m.name}`);
    mitigationsPassed++;
  } else {
    log(`  ❌ ${m.name} — pattern "${m.pattern}" not found`);
    findings.push({
      name: `missing-mitigation:${m.name}`,
      severity: 'HIGH',
      description: `Expected mitigation "${m.name}" not found in ${m.file}`,
      matches: 1,
      locations: [m.file],
    });
  }
}

// ─── npm audit ────────────────────────────────────────────────────────────────

log('');
log('📦 Running npm audit...');
log('');

let npmAudit = null;
try {
  const auditResult = execFileSync('npm', ['audit', '--json'], {
    encoding: 'utf8',
    timeout: 30000,
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  npmAudit = JSON.parse(auditResult);
} catch (err) {
  // npm audit exits non-zero when vulns found — parse stdout anyway
  if (err.stdout) {
    try { npmAudit = JSON.parse(err.stdout); } catch { /* parse failed */ }
  }
}

if (npmAudit?.metadata?.vulnerabilities) {
  const v = npmAudit.metadata.vulnerabilities;
  const total = (v.critical || 0) + (v.high || 0) + (v.moderate || 0) + (v.low || 0);
  if (total > 0) {
    log(`  ⚠️  npm audit: ${v.critical || 0} critical, ${v.high || 0} high, ${v.moderate || 0} moderate, ${v.low || 0} low`);
    if ((v.critical || 0) > 0 || (v.high || 0) > 0) {
      findings.push({
        name: 'npm-audit-vulnerabilities',
        severity: (v.critical || 0) > 0 ? 'CRITICAL' : 'HIGH',
        description: `npm audit found ${v.critical || 0} critical, ${v.high || 0} high vulnerabilities`,
        matches: total,
        locations: ['package.json — run `npm audit` for details'],
      });
    }
  } else {
    log('  ✅ npm audit: no known vulnerabilities');
  }
} else {
  log('  ⚠️  npm audit: could not parse results');
}

// ─── Report ───────────────────────────────────────────────────────────────────

log('');
log('═'.repeat(60));
log('📊 AUDIT SUMMARY');
log('═'.repeat(60));
log(`Mitigations verified: ${mitigationsPassed}/${mitigations.length}`);
log(`Findings: ${findings.length}`);

if (findings.length > 0) {
  log('');
  log('Findings by severity:');
  const bySeverity = {};
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
  }
  for (const [sev, count] of Object.entries(bySeverity).sort()) {
    log(`  ${sev}: ${count}`);
  }
}

log('');

// Structured JSON to stdout
const report = {
  timestamp: new Date().toISOString(),
  version: '2.0.0',
  mitigations_checked: mitigations.length,
  mitigations_passed: mitigationsPassed,
  findings_count: findings.length,
  clean: findings.length === 0 && mitigationsPassed === mitigations.length,
  findings,
  npm_audit: npmAudit?.metadata?.vulnerabilities || null,
};

console.log(JSON.stringify(report, null, 2));

// Exit code: 1 if any findings or mitigations failed
process.exit(report.clean ? 0 : 1);
