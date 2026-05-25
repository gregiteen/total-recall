import path from 'path';
import { runMigration, testMigration } from '../core/migrate.mjs';
import { brainDir } from '../core/config.mjs';

const VAULT_DIR = path.join(brainDir, 'memory-vault');

export default async function migrateCommand(args) {
  if (args[0] === '--help' || args[0] === '-h') {
    console.log(`
  total-recall migrate <test|apply> [options]

  Run backwards-incompatible SSSS schema migrations.
  Because migrations are destructive, 'apply' will automatically create a pre-migration safety snapshot.

  Commands:
    test   <script.mjs>   Run migration test harness (in-memory, no writes)
    apply  <script.mjs>   Apply the migration over the active memory vault

  Options:
    --from <n>   Starting schema version
    --to <n>     Target schema version
    --desc "..." Description of the migration

  Examples:
    total-recall migrate test ./upgrade-v2-v3.mjs --to 3
    total-recall migrate apply ./upgrade-v2-v3.mjs --from 2 --to 3 --desc "Add confidence decay to memories"
`);
    process.exit(0);
  }

  const action = args[0];
  const scriptPath = args[1];

  if (!['test', 'apply'].includes(action)) {
    console.error(`Invalid action. Use 'test' or 'apply'.`);
    process.exit(1);
  }

  if (!scriptPath) {
    console.error(`Please specify a migration script (e.g. ./upgrade.mjs).`);
    process.exit(1);
  }

  // Parse args
  let fromVersion = 0;
  let toVersion = 0;
  let desc = 'Schema migration';

  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--from') fromVersion = parseInt(args[++i], 10);
    else if (args[i] === '--to') toVersion = parseInt(args[++i], 10);
    else if (args[i] === '--desc') desc = args[++i];
  }

  const absoluteScriptPath = path.resolve(process.cwd(), scriptPath);
  let migrationModule;
  try {
    migrationModule = await import(absoluteScriptPath);
  } catch (err) {
    console.error(`Failed to load migration script at ${absoluteScriptPath}: ${err.message}`);
    process.exit(1);
  }

  const migrationFn = migrationModule.default || migrationModule.migrate;
  if (typeof migrationFn !== 'function') {
    console.error(`Migration script must export a default function or 'migrate' function.`);
    process.exit(1);
  }

  if (action === 'test') {
    const passed = await testMigration(VAULT_DIR, migrationFn, 'memory'); // Assuming 'memory' is the primary target
    process.exit(passed ? 0 : 1);
  }

  if (action === 'apply') {
    if (!fromVersion || !toVersion) {
      console.error(`Both --from and --to versions are required for apply.`);
      process.exit(1);
    }

    try {
      await runMigration(VAULT_DIR, fromVersion, toVersion, migrationFn, desc);
    } catch (err) {
      process.exit(1);
    }
  }
}
