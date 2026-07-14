import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { requireAuth, requireScope } from '../auth.mjs';
import { serverError, ROOT, BRAIN_DIR, VAULT_DIR, SKILLS_DIR, INSTRUCTIONS, TASKS_DIR, badRequest } from './_shared.mjs';
import { logger } from '../../core/logger.mjs';
import matter from 'gray-matter';
import { safeStringify } from '../../core/vault.mjs';

const router = Router();

router.get('/api/tasks', requireAuth, requireScope('tasks:read'), (req, res) => {
  try {
    if (!fs.existsSync(TASKS_DIR)) {
      return res.json([]);
    }
    const tasks = [];
    const files = fs.readdirSync(TASKS_DIR);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      try {
        const raw = fs.readFileSync(path.join(TASKS_DIR, file), 'utf8');
        const { data, content } = matter(raw);
        
        // By default, filter out completed tasks
        if (req.query.status !== 'all' && data.status === 'completed') {
          continue;
        }
        
        tasks.push({ ...data, body: content.trim(), slug: file.replace('.md', '') });
      } catch (e) {
        // skip
      }
    }
    res.json(tasks.sort((a, b) => (a.priority || 5) - (b.priority || 5)));
    
  } catch (err) { serverError(res, err); }
});

router.delete('/api/tasks/cleanup', requireAuth, requireScope('tasks:write'), (req, res) => {
  try {
    if (!fs.existsSync(TASKS_DIR)) {
      return res.json({ deleted: 0 });
    }
    let deleted = 0;
    const files = fs.readdirSync(TASKS_DIR);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const filePath = path.join(TASKS_DIR, file);
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const { data } = matter(raw);
        if (data.status === 'completed') {
          fs.unlinkSync(filePath);
          deleted++;
        }
      } catch (e) {
        // skip
      }
    }
    res.json({ deleted });
    
  } catch (err) { serverError(res, err); }
});

router.post('/api/tasks', requireAuth, requireScope('tasks:write'), (req, res) => {
  try {
    const { category, target, body, priority = 5 } = req.body || {};
    if (!category || !target) {
      return badRequest(res, 'Missing category or target');
    }
    if (!fs.existsSync(TASKS_DIR)) {
      fs.mkdirSync(TASKS_DIR, { recursive: true });
    }
    const slug = `task-${Date.now()}`;
    const frontmatter = {
      type: 'task',
      priority,
      category,
      target,
      estimated_calls: 5,
      deadline: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      created_by: 'api',
      reason: 'User requested deep research via Chat UI',
      status: 'pending',
      progress: 0
    };
    const raw = safeStringify(body || '', frontmatter);
    fs.writeFileSync(path.join(TASKS_DIR, `${slug}.md`), raw, 'utf8');
    res.json({ slug, ...frontmatter });
    
  } catch (err) { serverError(res, err); }
});

export default router;
