import fs from 'fs';
let code = fs.readFileSync('src/core/layered-brain.spec.mjs', 'utf8');

code = code.replace(
  'function writeTestNode(vaultDir, slug, category, opts = {}) {',
  'async function writeTestNode(vaultDir, slug, category, opts = {}) {'
);

code = code.replace(
  '  writeNode(node, vaultDir);\n  return node;\n}',
  '  await writeNode(node, vaultDir);\n  return node;\n}'
);

// We want to replace calls like `      writeTestNode(` with `      await writeTestNode(`
// Since we know the exact prefix is spaces, we can just do:
code = code.replace(/    writeTestNode\(/g, '    await writeTestNode(');
code = code.replace(/      writeTestNode\(/g, '      await writeTestNode(');
code = code.replace(/        writeTestNode\(/g, '        await writeTestNode(');

// make `it(` blocks async
code = code.replace(
  /it\('([^']+)', \(\) => {/g,
  "it('$1', async () => {"
);

fs.writeFileSync('src/core/layered-brain.spec.mjs', code);
