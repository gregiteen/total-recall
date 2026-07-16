import { throttledFetch, blockDomain, loadFirewallPolicy } from './src/core/throttled-fetch.mjs';
import { brainDir } from './src/core/config.mjs';
import fs from 'node:fs';
import path from 'node:path';

async function test() {
  console.log("Blocking example.com...");
  await blockDomain('example.com');
  
  await new Promise(r => setTimeout(r, 1000));
  
  const policyPath = path.join(brainDir, 'memory-vault/system/network-policy.md');
  console.log("File content after blockDomain:\n", fs.readFileSync(policyPath, 'utf8'));
  
  // Force reload
  await loadFirewallPolicy(brainDir);
  
  try {
    console.log("Fetching example.com...");
    await throttledFetch('https://example.com');
    console.error("FAIL: Did not throw");
  } catch (err) {
    console.log("SUCCESS: Caught expected error:", err.message);
  }
  process.exit(0);
}
test();
