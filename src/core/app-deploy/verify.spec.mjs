import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { applyDeploymentPlan, resolveAppVaultDir } from './apply.mjs';
import { createDeploymentPlan } from './plan.mjs';
import { verifyApplication } from './verify.mjs';

describe('Capability Deployment Verifier (app-deploy/verify.mjs)', () => {
  let tmpTarget;
  let tmpPluginDir;

  beforeEach(async () => {
    tmpTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-verify-target-'));
    tmpPluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-verify-plugin-'));

    fs.writeFileSync(
      path.join(tmpPluginDir, 'plugin.json'),
      JSON.stringify({
        id: 'audited-tool',
        name: 'Audited Tool',
        version: '1.0.0',
        description: 'Audited capability for verifier test',
        deploy: {
          targets: ['ssss-app'],
          access_grants: ['vault:read']
        }
      })
    );
    fs.writeFileSync(path.join(tmpPluginDir, 'tool.mjs'), 'export const active = true;\n');

    const plan = await createDeploymentPlan(tmpPluginDir, { target: tmpTarget });
    await applyDeploymentPlan(plan, { target: tmpTarget });
  });

  afterEach(() => {
    if (fs.existsSync(tmpTarget)) fs.rmSync(tmpTarget, { recursive: true, force: true });
    if (fs.existsSync(tmpPluginDir)) fs.rmSync(tmpPluginDir, { recursive: true, force: true });
  });

  it('verifies a cleanly deployed application with no drift', async () => {
    const report = await verifyApplication(tmpTarget);
    expect(report.valid).toBe(true);
    expect(report.capabilities.length).toBe(1);
    expect(report.capabilities[0].id).toBe('audited-tool');
    expect(report.capabilities[0].status).toBe('installed');
    expect(report.capabilities[0].drift.length).toBe(0);
    expect(report.grants.length).toBe(1);
    expect(report.events_count).toBeGreaterThan(0);
    expect(report.errors.length).toBe(0);
  });

  it('detects file content drift when an installed file is modified', async () => {
    // Modify installed file
    fs.writeFileSync(path.join(tmpTarget, 'tool.mjs'), 'CORRUPTED TAMPERED CONTENT');

    const report = await verifyApplication(tmpTarget);
    expect(report.valid).toBe(false);
    expect(report.capabilities[0].drift.length).toBe(1);
    expect(report.capabilities[0].drift[0].path).toBe('tool.mjs');
    expect(report.capabilities[0].drift[0].actual_sha).toBeDefined();
    expect(report.errors[0]).toContain('drifted/missing file');
  });

  it('detects missing files when an installed file is deleted', async () => {
    fs.rmSync(path.join(tmpTarget, 'tool.mjs'));

    const report = await verifyApplication(tmpTarget);
    expect(report.valid).toBe(false);
    expect(report.capabilities[0].drift[0].missing).toBe(true);
  });

  it('fails if target directory does not exist', async () => {
    await expect(
      verifyApplication('/path/does/not/exist/nowhere')
    ).rejects.toThrow('Target application directory does not exist');
  });
});
