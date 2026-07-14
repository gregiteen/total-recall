const fs = require('fs');
const path = require('path');

const files = [
  'daemon-control.mjs',
  'daemon-loop.mjs',
  'task-executors.mjs',
  'vault.mjs',
  'vault-watcher.mjs',
  'vector-store.mjs',
  'ssss-host-extension.mjs',
  'webauthn-store.mjs',
  'emergency-alerts.mjs',
  'provider-catalog.mjs'
];

for (const file of files) {
  const specName = file.replace('.mjs', '.spec.mjs');
  const specPath = path.join('./src/core', specName);
  
  const content = `import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as moduleToTest from './${file}';
import fs from 'fs/promises';

vi.mock('fs/promises');

// Mock Network
global.fetch = vi.fn();

// Mock LLM or related services if imported
vi.mock('./llm-provider.mjs', () => ({
  default: { generate: vi.fn() }
}));

describe('${file.replace('.mjs', '')}', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should be defined', () => {
    expect(moduleToTest).toBeDefined();
  });

  // TODO: Add more specific tests for ${file}
});
`;

  fs.writeFileSync(specPath, content);
  console.log('Generated', specPath);
}
