import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { docsRouter } from './docs.mjs';

// Mock dependencies
vi.mock('../auth.mjs', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'test' }; next(); },
  requireScope: () => (req, res, next) => next()
}));

vi.mock('../../core/vault-cache.mjs', () => ({
  getNodes: vi.fn(),
  invalidate: vi.fn()
}));

vi.mock('../../core/operation-validator.mjs', () => ({
  processOperation: vi.fn()
}));

vi.mock('./_shared.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    resolveVaultFromQuery: vi.fn()
  };
});

import { getNodes } from '../../core/vault-cache.mjs';
import { processOperation } from '../../core/operation-validator.mjs';
import { resolveVaultFromQuery } from './_shared.mjs';

const app = express();
app.use(express.json());
app.use(docsRouter);

describe('Docs Router', () => {
  const mockVaultDir = '/mock/vault';
  
  let actualFs;
  beforeEach(async () => {
    actualFs = await vi.importActual('node:fs');
    vi.clearAllMocks();
    resolveVaultFromQuery.mockReturnValue(mockVaultDir);
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (p === mockVaultDir) return true;
      if (p === path.join(mockVaultDir, 'existing.md')) return true;
      if (typeof p === 'string' && p.includes('saved-views.json')) return false;
      return actualFs.existsSync(p);
    });
    vi.spyOn(fs, 'readFileSync').mockImplementation((p, ...args) => {
      if (p === path.join(mockVaultDir, 'existing.md')) return '---\ntitle: Existing\n---\nHello';
      if (typeof p === 'string' && p.includes(mockVaultDir)) throw new Error('Not found');
      return actualFs.readFileSync(p, ...args);
    });
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {});
    vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
  });

  it('GET /api/docs - lists nodes with filters', async () => {
    getNodes.mockReturnValue([
      { _filePath: path.join(mockVaultDir, 'a.md'), type: 'memory', status: 'active', tags: ['t1'], title: 'Doc A', updated: '2023-01-01' },
      { _filePath: path.join(mockVaultDir, 'b.md'), type: 'rule', status: 'archived', title: 'Rule B', updated: '2023-01-02' }
    ]);

    const res = await request(app).get('/api/docs?type=rule');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.docs[0].name).toBe('Rule B');
    expect(res.body.docs[0].portability).toBe('structural');
  });

  it('GET /api/docs/read - returns file content', async () => {
    const res = await request(app).get('/api/docs/read?path=existing.md');
    expect(res.status).toBe(200);
    expect(res.body.frontmatter.title).toBe('Existing');
    expect(res.body.body).toBe('Hello'); // gray-matter trims the newline
  });
  
  it('GET /api/docs/read - rejects absolute paths', async () => {
    const res = await request(app).get('/api/docs/read?path=/etc/passwd');
    expect(res.status).toBe(400);
  });

  it('POST /api/docs - creates document', async () => {
    processOperation.mockReturnValue({ success: true });
    const res = await request(app)
      .post('/api/docs')
      .send({ path: 'new.md', content: 'hello' });
    
    if (res.status !== 200) console.log(res.body, res.error);
    expect(res.status).toBe(200);
    expect(processOperation).toHaveBeenCalled();
  });

  it('PUT /api/docs - updates document', async () => {
    processOperation.mockReturnValue({ success: true });
    const res = await request(app)
      .put('/api/docs')
      .send({ path: 'existing.md', content: 'hello' });
    
    expect(res.status).toBe(200);
    expect(processOperation).toHaveBeenCalled();
  });
  
  it('PUT /api/docs - 404 if not found', async () => {
    const res = await request(app)
      .put('/api/docs')
      .send({ path: 'missing.md', content: 'hello' });
    
    expect(res.status).toBe(404);
  });

  it('DELETE /api/docs - deletes document', async () => {
    processOperation.mockReturnValue({ success: true });
    const res = await request(app).delete('/api/docs?path=existing.md');
    expect(res.status).toBe(200);
    expect(processOperation).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'delete', path: 'existing.md' }),
      mockVaultDir,
      expect.any(Object)
    );
  });
});
