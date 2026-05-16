import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { loadNodes, writeNode, atomicWrite } from './vault.mjs';
import { createSnapshot } from './snapshot.mjs';
import { SSSS_SCHEMAS } from './schema.mjs';

/**
 * Executes a schema migration.
 * Because a migration is destructive, it MUST:
 * 1. Take a safety snapshot.
 * 2. Execute the migration script over the vault nodes.
 * 3. Write a `type: migration` record tracking the result.
 */
export async function runMigration(vaultDir, fromVersion, toVersion, migrationFn, description) {
  console.log(`\n[Migration] Initiating migration from v${fromVersion} to v${toVersion}`);
  console.log(`[Migration] Description: ${description}`);

  // 1. Safety Snapshot
  console.log(`[Migration] Creating pre-migration safety snapshot...`);
  const snapshotId = await createSnapshot(vaultDir);
  console.log(`[Migration] Safety snapshot created: ${snapshotId}`);

  const migrationId = `mig_${crypto.randomBytes(6).toString('hex')}`;
  const migrationRecord = {
    type: 'migration',
    migration_id: migrationId,
    from_version: fromVersion,
    to_version: toVersion,
    status: 'pending',
    description,
  };

  try {
    const nodes = loadNodes(vaultDir);
    console.log(`[Migration] Loaded ${nodes.length} nodes for migration processing.`);

    // 2. Execute Migration
    const migratedNodes = await migrationFn(nodes);

    console.log(`[Migration] Writing ${migratedNodes.length} migrated nodes back to vault...`);
    // Note: in a real system we'd diff and only write changed, but migration often touches all.
    for (const node of migratedNodes) {
      // In a real migration we might delete old files if slug changes, but this assumes in-place update
      writeNode(node, vaultDir);
    }

    migrationRecord.status = 'applied';
    migrationRecord.applied_at = new Date().toISOString();
    console.log(`[Migration] ✅ Migration to v${toVersion} completed successfully.`);

  } catch (err) {
    console.error(`[Migration] ❌ Migration failed: ${err.message}`);
    migrationRecord.status = 'failed';
    migrationRecord.applied_at = new Date().toISOString();
    
    // Auto-rollback on failure could be triggered here.
    console.error(`[Migration] ⚠️ WARNING: Vault may be in an inconsistent state. Please run 'total-recall snapshot rollback ${snapshotId}' immediately to recover.`);
    throw err;
  } finally {
    // 3. Record the migration event
    const migrationsDir = path.join(vaultDir, 'system', 'migrations');
    if (!fs.existsSync(migrationsDir)) fs.mkdirSync(migrationsDir, { recursive: true });
    
    // Ensure slug doesn't conflict
    const slug = `migration-v${toVersion}-${migrationId}`;
    writeNode({ ...migrationRecord, slug }, migrationsDir);
  }

  return { migrationId, status: migrationRecord.status };
}

/**
 * Migration Test Harness
 * Simulates a migration in-memory to verify it produces valid schema shapes.
 */
export async function testMigration(vaultDir, migrationFn, targetSchemaType) {
  console.log(`\n[Migration Test] Running migration harness in isolated context...`);
  
  const nodes = loadNodes(vaultDir).slice(0, 50); // Sample a subset
  
  try {
    const testMigrated = await migrationFn(nodes);
    
    let validCount = 0;
    let invalidCount = 0;

    const schema = SSSS_SCHEMAS[targetSchemaType];
    
    for (const node of testMigrated) {
      if (node.type === targetSchemaType) {
        if (schema) {
          const res = schema.safeParse(node);
          if (res.success) {
            validCount++;
          } else {
            invalidCount++;
            console.error(`[Migration Test] Schema violation on node ${node.slug}:`, res.error.errors);
          }
        }
      }
    }

    if (invalidCount === 0) {
      console.log(`[Migration Test] ✅ Harness passed. ${validCount} target nodes successfully conform to new schema.`);
      return true;
    } else {
      console.error(`[Migration Test] ❌ Harness failed. ${invalidCount} nodes failed schema validation.`);
      return false;
    }
  } catch (err) {
    console.error(`[Migration Test] ❌ Harness crashed during execution: ${err.message}`);
    return false;
  }
}
