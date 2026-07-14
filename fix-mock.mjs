import fs from 'fs';
let content = fs.readFileSync('src/server/routes/integrations.spec.mjs', 'utf8');

// Replace the vi.mock block carefully
const oldBlock = `vi.mock('./_shared.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    BRAIN_DIR: '/mock/brain',
  };
});`;

content = content.replace(oldBlock, '');

fs.writeFileSync('src/server/routes/integrations.spec.mjs', content);
