#!/usr/bin/env node

/**
 * Script: monitor-deploy.mjs
 * Purpose: Connects to the DigitalOcean droplet via SSH, tails the auto-deploy.log, 
 * and triggers a native macOS notification when the deployment finishes or fails.
 */

import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const notifyScript = path.resolve(__dirname, '../../notifications/scripts/notify.mjs');

console.log("📡 Connecting to droplet to monitor deployment...");

// Run SSH and tail the log file
const ssh = spawn('ssh', [
  '-o', 'StrictHostKeyChecking=no',
  'root@138.197.199.217',
  'tail -n 0 -f /root/auto-deploy.log'
]);

let success = false;
let failed = false;

ssh.stdout.on('data', (data) => {
  const output = data.toString();
  process.stdout.write(output);

  // Check for success marker
  if (output.includes('=== DEPLOY COMPLETE ===')) {
    success = true;
    console.log("\n🎉 Deployment completed successfully!");
    execSync(`node "${notifyScript}" "✅ Deploy Complete" "Zero-downtime build finished and containers are healthy."`);
    ssh.kill();
  } 
  // Check for failure marker
  else if (output.includes('FAILED') || output.includes('Error:')) {
    failed = true;
    console.error("\n❌ Deployment failed!");
    execSync(`node "${notifyScript}" "❌ Deploy Failed" "An error occurred during the build process. Check logs."`);
    ssh.kill();
  }
});

ssh.stderr.on('data', (data) => {
  process.stderr.write(data.toString());
});

ssh.on('close', (code) => {
  if (!success && !failed) {
    execSync(`node "${notifyScript}" "⚠️ Deploy Monitor Disconnected" "Lost connection to droplet before deploy finished."`);
  }
  process.exit(code || 0);
});
