/** Compatibility command delegates password setup to its required auth owner. */
import { loadPluginModule } from '../core/plugin-runtime.mjs';
export default async function hashPassword(args) {
  if (!args.length || args.includes('--help') || args.includes('-h')) {
    console.log('Use total-recall auth password set --stdin. Passwords and hashes are managed by auth.');
    return;
  }
  if (args.some(arg => !['--stdin', '--json'].includes(arg)) || !args.includes('--stdin')) throw new Error('Password arguments are refused. Use auth password set --stdin.');
  const owner = await loadPluginModule('auth', 'commands');
  return owner.run(['password', 'set', ...args]);
}
