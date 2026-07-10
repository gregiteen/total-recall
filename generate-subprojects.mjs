import fs from 'fs';
import path from 'path';

const sections = [
  'CHAT', 'MEMORY', 'VAULT_DOCS', 'INBOX', 'TASKS', 'AUTOMATIONS', 'FILES',
  'SANDBOX', 'MODELS_AGENTS', 'HEALTH', 'USAGE_COSTS', 'SETTINGS', 'API_KEYS',
  'INTEGRATIONS', 'SKILLS_MANAGER', 'COLLABORATION', 'INSTRUCTIONS',
  'DESIGN_DOCS', 'OKF_MANAGER', 'OPENWIKI', 'DOCUMENTATION', 'SOVEREIGN_GRAPH'
];

const baseDir = '/Users/greg/Github/total-recall/docs/projects/in-progress/ecosystem-sync-and-scale';

for (const section of sections) {
  const sectionDir = path.join(baseDir, section.toLowerCase().replace(/_/g, '-'));
  fs.mkdirSync(sectionDir, { recursive: true });
  
  const content = `# ECOSYSTEM SYNC AND SCALE: ${section} PROJECT TRACKER

## Goal
Audit, stabilize, and standardize the ${section} module for autonomous ecosystem sync.

## ⏳ Phase 1: Deep Audit & Data Organization
- [ ] Audit UI components for rendering bugs and empty state crashes.
- [ ] Verify API endpoints are correctly using \`ROOT\` / \`BRAIN_DIR\` instead of \`process.cwd()\`.
- [ ] Map data resolution (Global vs. Project scoped data).

## ⏳ Phase 2: Implementation & Sync Hookup
- [ ] Connect section data to autonomous CRON system.
- [ ] Ensure any memory nodes generated here are fully SSSS / OKF compliant.
- [ ] Hook up GitHub / Obsidian sync pathways if applicable.

## ⏳ Phase 3: Testing & Verification
- [ ] Write integration test.
- [ ] Verify functionality under Clean-Account Initialization.
`;

  fs.writeFileSync(path.join(sectionDir, `ECOSYSTEM_SYNC_AND_SCALE_${section}_PROJECT_TRACKER.md`), content);
}

console.log('Created sub-projects for all 22 sections.');
