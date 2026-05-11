import fs from 'fs';
import path from 'path';

/**
 * sync-ide-prompts.mjs
 * 
 * Synchronizes the compiled Total Recall instructions to all known IDE prompt files.
 * This guarantees that whether a user opens the project in Cursor, Claude Code, or
 * Cline, the AI will share the exact same memory context.
 */

const IDE_FILES = [
  '.cursorrules',
  'CLAUDE.md',
  '.clinerules',
  '.windsurfrules',
  'AGENTS.md'
];

async function syncPrompts() {
  const root = process.cwd();
  
  // 1. Locate the source of truth (the file Total Recall actually compiles to)
  let sourceFile = 'INSTRUCTIONS.md';
  try {
    const configRaw = fs.readFileSync(path.join(root, 'totalrecall.config.mjs'), 'utf8');
    const match = configRaw.match(/systemPromptFile:\s*['"]([^'"]+)['"]/);
    if (match) sourceFile = match[1];
  } catch (e) {
    // defaults to INSTRUCTIONS.md
  }

  const sourcePath = path.join(root, sourceFile);
  if (!fs.existsSync(sourcePath)) {
    console.error(`❌ Source instructions file not found at: ${sourcePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(sourcePath, 'utf8');
  let syncedCount = 0;

  // 2. Mirror it to all other configured IDE files if they exist in the repo
  // We only sync to files that ALREADY exist to avoid cluttering the repo
  for (const file of IDE_FILES) {
    if (file === sourceFile) continue;
    
    const targetPath = path.join(root, file);
    if (fs.existsSync(targetPath)) {
      fs.writeFileSync(targetPath, content);
      console.log(`✅ Synced memory to ${file}`);
      syncedCount++;
    }
  }

  console.log(`\n🧠 Total Recall Sync Complete: ${syncedCount} IDE files updated.`);
}

syncPrompts();
