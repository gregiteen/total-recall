import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { setSecret, updateSecretMeta, listRotationDue } from './secrets-store.mjs';
import {
  buildBrowserRotatePrompt,
  enqueueRotationDueTasks,
  rotateSecretAndExport,
  getBrowserRotateAssist,
} from './secrets-rotate.mjs';

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('secrets-rotate', () => {
  let brain;
  let project;
  const prevPass = process.env.TR_SECRETS_PASSWORD;

  beforeEach(() => {
    brain = tmpDir('tr-rotate-brain-');
    project = tmpDir('tr-rotate-proj-');
    delete process.env.TR_SECRETS_PASSWORD;
  });

  afterEach(() => {
    fs.rmSync(brain, { recursive: true, force: true });
    fs.rmSync(project, { recursive: true, force: true });
    if (prevPass === undefined) delete process.env.TR_SECRETS_PASSWORD;
    else process.env.TR_SECRETS_PASSWORD = prevPass;
  });

  it('buildBrowserRotatePrompt never embeds a secret value', () => {
    const prompt = buildBrowserRotatePrompt({
      key: 'OPENAI_API_KEY',
      provider: 'openai',
      console_url: 'https://platform.openai.com/api-keys',
      repos: ['demo'],
      next_rotate_due: '2020-01-01T00:00:00.000Z',
    });
    expect(prompt).toContain('OPENAI_API_KEY');
    expect(prompt).toContain('rotate OPENAI_API_KEY');
    expect(prompt).toContain('--export-env');
    expect(prompt).not.toMatch(/sk-/);
  });

  it('lists overdue keys and enqueues assist tasks without values', async () => {
    await setSecret(brain, 'STALE_API_KEY', 'old-secret-value-zzzz', {
      provider: 'openai',
      rotate_every_days: 1,
      auto_rotate: true,
    });
    // Force overdue: set rotated_at far in the past
    await updateSecretMeta(
      brain,
      'STALE_API_KEY',
      {
        rotate_every_days: 1,
        auto_rotate: true,
        rotated_at: '2020-01-01T00:00:00.000Z',
      },
      { actor: 'test' },
    );

    const due = await listRotationDue(brain, { autoOnly: false });
    expect(due.some((d) => d.key === 'STALE_API_KEY')).toBe(true);
    expect(JSON.stringify(due)).not.toContain('old-secret-value-zzzz');

    const queueDir = path.join(brain, 'scheduler', 'queue');
    const r = await enqueueRotationDueTasks(brain, { queueDir });
    expect(r.due).toBeGreaterThanOrEqual(1);
    const created = r.tasks.filter((t) => t.status === 'created');
    expect(created.length).toBeGreaterThanOrEqual(1);
    const taskFile = created[0].path;
    expect(fs.existsSync(taskFile)).toBe(true);
    const text = fs.readFileSync(taskFile, 'utf8');
    expect(text).toContain('STALE_API_KEY');
    expect(text).toContain('--export-env');
    expect(text).not.toContain('old-secret-value-zzzz');

    // second enqueue is idempotent
    const r2 = await enqueueRotationDueTasks(brain, { queueDir });
    expect(r2.tasks.every((t) => t.status === 'exists' || t.status === 'created')).toBe(true);
  });

  it('rotateSecretAndExport updates store and writes .env to bound project path', async () => {
    await setSecret(brain, 'BOUND_KEY', 'first-value-long-enough', {
      scope: 'global',
      project_path: project,
      repos: [path.basename(project)],
    });

    const result = await rotateSecretAndExport(brain, 'BOUND_KEY', 'second-value-long-enough', {
      exportEnv: true,
      exportCwd: false,
      includeGlobal: true,
      actor: 'test',
    });
    expect(result.rotated || result.key === 'BOUND_KEY' || result.exports).toBeTruthy();
    expect(result.exports?.length).toBeGreaterThanOrEqual(1);

    const envPath = path.join(project, '.env');
    expect(fs.existsSync(envPath)).toBe(true);
    const body = fs.readFileSync(envPath, 'utf8');
    expect(body).toContain('BOUND_KEY=second-value-long-enough');
    expect(body).not.toContain('first-value-long-enough');
  });

  it('getBrowserRotateAssist returns prompt for existing key', async () => {
    await setSecret(brain, 'HELP_KEY', 'help-value-long-enough', { provider: 'anthropic' });
    const assist = await getBrowserRotateAssist(brain, 'HELP_KEY');
    expect(assist.key).toBe('HELP_KEY');
    expect(assist.prompt).toContain('HELP_KEY');
  });
});
