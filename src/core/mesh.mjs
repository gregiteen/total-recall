import { execSync } from 'node:child_process';
import os from 'node:os';

/**
 * Checks if tailscale is installed and running
 */
export function isMeshAvailable() {
  try {
    execSync('tailscale status', { stdio: 'ignore' });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Gets the current node's mesh IP
 */
export function getMeshIp() {
  if (!isMeshAvailable()) return null;
  try {
    const statusOut = execSync('tailscale status --json', { encoding: 'utf8' });
    const status = JSON.parse(statusOut);
    return status.Self?.TailscaleIPs?.[0] || null;
  } catch (err) {
    return null;
  }
}

/**
 * Gets the current node's MagicDNS hostname
 */
export function getMeshHostname() {
  if (!isMeshAvailable()) return null;
  try {
    const statusOut = execSync('tailscale status --json', { encoding: 'utf8' });
    const status = JSON.parse(statusOut);
    return status.Self?.DNSName?.replace(/\.$/, '') || null;
  } catch (err) {
    return null;
  }
}

/**
 * Gets a list of connected peers
 */
export function getMeshPeers() {
  if (!isMeshAvailable()) return [];
  try {
    const statusOut = execSync('tailscale status --json', { encoding: 'utf8' });
    const status = JSON.parse(statusOut);
    const peers = status.Peer || {};
    return Object.values(peers).map((p) => ({
      hostname: p.DNSName?.replace(/\.$/, ''),
      ip: p.TailscaleIPs?.[0],
      online: p.Online
    }));
  } catch (err) {
    return [];
  }
}

/**
 * Patches the current node's mesh document in the vault
 */
export async function patchOwnMeshNode() {
  const hostname = getMeshHostname();
  if (!hostname) return;
  const ip = getMeshIp();
  const slug = `mesh-node-${hostname.split('.')[0]}`;
  
  try {
    const { getNodes } = await import('./vault-cache.mjs');
    const { writeNodeValidatedAsync } = await import('./validated-write.mjs');
    const { brainDir } = await import('./config.mjs');
    const path = await import('node:path');
    
    const vaultDir = path.join(brainDir, 'memory-vault');
    const nodes = getNodes(vaultDir);
    const existing = nodes.find(n => n.slug === slug);
    
    if (existing) {
      existing.ip = ip;
      existing.status = 'online';
      existing.last_heartbeat = new Date().toISOString();
      await writeNodeValidatedAsync(existing, vaultDir);
    }
  } catch (err) {
    // silently fail if vault isn't ready
  }
}
