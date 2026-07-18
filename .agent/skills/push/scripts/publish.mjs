import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// publish.mjs lives at .agent/skills/push/scripts/ → four levels up to repo root
import { loadSecrets } from '../../../../src/core/secrets-store.mjs';

const ROOT = process.cwd();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.error('🚀 Starting Direct NPM Publish Automation...');

/**
 * Load npm_token from encrypted or plain secrets.enc via secrets-store.
 * Prefers workspace .agent, then global total-recall brain.
 */
async function loadNpmToken() {
  const candidates = [
    path.join(ROOT, '.agent'),
    path.join(os.homedir(), '.agent', 'skills', 'total-recall'),
  ];
  const errors = [];
  for (const brainDir of candidates) {
    try {
      const secrets = await loadSecrets(brainDir);
      const token = secrets.npm_token || secrets.NPM_TOKEN;
      if (token) {
        return { token, brainDir };
      }
      errors.push(`${brainDir}: no npm_token key`);
    } catch (err) {
      errors.push(`${brainDir}: ${err.message}`);
    }
  }
  throw new Error(`No npm_token found.\n${errors.map((e) => `  - ${e}`).join('\n')}`);
}

function runCommand(command, args = [], opts = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: opts.cwd || ROOT });
  return result.status === 0;
}

const { token: npmToken, brainDir: secretsBrainDir } = await loadNpmToken();
console.error(`🔑 Successfully loaded NPM automation token from: ${secretsBrainDir}`);

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
