#!/usr/bin/env node

/**
 * Script: verify-deploy.mjs
 * Purpose: Verifies that the push skill scripts are present.
 */

import fs from 'node:fs';
import path from 'node:path';
import { sendNotification } from '../../notifications/scripts/notify.mjs';

const PUSH_DIR = path.resolve('.agent/skills/push');
const SCRIPTS_DIR = path.join(PUSH_DIR, 'scripts');

let exitCode = 0;

function checkFile(filePath, description) {
  if (fs.existsSync(filePath)) {
    console.log(`✅ [PASS] ${description} exists.`);
  } else {
    console.error(`❌ [FAIL] Missing ${description}: ${filePath}`);
    exitCode = 1;
  }
}

// 1. Verify API deploy script
checkFile(path.join(SCRIPTS_DIR, 'api-deploy-zero-downtime.sh'), 'Zero-Downtime Deploy Script');

if (exitCode === 0) {
  console.log("🎉 Push scripts are valid.");
  await sendNotification("Deploy Verification", "Push scripts are valid.");
} else {
  console.error("⚠️ Push scripts are missing.");
  await sendNotification("Deploy Verification Failed", "Push scripts are missing!");
}
process.exit(exitCode);
