const fs = require('fs');
let content = fs.readFileSync('src/cli/forget.mjs', 'utf8');

const newHelp = `  Options:
    --global              Delete from the global brain
    --project             Delete from the project brain
    --project-all <name>  Soft-delete all nodes for an abandoned project by moving them to .trash
    --no-compile          Skip auto-recompilation after deletion
    --help, -h            Show this help`;

content = content.replace(/Options:[\s\S]+?--help, -h            Show this help/, newHelp);

const scriptAdd = `
export default async function forget(args) {
  const { layer: explicitLayer, remainingArgs } = parseLayerFlag(args);

  // Check for --project-all
  const projectAllIdx = remainingArgs.indexOf('--project-all');
  if (projectAllIdx !== -1 && remainingArgs[projectAllIdx + 1]) {
    const projectName = remainingArgs[projectAllIdx + 1];
    const { getGlobalBrainDir } = await import('./agent-dir.mjs');
    const { getNodes } = await import('../core/vault-cache.mjs');
    const globalVaultDir = path.join(getGlobalBrainDir(), 'memory-vault');
    
    if (!fs.existsSync(globalVaultDir)) {
      console.error('  ❌ Global vault not found.');
      return;
    }
    
    const nodes = getNodes(globalVaultDir).filter(n => n.project === projectName);
    if (nodes.length === 0) {
      console.error(\`  ❌ No memory nodes found for project "\${projectName}".\`);
      return;
    }
    
    const trashDir = path.join(globalVaultDir, '.trash', projectName);
    fs.mkdirSync(trashDir, { recursive: true });
    
    let count = 0;
    // We need to move the actual file. We have node.slug and node.category.
    for (const n of nodes) {
      const sourcePath = path.join(globalVaultDir, n.category, \`\${n.slug}.md\`);
      if (fs.existsSync(sourcePath)) {
        const destPath = path.join(trashDir, \`\${n.slug}.md\`);
        fs.renameSync(sourcePath, destPath);
        count++;
      }
    }
    
    console.log(\`  ✅ Soft-deleted \${count} nodes for project "\${projectName}" (moved to .trash/)\`);
    
    if (!remainingArgs.includes('--no-compile')) {
      console.log('  ⏳ Recompiling active memory surfaces and indexes in the background...');
      try {
        const { spawn } = await import('node:child_process');
        const child = spawn(process.argv[0], [process.argv[1], 'compile'], {
          detached: true,
          stdio: 'ignore'
        });
        child.unref();
        console.log('  ✅ Background compilation started.');
      } catch (err) {}
    }
    return;
  }
`;

content = content.replace("export default async function forget(args) {", scriptAdd.trim());
fs.writeFileSync('src/cli/forget.mjs', content, 'utf8');
