import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const docsDir = path.join(rootDir, 'docs');

// The Diátaxis 4-Plane Architecture + Kanban Projects
const planes = [
  'tutorials',
  'how-to',
  'reference',
  'developer',
  'projects/planned',
  'projects/in-progress',
  'projects/archived',
  'business'
];

// Initialize directories
console.log('🏗️ Initializing Diátaxis & Kanban Projects architecture...');
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir);
}

planes.forEach(plane => {
  const dir = path.join(docsDir, plane);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`  Created: docs/${plane}/`);
  }
});

// Files that must legally remain in root
const rootWhitelist = [
  'README.md',
  'INSTRUCTIONS.md',
  'AGENTS.md',
  'AGENT.md',
  'CLAUDE.md',
  'GEMINI.md',
  'COPILOT_INSTRUCTIONS.md',
  '.claude.md',
  'HANDOFF.md'
];

console.log('\n🧹 Sweeping root directory for stray markdown files...');
const rootFiles = fs.readdirSync(rootDir);
const movedFiles = [];

// Helper to determine project folder name
const getProjectFolderName = (filename) => {
  if (filename.includes('MEDIA_SUITE')) return 'media-suite';
  if (filename.includes('SKILL_USAGE')) return 'skill-usage';
  if (filename.includes('EXPO_MOBILE')) return 'expo-mobile';
  return null;
};

rootFiles.forEach(file => {
  if (file.endsWith('.md') && !rootWhitelist.includes(file)) {
    const oldPath = path.join(rootDir, file);
    let targetDir = path.join(docsDir, 'developer'); // Default

    // Project files categorization
    const projectName = getProjectFolderName(file);
    if (projectName || file.includes('TRACKER') || file.includes('PLAN')) {
      const projName = projectName || 'misc-project';
      targetDir = path.join(docsDir, 'projects', 'in-progress', projName);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    } else if (file.includes('ARCHITECTURE') || file.includes('PRD')) {
      targetDir = path.join(docsDir, 'developer');
    } else if (file.includes('SETUP') || file.includes('QUICKSTART') || file.includes('FIX')) {
      targetDir = path.join(docsDir, 'how-to');
    } else if (file.includes('INVENTORY')) {
      targetDir = path.join(docsDir, 'reference');
    }

    const newPath = path.join(targetDir, file);
    fs.renameSync(oldPath, newPath);
    movedFiles.push({ file, targetDir: targetDir.replace(rootDir, '') });
  }
});

// Also migrate old project-management files to the new kanban structure
const legacyPmDir = path.join(docsDir, 'project-management');
if (fs.existsSync(legacyPmDir)) {
  console.log('\n📦 Migrating legacy project-management files to Kanban architecture...');
  const legacyFiles = fs.readdirSync(legacyPmDir);
  legacyFiles.forEach(file => {
    const oldPath = path.join(legacyPmDir, file);
    if (fs.statSync(oldPath).isFile()) {
      const projectName = getProjectFolderName(file) || 'misc-project';
      const targetDir = path.join(docsDir, 'projects', 'in-progress', projectName);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      fs.renameSync(oldPath, path.join(targetDir, file));
      movedFiles.push({ file, targetDir: targetDir.replace(rootDir, '') });
    }
  });
  // Clean up empty directory
  try { fs.rmdirSync(legacyPmDir); } catch(e) {}
}

if (movedFiles.length > 0) {
  console.log(`\n✅ Successfully audited ${movedFiles.length} files:`);
  movedFiles.forEach(({ file, targetDir }) => {
    console.log(`  - ${file} -> ${targetDir}`);
  });
} else {
  console.log('\n✨ Root directory is already clean. No stray markdown files found.');
}

console.log('\n📚 Documentation Audit Complete.');
