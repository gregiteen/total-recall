import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const target = args[1]; // --target <name>

function runHealthCheck() {
  const root = process.cwd();
  
  if (target === 'instructions') {
    // Dynamically check config
    let instructionsFile = 'INSTRUCTIONS.md';
    try {
      const configPath = path.join(root, 'totalrecall.config.mjs');
      if (fs.existsSync(configPath)) {
        // Read statically to avoid async issues in sync script
        const configRaw = fs.readFileSync(configPath, 'utf8');
        const match = configRaw.match(/systemPromptFile:\s*['"]([^'"]+)['"]/);
        if (match) instructionsFile = match[1];
      }
    } catch (e) {
      // fallback
    }

    const p = path.join(root, instructionsFile);
    if (!fs.existsSync(p)) {
      console.error(`❌ ${instructionsFile} not found.`);
      process.exit(1);
    }
    const stat = fs.statSync(p);
    // Rough token heuristic: 4 bytes per token, 1000 tokens = ~4000 bytes
    if (stat.size > 5000) {
      console.error(`❌ ${instructionsFile} is too large (${stat.size} bytes). Exceeds 1,000 token limit.`);
      process.exit(1);
    }
    console.log(`✅ ${instructionsFile} is healthy (${stat.size} bytes)`);
    process.exit(0);
  }
  
  if (target === 'vault') {
    const vaultDir = path.join(root, '.agent', 'memory-vault');
    if (!fs.existsSync(vaultDir)) {
      console.error('❌ Vault not found.');
      process.exit(1);
    }
    
    // Very simple check
    let fileCount = 0;
    const dirs = fs.readdirSync(vaultDir);
    for (const d of dirs) {
      const p = path.join(vaultDir, d);
      if (fs.statSync(p).isDirectory()) {
        fileCount += fs.readdirSync(p).filter(f => f.endsWith('.md')).length;
      }
    }
    console.log(`✅ Vault healthy. Found ${fileCount} active nodes.`);
    process.exit(0);
  }

  console.log('✅ Generic health check passed.');
  process.exit(0);
}

runHealthCheck();
