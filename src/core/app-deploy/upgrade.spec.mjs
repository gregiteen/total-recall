import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { applyDeploymentPlan, resolveAppVaultDir } from './apply.mjs';
import { createDeploymentPlan } from './plan.mjs';
import { upgradeCapability, AppUpgradeError, getInstalledCapabilityRecord } from './upgrade.mjs';

describe('Capability Deployment Upgrader (app-deploy/upgrade.mjs)', () => {
  let tmpTarget;
  let v1Dir;
  let v2Dir;

  beforeEach(async () => {
    tmpTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-upg-target-'));
    v1Dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-upg-v1-'));
    v2Dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-upg-v2-'));

    // Version 1 of capability
    fs.writeFileSync(
      path.join(v1Dir, 'plugin.json'),
      JSON.stringify({
        id: 'crm-bridge',
        name: 'CRM Bridge',
        version: '1.0.0',
        description: 'CRM bridge capability v1',
        deploy: {
          targets: ['ssss-app']
        }
      })
    );
    fs.writeFileSync(path.join(v1Dir, 'bridge.mjs'), 'export const version = "1.0.0";\n');
    fs.writeFileSync(path.join(v1Dir, 'legacy-helper.mjs'), 'export const obsolete = true;\n');

    // Version 2 of capability (updates bridge.mjs, removes legacy-helper.mjs, adds new-feature.mjs)
    fs.writeFileSync(
      path.join(v2Dir, 'plugin.json'),
      JSON.stringify({
        id: 'crm-bridge',
        name: 'CRM Bridge',
        version: '2.0.0',
        description: 'CRM bridge capability v2',
        deploy: {
          targets: ['ssss-app']
        }
      })
    );
    fs.writeFileSync(path.join(v2Dir, 'bridge.mjs'), 'export const version = "2.0.0";\n');
    fs.writeFileSync(path.join(v2Dir, 'new-feature.mjs'), 'export const feature = "v2-hotness";\n');

    // Install version 1 into target app
    const planV1 = await createDeploymentPlan(v1Dir, { target: tmpTarget });
    await applyDeploymentPlan(planV1, { target: tmpTarget });
  });

  afterEach(() => {
    if (fs.existsSync(tmpTarget)) fs.rmSync(tmpTarget, { recursive: true, force: true });
    if (fs.existsSync(v1Dir)) fs.rmSync(v1Dir, { recursive: true, force: true });
    if (fs.existsSync(v2Dir)) fs.rmSync(v2Dir, { recursive: true, force: true });
  });

  it('fails if target capability is not installed', async () => {
    await expect(
      upgradeCapability('uninstalled-cap', { to: v2Dir, target: tmpTarget })
    ).rejects.toThrow(AppUpgradeError);
  });

  it('fails if --to source is missing', async () => {
    await expect(
      upgradeCapability('crm-bridge', { target: tmpTarget })
    ).rejects.toThrow('Missing target source (--to)');
  });

  it('performs dry-run upgrade without mutating target files', async () => {
    const result = await upgradeCapability('crm-bridge', {
      to: v2Dir,
      target: tmpTarget,
      dryRun: true
    });

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.from_version).toBe('1.0.0');
    expect(result.to_version).toBe('2.0.0');
    expect(result.removed_files).toContain('legacy-helper.mjs');

    // Verify v1 files are still in place
    expect(fs.readFileSync(path.join(tmpTarget, 'bridge.mjs'), 'utf8')).toContain('1.0.0');
    expect(fs.existsSync(path.join(tmpTarget, 'legacy-helper.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(tmpTarget, 'new-feature.mjs'))).toBe(false);
  });

  it('upgrades capability, removes obsolete files, and preserves tenant private data', async () => {
    // Write tenant private data to target vault
    const vaultDir = resolveAppVaultDir(tmpTarget);
    const tenantFile = path.join(vaultDir, 'private-customer-data.md');
    fs.writeFileSync(tenantFile, '# Customer Private Records\nStrictly Confidential\n');

    const result = await upgradeCapability('crm-bridge', {
      to: v2Dir,
      target: tmpTarget
    });

    expect(result.success).toBe(true);
    expect(result.from_version).toBe('1.0.0');
    expect(result.to_version).toBe('2.0.0');
    expect(result.removed_files).toContain('legacy-helper.mjs');

    // 1. Updated file has v2 contents
    const bridgeContent = fs.readFileSync(path.join(tmpTarget, 'bridge.mjs'), 'utf8');
    expect(bridgeContent).toContain('2.0.0');

    // 2. New file exists
    expect(fs.existsSync(path.join(tmpTarget, 'new-feature.mjs'))).toBe(true);

    // 3. Obsolete capability file was removed
    expect(fs.existsSync(path.join(tmpTarget, 'legacy-helper.mjs'))).toBe(false);

    // 4. Tenant private data is intact
    expect(fs.existsSync(tenantFile)).toBe(true);
    expect(fs.readFileSync(tenantFile, 'utf8')).toContain('Strictly Confidential');

    // 5. Capability record was updated in vault
    const record = getInstalledCapabilityRecord(tmpTarget, 'crm-bridge');
    expect(record.version).toBe('2.0.0');
    expect(record.status).toBe('installed');

    // 6. Upgraded event was appended
    const eventFile = path.join(vaultDir, 'system', 'events', 'capability-events.jsonl');
    expect(fs.existsSync(eventFile)).toBe(true);
    const events = fs.readFileSync(eventFile, 'utf8');
    expect(events).toContain('"action":"upgraded"');
  });

  it('rolls back on failure and records truthful upgrade_failed status', async () => {
    // Put a conflicting user file that prevents v2 from applying cleanly
    fs.writeFileSync(path.join(tmpTarget, 'README.md'), 'Conflicting root readme');
    fs.writeFileSync(path.join(v2Dir, 'README.md'), 'V2 readme conflict');

    await expect(
      upgradeCapability('crm-bridge', {
        to: v2Dir,
        target: tmpTarget
      })
    ).rejects.toThrow(AppUpgradeError);

    // 1. Previous v1 files remain intact
    expect(fs.readFileSync(path.join(tmpTarget, 'bridge.mjs'), 'utf8')).toContain('1.0.0');
    expect(fs.existsSync(path.join(tmpTarget, 'legacy-helper.mjs'))).toBe(true);

    // 2. Failure record logged in vault
    const record = getInstalledCapabilityRecord(tmpTarget, 'crm-bridge');
    expect(record.status).toBe('upgrade_failed');
    expect(record.error).toBeDefined();
  });
});
