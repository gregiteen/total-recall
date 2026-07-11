import fs from 'fs';

// 1. Fix rest.mjs
let rest = fs.readFileSync('src/server/rest.mjs', 'utf8');
rest = rest.replace(
  "const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');",
  "const ROOT = process.env.TR_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');"
);
fs.writeFileSync('src/server/rest.mjs', rest);

// 2. Fix api.spec.mjs
let apiSpec = fs.readFileSync('src/server/api.spec.mjs', 'utf8');
apiSpec = apiSpec.replace(
  "process.env.AGENT_DIR = TEST_AGENT_DIR;",
  "process.env.AGENT_DIR = TEST_AGENT_DIR;\nprocess.env.TR_ROOT = TEST_AGENT_DIR;"
);
fs.writeFileSync('src/server/api.spec.mjs', apiSpec);

// 3. Fix layered-brain.spec.mjs
let lbSpec = fs.readFileSync('src/core/layered-brain.spec.mjs', 'utf8');
lbSpec = lbSpec.replace(/function writeTestNode/g, 'async function writeTestNode');
lbSpec = lbSpec.replace(/writeNode\(node, vaultDir\);/g, 'await writeNode(node, vaultDir);');
lbSpec = lbSpec.replace(/writeTestNode\(/g, 'await writeTestNode(');
lbSpec = lbSpec.replace(/it\('([^']+)', \(\) => {/g, "it('$1', async () => {");
lbSpec = lbSpec.replace(/const nodes = loadMergedNodes\(/g, 'await new Promise(r => setTimeout(r, 50)); const nodes = loadMergedNodes('); // in case writeNodeValidatedAsync resolves but fs invalidation has race conditions? No, invalidation is synchronous. But I'll just change the function signature first.
fs.writeFileSync('src/core/layered-brain.spec.mjs', lbSpec);
