/**
 * Total Recall — App Capability Deployment CLI
 *
 * Implements `npx total-recall app <subcommand>`
 * Supported subcommands:
 *   app plan <source> [--target <dir>] [--adapter <id>] [--json] [--pin <sha256>]
 *   app add <source> [--target <dir>] [--adapter <id>] [--dry-run] [--force] [--json]
 *   app create <dir> --plugin <source> [--adapter <id>] [--name <name>] [--force] [--json]
 *   app upgrade <id> --to <source> [--target <dir>] [--adapter <id>] [--dry-run] [--json]
 *   app verify [--target <dir>] [--json]
 */

import path from 'node:path';
import { createDeploymentPlan } from '../../core/app-deploy/plan.mjs';
import {
  applyDeploymentPlan,
  AppApplyPreflightError,
  AppApplyError
} from '../../core/app-deploy/apply.mjs';
import {
  upgradeCapability,
  AppUpgradeError
} from '../../core/app-deploy/upgrade.mjs';
import {
  createStandaloneApp,
  AppCreateError
} from '../../core/app-deploy/standalone.mjs';
import { verifyApplication } from '../../core/app-deploy/verify.mjs';
import {
  IncompatibleAdapterError,
  IncompatibleSsssVersionError,
  OwnershipCollisionError
} from '../../core/app-deploy/resolve.mjs';

function printHelp() {
  console.log(`
🚀 Total Recall — App Capability Deployment

Plan, compose, deploy, and verify modular capabilities into standalone and host applications.

Usage:
  npx total-recall app <command> [options]

Commands:
  plan <source>             Compute a read-only deterministic deployment plan
                            --target <dir>     Target application directory (default: cwd)
                            --adapter <id>     Target adapter (ssss-app, nextjs, react, flask)
                            --pin <sha256>     Enforce exact source hash pin
                            --json             Output plan as JSON

  add <source>              Apply capability plan to target application
                            --target <dir>     Target application directory (default: cwd)
                            --adapter <id>     Target adapter
                            --dry-run          Preflight and stage only, no app mutations
                            --force            Bypass identical checks
                            --json             Output result as JSON

  create <dir>              Scaffold a new standalone application with capability
                            --plugin <source>  Initial capability plugin source (required)
                            --adapter <id>     Adapter (default: ssss-app)
                            --name <name>      App name (default: dir basename)
                            --force            Overwrite existing non-empty directory
                            --json             Output result as JSON

  upgrade <id>              Upgrade an installed capability to a new version/pin
                            --to <source>      New capability source or pinned version (required)
                            --target <dir>     Target application directory (default: cwd)
                            --adapter <id>     Adapter
                            --dry-run          Preflight only
                            --json             Output result as JSON

  verify                    Verify deployed capabilities, file digests, and SSSS conformance
                            --target <dir>     Target application directory (default: cwd)
                            --json             Output verification report as JSON

Exit Codes:
  0   Success
  1   User/argument error or internal failure
  2   Plan conflict detected or verification drift
  3   Incompatible adapter or SSSS version
`);
}

