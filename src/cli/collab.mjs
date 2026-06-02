/**
 * total-recall collab
 *
 * Start the collaboration backend server and frontend development portal.
 *
 * Usage:
 *   npx total-recall collab
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COLLAB_DIR = path.join(__dirname, '..', '..', 'collab');

export default function collab(args) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
  total-recall collab — Start collaboration workspace

  Usage: total-recall collab [options]

  Options:
    --help           Show this help

  Starts the Express/WebSockets backend server and Vite frontend portal.
`);
    return;
  }

  console.log(`  ⚡ Starting Total Recall collaboration workspace...`);
  console.log(`  Press Ctrl+C to stop.\n`);

  const child = spawn('npm', ['run', 'dev'], {
    cwd: COLLAB_DIR,
    stdio: 'inherit',
    shell: true,
  });

  process.on('SIGINT', () => {
    child.kill('SIGINT');
    process.exit(0);
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}
