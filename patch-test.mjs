import fs from 'fs';
const file = 'src/core/layered-brain.spec.mjs';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(
  'const nodes = loadMergedNodes(globalBrain.vaultDir, null);',
  `const nodes = loadMergedNodes(globalBrain.vaultDir, null);
    console.log("globalBrain.vaultDir:", globalBrain.vaultDir);
    console.log("readdir:", fs.readdirSync(globalBrain.vaultDir, {recursive: true}));
    console.log("nodes:", nodes);`
);
fs.writeFileSync(file, content);
