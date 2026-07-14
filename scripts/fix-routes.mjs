import fs from 'node:fs';
import path from 'node:path';

const origPath = 'rest_orig.mjs';
const restPath = 'src/server/rest.mjs';
const ssssRouterPath = 'src/server/routes/ssss.mjs';
const memoryRouterPath = 'src/server/routes/memory.mjs';

let origContent = fs.readFileSync(origPath, 'utf8');

// 1. Extract POST /api/memory/search/semantic and append to memory.mjs
const semanticRouteRegex = /\/\*\*\n \* POST \/api\/memory\/search\/semantic[\s\S]*?\}\);\n/m;
const semanticMatch = origContent.match(semanticRouteRegex);
if (semanticMatch) {
  let memoryContent = fs.readFileSync(memoryRouterPath, 'utf8');
  if (!memoryContent.includes('semanticSearch')) {
    memoryContent = memoryContent.replace("import { getNodes, invalidate } from '../../core/vault-cache.mjs';", "import { getNodes, invalidate } from '../../core/vault-cache.mjs';\nimport { semanticSearch } from '../../core/search.mjs';");
    memoryContent = memoryContent.replace('export { router as memoryRouter };', semanticMatch[0] + '\nexport { router as memoryRouter };');
    fs.writeFileSync(memoryRouterPath, memoryContent);
    console.log('Appended semantic route to memory.mjs');
  }
}

// 2. Extract /api/ssss routes to ssss.mjs
const ssssBlockRegex = /\/\/ ─── SSSS Resources[\s\S]*?\/\/ ─── Brain Layer Management/m;
const ssssMatch = origContent.match(ssssBlockRegex);
if (ssssMatch) {
  const ssssContent = `/**
 * SSSS Routes
 * Extracted from rest.mjs
 */
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { requireAuth, requireScope } from '../auth.mjs';
import {
  ROOT,
  INSTRUCTIONS,
  ssssSkillDocPath,
  ssssReferenceDir,
  listSsssReferences,
  readTextResource,
  sendTextResource,
  absoluteUrl
} from './_shared.mjs';

const router = Router();

${ssssMatch[0].replace('// ─── Brain Layer Management', '')}
export { router as ssssRouter };
export default router;
`;
  fs.writeFileSync(ssssRouterPath, ssssContent);
  console.log('Created ssss.mjs');
}

// 3. Mount ssssRouter in rest.mjs
let restContent = fs.readFileSync(restPath, 'utf8');
if (!restContent.includes('import ssssRouter')) {
  restContent = restContent.replace("import memoryRouter from './routes/memory.mjs';", "import memoryRouter from './routes/memory.mjs';\nimport { ssssRouter } from './routes/ssss.mjs';");
  restContent = restContent.replace("router.use(updateRouter);", "router.use(updateRouter);\nrouter.use(ssssRouter);");
  fs.writeFileSync(restPath, restContent);
}

