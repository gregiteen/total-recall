/**
 * SSSS Routes
 * Extracted from rest.mjs
 */
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { requireAuth, requireScope } from '../auth.mjs';
import {
  ROOT,
  INSTRUCTIONS,
  SKILLS_DIR
} from './_shared.mjs';

const router = Router();

// ─── SSSS Resources (sync and integration consumers) ─────────────────────────

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function readTextResource(filePath, name) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const stat = fs.statSync(filePath);
  return {
    name,
    content,
    sha256: sha256(content),
    bytes: stat.size,
    modified: stat.mtime.toISOString()
  };
}

function sendTextResource(res, filePath, name) {
  const resource = readTextResource(filePath, name);
  if (!resource) {
    return res.status(404).json({ error: `${name} is not available` });
  }
  return res.json(resource);
}

function baseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function absoluteUrl(req, routePath) {
  return new URL(routePath, baseUrl(req)).toString();
}

function ssssReferenceDir() {
  // Prefer compact TR references; fall back to legacy nested module paths.
  const candidates = [
    path.join(SKILLS_DIR, 'total-recall', 'references'),
    path.join(SKILLS_DIR, 'total-recall', 'modules', 'ssss', 'references'),
    path.join(SKILLS_DIR, 'okf', 'references'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

function ssssSkillDocPath() {
  const candidates = [
    path.join(SKILLS_DIR, 'total-recall', 'references', 'ssss-reference.md'),
    path.join(SKILLS_DIR, 'total-recall', 'SKILL.md'),
    path.join(SKILLS_DIR, 'total-recall', 'modules', 'ssss', 'MODULE.md'),
    path.join(SKILLS_DIR, 'okf', 'SKILL.md'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

function listSsssReferences(req) {
  const refsDir = ssssReferenceDir();
  if (!fs.existsSync(refsDir)) return [];
  return fs.readdirSync(refsDir)
    .filter(file => file.endsWith('.md'))
    .sort()
    .map((file) => {
      const name = file.replace(/\.md$/, '');
      const resource = readTextResource(path.join(refsDir, file), name);
      return {
        name,
        url: absoluteUrl(req, `/api/ssss/references/${name}`),
        sha256: resource?.sha256 || null,
        bytes: resource?.bytes || 0,
        modified: resource?.modified || null
      };
    });
}

function safeReferencePath(name) {
  if (!/^[a-zA-Z0-9_-]+$/.test(String(name || ''))) return null;
  return path.join(ssssReferenceDir(), `${name}.md`);
}

router.get('/api/ssss', requireAuth, requireScope('ssss:read'), (req, res) => {
  const resources = {
    instructions: {
      name: 'instructions',
      url: absoluteUrl(req, '/api/ssss/instructions'),
      ...(() => {
        const r = readTextResource(INSTRUCTIONS, 'instructions');
        return r ? { sha256: r.sha256, bytes: r.bytes, modified: r.modified } : { sha256: null, bytes: 0, modified: null };
      })()
    },
    skill: {
      name: 'ssss-skill',
      url: absoluteUrl(req, '/api/ssss/skill/ssss'),
      ...(() => {
        const r = readTextResource(ssssSkillDocPath(), 'ssss-skill');
        return r ? { sha256: r.sha256, bytes: r.bytes, modified: r.modified } : { sha256: null, bytes: 0, modified: null };
      })()
    },
    spec: {
      name: 'ssss-spec',
      url: absoluteUrl(req, '/api/ssss/spec'),
      ...(() => {
        const refs = ssssReferenceDir();
        const specPath = ['ssss-reference.md', 'ssss-spec.md']
          .map((n) => path.join(refs, n))
          .find((p) => fs.existsSync(p));
        const r = specPath ? readTextResource(specPath, 'ssss-spec') : null;
        return r ? { sha256: r.sha256, bytes: r.bytes, modified: r.modified } : { sha256: null, bytes: 0, modified: null };
      })()
    },
    references: listSsssReferences(req)
  };

  res.json({
    name: 'ssss',
    schema_version: 2,
    resources
  });
});

router.get('/api/ssss/instructions', requireAuth, requireScope('ssss:read', 'instructions:read'), (req, res) => {
  const surface = req.query.surface;
  if (surface) {
    if (surface === 'INSTRUCTIONS.md') {
      return sendTextResource(res, path.join(ROOT, 'INSTRUCTIONS.md'), 'instructions');
    }
    const safeSurface = path.basename(surface);
    const surfacePath = path.join(ROOT, safeSurface);
    return sendTextResource(res, surfacePath, safeSurface);
  }
  return sendTextResource(res, path.join(ROOT, 'INSTRUCTIONS.md'), 'instructions');
});

router.get('/api/ssss/skill/ssss', requireAuth, requireScope('ssss:read'), (_req, res) => {
  return sendTextResource(res, ssssSkillDocPath(), 'ssss-skill');
});

router.get('/api/ssss/spec', requireAuth, requireScope('ssss:read'), (_req, res) => {
  const refs = ssssReferenceDir();
  const specPath = ['ssss-reference.md', 'ssss-spec.md']
    .map((n) => path.join(refs, n))
    .find((p) => fs.existsSync(p));
  return sendTextResource(res, specPath || path.join(refs, 'ssss-reference.md'), 'ssss-spec');
});

router.get('/api/ssss/references', requireAuth, requireScope('ssss:read'), (req, res) => {
  res.json({ references: listSsssReferences(req) });
});

router.get('/api/ssss/references/:name', requireAuth, requireScope('ssss:read'), (req, res) => {
  const filePath = safeReferencePath(req.params.name);
  if (!filePath) return res.status(400).json({ error: 'Invalid reference name' });
  return sendTextResource(res, filePath, req.params.name);
});


// TODO: Implement actual SSSS operation handler or route to operation-validator.mjs
export const ssssOperationHandler = async (req, res) => {
  return res.status(501).json({ error: 'Not implemented' });
};

export { router as ssssRouter };
export default router;
