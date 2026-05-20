/**
 * total-recall start
 *
 * Start the brain server in the foreground.
 * This is the same as running `node src/server/index.mjs` but works correctly
 * regardless of install method (npx, global npm, local clone).
 *
 * Usage:
 *   npx total-recall start [--port 3000] [--host 127.0.0.1]
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, '..', 'server', 'index.mjs');

export default function start(args) {
  const port = (() => {
    const i = args.indexOf('--port');
    return i !== -1 ? args[i + 1] : process.env.PORT || '3000';
  })();
  const host = (() => {
    const i = args.indexOf('--host');
    return i !== -1 ? args[i + 1] : process.env.HOST || '127.0.0.1';
  })();

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
  total-recall start — Start the brain server

  Usage: total-recall start [options]

  Options:
    --port <port>    Port to listen on (default: 3000, or \$PORT)
    --host <host>    Host to bind to  (default: 127.0.0.1, or \$HOST)
    --help           Show this help

  The server reads config from ~/.agent/config/security.yml.
  Use Cloudflare or Caddy in front for HTTPS when accessing remotely.
`);
    return;
  }

  console.log(`  ⚡ Starting Total Recall brain server on ${host}:${port}`);
  console.log(`  Press Ctrl+C to stop.\n`);

  const result = spawnSync(process.execPath, [SERVER], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: port,
      HOST: host,
      NODE_ENV: process.env.NODE_ENV || 'production',
    },
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
