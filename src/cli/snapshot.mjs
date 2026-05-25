import { createSnapshot, listSnapshots, rollbackVault } from '../core/snapshot.mjs';
import { resolveAgentDir, resolveBrainDir, getBothBrains } from './agent-dir.mjs';
import { compileSurface } from '../core/surface.mjs';
import path from 'path';

/**
 * total-recall snapshot [command]
 *
 * Commands:
 *   create [reason]    Create a new point-in-time snapshot of the vault
 *   list               List all available snapshots
 *   rollback <id>      Restore the vault to a specific snapshot
 */

function printHelp() {
  console.log(`
  total-recall snapshot — VFS Point-in-Time Recovery

  Usage: total-recall snapshot <command> [options]

  Commands:
    create [reason]    Create a fast local snapshot of the memory-vault
    list               List all available snapshots
    rollback <id>      Restore the vault to a specific snapshot ID

  Options:
    --help, -h         Show this help
`);
}

export default async function snapshotCli(args) {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  const command = args[0];

  if (command === 'create') {
    const reason = args.slice(1).join(' ') || 'manual';
    console.log('📸 Creating snapshot...');
    const result = createSnapshot(reason);
    if (result.success) {
      console.log(`✅ Snapshot created successfully!`);
      console.log(`   ID:     ${result.snapshot_id}`);
      console.log(`   Path:   ${result.path}`);
      console.log(`   Reason: ${reason}`);
    } else {
      console.error(`❌ Failed to create snapshot: ${result.error}`);
      process.exit(1);
    }
  } 
  
  else if (command === 'list') {
    const snaps = listSnapshots();
    if (snaps.length === 0) {
      console.log('No snapshots found.');
      return;
    }
    console.log('📸 Available Snapshots:');
    console.log('------------------------------------------------------------');
    for (const snap of snaps) {
      const date = new Date(snap.created_at).toLocaleString();
      console.log(`ID:      ${snap.snapshot_id}`);
      console.log(`Date:    ${date}`);
      console.log(`Reason:  ${snap.reason}`);
      console.log('------------------------------------------------------------');
    }
  }

  else if (command === 'rollback') {
    const id = args[1];
    if (!id) {
      console.error('❌ You must provide a snapshot ID to rollback to.');
      console.error('Usage: total-recall snapshot rollback <id>');
      process.exit(1);
    }

    console.log(`⚠️  Rolling back memory-vault to snapshot: ${id}`);
    console.log(`   (A pre-rollback safety snapshot will be created automatically)`);
    
    const result = rollbackVault(id);
    if (result.success) {
      console.log(`✅ Rollback successful.`);
      console.log(`🔄 Recompiling derived indexes from restored vault...`);
      
      const agentDir = resolveAgentDir();
      const brainDir = resolveBrainDir();
      const brains = getBothBrains();
      const globalVaultDir = brains.global ? path.join(brains.global.brainDir, 'memory-vault') : undefined;
      await compileSurface({
        vaultDir: path.join(brainDir, 'memory-vault'),
        skillsDir: path.join(agentDir, 'skills'),
        derivedDir: path.join(brainDir, 'memory-derived'),
        instructionsFile: path.join(agentDir, 'INSTRUCTIONS.md'),
        globalVaultDir
      });
      
      console.log(`✅ Vault restoration and projection rebuild complete.`);
    } else {
      console.error(`❌ Rollback failed: ${result.error}`);
      process.exit(1);
    }
  }

  else {
    console.error(`❌ Unknown snapshot command: ${command}`);
    printHelp();
    process.exit(1);
  }
}
