const fs = require('fs');
let content = fs.readFileSync('src/core/surface.mjs', 'utf8');

// Revert the early filtering
const oldFilter = `  let nodes = getNodes(vaultDir);
  const projectName = inferProjectName(instructionsFile);
  if (projectName) {
    nodes = nodes.filter(n => !n.project || n.project === projectName);
  } else {
    nodes = nodes.filter(n => !n.project);
  }`;

const newFilter = `  const allNodes = getNodes(vaultDir);
  const projectName = inferProjectName(instructionsFile);
  let projectNodes = allNodes;
  if (projectName) {
    projectNodes = allNodes.filter(n => !n.project || n.project === projectName);
  } else {
    projectNodes = allNodes.filter(n => !n.project);
  }`;

content = content.replace(oldFilter, newFilter);

// Now replace all uses of `nodes` with `allNodes` EXCEPT for compilePointers
content = content.replace(/nodes\.length/g, "allNodes.length");
content = content.replace(/const graphIndex = nodes\.map/g, "const graphIndex = allNodes.map");
content = content.replace(/for \(const node of nodes\)/g, "for (const node of allNodes)");

// Then pass projectNodes to compilePointers
content = content.replace("let injectedCount = await compilePointers(instructionsFile, skillsDir, nodes, { vaultDir, derivedDir, force });", 
                          "let injectedCount = await compilePointers(instructionsFile, skillsDir, projectNodes, { vaultDir, derivedDir, force });");

fs.writeFileSync('src/core/surface.mjs', content, 'utf8');
