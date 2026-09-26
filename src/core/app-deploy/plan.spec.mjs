import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createDeploymentPlan,
  computeFileDiffs,
  generateSsssEnvelopes,
  computeDeterministicHash
} from './plan.mjs';

describe('Capability Deployment Planner (app-deploy/plan.mjs)', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-plan-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpRoot)) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  function createCapabilityPlugin(dir) {
    fs.mkdirSync(dir, { recursive: true });
    const manifest = {
      $schema: 'https://github.com/total-recall/total-recall/blob/main/metadata.plugin.schema.json',
      id: 'chat-feature',
      name: 'Chat Feature',
      version: '1.0.0',
      description: 'Chat capability for host apps',
      deploy: {
        targets: ['ssss-app', 'nextjs'],
        required_ssss_version: '>=0.9.3',
        access_grants: ['ssss:vault:read', 'ssss:events:append'],
        resources: { db: 'sqlite' }
      },
      skills: [{ id: 'chat-feature', path: './skills/chat/SKILL.md' }],
      cli: { command: 'chat', handler: './cli.mjs' },
      ssss_schemas: {
        categories: [{ name: 'chat-sessions', description: 'Chat threads' }]
      }
    };
    fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify(manifest, null, 2), 'utf8');
    fs.mkdirSync(path.join(dir, 'skills', 'chat'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'skills', 'chat', 'SKILL.md'), '# Chat Skill\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'cli.mjs'), 'export default function(){}\n', 'utf8');
    return manifest;
  }

  describe('Deterministic Plan Hash', () => {
    it('generates identical plan_hash for identical inputs', async () => {
      const srcDir = path.join(tmpRoot, 'cap-src');
      createCapabilityPlugin(srcDir);
      const appDir = path.join(tmpRoot, 'target-app');
      fs.mkdirSync(appDir, { recursive: true });

      const plan1 = await createDeploymentPlan(srcDir, { target: appDir, adapter: 'nextjs' });
      const plan2 = await createDeploymentPlan(srcDir, { target: appDir, adapter: 'nextjs' });

      try {
        expect(plan1.plan_hash).toBeDefined();
        expect(plan1.plan_hash).toMatch(/^[a-f0-9]{64}$/);
        expect(plan1.plan_hash).toBe(plan2.plan_hash);
        expect(plan1.valid).toBe(true);
      } finally {
        plan1.cleanup();
        plan2.cleanup();
      }
    });
  });

  describe('File Diffing & Conflict Detection', () => {
    it('detects create action for new files', async () => {
      const srcDir = path.join(tmpRoot, 'cap-src');
      createCapabilityPlugin(srcDir);
      const appDir = path.join(tmpRoot, 'target-app');
      fs.mkdirSync(appDir, { recursive: true });

      const plan = await createDeploymentPlan(srcDir, { target: appDir, adapter: 'nextjs' });
      try {
        expect(plan.file_operations.some((op) => op.action === 'create' && op.path.includes('SKILL.md'))).toBe(true);
        expect(plan.file_operations.some((op) => op.action === 'create' && op.path === 'cli.mjs')).toBe(true);
      } finally {
        plan.cleanup();
      }
    });

    it('detects identical action when file exists with matching hash', async () => {
      const srcDir = path.join(tmpRoot, 'cap-src');
      createCapabilityPlugin(srcDir);
      const appDir = path.join(tmpRoot, 'target-app');
      fs.mkdirSync(appDir, { recursive: true });
      fs.writeFileSync(path.join(appDir, 'cli.mjs'), 'export default function(){}\n', 'utf8');

      const plan = await createDeploymentPlan(srcDir, { target: appDir, adapter: 'nextjs' });
      try {
        const cliOp = plan.file_operations.find((op) => op.path === 'cli.mjs');
        expect(cliOp.action).toBe('identical');
      } finally {
        plan.cleanup();
      }
    });

    it('flags protected files as conflicts', async () => {
      const srcDir = path.join(tmpRoot, 'cap-src');
      createCapabilityPlugin(srcDir);
      // Add package.json to capability
      fs.writeFileSync(path.join(srcDir, 'package.json'), JSON.stringify({ name: 'conflict-pkg' }), 'utf8');

      const appDir = path.join(tmpRoot, 'target-app');
      fs.mkdirSync(appDir, { recursive: true });
      fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ name: 'original-app' }), 'utf8');

      const plan = await createDeploymentPlan(srcDir, { target: appDir, adapter: 'nextjs' });
      try {
        const pkgOp = plan.file_operations.find((op) => op.path === 'package.json');
        expect(pkgOp.action).toBe('conflict');
        expect(plan.valid).toBe(false);
        expect(plan.conflicts.length).toBeGreaterThan(0);
      } finally {
        plan.cleanup();
      }
    });
  });

  describe('SSSS Dry-Run Envelopes', () => {
    it('generates install_started, categories_registered, and installed event envelopes', async () => {
      const srcDir = path.join(tmpRoot, 'cap-src');
      createCapabilityPlugin(srcDir);
      const appDir = path.join(tmpRoot, 'target-app');
      fs.mkdirSync(appDir, { recursive: true });

      const plan = await createDeploymentPlan(srcDir, { target: appDir, adapter: 'nextjs' });
      try {
        const actions = plan.ssss_envelopes.map((e) => e.action);
        expect(actions).toContain('install_started');
        expect(actions).toContain('categories_registered');
        expect(actions).toContain('installed');
        expect(plan.access_grants).toContain('ssss:vault:read');
        expect(plan.access_grants).toContain('ssss:events:append');
        expect(plan.resources).toEqual({ db: 'sqlite' });
      } finally {
        plan.cleanup();
      }
    });
  });
});
