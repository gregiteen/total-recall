const fs = require('fs');

let content = fs.readFileSync('src/server/rest.mjs', 'utf8');

const imports = `
import vaultRouter        from './routes/vault.mjs';
import dashboardRouter    from './routes/dashboard.mjs';
import tasksRouter        from './routes/tasks.mjs';
import captureRouter      from './routes/capture.mjs';
import { collabRouter }   from './routes/collab.mjs';
import contextRouter      from './routes/context.mjs';
import dreamRouter        from './routes/dream.mjs';
import exportRouter       from './routes/export.mjs';
import fieldRouter        from './routes/field.mjs';
import filesRouter        from './routes/files.mjs';
import importRouter       from './routes/import.mjs';
import instructionsRouter from './routes/instructions.mjs';
import scriptsRouter      from './routes/scripts.mjs';
import ttsRouter          from './routes/tts.mjs';
import updateRouter       from './routes/update.mjs';
`;

const uses = `
router.use(vaultRouter);
router.use(dashboardRouter);
router.use(tasksRouter);
router.use(captureRouter);
router.use(collabRouter);
router.use(contextRouter);
router.use(dreamRouter);
router.use(exportRouter);
router.use(fieldRouter);
router.use(filesRouter);
router.use(importRouter);
router.use(instructionsRouter);
router.use(scriptsRouter);
router.use(ttsRouter);
router.use(updateRouter);
`;

content = content.replace("import graphRouter        from './routes/graph.mjs';", "import graphRouter        from './routes/graph.mjs';\n" + imports.trim());
content = content.replace("router.use(graphRouter);", "router.use(graphRouter);\n" + uses.trim());

const lines = content.split('\n');

const endpointsToRemove = [
  "router.post('/api/vault/compile',",
  "router.post('/api/vault/compact',",
  "router.get('/api/vault/hash',",
  "router.get('/api/vault/status',",
  "router.post('/api/context',",
  "router.get('/api/context/preview',",
  "router.post('/api/context/stream',",
  "router.get('/api/context/flash/health',",
  "router.post('/api/field/compile',",
  "router.post('/api/field/sample',",
  "router.get('/api/field/stats',",
  "router.post('/api/dream',",
  "router.get('/api/import/rules',",
  "router.post('/api/import/rules',",
  "router.get('/api/brain/export',",
  "router.get('/api/files',",
  'router.get("/api/scripts",',
  'router.get("/api/scripts/:name",',
  'router.put("/api/scripts/:name",',
  'router.post("/api/scripts/:name/run",',
  "router.get('/api/tasks',",
  "router.delete('/api/tasks/cleanup',",
  "router.post('/api/tasks',",
  "router.post('/api/capture/:source',",
  "router.get('/api/tts/status',",
  "router.post('/api/tts',",
  "router.get('/api/dashboard/instructions',",
  "router.get('/api/instructions',",
  "router.put('/api/instructions',",
  "router.get('/api/update/check',",
  "router.post('/api/update/run',"
];

let i = 0;
while (i < lines.length) {
  let matched = false;
  for (const ep of endpointsToRemove) {
    if (lines[i].startsWith(ep)) {
      // Find the end of this block
      let j = i;
      while (j < lines.length && lines[j] !== '});') {
        j++;
      }
      // Also remove preceding JSDoc if exists
      let start = i;
      if (start > 0 && lines[start - 1].trim() === '*/') {
        while (start > 0 && lines[start - 1].trim() !== '/**') {
          start--;
        }
        start--; // remove '/**' line
      }
      lines.splice(start, j - start + 1);
      i = start - 1;
      if (i < 0) i = 0;
      matched = true;
      break;
    }
  }
  if (!matched) i++;
}

fs.writeFileSync('src/server/rest.mjs', lines.join('\n'), 'utf8');
console.log("Cleanup complete");
