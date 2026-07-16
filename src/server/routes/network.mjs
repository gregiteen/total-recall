import express from 'express';
import { getGateStats, getAuditLog } from '../../core/throttled-fetch.mjs';
import { requireAuth } from '../auth.mjs';
import { processOperation } from '../../core/operation-validator.mjs';
import { getNodes } from '../../core/vault-cache.mjs';

const router = express.Router();

router.get('/api/network/stats', requireAuth, (req, res) => {
  res.json({
    stats: getGateStats(),
    audit_count: getAuditLog().length
  });
});

router.get('/api/network/policy', requireAuth, async (req, res) => {
  try {
    const nodes = await getNodes();
    const policyNode = nodes.find(n => n.frontmatter.id === 'network-policy');
    if (!policyNode) {
      return res.status(404).json({ error: 'Network policy not found' });
    }
    res.json(policyNode.frontmatter);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// For mutations, we just call the SSSS API directly since the requirement says "All mutations route through POST /api/v1/ssss internally"
async function applyPatch(patch, req) {
  const { isLeader, getLeaderInfo } = await import('../../core/leader-election.mjs');
  const leaderInfo = await getLeaderInfo();
  
  if (!await isLeader() && leaderInfo?.ip) {
    // Proxy to leader
    const res = await fetch(`http://${leaderInfo.ip}:3100/api/v1/ssss`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers['authorization'] ? { 'Authorization': req.headers['authorization'] } : {})
      },
      body: JSON.stringify({
        op: 'patch',
        target_id: 'network-policy',
        patch
      })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Leader proxy failed with status ${res.status}`);
    }
    return await res.json();
  }

  // Rather than making a loopback HTTP call, we'll construct the mock request objects and use the internal SSSS pipeline
  const { ssssOperationHandler } = await import('./ssss.mjs');
  return new Promise((resolve, reject) => {
    const mockReq = {
      body: {
        op: 'patch',
        target_id: 'network-policy',
        patch
      },
      user: req.user
    };
    const mockRes = {
      json: (data) => resolve(data),
      status: (code) => ({
        json: (data) => reject(new Error(data.error || 'Unknown error'))
      })
    };
    ssssOperationHandler(mockReq, mockRes).catch(reject);
  });
}

router.put('/api/network/policy', requireAuth, async (req, res) => {
  try {
    const patch = req.body; // should contain updated fields
    const result = await applyPatch(patch, req);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/api/network/block', requireAuth, async (req, res) => {
  try {
    const { domain } = req.body;
    if (!domain) return res.status(400).json({ error: 'domain is required' });
    
    // Read current to append
    const nodes = await getNodes();
    const policyNode = nodes.find(n => n.frontmatter.id === 'network-policy');
    const blocked = policyNode?.frontmatter?.blocked_domains || [];
    
    if (!blocked.includes(domain)) {
      blocked.push(domain);
      const result = await applyPatch({ blocked_domains: blocked }, req);
      return res.json(result);
    }
    res.json({ status: 'already_blocked' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/api/network/block/:domain', requireAuth, async (req, res) => {
  try {
    const { domain } = req.params;
    
    const nodes = await getNodes();
    const policyNode = nodes.find(n => n.frontmatter.id === 'network-policy');
    let blocked = policyNode?.frontmatter?.blocked_domains || [];
    
    if (blocked.includes(domain)) {
      blocked = blocked.filter(d => d !== domain);
      const result = await applyPatch({ blocked_domains: blocked }, req);
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
