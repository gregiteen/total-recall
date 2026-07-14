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

const endpoints = [
  "'/api/vault/compile'",
  "'/api/vault/compact'",
  "'/api/vault/hash'",
  "'/api/vault/status'",
  "'/api/context'",
  "'/api/context/preview'",
  "'/api/context/stream'",
  "'/api/context/flash/health'",
  "'/api/field/compile'",
  "'/api/field/sample'",
  "'/api/field/stats'",
  "'/api/dream'",
  "'/api/import/rules'",
  "'/api/brain/export'",
  "'/api/files'",
  "\"/api/scripts\"",
  "\"/api/scripts/:name\"",
  "\"/api/scripts/:name/run\"",
  "'/api/tasks'",
  "'/api/tasks/cleanup'",
  "'/api/capture/:source'",
  "'/api/tts/status'",
  "'/api/tts'",
  "'/api/dashboard/instructions'",
  "'/api/instructions'",
  "'/api/update/check'",
  "'/api/update/run'"
];

for (const ep of endpoints) {
  // match JSDoc optionally, then router.METHOD(ep, ... );
  // Note: we need to handle multi-line handler blocks.
  // We look for router.(get|post|put|delete|patch|use)( EP_NAME ... until the first line that matches exactly `});`
  // And optionally the JSDoc before it.
  
  const escapedEp = ep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(?:/\\*\\*[\\s\\S]*?\\*/\\s*)?router\\.[a-z]+\\(\\s*${escapedEp}[\\s\\S]*?\\n\\}\\);`, 'g');
  content = content.replace(regex, '');
}

fs.writeFileSync('src/server/rest.mjs', content, 'utf8');
console.log("Cleanup complete");
