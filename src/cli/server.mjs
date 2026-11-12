import { ensureServerService } from '../core/server-service.mjs';

export default async function server(args = []) {
  if (!args.length || args.includes('--help') || args.includes('-h')) {
    console.log('Usage: total-recall server ensure [--dry-run]\nRepair this package\'s macOS LaunchAgent and verify its process. --dry-run prints the plist diff without changes. On systemd hosts, server-release owns the server.');
    return;
  }
  if (args[0] !== 'ensure' || args.slice(1).some(arg => arg !== '--dry-run')) {
    console.error('Usage: total-recall server ensure [--dry-run]');
    process.exitCode = 2;
    return;
  }
  try {
    const result = await ensureServerService({ dryRun: args.includes('--dry-run') });
    console.log(result.diff || result.reason || `Server verified: pid ${result.pid}, ${result.entry}`);
    return result;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
