import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { provisionVastAI, vastAPI } from '../src/cli/deploy-ui.mjs';

const agentDir = path.join(os.homedir(), '.agent');
const configDir = path.join(agentDir, 'config');
const wizardConfigFile = path.join(configDir, 'wizard-config.json');
const brainConfigFile = path.join(configDir, 'brain.json');
const runtimeConfigFile = path.join(configDir, 'runtime.yml');

async function main() {
  console.log('🏁 Starting Total Recall Autonomous Vast.ai Redeployment...');

  if (!fs.existsSync(wizardConfigFile)) {
    console.error(`❌ Wizard config file not found at: ${wizardConfigFile}`);
    process.exit(1);
  }

  let wizardConfig = {};
  try {
    wizardConfig = JSON.parse(fs.readFileSync(wizardConfigFile, 'utf8') || '{}');
  } catch (err) {
    console.error(`❌ Error parsing wizard-config.json: ${err.message}`);
    process.exit(1);
  }

  const apiKey = wizardConfig['cfg-vastai-key'];
  const oldInstanceId = wizardConfig.vastInstanceId;
  const password = wizardConfig['cfg-dashboard-password'] || 'totalrecall';

  if (!apiKey) {
    console.error('❌ Vast.ai API Key ("cfg-vastai-key") not found in wizard-config.json');
    process.exit(1);
  }

  // 1. Destroy old instance if it exists
  if (oldInstanceId) {
    console.log(`🗑️  Destroying exited/broken remote instance (ID: ${oldInstanceId})...`);
    try {
      const destroyRes = await vastAPI(apiKey, 'DELETE', `/instances/${oldInstanceId}/`);
      console.log('✅ Destroy response:', destroyRes);
    } catch (err) {
      console.warn(`⚠️ Warning: Failed to destroy instance ${oldInstanceId}: ${err.message}`);
    }
  } else {
    console.log('ℹ️  No previous instance ID found to destroy.');
  }

  // 2. Provision and configure a fresh rentable GPU instance
  console.log('\n⚡ Provisioning a fresh rentable GPU on Vast.ai...');
  try {
    // provisionVastAI will autonomously:
    // - Search for compatible, cheap, and reliable GPUs (RTX 3090/4090/A6000 etc.)
    // - Create container
    // - Wait for boot
    // - Install stack via install.sh
    // - Retrieve TryCloudflare tunnel URL
    // - Configure security.yml password remotely
    // - Write new details back to wizard-config.json
    await provisionVastAI(apiKey, null, password);
  } catch (err) {
    console.error(`❌ Provisioning failed: ${err.message}`);
    process.exit(1);
  }

  // 3. Reload wizard-config.json to retrieve the new TryCloudflare URL and info
  let updatedWizardConfig = {};
  try {
    updatedWizardConfig = JSON.parse(fs.readFileSync(wizardConfigFile, 'utf8') || '{}');
  } catch (err) {
    console.error(`❌ Error parsing updated wizard-config.json: ${err.message}`);
    process.exit(1);
  }

  const newInstanceId = updatedWizardConfig.vastInstanceId;
  if (!newInstanceId || newInstanceId === oldInstanceId) {
    console.error('\n❌ Provisioning failed: No new instance ID was successfully created or registered in wizard-config.json.');
    console.error('   Please check your Vast.ai account balance, credit limits, or offer availability.');
    process.exit(1);
  }

  const newTunnelUrl = updatedWizardConfig['cfg-api-url'];
  const newSshHost = updatedWizardConfig.vastSshHost;
  const newSshPort = updatedWizardConfig.vastSshPort;

  if (!newTunnelUrl) {
    console.error('❌ Failed to retrieve the new Cloudflare tunnel URL from updated config.');
    process.exit(1);
  }

  console.log(`\n🎉 New instance provisioned successfully:`);
  console.log(`   - Instance ID: ${newInstanceId}`);
  console.log(`   - SSH Access:  ssh -p ${newSshPort} root@${newSshHost}`);
  console.log(`   - Tunnel URL:  ${newTunnelUrl}\n`);

  // 4. Update brain.json with new tunnel url
  if (fs.existsSync(brainConfigFile)) {
    console.log(`📝 Updating brain.json with new remote URL: ${newTunnelUrl}...`);
    try {
      const brainConfig = JSON.parse(fs.readFileSync(brainConfigFile, 'utf8') || '{}');
      brainConfig.url = newTunnelUrl;
      fs.writeFileSync(brainConfigFile, JSON.stringify(brainConfig, null, 2), 'utf8');
      console.log('✅ brain.json updated successfully.');
    } catch (err) {
      console.error(`⚠️ Warning: Failed to update brain.json: ${err.message}`);
    }
  } else {
    console.warn(`⚠️ Warning: brain.json not found at: ${brainConfigFile}`);
  }

  // 5. Update runtime.yml completions endpoint
  if (fs.existsSync(runtimeConfigFile)) {
    console.log(`📝 Updating runtime.yml completions endpoint...`);
    try {
      let content = fs.readFileSync(runtimeConfigFile, 'utf8');
      const completionsUrl = `${newTunnelUrl}/v1/chat/completions`;
      content = content.replace(/^endpoint:.*$/m, `endpoint: ${completionsUrl}`);
      fs.writeFileSync(runtimeConfigFile, content, 'utf8');
      console.log('✅ runtime.yml updated successfully.');
    } catch (err) {
      console.error(`⚠️ Warning: Failed to update runtime.yml: ${err.message}`);
    }
  } else {
    console.warn(`⚠️ Warning: runtime.yml not found at: ${runtimeConfigFile}`);
  }

  console.log('\n🚀 Autonomous Redeployment Completed Successfully!');
}

main().catch(err => {
  console.error('❌ Script crashed:', err);
  process.exit(1);
});
