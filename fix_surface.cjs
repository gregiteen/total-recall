const fs = require('fs');
let content = fs.readFileSync('src/core/surface.mjs', 'utf8');

const importBlock = "import { getNodes } from './vault-cache.mjs';\nimport { globalAgentDir } from './config.mjs';";
content = content.replace("import { getNodes } from './vault-cache.mjs';", importBlock);

const inferFunc = `
function inferProjectName(instructionsFile) {
  if (!instructionsFile) return null;
  const agentDir = path.dirname(instructionsFile);
  if (agentDir === globalAgentDir) return null;
  return path.basename(path.dirname(agentDir));
}
`;
content = content.replace("export async function compileSurface", inferFunc + "\nexport async function compileSurface");

const oldCompile = `export async function compileSurface({ vaultDir, skillsDir, derivedDir, instructionsFile, force = false }) {
  const nodes = getNodes(vaultDir);`;

const newCompile = `export async function compileSurface({ vaultDir, skillsDir, derivedDir, instructionsFile, force = false }) {
  let nodes = getNodes(vaultDir);
  const projectName = inferProjectName(instructionsFile);
  if (projectName) {
    nodes = nodes.filter(n => !n.project || n.project === projectName);
  } else {
    nodes = nodes.filter(n => !n.project);
  }`;

content = content.replace(oldCompile, newCompile);
fs.writeFileSync('src/core/surface.mjs', content, 'utf8');
