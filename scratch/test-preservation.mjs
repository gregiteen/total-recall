import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert';

import uninstall from '../src/cli/uninstall.mjs';
import init from '../src/cli/init.mjs';

const HOME = os.homedir();
const globalAgentDir = path.join(HOME, '.agent');
const globalBrainDir = path.join(globalAgentDir, 'skills', 'total-recall');
const testSecretsPath = path.join(globalBrainDir, 'config', 'secrets.enc');
const testSecurityPath = path.join(globalBrainDir, 'config', 'security.yml');
const backupPath = path.join(globalAgentDir, 'secrets.enc');

async function run() {
  console.log('⚡ Starting Credentials Preservation lifecycle test...');

  // 1. Setup mock VFS environment if not present
  fs.mkdirSync(path.dirname(testSecretsPath), { recursive: true });

  const fakeSecrets = {
    google_api_key: 'test-google-key-123',
    tavily_api_key: 'test-tavily-key-456'
  };

  const fakeSecurity = {
    dashboard: {
      password_hash: '$2b$12$MOCKPASSHASHFORTESTINGONLY'
    }
  };

  fs.writeFileSync(testSecretsPath, JSON.stringify(fakeSecrets, null, 2));
  
  const { default: yaml } = await import('yaml');
  fs.writeFileSync(testSecurityPath, yaml.stringify(fakeSecurity));
  console.log('✅ Mock credentials and password seeded.');

  // 2. Execute Uninstall
  console.log('🏃 Executing total-recall uninstall...');
  await uninstall(['--purge']);
  console.log('✅ Uninstall completed.');

  // 3. Assert persistent backup exists and is correct
  assert.ok(fs.existsSync(backupPath), 'Backup secrets.enc was NOT created in ~/.agent/');
  const backupSecrets = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  assert.strictEqual(backupSecrets.google_api_key, 'test-google-key-123', 'Google API key not preserved');
  assert.strictEqual(backupSecrets.tavily_api_key, 'test-tavily-key-456', 'Tavily API key not preserved');
  assert.strictEqual(backupSecrets.dashboard_password_hash, '$2b$12$MOCKPASSHASHFORTESTINGONLY', 'Dashboard password hash not preserved');
  console.log('✅ Assertion passed: Credentials successfully preserved in ~/.agent/secrets.enc!');

  // 4. Execute Init
  console.log('🏃 Executing total-recall init...');
  const originalExit = process.exit;
  let exitCalled = false;
  process.exit = (code) => {
    if (code !== 0) {
      exitCalled = true;
      console.log('⚠️ Intercepted process.exit(' + code + ') from compiler');
    }
  };
  try {
    await init([]);
  } catch (err) {
    console.log('⚠️ Expected compilation error due to fake test keys, proceeding to verification:', err.message);
  } finally {
    process.exit = originalExit;
  }
  console.log('✅ Init completed.');

  // 5. Assert credentials and password hash are restored
  assert.ok(fs.existsSync(testSecretsPath), 'secrets.enc not restored to config folder');
  assert.ok(fs.existsSync(testSecurityPath), 'security.yml not restored to config folder');

  const restoredSecrets = JSON.parse(fs.readFileSync(testSecretsPath, 'utf8'));
  assert.strictEqual(restoredSecrets.google_api_key, 'test-google-key-123', 'Restored Google API key mismatch');
  assert.strictEqual(restoredSecrets.tavily_api_key, 'test-tavily-key-456', 'Restored Tavily API key mismatch');
  assert.strictEqual(restoredSecrets.dashboard_password_hash, undefined, 'dashboard_password_hash should be stripped from secrets.enc');

  const restoredSecurity = yaml.parse(fs.readFileSync(testSecurityPath, 'utf8'));
  assert.strictEqual(restoredSecurity.dashboard.password_hash, '$2b$12$MOCKPASSHASHFORTESTINGONLY', 'Restored password hash mismatch');
  console.log('✅ Assertion passed: Credentials successfully restored to VFS config!');

  // Clean up test backup file
  fs.unlinkSync(backupPath);
  console.log('🎉 Credentials preservation test fully PASSED and cleaned up successfully!');
}

run().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
