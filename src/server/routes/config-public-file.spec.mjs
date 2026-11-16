import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dirs = vi.hoisted(() => ({ root: '' }));

vi.mock('../auth.mjs', () => ({
  requireAuth: (req, res, next) => next(),
  requireScope: () => (req, res, next) => next(),
  loadSecurityConfig: () => ({}),
}));
vi.mock('./_shared.mjs', async importOriginal => {
  const actual = await importOriginal();
  const fsm = await import('node:fs');
  const osm = await import('node:os');
  const pathm = await import('node:path');
  dirs.root = fsm.mkdtempSync(pathm.join(osm.tmpdir(), 'tr-config-public-'));
  return { ...actual, BRAIN_DIR: dirs.root, CONFIG_DIR: pathm.join(dirs.root, 'config'),
    serverError: (res, err) => res.status(500).json({ error: err.message }),
    badRequest: (res, msg) => res.status(400).json({ error: msg }) };
});
vi.mock('../../core/runtime.mjs', () => ({ loadRuntimeConfig: vi.fn() }));

import { configRouter } from './config.mjs';

const app = express();
app.use(express.json());
app.use(configRouter);

const PRIVATE = 'PRIVATE-brain-token-canary-3c1';

describe('DESIGN.md public file alias safety', () => {
  let config, privateFile, design;
  beforeAll(() => { config = path.join(dirs.root, 'config'); });
  afterAll(() => fs.rmSync(dirs.root, { recursive: true, force: true }));
  beforeEach(() => {
    fs.rmSync(config, { recursive: true, force: true });
    fs.mkdirSync(config, { recursive: true });
    privateFile = path.join(config, 'brain.json');
    design = path.join(config, 'DESIGN.md');
    fs.writeFileSync(privateFile, PRIVATE, { mode: 0o600 });
  });

  it('serves a plain DESIGN.md', async () => {
    fs.writeFileSync(design, '# Mine');
    const res = await request(app).get('/api/config/DESIGN.md');
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('# Mine');
  });

  it('refuses to read a symlink to a private file and leaks nothing', async () => {
    fs.symlinkSync(privateFile, design);
    const res = await request(app).get('/api/config/DESIGN.md');
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).not.toContain(PRIVATE);
  });

  it('refuses a dangling symlink, a directory and a hard link to a private file', async () => {
    fs.symlinkSync(path.join(config, 'missing'), design);
    expect((await request(app).get('/api/config/DESIGN.md')).status).toBe(409);
    fs.rmSync(design);
    fs.mkdirSync(design);
    expect((await request(app).get('/api/config/DESIGN.md')).status).toBe(409);
    fs.rmdirSync(design);
    fs.linkSync(privateFile, design);
    const res = await request(app).get('/api/config/DESIGN.md');
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).not.toContain(PRIVATE);
  });

  it('refuses to write through a symlink and leaves the private file intact', async () => {
    fs.symlinkSync(privateFile, design);
    const res = await request(app).put('/api/config/DESIGN.md').send({ content: 'overwritten' });
    expect(res.status).toBe(409);
    expect(fs.readFileSync(privateFile, 'utf8')).toBe(PRIVATE);
    expect(fs.lstatSync(design).isSymbolicLink()).toBe(true);
  });

  it('refuses to write onto a hard link and leaves the shared inode intact', async () => {
    fs.linkSync(privateFile, design);
    const res = await request(app).put('/api/config/DESIGN.md').send({ content: 'overwritten' });
    expect(res.status).toBe(409);
    expect(fs.readFileSync(privateFile, 'utf8')).toBe(PRIVATE);
  });

  it('writes through a fresh inode, replaces content and leaves no temporary file', async () => {
    fs.writeFileSync(design, 'old');
    const before = fs.statSync(design).ino;
    const res = await request(app).put('/api/config/DESIGN.md').send({ content: '# New' });
    expect(res.status).toBe(200);
    expect(fs.readFileSync(design, 'utf8')).toBe('# New');
    expect(fs.statSync(design).ino).not.toBe(before);
    expect(fs.statSync(design).mode & 0o777).toBe(0o600);
    expect(fs.readdirSync(config).filter(f => f.endsWith('.tmp'))).toEqual([]);
    expect(fs.readFileSync(privateFile, 'utf8')).toBe(PRIVATE);
  });

  it('creates a missing DESIGN.md', async () => {
    expect((await request(app).put('/api/config/DESIGN.md').send({ content: 'x' })).status).toBe(200);
    expect(fs.readFileSync(design, 'utf8')).toBe('x');
  });
});
