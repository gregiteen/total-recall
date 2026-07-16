import { getMeshHostname, getMeshIp } from './mesh.mjs';

let currentLeaseId = null;

function generateLeaseId() {
  return `${getMeshHostname()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export async function tryAcquireLease() {
  const hostname = getMeshHostname();
  if (!hostname) return false;

  try {
    const { getNodes } = await import('./vault-cache.mjs');
    const { writeNodeValidatedAsync } = await import('./validated-write.mjs');
    const { brainDir } = await import('./config.mjs');
    const path = await import('node:path');
    
    const vaultDir = path.join(brainDir, 'memory-vault');
    const nodes = getNodes(vaultDir);
    const existing = nodes.find(n => n.frontmatter?.type === 'daemon_leader');
    
    if (!existing) return false;
    
    const now = new Date();
    const lastAcquired = existing.lease_acquired ? new Date(existing.lease_acquired) : null;
    const ttlMs = (existing.lease_ttl_seconds || 60) * 1000;
    
    // If lease is unowned or expired, we can acquire it
    if (!lastAcquired || (now.getTime() - lastAcquired.getTime() > ttlMs)) {
      currentLeaseId = generateLeaseId();
      existing.leader_hostname = hostname;
      existing.leader_mesh_ip = getMeshIp();
      existing.lease_acquired = now.toISOString();
      existing.lease_id = currentLeaseId;
      
      const res = await writeNodeValidatedAsync(existing, vaultDir);
      return res.success;
    }
    
    // If we already own it, it's a renewal masquerading as acquire
    if (existing.leader_hostname === hostname && existing.lease_id === currentLeaseId) {
      return true;
    }
    
    return false;
  } catch (err) {
    return false;
  }
}

export async function renewLease() {
  if (!currentLeaseId) return false;
  const hostname = getMeshHostname();
  if (!hostname) return false;

  try {
    const { getNodes } = await import('./vault-cache.mjs');
    const { writeNodeValidatedAsync } = await import('./validated-write.mjs');
    const { brainDir } = await import('./config.mjs');
    const path = await import('node:path');
    
    const vaultDir = path.join(brainDir, 'memory-vault');
    const nodes = getNodes(vaultDir);
    const existing = nodes.find(n => n.frontmatter?.type === 'daemon_leader');
    
    if (existing && existing.leader_hostname === hostname && existing.lease_id === currentLeaseId) {
      existing.lease_acquired = new Date().toISOString();
      const res = await writeNodeValidatedAsync(existing, vaultDir);
      return res.success;
    }
    return false;
  } catch (err) {
    return false;
  }
}

export async function releaseLease() {
  if (!currentLeaseId) return;
  const hostname = getMeshHostname();
  
  try {
    const { getNodes } = await import('./vault-cache.mjs');
    const { writeNodeValidatedAsync } = await import('./validated-write.mjs');
    const { brainDir } = await import('./config.mjs');
    const path = await import('node:path');
    
    const vaultDir = path.join(brainDir, 'memory-vault');
    const nodes = getNodes(vaultDir);
    const existing = nodes.find(n => n.frontmatter?.type === 'daemon_leader');
    
    if (existing && existing.leader_hostname === hostname && existing.lease_id === currentLeaseId) {
      existing.leader_hostname = null;
      existing.leader_mesh_ip = null;
      existing.lease_acquired = null;
      existing.lease_id = null;
      await writeNodeValidatedAsync(existing, vaultDir);
      currentLeaseId = null;
    }
  } catch (err) {
    // silently fail on shutdown
  }
}

export async function isLeader() {
  if (!currentLeaseId) return false;
  const hostname = getMeshHostname();
  
  try {
    const { getNodes } = await import('./vault-cache.mjs');
    const { brainDir } = await import('./config.mjs');
    const path = await import('node:path');
    
    const vaultDir = path.join(brainDir, 'memory-vault');
    const nodes = getNodes(vaultDir);
    const existing = nodes.find(n => n.frontmatter?.type === 'daemon_leader');
    
    if (existing && existing.leader_hostname === hostname && existing.lease_id === currentLeaseId) {
      const now = new Date();
      const lastAcquired = new Date(existing.lease_acquired);
      const ttlMs = (existing.lease_ttl_seconds || 60) * 1000;
      if (now.getTime() - lastAcquired.getTime() <= ttlMs) {
        return true;
      }
    }
    return false;
  } catch (err) {
    return false;
  }
}

export async function getLeaderInfo() {
  try {
    const { getNodes } = await import('./vault-cache.mjs');
    const { brainDir } = await import('./config.mjs');
    const path = await import('node:path');
    
    const vaultDir = path.join(brainDir, 'memory-vault');
    const nodes = getNodes(vaultDir);
    const existing = nodes.find(n => n.frontmatter?.type === 'daemon_leader');
    
    if (existing && existing.leader_hostname) {
      const now = new Date();
      const lastAcquired = new Date(existing.lease_acquired);
      const ttlMs = (existing.lease_ttl_seconds || 60) * 1000;
      if (now.getTime() - lastAcquired.getTime() <= ttlMs) {
        return {
          hostname: existing.leader_hostname,
          ip: existing.leader_mesh_ip,
          lease_id: existing.lease_id
        };
      }
    }
    return null;
  } catch (err) {
    return null;
  }
}
