import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { loadNodes, writeNode, atomicWrite } from './vault.mjs';
import { createSnapshot } from './snapshot.mjs';
import { SSSS_SCHEMAS } from './schema.mjs';
import { logger } from './logger.mjs';

/**
 * Executes a schema migration.
 * Because a migration is destructive, it MUST:
 * 1. Take a safety snapshot.
 * 2. Execute the migration script over the vault nodes.
 * 3. Write a `type: migration` record tracking the result.
 */
export async function runMigration(vaultDir, fromVersion, toVersion, migrationFn, description) {
  logger.info('migration', `Initiating migration from v${fromVersion} to v${toVersion}`);
  logger.info('migration', `Description: ${description}`);

  // 1. Safety Snapshot
  logger.info('migration', 'Creating pre-migration safety snapshot...');
  const snapshotId = await createSnapshot(vaultDir);
  logger.info('migration', `Safety snapshot created: ${snapshotId}`);

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
    logger.info('migration', `Loaded ${nodes.length} nodes for migration processing.`);

    // 2. Execute Migration
    const migratedNodes = await migrationFn(nodes);

    logger.info('migration', `Writing ${migratedNodes.length} migrated nodes back to vault...`);
    // Note: in a real system we'd diff and only write changed, but migration often touches all.
    for (const node of migratedNodes) {
      // In a real migration we might delete old files if slug changes, but this assumes in-place update
      writeNode(node, vaultDir);
    }

    migrationRecord.status = 'applied';
    migrationRecord.applied_at = new Date().toISOString();
    logger.info('migration', `Migration to v${toVersion} completed successfully.`);

  } catch (err) {
    logger.error('migration', `Migration failed: ${err.message}`);
    migrationRecord.status = 'failed';
    migrationRecord.applied_at = new Date().toISOString();
    
    // Auto-rollback on failure could be triggered here.
    logger.error('migration', `WARNING: Vault may be in an inconsistent state. Please run 'total-recall snapshot rollback ${snapshotId}' immediately to recover.`);
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
  logger.info('migration', 'Running migration harness in isolated context...');
  
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
            logger.error('migration', `Schema violation on node ${node.slug}`, { errors: res.error.errors });
          }
        }
      }
    }

    if (invalidCount === 0) {
      logger.info('migration', `Harness passed. ${validCount} target nodes successfully conform to new schema.`);
      return true;
    } else {
      logger.error('migration', `Harness failed. ${invalidCount} nodes failed schema validation.`);
      return false;
    }
  } catch (err) {
    logger.error('migration', `Harness crashed during execution: ${err.message}`);
    return false;
  }
}
