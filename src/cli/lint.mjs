/**
 * total-recall lint
 *
 * Validate all vault nodes against SSSS schema v2.
 * Reports invalid frontmatter, missing required fields, and type errors.
 *
 * Usage:
 *   npx total-recall lint [options]
 *
 * Options:
 *   --vault <path>     Override vault directory (default: ~/.agent/memory-vault)
 *   --strict           Treat warnings as errors (exit 1 on any issue)
 *   --json             Output results as JSONL
 *   --help             Show this help
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAgentDir, resolveBrainDir } from './agent-dir.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_DIR = resolveAgentDir();
const BRAIN_DIR = resolveBrainDir();

function parseArgs(args) {
  const opts = { vault: null, strict: false, json: false, help: false, okf: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--vault': opts.vault = args[++i]; break;
      case '--strict': opts.strict = true; break;
      case '--json': opts.json = true; break;
      case '--okf': opts.okf = true; break;
      case '--help': case '-h': opts.help = true; break;
    }
  }
  return opts;
}

function printHelp() {
  console.log(`
  total-recall lint — Validate vault nodes against SSSS schema v2 or OKF spec

  Scans all .md files in the memory vault and validates their YAML
  frontmatter against the Zod schemas or checks for OKF compliance.

  Usage: total-recall lint [options]

  Options:
    --vault <path>     Override vault directory (default: ~/.agent/memory-vault)
    --strict           Treat warnings as errors (exit 1 on any issue)
    --okf              Verify OKF v0.1 draft metadata compliance
    --json             Output results as JSONL
    --help, -h         Show this help

  Exit codes:
    0  All nodes valid
    1  Validation errors found
`);
}

export default async function lint(args) {
  const opts = parseArgs(args);
  if (opts.help) { printHelp(); return; }

  const vaultDir = opts.vault || path.join(BRAIN_DIR, 'memory-vault');

  if (opts.okf) {
    const { lintOkfCompliance } = await import('../core/okf-adapter.mjs');
    const report = lintOkfCompliance(vaultDir, { strict: opts.strict });

    if (opts.json) {
      console.log(JSON.stringify(report));
    } else {
      console.error(`\n  🔍 OKF Compliance Report for: ${vaultDir}\n`);
      for (const warn of report.warnings) {
        console.error(`  ⚠️  ${warn.file}: ${warn.message}`);
      }
      for (const err of report.errors) {
        console.error(`  ❌ ${err.file}: ${err.message}`);
      }

      console.error(`\n  ── Results ──`);
      console.error(`     Total scanned:  ${report.total}`);
      console.error(`     Pass:           ${report.pass ? 'Yes' : 'No'}`);
      console.error(`     Warnings:       ${report.warnings.length}`);
      console.error(`     Errors:         ${report.errors.length}`);

      if (report.pass) {
        console.error(`\n  ✅ OKF Compliance passed\n`);
      } else {
        console.error(`\n  ❌ OKF Compliance failed\n`);
      }
    }

    if (!report.pass) {
      process.exit(1);
    }
    return;
  }

  if (!opts.json) {
    console.error(`\n  🔍 Linting vault: ${vaultDir}\n`);
  }

  let matter;
  try {
    matter = (await import('gray-matter')).default;
  } catch {
    console.error('  ❌ gray-matter not installed. Run: npm install gray-matter');
    process.exit(1);
  }

  const { MemoryNodeSchema, TaskSchema, ConflictRecordSchema } = await import('../core/schema.mjs');
  const { walkMd } = await import('../core/vault.mjs');

  const files = walkMd(vaultDir);
  let errors = 0;
  let warnings = 0;
  let valid = 0;

  const schemaMap = {
    memory: MemoryNodeSchema,
    task: TaskSchema,
    conflict: ConflictRecordSchema,
  };

  for (const file of files) {
    const rel = path.relative(vaultDir, file);
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const { data } = matter(raw);

      if (!data.type) {
        if (opts.json) {
          console.log(JSON.stringify({ file: rel, level: 'warning', message: 'Missing type field in frontmatter' }));
        } else {
          console.error(`  ⚠️  ${rel}: Missing 'type' field in frontmatter`);
        }
        warnings++;
        continue;
      }

      if (data.type === 'query') {
        valid++;
        continue;
      }

      const schema = schemaMap[data.type];
      if (!schema) {
        if (opts.json) {
          console.log(JSON.stringify({ file: rel, level: 'warning', message: `Unknown type: ${data.type}` }));
        } else {
          console.error(`  ⚠️  ${rel}: Unknown type '${data.type}' — no schema to validate against`);
        }
        warnings++;
        continue;
      }

      const result = schema.safeParse(data);
      if (!result.success) {
        const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
        if (opts.json) {
          console.log(JSON.stringify({ file: rel, level: 'error', type: data.type, issues }));
        } else {
          console.error(`  ❌ ${rel} (${data.type}):`);
          for (const issue of issues) {
            console.error(`       ${issue}`);
          }
        }
        errors++;
      } else {
        valid++;
      }
    } catch (err) {
      if (opts.json) {
        console.log(JSON.stringify({ file: rel, level: 'error', message: `Parse error: ${err.message}` }));
      } else {
        console.error(`  ❌ ${rel}: Parse error — ${err.message}`);
      }
      errors++;
    }
  }

  if (!opts.json) {
    console.error(`\n  ── Results ──`);
    console.error(`     Files scanned:  ${files.length}`);
    console.error(`     Valid:          ${valid}`);
    console.error(`     Warnings:       ${warnings}`);
    console.error(`     Errors:         ${errors}`);

    if (errors === 0 && (warnings === 0 || !opts.strict)) {
      console.error(`\n  ✅ All nodes valid\n`);
    } else {
      console.error(`\n  ❌ Validation issues found\n`);
    }
  }

  if (errors > 0 || (opts.strict && warnings > 0)) {
    process.exit(1);
  }
}
