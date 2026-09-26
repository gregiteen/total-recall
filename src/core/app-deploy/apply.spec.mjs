import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  applyDeploymentPlan,
  AppApplyPreflightError,
  AppApplyError,
  resolveAppVaultDir
} from './apply.mjs';
import { createDeploymentPlan } from './plan.mjs';

describe('Capability Deployment Applier (app-deploy/apply.mjs)', () => {
  let tmpTarget;
  let tmpPluginDir;

  beforeEach(() => {
    tmpTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-apply-target-'));
    tmpPluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-apply-plugin-'));

    // Create a valid capability plugin
    fs.writeFileSync(
      path.join(tmpPluginDir, 'plugin.json'),
      JSON.stringify({
        id: 'test-cap',
        name: 'Test Capability',
        version: '1.0.0',
        description: 'Test capability for apply spec',
        deploy: {
          targets: ['ssss-app'],
          grants: ['vault:read', 'sqlite:read'],
          resources: {
            database: 'sqlite://./data/app.db'
          }
        }
      })
    );

    fs.writeFileSync(
      path.join(tmpPluginDir, 'sample-tool.mjs'),
      'export function run() { return "hello from capability"; }\n'
    );
  });

  afterEach(() => {
    if (fs.existsSync(tmpTarget)) {
      fs.rmSync(tmpTarget, { recursive: true, force: true });
    }
    if (fs.existsSync(tmpPluginDir)) {
      fs.rmSync(tmpPluginDir, { recursive: true, force: true });
    }
  });

  it('rejects deployment of an invalid plan with conflicts', async () => {
    const invalidPlan = {
      plan_version: '1.0.0',
      valid: false,
      conflicts: [{ path: 'README.md', action: 'conflict' }],
      file_operations: []
    };

    await expect(applyDeploymentPlan(invalidPlan, { target: tmpTarget })).rejects.toThrow(
      AppApplyPreflightError
    );
  });

  it('performs dry-run without writing files or mutating target directory', async () => {
    const plan = await createDeploymentPlan(tmpPluginDir, { target: tmpTarget });
    const result = await applyDeploymentPlan(plan, { target: tmpTarget, dryRun: true });

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.plan_hash).toBe(plan.plan_hash);

    // Target directory must remain empty
    const filesInTarget = fs.readdirSync(tmpTarget);
    expect(filesInTarget.length).toBe(0);
  });

  it('applies files atomically and persists SSSS installation and grant records', async () => {
    const plan = await createDeploymentPlan(tmpPluginDir, { target: tmpTarget });
    const result = await applyDeploymentPlan(plan, { target: tmpTarget });

    expect(result.success).toBe(true);
    expect(result.applied_files).toBeGreaterThan(0);
    expect(result.capabilities).toContain('test-cap');

    // 1. Capability files exist in target app
    const deployedFile = path.join(tmpTarget, 'sample-tool.mjs');
    expect(fs.existsSync(deployedFile)).toBe(true);
    expect(fs.readFileSync(deployedFile, 'utf8')).toContain('hello from capability');

    // 2. SSSS app_capability_installation record exists in target vault
    const vaultDir = resolveAppVaultDir(tmpTarget);
    const capRecordFile = path.join(vaultDir, 'system', 'capabilities', 'test-cap.md');
    expect(fs.existsSync(capRecordFile)).toBe(true);
    const capRecordContent = fs.readFileSync(capRecordFile, 'utf8');
    expect(capRecordContent).toContain('type: "app_capability_installation"');
    expect(capRecordContent).toContain('status: "installed"');
    expect(capRecordContent).toContain('capability_id: "test-cap"');

    // 3. SSSS access_grant record exists
    const grantFile = path.join(vaultDir, 'system', 'grants', 'test-cap.md');
    expect(fs.existsSync(grantFile)).toBe(true);
    const grantContent = fs.readFileSync(grantFile, 'utf8');
    expect(grantContent).toContain('type: "access_grant"');
    expect(grantContent).toContain('vault:read');

    // 4. SSSS events log exists
    const eventsFile = path.join(vaultDir, 'system', 'events', 'capability-events.jsonl');
    expect(fs.existsSync(eventsFile)).toBe(true);
    const eventsLines = fs.readFileSync(eventsFile, 'utf8').trim().split('\n');
    expect(eventsLines.length).toBeGreaterThan(0);
    const firstEvent = JSON.parse(eventsLines[0]);
    expect(firstEvent.domain).toBe('ssss.capability');
  });

  it('handles idempotent re-apply cleanly without redundant writes', async () => {
    const plan = await createDeploymentPlan(tmpPluginDir, { target: tmpTarget });

    // First apply
    const res1 = await applyDeploymentPlan(plan, { target: tmpTarget });
    expect(res1.success).toBe(true);
    expect(res1.already_applied).toBeUndefined();

    // Second apply with identical source and target
    const plan2 = await createDeploymentPlan(tmpPluginDir, { target: tmpTarget });
    const res2 = await applyDeploymentPlan(plan2, { target: tmpTarget });
    expect(res2.success).toBe(true);
    expect(res2.already_applied).toBe(true);
    expect(res2.applied_files).toBe(0);
  });

  it('rolls back on failure, restores modified files, and records failure status truthfully', async () => {
    // Put existing file in target to test restoration
    const existingFile = path.join(tmpTarget, 'sample-tool.mjs');
    fs.writeFileSync(existingFile, 'ORIGINAL USER CONTENT DO NOT OVERWRITE');

    // Put tenant private data in target to verify preservation
    const tenantDataFile = path.join(tmpTarget, 'vault', 'user-notes.md');
    fs.mkdirSync(path.dirname(tenantDataFile), { recursive: true });
    fs.writeFileSync(tenantDataFile, 'TENANT PRIVATE CONFIDENTIAL NOTE');

    const plan = await createDeploymentPlan(tmpPluginDir, { target: tmpTarget });

    // Force a failure by corrupting the plan's staged sources
    plan._stagedSources['test-cap'] = '/non/existent/corrupted/dir';

    await expect(applyDeploymentPlan(plan, { target: tmpTarget })).rejects.toThrow(
      AppApplyError
    );

    // 1. Original file was preserved/restored
    expect(fs.existsSync(existingFile)).toBe(true);
    expect(fs.readFileSync(existingFile, 'utf8')).toBe('ORIGINAL USER CONTENT DO NOT OVERWRITE');

    // 2. Tenant private data was untouched
    expect(fs.existsSync(tenantDataFile)).toBe(true);
    expect(fs.readFileSync(tenantDataFile, 'utf8')).toBe('TENANT PRIVATE CONFIDENTIAL NOTE');

    // 3. Truthful failure status recorded
    const vaultDir = resolveAppVaultDir(tmpTarget);
    const failedRecord = path.join(vaultDir, 'system', 'capabilities', 'test-cap.md');
    expect(fs.existsSync(failedRecord)).toBe(true);
    const failedContent = fs.readFileSync(failedRecord, 'utf8');
    expect(failedContent).toContain('status: "failed"');
    expect(failedContent).toContain('Error:');
  });
});
