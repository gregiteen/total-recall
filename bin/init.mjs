#!/usr/bin/env node

import os from 'os';
import path from 'path';
import fs from 'fs';

const HOME = os.homedir();
const AGENT_DIR = path.join(HOME, '.agent');

const directories = [
  path.join(AGENT_DIR, 'memory-vault', 'invariants'),
  path.join(AGENT_DIR, 'memory-vault', 'patterns'),
  path.join(AGENT_DIR, 'memory-vault', 'anti-patterns'),
  path.join(AGENT_DIR, 'memory-vault', 'preferences'),
  path.join(AGENT_DIR, 'memory-vault', 'decisions'),
  path.join(AGENT_DIR, 'memory-vault', 'concepts'),
  path.join(AGENT_DIR, 'memory-derived'),
  path.join(AGENT_DIR, 'memory-inbox', 'pending'),
  path.join(AGENT_DIR, 'memory-inbox', 'conflicts'),
  path.join(AGENT_DIR, 'sessions'),
  path.join(AGENT_DIR, 'skills')
];

console.log('🚀 Initializing Total Recall SSSS Memory Vault...\n');

directories.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ Created: ${dir}`);
  } else {
    console.log(`👍 Exists:  ${dir}`);
  }
});

console.log('\n🎉 SSSS Vault initialization complete. No database required.');
