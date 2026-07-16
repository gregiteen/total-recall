import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  mergeEnvManagedBlock,
  buildEnvProjection,
  exportEnvToProject,
  secretMatchesTarget,
  projectSlugFromPath,
} from './secrets-env-export.mjs';
import { setSecret } from './secrets-store.mjs';

vi.mock('./research-queue.mjs', () => ({
  enqueueResearch: vi.fn().mockResolvedValue({ id: 'mock-research-id' }),
  listResearch: vi.fn().mockResolvedValue([]),
  getResearch: vi.fn().mockResolvedValue(null),
  addToQueue: vi.fn().mockResolvedValue({ id: 'mock-queue-id' })
}));

vi.mock('./logger.mjs', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
}));

const BEGIN = '# BEGIN TOTAL-RECALL-SECRETS';
const END = '# END TOTAL-RECALL-SECRETS';

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('mergeEnvManagedBlock', () => {
  it('writes managed block alone when file is empty', () => {
    const managed = `${BEGIN}\nFOO=bar\n${END}\n`;
    expect(mergeEnvManagedBlock('', managed)).toContain('FOO=bar');
    expect(mergeEnvManagedBlock('', managed)).toContain(BEGIN);
  });

  it('preserves non-TR lines outside the managed block', () => {
    const existing = `PORT=3000\nAPP_NAME=demo\nNODE_ENV=development\n`;
    const managed = `${BEGIN}\nOPENAI_API_KEY=sk-new\n${END}\n`;
    const out = mergeEnvManagedBlock(existing, managed);
    expect(out).toContain('PORT=3000');
    expect(out).toContain('APP_NAME=demo');
    expect(out).toContain('OPENAI_API_KEY=sk-new');
    expect(out.indexOf('PORT=3000')).toBeLessThan(out.indexOf(BEGIN));
  });

  it('replaces an existing TR block in place without wiping neighbors', () => {
    const existing = [
      'PORT=3000',
      '',
      BEGIN,
      'OPENAI_API_KEY=sk-old',
      END,
      '',
      'LOCAL_FLAG=1',
      '',
    ].join('\n');
    const managed = `${BEGIN}\nOPENAI_API_KEY=sk-rotated\nSTRIPE_SECRET_KEY=sk_live_x\n${END}\n`;
    const out = mergeEnvManagedBlock(existing, managed);
    expect(out).toContain('PORT=3000');
    expect(out).toContain('LOCAL_FLAG=1');
    expect(out).toContain('OPENAI_API_KEY=sk-rotated');
    expect(out).toContain('STRIPE_SECRET_KEY=sk_live_x');
    expect(out).not.toContain('sk-old');
    expect(out.split(BEGIN).length - 1).toBe(1);
  });
});

describe('secretMatchesTarget / projectSlugFromPath', () => {
  it('matches by repo slug and unbound global', () => {
    expect(projectSlugFromPath('/Users/me/Github/my-app')).toBe('my-app');
    expect(
      secretMatchesTarget(
        { key: 'A', repos: ['my-app'] },
        { projectPath: '/tmp/my-app', projectSlug: 'my-app' },
      ),
    ).toBe(true);
    expect(
      secretMatchesTarget(
        { key: 'B', repos: [], scope: 'global' },
        { projectSlug: 'other', includeGlobal: true },
      ),
    ).toBe(true);
    expect(
      secretMatchesTarget(
        { key: 'C', repos: ['only-this'] },
        { projectSlug: 'other', includeGlobal: true },
      ),
    ).toBe(false);
  });
});

describe('exportEnvToProject', () => {
  let brain;
  let project;
  const prevPass = process.env.TR_SECRETS_PASSWORD;

  beforeEach(() => {
    brain = tmpDir('tr-export-brain-');
    project = tmpDir('tr-export-proj-');
    delete process.env.TR_SECRETS_PASSWORD;
  });

  afterEach(() => {
    fs.rmSync(brain, { recursive: true, force: true });
    fs.rmSync(project, { recursive: true, force: true });
    if (prevPass === undefined) delete process.env.TR_SECRETS_PASSWORD;
    else process.env.TR_SECRETS_PASSWORD = prevPass;
  });

  it('merges secrets into existing .env and writes .env.example + gitignore', async () => {
    fs.writeFileSync(path.join(project, '.env'), 'PORT=9999\nKEEP_ME=yes\n', 'utf8');
    await setSecret(brain, 'OPENAI_API_KEY', 'sk-test-export-value-12345', {
      provider: 'openai',
      scope: 'global',
    });

    const r = await exportEnvToProject(brain, project, { example: true });
    expect(r.count).toBe(1);
    expect(r.merged).toBe(true);
    expect(r.keys).toContain('OPENAI_API_KEY');

    const body = fs.readFileSync(r.envPath, 'utf8');
    expect(body).toContain('PORT=9999');
    expect(body).toContain('KEEP_ME=yes');
    expect(body).toContain('OPENAI_API_KEY=sk-test-export-value-12345');
    expect(body).toContain(BEGIN);
    expect(body).toContain(END);

    expect(fs.existsSync(r.examplePath)).toBe(true);
    const example = fs.readFileSync(r.examplePath, 'utf8');
    expect(example).toContain('OPENAI_API_KEY=');
    expect(example).not.toContain('sk-test-export-value-12345');

    const gi = fs.readFileSync(path.join(project, '.gitignore'), 'utf8');
    expect(gi).toMatch(/^\.env$/m);
  });

  it('dry-run does not write', async () => {
    await setSecret(brain, 'FOO_API_KEY', 'value-long-enough-xx', { scope: 'global' });
    const r = await exportEnvToProject(brain, project, { dryRun: true });
    expect(r.dryRun).toBe(true);
    expect(r.count).toBe(1);
    expect(fs.existsSync(path.join(project, '.env'))).toBe(false);
  });

  it('replaceAll overwrites the whole file', async () => {
    fs.writeFileSync(path.join(project, '.env'), 'PORT=1\nLEGACY=keep?\n', 'utf8');
    await setSecret(brain, 'ONLY_KEY', 'only-value-long-enough', { scope: 'global' });
    await exportEnvToProject(brain, project, { replaceAll: true, example: false });
    const body = fs.readFileSync(path.join(project, '.env'), 'utf8');
    expect(body).toContain('ONLY_KEY=only-value-long-enough');
    expect(body).not.toContain('PORT=1');
    expect(body).not.toContain('LEGACY');
  });

  it('buildEnvProjection never returns META key', async () => {
    await setSecret(brain, 'X_TOKEN', 'token-value-long-enough', { scope: 'global' });
    const p = await buildEnvProjection(brain, { includeGlobal: true });
    expect(p.keys).not.toContain('__tr_secrets_meta');
    expect(p.body).not.toContain('__tr_secrets_meta');
  });
});
