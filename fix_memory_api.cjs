const fs = require('fs');
let content = fs.readFileSync('src/server/routes/memory.mjs', 'utf8');

// 1. Add 'project' to PASSTHROUGH_FIELDS
content = content.replace("'contradicts',", "'contradicts',\n  'project',");

// 2. In POST /api/memory, extract project from brain parameter if present
const postOld = `    const node = createMemoryNode({ slug, title, category, content: actualContent });
    if (tags && Array.isArray(tags)) node.tags = tags;

    for (const key of PASSTHROUGH_FIELDS) {
      if (req.body[key] !== undefined) node[key] = req.body[key];
    }`;

const postNew = `    const node = createMemoryNode({ slug, title, category, content: actualContent });
    if (tags && Array.isArray(tags)) node.tags = tags;

    for (const key of PASSTHROUGH_FIELDS) {
      if (req.body[key] !== undefined) node[key] = req.body[key];
    }
    
    // Auto-tag project if brainId is a project
    const rawBrainId = req.query?.brain || req.body?.brainId || req.headers?.['x-total-recall-brain'];
    if (rawBrainId && rawBrainId.startsWith('project:')) {
      node.project = rawBrainId.slice('project:'.length);
    }`;

content = content.replace(postOld, postNew);

// 3. Do the same for PATCH /api/memory/:slug
const patchOld = `    for (const key of PASSTHROUGH_FIELDS) {
      if (req.body[key] !== undefined) node[key] = req.body[key];
    }`;

const patchNew = `    for (const key of PASSTHROUGH_FIELDS) {
      if (req.body[key] !== undefined) node[key] = req.body[key];
    }
    
    const rawBrainId = req.query?.brain || req.body?.brainId || req.headers?.['x-total-recall-brain'];
    if (rawBrainId && rawBrainId.startsWith('project:')) {
      node.project = rawBrainId.slice('project:'.length);
    }`;

content = content.replace(patchOld, patchNew);

fs.writeFileSync('src/server/routes/memory.mjs', content, 'utf8');
