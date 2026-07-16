import { processViaPackageKernel } from './src/core/ssss-kernel-bridge.mjs';
import { brainDir } from './src/core/config.mjs';
import path from 'path';
import crypto from 'crypto';
import yaml from 'yaml';

const vaultRoot = path.join(brainDir, 'memory-vault');

const frontmatter = {
  type: 'network_policy',
  title: 'Global Network Policy',
  status: 'active',
  blocked_domains: [],
  allowed_domains: [],
  domain_limits: {}
};

const content = `---\n${yaml.stringify(frontmatter)}---\n# Network Policy\n`;

const envelope = {
  type: 'operation',
  idempotency_key: crypto.randomUUID(),
  path: 'system/network-policy.md',
  workspace_id: 'default',
  content,
  actor: { role: 'system' }
};

async function run() {
  const result = await processViaPackageKernel(envelope, vaultRoot, { agentRole: 'system' });
  console.log(JSON.stringify(result, null, 2));
}
run();
