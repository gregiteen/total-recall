import express from 'express';
import { getGateStats, getAuditLog } from '../../core/throttled-fetch.mjs';
import { requireAuth } from '../auth.mjs';
import { findVfsDocumentByPath } from '../../core/vfs-documents.mjs';
import { patchVfsDocument } from '../../core/ssss-operation-service.mjs';

const router = express.Router();
const POLICY_PATH = 'system/network-policy.md';
const MUTABLE_POLICY_FIELDS = new Set([
  'status',
  'blocked_domains',
  'allowed_domains',
  'domain_limits',
  'max_global_concurrency',
  'max_per_domain_concurrency',
  'default_timeout_ms',
  'whitelist_mode',
]);

function currentPolicy() {
  return findVfsDocumentByPath(POLICY_PATH);
}

function safePolicyPatch(input) {
  return Object.fromEntries(
    Object.entries(input || {}).filter(([key]) => MUTABLE_POLICY_FIELDS.has(key)),
  );
}

function normalizeDomain(value) {
  const domain = String(value || '').trim().toLowerCase().replace(/^\*\./, '');
  if (!domain || domain.length > 253 || !/^[a-z0-9.-]+$/.test(domain) || domain.includes('..')) {
    throw new Error('Invalid domain');
  }
  const parsed = new URL(`https://${domain}`);
  if (parsed.hostname !== domain) throw new Error('Invalid domain');
  return domain;
}

router.get('/api/network/stats', requireAuth, (req, res) => {
  res.json({
    stats: getGateStats(),
    audit_count: getAuditLog().length
  });
});

router.get('/api/network/policy', requireAuth, async (req, res) => {
  try {
    const policyNode = currentPolicy();
    if (!policyNode) {
      return res.status(404).json({ error: 'Network policy not found' });
    }
    res.json(policyNode.frontmatter);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function applyPatch(patch) {
  const filtered = safePolicyPatch(patch);
  if (Object.keys(filtered).length === 0) throw new Error('No mutable network policy fields supplied');
  return patchVfsDocument(POLICY_PATH, filtered, {
    actorRole: 'admin',
    intent: 'Update network policy from authenticated dashboard',
  });
}

router.put('/api/network/policy', requireAuth, async (req, res) => {
  try {
    const patch = req.body; // should contain updated fields
    const result = await applyPatch(patch);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/api/network/block', requireAuth, async (req, res) => {
  try {
    const domain = normalizeDomain(req.body?.domain);
    
    const policyNode = currentPolicy();
    if (!policyNode) return res.status(404).json({ error: 'Network policy not found' });
    const blocked = policyNode?.frontmatter?.blocked_domains || [];
    
    if (!blocked.includes(domain)) {
      const result = await applyPatch({ blocked_domains: [...blocked, domain] });
      return res.json(result);
    }
    res.json({ status: 'already_blocked' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/api/network/block/:domain', requireAuth, async (req, res) => {
  try {
    const domain = normalizeDomain(req.params.domain);
    
    const policyNode = currentPolicy();
    if (!policyNode) return res.status(404).json({ error: 'Network policy not found' });
    let blocked = policyNode?.frontmatter?.blocked_domains || [];
    
    if (blocked.includes(domain)) {
      blocked = blocked.filter(d => d !== domain);
      const result = await applyPatch({ blocked_domains: blocked });
      return res.json(result);
    }
    res.json({ status: 'not_blocked' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/api/network/audit', requireAuth, (req, res) => {
  try {
    const { domain, status, since } = req.query;
    let logs = getAuditLog();
    
    if (domain) {
      logs = logs.filter(l => l.domain === domain || (l.url && new URL(l.url).hostname === domain));
    }
    if (status) {
      if (status === 'success') logs = logs.filter(l => l.status >= 200 && l.status < 300);
      else if (status === 'error') logs = logs.filter(l => l.status >= 400 || l.error);
      else if (status === 'timeout') logs = logs.filter(l => l.error && l.error.includes('timeout'));
    }
    if (since) {
      const sinceTime = new Date(since).getTime();
      logs = logs.filter(l => new Date(l.timestamp).getTime() >= sinceTime);
    }
    
    res.json({ audit: logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export const networkRouter = router;
