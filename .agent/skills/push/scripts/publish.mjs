import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();

console.error('🚀 Starting Direct NPM Publish Automation...');

// 1. Load NPM automation token from secrets (fallback from local workspace to global)
const localSecretsPath = path.join(ROOT, '.agent', 'secrets.enc');
const globalSecretsPath = path.join(os.homedir(), '.agent', 'skills', 'total-recall', 'config', 'secrets.enc');

let secretsPath = null;
if (fs.existsSync(localSecretsPath)) {
  secretsPath = localSecretsPath;
} else if (fs.existsSync(globalSecretsPath)) {
  secretsPath = globalSecretsPath;
} else {
  console.error('❌ secrets.enc file not found at local or global paths!');
  console.error(`   Local path searched:  ${localSecretsPath}`);
  console.error(`   Global path searched: ${globalSecretsPath}`);
  process.exit(1);
}

let secrets = {};
try {
  secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8'));
} catch (err) {
  console.error(`❌ Failed to parse secrets file at ${secretsPath}: ${err.message}`);
  process.exit(1);
}

const npmToken = secrets.npm_token;
if (!npmToken) {
  console.error(`❌ No npm_token found in secrets.enc at ${secretsPath}! Complete setup/onboarding first.`);
  process.exit(1);
}

console.error(`🔑 Successfully loaded NPM automation token from: ${secretsPath}`);

// Helper to run command
function runCommand(command, args = [], opts = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: opts.cwd || ROOT });
  return result.status === 0;
}

// 2. Back up existing ~/.npmrc if it exists
const npmrcPath = path.join(os.homedir(), '.npmrc');
let npmrcBackup = null;

if (fs.existsSync(npmrcPath)) {
  console.error('💾 Backing up existing ~/.npmrc...');
  npmrcBackup = fs.readFileSync(npmrcPath, 'utf8');
}

try {
  // 3. Write automation token to ~/.npmrc
  console.error('✍️  Configuring ~/.npmrc with automation token...');
  fs.writeFileSync(npmrcPath, `//registry.npmjs.org/:_authToken=${npmToken}\n`, { mode: 0o600 });

  // 4. Push release commits and tags to remote git repository
  console.error('\n📡 Pushing release commits and tags to git remote...');
  if (!runCommand('git', ['push', 'origin', 'main', '--tags'])) {
    throw new Error('Failed to push tag/commits to git remote.');
  }

  // 5. Publish to npm registry locally
  console.error('\n📦 Publishing package to NPM registry locally...');
  if (!runCommand('npm', ['publish'])) {
    throw new Error('Failed to publish package to NPM registry.');
  }

  console.error('\n🎉 Package successfully published to NPM registry!');
} catch (err) {
  console.error(`\n❌ Release failed: ${err.message}`);
  process.exit(1);
} finally {
  // 6. Restore original ~/.npmrc
  if (npmrcBackup !== null) {
    console.error('🔄 Restoring original ~/.npmrc...');
    fs.writeFileSync(npmrcPath, npmrcBackup, { mode: 0o600 });
  } else if (fs.existsSync(npmrcPath)) {
    console.error('🗑️  Removing temporary ~/.npmrc...');
    fs.unlinkSync(npmrcPath);
  }
}
