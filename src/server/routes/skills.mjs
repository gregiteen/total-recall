import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { requireAuth, requireScope } from '../auth.mjs';
import { logger } from '../../core/logger.mjs';
import { SKILLS_DIR } from './_shared.mjs';

function serverError(res, err) {
  logger.error('skills', 'Internal server error', { error: err.message, stack: err.stack });
  return res.status(500).json({ error: 'Internal server error' });
}

export const skillsRouter = express.Router();

skillsRouter.get('/api/skills', requireAuth, requireScope('files:read', 'ssss:read'), (req, res) => {
  try {
    if (!fs.existsSync(SKILLS_DIR)) {
      fs.mkdirSync(SKILLS_DIR, { recursive: true });
    }
    const skills = fs.readdirSync(SKILLS_DIR).map(dir => {
      const dirPath = path.join(SKILLS_DIR, dir);
      const stats = fs.statSync(dirPath);
      
      let subSkills = [];
      const subSkillsPath = path.join(dirPath, 'skills');
      if (fs.existsSync(subSkillsPath) && fs.statSync(subSkillsPath).isDirectory()) {
        try {
          subSkills = fs.readdirSync(subSkillsPath).filter(sd => 
            fs.statSync(path.join(subSkillsPath, sd)).isDirectory()
          );
        } catch (e) {}
      }

      return {
        name: dir,
        size: stats.size,
        modified: stats.mtime,
        isDirectory: stats.isDirectory(),
        subSkills
      };
    });
    res.json(skills);
  } catch (err) { serverError(res, err); }
});

skillsRouter.get('/api/skills/search', requireAuth, requireScope('files:read', 'ssss:read'), async (req, res) => {
  try {
    const q = req.query.q || '';
    if (!q) {
      return res.status(400).json({ error: 'Missing search query parameter `q`.' });
    }
    const { searchAndSort } = await import('../../../.agent/skills/total-recall/skills/skill/scripts/find-skills.mjs');
    const results = searchAndSort(q);
    res.json(results);
  } catch (err) { serverError(res, err); }
});

skillsRouter.post('/api/skills/install', requireAuth, requireScope('files:write', 'ssss:write'), async (req, res) => {
  try {
    const { pkg } = req.body;
    if (!pkg) {
      return res.status(400).json({ error: 'Missing required `pkg` body parameter.' });
    }
    const { installSkill } = await import('../../../.agent/skills/total-recall/skills/skill/scripts/install-skill.mjs');
    const result = installSkill(pkg);
    res.json(result);
  } catch (err) { serverError(res, err); }
});

skillsRouter.get('/api/skills/:name', requireAuth, requireScope('files:read', 'ssss:read'), (req, res) => {
  try {
    const { name } = req.params;
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      return res.status(400).json({ error: 'Invalid skill name' });
    }
    const skillPath = path.join(SKILLS_DIR, name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      return res.status(404).json({ error: `Skill "${name}" not found` });
    }
    const content = fs.readFileSync(skillPath, 'utf8');
    res.json({ name, content });
  } catch (err) { serverError(res, err); }
});

skillsRouter.put('/api/skills/:name', requireAuth, requireScope('files:write', 'ssss:write'), (req, res) => {
  try {
    const { name } = req.params;
    const { content } = req.body;
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      return res.status(400).json({ error: 'Invalid skill name' });
    }
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid `content` field.' });
    }
    const skillDir = path.join(SKILLS_DIR, name);
    if (!fs.existsSync(skillDir)) {
      fs.mkdirSync(skillDir, { recursive: true });
    }
    const skillPath = path.join(skillDir, 'SKILL.md');
    fs.writeFileSync(skillPath, content, 'utf8');
    res.json({ success: true, message: `Skill "${name}" updated successfully` });
  } catch (err) { serverError(res, err); }
});

skillsRouter.delete('/api/skills/:name', requireAuth, requireScope('files:write', 'ssss:write'), (req, res) => {
  try {
    const { name } = req.params;
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      return res.status(400).json({ error: 'Invalid skill name' });
    }
    const skillDir = path.join(SKILLS_DIR, name);
    if (!fs.existsSync(skillDir)) {
      return res.status(404).json({ error: `Skill "${name}" not found` });
    }
    fs.rmSync(skillDir, { recursive: true, force: true });
    res.json({ success: true, message: `Skill "${name}" deleted successfully` });
  } catch (err) { serverError(res, err); }
});