export async function run(argv = []) {
  let args = Array.isArray(argv) ? argv : [];
  if (args[0]?.endsWith('node')) {
    args = args.slice(2);
  }
  if (args[0] === 'app') {
    args = args.slice(1);
  }

  const sub = args[0];
  const rest = args.slice(1);

  if (!sub || sub === '--help' || sub === '-h') {
    printHelp();
    return;
  }

  // 1. APP PLAN
  if (sub === 'plan') {
    let source = null;
    let target = process.cwd();
    let adapter = 'ssss-app';
    let isJson = false;
    let pin = null;

    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (arg === '--json') {
        isJson = true;
      } else if (arg === '--target' && rest[i + 1]) {
        target = rest[i + 1];
        i++;
      } else if (arg === '--adapter' && rest[i + 1]) {
        adapter = rest[i + 1];
        i++;
      } else if (arg === '--pin' && rest[i + 1]) {
        pin = rest[i + 1];
        i++;
      } else if (!arg.startsWith('--') && !source) {
        source = arg;
      }
    }

    if (!source) {
      if (isJson) {
        console.error(JSON.stringify({ error: 'Missing capability source argument' }));
      } else {
        console.error('❌ Error: Missing capability source.');
        console.error('   Usage: total-recall app plan <source> [--target <dir>] [--adapter <id>] [--json]\n');
      }
      process.exit(1);
    }

    let plan;
    try {
      plan = await createDeploymentPlan(source, {
        target,
        adapter,
        expectedHash: pin
      });
    } catch (err) {
      if (err?.message?.startsWith('process.exit(')) {
        throw err;
      }
      if (isJson) {
        console.error(JSON.stringify({ error: err.message, type: err.name }));
      } else {
        console.error(`\n❌ Plan Failed: ${err.message}\n`);
      }

      if (err instanceof IncompatibleAdapterError || err instanceof IncompatibleSsssVersionError) {
        process.exit(3);
      } else if (err instanceof OwnershipCollisionError) {
        process.exit(2);
      }
      process.exit(1);
    }

    if (isJson) {
      console.log(JSON.stringify(plan, null, 2));
    } else {
      console.log(`\n📋 Capability Deployment Plan`);
      console.log(`   Plan Hash:   \x1b[36m${plan.plan_hash}\x1b[0m`);
      console.log(`   Target App:  ${plan.target_app.dir} (${plan.target_app.framework})`);
      console.log(`   Adapter:     ${plan.adapter}`);
      console.log(`   Valid:       ${plan.valid ? '\x1b[32m✔ YES\x1b[0m' : '\x1b[31m✖ NO (Conflicts detected)\x1b[0m'}\n`);

      console.log(`📦 Capabilities (${plan.capabilities.length}):`);
      for (const cap of plan.capabilities) {
        console.log(`   - \x1b[1m${cap.id}\x1b[0m v${cap.version} (hash: ${cap.source_sha256.slice(0, 12)}...)`);
      }

      console.log(`\n📄 File Operations (${plan.file_operations.length}):`);
      for (const op of plan.file_operations) {
        const color = op.action === 'create' ? '\x1b[32m+' : op.action === 'conflict' ? '\x1b[31m!' : op.action === 'modify' ? '\x1b[33m~' : '\x1b[90m=';
        console.log(`   ${color} [${op.action.toUpperCase()}]\x1b[0m ${op.path} (${op.size} bytes)`);
      }

      if (plan.access_grants.length > 0) {
        console.log(`\n🔑 Required Access Grants:`);
        for (const g of plan.access_grants) {
          console.log(`   - ${g}`);
        }
      }

      if (plan.conflicts.length > 0) {
        console.log(`\n⚠️  Conflicts Detected:`);
        for (const c of plan.conflicts) {
          console.log(`   - \x1b[31m${c.path}\x1b[0m: file in target app conflicts with capability payload`);
        }
      }
      console.log('');
    }

    plan.cleanup?.();

    if (!plan.valid) {
      process.exit(2);
    }
    process.exit(0);
  }

  // 2. APP ADD
  else if (sub === 'add') {
    let source = null;
    let target = process.cwd();
    let adapter = 'ssss-app';
    let isJson = false;
    let dryRun = false;
    let force = false;

    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (arg === '--json') {
        isJson = true;
      } else if (arg === '--dry-run') {
        dryRun = true;
      } else if (arg === '--force') {
        force = true;
      } else if (arg === '--target' && rest[i + 1]) {
        target = rest[i + 1];
        i++;
      } else if (arg === '--adapter' && rest[i + 1]) {
        adapter = rest[i + 1];
        i++;
      } else if (!arg.startsWith('--') && !source) {
        source = arg;
      }
    }

    if (!source) {
      if (isJson) {
        console.error(JSON.stringify({ error: 'Missing capability source argument' }));
      } else {
        console.error('❌ Error: Missing capability source.');
        console.error('   Usage: total-recall app add <source> [--target <dir>] [--adapter <id>] [--dry-run] [--json]\n');
      }
      process.exit(1);
    }

    let result;
    try {
      result = await applyDeploymentPlan(source, {
        target,
        adapter,
        dryRun,
        force
      });
    } catch (err) {
      if (err?.message?.startsWith('process.exit(')) throw err;
      if (isJson) {
        console.error(JSON.stringify({ error: err.message, type: err.name }));
      } else {
        console.error(`\n❌ Add Failed: ${err.message}\n`);
      }
      if (err instanceof AppApplyPreflightError) {
        process.exit(2);
      }
      process.exit(1);
    }

    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (dryRun) {
        console.log(`\n✔ Dry-run successful! Preflight passed for plan \x1b[36m${result.plan_hash}\x1b[0m (${result.operations} operations).`);
      } else if (result.already_applied) {
        console.log(`\n✔ Capability already applied with matching plan \x1b[36m${result.plan_hash}\x1b[0m. No changes needed.`);
      } else {
        console.log(`\n✔ Successfully deployed capabilities [${result.capabilities.join(', ')}]!`);
        console.log(`   Applied files: ${result.applied_files}`);
        console.log(`   Plan hash:     \x1b[36m${result.plan_hash}\x1b[0m\n`);
      }
    }
    process.exit(0);
  }

  // 3. APP CREATE
  else if (sub === 'create') {
    let targetDir = null;
    let plugin = null;
    let adapter = 'ssss-app';
    let name = null;
    let force = false;
    let isJson = false;

    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (arg === '--json') {
        isJson = true;
      } else if (arg === '--force') {
        force = true;
      } else if (arg === '--plugin' && rest[i + 1]) {
        plugin = rest[i + 1];
        i++;
      } else if (arg === '--adapter' && rest[i + 1]) {
        adapter = rest[i + 1];
        i++;
      } else if (arg === '--name' && rest[i + 1]) {
        name = rest[i + 1];
        i++;
      } else if (!arg.startsWith('--') && !targetDir) {
        targetDir = arg;
      }
    }

    if (!targetDir || !plugin) {
      if (isJson) {
        console.error(JSON.stringify({ error: 'Missing target directory or --plugin source' }));
      } else {
        console.error('❌ Error: Missing target directory or --plugin source.');
        console.error('   Usage: total-recall app create <dir> --plugin <source> [--adapter <id>] [--json]\n');
      }
      process.exit(1);
    }

    let result;
    try {
      result = await createStandaloneApp(targetDir, {
        plugin,
        adapter,
        name,
        force
      });
    } catch (err) {
      if (err?.message?.startsWith('process.exit(')) throw err;
      if (isJson) {
        console.error(JSON.stringify({ error: err.message, type: err.name }));
      } else {
        console.error(`\n❌ Create Failed: ${err.message}\n`);
      }
      process.exit(1);
    }

    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`\n🎉 Standalone application '\x1b[1m${result.name}\x1b[0m' created successfully!`);
      console.log(`   Location:     ${result.targetDir}`);
      console.log(`   Adapter:      ${result.adapter}`);
      console.log(`   Capabilities: ${result.capabilities.join(', ')}\n`);
    }
    process.exit(0);
  }

  // 4. APP UPGRADE
  else if (sub === 'upgrade') {
    let capabilityId = null;
    let toSource = null;
    let target = process.cwd();
    let adapter = 'ssss-app';
    let dryRun = false;
    let isJson = false;

    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (arg === '--json') {
        isJson = true;
      } else if (arg === '--dry-run') {
        dryRun = true;
      } else if (arg === '--to' && rest[i + 1]) {
        toSource = rest[i + 1];
        i++;
      } else if (arg === '--target' && rest[i + 1]) {
        target = rest[i + 1];
        i++;
      } else if (arg === '--adapter' && rest[i + 1]) {
        adapter = rest[i + 1];
        i++;
      } else if (!arg.startsWith('--') && !capabilityId) {
        capabilityId = arg;
      }
    }

    if (!capabilityId || !toSource) {
      if (isJson) {
        console.error(JSON.stringify({ error: 'Missing capability ID or --to source' }));
      } else {
        console.error('❌ Error: Missing capability ID or --to source.');
        console.error('   Usage: total-recall app upgrade <id> --to <source> [--target <dir>] [--json]\n');
      }
      process.exit(1);
    }

    let result;
    try {
      result = await upgradeCapability(capabilityId, {
        to: toSource,
        target,
        adapter,
        dryRun
      });
    } catch (err) {
      if (err?.message?.startsWith('process.exit(')) throw err;
      if (isJson) {
        console.error(JSON.stringify({ error: err.message, type: err.name }));
      } else {
        console.error(`\n❌ Upgrade Failed: ${err.message}\n`);
      }
      process.exit(1);
    }

    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (dryRun) {
        console.log(`\n✔ Dry-run upgrade plan computed: ${result.from_version} → \x1b[32m${result.to_version}\x1b[0m`);
        console.log(`   Removed obsolete files: ${result.removed_files.join(', ') || 'none'}`);
      } else {
        console.log(`\n🚀 Capability '\x1b[1m${result.capability_id}\x1b[0m' upgraded: v${result.from_version} → \x1b[32mv${result.to_version}\x1b[0m`);
        console.log(`   Plan Hash: ${result.plan_hash}`);
        console.log(`   Applied files: ${result.applied_files}\n`);
      }
    }
    process.exit(0);
  }

  // 5. APP VERIFY
  else if (sub === 'verify') {
    let target = process.cwd();
    let isJson = false;

    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (arg === '--json') {
        isJson = true;
      } else if (arg === '--target' && rest[i + 1]) {
        target = rest[i + 1];
        i++;
      }
    }

    let report;
    try {
      report = await verifyApplication(target);
    } catch (err) {
      if (err?.message?.startsWith('process.exit(')) throw err;
      if (isJson) {
        console.error(JSON.stringify({ error: err.message }));
      } else {
        console.error(`\n❌ Verification Failed: ${err.message}\n`);
      }
      process.exit(1);
    }

    if (isJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`\n🔍 Application Verification Report`);
      console.log(`   Target:  ${report.target}`);
      console.log(`   Status:  ${report.valid ? '\x1b[32m✔ CONFORMANT (No drift)\x1b[0m' : '\x1b[31m✖ DRIFT DETECTED\x1b[0m'}`);
      console.log(`   Events:  ${report.events_count} recorded\n`);

      if (report.capabilities.length > 0) {
        console.log(`📦 Capabilities (${report.capabilities.length}):`);
        for (const cap of report.capabilities) {
          const statusIcon = cap.status === 'installed' && cap.drift.length === 0 ? '✔' : '✖';
          console.log(`   ${statusIcon} \x1b[1m${cap.id}\x1b[0m v${cap.version} [${cap.status}] (${cap.files_intact}/${cap.files_checked} files verified)`);
          for (const d of cap.drift) {
            console.log(`     \x1b[31m! Drift in ${d.path} (missing: ${Boolean(d.missing)})\x1b[0m`);
          }
        }
      }

      if (report.errors.length > 0) {
        console.log(`\n⚠️  Errors:`);
        for (const e of report.errors) {
          console.log(`   - \x1b[31m${e}\x1b[0m`);
        }
      }
      console.log('');
    }

    if (!report.valid) {
      process.exit(2);
    }
    process.exit(0);
  }

  // UNKNOWN SUBCOMMAND
  else {
    console.error(`Unknown app subcommand: ${sub}`);
    printHelp();
    process.exit(1);
  }
}

export default async function (args = []) {
  return run(args);
}
