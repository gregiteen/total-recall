const fs = require('fs');
let content = fs.readFileSync('src/server/routes/brains.mjs', 'utf8');

const oldLogic = `      if (!project) {
        return res.status(404).json({ error: \`Project "\${projectName}" not found in registry\` });
      }
      vaultDir = path.join(project.brainDir, 'memory-vault');
    } else if (brainId.startsWith('tenant:')) {`;

const newLogic = `      if (!project) {
        return res.status(404).json({ error: \`Project "\${projectName}" not found in registry\` });
      }
      vaultDir = path.join(project.brainDir, 'memory-vault');
    } else if (brainId.startsWith('tenant:')) {`;

content = content.replace(oldLogic, newLogic);
// Actually, I just need to filter the output after getting nodes!
const oldGetNodes = `    if (!fs.existsSync(vaultDir)) {
      return res.status(404).json({ error: 'Vault directory not found', vaultDir });
    }

    const category = req.query.category;
    let nodes = getNodes(vaultDir, category);`;

const newGetNodes = `    if (!fs.existsSync(vaultDir)) {
      return res.status(404).json({ error: 'Vault directory not found', vaultDir });
    }

    const category = req.query.category;
    let nodes = getNodes(vaultDir, category);
    
    // Filter nodes by project if brainId specifies a project
    if (brainId.startsWith('project:')) {
      const projectName = brainId.slice('project:'.length);
      nodes = nodes.filter(n => !n.project || n.project === projectName);
    }`;

content = content.replace(oldGetNodes, newGetNodes);
fs.writeFileSync('src/server/routes/brains.mjs', content, 'utf8');
