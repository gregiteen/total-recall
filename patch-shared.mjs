import fs from 'fs';
let content = fs.readFileSync('src/server/routes/_shared.mjs', 'utf8');

// Replace:
// const brainId = req.query?.brain || req.body?.brainId;
// with:
// const brainId = req.query?.brain || req.body?.brainId || req.headers?.['x-total-recall-brain'];

content = content.replace(
  "const brainId = req.query?.brain || req.body?.brainId;",
  "const brainId = req.query?.brain || req.body?.brainId || req.headers?.['x-total-recall-brain'];"
);

fs.writeFileSync('src/server/routes/_shared.mjs', content);
